import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { TopControlBar } from '../src/components/layout/TopControlBar';
import { useGameStore } from '../src/store/gameStore';
import { BOARD_THEME_OPTIONS } from '../src/utils/boardThemes';
import type { BoardThemeId } from '../src/types';

const noop = () => undefined;
const activeTheme: BoardThemeId = 'hikaru';
const activeThemeIndex = BOARD_THEME_OPTIONS.findIndex((theme) => theme.value === activeTheme);
const nextTheme = BOARD_THEME_OPTIONS[(activeThemeIndex + 1) % BOARD_THEME_OPTIONS.length]!;
const escapedNextThemeLabel = nextTheme.label.replace(/&/g, '&amp;');

const baseProps = {
  settings: { ...useGameStore.getState().settings, soundEnabled: false, boardTheme: activeTheme },
  updateControls: noop,
  updateSettings: noop,
  regionOfInterest: null,
  setRegionOfInterest: noop,
  isInsertMode: false,
  isEditMode: false,
  isAnalysisMode: false,
  toggleAnalysisMode: noop,
  engineDot: 'bg-[var(--ui-success)]',
  viewMenuOpen: false,
  setViewMenuOpen: noop,
  analyzeExtra: noop,
  startSelectRegionOfInterest: noop,
  cancelSelectRegionOfInterest: noop,
  isSelectingRegionOfInterest: false,
  resetCurrentAnalysis: noop,
  clearAnalysisCache: noop,
  toggleInsertMode: noop,
  selfplayToEnd: noop,
  toggleContinuousAnalysis: noop,
  makeAiMove: noop,
  rotateBoard: noop,
  toggleTeachMode: noop,
  isTeachMode: false,
  isGameAnalysisRunning: false,
  gameAnalysisType: null,
  startQuickGameAnalysis: noop,
  startFastGameAnalysis: noop,
  stopGameAnalysis: noop,
  setIsGameAnalysisOpen: noop,
  setIsGameReportOpen: noop,
  onOpenMenu: noop,
  onQuickNewGame: noop,
  onNewGame: noop,
  onSaveSgf: noop,
  onSaveToLibrary: noop,
  onLoadSgf: noop,
  onOpenSidePanel: noop,
  onCopySgf: noop,
  onPasteSgf: noop,
  onScanBoard: noop,
  onSettings: noop,
  onCommandPalette: noop,
  onKeyboardHelp: noop,
  onAbout: noop,
};

