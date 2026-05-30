import { describe, expect, it } from 'vitest';
import {
  bindingToDisplay,
  eventMatchesBinding,
  findShortcutCollision,
  getShortcutBindings,
  SHORTCUT_DEFINITIONS,
  shortcutDisplay,
  type ShortcutBinding,
} from '../src/utils/shortcuts';

const keyboardEvent = (key: string, init: Partial<KeyboardEventInit> = {}) =>
  ({
    key,
    ctrlKey: !!init.ctrlKey,
    metaKey: !!init.metaKey,
    shiftKey: !!init.shiftKey,
    altKey: !!init.altKey,
  }) as KeyboardEvent;

describe('shortcut utilities', () => {
  it('formats shortcut bindings for help and settings', () => {
    expect(bindingToDisplay({ key: 's', ctrl: true })).toBe('Ctrl+S');
    expect(shortcutDisplay([{ key: 'ArrowLeft' }, { key: 'z' }])).toBe('ArrowLeft / Z');
    expect(shortcutDisplay(null)).toBe('Disabled');
  });

  it('matches browser key events with normalized bindings', () => {
    expect(eventMatchesBinding(keyboardEvent('S', { metaKey: true }), { key: 's', ctrl: true })).toBe(true);
    expect(eventMatchesBinding(keyboardEvent(' ', {}), { key: 'Space' })).toBe(true);
    expect(eventMatchesBinding(keyboardEvent('s'), { key: 's', ctrl: true })).toBe(false);
  });

  it('detects shortcut collisions against active overrides', () => {
    const binding: ShortcutBinding = { key: 's', ctrl: true };
    const collision = findShortcutCollision(binding, 'open-sgf', {});
    expect(collision?.id).toBe('save-sgf');
  });

  it('keeps default shortcuts collision-free', () => {
    const seen = new Map<string, string>();
    const signature = (binding: ShortcutBinding) =>
      `${binding.ctrl ? 'C' : '-'}${binding.shift ? 'S' : '-'}${binding.alt ? 'A' : '-'}:${binding.key.length === 1 ? binding.key.toLowerCase() : binding.key}`;

    for (const shortcut of SHORTCUT_DEFINITIONS) {
      for (const binding of shortcut.defaultBindings) {
        const key = signature(binding);
        expect(seen.get(key), `${shortcut.id} conflicts with ${seen.get(key)} on ${key}`).toBeUndefined();
        seen.set(key, shortcut.id);
      }
    }
  });

  it('supports disabled and overridden bindings', () => {
    expect(getShortcutBindings('save-sgf', { 'save-sgf': null })).toBe(null);
    expect(getShortcutBindings('save-sgf', { 'save-sgf': [{ key: 'F9' }] })).toEqual([{ key: 'F9', ctrl: false, shift: false, alt: false }]);
  });
});
