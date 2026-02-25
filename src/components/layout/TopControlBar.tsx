import React from 'react';
import {
  FaBars,
  FaChevronDown,
  FaChevronLeft,
  FaCopy,
  FaVolumeUp,
  FaVolumeMute,
  FaPaste,
  FaSlidersH,
  FaRobot,
  FaPlay,
  FaPlus,
  FaStop,
  FaSyncAlt,
  FaTimes,
  FaCog,
  FaKeyboard,
  FaEllipsisV,
} from 'react-icons/fa';
import type { GameSettings, RegionOfInterest } from '../../types';
import type { AnalysisControlsState } from './types';
import { EngineStatusBadge, IconButton } from './ui';
import { BOARD_THEME_OPTIONS } from '../../utils/boardThemes';
import { UI_THEME_OPTIONS } from '../../utils/uiThemes';

interface TopControlBarProps {
  settings: GameSettings;
  updateControls: (partial: Partial<AnalysisControlsState>) => void;
  updateSettings: (partial: Partial<GameSettings>) => void;
  regionOfInterest: RegionOfInterest | null;
  setRegionOfInterest: (r: null) => void;
  isInsertMode: boolean;
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
  startFastGameAnalysis: () => void;
  stopGameAnalysis: () => void;
  setIsGameAnalysisOpen: (v: boolean) => void;
  setIsGameReportOpen: (v: boolean) => void;
  // Menu callbacks
  onOpenMenu: () => void;
  onNewGame: () => void;
  onOpenSidePanel: () => void;
  onCopySgf: () => void;
  onPasteSgf: () => void;
  onSettings: () => void;
  onKeyboardHelp: () => void;
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
  onNewGame,
  onOpenSidePanel,
  onCopySgf,
  onPasteSgf,
  onSettings,
  onKeyboardHelp,
  winRateLabel,
  scoreLeadLabel,
  pointsLostLabel,
  engineMeta = null,
  engineMetaTitle,
  engineError,
  isMobile = false,
}) => {
  const topIconClass = 'ui-control';
  const [isFullscreen, setIsFullscreen] = React.useState(() => {
    if (typeof document === 'undefined') return false;
    return !!document.fullscreenElement;
  });

  React.useEffect(() => {
    if (typeof document === 'undefined') return;
    const handle = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handle);
    return () => document.removeEventListener('fullscreenchange', handle);
  }, []);

  const toggleFullscreen = () => {
    if (typeof document === 'undefined') return;
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => { });
    } else {
      document.exitFullscreen?.().catch(() => { });
    }
  };
  const closeViewMenu = () => setViewMenuOpen(false);
  const closeViewMenuIfMobile = () => {
    if (isMobile) setViewMenuOpen(false);
  };
  const desktopViewMenu = (
    <div className="grid grid-cols-1 sm:grid-cols-2">
      {/* Settings column */}
      <div className="flex flex-col border-r border-[var(--ui-border)]">
        <button
          className="w-full px-3 py-2 text-left hover:bg-[var(--ui-surface-2)] flex items-center justify-between"
          onClick={() => { toggleFullscreen(); closeViewMenuIfMobile(); }}
        >
          <span>Fullscreen</span><span className="text-xs ui-text-faint">{isFullscreen ? 'on' : 'off'}</span>
        </button>
        <button
          className="w-full px-3 py-2 text-left hover:bg-[var(--ui-surface-2)] flex items-center justify-between"
          onClick={() => { onCopySgf(); closeViewMenuIfMobile(); }}
        >
          <span className="flex items-center gap-2"><FaCopy /> Copy SGF</span><span className="text-xs ui-text-faint">Ctrl+C</span>
        </button>
        <button
          className="w-full px-3 py-2 text-left hover:bg-[var(--ui-surface-2)] flex items-center justify-between"
          onClick={() => { onPasteSgf(); closeViewMenuIfMobile(); }}
        >
          <span className="flex items-center gap-2"><FaPaste /> Paste SGF/OGS</span><span className="text-xs ui-text-faint">Ctrl+V</span>
        </button>
        <div className="h-px bg-[var(--ui-border)] w-full" />
        <button
          className="w-full px-3 py-2 text-left hover:bg-[var(--ui-surface-2)] flex items-center justify-between"
          onClick={() => { updateSettings({ showCoordinates: !settings.showCoordinates }); closeViewMenuIfMobile(); }}
        >
          <span>Coordinates</span><span className="text-xs ui-text-faint">{settings.showCoordinates ? 'on' : 'off'}</span>
        </button>
        <button
          className="w-full px-3 py-2 text-left hover:bg-[var(--ui-surface-2)] flex items-center justify-between"
          onClick={() => { updateSettings({ showNextMovePreview: !settings.showNextMovePreview }); closeViewMenuIfMobile(); }}
        >
          <span>Next move preview</span><span className="text-xs ui-text-faint">{settings.showNextMovePreview ? 'on' : 'off'}</span>
        </button>
        <button
          className="w-full px-3 py-2 text-left hover:bg-[var(--ui-surface-2)] flex items-center justify-between"
          onClick={() => { updateSettings({ showMoveNumbers: !settings.showMoveNumbers }); closeViewMenuIfMobile(); }}
        >
          <span>Move numbers</span><span className="text-xs ui-text-faint">{settings.showMoveNumbers ? 'on' : 'off'}</span>
        </button>
        <button
          className="w-full px-3 py-2 text-left hover:bg-[var(--ui-surface-2)] flex items-center justify-between"
          onClick={() => { updateSettings({ showBoardControls: !settings.showBoardControls }); closeViewMenuIfMobile(); }}
        >
          <span>Board controls</span><span className="text-xs ui-text-faint">{settings.showBoardControls ? 'on' : 'off'}</span>
        </button>
        <button
          className="w-full px-3 py-2 text-left hover:bg-[var(--ui-surface-2)] flex items-center justify-between"
          onClick={() => { updateSettings({ soundEnabled: !settings.soundEnabled }); closeViewMenuIfMobile(); }}
        >
          <span className="flex items-center gap-2">{settings.soundEnabled ? <FaVolumeUp /> : <FaVolumeMute />} Sound</span>
          <span className="text-xs ui-text-faint">{settings.soundEnabled ? 'on' : 'off'}</span>
        </button>
      </div>

      {/* Overlays and Themes column */}
      <div className="flex flex-col">
        <div className="px-3 py-2 text-xs font-semibold text-[var(--ui-text-muted)] uppercase tracking-wider bg-[var(--ui-surface-2)]">Analysis Overlays</div>
        <button
          className="w-full px-3 py-2 text-left hover:bg-[var(--ui-surface-2)] flex items-center justify-between"
          onClick={() => { updateControls({ analysisShowChildren: !settings.analysisShowChildren }); closeViewMenuIfMobile(); }}
        >
          <span>Children (Q)</span><span className="text-xs ui-text-faint">{settings.analysisShowChildren ? 'on' : 'off'}</span>
        </button>
        <button
          className="w-full px-3 py-2 text-left hover:bg-[var(--ui-surface-2)] flex items-center justify-between"
          onClick={() => { updateControls({ analysisShowEval: !settings.analysisShowEval }); closeViewMenuIfMobile(); }}
        >
          <span>Dots (W)</span><span className="text-xs ui-text-faint">{settings.analysisShowEval ? 'on' : 'off'}</span>
        </button>
        <button
          className={['w-full px-3 py-2 text-left flex items-center justify-between', settings.analysisShowPolicy ? 'opacity-50 cursor-not-allowed' : 'hover:bg-[var(--ui-surface-2)]'].join(' ')}
          disabled={settings.analysisShowPolicy}
          onClick={() => { updateControls({ analysisShowHints: !settings.analysisShowHints }); closeViewMenuIfMobile(); }}
        >
          <span>Top moves (E)</span><span className="text-xs ui-text-faint">{settings.analysisShowHints ? 'on' : 'off'}</span>
        </button>
        <button
          className="w-full px-3 py-2 text-left hover:bg-[var(--ui-surface-2)] flex items-center justify-between"
          onClick={() => { updateControls({ analysisShowPolicy: !settings.analysisShowPolicy }); closeViewMenuIfMobile(); }}
        >
          <span>Policy (R)</span><span className="text-xs ui-text-faint">{settings.analysisShowPolicy ? 'on' : 'off'}</span>
        </button>
        <button
          className="w-full px-3 py-2 text-left hover:bg-[var(--ui-surface-2)] flex items-center justify-between"
          onClick={() => { updateControls({ analysisShowOwnership: !settings.analysisShowOwnership }); closeViewMenuIfMobile(); }}
        >
          <span>Territory (T)</span><span className="text-xs ui-text-faint">{settings.analysisShowOwnership ? 'on' : 'off'}</span>
        </button>

        <div className="border-t border-[var(--ui-border)] w-full mt-auto" />
        <div className="px-3 py-2 text-xs font-semibold text-[var(--ui-text-muted)] uppercase tracking-wider bg-[var(--ui-surface-2)] w-full">Themes</div>
        <div className="flex flex-col p-3 gap-3">
          <div>
            <div className="text-xs ui-text-faint mb-1">UI theme</div>
            <select
              value={settings.uiTheme}
              onChange={(e) => { updateSettings({ uiTheme: e.target.value as GameSettings['uiTheme'] }); closeViewMenuIfMobile(); }}
              className="w-full ui-input border rounded px-2 py-1 text-xs text-[var(--ui-text)]"
            >
              {UI_THEME_OPTIONS.map((theme) => <option key={theme.value} value={theme.value}>{theme.label}</option>)}
            </select>
          </div>
          <div>
            <div className="text-xs ui-text-faint mb-1">Board theme</div>
            <select
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

  const mobileToolsGridBtn = "flex flex-col items-center justify-center p-3 gap-1.5 hover:bg-[var(--ui-surface-2)] text-center transition-colors";
  const mobileToolsMenu = (
    <div className="flex flex-col gap-4 p-4">
      <div className="bg-[var(--ui-surface)] border border-[var(--ui-border)] rounded-xl overflow-hidden shadow-sm">
        <div className="px-3 py-2 bg-[var(--ui-surface-2)] border-b border-[var(--ui-border)] text-xs font-semibold text-[var(--ui-text-muted)] uppercase tracking-wider">AI Tools</div>
        <div className="grid grid-cols-2 lg:grid-cols-4 divide-x divide-y divide-[var(--ui-border)] [&>button:nth-child(-n+2)]:border-t-0">
          <button className={mobileToolsGridBtn} onClick={() => { analyzeExtra('extra'); closeViewMenu(); }}>
            <FaRobot size={18} className="text-[var(--ui-text-muted)]" />
            <span className="text-sm font-medium">Extra analysis</span>
          </button>
          <button className={mobileToolsGridBtn} onClick={() => { analyzeExtra('equalize'); closeViewMenu(); }}>
            <FaRobot size={18} className="text-[var(--ui-text-muted)]" />
            <span className="text-sm font-medium">Equalize</span>
          </button>
          <button className={mobileToolsGridBtn} onClick={() => { analyzeExtra('sweep'); closeViewMenu(); }}>
            <FaRobot size={18} className="text-[var(--ui-text-muted)]" />
            <span className="text-sm font-medium">Sweep</span>
          </button>
          <button className={mobileToolsGridBtn} onClick={() => { analyzeExtra('alternative'); closeViewMenu(); }}>
            <FaRobot size={18} className="text-[var(--ui-text-muted)]" />
            <span className="text-sm font-medium">Alternative</span>
          </button>
          <button className={mobileToolsGridBtn} onClick={() => { startSelectRegionOfInterest(); closeViewMenu(); }}>
            <FaRobot size={18} className="text-[var(--ui-text-muted)]" />
            <span className="text-sm font-medium">Select region</span>
          </button>
          {regionOfInterest && (
            <button className={`${mobileToolsGridBtn} text-[var(--ui-danger)]`} onClick={() => { setRegionOfInterest(null); closeViewMenu(); }}>
              <FaTimes size={18} />
              <span className="text-sm font-medium">Clear region</span>
            </button>
          )}
        </div>
      </div>

      <div className="bg-[var(--ui-surface)] border border-[var(--ui-border)] rounded-xl overflow-hidden shadow-sm">
        <div className="px-3 py-2 bg-[var(--ui-surface-2)] border-b border-[var(--ui-border)] text-xs font-semibold text-[var(--ui-text-muted)] uppercase tracking-wider">Game Control</div>
        <div className="grid grid-cols-2 divide-x divide-y divide-[var(--ui-border)] [&>button:nth-child(-n+2)]:border-t-0">
          <button className={mobileToolsGridBtn} onClick={() => { toggleContinuousAnalysis(); closeViewMenu(); }}>
            <FaRobot size={18} className={isAnalysisMode ? "text-[var(--ui-accent)]" : "text-[var(--ui-text-muted)]"} />
            <span className="text-sm font-medium">Cont. analysis</span>
          </button>
          <button className={mobileToolsGridBtn} onClick={() => { makeAiMove(); closeViewMenu(); }}>
            <FaPlay size={18} className="text-[var(--ui-success)]" />
            <span className="text-sm font-medium">AI move</span>
          </button>
          <button className={mobileToolsGridBtn} onClick={() => { toggleInsertMode(); closeViewMenu(); }}>
            <FaPlay size={18} className={isInsertMode ? "text-[var(--ui-accent)]" : "text-[var(--ui-text-muted)]"} />
            <span className="text-sm font-medium">Insert mode</span>
          </button>
          <button className={mobileToolsGridBtn} onClick={() => { selfplayToEnd(); closeViewMenu(); }}>
            <FaPlay size={18} className="text-[var(--ui-text-muted)]" />
            <span className="text-sm font-medium">Selfplay to end</span>
          </button>
          <button className={mobileToolsGridBtn} onClick={() => { rotateBoard(); closeViewMenu(); }}>
            <FaSyncAlt size={18} className="text-[var(--ui-text-muted)]" />
            <span className="text-sm font-medium">Rotate board</span>
          </button>
          <button className={mobileToolsGridBtn} onClick={() => { toggleTeachMode(); closeViewMenu(); }}>
            <FaRobot size={18} className={isTeachMode ? "text-[var(--ui-accent)]" : "text-[var(--ui-text-muted)]"} />
            <span className="text-sm font-medium">Teach mode</span>
          </button>
        </div>
      </div>

      <div className="bg-[var(--ui-surface)] border border-[var(--ui-border)] rounded-xl overflow-hidden shadow-sm">
        <div className="px-3 py-2 bg-[var(--ui-surface-2)] border-b border-[var(--ui-border)] text-xs font-semibold text-[var(--ui-text-muted)] uppercase tracking-wider">Reports</div>
        <div className="grid grid-cols-2 divide-x divide-y divide-[var(--ui-border)] [&>button:nth-child(-n+2)]:border-t-0">
          <button className={mobileToolsGridBtn} onClick={() => { if (isGameAnalysisRunning && gameAnalysisType === 'quick') stopGameAnalysis(); else startQuickGameAnalysis(); closeViewMenu(); }}>
            <FaRobot size={18} className="text-[var(--ui-text-muted)]" />
            <span className="text-sm font-medium">{isGameAnalysisRunning && gameAnalysisType === 'quick' ? 'Stop' : 'Quick graph'}</span>
          </button>
          <button className={mobileToolsGridBtn} onClick={() => { if (isGameAnalysisRunning && gameAnalysisType === 'fast') stopGameAnalysis(); else startFastGameAnalysis(); closeViewMenu(); }}>
            <FaRobot size={18} className="text-[var(--ui-text-muted)]" />
            <span className="text-sm font-medium">{isGameAnalysisRunning && gameAnalysisType === 'fast' ? 'Stop' : 'Fast MCTS'}</span>
          </button>
          <button className={mobileToolsGridBtn} onClick={() => { setIsGameAnalysisOpen(true); closeViewMenu(); }}>
            <FaRobot size={18} className="text-[var(--ui-text-muted)]" />
            <span className="text-sm font-medium">Re-analyze</span>
          </button>
          <button className={mobileToolsGridBtn} onClick={() => { setIsGameReportOpen(true); closeViewMenu(); }}>
            <FaRobot size={18} className="text-[var(--ui-text-muted)]" />
            <span className="text-sm font-medium">Game report</span>
          </button>
        </div>
      </div>

      <div className="bg-[var(--ui-surface)] border border-[var(--ui-border)] rounded-xl overflow-hidden shadow-sm">
        <div className="px-3 py-2 bg-[var(--ui-surface-2)] border-b border-[var(--ui-border)] text-xs font-semibold text-[var(--ui-text-muted)] uppercase tracking-wider">View Options</div>
        <div className="flex flex-col">
          {desktopViewMenu}
        </div>
      </div>
    </div>
  );

  return (
    <div className="ui-bar ui-bar-height ui-bar-pad border-b flex flex-wrap items-center gap-1 sm:gap-2 gap-y-1.5 select-none">
      {/* Mobile menu */}
      <div className="md:hidden">
        <IconButton title="Menu" onClick={onOpenMenu} className={topIconClass}>
          <FaBars />
        </IconButton>
      </div>

      {/* New game */}
      <div className="hidden md:flex items-center gap-1.5">
        <button
          type="button"
          title="New game (Ctrl+N)"
          onClick={onNewGame}
          className="px-2 py-1 rounded-lg sm:px-2.5 sm:py-1.5 bg-[var(--ui-surface)] border border-[var(--ui-border)] text-[var(--ui-text-muted)] hover:bg-[var(--ui-surface-2)] hover:text-white flex items-center gap-1.5 text-sm font-medium transition-colors"
        >
          <FaPlus size={12} /> New
        </button>
      </div>

      {/* Divider */}
      <div className="hidden md:block h-6 w-px bg-[var(--ui-border)]" />

      {/* Analysis toggles */}
      <div className="order-last xl:order-none w-full xl:w-auto flex items-center gap-1 flex-wrap">
      </div>

      <div className="hidden xl:block flex-grow" />

      {/* Engine status */}
      <EngineStatusBadge
        label={engineMeta}
        title={engineMetaTitle}
        dotClass={engineDot}
        tone={engineError ? 'error' : 'default'}
        variant="pill"
        showErrorTag={!!engineError}
        className="hidden lg:flex"
        maxWidthClassName="max-w-[200px]"
      />

      {/* Analysis badges */}
      <div className="hidden xl:flex items-center gap-1.5 text-xs">
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
      <div className="flex items-center gap-1.5">
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
      </div>

      {/* Right controls */}
      <div className="flex items-center gap-1.5">
        {!isMobile && (
          <IconButton
            title="Open side panel"
            onClick={onOpenSidePanel}
            className={[topIconClass, 'lg:hidden'].join(' ')}
          >
            <FaChevronLeft />
          </IconButton>
        )}
        <div className="hidden md:flex items-center gap-1.5">
          <IconButton title="Settings (F8)" onClick={onSettings} className={topIconClass}>
            <FaCog />
          </IconButton>
          <IconButton title="Keyboard shortcuts (?)" onClick={onKeyboardHelp} className={topIconClass}>
            <FaKeyboard />
          </IconButton>
        </div>
        <div className="relative" data-menu-popover>
          {isMobile ? (
            <IconButton
              title="Tools"
              onClick={() => {
                setViewMenuOpen(!viewMenuOpen);
                setAnalysisMenuOpen(false);
              }}
              className={[topIconClass, 'bg-[var(--ui-surface)] border border-[var(--ui-border)]'].join(' ')}
            >
              <FaEllipsisV size={16} />
            </IconButton>
          ) : (
            <button
              type="button"
              className="px-2 py-1 rounded-lg sm:px-2.5 sm:py-1.5 bg-[var(--ui-surface)] border border-[var(--ui-border)] text-[var(--ui-text-muted)] hover:bg-[var(--ui-surface-2)] hover:text-white flex items-center gap-1.5 text-sm font-medium transition-colors"
              onClick={() => setViewMenuOpen(!viewMenuOpen)}
              title="View options"
            >
              <FaSlidersH size={14} /> View <FaChevronDown size={10} className="opacity-80" />
            </button>
          )}
          {viewMenuOpen && (
            isMobile ? (
              <div className="fixed inset-0 z-50">
                <button
                  className="absolute inset-0 bg-black/70"
                  onClick={() => setViewMenuOpen(false)}
                  aria-label="Close tools"
                />
                <div className="absolute inset-0 ui-panel overflow-y-auto overscroll-contain mobile-safe-inset mobile-safe-area-bottom">
                  <div className="ui-bar ui-bar-height ui-bar-pad border-b flex items-center justify-between">
                    <div className="text-sm font-semibold">Tools</div>
                    <button
                      type="button"
                      className="ui-control flex items-center justify-center rounded-lg hover:bg-[var(--ui-surface-2)] text-[var(--ui-text-muted)] hover:text-white"
                      onClick={() => setViewMenuOpen(false)}
                      aria-label="Close tools"
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
              <div className="absolute right-0 top-full mt-2 w-[512px] ui-panel border rounded-lg shadow-xl overflow-hidden z-50">
                {desktopViewMenu}
              </div>
            )
          )}
        </div>
        <button
          type="button"
          className={[
            'px-2 py-1 rounded-lg sm:px-2.5 sm:py-1.5 text-xs sm:text-sm font-medium flex items-center gap-1.5 transition-colors',
            isAnalysisMode
              ? 'bg-[var(--ui-accent-soft)] border border-[var(--ui-accent)] text-[var(--ui-accent)] shadow-sm shadow-black/20'
              : 'bg-[var(--ui-surface)] border border-[var(--ui-border)] text-[var(--ui-text-muted)] hover:bg-[var(--ui-surface-2)] hover:text-white',
          ].join(' ')}
          title="Toggle analysis mode (Tab)"
          onClick={toggleAnalysisMode}
        >
          <span className={['inline-block h-2 w-2 rounded-full', engineDot].join(' ')} />
          Analyze
        </button>

        {!isMobile && (
          <div className="relative" data-menu-popover>
            <button
              type="button"
              className="px-2 py-1 rounded-lg sm:px-2.5 sm:py-1.5 bg-[var(--ui-surface)] border border-[var(--ui-border)] text-[var(--ui-text-muted)] hover:bg-[var(--ui-surface-2)] hover:text-white flex items-center gap-1.5 text-sm font-medium transition-colors"
              onClick={() => setAnalysisMenuOpen(!analysisMenuOpen)}
              title="Analysis actions"
            >
              Actions <FaChevronDown size={10} className="opacity-80" />
            </button>
            {analysisMenuOpen && (
              <div className="absolute right-0 top-full mt-2 w-[480px] ui-panel border rounded-lg shadow-xl overflow-hidden z-50 grid grid-cols-2 divide-x divide-[var(--ui-border)]">
                {/* Column 1 */}
                <div className="flex flex-col">
                  <div className="border-b border-[var(--ui-border)] px-3 py-2 bg-[var(--ui-surface-2)]">
                    <div className="text-xs font-semibold text-[var(--ui-text-muted)] uppercase tracking-wider">AI Tools</div>
                  </div>
                  <button
                    className="w-full px-3 py-2 text-left hover:bg-[var(--ui-surface-2)] flex items-center justify-between"
                    onClick={() => { analyzeExtra('extra'); setAnalysisMenuOpen(false); }}
                  >
                    <span className="flex items-center gap-2"><FaRobot /> Extra analysis</span>
                    <span className="text-xs ui-text-faint">A</span>
                  </button>
                  <button
                    className="w-full px-3 py-2 text-left hover:bg-[var(--ui-surface-2)] flex items-center justify-between"
                    onClick={() => { analyzeExtra('equalize'); setAnalysisMenuOpen(false); }}
                  >
                    <span className="flex items-center gap-2"><FaRobot /> Equalize</span>
                    <span className="text-xs ui-text-faint">S</span>
                  </button>
                  <button
                    className="w-full px-3 py-2 text-left hover:bg-[var(--ui-surface-2)] flex items-center justify-between"
                    onClick={() => { analyzeExtra('sweep'); setAnalysisMenuOpen(false); }}
                  >
                    <span className="flex items-center gap-2"><FaRobot /> Sweep</span>
                    <span className="text-xs ui-text-faint">D</span>
                  </button>
                  <button
                    className="w-full px-3 py-2 text-left hover:bg-[var(--ui-surface-2)] flex items-center justify-between"
                    onClick={() => { analyzeExtra('alternative'); setAnalysisMenuOpen(false); }}
                  >
                    <span className="flex items-center gap-2"><FaRobot /> Alternative</span>
                    <span className="text-xs ui-text-faint">F</span>
                  </button>

                  <div className="h-px bg-[var(--ui-border)] w-full mt-auto" />
                  <div className="border-b border-[var(--ui-border)] px-3 py-2 bg-[var(--ui-surface-2)]">
                    <div className="text-xs font-semibold text-[var(--ui-text-muted)] uppercase tracking-wider">Region Control</div>
                  </div>
                  <button
                    className="w-full px-3 py-2 text-left hover:bg-[var(--ui-surface-2)] flex items-center justify-between"
                    onClick={() => { startSelectRegionOfInterest(); setAnalysisMenuOpen(false); }}
                  >
                    <span className="flex items-center gap-2"><FaRobot /> Select region</span>
                    <span className="text-xs ui-text-faint">G</span>
                  </button>
                  {regionOfInterest && (
                    <button
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
                  <button
                    className="w-full px-3 py-2 text-left hover:bg-[var(--ui-surface-2)] flex items-center justify-between"
                    onClick={() => { toggleContinuousAnalysis(); setAnalysisMenuOpen(false); }}
                  >
                    <span className="flex items-center gap-2"><FaRobot /> Continuous analysis</span>
                    <span className="text-xs ui-text-faint">Space</span>
                  </button>
                  <button
                    className="w-full px-3 py-2 text-left hover:bg-[var(--ui-surface-2)] flex items-center justify-between"
                    onClick={() => { makeAiMove(); setAnalysisMenuOpen(false); }}
                  >
                    <span className="flex items-center gap-2"><FaPlay /> AI move</span>
                    <span className="text-xs ui-text-faint">Enter</span>
                  </button>
                  <button
                    className="w-full px-3 py-2 text-left hover:bg-[var(--ui-surface-2)] flex items-center justify-between"
                    onClick={() => { analyzeExtra('stop'); setAnalysisMenuOpen(false); }}
                  >
                    <span className="flex items-center gap-2"><FaStop /> Stop analysis</span>
                    <span className="text-xs ui-text-faint">Esc</span>
                  </button>
                  <button
                    className="w-full px-3 py-2 text-left hover:bg-[var(--ui-surface-2)] flex items-center justify-between"
                    onClick={() => { rotateBoard(); setAnalysisMenuOpen(false); }}
                  >
                    <span className="flex items-center gap-2"><FaSyncAlt /> Rotate board</span>
                    <span className="text-xs ui-text-faint">O</span>
                  </button>
                  <button
                    className="w-full px-3 py-2 text-left hover:bg-[var(--ui-surface-2)] flex items-center justify-between"
                    onClick={() => { toggleTeachMode(); setAnalysisMenuOpen(false); }}
                  >
                    <span className="flex items-center gap-2"><FaRobot /> Teach mode</span>
                    <span className="text-xs ui-text-faint">{isTeachMode ? 'on' : 'off'}</span>
                  </button>
                </div>

                {/* Column 2 */}
                <div className="flex flex-col">
                  <div className="border-b border-[var(--ui-border)] px-3 py-2 bg-[var(--ui-surface-2)]">
                    <div className="text-xs font-semibold text-[var(--ui-text-muted)] uppercase tracking-wider">Game Analysis</div>
                  </div>
                  <button
                    className="w-full px-3 py-2 text-left hover:bg-[var(--ui-surface-2)] flex items-center justify-between"
                    onClick={() => { resetCurrentAnalysis(); setAnalysisMenuOpen(false); }}
                  >
                    <span className="flex items-center gap-2"><FaStop /> Reset analysis</span>
                    <span className="text-xs ui-text-faint">H</span>
                  </button>
                  <button
                    className="w-full px-3 py-2 text-left hover:bg-[var(--ui-surface-2)] flex items-center justify-between"
                    onClick={() => { toggleInsertMode(); setAnalysisMenuOpen(false); }}
                  >
                    <span className="flex items-center gap-2"><FaPlay /> Insert mode</span>
                    <span className="text-xs ui-text-faint">I {isInsertMode ? 'on' : 'off'}</span>
                  </button>
                  <button
                    className="w-full px-3 py-2 text-left hover:bg-[var(--ui-surface-2)] flex items-center justify-between"
                    onClick={() => { selfplayToEnd(); setAnalysisMenuOpen(false); }}
                  >
                    <span className="flex items-center gap-2"><FaPlay /> Selfplay to end</span>
                    <span className="text-xs ui-text-faint">L</span>
                  </button>

                  <div className="h-px bg-[var(--ui-border)] w-full mt-auto" />
                  <div className="border-b border-[var(--ui-border)] px-3 py-2 bg-[var(--ui-surface-2)]">
                    <div className="text-xs font-semibold text-[var(--ui-text-muted)] uppercase tracking-wider">Reports</div>
                  </div>
                  <button
                    className="w-full px-3 py-2 text-left hover:bg-[var(--ui-surface-2)] flex items-center justify-between"
                    onClick={() => {
                      if (isGameAnalysisRunning && gameAnalysisType === 'quick') stopGameAnalysis();
                      else startQuickGameAnalysis();
                      setAnalysisMenuOpen(false);
                    }}
                  >
                    <span className="flex items-center gap-2"><FaRobot /> {isGameAnalysisRunning && gameAnalysisType === 'quick' ? 'Stop quick analysis' : 'Analyze game (quick graph)'}</span>
                    <span className="text-xs ui-text-faint">{isGameAnalysisRunning && gameAnalysisType === 'quick' ? `${gameAnalysisDone}/${gameAnalysisTotal}` : '—'}</span>
                  </button>
                  <button
                    className="w-full px-3 py-2 text-left hover:bg-[var(--ui-surface-2)] flex items-center justify-between"
                    onClick={() => {
                      if (isGameAnalysisRunning && gameAnalysisType === 'fast') stopGameAnalysis();
                      else startFastGameAnalysis();
                      setAnalysisMenuOpen(false);
                    }}
                  >
                    <span className="flex items-center gap-2"><FaRobot /> {isGameAnalysisRunning && gameAnalysisType === 'fast' ? 'Stop fast analysis' : 'Analyze game (fast MCTS)'}</span>
                    <span className="text-xs ui-text-faint">{isGameAnalysisRunning && gameAnalysisType === 'fast' ? `${gameAnalysisDone}/${gameAnalysisTotal}` : '—'}</span>
                  </button>
                  <button
                    className="w-full px-3 py-2 text-left hover:bg-[var(--ui-surface-2)] flex items-center justify-between"
                    onClick={() => { setIsGameAnalysisOpen(true); setAnalysisMenuOpen(false); }}
                  >
                    <span className="flex items-center gap-2"><FaRobot /> Re-analyze game…</span>
                    <span className="text-xs ui-text-faint">F2</span>
                  </button>
                  <button
                    className="w-full px-3 py-2 text-left hover:bg-[var(--ui-surface-2)] flex items-center justify-between"
                    onClick={() => { setIsGameReportOpen(true); setAnalysisMenuOpen(false); }}
                  >
                    <span className="flex items-center gap-2"><FaRobot /> Game report…</span>
                    <span className="text-xs ui-text-faint">F3</span>
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
