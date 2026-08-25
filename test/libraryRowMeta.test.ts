import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { libraryNameRepeatsPlayers } from '../src/utils/library';

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
