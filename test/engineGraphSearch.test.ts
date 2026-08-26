import { beforeEach, describe, expect, it } from 'vitest';
import { MctsSearch } from '../src/engine/katago/analyzeMcts';
import {
  GRAPH_SEARCH_REP_BOUND,
  computeStateHash,
  mixGraphHash,
  packHashKey,
  simpleRepetitionBoundGt,
} from '../src/engine/katago/graphHash';
import { BLACK, BOARD_AREA, BOARD_SIZE, PASS_MOVE, WHITE, setBoardSize, type StoneColor } from '../src/engine/katago/fastBoard';
import { emptyBoard, hasModel, loadHarnessModel } from './helpers/engineHarness';

// ---------------------------------------------------------------------------
// Graph search (cpp/game/graphhash.cpp, cpp/search/search.cpp), which KataGo turns
// on for every setup except distributed training.
//
// A position the search reaches two ways is one node, so the visits pool instead of
// being split between copies. What keeps that from closing a cycle is the
// repetition bound: a position is only allowed to stand for itself when the move
// that made it had a local region too large for any short repetition to come back
// through.
// ---------------------------------------------------------------------------

const stonesFrom = (diagram: string): Uint8Array => {
  const stones = new Uint8Array(BOARD_AREA);
  diagram
    .trim()
    .split('\n')
    .forEach((row, y) => {
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

describe('simpleRepetitionBoundGt', () => {
  beforeEach(() => setBoardSize(9));

  it('is large for a stone played in the open', () => {
    const stones = stonesFrom(`
      .........
      .........
      .........
      .........
      ....X....
      .........
      .........
      .........
      .........
    `);
    // One stone, four liberties, and an enormous empty region behind them.
    expect(simpleRepetitionBoundGt(stones, 4 * 9 + 4, GRAPH_SEARCH_REP_BOUND)).toBe(true);
  });

  it('is small for a stone played into an enclosed pocket', () => {
    const stones = stonesFrom(`
      XO.......
      .O.......
      O........
      .........
      .........
      .........
      .........
      .........
      .........
    `);
    // The black stone's chain, its one liberty and that liberty's region come to
    // two points, so a repetition could come back through here quickly.
    expect(simpleRepetitionBoundGt(stones, 0, GRAPH_SEARCH_REP_BOUND)).toBe(false);
  });

  it('is never large for a pass', () => {
    expect(simpleRepetitionBoundGt(new Uint8Array(BOARD_AREA), PASS_MOVE, GRAPH_SEARCH_REP_BOUND)).toBe(false);
  });
});

describe('position hashing', () => {
  beforeEach(() => setBoardSize(9));

  const hashOf = (args: { stones: Uint8Array; koPoint?: number; pla?: StoneColor; passes?: number }): number => {
    const out = new Int32Array(2);
    computeStateHash(args.stones, args.koPoint ?? -1, args.pla ?? BLACK, args.passes ?? 0, out);
    return packHashKey(out[0]!, out[1]!);
  };

  it('is the same position however it is spelled', () => {
    const a = stonesFrom('....X....');
    const b = stonesFrom('....X....');
    expect(hashOf({ stones: a })).toBe(hashOf({ stones: b }));
  });

  it('separates the things that decide what is legal here', () => {
    const stones = stonesFrom('....X....');
    const base = hashOf({ stones });
    expect(hashOf({ stones, pla: WHITE })).not.toBe(base);
    expect(hashOf({ stones, koPoint: 12 })).not.toBe(base);
    expect(hashOf({ stones, passes: 1 })).not.toBe(base);
    expect(hashOf({ stones: stonesFrom('...X.....') })).not.toBe(base);
  });

  it('folds the path in when a repetition is possible', () => {
    const stones = stonesFrom('....X....');
    const state = new Int32Array(2);
    computeStateHash(stones, -1, BLACK, 0, state);

    const viaOnePath = new Int32Array(2);
    mixGraphHash(11, 22, state[0]!, state[1]!, viaOnePath);
    const viaAnother = new Int32Array(2);
    mixGraphHash(33, 44, state[0]!, state[1]!, viaAnother);

    expect(packHashKey(viaOnePath[0]!, viaOnePath[1]!)).not.toBe(packHashKey(viaAnother[0]!, viaAnother[1]!));
    // And neither is the bare state hash, so a repeatable position never merges
    // with the same position reached without a path behind it.
    expect(packHashKey(viaOnePath[0]!, viaOnePath[1]!)).not.toBe(packHashKey(state[0]!, state[1]!));
  });
});

describe.skipIf(!hasModel())('sharing transposed positions', () => {
  const run = async (useGraphSearch: boolean, visits: number) => {
    setBoardSize(9);
    const model = await loadHarnessModel();
    const s = await MctsSearch.create({
      model,
      board: emptyBoard(9),
      currentPlayer: 'black',
      moveHistory: [],
      komi: 7,
      rules: 'chinese',
      nnRandomize: false,
      conservativePass: false,
      maxChildren: 8,
      ownershipMode: 'tree',
      wideRootNoise: 0,
      useGraphSearch,
    });
    await s.run({ visits, maxTimeMs: 180000, batchSize: 4 });
    return s;
  };

  // The searches are deterministic and slow, so both assertions share one of each.
  let shared: Promise<MctsSearch> | null = null;
  const search = (useGraphSearch: boolean) => {
    if (!useGraphSearch) return run(false, 200);
    if (!shared) shared = run(true, 800);
    return shared;
  };

  it('finds positions it has already reached another way', async () => {
    // Transpositions are scarce in a shallow search and grow quickly with depth:
    // an empty 9x9 turns up a couple by 400 visits and a couple of dozen by 1500.
    const s = await search(true);
    expect(s.getTranspositionHits()).toBeGreaterThan(0);
  }, 180000);

  it('finds none of them with graph search off', async () => {
    const s = await search(false);
    expect(s.getTranspositionHits()).toBe(0);
  }, 180000);

  it('still reports a whole, sane search', async () => {
    const s = await search(true);
    const analysis = s.getAnalysis({ topK: 12, analysisPvLen: 8 });
    expect(analysis.rootVisits).toBeGreaterThanOrEqual(800);
    expect(analysis.moves.length).toBeGreaterThan(1);
    // Ownership still averages to something in range, so the walk over a graph
    // rather than a tree terminated and stayed weighted.
    for (let i = 0; i < BOARD_AREA; i++) {
      expect(analysis.ownership[i]!).toBeGreaterThanOrEqual(-1.001);
      expect(analysis.ownership[i]!).toBeLessThanOrEqual(1.001);
    }
    for (const m of analysis.moves) {
      expect(m.visits).toBeGreaterThan(0);
      expect(Number.isFinite(m.winRate)).toBe(true);
    }
  }, 180000);
});
