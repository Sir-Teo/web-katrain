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
  FaThLarge,
  FaTimes,
  FaCopy,
} from 'react-icons/fa';
import type { AnalysisControlsState, UiMode } from './layout/types';
import { formatAnalysisScoreLead, formatAnalysisWinRate, summarizePointsLost } from '../utils/analysisSummary';
import { useGameStore } from '../store/gameStore';
import {
  getPolicyHeatmapMetricLabel,
  getTopMoveMetricLabel,
  nextPolicyHeatmapMetric,
  nextTopMoveMetric,
} from '../utils/topMoveMetric';
import { getCurrentNodeBestMoveSummary } from '../utils/bestMoveSummary';
import { summarizeGameAnalysisProgress } from '../utils/gameAnalysisProgress';
import { getEngineStatusSummary } from '../utils/engineStatusSummary';
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
  visitPresetDescription,
  visitPresetLabel,
  visitSliderFillPercent,
} from '../utils/visitPresets';
import { ENGINE_MAX_VISITS } from '../engine/katago/limits';
import { getNextMoveQuality, getPlayedMoveQuality } from '../utils/playedMoveQuality';
import { copyTextToClipboard } from '../utils/clipboard';
import { formatEngineErrorReport } from '../utils/engineDiagnostics';
import { setTimedNotification } from '../utils/timedNotification';
import { getCurrentLineNodes } from '../utils/branchNavigation';
import { summarizeAnalysisCoverage } from '../utils/analysisCoverage';
import { getFastReviewButtonState } from '../utils/fastReviewButtonState';

interface AnalysisCommandBarProps {
  mode: UiMode;
  isAnalysisMode: boolean;
  statusText: string;
  engineDot: string;
  engineStatus: 'idle' | 'loading' | 'ready' | 'error';
  engineError: string | null;
  engineBackend: string | null;
  engineModelLabel: string | null;
  requestedBackend: string;
  modelUrl: string;
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
  engineBackend,
  engineModelLabel,
  requestedBackend,
  modelUrl,
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
  const policyHeatmapMetric = useGameStore((state) => state.settings.analysisPolicyMetric);
  const katagoVisits = useGameStore((state) => state.settings.katagoVisits);
  const showAnalysisBar = useGameStore((state) => state.settings.showAnalysisBar);
  const currentNode = useGameStore((state) => state.currentNode);
  const activeBranchChildIds = useGameStore((state) => state.activeBranchChildIds);
  const updateSettings = useGameStore((state) => state.updateSettings);
  const depthButtonRef = React.useRef<HTMLButtonElement>(null);
  const depthPopoverRef = React.useRef<HTMLDivElement>(null);
  const depthCloseButtonRef = React.useRef<HTMLButtonElement>(null);
  const depthPopoverId = React.useId();
  const depthPopoverTitleId = React.useId();
  const [depthPopoverOpen, setDepthPopoverOpen] = React.useState(false);
  const [depthDraft, setDepthDraft] = React.useState('');
  const [depthHintVisits, setDepthHintVisits] = React.useState<number | null>(null);
  const [reviewStartedAt, setReviewStartedAt] = React.useState<number | null>(null);
  const [reviewNow, setReviewNow] = React.useState(0);
  const [engineErrorCopied, setEngineErrorCopied] = React.useState(false);
  const shouldShow =
    showAnalysisBar &&
    (mode === 'analyze' ||
      isAnalysisMode ||
      isGameAnalysisRunning ||
      typeof winRate === 'number' ||
      typeof scoreLead === 'number');

