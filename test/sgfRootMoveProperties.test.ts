import { describe, expect, it } from 'vitest';
import { useGameStore } from '../src/store/gameStore';
import { generateSgfFromTree, parseSgf } from '../src/utils/sgf';

function load(sgf: string) {
  const store = useGameStore.getState();
  store.resetGame();
  store.loadGame(parseSgf(sgf));
  return useGameStore.getState().rootNode;
}

describe('a move written into the SGF root node', () => {
  it('leaves the comment and game info on the root', () => {
    const root = load('(;GM[1]FF[4]SZ[19]PB[Alice]C[Hello]B[pd]BL[300]TR[dd];W[dp])');
    const first = root.children[0]!;

    expect(root.note).toBe('Hello');
    expect(root.properties?.PB).toEqual(['Alice']);
    expect(first.move).toMatchObject({ player: 'black' });
    expect(first.note ?? '').toBe('');
    expect(Object.keys(first.properties ?? {}).sort()).toEqual(['B', 'BL', 'TR']);
    expect(root.properties?.BL).toBeUndefined();
  });

  it('writes the comment once when saved again', () => {
    const root = load('(;GM[1]FF[4]SZ[19]C[Hello]B[pd];W[dp])');
    const saved = generateSgfFromTree(root, { trainer: { saveAnalysis: false } });

    expect(saved.match(/Hello/g)).toHaveLength(1);
    expect(saved).toMatch(/;B\[pd\];W\[dp\]\)$/);
  });
});
