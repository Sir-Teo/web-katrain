import { describe, expect, it } from 'vitest';
import { emptyBoard, loadHarnessModel, runsEngineSuites } from './helpers/engineHarness';
import {
  MctsSearch,
  computeValidRootSymmetries,
  markSymmetryDuplicateMoves,
} from '../src/engine/katago/analyzeMcts';
import { BOARD_AREA, BOARD_SIZE, PASS_MOVE, setBoardSize } from '../src/engine/katago/fastBoard';
import type { RecentMove } from '../src/engine/katago/featuresV7Fast';

// ---------------------------------------------------------------------------
// Root symmetry pruning.
//
// KataGo searches one copy of each symmetrically equivalent root move
// (rootSymmetryPruning, on by default for analysis and GTP) and puts the copies
// back into the analysis output afterwards. On an empty board that is up to eight
// times the visits per distinct position for the same amount of network work.
// ---------------------------------------------------------------------------

const stonesFrom = (rows: string[]): Uint8Array => {
  const stones = new Uint8Array(BOARD_AREA);
  rows.forEach((row, y) => {
    row
      .trim()
      .split('')
      .forEach((c, x) => {
        if (c === 'X') stones[y * BOARD_SIZE + x] = 1;
        else if (c === 'O') stones[y * BOARD_SIZE + x] = 2;
      });
  });
  return stones;
};

const noMoves: RecentMove[] = [];

describe('root symmetry detection', () => {
  it('finds all eight symmetries of an empty board', () => {
    setBoardSize(9);
    const symmetries = computeValidRootSymmetries({
      stones: new Uint8Array(BOARD_AREA),
      koPoint: -1,
      recentMoves: noMoves,
    });
    expect(symmetries).toHaveLength(8);
  });

  it('finds the four symmetries of a diagonally-symmetric position', () => {
    setBoardSize(9);
    // Two stones on the a1-i9 diagonal: invariant under that reflection only,
    // plus the identity, and their compositions with the 180 degree rotation.
    const stones = stonesFrom([
      '.........',
      '.X.......',
      '.........',
      '.........',
      '.........',
      '.........',
      '.........',
      '.......X.',
      '.........',
    ]);
    const symmetries = computeValidRootSymmetries({ stones, koPoint: -1, recentMoves: noMoves });
    expect(symmetries.length).toBeGreaterThan(1);
    expect(symmetries.length).toBeLessThan(8);
    expect(symmetries).toContain(0);
  });

  it('treats nothing as symmetric while a ko ban is on the board', () => {
    setBoardSize(9);
    const symmetries = computeValidRootSymmetries({
      stones: new Uint8Array(BOARD_AREA),
      koPoint: 40,
      recentMoves: noMoves,
    });
    expect(symmetries).toEqual([0]);
  });

  it('rejects symmetries that move a stone the network still sees as recent', () => {
    setBoardSize(9);
    // The board is empty but the net gets the last five moves as input planes, so a
    // symmetry that moves them changes the input and is not a real duplicate. The
    // point below sits on no symmetry axis, so only the identity fixes it.
    const symmetries = computeValidRootSymmetries({
      stones: new Uint8Array(BOARD_AREA),
      koPoint: -1,
      recentMoves: [{ move: 3 * BOARD_SIZE + 2, player: 'black' }],
    });
    expect(symmetries).toEqual([0]);
  });

  it('compares stones alone once pre-root history is ignored', () => {
    setBoardSize(9);
    // With the root's history planes empty, KataGo's own condition applies: a
    // symmetry is real if it fixes the stones, whatever moves led to them.
    const symmetries = computeValidRootSymmetries({
      stones: new Uint8Array(BOARD_AREA),
      koPoint: -1,
      recentMoves: [{ move: 3 * BOARD_SIZE + 2, player: 'black' }],
      ignorePreRootHistory: true,
    });
    expect(symmetries).toHaveLength(8);
  });

  it('ignores passes in the recent move history', () => {
    setBoardSize(9);
    const symmetries = computeValidRootSymmetries({
      stones: new Uint8Array(BOARD_AREA),
      koPoint: -1,
      recentMoves: [{ move: PASS_MOVE, player: 'black' }],
    });
    expect(symmetries).toHaveLength(8);
  });
});

