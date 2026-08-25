import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const modalSources = [
  { path: 'src/components/AboutDialog.tsx', titleId: 'about-title', escape: 'useEscapeToClose(onClose)' },
  {
    path: 'src/components/AnalysisCacheClearConfirmModal.tsx',
    titleId: 'analysis-cache-clear-title',
    escape: "window.addEventListener('keydown', handleKeyDown, true)",
  },
  { path: 'src/components/AutoSaveRecoveryModal.tsx', titleId: 'auto-save-recovery-title', escape: 'useEscapeToClose(onDismiss)' },
  { path: 'src/components/CommandPaletteModal.tsx', titleId: 'command-palette-title', escape: 'useEscapeToClose(onClose)' },
  { path: 'src/components/PasteSgfModal.tsx', titleId: 'paste-sgf-title', escape: 'useEscapeToClose(onClose)' },
  { path: 'src/components/GameAnalysisModal.tsx', titleId: 'game-analysis-title', escape: 'useEscapeToClose(onClose)' },
  { path: 'src/components/GameReportModal.tsx', titleId: 'game-report-title', escape: 'useEscapeToClose(onClose, !showReportGuide)' },
  { path: 'src/components/KeyboardHelpModal.tsx', titleId: 'keyboard-help-title', escape: 'useEscapeToClose(onClose)' },
  { path: 'src/components/LibraryPanel.tsx', titleId: 'library-text-dialog-title', escape: 'useEscapeToClose(onClose)' },
  { path: 'src/components/LibraryPanel.tsx', titleId: 'library-confirm-dialog-title', escape: 'useEscapeToClose(onClose)' },
  { path: 'src/components/NewGameModal.tsx', titleId: 'new-game-title', escape: 'useEscapeToClose(onClose)' },
  { path: 'src/components/PhotoBoardModal.tsx', titleId: 'photo-board-title', escape: 'useEscapeToClose(onClose, !cameraCaptureOpen)' },
  { path: 'src/components/CameraCaptureModal.tsx', titleId: 'camera-capture-title', escape: 'useEscapeToClose(handleClose)' },
  {
    path: 'src/components/ResignConfirmModal.tsx',
    titleId: 'resign-confirm-title',
    escape: "window.addEventListener('keydown', handleKeyDown, true)",
  },
  { path: 'src/components/SaveToLibraryDialog.tsx', titleId: 'save-to-library-title', escape: 'useEscapeToClose(onClose, open && !saving)' },
  { path: 'src/components/SettingsModal.tsx', titleId: 'settings-title', escape: 'useEscapeToClose(onClose)' },
  { path: 'src/components/UnsavedChangesModal.tsx', titleId: 'unsaved-changes-title', escape: "useEscapeToClose(() => onChoice('cancel'))" },
  { path: 'src/components/layout/MenuDrawer.tsx', titleId: 'menu-title', escape: 'useEscapeToClose(onClose, open)' },
  { path: 'src/components/MobileHome.tsx', titleId: 'mobile-home-title', escape: 'useEscapeToClose(onClose, open)' },
] as const;

