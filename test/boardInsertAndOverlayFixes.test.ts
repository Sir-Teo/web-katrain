import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const board = readFileSync('src/components/GoBoard.tsx', 'utf8');
const memoDeps = (name: string) => {
  const start = board.indexOf(`const ${name} = useMemo(`);
  expect(start, name).toBeGreaterThan(-1);
  const end = board.indexOf(']);', start);
  return board.slice(start, end);
};

describe('board overlays follow in-place tree changes', () => {
  it('recomputes the swing wash when analysis lands on the same node', () => {
    const block = memoDeps('territorySwing');
    expect(block).toContain('treeVersion,');
    expect(block).toContain('visibleAnalysis,');
  });

  it('redraws next-move rings when Add PV adds a child to this node', () => {
    expect(memoDeps('childMoveRings')).toContain('settings.analysisShowChildren, treeVersion');
    expect(memoDeps('childMoveCoords')).toContain('[currentNode, treeVersion');
  });
});

describe('board input while inserting or selecting a region', () => {
  it('refuses wheel and swipe forward navigation mid-insert', () => {
    expect(board).toContain("if (action !== 'back' && refuseNavigationWhileInserting()) return;");
    expect(board).toMatch(/if \(action === 'next'\) \{\s*if \(refuseNavigationWhileInserting\(\)\) return;/);
  });

  it('does not play a stone from the keyboard cursor while a region is being selected', () => {
    const handler = board.slice(board.indexOf('const handleBoardKeyDown'));
    const enter = handler.indexOf("if (event.key !== 'Enter' && event.key !== ' ') return;");
    const guard = handler.indexOf('if (isSelectingRegionOfInterest) return;');
    expect(guard).toBeGreaterThan(enter);
    expect(guard).toBeLessThan(handler.indexOf('if (scoringMode) {', enter));
  });

  it('refuses the mistake keys mid-insert', () => {
    const shortcuts = readFileSync('src/hooks/useKeyboardShortcuts.ts', 'utf8');
    expect(shortcuts).toMatch(/matches\('prev-mistake'\)\) \{\s*e\.preventDefault\(\);[\s\S]{0,200}if \(isInsertMode\) \{\s*toast\('Finish inserting before navigating\.', 'error'\);/);
  });
});
