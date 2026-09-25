import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { useGameStore } from '../src/store/gameStore';
import { parseSgf } from '../src/utils/sgf';
import { getBranchInfo, isOnMainLine } from '../src/utils/branchNavigation';

const read = (path: string) => readFileSync(path, 'utf8');

describe('isOnMainLine', () => {
  it('looks at every fork on the way up, not only the nearest', () => {
    useGameStore.getState().loadGame(parseSgf('(;GM[1]SZ[9](;B[cc];W[gg])(;B[ee](;W[cc])(;W[gg])))'));
    const root = useGameStore.getState().rootNode;
    const offMain = root.children[1]!.children[0]!; // W[cc] under B[ee]

    // First at its own fork, yet off the main line at the root.
    expect(getBranchInfo(offMain).currentIndex).toBe(1);
    expect(isOnMainLine(offMain)).toBe(false);
    expect(isOnMainLine(root.children[0]!.children[0]!)).toBe(true);
    expect(isOnMainLine(root)).toBe(true);
  });

  it('decides where Make main branch is offered', () => {
    expect(read('src/components/layout/RightPanel.tsx')).toContain("const promoteBranchActionClass = isMainLine ? 'hidden' : 'panel-icon-button';");
    expect(read('src/components/dashboard/DesktopDashboard.tsx')).toContain('{!isOnMainLine(currentNode) ? (');
    const layout = read('src/components/Layout.tsx');
    expect(layout).toContain("disabledReason: isOnMainLine(currentNode) ? 'Current line is already main' : undefined,");
    expect(layout).toContain("disabledReason: isOnMainLine(currentNode) ? 'Already on the main branch' : undefined,");
  });
});

describe('desktop dashboard', () => {
  it('refuses navigation while inserting, as the keyboard does', () => {
    const layout = read('src/components/Layout.tsx');
    const dashboard = layout.slice(layout.indexOf('<DesktopDashboard'), layout.indexOf('onLessons=', layout.indexOf('<DesktopDashboard')));

    for (const prop of ['navigateForward', 'navigateStart', 'navigateEnd', 'navigateToMove', 'switchBranch', 'undoToBranchPoint', 'makeCurrentNodeMainBranch']) {
      expect(dashboard, prop).toContain(`${prop}={insertGuarded(${prop})}`);
    }
    expect(dashboard).toContain('jumpForward={insertGuarded(() => jumpForward(10))}');
  });

  it('scrolls the tree inside its own scroller so Center current move works', () => {
    const css = read('src/components/dashboard/dashboard.css');

    expect(css).toContain('.wk-dashboard .tree-region { padding: 8px 10px; overflow: hidden; }');
    expect(css).toContain('.wk-dashboard .tree-region .move-tree-shell { max-height: 224px; }');
  });

  it('recomputes the Swing tooltip when analysis lands on the same node', () => {
    const source = read('src/components/dashboard/DesktopDashboard.tsx');

    expect(source).toContain('}, [boardSize, currentNode, settings.analysisSwingCompare, treeVersion]);');
  });
});

describe('phone branch-number editor', () => {
  it('hands focus back to the chip after Enter or Escape', () => {
    const source = read('src/components/layout/RightPanel.tsx');

    expect(source).toContain('restoreFocusIfUnclaimed(branchIndexChipRef.current)');
    expect(source).toContain('ref={branchIndexChipRef}');
  });
});
