import React from 'react';
import {
  FaChartBar,
  FaFileAlt,
  FaLayerGroup,
  FaMap,
  FaPlay,
  FaRobot,
  FaSquare,
} from 'react-icons/fa';
import type { AnalysisControlsState, UiMode } from './layout/types';
import { formatAnalysisScoreLead, formatAnalysisWinRate, summarizePointsLost } from '../utils/analysisSummary';
import { useGameStore } from '../store/gameStore';
import { getTopMoveMetricLabel, nextTopMoveMetric } from '../utils/topMoveMetric';

interface AnalysisCommandBarProps {
  mode: UiMode;
  isAnalysisMode: boolean;
  statusText: string;
  engineDot: string;
  engineStatus: 'idle' | 'loading' | 'ready' | 'error';
  engineError: string | null;
  winRate: number | null;
  scoreLead: number | null;
  pointsLost: number | null;
  analysisControls: AnalysisControlsState;
  updateControls: (partial: Partial<AnalysisControlsState>) => void;
  toggleAnalysisMode: () => void;
  isGameAnalysisRunning: boolean;
  gameAnalysisType: string | null;
  gameAnalysisDone: number;
  gameAnalysisTotal: number;
  startFastGameAnalysis: () => void;
  stopGameAnalysis: () => void;
  onOpenGameReport: () => void;
}

