import { describe, expect, it } from 'vitest';
import { getCommandNavigationIndex } from '../src/utils/commandPalette';
import { isComposingKeyEvent } from '../src/utils/keyboardComposition';

describe('command palette keyboard navigation', () => {
  const commands = [{}, { disabledReason: 'No game loaded' }, {}, { disabledReason: 'No analysis' }];

  it('skips unavailable commands in both directions', () => {
    expect(getCommandNavigationIndex(commands, 0, 1)).toBe(2);
    expect(getCommandNavigationIndex(commands, 2, -1)).toBe(0);
  });

  it('wraps at both ends without landing on an unavailable command', () => {
    expect(getCommandNavigationIndex(commands, 2, 1)).toBe(0);
    expect(getCommandNavigationIndex(commands, 0, -1)).toBe(2);
  });

  it('starts at the appropriate enabled end after the results change', () => {
    const results = [{ disabledReason: 'Unavailable' }, {}, {}, { disabledReason: 'Unavailable' }];
    expect(getCommandNavigationIndex(results, -1, 1)).toBe(1);
    expect(getCommandNavigationIndex(results, -1, -1)).toBe(2);
    expect(getCommandNavigationIndex(results, 50, 1)).toBe(1);
  });

  it('leaves no selection when no command can run', () => {
    expect(getCommandNavigationIndex([], -1, 1)).toBe(-1);
    expect(getCommandNavigationIndex([{ disabledReason: 'Unavailable' }], 0, -1)).toBe(-1);
  });

  it('keeps a single enabled command selected when navigating either way', () => {
    expect(getCommandNavigationIndex(commands.slice(0, 2), 0, 1)).toBe(0);
    expect(getCommandNavigationIndex(commands.slice(0, 2), 0, -1)).toBe(0);
  });
});

describe('IME keyboard ownership', () => {
  it('recognizes composition and the Safari confirmation event', () => {
    expect(isComposingKeyEvent({ isComposing: true })).toBe(true);
    expect(isComposingKeyEvent({ isComposing: false, keyCode: 229 })).toBe(true);
  });

  it('allows ordinary keys after composition finishes', () => {
    expect(isComposingKeyEvent({ isComposing: false, keyCode: 13 })).toBe(false);
    expect(isComposingKeyEvent({})).toBe(false);
  });
});
