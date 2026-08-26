import { describe, expect, it } from 'vitest';
import { MctsSearch } from '../src/engine/katago/analyzeMcts';
import { setBoardSize } from '../src/engine/katago/fastBoard';
import { hasModel, loadHarnessModel } from './helpers/engineHarness';
import type { BoardState, Move } from '../src/types';

// ---------------------------------------------------------------------------
// The root policy on a 19x19 board, against numbers KataGo printed.
//
// From the "TEST EXACT (NO MASKING) VS MASKED" case of
// cpp/tests/results/runSearchTestsV8.txt, whose header names the net this app
// bundles: b6c96-s175395328-d26788732, model version 8. The P column of that dump
// is the root policy after rootPolicyTemperature, which SearchParams::forTestsV1
// sets to 1.1 late and 1.2 early.
//
// Until now the only check on the network itself was the 5x5 tiny-board golden.
// This one covers the size the app actually runs at.
// ---------------------------------------------------------------------------

const SGF =
  '(;GM[1]FF[4]CA[UTF-8]RU[Japanese]SZ[19]KM[6.5];B[dd];W[qd];B[pq];W[dp];B[oc];W[pe];B[fq];W[jp];B[ph];W[cf];B[ck])';

// Move and policy percentage, in the order KataGo listed them.
const RECORDED_PRIORS: ReadonlyArray<readonly [string, number]> = [
  ['Q4', 8.67], ['C11', 11.17], ['R5', 9.24], ['C7', 9.95], ['Q17', 5.89], ['C6', 5.65],
  ['O16', 5.56], ['D7', 4.87], ['M17', 1.98], ['F17', 2.49], ['N16', 2.14], ['Q5', 1.93],
  ['R4', 2.07], ['D6', 1.95], ['E3', 1.78], ['C17', 1.85], ['N17', 1.56], ['Q10', 1.25],
];

// This case lives in runV8TestsRandomSym, whose evaluator was built with
// defaultSymmetry -1: it drew a RANDOM symmetry per evaluation from a fixed seed.
// So there is no single symmetry to match -- each node got its own, and only the
// root's is recoverable, by trying all eight and seeing which reproduces the
// recorded policy. It is ours numbered 7. Regressing the recorded policy against
// ours in log space picks it out unambiguously: r-squared 0.9996 against 0.93 or
// worse for every other symmetry.
const ROOT_SYMMETRY_THE_RECORDED_RUN_DREW = 7;
/** The draw that node happened to get, found the same way. */
const LEAF_SYMMETRY_THE_RECORDED_RUN_DREW = 3;

const gtpToXy = (label: string): [number, number] => {
  const columns = 'ABCDEFGHJKLMNOPQRST';
  return [columns.indexOf(label[0]!), 19 - Number.parseInt(label.slice(1), 10)];
};

const parseSgfMoves = (sgf: string): Move[] => {
  const moves: Move[] = [];
  const re = /;([BW])\[([a-s])([a-s])\]/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(sgf))) {
    moves.push({
      x: match[2]!.charCodeAt(0) - 97,
      y: match[3]!.charCodeAt(0) - 97,
      player: match[1] === 'B' ? 'black' : 'white',
    });
  }
  return moves;
};

describe.skipIf(!hasModel())("KataGo's recorded root policy at 19x19", () => {
  it('agrees on every move it listed', async () => {
    setBoardSize(19);
    const model = await loadHarnessModel();
    const moves = parseSgfMoves(SGF);
    expect(moves.length).toBe(11);
    const board: BoardState = Array.from({ length: 19 }, () => Array.from({ length: 19 }, () => null));
    for (const move of moves) board[move.y]![move.x] = move.player;

    const search = await MctsSearch.create({
      model,
      board,
      currentPlayer: 'white',
      moveHistory: moves,
      komi: 6.5,
      rules: 'japanese',
      nnRandomize: false,
      conservativePass: true,
      maxChildren: 40,
      ownershipMode: 'root',
      wideRootNoise: 0,
      // forTestsV1 leaves symmetry pruning off and keeps pre-root history.
      rootSymmetryPruning: false,
      ignorePreRootHistory: false,
      rootSymmetry: ROOT_SYMMETRY_THE_RECORDED_RUN_DREW,
    });
    const policy = search.getAnalysis({ topK: 1, analysisPvLen: 0 }).policy;

    // KataGo prints the policy after the root temperature, interpolated from 1.2 on
    // move 0 toward 1.1 with a halflife of 19 moves. This is turn 11 on 19x19.
    const halflives = (11 / 19) * (19 / 19);
    const temperature = 1.1 + (1.2 - 1.1) * Math.pow(0.5, halflives);

    let maxPolicy = 0;
    for (let i = 0; i <= 361; i++) if (policy[i]! > maxPolicy) maxPolicy = policy[i]!;
    const logMax = Math.log(maxPolicy);
    const tempered = new Float64Array(362);
    let sum = 0;
    for (let i = 0; i <= 361; i++) {
      const p = policy[i]!;
      if (!(p > 0)) continue;
      tempered[i] = Math.exp((Math.log(p) - logMax) / temperature);
      sum += tempered[i]!;
    }
    expect(sum).toBeGreaterThan(0);

    for (const [label, recorded] of RECORDED_PRIORS) {
      const [x, y] = gtpToXy(label);
      const ours = (tempered[y * 19 + x]! / sum) * 100;
      // KataGo printed two decimals of a percent, and the two backends do not agree
      // to the last bit, so a quarter of a percentage point is the honest bar.
      expect(`${label} ${Math.abs(ours - recorded) < 0.25}`).toBe(`${label} true`);
    }
  }, 120000);

  // The one child of that root KataGo searched exactly once. With a single visit a
  // node's reported value IS its own network output, so this pins the value head at
  // 19x19 -- until now only the 5x5 tiny board golden covered it, and only for the
  // policy at that. This node drew a different symmetry from the root, which is what
  // gave the randomisation away: sweeping all eight, only one reproduces all three
  // numbers, and it is not the root's.
  it('agrees on the value of a leaf it visited once', async () => {
    setBoardSize(19);
    const model = await loadHarnessModel();
    const moves = parseSgfMoves(SGF);
    // Q10, the move KataGo's search spent a single visit on.
    const [qx, qy] = gtpToXy('Q10');
    moves.push({ x: qx, y: qy, player: 'white' });
    const board: BoardState = Array.from({ length: 19 }, () => Array.from({ length: 19 }, () => null));
    for (const move of moves) board[move.y]![move.x] = move.player;

    const search = await MctsSearch.create({
      model,
      board,
      currentPlayer: 'black',
      moveHistory: moves,
      komi: 6.5,
      rules: 'japanese',
      nnRandomize: false,
      // A node inside the search is not the root, so conservative passing is off.
      conservativePass: false,
      maxChildren: 10,
      ownershipMode: 'root',
      wideRootNoise: 0,
      rootSymmetryPruning: false,
      ignorePreRootHistory: false,
      rootSymmetry: LEAF_SYMMETRY_THE_RECORDED_RUN_DREW,
    });
    const analysis = search.getAnalysis({ topK: 1, analysisPvLen: 0 });

    // KataGo printed W -4.79c, scoreMean -1.5 and lead -1.1, from white's point of
    // view; ours are black's. Its numbers carry two decimals at most.
    expect(-(2 * analysis.rawWinRate - 1) * 100).toBeCloseTo(-4.79, 1);
    expect(-analysis.rawScoreSelfplay).toBeCloseTo(-1.5, 1);
    expect(-analysis.rawScoreLead).toBeCloseTo(-1.1, 1);
  }, 120000);
});
