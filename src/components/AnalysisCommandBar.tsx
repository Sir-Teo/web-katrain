import React from 'react';
import {
  FaChartBar,
  FaFileAlt,
  FaLayerGroup,
  FaMap,
  FaPlay,
  FaRobot,
  FaSearch,
  FaSquare,
  FaTimes,
} from 'react-icons/fa';
import type { AnalysisControlsState, UiMode } from './layout/types';
import { formatAnalysisScoreLead, formatAnalysisWinRate, summarizePointsLost } from '../utils/analysisSummary';
import { useGameStore } from '../store/gameStore';
import { getTopMoveMetricLabel, nextTopMoveMetric } from '../utils/topMoveMetric';
import { getBestMoveSummary } from '../utils/bestMoveSummary';
import { summarizeGameAnalysisProgress } from '../utils/gameAnalysisProgress';
import {
  ANALYSIS_MIN_VISITS,
  ANALYSIS_VISIT_PRESETS,
  ANALYSIS_VISIT_SLIDER_MAX,
  ANALYSIS_VISIT_SLIDER_MIN,
  clampAnalysisVisits,
  formatVisitCount,
  mergeVisitPresets,
  sliderValueToVisitCount,
  visitCountToSliderValue,
  visitPresetLabel,
  visitSliderFillPercent,
} from '../utils/visitPresets';
import { ENGINE_MAX_VISITS } from '../engine/katago/limits';
import { getPlayedMoveQuality } from '../utils/playedMoveQuality';

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
  startFastGameAnalysis: (opts?: { moveRange?: [number, number] | null }) => void;
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
  const katagoVisits = useGameStore((state) => state.settings.katagoVisits);
  const currentNode = useGameStore((state) => state.currentNode);
  const updateSettings = useGameStore((state) => state.updateSettings);
  const depthButtonRef = React.useRef<HTMLButtonElement>(null);
  const depthPopoverRef = React.useRef<HTMLDivElement>(null);
  const [depthPopoverOpen, setDepthPopoverOpen] = React.useState(false);
  const [depthDraft, setDepthDraft] = React.useState('');
  const [reviewStartedAt, setReviewStartedAt] = React.useState<number | null>(null);
  const [reviewNow, setReviewNow] = React.useState(0);
  const shouldShow =
    mode === 'analyze' ||
    isAnalysisMode ||
    isGameAnalysisRunning ||
    typeof winRate === 'number' ||
    typeof scoreLead === 'number';

  const pointsSummary = summarizePointsLost(pointsLost);
  const gameProgress = isGameAnalysisRunning && gameAnalysisTotal > 0
    ? summarizeGameAnalysisProgress({
        done: gameAnalysisDone,
        total: gameAnalysisTotal,
        startedAtMs: reviewStartedAt,
        nowMs: reviewNow,
      })
    : null;
  const liveButtonLabel = isAnalysisMode ? 'Live on' : 'Analyze';
  const gameButtonLabel = isGameAnalysisRunning
    ? `Stop ${gameProgress?.buttonLabel ?? ''}`.trim()
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
  const playedMoveQuality = React.useMemo(
    () => getPlayedMoveQuality(currentNode, pointsLost),
    [currentNode, pointsLost]
  );
  const bestMoveSummary = React.useMemo(
    () => getBestMoveSummary(currentNode.analysis, currentNode.gameState.board.length),
    [currentNode.analysis, currentNode.gameState.board.length]
  );
  const moveQualityTone = playedMoveQuality?.tone ?? pointsSummary.tone;
  const moveQualityValue = playedMoveQuality?.valueLabel ?? pointsSummary.label;
  const moveQualityLabel = playedMoveQuality?.detailLabel ?? 'Move quality';
  const moveQualityTitle = playedMoveQuality?.title ?? 'Move quality';
  const liveVisits = clampAnalysisVisits(katagoVisits);
  const liveVisitLabel = visitPresetLabel(liveVisits);
  const liveVisitCountLabel = formatVisitCount(liveVisits);
  const liveVisitPresets = React.useMemo(
    () => mergeVisitPresets(ANALYSIS_VISIT_PRESETS, liveVisits),
    [liveVisits]
  );
  const applyLiveVisits = React.useCallback((visits: number) => {
    const nextVisits = clampAnalysisVisits(visits);
    if (nextVisits === liveVisits) return;
    updateSettings({ katagoVisits: nextVisits });
    if (isAnalysisMode) {
      window.setTimeout(() => {
        void useGameStore.getState().runAnalysis({ force: true, visits: nextVisits });
      }, 0);
    }
  }, [isAnalysisMode, liveVisits, updateSettings]);
  const commitDepthDraft = React.useCallback((raw: string) => {
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed)) {
      setDepthDraft(String(liveVisits));
      return;
    }
    const nextVisits = clampAnalysisVisits(parsed);
    setDepthDraft(String(nextVisits));
    applyLiveVisits(nextVisits);
  }, [applyLiveVisits, liveVisits]);

  React.useEffect(() => {
    setDepthDraft(String(liveVisits));
  }, [liveVisits]);

  React.useEffect(() => {
    if (isGameAnalysisRunning) setDepthPopoverOpen(false);
  }, [isGameAnalysisRunning]);

  React.useEffect(() => {
    if (!isGameAnalysisRunning) {
      setReviewStartedAt(null);
      setReviewNow(0);
      return;
    }
    const now = Date.now();
    setReviewStartedAt((startedAt) => startedAt ?? now);
    setReviewNow(now);
  }, [isGameAnalysisRunning, gameAnalysisType, gameAnalysisDone, gameAnalysisTotal]);

  React.useEffect(() => {
    if (!depthPopoverOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (depthPopoverRef.current?.contains(target)) return;
      if (depthButtonRef.current?.contains(target)) return;
      setDepthPopoverOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDepthPopoverOpen(false);
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [depthPopoverOpen]);

  const depthPopover = depthPopoverOpen && !isGameAnalysisRunning ? (
    <div
      ref={depthPopoverRef}
      className="analysis-command-bar__depth-popover"
      role="dialog"
      aria-label="Live analysis depth selector"
      data-analysis-live-depth-popover="true"
    >
      <div className="analysis-command-bar__depth-header">
        <div>
          <div className="analysis-command-bar__depth-title">Live MCTS depth</div>
          <div className="analysis-command-bar__depth-subtitle">{liveVisits} visits - {liveVisitLabel}</div>
        </div>
        <button
          type="button"
          className="analysis-command-bar__depth-close"
          onClick={() => setDepthPopoverOpen(false)}
          aria-label="Close live depth selector"
        >
          <FaTimes size={12} aria-hidden="true" />
        </button>
      </div>
      <div className="analysis-command-bar__depth-options" role="radiogroup" aria-label="Depth presets">
        {liveVisitPresets.map((preset) => {
          const active = preset === liveVisits;
          return (
            <button
              key={preset}
              type="button"
              role="radio"
              aria-checked={active}
              className={['analysis-command-bar__depth-option', active ? 'active' : ''].join(' ')}
              onClick={() => applyLiveVisits(preset)}
              data-analysis-live-depth-option={preset}
            >
              <span className="analysis-command-bar__depth-option-value">{formatVisitCount(preset)}</span>
              <span className="analysis-command-bar__depth-option-label">{visitPresetLabel(preset)}</span>
            </button>
          );
        })}
      </div>
      <div className="analysis-command-bar__depth-custom">
        <input
          type="range"
          min={ANALYSIS_VISIT_SLIDER_MIN}
          max={ANALYSIS_VISIT_SLIDER_MAX}
          step={0.01}
          value={visitCountToSliderValue(liveVisits)}
          className="analysis-command-bar__depth-slider"
          aria-label="Live analysis depth slider"
          aria-valuetext={`${liveVisits} visits`}
          style={{ '--analysis-depth-fill': `${visitSliderFillPercent(liveVisits)}%` } as React.CSSProperties}
          onChange={(event) => applyLiveVisits(sliderValueToVisitCount(Number.parseFloat(event.currentTarget.value)))}
        />
        <input
          type="number"
          min={ANALYSIS_MIN_VISITS}
          max={ENGINE_MAX_VISITS}
          step={1}
          value={depthDraft}
          className="analysis-command-bar__depth-input"
          aria-label="Exact live analysis visits"
          onChange={(event) => setDepthDraft(event.currentTarget.value)}
          onBlur={(event) => commitDepthDraft(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur();
            if (event.key === 'Escape') {
              setDepthDraft(String(liveVisits));
              setDepthPopoverOpen(false);
            }
          }}
        />
      </div>
      <div className="analysis-command-bar__depth-scale" aria-hidden="true">
        <span>{ANALYSIS_MIN_VISITS}</span>
        <span>{formatVisitCount(ENGINE_MAX_VISITS)}</span>
      </div>
    </div>
  ) : null;

  const toggleDepthPopover = () => {
    setDepthPopoverOpen((open) => !open);
  };

  if (!shouldShow) return null;

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
        <div className="analysis-command-bar__metric" title={moveQualityTitle}>
          <span className={['analysis-command-bar__value', `analysis-command-bar__value--${moveQualityTone}`].join(' ')}>
            {moveQualityValue}
          </span>
          <span className="analysis-command-bar__label">{moveQualityLabel}</span>
        </div>
        {bestMoveSummary && (
          <div className="analysis-command-bar__metric" title={bestMoveSummary.title} data-analysis-best-move="true">
            <span className="analysis-command-bar__value analysis-command-bar__value--best">
              {bestMoveSummary.moveLabel}
            </span>
            <span className="analysis-command-bar__label">{bestMoveSummary.detailLabel || 'Best move'}</span>
          </div>
        )}
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
          onClick={() => {
            if (isGameAnalysisRunning) stopGameAnalysis();
            else startFastGameAnalysis();
          }}
          title={isGameAnalysisRunning ? (gameProgress?.title ?? 'Stop game analysis') : 'Run a fast MCTS review of the game'}
        >
          {isGameAnalysisRunning ? <FaSquare size={12} aria-hidden="true" /> : <FaRobot size={12} aria-hidden="true" />}
          <span>{gameButtonLabel}</span>
        </button>
        <button
          ref={depthButtonRef}
          type="button"
          className={['analysis-command-bar__button', liveVisits > ANALYSIS_MIN_VISITS ? 'active' : ''].join(' ')}
          onClick={toggleDepthPopover}
          disabled={isGameAnalysisRunning}
          data-analysis-live-depth="true"
          aria-haspopup="dialog"
          aria-expanded={depthPopoverOpen}
          title={
            isGameAnalysisRunning
              ? 'Stop game analysis before changing live depth'
              : `Live analysis depth: ${liveVisits} visits (${liveVisitLabel}).`
          }
          aria-label={`Live analysis depth ${liveVisits} visits`}
        >
          <FaSearch size={12} aria-hidden="true" />
          <span>Depth: {liveVisitCountLabel}</span>
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

      {depthPopover}

      {isGameAnalysisRunning && gameProgress && (
        <div className="analysis-command-bar__progress-caption" title={gameProgress.title} aria-live="polite">
          {gameProgress.captionLabel}
        </div>
      )}

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
          Fast review in progress {gameProgress?.captionLabel}
        </div>
      )}
    </div>
  );
};
