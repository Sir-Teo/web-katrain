import { describe, expect, it } from 'vitest';
import { boardFromDiagram, hasModel, loadHarnessModel } from './helpers/engineHarness';
import {
  MctsSearch,
  computeEndingScoreBonuses,
  computePlaySelectionValuesForTest,
} from '../src/engine/katago/analyzeMcts';
import { BOARD_AREA, BOARD_SIZE, PASS_MOVE, setBoardSize } from '../src/engine/katago/fastBoard';
import { computeLibertyMap } from '../src/engine/katago/fastBoard';

// ---------------------------------------------------------------------------
// rootEndingBonusPoints and rootPruneUselessMoves.
//
// KataGo turns both on by default (0.5 points, and pruning after four opponent
// passes). They are what stops an engine from playing dead moves inside settled
// territory, or passing while dame are still open under territory scoring.
// Bonuses are stored from white's perspective, so a positive value is a penalty
// for black.
// ---------------------------------------------------------------------------

const stonesFrom = (diagram: string): Uint8Array => {
  const rows = diagram.trim().split('\n').map((r) => r.trim());
  const stones = new Uint8Array(BOARD_AREA);
  rows.forEach((row, y) => {
    row.split('').forEach((c, x) => {
      if (c === 'X') stones[y * BOARD_SIZE + x] = 1;
      else if (c === 'O') stones[y * BOARD_SIZE + x] = 2;
    });
  });
  return stones;
};

// A wall down the middle: black owns the left, white owns the right.
const SPLIT9 = `
  XXX.OOOOO
  X.X.OO.OO
  XXX.OOOOO
  XXX.OOOOO
  XXX.OOOOO
  XXX.OOOOO
  XXX.OOOOO
  XXX.OOOOO
  XXX.OOOOO
`;

const ownershipFor = (): Float32Array => {
  const own = new Float32Array(BOARD_AREA);
  for (let y = 0; y < BOARD_SIZE; y++) {
    for (let x = 0; x < BOARD_SIZE; x++) {
      const p = y * BOARD_SIZE + x;
      if (x < 3) own[p] = 1; // settled for black
      else if (x === 3) own[p] = 0; // the open column between them
      else own[p] = -1; // settled for white
    }
  }
  return own;
};

