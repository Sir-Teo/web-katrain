import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const registry = () => {
  const source = readFileSync('src/components/Layout.tsx', 'utf8');
  const start = source.indexOf('const commandPaletteCommands: CommandPaletteCommand[] =');
  expect(start).toBeGreaterThan(-1);
  const end = source.indexOf('\n  const ', source.indexOf('\n  })();', start));
  const text = source.slice(start, end);
  // Guard the slice: an empty region would satisfy the presence checks vacuously
  // only if they were negative, but it would fail loudly here instead.
  expect(text.length).toBeGreaterThan(1000);
  return text;
};

describe('command palette game actions', () => {
  it.each([
    ["id: 'pass'", 'Pass'],
    ["id: 'ai-move'", 'AI move'],
    ["id: 'rotate-board'", 'Rotate board'],
    ["id: 'resign'", 'Resign'],
  ])('registers %s', (id, label) => {
    const text = registry();

    expect(text).toContain(id);
    expect(text).toContain(`label: '${label}'`);
  });

  const playFromHereBlock = () => {
    const text = registry();
    const start = text.indexOf("id: 'play-from-here'");
    expect(start).toBeGreaterThan(-1);
    const end = text.indexOf("id: 'rotate-board'", start);
    expect(end).toBeGreaterThan(start);
    return text.slice(start, end);
  };

  it('offers to continue the current position against the engine', () => {
    const block = playFromHereBlock();
    // Every other route to a bot game calls startNewGame first, so this is the
    // only one that keeps the position you are looking at.
    expect(block).toContain('useGameStore.getState().toggleAi(engineColor)');
    // A call, not a mention: the block's own comment names startNewGame to say
    // what this command deliberately does not do.
    expect(block).not.toContain('startNewGame(');
  });

  it('reads the colour the engine already holds instead of the side to move', () => {
    // While the engine is thinking it IS the side to move, so deriving the
    // colour from currentPlayer would hand it the human's stones mid-turn.
    const block = playFromHereBlock();
    expect(block).toContain('isAiPlaying && aiColor');
    expect(block).toContain("currentPlayer === 'black' ? 'white' : 'black'");
  });

  it('calls resign lazily because it is declared after the registry', () => {
    // handleResign is a const below this list, so naming it directly threw a
    // temporal-dead-zone error while the list was built.
    expect(registry()).toContain('run: () => handleResign()');
  });
});
