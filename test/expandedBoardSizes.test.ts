import { afterEach, describe, expect, it } from 'vitest';
import { useGameStore } from '../src/store/gameStore';
import type { BoardSize } from '../src/types';
import { generateSgfFromTree, parseSgf } from '../src/utils/sgf';

const sizes: BoardSize[] = [5, 7, 11, 15, 17];
afterEach(() => useGameStore.getState().resetGame());

describe('practice-size games', () => {
  it.each(sizes.map(size => [size, size] as const))('keeps a %ix%i game intact through play, undo, SGF export and reload', (size) => {
    useGameStore.getState().startNewGame({ boardSize: size, handicap: 0, komi: 6.5, rules: 'japanese' });
    useGameStore.getState().playMove(size - 1, size - 1, true);
    expect(useGameStore.getState().board).toHaveLength(size);
    expect(useGameStore.getState().board[size - 1][size - 1]).toBe('black');
    useGameStore.getState().navigateBack();
    expect(useGameStore.getState().board[size - 1][size - 1]).toBeNull();
    useGameStore.getState().navigateForward();
    expect(useGameStore.getState().board[size - 1][size - 1]).toBe('black');
    const sgf = generateSgfFromTree(useGameStore.getState().rootNode);
    expect(sgf).toContain(`SZ[${size}]`);
    const parsed = parseSgf(sgf);
    expect(parsed.initialBoard).toHaveLength(size);
    expect(parsed.moves).toEqual([{ x: size - 1, y: size - 1, player: 'black' }]);
    useGameStore.getState().loadGame(parsed);
    useGameStore.getState().navigateEnd();
    expect(useGameStore.getState().board).toHaveLength(size);
    expect(useGameStore.getState().board[size - 1][size - 1]).toBe('black');
  });
});
