import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('RightPanel layout', () => {
  it('keeps bottom content from ending flush against the viewport', () => {
    const source = readFileSync('src/components/layout/RightPanel.tsx', 'utf8');

    expect(source).toContain('flex-1 min-h-0 overflow-y-auto overscroll-contain pb-3');
  });

  it('keeps the standalone mobile tree open without repeating its workspace title', () => {
    const source = readFileSync('src/components/layout/RightPanel.tsx', 'utf8');

    expect(source).toContain('open: isMobile || modePanels.treeOpen');
    expect(source).toContain('hideHeader: isMobile');
    expect(source).toContain("isMobile && activeMobileTab === 'tree' ? (");
    expect(source).toContain('actions: isMobile ? undefined : treeViewControls');
    expect(source).toContain("isMobile ? 'hidden' : 'flex-1'");
  });

  it('centers the current move and keeps list rows tappable on mobile', () => {
    const source = readFileSync('src/components/layout/RightPanel.tsx', 'utf8');

    expect(source).toContain("activeMobileTab !== 'tree' || treeView !== 'list'");
    expect(source).toContain("scrollIntoView({ block: 'center' })");
    expect(source).toContain('ref={isCurrent ? currentTreeListItemRef : undefined}');
    expect(source).toContain("isMobile ? 'min-h-11 px-3 py-2' : 'px-2 py-1'");
  });

  it('lays the mobile move list out two moves per row', () => {
    const source = readFileSync('src/components/layout/RightPanel.tsx', 'utf8');
    const css = readFileSync('src/index.css', 'utf8');

    expect(source).toContain("isMobile ? 'move-tree-list-split' : 'divide-y divide-[var(--ui-border)]'");
    // Move-less nodes would flip the black-left/white-right rhythm of the split.
    expect(source).toContain("isMobile && !move ? 'move-tree-list-split-full' : ''");
    expect(source).toContain('move-tree-empty-state move-tree-list-split-full');
    expect(css).toContain('.move-tree-list-split {');
    expect(css).toContain('grid-template-columns: 1fr 1fr;');
    expect(css).toContain('.move-tree-list-split-full {');
  });

  it('uses strict integer draft parsing for branch number edits', () => {
    const source = readFileSync('src/components/layout/RightPanel.tsx', 'utf8');

    expect(source).toContain("import { parseIntegerDraft } from '../../utils/numberDraft'");
    expect(source).toContain('const parsed = parseIntegerDraft(branchIndexDraft)');
    expect(source).not.toContain('Number.parseInt(branchIndexDraft.trim()');
    expect(source).toMatch(/type="number"[\s\S]{0,420}aria-label="Branch number"/);
  });

  it('does not present dead tree navigation actions', () => {
    const source = readFileSync('src/components/layout/RightPanel.tsx', 'utf8');

    expect(source).toContain('disabled={isInsertMode || !currentNode.parent}');
    expect(source).toContain('disabled={isInsertMode || currentNode.children.length === 0}');
    // The band only earns its 57px once it carries branch controls; the two
    // move-navigation buttons ride in the phone header's spare width instead.
    expect(source).toContain("{(isMobile ? branchInfo.hasBranches : treeListNodes.length > 1) && (");
    expect(source).toContain('{!isMobile && treeNavButtons}');
    expect(source).toContain('{treeListNodes.length > 1 ? (');
    expect(source).toContain("const branchToolbarActionClass = branchInfo.hasBranches ? 'panel-icon-button' : 'hidden';");
    expect(source).toContain("branchInfo.hasBranches && branchInfo.currentIndex > 1 ? 'panel-icon-button' : 'hidden'");
  });

  it('uses current-line step numbers for setup-only positions', () => {
    const source = readFileSync('src/components/layout/RightPanel.tsx', 'utf8');
    const notesSource = readFileSync('src/components/NotesPanel.tsx', 'utf8');

    expect(source).toContain('getCurrentLineMoveNumber');
    expect(source).toContain('currentMoveNumber={currentMoveNumber}');
    expect(source).not.toContain('currentMoveNumber={moveHistory.length}');
    expect(source).not.toContain('moveHistory: Move[]');
    expect(notesSource).toContain('const depth = getCurrentLineMoveNumber(currentNode)');
    expect(notesSource).not.toContain('const depth = currentNode.gameState.moveHistory.length');
  });


  it('marks the current move for assistive tech, not just with colour', () => {
    const panel = readFileSync('src/components/layout/RightPanel.tsx', 'utf8');
    const tree = readFileSync('src/components/MoveTree.tsx', 'utf8');

    // Both move lists highlighted the current entry with background and text
    // colour alone, so in a list of a few hundred identically-named buttons a
    // screen reader had no way to say which one you were on. The SVG tree
    // already marks its own current node this way.
    expect(tree).toContain("aria-current={isCurrent ? 'true' : undefined}");
    const marks = panel.match(/aria-current=\{isCurrent \? 'true' : undefined\}/g) ?? [];
    expect(marks).toHaveLength(2);

    // Each one sits on a button that also carries the colour highlight.
    const highlights = panel.match(/isCurrent \? 'bg-\[var\(--ui-accent-soft\)\]/g) ?? [];
    expect(highlights).toHaveLength(2);
  });
});