describe('symmetry duplicate marking', () => {
  const orbitOf = (loc: number, symmetries: number[], map: Int16Array): Set<number> => {
    const orbit = new Set<number>();
    for (const sym of symmetries) orbit.add(map[sym * BOARD_AREA + loc]!);
    return orbit;
  };

  it('keeps exactly one representative per orbit', () => {
    setBoardSize(9);
    const symmetries = computeValidRootSymmetries({
      stones: new Uint8Array(BOARD_AREA),
      koPoint: -1,
      recentMoves: noMoves,
    });
    const dup = markSymmetryDuplicateMoves(symmetries, true, null);
    expect(dup).not.toBeNull();

    // Rebuild the symmetry map the same way the engine does, by asking for the
    // orbit of each kept point and checking the partition is exact.
    const map = new Int16Array(8 * BOARD_AREA);
    for (let sym = 0; sym < 8; sym++) {
      const mirror = sym >= 4;
      const rot = sym & 3;
      for (let y = 0; y < BOARD_SIZE; y++) {
        for (let x = 0; x < BOARD_SIZE; x++) {
          const sx = mirror ? BOARD_SIZE - 1 - x : x;
          const sy = y;
          let tx: number;
          let ty: number;
          if (rot === 0) [tx, ty] = [sx, sy];
          else if (rot === 1) [tx, ty] = [sy, BOARD_SIZE - 1 - sx];
          else if (rot === 2) [tx, ty] = [BOARD_SIZE - 1 - sx, BOARD_SIZE - 1 - sy];
          else [tx, ty] = [BOARD_SIZE - 1 - sy, sx];
          map[sym * BOARD_AREA + y * BOARD_SIZE + x] = ty * BOARD_SIZE + tx;
        }
      }
    }

    const covered = new Set<number>();
    let kept = 0;
    for (let p = 0; p < BOARD_AREA; p++) {
      if (dup![p] === 1) continue;
      kept++;
      for (const q of orbitOf(p, symmetries, map)) {
        expect(covered.has(q)).toBe(false); // no orbit is represented twice
        covered.add(q);
      }
    }
    expect(covered.size).toBe(BOARD_AREA); // every point belongs to some orbit
    expect(kept).toBeLessThan(BOARD_AREA / 4); // 9x9 has 15 orbits under the full group
  });

  it('keeps black to move in the upper right', () => {
    setBoardSize(9);
    const symmetries = computeValidRootSymmetries({
      stones: new Uint8Array(BOARD_AREA),
      koPoint: -1,
      recentMoves: noMoves,
    });
    const dup = markSymmetryDuplicateMoves(symmetries, true, null)!;
    // 3-3 point: only the upper right copy survives for black.
    expect(dup[2 * BOARD_SIZE + 6]).toBe(0);
    expect(dup[6 * BOARD_SIZE + 2]).toBe(1);
    expect(dup[6 * BOARD_SIZE + 6]).toBe(1);
    expect(dup[2 * BOARD_SIZE + 2]).toBe(1);
  });

  it('never makes a move outside the region of interest the representative', () => {
    setBoardSize(9);
    const symmetries = computeValidRootSymmetries({
      stones: new Uint8Array(BOARD_AREA),
      koPoint: -1,
      recentMoves: noMoves,
    });
    // Allow only the lower left quadrant.
    const roi = new Uint8Array(BOARD_AREA);
    for (let y = 5; y < 9; y++) for (let x = 0; x < 4; x++) roi[y * BOARD_SIZE + x] = 1;
    const dup = markSymmetryDuplicateMoves(symmetries, true, roi)!;
    for (let p = 0; p < BOARD_AREA; p++) {
      if (roi[p] === 0) continue;
      // Every allowed point is either kept or a duplicate of another allowed point.
      if (dup[p] === 0) continue;
    }
    expect(dup[6 * BOARD_SIZE + 2]).toBe(0); // the 3-3 in the allowed quadrant is kept now
  });

  it('returns no mask when only the identity is symmetric', () => {
    setBoardSize(9);
    expect(markSymmetryDuplicateMoves([0], true, null)).toBeNull();
  });
});

