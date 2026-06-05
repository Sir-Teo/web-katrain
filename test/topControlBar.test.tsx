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

    expect(html).toContain('data-language-switcher="desktop"');
    expect(html).toContain('data-language-switcher-button="true"');
    expect(html).toContain('data-current-locale="en"');
    expect(html).toContain('Change language, current language English');
  });

  it('lists all locale choices when the desktop language switcher is open', () => {
    const source = readFileSync('src/components/layout/LanguageSwitcher.tsx', 'utf8');

    expect(source).toContain('data-language-switcher-menu="true"');
    expect(source).toContain('data-language-option={locale.value}');
    expect(source).toContain('role="listbox"');
    expect(source).toContain('role="option"');
    expect(source).toContain('onLocaleChange(locale);');
  });

  it('warns that quick new game replaces the current game immediately', () => {
    const html = renderToStaticMarkup(<TopControlBar {...baseProps} isMobile={false} />);

    expect(html).toContain('Quick new game (19x19): starts immediately and replaces the current game without saving.');
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

    expect(html).toContain('data-mobile-tools-dialog="true"');
    expect(html).toContain('aria-label="Tools"');
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('title="Close tools"');
    expect(html).toMatch(/aria-controls="[^"]+"/);
    expect(html).toMatch(/aria-labelledby="[^"]+"/);
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
