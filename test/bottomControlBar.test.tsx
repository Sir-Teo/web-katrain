import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { BottomControlBar } from '../src/components/layout/BottomControlBar';
import type { BranchInfo } from '../src/utils/branchNavigation';

const noop = () => undefined;
const branchInfo: BranchInfo = {
  hasBranches: true,
  currentIndex: 2,
  totalBranches: 3,
  depthFromBranchRoot: 1,
  isAtFork: false,
};

const baseProps = {
  passTurn: noop,
  navigateBack: noop,
  navigateForward: noop,
  navigateToMove: noop,
  navigateStart: noop,
  navigateEnd: noop,
  branchInfo,
  switchBranch: noop,
  switchToBranchIndex: noop,
  findMistake: noop,
  rotateBoard: noop,
  currentPlayer: 'black' as const,
  moveHistory: [{ x: 3, y: 3, player: 'black' as const }],
  totalMovesInCurrentLine: 12,
  boardSize: 19,
  handicap: 0,
  isInsertMode: false,
  passPolicyColor: null,
  passPv: null,
  jumpBack: noop,
  jumpForward: noop,
};

describe('BottomControlBar', () => {
  it('shows Kaya-style branch navigation beside the desktop move counter', () => {
    const html = renderToStaticMarkup(<BottomControlBar {...baseProps} isMobile={false} />);

    expect(html).toContain('data-bottom-branch-control="true"');
    expect(html).toContain('Previous branch');
    expect(html).toContain('Next branch');
    expect(html).toContain('Branch');
    expect(html).toContain('2/3');
    expect(html).toContain('+1');
  });

  it('keeps a compact branch chip reachable on mobile', () => {
    const html = renderToStaticMarkup(<BottomControlBar {...baseProps} isMobile={true} />);

    expect(html).toContain('data-bottom-branch-chip="true"');
    expect(html).toContain('Br');
    expect(html).toContain('2/3');
    expect(html).toContain('+1');
  });

  it('uses compact recovery save status on mobile', () => {
    const html = renderToStaticMarkup(
      <BottomControlBar
        {...baseProps}
        isMobile={true}
        unsavedChanges={true}
        autoSaveStatus={{ state: 'saved', savedAt: Date.UTC(2026, 0, 1, 12, 30) }}
      />,
    );

    expect(html).toContain('data-mobile-save-status="true"');
    expect(html).toContain('data-mobile-save-state="saved"');
    expect(html).toContain('Recovery copy saved at');
    expect(html).toContain('still unsaved until you save to Library or download SGF');
  });
});
