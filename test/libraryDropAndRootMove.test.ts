import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('src/components/LibraryPanel.tsx', 'utf8');
const body = (marker: string, length = 600) => source.slice(source.indexOf(marker), source.indexOf(marker) + length);

describe('library drops and moves to Root', () => {
  it('keeps a drop on a folder row from reaching the root and panel drops too', () => {
    // Bubbling on, a game dropped on a folder was moved back out to Root, and
    // a dropped file was imported twice.
    expect(body('const handleDropOnFolder')).toContain('event.stopPropagation();');
    expect(body('const handleRootDrop')).toContain('event.stopPropagation();');
  });

  it('moves to Root through the shared move, which keeps names unique', () => {
    expect(body('const handleMoveToRoot')).toContain('moveLibraryItems(prev, [item.id], null)');
    expect(source).not.toMatch(/item\.id === draggingId \? \{ \.\.\.item, parentId: null/);
  });
});
