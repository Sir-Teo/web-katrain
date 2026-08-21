import React from 'react';
import {
  FaBars,
  FaChevronDown,
  FaChevronLeft,
  FaCopy,
  FaFolderOpen,
  FaVolumeUp,
  FaVolumeMute,
  FaPaste,
  FaSlidersH,
  FaPlay,
  FaPlus,
  FaSearch,
  FaStop,
  FaSyncAlt,
  FaTimes,
  FaCog,
  FaSave,
  FaKeyboard,
  FaTools,
  FaCamera,
  FaTrash,
  FaInfoCircle,
  FaBook,
  FaBolt,
  FaPalette,
  FaBalanceScale,
  FaBroom,
  FaChartLine,
  FaCrosshairs,
  FaFastForward,
  FaFileAlt,
  FaGraduationCap,
  FaLayerGroup,
  FaRandom,
  FaRedoAlt,
  FaSearchPlus,
} from 'react-icons/fa';
import type { GameSettings, RegionOfInterest } from '../../types';
import type { AnalysisControlsState } from './types';
import { EngineStatusBadge, IconButton } from './ui';
import { LanguageSwitcher } from './LanguageSwitcher';
import { BOARD_THEME_OPTIONS, getBoardTheme } from '../../utils/boardThemes';
import { UI_THEME_OPTIONS } from '../../utils/uiThemes';
import { useShortcutLabels } from '../../hooks/useShortcutLabels';
import { isFullscreenActive, subscribeFullscreenChange, toggleAppFullscreen } from '../../utils/fullscreen';
import { getQuickNewGameWarning } from '../../utils/quickNewGame';

const TOP_CONTROL_SHORTCUT_IDS = [
  'settings-modal',
  'command-palette',
  'keyboard-help',
  'copy-sgf',
  'paste-sgf',
  'new-game',
  'save-sgf',
  'save-library',
  'open-sgf',
  'toggle-analysis',
  'toggle-children',
  'toggle-eval',
  'toggle-hints',
  'toggle-policy',
  'toggle-territory',
  'toggle-coordinates',
  'toggle-sound',
  'toggle-next-move-preview',
  'toggle-move-numbers',
  'fullscreen',
  'continuous-analysis',
  'analysis-extra',
  'analysis-equalize',
  'analysis-sweep',
  'analysis-alternative',
  'select-region',
  'reset-analysis',
  'ai-move',
  'escape',
  'rotate-board',
  'toggle-insert',
  'selfplay',
  'game-analysis-modal',
  'game-report-modal',
] as const;

type TopControlShortcutId = (typeof TOP_CONTROL_SHORTCUT_IDS)[number];

const stripShortcutSuffix = (title: string): string => title.replace(/\s*\([^)]+\)\s*$/, '');
const VIEW_MENU_UI_THEME_ID = 'top-control-ui-theme';
const VIEW_MENU_BOARD_THEME_ID = 'top-control-board-theme';

interface TopControlBarProps {
  settings: GameSettings;
  updateControls: (partial: Partial<AnalysisControlsState>) => void;
  updateSettings: (partial: Partial<GameSettings>) => void;
  regionOfInterest: RegionOfInterest | null;
  setRegionOfInterest: (r: null) => void;
  isInsertMode: boolean;
  isEditMode: boolean;
  isAnalysisMode: boolean;
  toggleAnalysisMode: () => void;
  engineDot: string;
  analysisMenuOpen: boolean;
  setAnalysisMenuOpen: (v: boolean) => void;
  viewMenuOpen: boolean;
  setViewMenuOpen: (v: boolean) => void;
  // Analysis actions
  analyzeExtra: (action: 'extra' | 'equalize' | 'sweep' | 'alternative' | 'stop') => void;
  startSelectRegionOfInterest: () => void;
  resetCurrentAnalysis: () => void;
  clearAnalysisCache: () => void;
  analysisCacheSize: number;
  toggleInsertMode: () => void;
  selfplayToEnd: () => void;
  toggleContinuousAnalysis: () => void;
  makeAiMove: () => void;
  rotateBoard: () => void;
  toggleTeachMode: () => void;
  isTeachMode: boolean;
  // Game analysis
  isGameAnalysisRunning: boolean;
  gameAnalysisType: string | null;
  gameAnalysisDone: number;
  gameAnalysisTotal: number;
  startQuickGameAnalysis: () => void;
  startFastGameAnalysis: (opts?: { moveRange?: [number, number] | null }) => void;
  stopGameAnalysis: () => void;
  setIsGameAnalysisOpen: (v: boolean) => void;
  setIsGameReportOpen: (v: boolean) => void;
  // Menu callbacks
  onOpenMenu: (inputMode: 'pointer' | 'keyboard') => void;
  onQuickNewGame: () => void;
  onNewGame: () => void;
  onSaveSgf: () => void;
  saveTitle?: string;
  onSaveToLibrary: () => void;
  onLoadSgf: () => void;
  onOpenSidePanel: () => void;
  onCopySgf: () => void;
  onPasteSgf: () => void;
  onScanBoard: () => void;
  onSettings: () => void;
  onCommandPalette: () => void;
  onKeyboardHelp: () => void;
  onAbout: () => void;
  winRateLabel?: string | null;
  scoreLeadLabel?: string | null;
  pointsLostLabel?: string | null;
  engineMeta?: string | null;
  engineMetaTitle?: string;
  engineError?: string | null;
  isMobile?: boolean;
}

