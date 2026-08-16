import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  MAX_RECENT_COMMANDS,
  RECENT_COMMANDS_STORAGE_KEY,
  addRecentCommandId,
  commandMatchesQuery,
  normalizeCommandQuery,
  orderCommandsByRecency,
  readRecentCommandIds,
  scoreCommandMatch,
  writeRecentCommandIds,
} from '../src/utils/commandPalette';

describe('command palette search', () => {
  const saveCopyParts = [
    'Save copy to library',
    'File',
    'save-library',
    'Ctrl+Shift+S',
    'archive',
    'collection',
  ];

  it('normalizes surrounding whitespace and case', () => {
    expect(normalizeCommandQuery('  Save Copy  ')).toBe('save copy');
  });

  it('matches multi-word queries in any order', () => {
    expect(commandMatchesQuery(saveCopyParts, 'library save')).toBe(true);
    expect(commandMatchesQuery(saveCopyParts, 'collection copy')).toBe(true);
  });

  it('matches shortcuts whether users include plus signs or spaces', () => {
    expect(commandMatchesQuery(saveCopyParts, 'ctrl+shift+s')).toBe(true);
    expect(commandMatchesQuery(saveCopyParts, 'ctrl shift s')).toBe(true);
  });

  it('requires every query token to match', () => {
    expect(commandMatchesQuery(saveCopyParts, 'save photo')).toBe(false);
  });

  it('scores label hits before incidental keyword matches', () => {
    const shapeCoach = scoreCommandMatch({
      id: 'toggle-shape-coach',
      label: 'Show Shape Coach',
      category: 'Analysis',
      keywords: ['pattern', 'study'],
    }, 'shape');
    const fastDepth = scoreCommandMatch({
      id: 'set-live-mcts-depth-16',
      label: 'Set live MCTS depth: Fast',
      category: 'Analysis',
      keywords: ['Quick shape checks with minimal waiting.'],
    }, 'shape');

    expect(shapeCoach).not.toBeNull();
    expect(fastDepth).not.toBeNull();
    expect(shapeCoach!).toBeLessThan(fastDepth!);
  });

  it('keeps shortcut hits ranked as strong direct matches', () => {
    const shortcutScore = scoreCommandMatch({
      id: 'save-library',
      label: 'Save copy to library',
      category: 'File',
      shortcut: 'Ctrl+Shift+S',
      keywords: ['archive', 'collection'],
    }, 'ctrl shift s');
    const keywordScore = scoreCommandMatch({
      id: 'toggle-shortcut-display',
      label: 'Show shortcut labels',
      category: 'View',
      keywords: ['ctrl shift s'],
    }, 'ctrl shift s');

    expect(shortcutScore).not.toBeNull();
    expect(keywordScore).not.toBeNull();
    expect(shortcutScore!).toBeLessThan(keywordScore!);
  });

  it('exposes Shape Coach as a searchable learning command', () => {
    const source = readFileSync('src/components/Layout.tsx', 'utf8');

    expect(source).toContain("id: 'toggle-shape-coach'");
    expect(source).toContain("label: shapeCoachEnabled ? 'Hide Shape Coach' : 'Show Shape Coach'");
    expect(source).toContain("'move names'");
    expect(source).toContain("'joseki'");
    expect(source).toContain("'sensei'");
  });
});

describe('command palette recency', () => {
  // This suite runs without a DOM, and the storage helpers fall back to a
  // localStorage defined on globalThis, so a tiny in-memory one is enough.
  const store = new Map<string, string>();
  beforeEach(() => {
    store.clear();
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => void store.set(key, value),
        removeItem: (key: string) => void store.delete(key),
      },
    });
  });

  it('keeps the most recent command first and drops duplicates', () => {
    expect(addRecentCommandId('b', ['a'])).toEqual(['b', 'a']);
    expect(addRecentCommandId('a', ['b', 'a', 'c'])).toEqual(['a', 'b', 'c']);
  });

  it('remembers only a handful, oldest falling off', () => {
    let ids: string[] = [];
    for (const id of ['a', 'b', 'c', 'd', 'e', 'f']) ids = addRecentCommandId(id, ids);

    expect(ids).toHaveLength(MAX_RECENT_COMMANDS);
    expect(ids[0]).toBe('f');
    expect(ids).not.toContain('a');
  });

  it('round-trips through storage', () => {
    writeRecentCommandIds(['x', 'y']);
    expect(readRecentCommandIds()).toEqual(['x', 'y']);
  });

  it('survives corrupt stored data', () => {
    store.set(RECENT_COMMANDS_STORAGE_KEY, '{not json');
    expect(readRecentCommandIds()).toEqual([]);

    store.set(RECENT_COMMANDS_STORAGE_KEY, '{"a":1}');
    expect(readRecentCommandIds()).toEqual([]);
  });

  it('lifts recent commands to the front, keeping the rest in order', () => {
    const commands = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];

    expect(orderCommandsByRecency(commands, ['c', 'a']).map((c) => c.id)).toEqual(['c', 'a', 'b', 'd']);
  });

  it('leaves the list alone when nothing has been used yet', () => {
    const commands = [{ id: 'a' }, { id: 'b' }];

    expect(orderCommandsByRecency(commands, []).map((c) => c.id)).toEqual(['a', 'b']);
  });

  it('skips a remembered command that is not currently available', () => {
    const commands = [{ id: 'a' }, { id: 'b' }];

    expect(orderCommandsByRecency(commands, ['gone', 'b']).map((c) => c.id)).toEqual(['b', 'a']);
  });
});
