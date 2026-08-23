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
  analysisMenuOpen: false,
  setAnalysisMenuOpen: noop,
  viewMenuOpen: false,
  setViewMenuOpen: noop,
  analyzeExtra: noop,
  startSelectRegionOfInterest: noop,
  resetCurrentAnalysis: noop,
  clearAnalysisCache: noop,
  analysisCacheSize: 0,
  toggleInsertMode: noop,
  selfplayToEnd: noop,
  toggleContinuousAnalysis: noop,
  makeAiMove: noop,
  rotateBoard: noop,
  toggleTeachMode: noop,
  isTeachMode: false,
  isGameAnalysisRunning: false,
  gameAnalysisType: null,
  gameAnalysisDone: 0,
  gameAnalysisTotal: 0,
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

  it('exposes the desktop language switcher', () => {
    const html = renderToStaticMarkup(<TopControlBar {...baseProps} isMobile={false} />);

    expect(html).toContain('app-language-switcher');
    expect(html).toContain('data-language-switcher="desktop"');
    expect(html).toContain('data-language-switcher-button="true"');
    expect(html).toContain('data-current-locale="en"');
    // Labels come from the active locale, and the native name is only appended
    // when it differs — English would otherwise read "English (English)".
    expect(html).toContain('Change language: English');
    expect(html).not.toContain('English (English)');
    expect(html).toContain('SGF · EN');
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
    const toggleStates = [
      'isFullscreen',
      'settings.showCoordinates',
      'settings.showNextMovePreview',
      'settings.showMoveNumbers',
      'settings.showBoardControls',
      'settings.showAnalysisBar',
      'settings.soundEnabled',
      'settings.analysisShowChildren',
      'settings.analysisShowEval',
      'settings.analysisShowHints',
      'settings.analysisShowPolicy',
      'settings.analysisShowOwnership',
    ];

    for (const state of toggleStates) {
      expect(source, state).toContain(`aria-pressed={${state}}`);
    }
    expect(source.match(/aria-pressed=\{isAnalysisMode\}/g) ?? []).toHaveLength(2);
    expect(source.match(/aria-pressed=\{isInsertMode\}/g) ?? []).toHaveLength(2);
    expect(source.match(/aria-pressed=\{isTeachMode\}/g) ?? []).toHaveLength(2);
  });

  it('exposes desktop analysis actions as a labelled popover dialog', () => {
    const html = renderToStaticMarkup(<TopControlBar {...baseProps} analysisMenuOpen={true} isMobile={false} />);

    expect(html).toContain('data-top-actions-menu="true"');
    expect(html).toContain('Analysis actions');
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('aria-modal="false"');
    expect(html).toMatch(/aria-controls="[^"]+"/);
    expect(html).toMatch(/aria-labelledby="[^"]+"/);
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
    expect(source.match(/closeMobileToolsAfterAction\(\)/g) ?? []).toHaveLength(14);
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
    expect(html).toContain('data-mobile-tools-view-grid="true"');
    expect(source).toContain('const mobileToolsActionGrid = "grid grid-cols-2"');
    expect(source).toContain('const mobileToolsSectionLabel = "px-4 py-2');
    expect(source).toContain('className="grid grid-cols-2" data-mobile-tools-view-grid="true"');
    expect(css).toMatch(/\[data-mobile-tools-action-grid='true'\] > button \{[^}]*border-bottom: 1px solid var\(--ui-border\);/);
    expect(css).toMatch(/@media \(min-width: 600px\) and \(max-width: 1023px\)[\s\S]*\[data-mobile-tools-action-grid='true'\][\s\S]*repeat\(3, minmax\(0, 1fr\)\)/);
    expect(css).toMatch(/@media \(max-height: 520px\) and \(orientation: landscape\)[\s\S]*\[data-mobile-tools-action-grid='true'\][\s\S]*repeat\(4, minmax\(0, 1fr\)\)/);
  });

  it('keeps desktop toolbar menus mutually exclusive', () => {
    const source = readFileSync('src/components/layout/TopControlBar.tsx', 'utf8');

    expect(source).toContain(`onClick={() => {
                setViewMenuOpen(!viewMenuOpen);
                setAnalysisMenuOpen(false);
              }}
              title="View options"`);
    expect(source).toContain(`onClick={() => {
                setAnalysisMenuOpen(!analysisMenuOpen);
                setViewMenuOpen(false);
              }}
              title="Analysis actions"`);
  });

  it('uses explicit button types in toolbar popovers and menus', () => {
    const source = readFileSync('src/components/layout/TopControlBar.tsx', 'utf8');

    expect(source.match(/<button\b(?![^>]*\btype=)[^>]*>/gs) ?? []).toEqual([]);
  });
});
