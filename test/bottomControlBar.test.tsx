import { readFileSync } from 'node:fs';
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
  currentMoveNumber: 1,
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
  // The sheet's contents only exist once it is opened, and these render
  // statically, so this reads the source the way the sibling sheet tests do.
  it('offers play-on-from-here in the mobile sheet, labelled by the engine colour', () => {
    const componentSource = readFileSync('src/components/layout/BottomControlBar.tsx', 'utf8');

    expect(componentSource).toContain('{onPlayFromHere && (');
    expect(componentSource).toContain('aria-pressed={!!engineOpponent}');
    // Labelled by the colour the engine holds, not by the side to move: while
    // it is thinking those are the same and the label would lie. It lives in
    // the title now -- see the length rule below.
    expect(componentSource).toContain("`Stop the engine playing ${engineOpponent === 'black' ? 'Black' : 'White'}`");
  });

  it('keeps the sheet label short enough not to wrap its row', () => {
    const componentSource = readFileSync('src/components/layout/BottomControlBar.tsx', 'utf8');
    const entry = /\{onPlayFromHere && \([\s\S]{0,1600}?<\/button>/.exec(componentSource)?.[0] ?? '';
    const label = /\{engineOpponent \? '([^']+)' : '([^']+)'\}/.exec(entry);

    expect(label, 'the sheet label moved').not.toBeNull();
    /**
     * This grid is two 169px columns at 360px wide, and the row is `min-h-12`,
     * so a label that wraps to a second line grows its own row *and its row
     * partner* from 48px to 60px -- which is what the viewport check calls a
     * ragged sheet. Both states have to stay inside one line; the sentence
     * belongs in the title, which is asserted above.
     */
    for (const text of [label![1]!, label![2]!]) {
      expect(text.length, `"${text}" is long enough to wrap the row`).toBeLessThanOrEqual(18);
    }
    expect(entry).toContain('title={engineOpponent');
  });

  it('leaves the sheet entry out when the host does not supply the action', () => {
    const componentSource = readFileSync('src/components/layout/BottomControlBar.tsx', 'utf8');
    // Guarded like its neighbours, so a host that does not pass the action -- a
    // problem or tsumego shell -- does not get a dead row.
    expect(componentSource).toMatch(/\{onPlayFromHere && \([\s\S]{0,1400}Play from here/);
  });

  it('shows Kaya-style branch navigation beside the desktop move counter', () => {
    const html = renderToStaticMarkup(<BottomControlBar {...baseProps} isMobile={false} />);

    expect(html).toContain('data-bottom-branch-control="true"');
    expect(html).toContain('Previous branch');
    expect(html).toContain('Next branch');
    expect(html).toContain('Branch');
    expect(html).toContain('2/3');
    expect(html).toContain('+1');
  });

  it('uses strict integer draft parsing for editable move and branch numbers', () => {
    const componentSource = readFileSync('src/components/layout/BottomControlBar.tsx', 'utf8');

    expect(componentSource).toContain("import { parseIntegerDraft } from '../../utils/numberDraft'");
    expect(componentSource).toContain('const parsed = parseIntegerDraft(moveNumberDraft)');
    expect(componentSource).toContain('const parsed = parseIntegerDraft(branchIndexDraft)');
    expect(componentSource).not.toContain('Number.parseInt(moveNumberDraft.trim()');
    expect(componentSource).not.toContain('Number.parseInt(branchIndexDraft.trim()');
    expect(componentSource).toMatch(/type="number"[\s\S]{0,420}aria-label="Branch number"/);
    expect(componentSource.match(/type="number"[\s\S]{0,420}aria-label="Move number"/g) ?? []).toHaveLength(2);
  });

  it('keeps a compact branch chip reachable on mobile', () => {
    const html = renderToStaticMarkup(<BottomControlBar {...baseProps} isMobile={true} />);

    expect(html).toContain('data-bottom-branch-chip="true"');
    expect(html).toContain('aria-label="More controls"');
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toContain('aria-expanded="false"');
    // Closed, so the more-controls sheet is not in the DOM: no dangling IDREF.
    expect(html).not.toMatch(/aria-controls=/);
    expect(html).toContain('Br');
    expect(html).toContain('2/3');
    expect(html).toContain('+1');
  });

  it('prioritizes the move jump target when the mobile control bar gets narrow', () => {
    const html = renderToStaticMarkup(<BottomControlBar {...baseProps} isMobile={true} />);
    const css = readFileSync('src/index.css', 'utf8');
    const componentSource = readFileSync('src/components/layout/BottomControlBar.tsx', 'utf8');

    expect(html).toContain('mobile-bottom-controls');
    expect(html).toContain('data-mobile-turn-chip="true"');
    expect(html).toContain('mobile-bottom-move-button');
    expect(componentSource).toContain('mobile-bottom-move-total');
    expect(html).toContain('aria-label="Move 1 of 12. Tap to jump to a move."');
    expect(css).toMatch(/@media \(max-width: 430px\)[\s\S]*\.mobile-bottom-board-size[\s\S]*display: none/);
    expect(css).toContain(".mobile-bottom-meta [data-bottom-branch-chip='true']");
    expect(css).not.toContain(".mobile-bottom-meta:has([data-mobile-save-status='true']) .mobile-bottom-turn-chip");
    expect(css).toMatch(/@media \(max-width: 380px\)[\s\S]*\.mobile-bottom-meta \[data-mobile-save-status='true'\][\s\S]*display: none/);
    expect(css).toMatch(/@media \(max-height: 520px\) and \(orientation: landscape\)[\s\S]*\.mobile-bottom-dock \.mobile-bottom-current-player,[\s\S]*display: none/);
    expect(css).toContain(".mobile-bottom-dock .mobile-bottom-meta [data-bottom-branch-chip='true']");
    expect(css).toMatch(/\.mobile-bottom-move-editor \{[^}]*min-width: 72px;[^}]*white-space: nowrap;/);
    expect(componentSource).toContain('mobile-bottom-overflow-mode-actions');
    expect(componentSource).toContain('Score position</div>');
    expect(css).toMatch(/@media \(max-width: 340px\)[\s\S]*\.mobile-bottom-mode-actions \{[^}]*display: none !important;[\s\S]*\.mobile-bottom-overflow-mode-actions \{[^}]*display: grid;/);
  });

  it('keeps the compact turn stone large and outlined enough to read on dark bars', () => {
    const css = readFileSync('src/index.css', 'utf8');

    expect(css).toMatch(/\.mobile-bottom-stone \{[^}]*width: 13px;[^}]*height: 13px;[^}]*border: 1px solid transparent;/);
    expect(css).toMatch(/\.mobile-bottom-stone-black \{[^}]*border-color: color-mix\(in srgb, var\(--ui-text-muted\) 72%, transparent\);/);
  });

  it('keeps keyboard focus and a full-size close target inside the mobile More Controls sheet', () => {
    const componentSource = readFileSync('src/components/layout/BottomControlBar.tsx', 'utf8');
    const css = readFileSync('src/index.css', 'utf8');

    expect(componentSource).toContain('const moreSheetRef = useRef<HTMLDivElement>(null)');
    expect(componentSource).toContain("if (event.key !== 'Tab' || event.defaultPrevented) return");
    expect(componentSource).toContain("document.addEventListener('keydown', onKeyDown, true)");
    expect(componentSource).toContain('last.focus({ preventScroll: true })');
    expect(componentSource).toContain('first.focus({ preventScroll: true })');
    expect(componentSource).toMatch(/data-bottom-more-close="true"[\s\S]{0,220}min-h-11 min-w-11/);
    expect(componentSource).toContain("closeMoreControls(event.detail === 0 ? 'keyboard' : 'pointer')");
    expect(componentSource).toContain('const closeMoreControlsFromAction = React.useCallback');
    expect(componentSource.match(/closeMoreControlsFromAction\(event\)/g) ?? []).toHaveLength(15);
    expect(componentSource.match(/setMoreOpen\(false\)/g) ?? []).toHaveLength(1);
    expect(componentSource).toContain("data-bottom-more-focus-origin={suppressMoreTriggerFocusRing ? 'pointer' : 'keyboard'}");
    expect(componentSource).toContain('suppressFocusTooltip={suppressMoreTriggerFocusRing}');
    expect(css).toMatch(/\.mobile-more-trigger-pointer-focus:focus-visible\s*\{[^}]*outline: none;/);
  });

  it('keeps the mobile More Controls sheet compact without shrinking touch targets', () => {
    const componentSource = readFileSync('src/components/layout/BottomControlBar.tsx', 'utf8');
    const css = readFileSync('src/index.css', 'utf8');

    expect(componentSource).toContain('data-bottom-more-grid="true"');
    expect(componentSource).toContain('className="grid grid-cols-2 gap-1.5 p-2"');
    expect(componentSource).toContain("const mobileMoreActionClass = 'w-full min-h-12 px-2.5 py-2");
    expect(componentSource).toContain('className="col-span-2 h-px bg-[var(--ui-border)] mx-2 my-1"');
    expect(componentSource).toContain('<div className="flex-1 font-medium">Rotate board</div>');
    expect(componentSource).not.toContain('px-4 py-3.5 text-left');
    expect(css).toMatch(/@media \(max-height: 520px\) and \(orientation: landscape\)[\s\S]*\[data-bottom-more-grid='true'\][\s\S]*grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
    expect(css).toMatch(/\[data-bottom-more-grid='true'\] > button:nth-last-of-type\(2\),[\s\S]{0,140}> button:last-of-type \{[^}]*grid-column: span 2;/);
  });

  it('disables mistake navigation when the current line has no target', () => {
    const html = renderToStaticMarkup(
      <BottomControlBar
        {...baseProps}
        isMobile={false}
        canFindPreviousMistake={false}
        canFindNextMistake={false}
      />,
    );

    expect(html).toContain('aria-label="No previous analyzed mistake"');
    expect(html).toContain('aria-label="No next analyzed mistake"');
    expect(html.match(/disabled=""/g) ?? []).toHaveLength(2);
  });

  it('disables history controls at the current-line boundaries', () => {
    const html = renderToStaticMarkup(
      <BottomControlBar
        {...baseProps}
        isMobile={false}
        canNavigateBack={false}
        canNavigateForward={false}
      />,
    );

    for (const label of ['Start', 'Back 10', 'Back', 'Forward', 'Forward 10', 'End']) {
      expect(html).toContain(`aria-label="${label}" disabled=""`);
    }

    const source = readFileSync('src/components/layout/BottomControlBar.tsx', 'utf8');
    expect(source).toMatch(/onUndo\(\);[\s\S]{0,120}disabled=\{!canNavigateBack\}[\s\S]{0,120}No move to undo/);
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


  it('puts the mobile control bar in a named landmark', () => {
    const html = renderToStaticMarkup(<BottomControlBar {...baseProps} isMobile={true} />);

    // The bar is fixed outside <main>, so without this it was the only cluster
    // of controls on mobile sitting in no landmark at all — 7 of 25 controls
    // unreachable by landmark navigation, where desktop had 0 of 51.
    expect(html).toContain('role="region"');
    expect(html).toContain('aria-label="Board controls"');
  });
});
