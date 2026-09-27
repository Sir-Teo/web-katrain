import { beforeEach, describe, expect, it } from 'vitest';
import { useGameStore } from '../src/store/gameStore';
import { createLibraryItem, updateLibraryFileSgf } from '../src/utils/library';
import { generateSgfFromTree, parseSgf } from '../src/utils/sgf';
import { countSgfGames, sgfTrailingGames } from '../src/utils/sgfScan';

/** Three complete games in one file, the way an SGF collection is written. */
const COLLECTION =
  '(;GM[1]FF[4]SZ[19]PB[Alice]PW[Bob]RE[B+R];B[pd];W[dp];B[pp])\n' +
  '(;GM[1]FF[4]SZ[19]PB[Carol]PW[Dave]RE[W+2.5];B[qd];W[dc];B[pq];W[dq])\n' +
  '(;GM[1]FF[4]SZ[19]PB[Eve]PW[Frank]RE[B+1.5];B[ee];W[cc])';

const TRAILING = sgfTrailingGames(COLLECTION);

const open = (text: string) => {
  useGameStore.getState().loadGame(parseSgf(text));
  return useGameStore.getState();
};

const exported = () => generateSgfFromTree(useGameStore.getState().rootNode);

describe('opening and exporting an SGF collection', () => {
  beforeEach(() => {
    useGameStore.getState().startNewGame({ komi: 6.5, rules: 'japanese', boardSize: 19, handicap: 0 });
  });

  it('keeps the games after the first when a collection is opened directly and exported', () => {
    // Opening the file loaded Alice's game and an export wrote Alice alone:
    // Carol's and Eve's games were gone.
    const state = open(COLLECTION);
    expect(state.rootNode.properties?.PB).toEqual(['Alice']);

    const sgf = exported();
    expect(countSgfGames(sgf)).toBe(3);
    expect(sgf.endsWith(TRAILING)).toBe(true);
    // The first game in the export is still the one on screen.
    expect(parseSgf(sgf).tree?.props.PB).toEqual(['Alice']);
  });

  it('keeps them through edits and undo', () => {
    open(COLLECTION);
    const store = useGameStore.getState();
    store.setRootProperty('GN', 'Edited');
    expect(countSgfGames(exported())).toBe(3);
    useGameStore.getState().undoEdit();
    expect(useGameStore.getState().rootNode.properties?.GN).toBeUndefined();
    expect(exported().endsWith(TRAILING)).toBe(true);
  });

  it('survives a round trip through its own export without doubling', () => {
    open(COLLECTION);
    open(exported());
    const sgf = exported();
    expect(countSgfGames(sgf)).toBe(3);
    expect(sgf.endsWith(TRAILING)).toBe(true);
  });

  it('does not hand the old collection to the next game', () => {
    open(COLLECTION);
    useGameStore.getState().startNewGame({ komi: 6.5, rules: 'japanese', boardSize: 19, handicap: 0 });
    expect(countSgfGames(exported())).toBe(1);
    open('(;GM[1]SZ[19];B[pd])');
    expect(countSgfGames(exported())).toBe(1);
  });

  it('leaves single games alone and can export the open game only', () => {
    expect(parseSgf('(;GM[1]SZ[19];B[pd])').trailingGames).toBeUndefined();
    open(COLLECTION);
    const only = generateSgfFromTree(useGameStore.getState().rootNode, { includeTrailingGames: false });
    expect(countSgfGames(only)).toBe(1);
  });

  it('saves a Library collection opened in the editor without appending its tail twice', () => {
    const item = createLibraryItem('three.sgf', COLLECTION, null);
    open(item.sgf);
    const [saved] = updateLibraryFileSgf([item], item.id, exported());
    const savedSgf = saved?.type === 'file' ? saved.sgf : '';
    expect(countSgfGames(savedSgf)).toBe(3);
    expect(savedSgf.endsWith(TRAILING)).toBe(true);
  });
});
