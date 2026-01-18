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
} from 'react-icons/fa';
import type { GameSettings, RegionOfInterest } from '../../types';
import type { AnalysisControlsState } from './types';
import { EngineStatusBadge, IconButton, TogglePill } from './ui';
import { BOARD_THEME_OPTIONS } from '../../utils/boardThemes';

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
}) => {
  const topIconClass = 'h-9 w-9';
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
      document.documentElement.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  };

  return (
    <div className="min-h-14 bg-slate-800 border-b border-slate-700/50 flex flex-wrap items-center px-2 sm:px-3 py-2 gap-1.5 sm:gap-2 gap-y-2 select-none">
      {/* Mobile menu */}
      <div className="md:hidden">
        <IconButton title="Menu" onClick={onOpenMenu} className={topIconClass}>
          <FaBars />
        </IconButton>
      </div>

      {/* New game */}
      <div className="hidden md:flex items-center gap-1.5">
        <IconButton title="New game (Ctrl+N)" onClick={onNewGame} className={topIconClass}>
          <FaPlus />
        </IconButton>
      </div>

      {/* Divider */}
      <div className="hidden md:block h-6 w-px bg-slate-700/60" />

      {/* Analysis toggles */}
      <div className="order-last xl:order-none w-full xl:w-auto flex items-center gap-1 flex-wrap">
        <TogglePill
          label="Children"
          shortcut="Q"
          active={settings.analysisShowChildren}
          onToggle={() => updateControls({ analysisShowChildren: !settings.analysisShowChildren })}
        />
        <TogglePill
          label="Dots"
          shortcut="W"
          active={settings.analysisShowEval}
          onToggle={() => updateControls({ analysisShowEval: !settings.analysisShowEval })}
        />
        <TogglePill
          label="Top Moves"
          shortcut="E"
          active={settings.analysisShowHints}
          disabled={settings.analysisShowPolicy}
          onToggle={() => updateControls({ analysisShowHints: !settings.analysisShowHints })}
        />
        <TogglePill
          label="Policy"
          shortcut="R"
          active={settings.analysisShowPolicy}
          onToggle={() => updateControls({ analysisShowPolicy: !settings.analysisShowPolicy })}
        />
        <TogglePill
          label="Territory"
          shortcut="T"
          active={settings.analysisShowOwnership}
          onToggle={() => updateControls({ analysisShowOwnership: !settings.analysisShowOwnership })}
        />
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
          <div className="px-2 py-0.5 rounded-md bg-emerald-600/20 border border-emerald-500/40 text-emerald-200 font-medium">
            Win {winRateLabel}
          </div>
        )}
        {scoreLeadLabel && (
          <div className="px-2 py-0.5 rounded-md bg-blue-600/20 border border-blue-500/40 text-blue-200 font-medium">
            Score {scoreLeadLabel}
          </div>
        )}
        {pointsLostLabel && (
          <div className="px-2 py-0.5 rounded-md bg-amber-600/20 border border-amber-500/40 text-amber-200 font-medium">
            Δ {pointsLostLabel}
          </div>
        )}
      </div>

      {/* Mode badges */}
      <div className="flex items-center gap-1.5">
        {regionOfInterest && (
          <button
            type="button"
            className="px-2 py-0.5 rounded-md border bg-green-900/30 border-green-600/60 text-green-200 text-xs font-semibold hover:bg-green-900/50 transition-colors"
            title="Region of interest active (click to clear)"
            onClick={() => setRegionOfInterest(null)}
          >
            ROI
          </button>
        )}
        {isInsertMode && (
          <div className="px-2 py-0.5 rounded-md border bg-purple-900/30 border-purple-600/60 text-purple-200 text-xs font-semibold">
            Insert
          </div>
        )}
      </div>

      {/* Right controls */}
      <div className="flex items-center gap-1.5">
        <IconButton
          title="Open side panel"
          onClick={onOpenSidePanel}
          className={[topIconClass, 'lg:hidden'].join(' ')}
        >
          <FaChevronLeft />
        </IconButton>
        <div className="hidden md:flex items-center gap-1.5">
          <IconButton title="Settings (F8)" onClick={onSettings} className={topIconClass}>
            <FaCog />
          </IconButton>
          <IconButton title="Keyboard shortcuts (?)" onClick={onKeyboardHelp} className={topIconClass}>
            <FaKeyboard />
          </IconButton>
        </div>
        <div className="relative" data-menu-popover>
          <button
            type="button"
            className="px-2 py-1 rounded-lg sm:px-2.5 sm:py-1.5 bg-slate-800/50 border border-slate-700/30 text-slate-400 hover:bg-slate-700/50 hover:text-slate-200 flex items-center gap-1.5 text-sm font-medium transition-colors"
            onClick={() => setViewMenuOpen(!viewMenuOpen)}
            title="View options"
          >
            <FaSlidersH size={14} /> View <FaChevronDown size={10} className="opacity-80" />
          </button>
          {viewMenuOpen && (
            <div className="absolute right-0 top-full mt-2 w-56 bg-slate-800 border border-slate-700/50 rounded-lg shadow-xl overflow-hidden z-50">
              <button
                className="w-full px-3 py-2 text-left hover:bg-slate-700 flex items-center justify-between"
                onClick={toggleFullscreen}
              >
                <span>Fullscreen</span>
                <span className="text-xs text-slate-400">{isFullscreen ? 'on' : 'off'}</span>
              </button>
              <button
                className="w-full px-3 py-2 text-left hover:bg-slate-700 flex items-center justify-between"
                onClick={onCopySgf}
              >
                <span className="flex items-center gap-2">
                  <FaCopy /> Copy SGF
                </span>
                <span className="text-xs text-slate-400">Ctrl+C</span>
              </button>
              <button
                className="w-full px-3 py-2 text-left hover:bg-slate-700 flex items-center justify-between"
                onClick={onPasteSgf}
              >
                <span className="flex items-center gap-2">
                  <FaPaste /> Paste SGF / OGS
                </span>
                <span className="text-xs text-slate-400">Ctrl+V</span>
              </button>
              <button
                className="w-full px-3 py-2 text-left hover:bg-slate-700 flex items-center justify-between"
                onClick={() => updateSettings({ showCoordinates: !settings.showCoordinates })}
              >
                <span>Coordinates</span>
                <span className="text-xs text-slate-400">{settings.showCoordinates ? 'on' : 'off'}</span>
              </button>
              <button
                className="w-full px-3 py-2 text-left hover:bg-slate-700 flex items-center justify-between"
                onClick={() => updateSettings({ showNextMovePreview: !settings.showNextMovePreview })}
              >
                <span>Next move preview</span>
                <span className="text-xs text-slate-400">{settings.showNextMovePreview ? 'on' : 'off'}</span>
              </button>
              <button
                className="w-full px-3 py-2 text-left hover:bg-slate-700 flex items-center justify-between"
                onClick={() => updateSettings({ showMoveNumbers: !settings.showMoveNumbers })}
              >
                <span>Move numbers</span>
                <span className="text-xs text-slate-400">{settings.showMoveNumbers ? 'on' : 'off'}</span>
              </button>
              <button
                className="w-full px-3 py-2 text-left hover:bg-slate-700 flex items-center justify-between"
                onClick={() => updateSettings({ showBoardControls: !settings.showBoardControls })}
              >
                <span>Board controls</span>
                <span className="text-xs text-slate-400">{settings.showBoardControls ? 'on' : 'off'}</span>
              </button>
              <button
                className="w-full px-3 py-2 text-left hover:bg-slate-700 flex items-center justify-between"
                onClick={() => updateSettings({ soundEnabled: !settings.soundEnabled })}
              >
                <span className="flex items-center gap-2">
                  {settings.soundEnabled ? <FaVolumeUp /> : <FaVolumeMute />} Sound
                </span>
                <span className="text-xs text-slate-400">{settings.soundEnabled ? 'on' : 'off'}</span>
              </button>
              <div className="border-t border-slate-700/50 px-3 py-2">
                <div className="text-xs text-slate-400 mb-1">Board theme</div>
                <select
                  value={settings.boardTheme}
                  onChange={(e) => updateSettings({ boardTheme: e.target.value as GameSettings['boardTheme'] })}
                  className="w-full bg-slate-900 border border-slate-700/60 rounded px-2 py-1 text-xs text-slate-200"
                >
                  {BOARD_THEME_OPTIONS.map((theme) => (
                    <option key={theme.value} value={theme.value}>{theme.label}</option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>
        <button
          type="button"
          className={[
            'px-2 py-1 rounded-lg sm:px-2.5 sm:py-1.5 text-sm font-medium flex items-center gap-1.5 transition-colors',
            isAnalysisMode
              ? 'bg-blue-600/30 border border-blue-500/50 text-blue-200 shadow-sm shadow-blue-500/10'
              : 'bg-slate-800/50 border border-slate-700/30 text-slate-400 hover:bg-slate-700/50 hover:text-slate-200',
          ].join(' ')}
          title="Toggle analysis mode (Tab)"
          onClick={toggleAnalysisMode}
        >
          <span className={['inline-block h-2 w-2 rounded-full', engineDot].join(' ')} />
          Analyze
        </button>

        <div className="relative" data-menu-popover>
          <button
            type="button"
            className="px-2 py-1 rounded-lg sm:px-2.5 sm:py-1.5 bg-slate-800/50 border border-slate-700/30 text-slate-400 hover:bg-slate-700/50 hover:text-slate-200 flex items-center gap-1.5 text-sm font-medium transition-colors"
            onClick={() => setAnalysisMenuOpen(!analysisMenuOpen)}
            title="Analysis actions"
          >
            Actions <FaChevronDown size={10} className="opacity-80" />
          </button>
          {analysisMenuOpen && (
            <div className="absolute right-0 top-full mt-2 w-64 bg-slate-800 border border-slate-700/50 rounded-lg shadow-xl overflow-hidden z-50">
              <button
                className="w-full px-3 py-2 text-left hover:bg-slate-700 flex items-center justify-between"
                onClick={() => {
                  analyzeExtra('extra');
                  setAnalysisMenuOpen(false);
                }}
              >
                <span className="flex items-center gap-2">
                  <FaRobot /> Extra analysis
                </span>
                <span className="text-xs text-slate-400">A</span>
              </button>
              <button
                className="w-full px-3 py-2 text-left hover:bg-slate-700 flex items-center justify-between"
                onClick={() => {
                  analyzeExtra('equalize');
                  setAnalysisMenuOpen(false);
                }}
              >
                <span className="flex items-center gap-2">
                  <FaRobot /> Equalize
                </span>
                <span className="text-xs text-slate-400">S</span>
              </button>
              <button
                className="w-full px-3 py-2 text-left hover:bg-slate-700 flex items-center justify-between"
                onClick={() => {
                  analyzeExtra('sweep');
                  setAnalysisMenuOpen(false);
                }}
              >
                <span className="flex items-center gap-2">
                  <FaRobot /> Sweep
                </span>
                <span className="text-xs text-slate-400">D</span>
              </button>
              <button
                className="w-full px-3 py-2 text-left hover:bg-slate-700 flex items-center justify-between"
                onClick={() => {
                  analyzeExtra('alternative');
                  setAnalysisMenuOpen(false);
                }}
              >
                <span className="flex items-center gap-2">
                  <FaRobot /> Alternative
                </span>
                <span className="text-xs text-slate-400">F</span>
              </button>

              <div className="h-px bg-gradient-to-r from-transparent via-slate-600 to-transparent my-1" />

              <button
                className="w-full px-3 py-2 text-left hover:bg-slate-700 flex items-center justify-between"
                onClick={() => {
                  startSelectRegionOfInterest();
                  setAnalysisMenuOpen(false);
                }}
              >
                <span className="flex items-center gap-2">
                  <FaRobot /> Select region
                </span>
                <span className="text-xs text-slate-400">G</span>
              </button>
              {regionOfInterest && (
                <button
                  className="w-full px-3 py-2 text-left hover:bg-slate-700 flex items-center justify-between"
                  onClick={() => {
                    setRegionOfInterest(null);
                    setAnalysisMenuOpen(false);
                  }}
                >
                  <span className="flex items-center gap-2">
                    <FaTimes /> Clear region
                  </span>
                  <span className="text-xs text-slate-400">—</span>
                </button>
              )}

              <div className="h-px bg-gradient-to-r from-transparent via-slate-600 to-transparent my-1" />

              <button
                className="w-full px-3 py-2 text-left hover:bg-slate-700 flex items-center justify-between"
                onClick={() => {
                  resetCurrentAnalysis();
                  setAnalysisMenuOpen(false);
                }}
              >
                <span className="flex items-center gap-2">
                  <FaStop /> Reset analysis
                </span>
                <span className="text-xs text-slate-400">H</span>
              </button>
              <button
                className="w-full px-3 py-2 text-left hover:bg-slate-700 flex items-center justify-between"
                onClick={() => {
                  toggleInsertMode();
                  setAnalysisMenuOpen(false);
                }}
              >
                <span className="flex items-center gap-2">
                  <FaPlay /> Insert mode
                </span>
                <span className="text-xs text-slate-400">I {isInsertMode ? 'on' : 'off'}</span>
              </button>
              <button
                className="w-full px-3 py-2 text-left hover:bg-slate-700 flex items-center justify-between"
                onClick={() => {
                  selfplayToEnd();
                  setAnalysisMenuOpen(false);
                }}
              >
                <span className="flex items-center gap-2">
                  <FaPlay /> Selfplay to end
                </span>
                <span className="text-xs text-slate-400">L</span>
              </button>
              <button
                className="w-full px-3 py-2 text-left hover:bg-slate-700 flex items-center justify-between"
                onClick={() => {
                  if (isGameAnalysisRunning && gameAnalysisType === 'quick') stopGameAnalysis();
                  else startQuickGameAnalysis();
                  setAnalysisMenuOpen(false);
                }}
              >
                <span className="flex items-center gap-2">
                  <FaRobot /> {isGameAnalysisRunning && gameAnalysisType === 'quick' ? 'Stop quick analysis' : 'Analyze game (quick graph)'}
                </span>
                <span className="text-xs text-slate-400">
                  {isGameAnalysisRunning && gameAnalysisType === 'quick' ? `${gameAnalysisDone}/${gameAnalysisTotal}` : '—'}
                </span>
              </button>
              <button
                className="w-full px-3 py-2 text-left hover:bg-slate-700 flex items-center justify-between"
                onClick={() => {
                  if (isGameAnalysisRunning && gameAnalysisType === 'fast') stopGameAnalysis();
                  else startFastGameAnalysis();
                  setAnalysisMenuOpen(false);
                }}
              >
                <span className="flex items-center gap-2">
                  <FaRobot /> {isGameAnalysisRunning && gameAnalysisType === 'fast' ? 'Stop fast analysis' : 'Analyze game (fast MCTS)'}
                </span>
                <span className="text-xs text-slate-400">
                  {isGameAnalysisRunning && gameAnalysisType === 'fast' ? `${gameAnalysisDone}/${gameAnalysisTotal}` : '—'}
                </span>
              </button>
              <button
                className="w-full px-3 py-2 text-left hover:bg-slate-700 flex items-center justify-between"
                onClick={() => {
                  setIsGameAnalysisOpen(true);
                  setAnalysisMenuOpen(false);
                }}
              >
                <span className="flex items-center gap-2">
                  <FaRobot /> Re-analyze game…
                </span>
                <span className="text-xs text-slate-400">F2</span>
              </button>
              <button
                className="w-full px-3 py-2 text-left hover:bg-slate-700 flex items-center justify-between"
                onClick={() => {
                  setIsGameReportOpen(true);
                  setAnalysisMenuOpen(false);
                }}
              >
                <span className="flex items-center gap-2">
                  <FaRobot /> Game report…
                </span>
                <span className="text-xs text-slate-400">F3</span>
              </button>

              <div className="h-px bg-gradient-to-r from-transparent via-slate-600 to-transparent my-1" />

              <button
                className="w-full px-3 py-2 text-left hover:bg-slate-700 flex items-center justify-between"
                onClick={() => {
                  toggleContinuousAnalysis();
                  setAnalysisMenuOpen(false);
                }}
              >
                <span className="flex items-center gap-2">
                  <FaRobot /> Continuous analysis
                </span>
                <span className="text-xs text-slate-400">Space</span>
              </button>
              <button
                className="w-full px-3 py-2 text-left hover:bg-slate-700 flex items-center justify-between"
                onClick={() => {
                  makeAiMove();
                  setAnalysisMenuOpen(false);
                }}
              >
                <span className="flex items-center gap-2">
                  <FaPlay /> AI move
                </span>
                <span className="text-xs text-slate-400">Enter</span>
              </button>
              <button
                className="w-full px-3 py-2 text-left hover:bg-slate-700 flex items-center justify-between"
                onClick={() => {
                  analyzeExtra('stop');
                  setAnalysisMenuOpen(false);
                }}
              >
                <span className="flex items-center gap-2">
                  <FaStop /> Stop analysis
                </span>
                <span className="text-xs text-slate-400">Esc</span>
              </button>
              <button
                className="w-full px-3 py-2 text-left hover:bg-slate-700 flex items-center justify-between"
                onClick={() => {
                  rotateBoard();
                  setAnalysisMenuOpen(false);
                }}
              >
                <span className="flex items-center gap-2">
                  <FaSyncAlt /> Rotate board
                </span>
                <span className="text-xs text-slate-400">O</span>
              </button>
              <button
                className="w-full px-3 py-2 text-left hover:bg-slate-700 flex items-center justify-between"
                onClick={() => {
                  toggleTeachMode();
                  setAnalysisMenuOpen(false);
                }}
              >
                <span className="flex items-center gap-2">
                  <FaRobot /> Teach mode
                </span>
                <span className="text-xs text-slate-400">{isTeachMode ? 'on' : 'off'}</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
