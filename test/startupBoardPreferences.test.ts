import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateSgfFromTree, parseSgf } from '../src/utils/sgf';

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

describe('startup board preferences', () => {
  it.each([[5, 0], [5, 1], [7, 3], [13, 2], [17, 9]])('starts at size %i with handicap %i, including correct SGF setup', async (size, handicap) => {
    const values = new Map([['web-katrain:settings:v3', JSON.stringify({ defaultBoardSize: size, defaultHandicap: handicap, gameRules: 'chinese', soundEnabled: false })]]);
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
      removeItem: (key: string) => { values.delete(key); },
    });
    vi.resetModules();
    const { useGameStore } = await import('../src/store/gameStore');
    const initial = useGameStore.getState();
    expect(initial.board).toHaveLength(size);
    expect(initial.board.every(row => row.length === size)).toBe(true);
    expect(initial.board.flat().filter(stone => stone === 'black')).toHaveLength(handicap);
    expect(initial.currentPlayer).toBe(handicap ? 'white' : 'black');
    expect(initial.rootNode.properties?.RU).toEqual(['Chinese']);
    expect(initial.rootNode.properties?.SZ).toEqual([String(size)]);
    expect(initial.rootNode.properties?.HA).toEqual(handicap ? [String(handicap)] : undefined);
    const expectedBoard = initial.board.map(row => [...row]);
    const sgf = generateSgfFromTree(initial.rootNode);
    initial.loadGame(parseSgf(sgf));
    expect(useGameStore.getState().board).toEqual(expectedBoard);
    expect(useGameStore.getState().currentPlayer).toBe(handicap ? 'white' : 'black');
  });
});
