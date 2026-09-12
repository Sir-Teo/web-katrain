import { afterEach, describe, expect, it, vi } from 'vitest';
import { RULES_OPTIONS } from '../src/utils/goRules';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('startup game with saved rules', () => {
  it.each(RULES_OPTIONS)('preserves $label through SGF export and recovery', async ({ id, sgf }) => {
    const values = new Map<string, string>([['web-katrain:settings:v3', JSON.stringify({
      gameRules: id, soundEnabled: false, loadSgfFastAnalysis: false,
    })]]);
    vi.stubGlobal('localStorage', {
      get length() { return values.size; },
      clear: () => values.clear(),
      getItem: (key: string) => values.get(key) ?? null,
      key: (index: number) => [...values.keys()][index] ?? null,
      removeItem: (key: string) => { values.delete(key); },
      setItem: (key: string, value: string) => { values.set(key, value); },
    } satisfies Storage);
    vi.resetModules();
    // Import after seeding storage: resetGame() creates a different root and
    // would hide a mismatch in the game displayed on a fresh page.
    const { useGameStore } = await import('../src/store/gameStore');
    const { generateSgfFromTree, parseSgf } = await import('../src/utils/sgf');
    const state = useGameStore.getState;
    expect(state().settings.gameRules).toBe(id);
    state().passTurn();
    const before = state();
    const exported = generateSgfFromTree(before.rootNode);
    expect.soft(before.rootNode.properties?.RU).toEqual([sgf]);
    expect.soft(exported).toContain(`RU[${sgf}]`);

    state().loadGame(parseSgf(exported));
    state().navigateEnd();
    expect(state().moveHistory).toEqual(before.moveHistory);
    expect(state().currentPlayer).toBe(before.currentPlayer);
    expect(state().board).toEqual(before.board);
    expect(state().settings.gameRules).toBe(id);
  });
});