describe('root ending score bonus', () => {
  it('discourages passing under territory scoring', () => {
    setBoardSize(9);
    const stones = stonesFrom(SPLIT9);
    const bonuses = computeEndingScoreBonuses({
      stones,
      libertyMap: computeLibertyMap(stones),
      koPoint: -1,
      ownership: ownershipFor(),
      currentPlayer: 'black',
      rules: 'japanese',
    })!;
    expect(bonuses).not.toBeNull();
    // Two thirds of a point against black for passing, expressed for white.
    expect(bonuses[PASS_MOVE]).toBeCloseTo(0.5 * (2 / 3), 12);
  });

  it('leaves passing alone under area scoring without a button', () => {
    setBoardSize(9);
    const stones = stonesFrom(SPLIT9);
    const bonuses = computeEndingScoreBonuses({
      stones,
      libertyMap: computeLibertyMap(stones),
      koPoint: -1,
      ownership: ownershipFor(),
      currentPlayer: 'black',
      rules: 'chinese',
    })!;
    expect(bonuses[PASS_MOVE]).toBe(0);
  });

  it('penalises filling settled territory on either side', () => {
    setBoardSize(9);
    const stones = stonesFrom(SPLIT9);
    const bonuses = computeEndingScoreBonuses({
      stones,
      libertyMap: computeLibertyMap(stones),
      koPoint: -1,
      ownership: ownershipFor(),
      currentPlayer: 'black',
      rules: 'chinese',
    })!;
    // Black's own eye at (1,1): fully owned, not next to white, not a connection.
    expect(bonuses[1 * BOARD_SIZE + 1]!).toBeGreaterThan(0);
    // A point deep inside white's area: also pointless for black.
    expect(bonuses[1 * BOARD_SIZE + 6]!).toBeGreaterThan(0);
    // The open column is contested, so it is never discouraged.
    for (let y = 0; y < BOARD_SIZE; y++) {
      expect(bonuses[y * BOARD_SIZE + 3]).toBe(0);
    }
  });

  it('mirrors the penalty when white is to move', () => {
    setBoardSize(9);
    const stones = stonesFrom(SPLIT9);
    const bonuses = computeEndingScoreBonuses({
      stones,
      libertyMap: computeLibertyMap(stones),
      koPoint: -1,
      ownership: ownershipFor(),
      currentPlayer: 'white',
      rules: 'japanese',
    })!;
    // Now the penalty is against white, so the white-perspective value is negative.
    expect(bonuses[PASS_MOVE]).toBeCloseTo(-0.5 * (2 / 3), 12);
    expect(bonuses[1 * BOARD_SIZE + 6]!).toBeLessThan(0);
  });

  it('does not judge board points while a ko ban is live', () => {
    setBoardSize(9);
    const stones = stonesFrom(SPLIT9);
    const bonuses = computeEndingScoreBonuses({
      stones,
      libertyMap: computeLibertyMap(stones),
      koPoint: 3 * BOARD_SIZE + 3,
      ownership: ownershipFor(),
      currentPlayer: 'black',
      rules: 'japanese',
    })!;
    // Only the pass adjustment survives; ko fights change what is worth playing.
    expect(bonuses[PASS_MOVE]!).toBeGreaterThan(0);
    expect(bonuses[1 * BOARD_SIZE + 1]).toBe(0);
  });

  it('reports nothing without an ownership map', () => {
    setBoardSize(9);
    const stones = stonesFrom(SPLIT9);
    expect(
      computeEndingScoreBonuses({
        stones,
        libertyMap: computeLibertyMap(stones),
        koPoint: -1,
        ownership: null,
        currentPlayer: 'black',
        rules: 'chinese',
      })
    ).toBeNull();
  });

  it('lowers the confidence bound of a penalised move', () => {
    setBoardSize(9);
    // Two identical children; only the second one carries an ending penalty.
    const child = { prior: 0.4, visits: 50, utilitySum: 5, utilitySqSum: 1, scoreMeanSum: 100, scoreMeanSqSum: 400 };
    const bonus = new Float64Array(BOARD_AREA + 1);
    bonus[1] = 0.5; // white gains half a point if black plays child 1

    const plain = computePlaySelectionValuesForTest({
      playerToMove: 'black',
      parentVisits: 100,
      parentUtilitySum: 10,
      parentUtilitySqSum: 2,
      isRoot: false,
      children: [child, child],
    })!;
    expect(plain.lcb[0]).toBeCloseTo(plain.lcb[1]!, 12);

    const penalised = computePlaySelectionValuesForTest({
      playerToMove: 'black',
      parentVisits: 100,
      parentUtilitySum: 10,
      parentUtilitySqSum: 2,
      isRoot: true,
      children: [child, child],
      endingBonus: bonus,
    })!;
    expect(penalised.lcb[1]!).toBeLessThan(penalised.lcb[0]!);
  });
});

describe.skipIf(!hasModel())('pruning useless moves after repeated passes', () => {
  it('stops considering moves inside pass-alive area', async () => {
    setBoardSize(9);
    const model = await loadHarnessModel();
    const board = boardFromDiagram(SPLIT9);
    // White has passed four times running; black should stop filling in.
    const passHistory = [
      { x: 3, y: 0, player: 'black' as const },
      { x: -1, y: -1, player: 'white' as const },
      { x: 3, y: 1, player: 'black' as const },
      { x: -1, y: -1, player: 'white' as const },
      { x: 3, y: 2, player: 'black' as const },
      { x: -1, y: -1, player: 'white' as const },
      { x: 3, y: 4, player: 'black' as const },
      { x: -1, y: -1, player: 'white' as const },
    ];
    const search = await MctsSearch.create({
      model,
      board,
      currentPlayer: 'black',
      moveHistory: passHistory,
      komi: 7,
      rules: 'chinese',
      nnRandomize: false,
      conservativePass: true,
      maxChildren: 40,
      ownershipMode: 'root',
      wideRootNoise: 0,
    });
    await search.run({ visits: 40, maxTimeMs: 120000, batchSize: 4 });
    const analysis = search.getAnalysis({ topK: 40, analysisPvLen: 1 });

    // Both players' areas here are pass-alive, so only the open column and the
    // pass remain. (The diagram's marked eyes keep each colour alive.)
    for (const m of analysis.moves) {
      if (m.x < 0) continue;
      expect(m.x).toBe(3);
    }
    expect(analysis.moves.length).toBeGreaterThan(0);
  }, 120000);
});
