import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { commandMatchesQuery, normalizeCommandQuery, scoreCommandMatch } from '../src/utils/commandPalette';

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