export const AnalysisCommandBar: React.FC<AnalysisCommandBarProps> = ({
  mode,
  isAnalysisMode,
  statusText,
  engineDot,
  engineStatus,
  engineError,
  winRate,
  scoreLead,
  pointsLost,
  analysisControls,
  updateControls,
  toggleAnalysisMode,
  isGameAnalysisRunning,
  gameAnalysisType,
  gameAnalysisDone,
  gameAnalysisTotal,
  startFastGameAnalysis,
  stopGameAnalysis,
  onOpenGameReport,
}) => {
  const topMoveMetric = useGameStore((state) => state.settings.trainerTopMovesShow);
  const updateSettings = useGameStore((state) => state.updateSettings);
  const shouldShow =
    mode === 'analyze' ||
    isAnalysisMode ||
    isGameAnalysisRunning ||
    typeof winRate === 'number' ||
    typeof scoreLead === 'number';

  if (!shouldShow) return null;

  const pointsSummary = summarizePointsLost(pointsLost);
  const gameProgress =
    isGameAnalysisRunning && gameAnalysisTotal > 0
      ? `${gameAnalysisDone}/${gameAnalysisTotal}`
      : null;
  const liveButtonLabel = isAnalysisMode ? 'Live on' : 'Analyze';
  const gameButtonLabel = isGameAnalysisRunning
    ? `Stop ${gameProgress ?? ''}`.trim()
    : 'Fast review';
  const engineLabel = engineError
    ? 'Engine error'
    : engineStatus === 'loading'
      ? 'Loading engine'
      : engineStatus === 'ready'
        ? 'Engine ready'
        : 'Engine idle';

  const toggleOverlay = (key: keyof AnalysisControlsState) => {
    updateControls({ [key]: !analysisControls[key] });
  };
  const cycleTopMoveMetric = () => {
    const nextMetric = nextTopMoveMetric(topMoveMetric);
    updateSettings({ trainerTopMovesShow: nextMetric });
    if (!analysisControls.analysisShowHints || analysisControls.analysisShowPolicy) {
      updateControls({ analysisShowHints: true, analysisShowPolicy: false });
    }
  };
  const topMoveMetricLabel = getTopMoveMetricLabel(topMoveMetric, 'short');
  const topMovesHiddenByPolicy = analysisControls.analysisShowPolicy;

  return (
    <div className="analysis-command-bar" data-analysis-command-bar="true">
      <div className="analysis-command-bar__status" title={statusText}>
        <span className={['analysis-command-bar__dot', engineDot].join(' ')} aria-hidden="true" />
        <span className="analysis-command-bar__status-text">{engineLabel}</span>
      </div>

      <div className="analysis-command-bar__metrics" aria-label="Analysis summary">
        <div className="analysis-command-bar__metric">
          <span className="analysis-command-bar__value analysis-command-bar__value--win">
            {formatAnalysisWinRate(winRate)}
          </span>
          <span className="analysis-command-bar__label">Black win</span>
        </div>
        <div className="analysis-command-bar__metric">
          <span className="analysis-command-bar__value analysis-command-bar__value--score">
            {formatAnalysisScoreLead(scoreLead)}
          </span>
          <span className="analysis-command-bar__label">Score lead</span>
        </div>
        <div className="analysis-command-bar__metric">
          <span className={['analysis-command-bar__value', `analysis-command-bar__value--${pointsSummary.tone}`].join(' ')}>
            {pointsSummary.label}
          </span>
          <span className="analysis-command-bar__label">Move quality</span>
        </div>
      </div>

      <div className="analysis-command-bar__actions" aria-label="Analysis controls">
        <button
          type="button"
          className={['analysis-command-bar__button', isAnalysisMode ? 'active' : ''].join(' ')}
          onClick={toggleAnalysisMode}
          aria-pressed={isAnalysisMode}
          title={isAnalysisMode ? 'Turn live analysis off' : 'Start live analysis'}
        >
          <FaPlay size={12} aria-hidden="true" />
          <span>{liveButtonLabel}</span>
        </button>
        <button
          type="button"
          className={['analysis-command-bar__button', isGameAnalysisRunning ? 'danger active' : ''].join(' ')}
          onClick={isGameAnalysisRunning ? stopGameAnalysis : startFastGameAnalysis}
          title={isGameAnalysisRunning ? 'Stop game analysis' : 'Run a fast MCTS review of the game'}
        >
          {isGameAnalysisRunning ? <FaSquare size={12} aria-hidden="true" /> : <FaRobot size={12} aria-hidden="true" />}
          <span>{gameButtonLabel}</span>
        </button>
        <button
          type="button"
          className={['analysis-command-bar__button', analysisControls.analysisShowHints && !topMovesHiddenByPolicy ? 'active' : ''].join(' ')}
          onClick={() => toggleOverlay('analysisShowHints')}
          aria-pressed={analysisControls.analysisShowHints}
          disabled={topMovesHiddenByPolicy}
          title={topMovesHiddenByPolicy ? 'Policy overlay is showing; top move hints are hidden' : 'Show or hide top move hints'}
        >
          <FaLayerGroup size={12} aria-hidden="true" />
          <span>Top moves</span>
        </button>
        <button
          type="button"
          className={['analysis-command-bar__button', analysisControls.analysisShowHints && !topMovesHiddenByPolicy ? 'active' : ''].join(' ')}
          onClick={cycleTopMoveMetric}
          data-analysis-hint-metric="true"
          title="Cycle the primary top move hint label"
        >
          <FaChartBar size={12} aria-hidden="true" />
          <span>Hint: {topMoveMetricLabel}</span>
        </button>
        <button
          type="button"
          className={['analysis-command-bar__button', analysisControls.analysisShowOwnership ? 'active' : ''].join(' ')}
          onClick={() => toggleOverlay('analysisShowOwnership')}
          aria-pressed={analysisControls.analysisShowOwnership}
          title="Show or hide territory ownership"
        >
          <FaMap size={12} aria-hidden="true" />
          <span>Territory</span>
        </button>
        <button
          type="button"
          className="analysis-command-bar__button"
          onClick={onOpenGameReport}
          title="Open the full game report"
        >
          <FaFileAlt size={12} aria-hidden="true" />
          <span>Report</span>
        </button>
      </div>

      {isGameAnalysisRunning && gameAnalysisTotal > 0 && (
        <div className="analysis-command-bar__progress" aria-hidden="true">
          <span
            className="analysis-command-bar__progress-fill"
            style={{ width: `${Math.min(100, Math.round((gameAnalysisDone / gameAnalysisTotal) * 100))}%` }}
          />
        </div>
      )}

      {gameAnalysisType === 'fast' && (
        <div className="analysis-command-bar__sr" aria-live="polite">
          Fast review in progress {gameProgress}
        </div>
      )}
    </div>
  );
};