  const pointsSummary = summarizePointsLost(pointsLost);
  const gameProgress = isGameAnalysisRunning && gameAnalysisTotal > 0
    ? summarizeGameAnalysisProgress({
        done: gameAnalysisDone,
        total: gameAnalysisTotal,
        startedAtMs: reviewStartedAt,
        nowMs: reviewNow,
      })
    : null;
  const analysisCoverage = summarizeAnalysisCoverage(getCurrentLineNodes(currentNode, activeBranchChildIds));
  const fastReviewButton = getFastReviewButtonState({
    isGameAnalysisRunning,
    gameProgress,
    analysisCoverage,
  });
  const liveButtonLabel = isAnalysisMode ? 'Live on' : 'Analyze';
  const engineSummary = React.useMemo(() => getEngineStatusSummary({
    status: engineStatus,
    error: engineError,
    requestedBackend,
    activeBackend: engineBackend,
    modelLabel: engineModelLabel,
    modelUrl,
  }), [engineBackend, engineError, engineModelLabel, engineStatus, modelUrl, requestedBackend]);
  const engineStatusTitle = [statusText, engineSummary.title].filter(Boolean).join('\n\n');
  const engineStatusClass = [
    'analysis-command-bar__status',
    `analysis-command-bar__status--${engineStatus}`,
    engineSummary.isFallback ? 'analysis-command-bar__status--fallback' : '',
  ].join(' ');
  React.useEffect(() => {
    setEngineErrorCopied(false);
  }, [engineError]);
  const copyEngineError = React.useCallback(async () => {
    if (!engineError) return;
    const ok = await copyTextToClipboard(formatEngineErrorReport({
      status: engineStatus,
      requestedBackend,
      activeBackend: engineBackend ?? requestedBackend,
      modelLabel: engineModelLabel,
      modelUrl,
      error: engineError,
    }));
    setEngineErrorCopied(ok);
    setTimedNotification(ok ? 'Copied engine error details.' : 'Could not copy engine error details.', ok ? 'success' : 'error', 1800);
  }, [engineBackend, engineError, engineModelLabel, engineStatus, modelUrl, requestedBackend]);

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
  const cyclePolicyHeatmapMetric = () => {
    updateSettings({ analysisPolicyMetric: nextPolicyHeatmapMetric(policyHeatmapMetric) });
    if (!analysisControls.analysisShowPolicy) {
      updateControls({ analysisShowPolicy: true });
    }
  };
  const topMoveMetricLabel = getTopMoveMetricLabel(topMoveMetric, 'short');
  const policyHeatmapMetricLabel = getPolicyHeatmapMetricLabel(policyHeatmapMetric, 'short');
  const topMovesHiddenByPolicy = analysisControls.analysisShowPolicy;
  const liveAnalysisLabel = isAnalysisMode ? 'Turn live analysis off' : 'Start live analysis';
  const topMovesToggleTitle = topMovesHiddenByPolicy ? 'Move heatmap is showing; top move hints are hidden' : 'Show or hide top move hints';
  const topMovesToggleLabel = topMovesHiddenByPolicy
    ? 'Top move hints hidden while heatmap is showing'
    : analysisControls.analysisShowHints
      ? 'Hide top move hints'
      : 'Show top move hints';
  const topMoveMetricAriaLabel = `Cycle top move hint label. Current: ${topMoveMetricLabel}`;
  const heatmapToggleLabel = analysisControls.analysisShowPolicy ? 'Hide move heatmap' : 'Show move heatmap';
  const policyHeatmapMetricAriaLabel = `Cycle move heatmap metric. Current: ${policyHeatmapMetricLabel}`;
  const territoryToggleLabel = analysisControls.analysisShowOwnership ? 'Hide territory ownership' : 'Show territory ownership';
  const gameReportLabel = 'Open the full game report';
  const playedMoveQuality = React.useMemo(
    () => getPlayedMoveQuality(currentNode, pointsLost),
    [currentNode, pointsLost]
  );
  const nextMoveQuality = React.useMemo(
    () => getNextMoveQuality(currentNode, activeBranchChildIds),
    [activeBranchChildIds, currentNode]
  );
  const bestMoveSummary = React.useMemo(
    () => getCurrentNodeBestMoveSummary(currentNode),
    [currentNode]
  );
  const displayedMoveQuality = playedMoveQuality ?? nextMoveQuality;
  const moveQualityKind = playedMoveQuality ? 'played' : nextMoveQuality ? 'next' : 'quality';
  const moveQualityTone = displayedMoveQuality?.tone ?? pointsSummary.tone;
  const moveQualityValue = displayedMoveQuality?.valueLabel ?? pointsSummary.label;
  const moveQualityLabel = displayedMoveQuality
    ? `${moveQualityKind === 'next' ? 'Next ' : ''}${displayedMoveQuality.detailLabel}`
    : 'Move quality';
  const moveQualityTitle = displayedMoveQuality
    ? `${moveQualityKind === 'next' ? 'Next move: ' : ''}${displayedMoveQuality.title}`
    : 'Move quality';
  const liveVisits = clampAnalysisVisits(katagoVisits);
  const liveVisitLabel = visitPresetLabel(liveVisits);
  const liveVisitCountLabel = formatVisitCount(liveVisits);
  const depthHintValue = depthHintVisits ?? liveVisits;
  const depthHintLabel = visitPresetLabel(depthHintValue);
  const depthHintDescription = visitPresetDescription(depthHintValue);
  const liveVisitPresets = React.useMemo(
    () => mergeVisitPresets(ANALYSIS_VISIT_PRESETS, liveVisits),
    [liveVisits]
  );
  const liveVisitDepthSegments = React.useMemo(
    () => ANALYSIS_VISIT_PRESETS.map((preset) => ({ preset, active: liveVisits >= preset })),
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

  const closeDepthPopover = React.useCallback((restoreFocus = false) => {
    setDepthPopoverOpen(false);
    if (restoreFocus && typeof window !== 'undefined') {
      window.setTimeout(() => depthButtonRef.current?.focus({ preventScroll: true }), 0);
    }
  }, []);

  React.useEffect(() => {
    setDepthDraft(String(liveVisits));
    if (depthPopoverOpen) setDepthHintVisits(liveVisits);
  }, [depthPopoverOpen, liveVisits]);

  React.useEffect(() => {
    if (!depthPopoverOpen) setDepthHintVisits(null);
  }, [depthPopoverOpen]);

  React.useEffect(() => {
    if (isGameAnalysisRunning) {
      closeDepthPopover();
      setDepthHintVisits(null);
    }
  }, [closeDepthPopover, isGameAnalysisRunning]);

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
    depthCloseButtonRef.current?.focus({ preventScroll: true });

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (depthPopoverRef.current?.contains(target)) return;
      if (depthButtonRef.current?.contains(target)) return;
      closeDepthPopover();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        closeDepthPopover(true);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [closeDepthPopover, depthPopoverOpen]);

