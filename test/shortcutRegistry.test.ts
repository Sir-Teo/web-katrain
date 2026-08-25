import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { EDIT_TOOL_SHORTCUT_DEFINITIONS, SHORTCUT_DEFINITIONS } from '../src/utils/shortcuts';

const handlerSources = [
  'src/hooks/useKeyboardShortcuts.ts',
  'src/components/Layout.tsx',
].map((file) => readFileSync(file, 'utf8')).join('\n');

const describeBinding = (binding: { key: string; ctrl?: boolean; shift?: boolean; alt?: boolean }) =>
  `${binding.ctrl ? 'Ctrl+' : ''}${binding.shift ? 'Shift+' : ''}${binding.alt ? 'Alt+' : ''}${binding.key.toLowerCase()}`;

describe('shortcut registry', () => {
  it('wires every shortcut it advertises', () => {
    // A shortcut listed here shows up in the help dialog and the command
    // palette, so one that never reaches a handler is a control the app
    // promises and then ignores.
    //
    // The edit tools are dispatched by looping over their own array rather
    // than by name, so they are wired as a set — assert that loop is intact
    // instead of looking for 18 literals that are never written out.
    const loopedByTool = handlerSources.includes('for (const shortcut of EDIT_TOOL_SHORTCUT_DEFINITIONS)')
      && handlerSources.includes('matches(shortcut.id)');
    const editToolIds = new Set(EDIT_TOOL_SHORTCUT_DEFINITIONS.map((shortcut) => shortcut.id));

    const unwired = SHORTCUT_DEFINITIONS.filter((shortcut) => {
      if (editToolIds.has(shortcut.id)) return !loopedByTool;
      return !handlerSources.includes(`matches('${shortcut.id}')`)
        && !handlerSources.includes(`eventMatchesShortcut(event, '${shortcut.id}')`);
    }).map((shortcut) => shortcut.id);

    expect(unwired).toEqual([]);
  });

  it('gives each key combination to exactly one shortcut', () => {
    // The handler returns on its first match, so a combination claimed twice
    // silently makes the later shortcut dead depending on source order.
    const owners = new Map<string, string[]>();
    for (const shortcut of SHORTCUT_DEFINITIONS) {
      for (const binding of shortcut.defaultBindings) {
        const combo = describeBinding(binding);
        owners.set(combo, [...(owners.get(combo) ?? []), shortcut.id]);
      }
    }

    const clashes = [...owners].filter(([, ids]) => ids.length > 1);

    expect(clashes).toEqual([]);
  });

  it('checks something — the registry is populated and every id is unique', () => {
    expect(SHORTCUT_DEFINITIONS.length).toBeGreaterThan(50);
    // The edit tools live in their own array and are spread in; if that stops
    // happening the wiring check above would pass by vacuously skipping them.
    expect(EDIT_TOOL_SHORTCUT_DEFINITIONS.length).toBeGreaterThan(0);
    for (const tool of EDIT_TOOL_SHORTCUT_DEFINITIONS) {
      expect(SHORTCUT_DEFINITIONS.some((shortcut) => shortcut.id === tool.id)).toBe(true);
    }
    const ids = SHORTCUT_DEFINITIONS.map((shortcut) => shortcut.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
