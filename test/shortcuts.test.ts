import { describe, expect, it } from 'vitest';
import {
  bindingToDisplay,
  createShortcutCollisionReplacement,
  eventMatchesBinding,
  filterShortcutGroups,
  findShortcutCollision,
  getShortcutBindings,
  getShortcutGroups,
  isShortcutRecordingCancelKey,
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
    expect(bindingToDisplay({ key: 'ArrowLeft', shift: true })).toBe('Shift+←');
    expect(bindingToDisplay({ key: 'Escape' })).toBe('Esc');
    expect(shortcutDisplay([{ key: 'ArrowLeft' }, { key: 'z' }])).toBe('← / Z');
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

  it('exposes file save shortcuts for download and library copies', () => {
    expect(getShortcutBindings('save-sgf', {})).toEqual([{ key: 's', ctrl: true, shift: false, alt: false }]);
    expect(getShortcutBindings('save-library', {})).toEqual([{ key: 's', ctrl: true, shift: true, alt: false }]);
  });

  it('exposes a default shortcut for next move preview', () => {
    expect(getShortcutBindings('toggle-next-move-preview', {})).toEqual([{ key: 'v', ctrl: false, shift: false, alt: false }]);
  });

  it('exposes a default shortcut for scoring mode', () => {
    expect(getShortcutBindings('toggle-scoring', {})).toEqual([{ key: 's', ctrl: false, shift: true, alt: false }]);
  });

  it('exposes view chrome shortcuts for compact review layouts', () => {
    expect(getShortcutBindings('toggle-top-bar', {})).toEqual([{ key: 'm', ctrl: true, shift: true, alt: false }]);
    expect(getShortcutBindings('toggle-bottom-bar', {})).toEqual([{ key: 'u', ctrl: true, shift: true, alt: false }]);
  });

  it('keeps settings available on both conventional and legacy shortcuts', () => {
    expect(getShortcutBindings('settings-modal', {})).toEqual([
      { key: ',', ctrl: true, shift: false, alt: false },
      { key: 'F8', ctrl: false, shift: false, alt: false },
    ]);
  });

  it('exposes pro edit history shortcuts', () => {
    expect(getShortcutBindings('edit-undo', {})).toEqual([{ key: 'z', ctrl: true, shift: false, alt: false }]);
    expect(getShortcutBindings('edit-redo', {})).toEqual([
      { key: 'z', ctrl: true, shift: true, alt: false },
      { key: 'y', ctrl: true, shift: false, alt: false },
    ]);
  });

  it('treats Escape as a shortcut recording cancel key', () => {
    expect(isShortcutRecordingCancelKey(keyboardEvent('Escape'))).toBe(true);
    expect(isShortcutRecordingCancelKey(keyboardEvent('Esc'))).toBe(true);
    expect(isShortcutRecordingCancelKey(keyboardEvent('s', { ctrlKey: true }))).toBe(false);
  });

  it('builds replacement overrides when resolving a shortcut collision', () => {
    const next = createShortcutCollisionReplacement(
      {},
      'open-sgf',
      'save-sgf',
      { key: 's', ctrl: true }
    );

    expect(getShortcutBindings('open-sgf', next)).toEqual([{ key: 's', ctrl: true, shift: false, alt: false }]);
    expect(getShortcutBindings('save-sgf', next)).toBe(null);
  });

  it('preserves non-conflicting bindings when replacing one binding from a multi-binding shortcut', () => {
    const next = createShortcutCollisionReplacement(
      {},
      'settings-modal',
      'keyboard-help',
      { key: '?' }
    );

    expect(getShortcutBindings('settings-modal', next)).toEqual([{ key: '?', ctrl: false, shift: false, alt: false }]);
    expect(getShortcutBindings('keyboard-help', next)).toEqual([{ key: '/', ctrl: false, shift: true, alt: false }]);
  });

  it('filters shortcut groups by label, category, command id, and binding display', () => {
    const groups = getShortcutGroups({});
    const flatten = (query: string) => filterShortcutGroups(groups, query).flatMap((group) => group.shortcuts);

    expect(filterShortcutGroups(groups, '   ')).toBe(groups);
    expect(flatten('policy').map((shortcut) => shortcut.id)).toEqual([
      'toggle-policy',
      'cycle-policy-metric',
    ]);
    expect(flatten('make-main-branch').map((shortcut) => shortcut.label)).toEqual(['Make current branch main']);
    expect(flatten('ctrl+s').map((shortcut) => shortcut.label)).toEqual(['Save SGF']);
    expect(flatten('ctrl+z').map((shortcut) => shortcut.label)).toEqual(['Undo edit']);
    expect(filterShortcutGroups(groups, 'visualization').map((group) => group.title)).toEqual(['Visualization']);
  });

  it('returns no shortcut groups when a shortcut search has no matches', () => {
    expect(filterShortcutGroups(getShortcutGroups({}), 'zzzz-no-match')).toEqual([]);
  });
});