  const depthPopover = depthPopoverOpen && !isGameAnalysisRunning ? (
    <div
      id={depthPopoverId}
      ref={depthPopoverRef}
      className="analysis-command-bar__depth-popover"
      role="dialog"
      aria-modal="false"
      aria-labelledby={depthPopoverTitleId}
      data-analysis-live-depth-popover="true"
    >
      <div className="analysis-command-bar__depth-header">
        <div>
          <div id={depthPopoverTitleId} className="analysis-command-bar__depth-title">Live MCTS depth</div>
          <div className="analysis-command-bar__depth-subtitle">{liveVisits} visits - {liveVisitLabel}</div>
        </div>
        <button
          ref={depthCloseButtonRef}
          type="button"
          className="analysis-command-bar__depth-close"
          onClick={() => closeDepthPopover(true)}
          aria-label="Close live depth selector"
          title="Close live depth selector"
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
              aria-label={`${formatVisitCount(preset)} visits, ${visitPresetLabel(preset)}. ${visitPresetDescription(preset)}`}
              title={visitPresetDescription(preset)}
              onMouseEnter={() => setDepthHintVisits(preset)}
              onFocus={() => setDepthHintVisits(preset)}
              onClick={() => applyLiveVisits(preset)}
              data-analysis-live-depth-option={preset}
            >
              <span className="analysis-command-bar__depth-option-value">{formatVisitCount(preset)}</span>
              <span className="analysis-command-bar__depth-option-label">{visitPresetLabel(preset)}</span>
            </button>
          );
        })}
      </div>
      <p className="analysis-command-bar__depth-help" aria-live="polite">
        <span>{depthHintLabel}</span>
        {depthHintDescription}
      </p>
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
              closeDepthPopover(true);
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
      <div
        className={engineStatusClass}
        title={engineStatusTitle}
        role="status"
        aria-label={`Engine status: ${engineSummary.compactLabel}`}
        data-analysis-engine-status={engineStatus}
      >
        <span className={['analysis-command-bar__dot', engineDot].join(' ')} aria-hidden="true" />
        <span className="analysis-command-bar__status-text">{engineSummary.compactLabel}</span>
        {engineError && (
          <button
            type="button"
            className={[
              'analysis-command-bar__status-copy',
              engineErrorCopied ? 'copied' : '',
            ].join(' ')}
            onClick={() => void copyEngineError()}
            title={engineErrorCopied ? 'Copied engine error details' : 'Copy engine error details'}
            aria-label={engineErrorCopied ? 'Engine error details copied' : 'Copy engine error details'}
          >
            <FaCopy aria-hidden="true" />
          </button>
        )}
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
        <div
          className="analysis-command-bar__metric"
          title={moveQualityTitle}
          data-analysis-move-quality={moveQualityKind}
        >
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
          title={liveAnalysisLabel}
          aria-label={liveAnalysisLabel}
        >
          <FaPlay size={12} aria-hidden="true" />
          <span>{liveButtonLabel}</span>
        </button>
        <button
          type="button"
          className={[
            'analysis-command-bar__button',
            fastReviewButton.state === 'running' ? 'danger active' : '',
            fastReviewButton.state === 'complete' ? 'active' : '',
          ].join(' ')}
          onClick={() => {
            if (isGameAnalysisRunning) stopGameAnalysis();
            else startFastGameAnalysis();
          }}
          disabled={fastReviewButton.disabled}
          title={fastReviewButton.title}
          aria-label={fastReviewButton.ariaLabel}
          data-analysis-fast-review-state={fastReviewButton.state}
        >
          {isGameAnalysisRunning ? <FaSquare size={12} aria-hidden="true" /> : <FaRobot size={12} aria-hidden="true" />}
          <span>{fastReviewButton.label}</span>
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
          aria-controls={depthPopoverId}
          title={
            isGameAnalysisRunning
              ? 'Stop game analysis before changing live depth'
              : `Live analysis depth: ${liveVisits} visits (${liveVisitLabel}).`
          }
          aria-label={`Live analysis depth ${liveVisits} visits`}
        >
          <FaSearch size={12} aria-hidden="true" />
          <span>Depth: {liveVisitCountLabel}</span>
          <span
            className="analysis-command-bar__depth-meter"
            aria-hidden="true"
            data-analysis-live-depth-meter="true"
          >
            {liveVisitDepthSegments.map((segment) => (
              <span
                key={segment.preset}
                className={[
                  'analysis-command-bar__depth-meter-segment',
                  segment.active ? 'active' : '',
                ].join(' ')}
                data-analysis-live-depth-segment={segment.preset}
              />
            ))}
          </span>
        </button>
        <button
          type="button"
          className={['analysis-command-bar__button', analysisControls.analysisShowHints && !topMovesHiddenByPolicy ? 'active' : ''].join(' ')}
          onClick={() => toggleOverlay('analysisShowHints')}
          aria-pressed={analysisControls.analysisShowHints}
          disabled={topMovesHiddenByPolicy}
          title={topMovesToggleTitle}
          aria-label={topMovesToggleLabel}
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
          aria-label={topMoveMetricAriaLabel}
        >
          <FaChartBar size={12} aria-hidden="true" />
          <span>Hint: {topMoveMetricLabel}</span>
        </button>
        <button
          type="button"
          className={['analysis-command-bar__button', analysisControls.analysisShowPolicy ? 'active' : ''].join(' ')}
          onClick={() => toggleOverlay('analysisShowPolicy')}
          aria-pressed={analysisControls.analysisShowPolicy}
          title={heatmapToggleLabel}
          aria-label={heatmapToggleLabel}
        >
          <FaThLarge size={12} aria-hidden="true" />
          <span>Heatmap</span>
        </button>
        <button
          type="button"
          className={[
            'analysis-command-bar__button',
            analysisControls.analysisShowPolicy && policyHeatmapMetric !== 'policy' ? 'active' : '',
          ].join(' ')}
          onClick={cyclePolicyHeatmapMetric}
          data-analysis-policy-metric="true"
          title="Cycle the move heatmap metric"
          aria-label={policyHeatmapMetricAriaLabel}
        >
          <FaChartBar size={12} aria-hidden="true" />
          <span>Map: {policyHeatmapMetricLabel}</span>
        </button>
        <button
          type="button"
          className={['analysis-command-bar__button', analysisControls.analysisShowOwnership ? 'active' : ''].join(' ')}
          onClick={() => toggleOverlay('analysisShowOwnership')}
          aria-pressed={analysisControls.analysisShowOwnership}
          title={territoryToggleLabel}
          aria-label={territoryToggleLabel}
        >
          <FaMap size={12} aria-hidden="true" />
          <span>Territory</span>
        </button>
        <button
          type="button"
          className="analysis-command-bar__button"
          onClick={onOpenGameReport}
          title={gameReportLabel}
          aria-label={gameReportLabel}
        >
          <FaFileAlt size={12} aria-hidden="true" />
          <span>Report</span>
        </button>
        <button
          type="button"
          className="analysis-command-bar__button analysis-command-bar__button--dismiss"
          onClick={() => updateSettings({ showAnalysisBar: false })}
          title="Hide the analysis bar (re-enable it from the View menu)"
          aria-label="Hide the analysis bar"
        >
          <FaTimes size={12} aria-hidden="true" />
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
