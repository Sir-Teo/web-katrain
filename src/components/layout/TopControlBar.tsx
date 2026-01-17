import React from 'react';
import {
  FaBars,
  FaBook,
  FaChevronDown,
  FaChevronLeft,
  FaColumns,
  FaSlidersH,
  FaRobot,
  FaPlay,
  FaStop,
  FaSyncAlt,
  FaTimes,
} from 'react-icons/fa';
import type { GameSettings, RegionOfInterest } from '../../types';
import type { AnalysisControlsState } from './types';
import { IconButton, TogglePill } from './ui';

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
  onOpenSidePanel: () => void;
  onToggleLibrary: () => void;
  isLibraryOpen: boolean;
  onToggleSidebar: () => void;
  isSidebarOpen: boolean;
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
  onOpenSidePanel,
  onToggleLibrary,
  isLibraryOpen,
  onToggleSidebar,
  isSidebarOpen,
}) => {
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

  return (
    <div className="h-14 bg-slate-800 border-b border-slate-700/50 flex items-center px-3 gap-3 select-none">
      <IconButton title="Menu" onClick={onOpenMenu}>
        <FaBars />
      </IconButton>
      <IconButton
        title={isLibraryOpen ? 'Hide library (Ctrl+L)' : 'Show library (Ctrl+L)'}
        onClick={onToggleLibrary}
        className={isLibraryOpen ? 'text-emerald-300' : undefined}
      >
        <FaBook />
      </IconButton>
      <IconButton
        title={isSidebarOpen ? 'Hide sidebar (Ctrl+B)' : 'Show sidebar (Ctrl+B)'}
        onClick={onToggleSidebar}
        className={isSidebarOpen ? 'text-emerald-300' : undefined}
      >
        <FaColumns />
      </IconButton>

      <div className="flex items-center gap-2 overflow-x-auto">
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

      <div className="flex-grow" />

      <div className="flex items-center gap-2">
        {regionOfInterest && (
          <button
            type="button"
            className="px-2 py-1 rounded border bg-green-900/30 border-green-600 text-green-200 text-xs font-semibold hover:bg-green-900/50"
            title="Region of interest active (click to clear)"
            onClick={() => setRegionOfInterest(null)}
          >
            ROI
          </button>
        )}
        {isInsertMode && (
          <div className="px-2 py-1 rounded border bg-purple-900/30 border-purple-600 text-purple-200 text-xs font-semibold">
            Insert
          </div>
        )}
      </div>

      <div className="flex items-center gap-3">
        <IconButton
          title="Open side panel"
          onClick={onOpenSidePanel}
          className="lg:hidden"
        >
          <FaChevronLeft />
        </IconButton>
        <div className="relative" data-menu-popover>
          <button
            type="button"
            className="px-3 py-2 rounded-lg bg-slate-800/50 border border-slate-700/30 text-slate-400 hover:bg-slate-700/50 flex items-center gap-2 text-sm font-medium"
            onClick={() => setViewMenuOpen(!viewMenuOpen)}
            title="View options"
          >
            <FaSlidersH /> View <FaChevronDown className="opacity-80" />
          </button>
          {viewMenuOpen && (
            <div className="absolute right-0 top-full mt-2 w-56 bg-slate-800 border border-slate-700/50 rounded shadow-xl overflow-hidden z-50">
              <button
                className="w-full px-3 py-2 text-left hover:bg-slate-700 flex items-center justify-between"
                onClick={() => {
                  if (typeof document === 'undefined') return;
                  if (!document.fullscreenElement) {
                    document.documentElement.requestFullscreen?.().catch(() => {});
                  } else {
                    document.exitFullscreen?.().catch(() => {});
                  }
                }}
              >
                <span>Fullscreen</span>
                <span className="text-xs text-slate-400">{isFullscreen ? 'on' : 'off'}</span>
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
                <span>Sound</span>
                <span className="text-xs text-slate-400">{settings.soundEnabled ? 'on' : 'off'}</span>
              </button>
            </div>
          )}
        </div>
        <button
          type="button"
          className={[
            'px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-2',
            isAnalysisMode ? 'bg-blue-600/30 border border-blue-500/50 text-blue-200' : 'bg-slate-800/50 border border-slate-700/30 text-slate-400 hover:bg-slate-700/50',
          ].join(' ')}
          title="Toggle analysis mode (Tab)"
          onClick={toggleAnalysisMode}
        >
          <span className={['inline-block h-2.5 w-2.5 rounded-full', engineDot].join(' ')} />
          Analyze
        </button>

        <div className="relative" data-menu-popover>
          <button
            type="button"
            className="px-3 py-2 rounded-lg bg-slate-800/50 border border-slate-700/30 text-slate-400 hover:bg-slate-700/50 flex items-center gap-2 text-sm font-medium"
            onClick={() => setAnalysisMenuOpen(!analysisMenuOpen)}
            title="Analysis actions"
          >
            Actions <FaChevronDown className="opacity-80" />
          </button>
          {analysisMenuOpen && (
            <div className="absolute right-0 top-full mt-2 w-64 bg-slate-800 border border-slate-700/50 rounded shadow-xl overflow-hidden z-50">
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