describe('TopControlBar', () => {
  it('keeps sound and board theme controls reachable in the mobile header', () => {
    const html = renderToStaticMarkup(<TopControlBar {...baseProps} isMobile={true} />);

    expect(html).toContain('data-mobile-sound-toggle="true"');
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain('Sound off. Tap to turn on.');
    expect(html).toContain('data-mobile-board-theme-cycle="true"');
    expect(html).toContain('data-current-board-theme="hikaru"');
    expect(html).toContain(`data-next-board-theme="${nextTheme.value}"`);
    expect(html).toContain(`Tap for ${escapedNextThemeLabel}.`);
  });

  it('does not duplicate mobile quick toggles in the desktop header', () => {
    const html = renderToStaticMarkup(<TopControlBar {...baseProps} isMobile={false} />);

    expect(html).not.toContain('data-mobile-sound-toggle="true"');
    expect(html).not.toContain('data-mobile-board-theme-cycle="true"');
  });

  it('lists all locale choices when the desktop language switcher is open', () => {
    const source = readFileSync('src/components/layout/LanguageSwitcher.tsx', 'utf8');

    expect(source).toContain('data-language-switcher-menu="true"');
    expect(source).toContain('data-language-option={locale.value}');
    expect(source).toContain('role="listbox"');
    expect(source).toContain('role="option"');
    expect(source).toContain('onLocaleChange(locale);');
    expect(source).toContain('Select document language metadata');
    expect(readFileSync('src/index.css', 'utf8')).toContain('.app-language-switcher');
  });

  it('returns focus to the language trigger after keyboard dismissal or selection', () => {
    const source = readFileSync('src/components/layout/LanguageSwitcher.tsx', 'utf8');

    expect(source).toContain('const triggerRef = React.useRef<HTMLButtonElement>(null)');
    expect(source).toContain('triggerRef.current?.focus({ preventScroll: true })');
    expect(source).toContain("event.key === 'Escape' && !event.defaultPrevented");
    expect(source).toContain('closeWithFocus();');
    expect(source).toContain('ref={triggerRef}');
  });

  it('explains that quick new game uses defaults and checks unsaved changes', () => {
    const html = renderToStaticMarkup(<TopControlBar {...baseProps} isMobile={false} />);

    expect(html).toContain('Quick new game (19×19): uses your saved defaults and replaces the current game after the unsaved-changes check.');
  });

  it('labels theme selectors in the view menu', () => {
    const html = renderToStaticMarkup(<TopControlBar {...baseProps} viewMenuOpen={true} isMobile={false} />);

    expect(html).toContain('data-top-view-menu="true"');
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="false"');
    expect(html).toContain('aria-expanded="true"');
    expect(html).toMatch(/aria-controls="[^"]+"/);
    expect(html).toMatch(/aria-labelledby="[^"]+"/);
    for (const id of ['top-control-ui-theme', 'top-control-board-theme']) {
      expect(html).toContain(`for="${id}"`);
      expect(html).toContain(`id="${id}"`);
    }
    expect(html).toContain('>Heatmap</span>');
  });

  it('exposes boolean menu actions as pressed buttons', () => {
    const source = readFileSync('src/components/layout/TopControlBar.tsx', 'utf8');
    const html = renderToStaticMarkup(<TopControlBar {...baseProps} viewMenuOpen={true} isMobile={false} />);
    // Asserted on the rendered markup rather than on `aria-pressed={expr}` in
    // the source: the rows share one component now, so the source carries the
    // attribute once and a missing toggle would not show up there at all.
    const buttons = html.split('<button').slice(1).map((chunk) => `<button${chunk.split('</button>')[0]}`);
    const toggleLabels = [
      'Fullscreen',
      'Coordinates',
      'Next move preview',
      'Move numbers',
      'Board controls',
      'Analysis bar',
      'Sound',
      'Children',
      'Dots',
      'Top moves',
      'Heatmap',
      'Territory',
    ];

    for (const label of toggleLabels) {
      const button = buttons.find((markup) => (
        markup.includes('class="view-toggle')
        && new RegExp(`aria-label="${label}(,|")`).test(markup)
      ));
      expect(button, label).toBeDefined();
      expect(button, label).toMatch(/aria-pressed="(true|false)"/);
    }
    // The state is a mark, not a word, so it must be there to be read at all.
    expect(buttons.filter((markup) => markup.includes('view-toggle-mark'))).toHaveLength(toggleLabels.length);
    // One occurrence each, in the tools sheet. These used to appear twice
    // because the analysis popover repeated them, and that popover could never
    // render: it was guarded by !isMobile inside a mobile-only component.
    // Two now: the tools sheet's Cont. analysis entry, and the top bar's Analyze
    // toggle, which previously conveyed its state only as an accent colour.
    expect(source.match(/aria-pressed=\{isAnalysisMode\}/g) ?? []).toHaveLength(2);
    expect(source.match(/aria-pressed=\{isInsertMode\}/g) ?? []).toHaveLength(1);
    expect(source.match(/aria-pressed=\{isTeachMode\}/g) ?? []).toHaveLength(1);
  });

  it('exposes mobile tools as a modal dialog owned by the tools button', () => {
    const html = renderToStaticMarkup(<TopControlBar {...baseProps} viewMenuOpen={true} isMobile={true} />);
    const source = readFileSync('src/components/layout/TopControlBar.tsx', 'utf8');
    const css = readFileSync('src/index.css', 'utf8');

    expect(html).toContain('data-mobile-tools-dialog="true"');
    expect(html).toContain('data-mobile-tools-focus-origin="keyboard"');
    expect(html).toContain('data-mobile-tools-panel="true"');
    expect(html).toContain('data-mobile-tools-backdrop="true"');
    expect(html).toContain('data-mobile-tools-header="true"');
    expect(html).toContain('aria-label="Tools"');
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('title="Close tools"');
    expect(html).toMatch(/aria-controls="[^"]+"/);
    expect(html).toMatch(/aria-labelledby="[^"]+"/);
    expect(html).toMatch(/<div[^>]*data-mobile-tools-backdrop="true"/);
    expect(html).not.toMatch(/<button[^>]*data-mobile-tools-backdrop="true"/);
    expect(html).toMatch(/class="[^"]*sticky top-0 z-10[^"]*" data-mobile-tools-header="true"/);
    expect(source).toContain('const mobileToolsPanelRef = React.useRef<HTMLDivElement>(null)');
    expect(source).toContain('<FaTools size={16} aria-hidden="true" />');
    expect(source).not.toContain('FaEllipsisV');
    expect(source).toContain("if (event.key !== 'Tab' || event.defaultPrevented || !isMobile || !viewMenuOpen) return");
    expect(source).toContain("document.addEventListener('keydown', handleKeyDown, true)");
    expect(source).toContain("updateMobileToolsInputMode(event.detail === 0 ? 'keyboard' : 'pointer')");
    expect(source).toContain("onPointerDown={() => updateMobileToolsInputMode('pointer')}");
    expect(source).toContain("mobileToolsInputMode === 'pointer' ? 'mobile-tools-pointer-focus' : ''");
    expect(source).toContain("suppressFocusTooltip={mobileToolsInputMode === 'pointer'}");
    expect(source).toContain("closeViewMenuWithFocus(true, 'keyboard')");
    expect(source.match(/closeViewMenuWithFocus\(true, mobileToolsInputModeRef\.current\)/g) ?? []).toHaveLength(2);
    // Every tools entry dismisses the sheet after acting, except the two that
    // open a modal over it. Deriving the count from the buttons keeps this
    // guarding that invariant instead of needing a bump whenever one is added.
    const toolsGridButtons = (source.match(/mobileToolsGridBtn\}/g) ?? []).length;
    const modalOpeners = 2; // Re-analyze, Game report
    expect(source.match(/closeMobileToolsAfterAction\(\)/g) ?? []).toHaveLength(
      toolsGridButtons - modalOpeners
    );
    expect(source).toContain("onScanBoard(); closeViewMenu();");
    expect(source).toContain("setIsGameAnalysisOpen(true); closeViewMenu();");
    expect(source).toContain("setIsGameReportOpen(true); closeViewMenu();");
    expect(css).toMatch(/\.mobile-tools-pointer-focus:focus-visible\s*\{[^}]*outline: none;/);
    expect(css).toContain("[data-mobile-tools-panel='true'] select");
    expect(css).toContain('min-height: 44px !important');
  });

  it('uses compact responsive grids inside the mobile Tools dialog', () => {
    const html = renderToStaticMarkup(<TopControlBar {...baseProps} viewMenuOpen={true} isMobile={true} />);
    const source = readFileSync('src/components/layout/TopControlBar.tsx', 'utf8');
    const css = readFileSync('src/index.css', 'utf8');

    expect(html.match(/data-mobile-tools-action-grid="true"/g) ?? []).toHaveLength(3);
    expect(html).toContain('data-mobile-tools-section="ai"');
    expect(html).toContain('data-mobile-tools-section="game"');
    expect(html).toContain('data-mobile-tools-section="reports"');
    expect(html).toContain('data-mobile-tools-view-grid="true"');
    expect(source).toContain('const mobileToolsActionGrid = "grid grid-cols-2"');
    expect(source).toContain('const mobileToolsSectionLabel = "px-4 py-2');
    expect(source).toContain('className="grid grid-cols-2" data-mobile-tools-view-grid="true"');
    expect(css).toMatch(/\[data-mobile-tools-action-grid='true'\] > button \{[^}]*border-bottom: 1px solid var\(--ui-border\);/);
    expect(css).toMatch(/@media \(min-width: 600px\) and \(max-width: 1023px\)[\s\S]*\[data-mobile-tools-action-grid='true'\][\s\S]*repeat\(3, minmax\(0, 1fr\)\)/);
    expect(css).toMatch(/@media \(max-height: 520px\) and \(orientation: landscape\)[\s\S]*\[data-mobile-tools-action-grid='true'\][\s\S]*repeat\(4, minmax\(0, 1fr\)\)/);
    expect(css).toMatch(/@media \(min-width: 600px\) and \(max-width: 1023px\)[\s\S]*\[data-mobile-tools-section='game'\] \{[^}]*repeat\(3, minmax\(0, 1fr\)\)/);
    expect(css).toMatch(/@media \(min-width: 760px\)[\s\S]*\[data-mobile-tools-section='ai'\]:not\(:has\(> button:nth-child\(6\)\)\)[^}]*repeat\(5, minmax\(0, 1fr\)\)/);
    expect(css).toMatch(/@media \(min-width: 760px\)[\s\S]*\[data-mobile-tools-section='game'\] \{[^}]*repeat\(6, minmax\(0, 1fr\)\)/);

    // The view menu's two columns are sized for a 512px popover, and the sheet
    // hides eight of the left column's rows as redundant — six rows beside
    // thirteen, with a hairline down the ragged gap. It stacks in the sheet.
    // Both properties come from Tailwind utilities, which outrank this layer.
    expect(css).toMatch(
      /\[data-mobile-tools-dialog='true'\] \[data-mobile-tools-view-grid='true'\] \{\s*grid-template-columns: minmax\(0, 1fr\) !important;/,
    );
    expect(css).toMatch(
      /\[data-mobile-tools-view-grid='true'\]\s*> :first-child \{\s*border-right-width: 0 !important;/,
    );
  });

  it('disables unavailable analysis actions in the mobile Tools dialog', () => {
    const idleHtml = renderToStaticMarkup(
      <TopControlBar {...baseProps} viewMenuOpen={true} isMobile={true} />,
    );
    const activeHtml = renderToStaticMarkup(
      <TopControlBar
        {...baseProps}
        viewMenuOpen={true}
        isMobile={true}
        canStopAnalysis={true}
        canResetAnalysis={true}
        canClearAnalysisCache={true}
      />,
    );
    const buttonFor = (html: string, label: string) => (
      html
        .split('<button')
        .slice(1)
        .map((chunk) => `<button${chunk.split('</button>')[0]}`)
        .find((button) => button.includes(`>${label}</span>`))
    );

    for (const label of ['Stop analysis', 'Reset analysis', 'Clear cache']) {
      expect(buttonFor(idleHtml, label), label).toContain('disabled=""');
      expect(buttonFor(activeHtml, label), label).not.toContain('disabled=""');
    }
    expect(buttonFor(idleHtml, 'Stop analysis')).toContain('title="No analysis is running"');
    expect(buttonFor(idleHtml, 'Reset analysis')).toContain('title="This position has no analysis"');
    expect(buttonFor(idleHtml, 'Clear cache')).toContain('title="Analysis cache is empty"');
  });

  it('has one toolbar menu, so there is nothing to keep it exclusive with', () => {
    const source = readFileSync('src/components/layout/TopControlBar.tsx', 'utf8');

    // This used to assert the view menu closed the analysis popover. That
    // popover was guarded by !isMobile inside a mobile-only component and never
    // rendered, so the coordination it needed was imaginary. What remains is
    // that the view trigger toggles its own menu and nothing else.
    expect(source).toContain('setViewMenuOpen(!viewMenuOpen);');
    expect(source).toContain('title="View options"');
    expect(source).not.toContain('setAnalysisMenuOpen');
  });

  it('uses explicit button types in toolbar popovers and menus', () => {
    const source = readFileSync('src/components/layout/TopControlBar.tsx', 'utf8');

    expect(source.match(/<button\b(?![^>]*\btype=)[^>]*>/gs) ?? []).toEqual([]);
  });

  it('leaves the engine reading to the command bar when that bar is up', () => {
    const source = readFileSync('src/components/layout/TopControlBar.tsx', 'utf8');
    const layout = readFileSync('src/components/Layout.tsx', 'utf8');

    // `xl:` is a width, and this bar's shell is chosen by width *and* height.
    // At 1280x460 the badge appeared beside the analysis command bar's own
    // status, which docks in that layout's right margin — the same
    // "Loading · WebGPU" twice, 980px apart. Measured there: the badge is gone
    // in analyze mode, kept in play mode, and back as soon as an edit tool
    // hides the command bar, which is the one case where it is the only
    // reading on screen.
    expect(source).toContain('analysisCommandBarVisible?: boolean;');
    expect(source).toContain('{!analysisCommandBarVisible && (');
    expect(layout).toContain('analysisCommandBarVisible={showBoardAnalysisCommandBar}');
  });
});