export const TopControlBar: React.FC<TopControlBarProps> = ({
  settings,
  updateControls,
  updateSettings,
  regionOfInterest,
  setRegionOfInterest,
  isInsertMode,
  isEditMode,
  isAnalysisMode,
  toggleAnalysisMode,
  engineDot,
  analysisMenuOpen,
  setAnalysisMenuOpen,
  viewMenuOpen,
  setViewMenuOpen,
  analyzeExtra,
  startSelectRegionOfInterest,
  resetCurrentAnalysis,
  clearAnalysisCache,
  analysisCacheSize,
  toggleInsertMode,
  selfplayToEnd,
  toggleContinuousAnalysis,
  makeAiMove,
  rotateBoard,
  toggleTeachMode,
  isTeachMode,
  isGameAnalysisRunning,
  gameAnalysisType,
  gameAnalysisDone,
  gameAnalysisTotal,
  startQuickGameAnalysis,
  startFastGameAnalysis,
  stopGameAnalysis,
  setIsGameAnalysisOpen,
  setIsGameReportOpen,
  onOpenMenu,
  onQuickNewGame,
  onNewGame,
  onSaveSgf,
  saveTitle = 'Save SGF',
  onSaveToLibrary,
  onLoadSgf,
  onOpenSidePanel,
  onCopySgf,
  onPasteSgf,
  onScanBoard,
  onSettings,
  onCommandPalette,
  onKeyboardHelp,
  onAbout,
  winRateLabel,
  scoreLeadLabel,
  pointsLostLabel,
  engineMeta = null,
  engineMetaTitle,
  engineError,
  isMobile = false,
}) => {
  const topIconClass = 'ui-control';
  const shortcutLabels = useShortcutLabels(TOP_CONTROL_SHORTCUT_IDS);
  const withShortcut = (label: string, id: TopControlShortcutId) => `${label} (${shortcutLabels[id]})`;
  const saveControlTitle = withShortcut(stripShortcutSuffix(saveTitle), 'save-sgf');
  const quickNewGameTitle = getQuickNewGameWarning(settings.defaultBoardSize);
  const boardThemeIndex = BOARD_THEME_OPTIONS.findIndex((theme) => theme.value === settings.boardTheme);
  const activeBoardThemeIndex = boardThemeIndex >= 0 ? boardThemeIndex : 0;
  const activeBoardThemeOption = BOARD_THEME_OPTIONS[activeBoardThemeIndex] ?? BOARD_THEME_OPTIONS[0]!;
  const nextBoardThemeOption =
    BOARD_THEME_OPTIONS[(activeBoardThemeIndex + 1) % BOARD_THEME_OPTIONS.length] ?? activeBoardThemeOption;
  const activeBoardTheme = getBoardTheme(activeBoardThemeOption.value);
  const mobileHeaderToggleClass = [
    topIconClass,
    'relative flex items-center justify-center rounded-md transition-colors touch-manipulation',
    'border border-transparent bg-transparent text-[var(--ui-text-muted)]',
    'hover:bg-[var(--ui-surface-2)] hover:text-[var(--ui-text)]',
  ].join(' ');
  const viewMenuButtonRef = React.useRef<HTMLButtonElement>(null);
  const actionsMenuButtonRef = React.useRef<HTMLButtonElement>(null);
  const mobileToolsPanelRef = React.useRef<HTMLDivElement>(null);
  const mobileToolsCloseRef = React.useRef<HTMLButtonElement>(null);
  const mobileToolsInputModeRef = React.useRef<'pointer' | 'keyboard'>('keyboard');
  const [mobileToolsInputMode, setMobileToolsInputMode] = React.useState<'pointer' | 'keyboard'>('keyboard');
  const viewPopoverId = React.useId();
  const viewPopoverTitleId = React.useId();
  const mobileToolsTitleId = React.useId();
  const actionsPopoverId = React.useId();
  const actionsPopoverTitleId = React.useId();
  const [isFullscreen, setIsFullscreen] = React.useState(() => {
    if (typeof document === 'undefined') return false;
    return isFullscreenActive();
  });

  const updateMobileToolsInputMode = React.useCallback((mode: 'pointer' | 'keyboard') => {
    mobileToolsInputModeRef.current = mode;
    setMobileToolsInputMode(mode);
  }, []);

  const closeViewMenuWithFocus = React.useCallback((
    restoreFocus = false,
    inputMode?: 'pointer' | 'keyboard',
  ) => {
    if (inputMode) updateMobileToolsInputMode(inputMode);
    setViewMenuOpen(false);
    if (restoreFocus && typeof window !== 'undefined') {
      window.setTimeout(() => viewMenuButtonRef.current?.focus({ preventScroll: true }), 0);
    }
  }, [setViewMenuOpen, updateMobileToolsInputMode]);

  const closeAnalysisMenuWithFocus = React.useCallback((restoreFocus = false) => {
    setAnalysisMenuOpen(false);
    if (restoreFocus && typeof window !== 'undefined') {
      window.setTimeout(() => actionsMenuButtonRef.current?.focus({ preventScroll: true }), 0);
    }
  }, [setAnalysisMenuOpen]);

  React.useEffect(() => {
    if (typeof document === 'undefined') return;
    const handle = () => setIsFullscreen(isFullscreenActive());
    return subscribeFullscreenChange(handle);
  }, []);

  React.useEffect(() => {
    if (!viewMenuOpen && !analysisMenuOpen) return;
    const focusableSelector = [
      'a[href]:not([tabindex="-1"])',
      'button:not([disabled]):not([tabindex="-1"])',
      'input:not([disabled]):not([tabindex="-1"])',
      'select:not([disabled]):not([tabindex="-1"])',
      'textarea:not([disabled]):not([tabindex="-1"])',
      '[tabindex]:not([tabindex="-1"])',
    ].join(',');
    let focusCloseButton = 0;
    if (isMobile && viewMenuOpen) {
      focusCloseButton = window.requestAnimationFrame(() => {
        mobileToolsCloseRef.current?.focus({ preventScroll: true });
      });
    }
    const handlePointerDown = () => {
      if (isMobile && viewMenuOpen) updateMobileToolsInputMode('pointer');
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isMobile && viewMenuOpen) updateMobileToolsInputMode('keyboard');
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        if (analysisMenuOpen) closeAnalysisMenuWithFocus(true);
        if (viewMenuOpen) closeViewMenuWithFocus(true, 'keyboard');
        return;
      }
      if (event.key !== 'Tab' || event.defaultPrevented || !isMobile || !viewMenuOpen) return;

      const panel = mobileToolsPanelRef.current;
      if (!panel) return;
      const focusableElements = Array.from(panel.querySelectorAll<HTMLElement>(focusableSelector))
        .filter((element) => element.getClientRects().length > 0);
      const first = focusableElements[0];
      const last = focusableElements[focusableElements.length - 1];
      if (!first || !last) {
        event.preventDefault();
        return;
      }

      const activeElement = document.activeElement;
      if (event.shiftKey && (activeElement === first || !panel.contains(activeElement))) {
        event.preventDefault();
        last.focus({ preventScroll: true });
      } else if (!event.shiftKey && (activeElement === last || !panel.contains(activeElement))) {
        event.preventDefault();
        first.focus({ preventScroll: true });
      }
    };
    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      if (focusCloseButton) window.cancelAnimationFrame(focusCloseButton);
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [
    analysisMenuOpen,
    closeAnalysisMenuWithFocus,
    closeViewMenuWithFocus,
    isMobile,
    updateMobileToolsInputMode,
    viewMenuOpen,
  ]);

  React.useEffect(() => {
    if (!isMobile || viewMenuOpen || mobileToolsInputModeRef.current !== 'pointer') return;
    const trigger = viewMenuButtonRef.current;
    if (!trigger) return;
    const clearPointerFocus = () => updateMobileToolsInputMode('keyboard');
    trigger.addEventListener('blur', clearPointerFocus);
    document.addEventListener('keydown', clearPointerFocus, true);
    document.addEventListener('pointerdown', clearPointerFocus, true);
    return () => {
      trigger.removeEventListener('blur', clearPointerFocus);
      document.removeEventListener('keydown', clearPointerFocus, true);
      document.removeEventListener('pointerdown', clearPointerFocus, true);
    };
  }, [isMobile, mobileToolsInputMode, updateMobileToolsInputMode, viewMenuOpen]);

  const toggleFullscreen = () => {
    if (typeof document === 'undefined') return;
    void toggleAppFullscreen().catch(() => {});
  };
  const cycleBoardTheme = () => updateSettings({ boardTheme: nextBoardThemeOption.value });
  const closeViewMenu = () => setViewMenuOpen(false);
  const closeMobileToolsAfterAction = () => {
    closeViewMenuWithFocus(true, mobileToolsInputModeRef.current);
  };
  const closeViewMenuIfMobile = () => {
    if (isMobile) closeViewMenuWithFocus(true, mobileToolsInputModeRef.current);
  };
  const desktopViewMenu = (
    <div className="grid grid-cols-2" data-mobile-tools-view-grid="true">
      {/* Settings column */}
      <div className="flex flex-col border-r border-[var(--ui-border)]">
        <button type="button"
          className="w-full px-3 py-2 text-left hover:bg-[var(--ui-surface-2)] flex items-center justify-between"
          onClick={() => { toggleFullscreen(); closeViewMenuIfMobile(); }}
          aria-pressed={isFullscreen}
        >
          <span>Fullscreen</span><span className="text-xs ui-text-faint">{isFullscreen ? 'on' : 'off'} · {shortcutLabels.fullscreen}</span>
        </button>
        <button type="button"
          className="mobile-tools-redundant w-full px-3 py-2 text-left hover:bg-[var(--ui-surface-2)] flex items-center justify-between"
          onClick={() => { closeViewMenu(); onCommandPalette(); }}
        >
          <span className="flex items-center gap-2"><FaSearch /> Command palette</span><span className="text-xs ui-text-faint">{shortcutLabels['command-palette']}</span>
        </button>
        <button type="button"
          className="mobile-tools-redundant w-full px-3 py-2 text-left hover:bg-[var(--ui-surface-2)] flex items-center justify-between"
          onClick={() => { closeViewMenu(); onSettings(); }}
        >
          <span className="flex items-center gap-2"><FaCog /> Settings</span><span className="text-xs ui-text-faint">{shortcutLabels['settings-modal']}</span>
        </button>
        <button type="button"
          className="mobile-tools-redundant w-full px-3 py-2 text-left hover:bg-[var(--ui-surface-2)] flex items-center justify-between"
          onClick={() => { closeViewMenu(); onKeyboardHelp(); }}
        >
          <span className="flex items-center gap-2"><FaKeyboard /> Keyboard shortcuts</span><span className="text-xs ui-text-faint">{shortcutLabels['keyboard-help']}</span>
        </button>
        <button type="button"
          className="mobile-tools-redundant w-full px-3 py-2 text-left hover:bg-[var(--ui-surface-2)] flex items-center justify-between"
          onClick={() => { closeViewMenu(); onAbout(); }}
        >
          <span className="flex items-center gap-2"><FaInfoCircle /> About</span><span className="text-xs ui-text-faint">Build</span>
        </button>
        <div className="mobile-tools-redundant h-px bg-[var(--ui-border)] w-full" />
        <button type="button"
          className="mobile-tools-redundant w-full px-3 py-2 text-left hover:bg-[var(--ui-surface-2)] flex items-center justify-between"
          onClick={() => { onCopySgf(); closeViewMenuIfMobile(); }}
        >
          <span className="flex items-center gap-2"><FaCopy /> Copy SGF</span><span className="text-xs ui-text-faint">{shortcutLabels['copy-sgf']}</span>
        </button>
        <button type="button"
          className="mobile-tools-redundant w-full px-3 py-2 text-left hover:bg-[var(--ui-surface-2)] flex items-center justify-between"
          onClick={() => { closeViewMenu(); onPasteSgf(); }}
        >
          <span className="flex items-center gap-2"><FaPaste /> Paste SGF/OGS</span><span className="text-xs ui-text-faint">{shortcutLabels['paste-sgf']}</span>
        </button>
        <button type="button"
          className="mobile-tools-redundant w-full px-3 py-2 text-left hover:bg-[var(--ui-surface-2)] flex items-center justify-between"
          onClick={() => { onScanBoard(); closeViewMenu(); }}
        >
          <span className="flex items-center gap-2"><FaCamera /> Photo Board</span>
        </button>
        <div className="mobile-tools-redundant h-px bg-[var(--ui-border)] w-full" />
        <button type="button"
          className="w-full px-3 py-2 text-left hover:bg-[var(--ui-surface-2)] flex items-center justify-between"
          onClick={() => { updateSettings({ showCoordinates: !settings.showCoordinates }); closeViewMenuIfMobile(); }}
          aria-label={`Coordinates ${settings.showCoordinates ? 'on' : 'off'}, shortcut ${shortcutLabels['toggle-coordinates']}`}
          aria-pressed={settings.showCoordinates}
        >
          <span>Coordinates</span><span className="text-xs ui-text-faint">{settings.showCoordinates ? 'on' : 'off'} · {shortcutLabels['toggle-coordinates']}</span>
        </button>
        <button type="button"
          className="w-full px-3 py-2 text-left hover:bg-[var(--ui-surface-2)] flex items-center justify-between"
          onClick={() => { updateSettings({ showNextMovePreview: !settings.showNextMovePreview }); closeViewMenuIfMobile(); }}
          aria-label={`Next move preview ${settings.showNextMovePreview ? 'on' : 'off'}, shortcut ${shortcutLabels['toggle-next-move-preview']}`}
          aria-pressed={settings.showNextMovePreview}
        >
          <span>Next move preview</span><span className="text-xs ui-text-faint">{settings.showNextMovePreview ? 'on' : 'off'} · {shortcutLabels['toggle-next-move-preview']}</span>
        </button>
        <button type="button"
          className="w-full px-3 py-2 text-left hover:bg-[var(--ui-surface-2)] flex items-center justify-between"
          onClick={() => { updateSettings({ showMoveNumbers: !settings.showMoveNumbers }); closeViewMenuIfMobile(); }}
          aria-label={`Move numbers ${settings.showMoveNumbers ? 'on' : 'off'}, shortcut ${shortcutLabels['toggle-move-numbers']}`}
          aria-pressed={settings.showMoveNumbers}
        >
          <span>Move numbers</span><span className="text-xs ui-text-faint">{settings.showMoveNumbers ? 'on' : 'off'} · {shortcutLabels['toggle-move-numbers']}</span>
        </button>
        <button type="button"
          className="w-full px-3 py-2 text-left hover:bg-[var(--ui-surface-2)] flex items-center justify-between"
          onClick={() => { updateSettings({ showBoardControls: !settings.showBoardControls }); closeViewMenuIfMobile(); }}
          aria-pressed={settings.showBoardControls}
        >
          <span>Board controls</span><span className="text-xs ui-text-faint">{settings.showBoardControls ? 'on' : 'off'}</span>
        </button>
        <button type="button"
          className="w-full px-3 py-2 text-left hover:bg-[var(--ui-surface-2)] flex items-center justify-between"
          onClick={() => { updateSettings({ showAnalysisBar: !settings.showAnalysisBar }); closeViewMenuIfMobile(); }}
          aria-label={`Analysis bar ${settings.showAnalysisBar ? 'on' : 'off'}`}
          aria-pressed={settings.showAnalysisBar}
        >
          <span>Analysis bar</span><span className="text-xs ui-text-faint">{settings.showAnalysisBar ? 'on' : 'off'}</span>
        </button>
        <button type="button"
          className="mobile-tools-redundant w-full px-3 py-2 text-left hover:bg-[var(--ui-surface-2)] flex items-center justify-between"
          onClick={() => { updateSettings({ soundEnabled: !settings.soundEnabled }); closeViewMenuIfMobile(); }}
          aria-label={`Sound ${settings.soundEnabled ? 'on' : 'off'}, shortcut ${shortcutLabels['toggle-sound']}`}
          aria-pressed={settings.soundEnabled}
        >
          <span className="flex items-center gap-2">{settings.soundEnabled ? <FaVolumeUp /> : <FaVolumeMute />} Sound</span>
          <span className="text-xs ui-text-faint">{settings.soundEnabled ? 'on' : 'off'} · {shortcutLabels['toggle-sound']}</span>
        </button>
      </div>

      {/* Overlays and Themes column */}
      <div className="flex flex-col">
        <div className="px-3 py-2 text-xs font-semibold text-[var(--ui-text-muted)] uppercase tracking-wider bg-[var(--ui-surface-2)]">Analysis Overlays</div>
        <button type="button"
          className="w-full px-3 py-2 text-left hover:bg-[var(--ui-surface-2)] flex items-center justify-between"
          onClick={() => { updateControls({ analysisShowChildren: !settings.analysisShowChildren }); closeViewMenuIfMobile(); }}
          aria-pressed={settings.analysisShowChildren}
        >
          <span>Children</span><span className="text-xs ui-text-faint">{settings.analysisShowChildren ? 'on' : 'off'} · {shortcutLabels['toggle-children']}</span>
        </button>
        <button type="button"
          className="w-full px-3 py-2 text-left hover:bg-[var(--ui-surface-2)] flex items-center justify-between"
          onClick={() => { updateControls({ analysisShowEval: !settings.analysisShowEval }); closeViewMenuIfMobile(); }}
          aria-pressed={settings.analysisShowEval}
        >
          <span>Dots</span><span className="text-xs ui-text-faint">{settings.analysisShowEval ? 'on' : 'off'} · {shortcutLabels['toggle-eval']}</span>
        </button>
        <button type="button"
          className={['w-full px-3 py-2 text-left flex items-center justify-between', settings.analysisShowPolicy ? 'opacity-50 cursor-not-allowed' : 'hover:bg-[var(--ui-surface-2)]'].join(' ')}
          disabled={settings.analysisShowPolicy}
          onClick={() => { updateControls({ analysisShowHints: !settings.analysisShowHints }); closeViewMenuIfMobile(); }}
          aria-pressed={settings.analysisShowHints}
        >
          <span>Top moves</span><span className="text-xs ui-text-faint">{settings.analysisShowHints ? 'on' : 'off'} · {shortcutLabels['toggle-hints']}</span>
        </button>
        <button type="button"
          className="w-full px-3 py-2 text-left hover:bg-[var(--ui-surface-2)] flex items-center justify-between"
          onClick={() => { updateControls({ analysisShowPolicy: !settings.analysisShowPolicy }); closeViewMenuIfMobile(); }}
          aria-pressed={settings.analysisShowPolicy}
        >
          <span>Heatmap</span><span className="text-xs ui-text-faint">{settings.analysisShowPolicy ? 'on' : 'off'} · {shortcutLabels['toggle-policy']}</span>
        </button>
        <button type="button"
          className="w-full px-3 py-2 text-left hover:bg-[var(--ui-surface-2)] flex items-center justify-between"
          onClick={() => { updateControls({ analysisShowOwnership: !settings.analysisShowOwnership }); closeViewMenuIfMobile(); }}
          aria-pressed={settings.analysisShowOwnership}
        >
          <span>Territory</span><span className="text-xs ui-text-faint">{settings.analysisShowOwnership ? 'on' : 'off'} · {shortcutLabels['toggle-territory']}</span>
        </button>

        <div className="border-t border-[var(--ui-border)] w-full mt-auto" />
        <div className="px-3 py-2 text-xs font-semibold text-[var(--ui-text-muted)] uppercase tracking-wider bg-[var(--ui-surface-2)] w-full">Themes</div>
        <div className="flex flex-col p-3 gap-3">
          <div>
            <label htmlFor={VIEW_MENU_UI_THEME_ID} className="text-xs ui-text-faint mb-1 block">UI theme</label>
            <select
              id={VIEW_MENU_UI_THEME_ID}
              value={settings.uiTheme}
              onChange={(e) => { updateSettings({ uiTheme: e.target.value as GameSettings['uiTheme'] }); closeViewMenuIfMobile(); }}
              className="w-full ui-input border rounded px-2 py-1 text-xs text-[var(--ui-text)]"
            >
              {UI_THEME_OPTIONS.map((theme) => <option key={theme.value} value={theme.value}>{theme.label}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor={VIEW_MENU_BOARD_THEME_ID} className="text-xs ui-text-faint mb-1 block">Board theme</label>
            <select
              id={VIEW_MENU_BOARD_THEME_ID}
              value={settings.boardTheme}
              onChange={(e) => { updateSettings({ boardTheme: e.target.value as GameSettings['boardTheme'] }); closeViewMenuIfMobile(); }}
              className="w-full ui-input border rounded px-2 py-1 text-xs text-[var(--ui-text)]"
            >
              {BOARD_THEME_OPTIONS.map((theme) => <option key={theme.value} value={theme.value}>{theme.label}</option>)}
            </select>
          </div>
        </div>
      </div>
    </div>
  );

  const mobileToolsGridBtn = "mobile-tools-action flex min-h-12 min-w-0 items-center gap-2 bg-[var(--ui-panel)] px-3 py-2 hover:bg-[var(--ui-surface-2)] text-left transition-colors";
  const mobileToolsActionGrid = "grid grid-cols-2";
  const mobileToolsSectionLabel = "px-4 py-2 text-xs font-semibold text-[var(--ui-text-muted)] uppercase tracking-wider";
  const mobileToolsMenu = (
    <div className="flex flex-col">
      <div className="border-t border-[var(--ui-border)]">
        <div className={mobileToolsSectionLabel}>AI Tools</div>
        <div className={mobileToolsActionGrid} data-mobile-tools-action-grid="true">
          <button type="button" className={mobileToolsGridBtn} onClick={() => { analyzeExtra('extra'); closeMobileToolsAfterAction(); }}>
            <FaSearchPlus size={18} className="text-[var(--ui-text-muted)]" />
            <span className="text-sm font-medium">Extra analysis</span>
            <span className="text-[11px] ui-text-faint">{shortcutLabels['analysis-extra']}</span>
          </button>
          <button type="button" className={mobileToolsGridBtn} onClick={() => { analyzeExtra('equalize'); closeMobileToolsAfterAction(); }}>
            <FaBalanceScale size={18} className="text-[var(--ui-text-muted)]" />
            <span className="text-sm font-medium">Equalize</span>
            <span className="text-[11px] ui-text-faint">{shortcutLabels['analysis-equalize']}</span>
          </button>
          <button type="button" className={mobileToolsGridBtn} onClick={() => { analyzeExtra('sweep'); closeMobileToolsAfterAction(); }}>
            <FaBroom size={18} className="text-[var(--ui-text-muted)]" />
            <span className="text-sm font-medium">Sweep</span>
            <span className="text-[11px] ui-text-faint">{shortcutLabels['analysis-sweep']}</span>
          </button>
          <button type="button" className={mobileToolsGridBtn} onClick={() => { analyzeExtra('alternative'); closeMobileToolsAfterAction(); }}>
            <FaRandom size={18} className="text-[var(--ui-text-muted)]" />
            <span className="text-sm font-medium">Alternative</span>
            <span className="text-[11px] ui-text-faint">{shortcutLabels['analysis-alternative']}</span>
          </button>
          <button type="button" className={mobileToolsGridBtn} onClick={() => { startSelectRegionOfInterest(); closeMobileToolsAfterAction(); }}>
            <FaCrosshairs size={18} className="text-[var(--ui-text-muted)]" />
            <span className="text-sm font-medium">Select region</span>
            <span className="text-[11px] ui-text-faint">{shortcutLabels['select-region']}</span>
          </button>
          {regionOfInterest && (
            <button type="button" className={`${mobileToolsGridBtn} text-[var(--ui-danger)]`} onClick={() => { setRegionOfInterest(null); closeMobileToolsAfterAction(); }}>
              <FaTimes size={18} />
              <span className="text-sm font-medium">Clear region</span>
            </button>
          )}
        </div>
      </div>

      <div className="border-t border-[var(--ui-border)]">
        <div className={mobileToolsSectionLabel}>Game Control</div>
        <div className={mobileToolsActionGrid} data-mobile-tools-action-grid="true">
          <button type="button" className={mobileToolsGridBtn} onClick={() => { toggleContinuousAnalysis(); closeMobileToolsAfterAction(); }} aria-pressed={isAnalysisMode}>
            <FaChartLine size={18} className={isAnalysisMode ? "text-[var(--ui-accent)]" : "text-[var(--ui-text-muted)]"} />
            <span className="text-sm font-medium">Cont. analysis</span>
            <span className="text-[11px] ui-text-faint">{shortcutLabels['continuous-analysis']}</span>
          </button>
          <button type="button" className={mobileToolsGridBtn} onClick={() => { makeAiMove(); closeMobileToolsAfterAction(); }}>
            <FaPlay size={18} className="text-[var(--ui-success)]" />
            <span className="text-sm font-medium">AI move</span>
            <span className="text-[11px] ui-text-faint">{shortcutLabels['ai-move']}</span>
          </button>
          <button type="button" className={mobileToolsGridBtn} onClick={() => { toggleInsertMode(); closeMobileToolsAfterAction(); }} aria-pressed={isInsertMode}>
            <FaLayerGroup size={18} className={isInsertMode ? "text-[var(--ui-accent)]" : "text-[var(--ui-text-muted)]"} />
            <span className="text-sm font-medium">Insert mode</span>
            <span className="text-[11px] ui-text-faint">{shortcutLabels['toggle-insert']}</span>
          </button>
          <button type="button" className={mobileToolsGridBtn} onClick={() => { selfplayToEnd(); closeMobileToolsAfterAction(); }}>
            <FaFastForward size={18} className="text-[var(--ui-text-muted)]" />
            <span className="text-sm font-medium">Selfplay to end</span>
            <span className="text-[11px] ui-text-faint">{shortcutLabels.selfplay}</span>
          </button>
          <button type="button" className={mobileToolsGridBtn} onClick={() => { rotateBoard(); closeMobileToolsAfterAction(); }}>
            <FaSyncAlt size={18} className="text-[var(--ui-text-muted)]" />
            <span className="text-sm font-medium">Rotate board</span>
            <span className="text-[11px] ui-text-faint">{shortcutLabels['rotate-board']}</span>
          </button>
          {/* No Photo Board tile: the mobile sheet appends desktopViewMenu below,
              which already lists it beside Copy/Paste SGF where importing a game
              belongs — two tiles for one action in a single open menu. */}
          <button type="button" className={mobileToolsGridBtn} onClick={() => { toggleTeachMode(); closeMobileToolsAfterAction(); }} aria-pressed={isTeachMode}>
            <FaGraduationCap size={18} className={isTeachMode ? "text-[var(--ui-accent)]" : "text-[var(--ui-text-muted)]"} />
            <span className="text-sm font-medium">Teach mode</span>
          </button>
        </div>
      </div>

      <div className="border-t border-[var(--ui-border)]">
        <div className={mobileToolsSectionLabel}>Reports</div>
        <div className={mobileToolsActionGrid} data-mobile-tools-action-grid="true">
          <button type="button" className={mobileToolsGridBtn} onClick={() => { if (isGameAnalysisRunning && gameAnalysisType === 'quick') stopGameAnalysis(); else startQuickGameAnalysis(); closeMobileToolsAfterAction(); }}>
            <FaChartLine size={18} className="text-[var(--ui-text-muted)]" />
            <span className="text-sm font-medium">{isGameAnalysisRunning && gameAnalysisType === 'quick' ? 'Stop' : 'Quick graph'}</span>
          </button>
          <button type="button" className={mobileToolsGridBtn} onClick={() => { if (isGameAnalysisRunning && gameAnalysisType === 'fast') stopGameAnalysis(); else startFastGameAnalysis(); closeMobileToolsAfterAction(); }}>
            <FaFastForward size={18} className="text-[var(--ui-text-muted)]" />
            <span className="text-sm font-medium">{isGameAnalysisRunning && gameAnalysisType === 'fast' ? 'Stop' : 'Fast review'}</span>
          </button>
          <button type="button" className={mobileToolsGridBtn} onClick={() => { setIsGameAnalysisOpen(true); closeViewMenu(); }}>
            <FaRedoAlt size={18} className="text-[var(--ui-text-muted)]" />
            <span className="text-sm font-medium">Re-analyze</span>
            <span className="text-[11px] ui-text-faint">{shortcutLabels['game-analysis-modal']}</span>
          </button>
          <button type="button" className={mobileToolsGridBtn} onClick={() => { setIsGameReportOpen(true); closeViewMenu(); }}>
            <FaFileAlt size={18} className="text-[var(--ui-text-muted)]" />
            <span className="text-sm font-medium">Game report</span>
            <span className="text-[11px] ui-text-faint">{shortcutLabels['game-report-modal']}</span>
          </button>
        </div>
      </div>

      <div className="border-t border-[var(--ui-border)]">
        <div className={mobileToolsSectionLabel}>View Options</div>
        <div className="mobile-tools-view-options flex flex-col">
          {desktopViewMenu}
        </div>
      </div>
    </div>
  );

  return (
    <div className="ui-bar ui-bar-height ui-bar-pad border-b flex flex-nowrap items-center gap-1 sm:gap-2 select-none overflow-visible min-w-0 w-full max-w-full">
      {/* Mobile menu */}
      <div className="lg:hidden shrink-0">
        <IconButton
          title="Menu"
          onClick={(event) => onOpenMenu(event.detail === 0 ? 'keyboard' : 'pointer')}
          className={topIconClass}
        >
          <FaBars />
        </IconButton>
      </div>

      {/* Desktop file actions */}
      <div className="hidden lg:flex items-center gap-1 shrink-0">
        <IconButton title={quickNewGameTitle} onClick={onQuickNewGame} className={topIconClass}>
          <FaBolt />
        </IconButton>
        <IconButton title={withShortcut('New game', 'new-game')} onClick={onNewGame} className={topIconClass}>
          <FaPlus />
        </IconButton>
        <IconButton title={saveControlTitle} onClick={onSaveSgf} className={topIconClass}>
          <FaSave />
        </IconButton>
        <IconButton title={withShortcut('Save copy to Library', 'save-library')} onClick={onSaveToLibrary} className={topIconClass}>
          <FaBook />
        </IconButton>
        <IconButton title={withShortcut('Load SGF, board photo, or model weights', 'open-sgf')} onClick={onLoadSgf} className={topIconClass}>
          <FaFolderOpen />
        </IconButton>
        <IconButton title={withShortcut('Paste SGF / OGS', 'paste-sgf')} onClick={onPasteSgf} className={topIconClass}>
          <FaPaste />
        </IconButton>
        <IconButton title="Photo Board" onClick={onScanBoard} className={topIconClass}>
          <FaCamera />
        </IconButton>
      </div>

      {/* Divider */}
      <div className="hidden lg:block h-6 w-px bg-[var(--ui-border)] shrink-0" />

      <div className="hidden lg:block flex-1 min-w-2" />

      {/* Engine status */}
      <EngineStatusBadge
        label={engineMeta}
        title={engineMetaTitle}
        dotClass={engineDot}
        tone={engineError ? 'error' : 'default'}
        variant="pill"
        showErrorTag={!!engineError}
        className="hidden xl:flex shrink min-w-0"
        maxWidthClassName="max-w-[180px]"
      />

      {/* Analysis badges */}
      <div className="hidden 2xl:flex items-center gap-1.5 text-xs shrink-0">
        {winRateLabel && (
          <div className="px-2 py-0.5 rounded-md ui-success-soft border text-[var(--ui-success)] font-medium">
            Win {winRateLabel}
          </div>
        )}
        {scoreLeadLabel && (
          <div className="px-2 py-0.5 rounded-md bg-[var(--ui-warning-soft)] border border-[var(--ui-warning)] text-[var(--ui-warning)] font-medium">
            Score {scoreLeadLabel}
          </div>
        )}
        {pointsLostLabel && (
          <div className="px-2 py-0.5 rounded-md ui-danger-soft border text-[var(--ui-danger)] font-medium">
            Δ {pointsLostLabel}
          </div>
        )}
      </div>

      {/* Mode badges */}
      <div className="hidden 2xl:flex items-center gap-1.5 shrink-0">
        {regionOfInterest && (
          <button
            type="button"
            className="px-2 py-0.5 rounded-md border ui-success-soft text-xs font-semibold hover:brightness-110 transition-colors"
            title="Region of interest active (click to clear)"
            onClick={() => setRegionOfInterest(null)}
          >
            ROI
          </button>
        )}
        {isInsertMode && (
          <div className="px-2 py-0.5 rounded-md border ui-accent-soft text-xs font-semibold">
            Insert
          </div>
        )}
        {isEditMode && (
          <div className="px-2 py-0.5 rounded-md border border-[var(--ui-warning)] bg-[var(--ui-warning-soft)] text-[var(--ui-warning)] text-xs font-semibold">
            Edit
          </div>
        )}
      </div>

      <div className="flex items-center gap-1.5" style={{ marginLeft: "auto" }}>
        {isMobile && (
          <button
            type="button"
            className={[
              'min-h-11 px-2 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors',
              isAnalysisMode
                ? 'border border-transparent text-[var(--ui-accent)] shadow-[inset_0_-2px_0_var(--ui-accent)]'
                : 'border border-transparent text-[var(--ui-text-muted)] hover:bg-[var(--ui-surface-2)] hover:text-[var(--ui-text)]',
            ].join(' ')}
            title={withShortcut('Toggle analysis mode', 'toggle-analysis')}
            onClick={toggleAnalysisMode}
          >
            <span className={['inline-block h-2 w-2 rounded-full', engineDot].join(' ')} />
            Analyze
          </button>
        )}
      </div>

      {/* Right controls */}
      <div className="flex items-center gap-1.5 shrink-0">
        {isMobile && (
          <>
            <button
              type="button"
              className={mobileHeaderToggleClass}
              onClick={() => updateSettings({ soundEnabled: !settings.soundEnabled })}
              aria-label={settings.soundEnabled ? `Sound on. Tap to mute. Shortcut ${shortcutLabels['toggle-sound']}` : `Sound off. Tap to turn on. Shortcut ${shortcutLabels['toggle-sound']}`}
              aria-pressed={settings.soundEnabled}
              title={settings.soundEnabled ? withShortcut('Sound on. Tap to mute.', 'toggle-sound') : withShortcut('Sound off. Tap to turn on.', 'toggle-sound')}
              data-mobile-sound-toggle="true"
            >
              {settings.soundEnabled ? <FaVolumeUp aria-hidden="true" /> : <FaVolumeMute aria-hidden="true" />}
            </button>
            <button
              type="button"
              className={mobileHeaderToggleClass}
              onClick={cycleBoardTheme}
              aria-label={`Board theme: ${activeBoardThemeOption.label}. Tap for ${nextBoardThemeOption.label}.`}
              title={`Board theme: ${activeBoardThemeOption.label}. Tap for ${nextBoardThemeOption.label}.`}
              data-mobile-board-theme-cycle="true"
              data-current-board-theme={activeBoardThemeOption.value}
              data-next-board-theme={nextBoardThemeOption.value}
            >
              <FaPalette aria-hidden="true" />
              <span
                aria-hidden="true"
                className="pointer-events-none absolute bottom-1 right-0.5 h-3 w-4 overflow-hidden rounded-[2px] border shadow-sm"
                style={{
                  backgroundColor: activeBoardTheme.board.backgroundColor,
                  borderColor: activeBoardTheme.board.foregroundColor ?? 'var(--ui-border-strong)',
                }}
              >
                <span
                  className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 opacity-70"
                  style={{ backgroundColor: activeBoardTheme.board.foregroundColor ?? 'var(--ui-border-strong)' }}
                />
                <span
                  className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 opacity-70"
                  style={{ backgroundColor: activeBoardTheme.board.foregroundColor ?? 'var(--ui-border-strong)' }}
                />
              </span>
            </button>
          </>
        )}
        {!isMobile && (
          <IconButton
            title="Open side panel"
            onClick={onOpenSidePanel}
            className={[topIconClass, 'lg:hidden'].join(' ')}
          >
            <FaChevronLeft />
          </IconButton>
        )}
        <div className="hidden 2xl:flex items-center gap-1.5">
          <IconButton title={withShortcut('Command palette', 'command-palette')} onClick={onCommandPalette} className={topIconClass}>
            <FaSearch />
          </IconButton>
          <IconButton title={withShortcut('Settings', 'settings-modal')} onClick={onSettings} className={topIconClass}>
            <FaCog />
          </IconButton>
          <IconButton title={withShortcut('Keyboard shortcuts', 'keyboard-help')} onClick={onKeyboardHelp} className={topIconClass}>
            <FaKeyboard />
          </IconButton>
        </div>
        {!isMobile && (
          <LanguageSwitcher
            appLocale={settings.appLocale}
            onLocaleChange={(appLocale) => updateSettings({ appLocale })}
          />
        )}
        <div
          className="relative"
          data-menu-popover
          data-mobile-tools-focus-origin={isMobile ? mobileToolsInputMode : undefined}
        >
          {isMobile ? (
            <IconButton
              title="Tools"
              buttonRef={viewMenuButtonRef}
              onPointerDown={() => updateMobileToolsInputMode('pointer')}
              onClick={(event) => {
                updateMobileToolsInputMode(event.detail === 0 ? 'keyboard' : 'pointer');
                setViewMenuOpen(!viewMenuOpen);
                setAnalysisMenuOpen(false);
              }}
              ariaControls={viewPopoverId}
              ariaExpanded={viewMenuOpen}
              ariaHasPopup="dialog"
              className={[
                topIconClass,
                'rounded-md bg-transparent border border-transparent',
                mobileToolsInputMode === 'pointer' ? 'mobile-tools-pointer-focus' : '',
              ].join(' ')}
            >
              <FaTools size={16} aria-hidden="true" />
            </IconButton>
          ) : (
            <button
              ref={viewMenuButtonRef}
              type="button"
              className="px-2 py-1 rounded-lg sm:px-2.5 sm:py-1.5 bg-[var(--ui-surface)] border border-[var(--ui-border)] text-[var(--ui-text-muted)] hover:bg-[var(--ui-surface-2)] hover:text-[var(--ui-text)] flex items-center gap-1.5 text-sm font-medium transition-colors whitespace-nowrap"
              onClick={() => {
                setViewMenuOpen(!viewMenuOpen);
                setAnalysisMenuOpen(false);
              }}
              title="View options"
              aria-haspopup="dialog"
              aria-expanded={viewMenuOpen}
              aria-controls={viewPopoverId}
            >
              <FaSlidersH size={14} /> View <FaChevronDown size={10} className="opacity-80" />
            </button>
          )}
          {viewMenuOpen && (
            isMobile ? (
              <div
                id={viewPopoverId}
                className="fixed inset-0 z-50"
                role="dialog"
                aria-modal="true"
                aria-labelledby={mobileToolsTitleId}
                data-mobile-tools-dialog="true"
                data-mobile-tools-focus-origin={mobileToolsInputMode}
              >
                <div
                  className="absolute inset-0 bg-black/70"
                  onClick={() => closeViewMenuWithFocus(true, 'pointer')}
                  aria-hidden="true"
                  data-mobile-tools-backdrop="true"
                />
                <div
                  ref={mobileToolsPanelRef}
                  className="absolute inset-0 ui-panel overflow-y-auto overscroll-contain mobile-safe-inset mobile-safe-area-bottom"
                  data-mobile-tools-panel="true"
                >
                  <div
                    className="sticky top-0 z-10 ui-bar ui-bar-height ui-bar-pad border-b flex items-center justify-between bg-[var(--ui-bar)]/95 backdrop-blur-md"
                    data-mobile-tools-header="true"
                  >
                    <div id={mobileToolsTitleId} className="text-sm font-semibold">Tools</div>
                    <button
                      ref={mobileToolsCloseRef}
                      type="button"
                      className={[
                        'ui-control flex items-center justify-center rounded-lg hover:bg-[var(--ui-surface-2)] text-[var(--ui-text-muted)] hover:text-[var(--ui-text)]',
                        mobileToolsInputMode === 'pointer' ? 'mobile-tools-pointer-focus' : '',
                      ].join(' ')}
                      onClick={(event) => closeViewMenuWithFocus(
                        true,
                        event.detail === 0 ? 'keyboard' : 'pointer',
                      )}
                      aria-label="Close tools"
                      title="Close tools"
                    >
                      <FaTimes />
                    </button>
                  </div>
                  <div className="pb-6">
                    {mobileToolsMenu}
                  </div>
                </div>
              </div>
            ) : (
              <div
                id={viewPopoverId}
                className="absolute right-0 top-full mt-2 w-[512px] ui-panel border rounded-lg shadow-xl overflow-hidden z-50"
                role="dialog"
                aria-modal="false"
                aria-labelledby={viewPopoverTitleId}
                data-top-view-menu="true"
              >
                <div id={viewPopoverTitleId} className="sr-only">View options</div>
                {desktopViewMenu}
              </div>
            )
          )}
        </div>
        {!isMobile && (
          <button
            type="button"
            className={[
              'px-2 py-1 rounded-lg sm:px-2.5 sm:py-1.5 text-xs sm:text-sm font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap',
              isAnalysisMode
                ? 'bg-[var(--ui-accent-soft)] border border-[var(--ui-accent)] text-[var(--ui-accent)] shadow-sm shadow-black/20'
                : 'bg-[var(--ui-surface)] border border-[var(--ui-border)] text-[var(--ui-text-muted)] hover:bg-[var(--ui-surface-2)] hover:text-[var(--ui-text)]',
            ].join(' ')}
            title={withShortcut('Toggle analysis mode', 'toggle-analysis')}
            onClick={toggleAnalysisMode}
          >
            <span className={['inline-block h-2 w-2 rounded-full', engineDot].join(' ')} />
            Analyze
          </button>
        )}

        {!isMobile && (
          <div className="relative" data-menu-popover>
            <button
              ref={actionsMenuButtonRef}
              type="button"
              className="px-2 py-1 rounded-lg sm:px-2.5 sm:py-1.5 bg-[var(--ui-surface)] border border-[var(--ui-border)] text-[var(--ui-text-muted)] hover:bg-[var(--ui-surface-2)] hover:text-[var(--ui-text)] flex items-center gap-1.5 text-sm font-medium transition-colors whitespace-nowrap"
              onClick={() => {
                setAnalysisMenuOpen(!analysisMenuOpen);
                setViewMenuOpen(false);
              }}
              title="Analysis actions"
              aria-haspopup="dialog"
              aria-expanded={analysisMenuOpen}
              aria-controls={actionsPopoverId}
            >
              Actions <FaChevronDown size={10} className="opacity-80" />
            </button>
            {analysisMenuOpen && (
              <div
                id={actionsPopoverId}
                className="absolute right-0 top-full mt-2 w-[480px] ui-panel border rounded-lg shadow-xl overflow-hidden z-50 grid grid-cols-2 divide-x divide-[var(--ui-border)]"
                role="dialog"
                aria-modal="false"
                aria-labelledby={actionsPopoverTitleId}
                data-top-actions-menu="true"
              >
                <div id={actionsPopoverTitleId} className="sr-only">Analysis actions</div>
                {/* Column 1 */}
                <div className="flex flex-col">
                  <div className="border-b border-[var(--ui-border)] px-3 py-2 bg-[var(--ui-surface-2)]">
                    <div className="text-xs font-semibold text-[var(--ui-text-muted)] uppercase tracking-wider">AI Tools</div>
                  </div>
                  <button type="button"
                    className="w-full px-3 py-2 text-left hover:bg-[var(--ui-surface-2)] flex items-center justify-between"
                    onClick={() => { analyzeExtra('extra'); setAnalysisMenuOpen(false); }}
                  >
                    <span className="flex items-center gap-2"><FaSearchPlus /> Extra analysis</span>
                    <span className="text-xs ui-text-faint">{shortcutLabels['analysis-extra']}</span>
                  </button>
                  <button type="button"
                    className="w-full px-3 py-2 text-left hover:bg-[var(--ui-surface-2)] flex items-center justify-between"
                    onClick={() => { analyzeExtra('equalize'); setAnalysisMenuOpen(false); }}
                  >
                    <span className="flex items-center gap-2"><FaBalanceScale /> Equalize</span>
                    <span className="text-xs ui-text-faint">{shortcutLabels['analysis-equalize']}</span>
                  </button>
                  <button type="button"
                    className="w-full px-3 py-2 text-left hover:bg-[var(--ui-surface-2)] flex items-center justify-between"
                    onClick={() => { analyzeExtra('sweep'); setAnalysisMenuOpen(false); }}
                  >
                    <span className="flex items-center gap-2"><FaBroom /> Sweep</span>
                    <span className="text-xs ui-text-faint">{shortcutLabels['analysis-sweep']}</span>
                  </button>
                  <button type="button"
                    className="w-full px-3 py-2 text-left hover:bg-[var(--ui-surface-2)] flex items-center justify-between"
                    onClick={() => { analyzeExtra('alternative'); setAnalysisMenuOpen(false); }}
                  >
                    <span className="flex items-center gap-2"><FaRandom /> Alternative</span>
                    <span className="text-xs ui-text-faint">{shortcutLabels['analysis-alternative']}</span>
                  </button>

                  <div className="h-px bg-[var(--ui-border)] w-full mt-auto" />
                  <div className="border-b border-[var(--ui-border)] px-3 py-2 bg-[var(--ui-surface-2)]">
                    <div className="text-xs font-semibold text-[var(--ui-text-muted)] uppercase tracking-wider">Region Control</div>
                  </div>
                  <button type="button"
                    className="w-full px-3 py-2 text-left hover:bg-[var(--ui-surface-2)] flex items-center justify-between"
                    onClick={() => { startSelectRegionOfInterest(); setAnalysisMenuOpen(false); }}
                  >
                    <span className="flex items-center gap-2"><FaCrosshairs /> Select region</span>
                    <span className="text-xs ui-text-faint">{shortcutLabels['select-region']}</span>
                  </button>
                  {regionOfInterest && (
                    <button type="button"
                      className="w-full px-3 py-2 text-left hover:bg-[var(--ui-surface-2)] flex items-center justify-between"
                      onClick={() => { setRegionOfInterest(null); setAnalysisMenuOpen(false); }}
                    >
                      <span className="flex items-center gap-2"><FaTimes /> Clear region</span>
                      <span className="text-xs ui-text-faint">—</span>
                    </button>
                  )}

                  <div className="h-px bg-[var(--ui-border)] w-full" />
                  <div className="border-b border-[var(--ui-border)] px-3 py-2 bg-[var(--ui-surface-2)]">
                    <div className="text-xs font-semibold text-[var(--ui-text-muted)] uppercase tracking-wider">Engine Control</div>
                  </div>
                  <button type="button"
                    className="w-full px-3 py-2 text-left hover:bg-[var(--ui-surface-2)] flex items-center justify-between"
                    onClick={() => { toggleContinuousAnalysis(); setAnalysisMenuOpen(false); }}
                    aria-pressed={isAnalysisMode}
                  >
                    <span className="flex items-center gap-2"><FaChartLine /> Continuous analysis</span>
                    <span className="text-xs ui-text-faint">{shortcutLabels['continuous-analysis']}</span>
                  </button>
                  <button type="button"
                    className="w-full px-3 py-2 text-left hover:bg-[var(--ui-surface-2)] flex items-center justify-between"
                    onClick={() => { makeAiMove(); setAnalysisMenuOpen(false); }}
                  >
                    <span className="flex items-center gap-2"><FaPlay /> AI move</span>
                    <span className="text-xs ui-text-faint">{shortcutLabels['ai-move']}</span>
                  </button>
                  <button type="button"
                    className="w-full px-3 py-2 text-left hover:bg-[var(--ui-surface-2)] flex items-center justify-between"
                    onClick={() => { analyzeExtra('stop'); setAnalysisMenuOpen(false); }}
                  >
                    <span className="flex items-center gap-2"><FaStop /> Stop analysis</span>
                    <span className="text-xs ui-text-faint">{shortcutLabels.escape}</span>
                  </button>
                  <button type="button"
                    className="w-full px-3 py-2 text-left hover:bg-[var(--ui-surface-2)] flex items-center justify-between"
                    onClick={() => { rotateBoard(); setAnalysisMenuOpen(false); }}
                  >
                    <span className="flex items-center gap-2"><FaSyncAlt /> Rotate board</span>
                    <span className="text-xs ui-text-faint">{shortcutLabels['rotate-board']}</span>
                  </button>
                  <button type="button"
                    className="w-full px-3 py-2 text-left hover:bg-[var(--ui-surface-2)] flex items-center justify-between"
                    onClick={() => { toggleTeachMode(); setAnalysisMenuOpen(false); }}
                    aria-pressed={isTeachMode}
                  >
                    <span className="flex items-center gap-2"><FaGraduationCap /> Teach mode</span>
                    <span className="text-xs ui-text-faint">{isTeachMode ? 'on' : 'off'}</span>
                  </button>
                </div>

                {/* Column 2 */}
                <div className="flex flex-col">
                  <div className="border-b border-[var(--ui-border)] px-3 py-2 bg-[var(--ui-surface-2)]">
                    <div className="text-xs font-semibold text-[var(--ui-text-muted)] uppercase tracking-wider">Game Analysis</div>
                  </div>
                  <button type="button"
                    className="w-full px-3 py-2 text-left hover:bg-[var(--ui-surface-2)] flex items-center justify-between"
                    onClick={() => { resetCurrentAnalysis(); setAnalysisMenuOpen(false); }}
                  >
                    <span className="flex items-center gap-2"><FaRedoAlt /> Reset analysis</span>
                    <span className="text-xs ui-text-faint">{shortcutLabels['reset-analysis']}</span>
                  </button>
                  <button type="button"
                    className="w-full px-3 py-2 text-left hover:bg-[var(--ui-surface-2)] flex items-center justify-between disabled:opacity-50 disabled:cursor-not-allowed"
                    onClick={() => { clearAnalysisCache(); setAnalysisMenuOpen(false); }}
                    disabled={analysisCacheSize === 0 || isGameAnalysisRunning}
                    title={
                      analysisCacheSize > 0
                        ? `Clear ${analysisCacheSize} cached ${analysisCacheSize === 1 ? 'analysis' : 'analyses'}`
                        : 'No cached analysis'
                    }
                  >
                    <span className="flex items-center gap-2"><FaTrash /> Clear analysis cache</span>
                    <span className="text-xs ui-text-faint">{analysisCacheSize > 0 ? analysisCacheSize : '—'}</span>
                  </button>
                  <button type="button"
                    className="w-full px-3 py-2 text-left hover:bg-[var(--ui-surface-2)] flex items-center justify-between"
                    onClick={() => { toggleInsertMode(); setAnalysisMenuOpen(false); }}
                    aria-pressed={isInsertMode}
                  >
                    <span className="flex items-center gap-2"><FaLayerGroup /> Insert mode</span>
                    <span className="text-xs ui-text-faint">{shortcutLabels['toggle-insert']} · {isInsertMode ? 'on' : 'off'}</span>
                  </button>
                  <button type="button"
                    className="w-full px-3 py-2 text-left hover:bg-[var(--ui-surface-2)] flex items-center justify-between"
                    onClick={() => { selfplayToEnd(); setAnalysisMenuOpen(false); }}
                  >
                    <span className="flex items-center gap-2"><FaFastForward /> Selfplay to end</span>
                    <span className="text-xs ui-text-faint">{shortcutLabels.selfplay}</span>
                  </button>

                  <div className="h-px bg-[var(--ui-border)] w-full mt-auto" />
                  <div className="border-b border-[var(--ui-border)] px-3 py-2 bg-[var(--ui-surface-2)]">
                    <div className="text-xs font-semibold text-[var(--ui-text-muted)] uppercase tracking-wider">Reports</div>
                  </div>
                  <button type="button"
                    className="w-full px-3 py-2 text-left hover:bg-[var(--ui-surface-2)] flex items-center justify-between"
                    onClick={() => {
                      if (isGameAnalysisRunning && gameAnalysisType === 'quick') stopGameAnalysis();
                      else startQuickGameAnalysis();
                      setAnalysisMenuOpen(false);
                    }}
                  >
                    <span className="flex items-center gap-2"><FaChartLine /> {isGameAnalysisRunning && gameAnalysisType === 'quick' ? 'Stop quick analysis' : 'Analyze game (quick graph)'}</span>
                    <span className="text-xs ui-text-faint">{isGameAnalysisRunning && gameAnalysisType === 'quick' ? `${gameAnalysisDone}/${gameAnalysisTotal}` : '—'}</span>
                  </button>
                  <button type="button"
                    className="w-full px-3 py-2 text-left hover:bg-[var(--ui-surface-2)] flex items-center justify-between"
                    onClick={() => {
                      if (isGameAnalysisRunning && gameAnalysisType === 'fast') stopGameAnalysis();
                      else startFastGameAnalysis();
                      setAnalysisMenuOpen(false);
                    }}
                  >
                    <span className="flex items-center gap-2"><FaFastForward /> {isGameAnalysisRunning && gameAnalysisType === 'fast' ? 'Stop fast analysis' : 'Analyze game (fast review)'}</span>
                    <span className="text-xs ui-text-faint">{isGameAnalysisRunning && gameAnalysisType === 'fast' ? `${gameAnalysisDone}/${gameAnalysisTotal}` : '—'}</span>
                  </button>
                  <button type="button"
                    className="w-full px-3 py-2 text-left hover:bg-[var(--ui-surface-2)] flex items-center justify-between"
                    onClick={() => { setIsGameAnalysisOpen(true); setAnalysisMenuOpen(false); }}
                  >
                    <span className="flex items-center gap-2"><FaRedoAlt /> Re-analyze game…</span>
                    <span className="text-xs ui-text-faint">{shortcutLabels['game-analysis-modal']}</span>
                  </button>
                  <button type="button"
                    className="w-full px-3 py-2 text-left hover:bg-[var(--ui-surface-2)] flex items-center justify-between"
                    onClick={() => { setIsGameReportOpen(true); setAnalysisMenuOpen(false); }}
                  >
                    <span className="flex items-center gap-2"><FaFileAlt /> Game report…</span>
                    <span className="text-xs ui-text-faint">{shortcutLabels['game-report-modal']}</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
