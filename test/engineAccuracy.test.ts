import { describe, expect, it } from 'vitest';
import { boardFromDiagram, emptyBoard, loadHarnessModel, ownershipSum, rawEval, runsEngineSuites, swapColors, transformBoard, transformOwnership } from './helpers/engineHarness';
import { MctsSearch } from '../src/engine/katago/analyzeMcts';
import { BOARD_AREA, setBoardSize } from '../src/engine/katago/fastBoard';
import { applyCapturesInPlace, getOpponent } from '../src/utils/gameLogic';
import type { BoardState, GameRules, Player } from '../src/types';

// ---------------------------------------------------------------------------
// Does the engine judge positions correctly?
//
// engineGolden.test.ts pins the raw network against KataGo's own recorded output.
// This file checks the properties that a correct evaluation must satisfy no matter
// what the network says -- sign conventions, komi handling, agreement between the
// score head and the ownership head, and that the search reports its per-move
// numbers in the same frame of reference as the root.
//
// A failure here means the engine is telling the user something untrue about the
// position, which is worse than being weak.
// ---------------------------------------------------------------------------

const MID9 = `
  .........
  ..X.O....
  ...X.O...
  .X..O....
  ....X.O..
  ..O.X....
  ...O.X...
  .........
  .........
`;

const OPENING19 = `
  ...................
  ...................
  ...X.........O.....
  ..............X....
  ...................
  ...................
  ...................
  ...................
  ...................
  ...................
  ...................
  ...................
  ...................
  ...................
  ...................
  ...O.........X.....
  ...................
  ...................
  ...................
`;

function playMoveOnBoard(board: BoardState, x: number, y: number, player: Player): BoardState {
  const next = board.map((row) => [...row]);
  next[y]![x] = player;
  applyCapturesInPlace(next, x, y, player);
  return next;
}

async function analyze(args: { board: BoardState; player: Player; komi: number; visits: number }) {
  const model = await loadHarnessModel();
  setBoardSize(args.board.length);
  const s = await MctsSearch.create({
    model,
    board: args.board,
    currentPlayer: args.player,
    moveHistory: [],
    komi: args.komi,
    rules: 'japanese',
    nnRandomize: true,
    conservativePass: true,
    maxChildren: 32,
    ownershipMode: 'root',
    wideRootNoise: 0.04,
  });
  await s.run({ visits: args.visits, maxTimeMs: 120000, batchSize: 4 });
  return s.getAnalysis({ topK: 6, analysisPvLen: 4 });
}