describe('modal accessibility semantics', () => {
  it('keeps high-use modals labeled and dismissible by Escape', () => {
    for (const modal of modalSources) {
      const source = readFileSync(modal.path, 'utf8');

      expect(source, modal.path).toContain('role="dialog"');
      expect(source, modal.path).toContain('aria-modal="true"');
      expect(source, modal.path).toContain(`aria-labelledby="${modal.titleId}"`);
      expect(source, modal.path).toContain(modal.escape);
    }
  });

  it('sizes mobile modal surfaces against the dynamic viewport', () => {
    const responsiveSurfaces = [
      'src/components/CommandPaletteModal.tsx',
      'src/components/GuessMoveModal.tsx',
      'src/components/KifuPrintModal.tsx',
      'src/components/LessonsModal.tsx',
      'src/components/NewGameModal.tsx',
      'src/components/PhotoBoardModal.tsx',
      'src/components/ProGamesModal.tsx',
      'src/components/ProblemModal.tsx',
      'src/components/ScoreQuizModal.tsx',
      'src/components/TournamentModal.tsx',
    ];

    for (const path of responsiveSurfaces) {
      expect(readFileSync(path, 'utf8'), path).toContain('dvh]');
    }
  });

  it('keeps the Print Kifu header actions reachable on narrow screens', () => {
    const source = readFileSync('src/components/KifuPrintModal.tsx', 'utf8');

    expect(source).toContain('flex flex-col items-stretch gap-3');
    expect(source).toContain('sm:flex-row sm:items-center sm:justify-between');
    expect(source).toContain('absolute right-3 top-3');
    expect(source).toContain("const printActionLabel = canPrint ? 'Print kifu or save as PDF' : 'No moves to print';");
    expect(source).toContain('aria-label={printActionLabel}');
    expect(source).toContain('<span className="hidden lg:inline">Print / PDF</span>');
    expect(source).toContain('<span className="sm:hidden">All</span>');
    expect(source).toContain('<span className="hidden sm:inline">{opt.label}</span>');
    expect(source).toContain('<span className="sr-only">Print Kifu: </span>');
  });

  it('moves focus into dialogs that use the shared focus hook and wraps Tab inside them', () => {
    // aria-modal="true" only marks the rest of the page inert for assistive tech;
    // it does not stop Tab reaching background controls, so the hook enforces the
    // wrap itself. Each consumer must also give the dialog tabIndex={-1} so the
    // container can receive the initial focus.
    const consumers = [
      'src/components/AboutDialog.tsx',
      'src/components/CameraCaptureModal.tsx',
      'src/components/CommandPaletteModal.tsx',
      'src/components/GameAnalysisModal.tsx',
      'src/components/GameReportModal.tsx',
      'src/components/GuessMoveModal.tsx',
      'src/components/KeyboardHelpModal.tsx',
      'src/components/KifuPrintModal.tsx',
      'src/components/LessonsModal.tsx',
      'src/components/NewGameModal.tsx',
      'src/components/PasteSgfModal.tsx',
      'src/components/PhotoBoardModal.tsx',
      'src/components/ProblemModal.tsx',
      'src/components/ProGamesModal.tsx',
      'src/components/SaveToLibraryDialog.tsx',
      'src/components/ScoreQuizModal.tsx',
      'src/components/SettingsModal.tsx',
      'src/components/TournamentModal.tsx',
    ];
    for (const path of consumers) {
      const source = readFileSync(path, 'utf8');
      expect(source, path).toContain('useInitialDialogFocus');
      expect(source, path).toContain('tabIndex={-1}');
    }

    // The palette lands focus on its own search field, so it takes the wrap and
    // the restore but opts out of the container focus.
    const palette = readFileSync('src/components/CommandPaletteModal.tsx', 'utf8');
    expect(palette).toContain('{ focusContainer: false }');
    expect(palette).toContain('inputRef.current?.focus();');

    const hook = readFileSync('src/hooks/useInitialDialogFocus.ts', 'utf8');
    // Runs on the open/close transition only; depending on onClose identity would
    // re-run every render and yank focus back out of the dialog. focusContainer is
    // a plain boolean, so it is stable across renders.
    expect(hook).toContain('}, [active, focusContainer, returnFocus]);');
    expect(hook).toContain("event.key !== 'Tab' || event.defaultPrevented");
    expect(hook).toContain('focusTarget?.isConnected');
    expect(hook).toContain('returnFocus?.isConnected ? returnFocus : previouslyFocused');
  });

  it('returns help dialogs to the durable desktop Help trigger', () => {
    const dashboard = readFileSync('src/components/dashboard/DesktopDashboard.tsx', 'utf8');
    const layout = readFileSync('src/components/Layout.tsx', 'utf8');

    expect(dashboard).toContain('onKeyboardHelp(trigger)');
    expect(dashboard).toContain('onAbout(trigger)');
    expect(layout).toContain('returnFocus={modalReturnFocusRef.current}');
  });

  it('returns file-action dialogs to their durable desktop trigger', () => {
    const dashboard = readFileSync('src/components/dashboard/DesktopDashboard.tsx', 'utf8');
    const layout = readFileSync('src/components/Layout.tsx', 'utf8');

    expect(dashboard).toContain('onSaveToLibrary(trigger)');
    expect(dashboard).toContain('onPasteSgf(trigger)');
    expect(dashboard).toContain('onScanBoard(trigger)');
    expect(layout).toContain('onScanBoard={(returnFocus) => openPhotoBoard(null, returnFocus)}');
  });

  it('keeps programmatically focused dialog containers visually quiet', () => {
    const css = readFileSync('src/index.css', 'utf8');

    expect(css).toMatch(/\[role='dialog'\]\[tabindex='-1'\]:focus\s*\{[^}]*outline: none/);
  });

  it('lets nested modal controls own Escape when they already consumed it', () => {
    const source = readFileSync('src/hooks/useEscapeToClose.ts', 'utf8');

    expect(source).toContain("event.key !== 'Escape' || event.defaultPrevented");
  });

  it('keeps the nested game report guide focus-contained while it is open', () => {
    const source = readFileSync('src/components/GameReportModal.tsx', 'utf8');

    expect(source).toContain('reportGuideButtonRef');
    expect(source).toContain('reportGuideCloseRef');
    expect(source).toContain('reportGuideCloseRef.current?.focus({ preventScroll: true })');
    expect(source).toContain('event.preventDefault();');
    expect(source).toContain('event.stopPropagation();');
    expect(source).toContain("window.setTimeout(() => reportGuideButtonRef.current?.focus({ preventScroll: true }), 0)");
    expect(source).toContain('ref={reportGuideButtonRef}');
    expect(source).toContain('ref={reportGuideCloseRef}');
  });

  it('moves focus into the mobile menu, traps it there, and restores it on close', () => {
    const source = readFileSync('src/components/layout/MenuDrawer.tsx', 'utf8');
    const controls = readFileSync('src/components/layout/ui.tsx', 'utf8');
    const css = readFileSync('src/index.css', 'utf8');

    expect(source).toContain('closeButtonRef.current?.focus({ preventScroll: true })');
    expect(source).toContain("document.addEventListener('keydown', keepFocusInDrawer, true)");
    expect(source).toContain('drawer.contains(activeElement)');
    expect(source).toContain('previouslyFocused.focus({ preventScroll: true })');
    expect(source).toContain('initialFocusInputMode?: \'pointer\' | \'keyboard\'');
    expect(source).toContain('updateFocusInputMode(initialFocusInputMode)');
    expect(source).toContain("data-menu-focus-origin={focusInputMode}");
    expect(source).toContain("previouslyFocused.setAttribute('data-menu-restored-focus-origin', restoredMode)");
    expect(controls).toContain("event.currentTarget.dataset.menuRestoredFocusOrigin !== 'pointer'");
    expect(css).toMatch(/\.menu-drawer-pointer-focus:focus-visible\s*\{[^}]*outline: none;/);
    expect(source).toContain('ref={drawerRef}');
    expect(source).toContain('ref={closeButtonRef}');
  });

  it('moves focus into mobile Home, traps it there, and restores its launcher', () => {
    const source = readFileSync('src/components/MobileHome.tsx', 'utf8');

    expect(source).toContain('const homeRef = React.useRef<HTMLDivElement>(null)');
    expect(source).toContain('const closeButtonRef = React.useRef<HTMLButtonElement>(null)');
    expect(source).toContain('closeButtonRef.current?.focus({ preventScroll: true })');
    expect(source).toContain("document.addEventListener('keydown', keepFocusInHome, true)");
    expect(source).toContain('home.contains(activeElement)');
    expect(source).toContain('previouslyFocused.focus({ preventScroll: true })');
    expect(source).toContain('ref={homeRef}');
    expect(source).toContain('ref={closeButtonRef}');
  });

  it('only points aria-controls at a popup that is currently rendered', () => {
    // Both popups render only while open, so an unconditional aria-controls
    // left a dangling IDREF whenever the control was closed. SettingsModal
    // already gates its search results the same way.
    const conditional = [
      {
        path: 'src/components/layout/LanguageSwitcher.tsx',
        control: 'aria-controls={open ? menuId : undefined}',
        target: 'id={menuId}',
        guard: '{open && (',
      },
      {
        path: 'src/components/dashboard/DesktopDashboard.tsx',
        control: "aria-controls={legendOpen ? 'dashboard-analysis-quality-legend' : undefined}",
        target: 'id="dashboard-analysis-quality-legend"',
        guard: '{legendOpen && (',
      },
      {
        // The popover needs both conditions, so the trigger must match both —
        // aria-expanded alone would still dangle while analysis is running.
        path: 'src/components/AnalysisCommandBar.tsx',
        control: 'aria-controls={depthPopoverOpen && !isGameAnalysisRunning ? depthPopoverId : undefined}',
        target: 'id={depthPopoverId}',
        guard: 'depthPopoverOpen && !isGameAnalysisRunning ? (',
      },
    ];

    for (const { path, control, target, guard } of conditional) {
      const source = readFileSync(path, 'utf8');
      // The guard is what makes the conditional aria-controls necessary; if the
      // target ever becomes unconditional this assertion should be revisited.
      expect(source).toContain(guard);
      expect(source).toContain(target);
      expect(source).toContain(control);
    }

    // The shared control button gates centrally for its callers (the mobile
    // Tools popover and the More-controls sheet), which both render their
    // target only while open.
    const sharedButton = readFileSync('src/components/layout/ui.tsx', 'utf8');
    expect(sharedButton).toContain('ariaExpanded === false ? undefined : ariaControls');
  });
});