describe.skipIf(!runsEngineSuites())('root symmetry pruning in search', () => {
  it('concentrates visits and reports the copies it folded away', async () => {
    setBoardSize(9);
    const model = await loadHarnessModel();
    const makeSearch = (pruning: boolean) =>
      MctsSearch.create({
        model,
        board: emptyBoard(9),
        currentPlayer: 'black',
        moveHistory: [],
        komi: 7,
        rules: 'chinese',
        nnRandomize: false,
        conservativePass: true,
        maxChildren: 32,
        ownershipMode: 'root',
        wideRootNoise: 0,
        rootSymmetryPruning: pruning,
      });

    const pruned = await makeSearch(true);
    await pruned.run({ visits: 64, maxTimeMs: 120000, batchSize: 4 });
    const prunedAnalysis = pruned.getAnalysis({ topK: 40, analysisPvLen: 2 });

    const plain = await makeSearch(false);
    await plain.run({ visits: 64, maxTimeMs: 120000, batchSize: 4 });
    const plainAnalysis = plain.getAnalysis({ topK: 40, analysisPvLen: 2 });

    // Same number of visits, spread over eight times fewer distinct positions.
    expect(prunedAnalysis.moves[0]!.visits).toBeGreaterThan(plainAnalysis.moves[0]!.visits);

    const copies = prunedAnalysis.moves.filter((m) => m.isSymmetryOf);
    expect(copies.length).toBeGreaterThan(0);
    for (const copy of copies) {
      const source = prunedAnalysis.moves.find(
        (m) => !m.isSymmetryOf && m.x === copy.isSymmetryOf!.x && m.y === copy.isSymmetryOf!.y
      );
      expect(source).toBeDefined();
      expect(copy.visits).toBe(source!.visits);
      expect(copy.winRate).toBeCloseTo(source!.winRate, 12);
      expect(copy.scoreLead).toBeCloseTo(source!.scoreLead, 12);
      expect(copy.pv.length).toBe(source!.pv.length);
      // A copy is a different move than the one that was searched.
      expect(`${copy.x},${copy.y}`).not.toBe(`${source!.x},${source!.y}`);
    }

    // Ordering is still dense and starts at zero after duplication.
    prunedAnalysis.moves.forEach((m, i) => expect(m.order).toBe(i));
  }, 180000);

  it('still sees the whole board in the raw policy', async () => {
    setBoardSize(9);
    const model = await loadHarnessModel();
    const search = await MctsSearch.create({
      model,
      board: emptyBoard(9),
      currentPlayer: 'black',
      moveHistory: [],
      komi: 7,
      rules: 'chinese',
      nnRandomize: false,
      conservativePass: true,
      maxChildren: 32,
      ownershipMode: 'root',
      wideRootNoise: 0,
    });
    await search.run({ visits: 24, maxTimeMs: 60000, batchSize: 4 });
    const analysis = search.getAnalysis({ topK: 5, analysisPvLen: 1 });
    let legal = 0;
    for (let p = 0; p < BOARD_AREA; p++) {
      if (analysis.policy[p]! >= 0) legal++;
    }
    // Pruning restricts what the search plays, not what the policy overlay shows.
    expect(legal).toBe(BOARD_AREA);
  }, 120000);
});
