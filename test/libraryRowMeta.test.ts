import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { libraryNameRepeatsPlayers } from '../src/utils/library';
import { tagsFromResult } from '../src/utils/narrativeTags';

describe('libraryNameRepeatsPlayers', () => {
  it('spots the pair an imported record leads with', () => {
    expect(
      libraryNameRepeatsPlayers('Gu Li vs Lee Sedol - 10th LG Cup, semi-final', 'Gu Li', 'Lee Sedol')
    ).toBe(true);
  });

  it('ignores case and surrounding whitespace on the names', () => {
    expect(libraryNameRepeatsPlayers('gu li VS lee sedol', '  Gu Li ', ' Lee Sedol ')).toBe(true);
  });

  it('keeps the meta line when the name says something else', () => {
    expect(libraryNameRepeatsPlayers('Tuesday review', 'Gu Li', 'Lee Sedol')).toBe(false);
    expect(libraryNameRepeatsPlayers('Lee Sedol vs Gu Li', 'Gu Li', 'Lee Sedol')).toBe(false);
  });

  it('keeps the meta line when either player is unknown', () => {
    expect(libraryNameRepeatsPlayers('Gu Li vs White', 'Gu Li', undefined)).toBe(false);
    expect(libraryNameRepeatsPlayers('Black vs Lee Sedol', '  ', 'Lee Sedol')).toBe(false);
  });
});

describe('library file row layout', () => {
  it('stacks the name above the meta line so the name is never squeezed out', () => {
    const styles = readFileSync('src/index.css', 'utf8');

    // Side by side, the meta line refused to shrink (flex-shrink: 0) and the
    // name collapsed to between 0 and 29px in a 320px desktop panel, which is
    // the only part of the row that says which game it is.
    expect(styles).toContain(
      ".library-tree-node[data-library-row='file'] {\n    display: grid;\n    grid-template-columns: auto 16px minmax(0, 1fr) auto auto;\n    grid-template-rows: auto auto;"
    );
    expect(styles).toMatch(
      /\.library-tree-node\[data-library-row='file'\] \.library-tree-node-name \{\s*grid-column: 3;\s*grid-row: 1;/
    );
    expect(styles).toMatch(
      /\.library-tree-node\[data-library-row='file'\] \.library-tree-node-meta \{\s*grid-column: 3;\s*grid-row: 2;[^}]*text-overflow: ellipsis;/
    );
    // The hover actions and the unsaved badge keep their own columns rather
    // than wrapping onto the meta line.
    expect(styles).toMatch(
      /\.library-tree-node\[data-library-row='file'\] \.library-dirty-indicator \{\s*grid-column: 4;\s*grid-row: 1 \/ 3;/
    );
    expect(styles).toMatch(
      /\.library-tree-node\[data-library-row='file'\] \.library-tree-node-actions \{\s*grid-column: 5;\s*grid-row: 1 \/ 3;/
    );
  });
});

describe('the result in a library row', () => {
  const panel = readFileSync('src/components/LibraryPanel.tsx', 'utf8');

  it('prints the result, which the row stored and never showed', () => {
    // `extractLibraryMetadata` has always read RE into `metadata.result`, and
    // the row only ever fed it to `tagsFromResult`. Measured on a saved game:
    // "Game 8 - 2026-09-03 - 10 moves - 0.2 KB", with no sign of who won.
    expect(panel).toContain("{item.metadata.result ? `${item.metadata.result} · ` : ''}");
  });

  it('drops only the tags that restate the result', () => {
    // A plain margin produces no tag at all, which is why an ordinary game
    // showed nothing: the row depended entirely on the narrative chips.
    expect(tagsFromResult('W+7.0')).toEqual([]);
    // These three say what the result string already says.
    expect(tagsFromResult('W+R').map((tag) => tag.id)).toEqual(['resign']);
    expect(tagsFromResult('W+T').map((tag) => tag.id)).toEqual(['time']);
    expect(tagsFromResult('0').map((tag) => tag.id)).toEqual(['draw']);
    expect(panel).toContain("const RESULT_RESTATING_TAGS = new Set(['resign', 'time', 'draw'])");
    expect(panel).toContain('RESULT_RESTATING_TAGS.has(tag.id)');
  });

  it('keeps the tags that add something the result does not say', () => {
    const wide = tagsFromResult('B+40.5').map((tag) => tag.id);
    expect(wide).toContain('blowout');
    // and the filter must not reach them
    for (const id of wide) expect(['resign', 'time', 'draw']).not.toContain(id);
  });
});

describe('a truncated row name stays readable', () => {
  const panel = readFileSync('src/components/LibraryPanel.tsx', 'utf8');

  it('labels both kinds of row for a mouse, not only for a screen reader', () => {
    // Measured in the browser at the panel's default width: the name box is
    // 191px and a tournament title lays out at 411-462px, so more than half of
    // it is off the end with no way to read the rest. The row's aria-label
    // always carried the full name; hovering it gave nothing.
    const named = [...panel.matchAll(/<div className="library-tree-node-name"([^>]*)>/g)];

    expect(named.length, 'expected a file row and a folder row').toBe(2);
    for (const [, attributes] of named) {
      expect(attributes, 'a row name with no title truncates unreadably').toContain('title={item.name}');
    }
  });
});
