import { describe, expect, it } from 'vitest';
import { findShortcutResetCollision } from '../src/utils/shortcuts';

describe('resetting one shortcut', () => {
  it('finds a default that another command has since taken', () => {
    // Toggle children moved to J, then Q given to Pass.
    const overrides = { 'toggle-children': [{ key: 'j' }], pass: [{ key: 'q' }] };
    const clash = findShortcutResetCollision('toggle-children', overrides);
    expect(clash?.conflict.id).toBe('pass');
    expect(clash?.binding).toMatchObject({ key: 'q' });
  });

  it('finds nothing when the defaults are free', () => {
    expect(findShortcutResetCollision('toggle-children', { 'toggle-children': [{ key: 'j' }] })).toBeNull();
    expect(findShortcutResetCollision('toggle-children', {})).toBeNull();
  });
});

describe('continuous analysis', () => {
  it('answers Shift+Space as well, which toggles it without the notice', async () => {
    const { eventMatchesShortcut } = await import('../src/utils/shortcuts');
    const shiftSpace = { key: ' ', code: 'Space', shiftKey: true, ctrlKey: false, altKey: false, metaKey: false } as KeyboardEvent;
    expect(eventMatchesShortcut(shiftSpace, 'continuous-analysis')).toBe(true);
  });
});