describe.skipIf(!runsEngineSuites())('engine state estimation', () => {
  it('is exactly antisymmetric under swapping both colours', async () => {
    // Swapping every stone, swapping who is to move and negating komi produces a
    // bit-identical input tensor, because the net only ever sees "me" and "them".
    // So any difference beyond floating point is a sign-convention bug in our
    // black-perspective conversion, not a property of the network.
    const cases: Array<{ name: string; board: BoardState; player: Player; komi: number; rules: GameRules }> = [
      { name: 'empty 19x19 chinese', board: emptyBoard(19), player: 'black', komi: 7.5, rules: 'chinese' },
      { name: 'opening 19x19 japanese', board: boardFromDiagram(OPENING19), player: 'white', komi: 6.5, rules: 'japanese' },
      { name: 'midgame 9x9 japanese', board: boardFromDiagram(MID9), player: 'black', komi: 6.5, rules: 'japanese' },
      { name: 'midgame 9x9 chinese', board: boardFromDiagram(MID9), player: 'white', komi: 7.5, rules: 'chinese' },
    ];

    for (const c of cases) {
      const a = await rawEval({ board: c.board, currentPlayer: c.player, komi: c.komi, rules: c.rules });
      const b = await rawEval({
        board: swapColors(c.board),
        currentPlayer: getOpponent(c.player),
        komi: -c.komi,
        rules: c.rules,
      });

      expect(a.blackWinProb, `${c.name}: win probability`).toBeCloseTo(1 - b.blackWinProb - b.blackNoResultProb, 5);
      expect(a.blackScoreLead, `${c.name}: score lead`).toBeCloseTo(-b.blackScoreLead, 4);
      expect(a.blackScoreMean, `${c.name}: score mean`).toBeCloseTo(-b.blackScoreMean, 4);
      expect(a.blackScoreStdev, `${c.name}: score stdev`).toBeCloseTo(b.blackScoreStdev, 4);
      for (let i = 0; i < a.ownership.length; i++) {
        expect(Math.abs(a.ownership[i]! + b.ownership[i]!), `${c.name}: ownership at ${i}`).toBeLessThan(1e-5);
      }
    }
  }, 300000);

  it('moves the score and win rate the right way as komi changes', async () => {
    const board = boardFromDiagram(MID9);
    for (const rules of ['japanese', 'chinese'] as GameRules[]) {
      const komis = [-6.5, 0.5, 6.5, 14.5];
      const evals = [];
      for (const komi of komis) {
        evals.push({ komi, ...(await rawEval({ board, currentPlayer: 'black', komi, rules })) });
      }

      for (let i = 1; i < evals.length; i++) {
        const prev = evals[i - 1]!;
        const cur = evals[i]!;
        const dKomi = cur.komi - prev.komi;

        // Komi is white's bonus, so raising it must hurt black on both metrics.
        expect(cur.blackScoreLead, `${rules}: lead must fall as komi rises`).toBeLessThan(prev.blackScoreLead);
        expect(cur.blackWinProb, `${rules}: win rate must fall as komi rises`).toBeLessThan(prev.blackWinProb);

        // The lead already includes komi, so a point of komi is worth about a point
        // of lead. Play shifts too, so this is a band rather than an equality.
        const slope = (cur.blackScoreLead - prev.blackScoreLead) / dKomi;
        expect(slope, `${rules}: d(lead)/d(komi) from komi ${prev.komi} to ${cur.komi}`).toBeGreaterThan(-1.6);
        expect(slope, `${rules}: d(lead)/d(komi) from komi ${prev.komi} to ${cur.komi}`).toBeLessThan(-0.5);
      }
    }
  }, 300000);

  it('keeps the ownership map consistent with the score it reports', async () => {
    // Under area scoring the ownership map sums to black's area minus white's, and the
    // score is that difference minus komi. The two heads are trained separately, so they
    // only agree approximately -- but a broken sign, a dropped komi or a transposed board
    // would blow this apart.
    const positions: Array<{ name: string; board: BoardState; player: Player }> = [
      { name: 'empty 19x19', board: emptyBoard(19), player: 'black' },
      { name: 'opening 19x19', board: boardFromDiagram(OPENING19), player: 'white' },
      { name: 'midgame 9x9', board: boardFromDiagram(MID9), player: 'black' },
    ];

    for (const p of positions) {
      for (const komi of [0.5, 7.5]) {
        const e = await rawEval({ board: p.board, currentPlayer: p.player, komi, rules: 'chinese' });
        const impliedKomi = ownershipSum(e.ownership) - e.blackScoreMean;
        expect(Math.abs(impliedKomi - komi), `${p.name} komi ${komi}: ownership sum minus score should recover komi`).toBeLessThan(4);
      }
    }
  }, 300000);

  it('does not depend on how the board happens to be rotated', async () => {
    // The net is only approximately symmetry-equivariant, so this is a bound on noise
    // rather than an equality. It is here to catch an indexing bug in the input planes
    // or the ownership readout, which would show up as a spread far beyond net noise.
    const board = boardFromDiagram(MID9);
    const base = await rawEval({ board, currentPlayer: 'black', komi: 6.5, rules: 'japanese' });

    const wins: number[] = [];
    const leads: number[] = [];
    let maxOwnershipDiff = 0;
    for (let sym = 0; sym < 8; sym++) {
      const e = await rawEval({ board: transformBoard(board, sym), currentPlayer: 'black', komi: 6.5, rules: 'japanese' });
      wins.push(e.blackWinProb);
      leads.push(e.blackScoreLead);
      const expected = transformOwnership(base.ownership, board.length, sym);
      for (let i = 0; i < expected.length; i++) {
        maxOwnershipDiff = Math.max(maxOwnershipDiff, Math.abs(expected[i]! - e.ownership[i]!));
      }
    }

    expect(Math.max(...wins) - Math.min(...wins), 'win rate spread across rotations').toBeLessThan(0.25);
    expect(Math.max(...leads) - Math.min(...leads), 'score lead spread across rotations').toBeLessThan(6);
    expect(maxOwnershipDiff, 'ownership spread across rotations').toBeLessThan(0.6);
  }, 300000);

  it('reports the same position the same way twice', async () => {
    // The root evaluation must not be randomised: the same position analysed twice has
    // to produce the same territory estimate, or the ownership overlay flickers and the
    // user cannot tell a real change from noise.
    const board = boardFromDiagram(MID9);
    const runs = [];
    for (let i = 0; i < 3; i++) runs.push(await analyze({ board, player: 'black', komi: 6.5, visits: 64 }));

    for (let i = 1; i < runs.length; i++) {
      for (let p = 0; p < BOARD_AREA; p++) {
        expect(Math.abs(runs[i]!.ownership[p]! - runs[0]!.ownership[p]!), `ownership at ${p} on run ${i}`).toBeLessThan(1e-6);
      }
      for (let p = 0; p < BOARD_AREA + 1; p++) {
        expect(Math.abs(runs[i]!.policy[p]! - runs[0]!.policy[p]!), `policy at ${p} on run ${i}`).toBeLessThan(1e-6);
      }
    }
  }, 600000);

  it('reports per-move numbers in the same frame as the root', async () => {
    for (const player of ['black', 'white'] as Player[]) {
      const board = boardFromDiagram(MID9);
      const komi = 6.5;
      const a = await analyze({ board, player, komi, visits: 128 });
      expect(a.moves.length, `${player}: search produced candidate moves`).toBeGreaterThan(1);

      for (const m of a.moves.slice(0, 4)) {
        const child = await rawEval({
          board: playMoveOnBoard(board, m.x, m.y, player),
          previousBoard: board,
          currentPlayer: getOpponent(player),
          moveHistory: [{ x: m.x, y: m.y, player }],
          komi,
          rules: 'japanese',
        });

        // Both are black-perspective. Search refines the raw net, so allow a real gap,
        // but a perspective flip would put these on opposite sides of even.
        expect(Math.abs(m.scoreLead - child.blackScoreLead), `${player} ${m.x},${m.y}: lead frame`).toBeLessThan(10);
        expect(Math.abs(m.winRate - child.blackWinProb), `${player} ${m.x},${m.y}: win rate frame`).toBeLessThan(0.25);
      }

      // Points lost is measured from the mover's point of view, so the sign has to flip
      // with colour: a move that leaves white with a lower black-perspective lead is a
      // better move for white, and must not be reported as a loss.
      //
      // The relative figure is measured against the most-visited move, which is not
      // always the one with the best score lead, so it is legitimately negative
      // sometimes. Only its frame of reference is pinned here.
      const sign = player === 'black' ? 1 : -1;
      const best = a.moves[0]!;
      for (const m of a.moves) {
        expect(m.pointsLost, `${player} ${m.x},${m.y}: points lost`).toBeCloseTo(sign * (a.rootScoreLead - m.scoreLead), 6);
        expect(m.relativePointsLost, `${player} ${m.x},${m.y}: relative points lost`).toBeCloseTo(
          sign * (best.scoreLead - m.scoreLead),
          6
        );
      }
      expect(best.relativePointsLost, `${player}: top move loses nothing relative to itself`).toBeCloseTo(0, 6);

      // A move that is worse for the mover must cost the mover more points.
      const byMoverLead = [...a.moves].sort((p, q) => sign * q.scoreLead - sign * p.scoreLead);
      for (let i = 1; i < byMoverLead.length; i++) {
        expect(byMoverLead[i]!.pointsLost, `${player}: points lost must rise as the mover's lead falls`).toBeGreaterThanOrEqual(
          byMoverLead[i - 1]!.pointsLost - 1e-6
        );
      }
    }
  }, 900000);
});
