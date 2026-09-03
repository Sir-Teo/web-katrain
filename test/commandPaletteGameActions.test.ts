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

  /**
   * The handler is shared with the board control bar's "Play on" toggle, so it
   * lives outside the registry; these read it where it actually is.
   */
  const playFromHereHandler = () => {
    const source = readFileSync('src/components/Layout.tsx', 'utf8');
    const start = source.indexOf('const handlePlayFromHere = useCallback(');
    expect(start).toBeGreaterThan(-1);
    const end = source.indexOf('\n  }, [', start);
    expect(end).toBeGreaterThan(start);
    return source.slice(start, end);
  };

  it('offers to continue the current position against the engine', () => {
    // Every other route to a bot game calls startNewGame first, so this is the
    // only one that keeps the position you are looking at.
    expect(playFromHereBlock()).toContain('run: () => handlePlayFromHere()');
    const handler = playFromHereHandler();
    expect(handler).toContain('useGameStore.getState().toggleAi(engineColor)');
    // A call, not a mention: a comment names startNewGame to say what this
    // deliberately does not do.
    expect(handler).not.toContain('startNewGame(');
  });

  it('reads the colour the engine already holds instead of the side to move', () => {
    // While the engine is thinking it IS the side to move, so deriving the
    // colour from currentPlayer would hand it the human's stones mid-turn.
    const handler = playFromHereHandler();
    expect(handler).toContain('isAiPlaying && aiColor');
    expect(handler).toContain("currentPlayer === 'black' ? 'white' : 'black'");
  });

  it('shares one handler with the board control bar so the two cannot drift', () => {
    const source = readFileSync('src/components/Layout.tsx', 'utf8');
    expect(source).toContain('onPlayFromHere={handlePlayFromHere}');
    expect(source).toContain('engineOpponent={isAiPlaying ? aiColor : null}');
  });

  it('calls resign lazily because it is declared after the registry', () => {
    // handleResign is a const below this list, so naming it directly threw a
    // temporal-dead-zone error while the list was built.
    expect(registry()).toContain('run: () => handleResign()');
  });
});
