import React from 'react';
import {
  FaChartLine,
  FaChartBar,
  FaRedoAlt,
  FaFileAlt,
  FaTrash,
  FaInfoCircle,
  FaSitemap,
  FaCircle,
  FaLayerGroup,
  FaThLarge,
  FaMap,
  FaCopy,
} from 'react-icons/fa';
import { ScoreWinrateGraph } from './ScoreWinrateGraph';
import type { AnalysisControlsState, UiMode, UiState } from './layout/types';
import { EngineStatusBadge } from './layout/ui';
import { useGameStore } from '../store/gameStore';
import { getKaTrainEvalColors } from '../utils/katrainTheme';
import { DEFAULT_EVAL_THRESHOLDS } from '../utils/nodeAnalysis';
import {
  ANALYSIS_VISIT_PRESETS,
  clampAnalysisVisits,
  mergeVisitPresets,
  visitPresetLabel,
} from '../utils/visitPresets';
import { formatAnalysisScoreLead, summarizePointsLost } from '../utils/analysisSummary';
import { getCurrentNodeBestMoveSummary } from '../utils/bestMoveSummary';
import { getNextMoveQuality, getPlayedMoveQuality } from '../utils/playedMoveQuality';
import { setTimedNotification } from '../utils/timedNotification';
import { copyTextToClipboard } from '../utils/clipboard';
import { formatEngineErrorReport } from '../utils/engineDiagnostics';
import { getEngineStatusSummary } from '../utils/engineStatusSummary';
import { getCurrentLineNodes } from '../utils/branchNavigation';
import {
  isReportReadyAnalysis,
  summarizeAnalysisCoverage,
  type AnalysisCoverageSummary,
} from '../utils/analysisCoverage';
import { getFastMctsPanelButtonState } from '../utils/fastReviewButtonState';

interface AnalysisPanelProps {
  mode: UiMode;
  modePanels: UiState['panels'][UiMode];
  analysisControls: AnalysisControlsState;
  updatePanels: (
    partial: Partial<UiState['panels'][UiMode]> | ((current: UiState['panels'][UiMode]) => Partial<UiState['panels'][UiMode]>)
  ) => void;
  updateControls: (partial: Partial<AnalysisControlsState>) => void;
  statusText: string;
  engineDot: string;
  engineMeta: string;
  engineMetaTitle?: string;
  engineStatus: 'idle' | 'loading' | 'ready' | 'error';
  engineError: string | null;
  engineBackend: string | null;
  engineModelLabel: string | null;
  requestedBackend: string;
  modelUrl: string;
  isGameAnalysisRunning: boolean;
  gameAnalysisType: string | null;
  gameAnalysisDone: number;
  gameAnalysisTotal: number;
  startQuickGameAnalysis: () => void;
  startFastGameAnalysis: (opts?: { moveRange?: [number, number] | null }) => void;
  stopGameAnalysis: () => void;
  clearAnalysisCache: () => void;
  analysisCacheSize: number;
  onOpenGameAnalysis: () => void;
  onOpenGameReport: () => void;
  currentMoveNumber: number;
  winRate: number | null;
  scoreLead: number | null;
  pointsLost: number | null;
  compact?: boolean;
}

type GraphMetric = keyof UiState['panels'][UiMode]['graph'];
type AnalysisOverlayControl = keyof AnalysisControlsState;
type EvalColor = readonly [number, number, number, number];
type QualityLegendItem = { label: string; range: string; color: string };
type AnalysisStatsActionsProps = {
  onOpenGameAnalysis: () => void;
  onOpenGameReport: () => void;
};
type AnalysisCoverageReadoutProps = {
  summary: AnalysisCoverageSummary;
  className: string;
  labelClassName?: string;
};

const GRAPH_METRIC_NAMES: Record<GraphMetric, string> = {
  score: 'score',
  winrate: 'win rate',
};

const ANALYSIS_OVERLAY_NAMES: Record<AnalysisOverlayControl, string> = {
  analysisShowChildren: 'child move markers',
  analysisShowEval: 'move evaluation dots',
  analysisShowHints: 'top move hints',
  analysisShowPolicy: 'move heatmap',
  analysisShowOwnership: 'territory ownership',
};

function evalColorToCss(color: EvalColor): string {
  return `rgba(${Math.round(color[0] * 255)}, ${Math.round(color[1] * 255)}, ${Math.round(color[2] * 255)}, ${color[3]})`;
}

function pointsSummaryClass(tone: ReturnType<typeof summarizePointsLost>['tone']): string {
  if (tone === 'success') return 'text-[var(--ui-success)]';
  if (tone === 'warning') return 'text-[var(--ui-warning)]';
  if (tone === 'danger') return 'text-[var(--ui-danger)]';
  return 'text-[var(--ui-text-muted)]';
}

export const AnalysisQualityLegend: React.FC<{ items: QualityLegendItem[] }> = ({ items }) => (
  <div
    id="analysis-quality-legend"
    className="border-b border-[var(--ui-border)] bg-[var(--ui-surface)] px-2 py-1.5 text-[11px]"
    data-analysis-quality-legend="true"
  >
    <div className="mb-1 flex items-center justify-between gap-2">
      <div className="font-semibold text-[var(--ui-text)]">Move quality</div>
      <div className="ui-text-faint">Points lost</div>
    </div>
    <div className="grid grid-cols-2 gap-x-2 gap-y-1">
      {items.map((item) => (
        <div key={item.label} className="flex min-w-0 items-center gap-1.5">
          <span
            className="h-2.5 w-2.5 flex-none rounded-full border border-black/30"
            style={{ background: item.color }}
            aria-hidden="true"
          />
          <span className="truncate text-[var(--ui-text-muted)]">{item.label}</span>
          <span className="ml-auto font-mono text-[var(--ui-text)]">{item.range}</span>
        </div>
      ))}
    </div>
    <div className="mt-1.5 border-t border-[var(--ui-border)] pt-1.5" data-analysis-overlay-legend="true">
      <div className="mb-1 flex items-center justify-between gap-2">
        <div className="font-semibold text-[var(--ui-text)]">Overlays</div>
        <div className="ui-text-faint">Board colors</div>
      </div>
      <div className="grid grid-cols-3 gap-x-2 gap-y-1">
        <div className="min-w-0" data-analysis-overlay-legend-item="top-moves">
          <span className="mb-1 flex h-5 w-full items-center justify-center rounded border border-[var(--ui-accent)] bg-[var(--ui-accent-soft)] font-mono text-[10px] text-[var(--ui-accent)]">
            1
          </span>
          <span className="block truncate text-[var(--ui-text-muted)]">Top moves</span>
          <span className="block truncate font-mono text-[var(--ui-text)]">Best lines</span>
        </div>
        <div className="min-w-0" data-analysis-overlay-legend-item="policy">
          <span
            className="mb-1 block h-5 w-full rounded border border-[var(--ui-border)]"
            style={{ background: 'linear-gradient(90deg, rgba(16, 185, 129, 0.18), rgba(16, 185, 129, 0.85))' }}
            aria-hidden="true"
          />
          <span className="block truncate text-[var(--ui-text-muted)]">Move prob.</span>
          <span className="block truncate font-mono text-[var(--ui-text)]">Likely moves</span>
        </div>
        <div className="min-w-0" data-analysis-overlay-legend-item="territory">
          <span className="mb-1 grid h-5 w-full grid-cols-2 overflow-hidden rounded border border-[var(--ui-border)]" aria-hidden="true">
            <span className="bg-black/60" />
            <span className="bg-white/70" />
          </span>
          <span className="block truncate text-[var(--ui-text-muted)]">Territory</span>
          <span className="block truncate font-mono text-[var(--ui-text)]">Owner</span>
        </div>
      </div>
    </div>
  </div>
);

export const AnalysisStatsActions: React.FC<AnalysisStatsActionsProps> = ({
  onOpenGameAnalysis,
  onOpenGameReport,
}) => {
  // Cache size is surfaced by the clear-cache control elsewhere in the panel,
  // so this row only carries the Report / Analyze actions.
  return (
    <div
      className="col-span-full flex flex-wrap items-center gap-1.5 border-t border-[var(--ui-border)] pt-2"
      data-analysis-stats-actions="true"
    >
      <button
        type="button"
        className="panel-action-button"
        onClick={onOpenGameReport}
        title="Open game report"
        aria-label="Open game report"
      >
        <FaFileAlt size={11} aria-hidden="true" />
        <span>Report</span>
      </button>
      <button
        type="button"
        className="panel-action-button"
        onClick={onOpenGameAnalysis}
        title="Open analysis options"
        aria-label="Open analysis options"
      >
        <FaRedoAlt size={11} aria-hidden="true" />
        <span>Analyze</span>
      </button>
    </div>
  );
};

function analysisCoverageValueClass(tone: AnalysisCoverageSummary['tone']): string {
  if (tone === 'complete') return 'text-[var(--ui-success)]';
  if (tone === 'partial') return 'text-[var(--ui-warning)]';
  return 'text-[var(--ui-text-muted)]';
}

export const AnalysisCoverageReadout: React.FC<AnalysisCoverageReadoutProps> = ({
  summary,
  className,
  labelClassName = 'ui-text-faint',
}) => (
  <div
    className={className}
    title={summary.title}
    data-analysis-coverage="true"
    data-analysis-coverage-tone={summary.tone}
    aria-label={`${summary.stateLabel}: ${summary.valueLabel} analyzed positions`}
  >
    <div className={labelClassName}>Analyzed</div>
    <div className={['font-mono text-sm', analysisCoverageValueClass(summary.tone)].join(' ')}>
      {summary.valueLabel}
    </div>
    <div className="mt-0.5 truncate text-[10px] font-semibold uppercase tracking-wide ui-text-faint">
      {summary.stateLabel}
    </div>
  </div>
);

export const AnalysisPanel: React.FC<AnalysisPanelProps> = ({
  mode,
  modePanels,
  analysisControls,
  updatePanels,
  updateControls,
  statusText,
  engineDot,
  engineMeta,
  engineMetaTitle,
  engineStatus,
  engineError,
  engineBackend,
  engineModelLabel,
  requestedBackend,
  modelUrl,
  isGameAnalysisRunning,
  gameAnalysisType,
  gameAnalysisDone,
  gameAnalysisTotal,
  startQuickGameAnalysis,
  startFastGameAnalysis,
  stopGameAnalysis,
  clearAnalysisCache,
  analysisCacheSize,
  onOpenGameAnalysis,
  onOpenGameReport,
  currentMoveNumber,
  winRate,
  scoreLead,
  pointsLost,
  compact = false,
}) => {
  void mode;
  const trainerTheme = useGameStore((state) => state.settings.trainerTheme);
  const trainerEvalThresholds = useGameStore((state) => state.settings.trainerEvalThresholds);
  const katagoVisits = useGameStore((state) => state.settings.katagoVisits);
  const isAnalysisMode = useGameStore((state) => state.isAnalysisMode);
  const currentNode = useGameStore((state) => state.currentNode);
  const activeBranchChildIds = useGameStore((state) => state.activeBranchChildIds);
  const updateSettings = useGameStore((state) => state.updateSettings);
  const [legendOpen, setLegendOpen] = React.useState(false);
  const [engineErrorCopied, setEngineErrorCopied] = React.useState(false);
  const graphMetrics = modePanels.graph;
  const activeTab: 'graph' | 'stats' =
    modePanels.statsOpen && !modePanels.graphOpen ? 'stats' : 'graph';
  const engineSummary = React.useMemo(() => getEngineStatusSummary({
    status: engineStatus,
    error: engineError,
    requestedBackend,
    activeBackend: engineBackend,
    modelLabel: engineModelLabel,
    modelUrl,
  }), [engineBackend, engineError, engineModelLabel, engineStatus, modelUrl, requestedBackend]);
  const activeBackend = engineBackend ?? requestedBackend;
  const qualityLegendItems = React.useMemo(() => {
    const colors = getKaTrainEvalColors(trainerTheme);
    const thresholds = trainerEvalThresholds.length > 0
      ? trainerEvalThresholds
      : DEFAULT_EVAL_THRESHOLDS;
    const ranges = [
      `${thresholds[0]}+`,
      `${thresholds[1]}-${thresholds[0]}`,
      `${thresholds[2]}-${thresholds[1]}`,
      `${thresholds[3]}-${thresholds[2]}`,
      `${thresholds[4]}-${thresholds[3]}`,
      `0-${thresholds[4]}`,
    ];
    return ['Blunder', 'Mistake', 'Inaccuracy', 'Slight loss', 'Good', 'Best'].map((label, index) => ({
      label,
      range: `${ranges[index]} pt`,
      color: evalColorToCss(colors[index] ?? colors[colors.length - 1]!),
    }));
  }, [trainerEvalThresholds, trainerTheme]);
  const liveVisits = React.useMemo(() => clampAnalysisVisits(katagoVisits), [katagoVisits]);
  const liveVisitPresets = React.useMemo(
    () => mergeVisitPresets(ANALYSIS_VISIT_PRESETS, liveVisits),
    [liveVisits]
  );
  const scoreLeadLabel = formatAnalysisScoreLead(scoreLead);
  const pointsSummary = summarizePointsLost(pointsLost);
  const currentLineNodes = getCurrentLineNodes(currentNode, activeBranchChildIds);
  const analysisCoverage = summarizeAnalysisCoverage(currentLineNodes);
  const reportReadyCoverage = summarizeAnalysisCoverage(currentLineNodes, {
    isAnalyzed: (node) => isReportReadyAnalysis(node.analysis),
  });
  const fastMctsButton = getFastMctsPanelButtonState({
    isGameAnalysisRunning,
    gameAnalysisType,
    gameAnalysisDone,
    gameAnalysisTotal,
    analysisCoverage: reportReadyCoverage,
  });
  React.useEffect(() => {
    setEngineErrorCopied(false);
  }, [engineError]);
  const bestMoveSummary = React.useMemo(
    () => getCurrentNodeBestMoveSummary(currentNode),
    [currentNode]
  );
  const playedMoveQuality = React.useMemo(
    () => getPlayedMoveQuality(currentNode, pointsLost),
    [currentNode, pointsLost]
  );
  const nextMoveQuality = React.useMemo(
    () => getNextMoveQuality(currentNode, activeBranchChildIds),
    [activeBranchChildIds, currentNode]
  );
  const applyLiveVisits = React.useCallback((visits: number) => {
    const nextVisits = clampAnalysisVisits(visits);
    if (nextVisits === liveVisits) return;

    updateSettings({ katagoVisits: nextVisits });
    setTimedNotification(`Live analysis depth: ${nextVisits} visits`, 'info', 1800);
    if (isAnalysisMode) {
      window.setTimeout(() => {
        void useGameStore.getState().runAnalysis({ force: true, visits: nextVisits });
      }, 0);
    }
  }, [isAnalysisMode, liveVisits, updateSettings]);
  const copyEngineError = React.useCallback(async () => {
    if (!engineError) return;
    const ok = await copyTextToClipboard(formatEngineErrorReport({
      status: engineStatus,
      requestedBackend,
      activeBackend,
      modelLabel: engineModelLabel,
      modelUrl,
      error: engineError,
    }));
    setEngineErrorCopied(ok);
    setTimedNotification(ok ? 'Copied engine error details.' : 'Could not copy engine error details.', ok ? 'success' : 'error', 1800);
  }, [activeBackend, engineError, engineModelLabel, engineStatus, modelUrl, requestedBackend]);
  const toggleGraphMetric = (metric: GraphMetric) => {
    updatePanels((current) => {
      const next = { ...current.graph, [metric]: !current.graph[metric] };
      return next.score || next.winrate ? { graph: next } : {};
    });
  };
  const metricToggle = (metric: GraphMetric, label: string, colorClass: string) => {
    const graphMetricLabel = `${graphMetrics[metric] ? 'Hide' : 'Show'} ${GRAPH_METRIC_NAMES[metric]} graph`;
    return (
      <button
        type="button"
        className={[
          'panel-action-button',
          graphMetrics[metric] ? 'active' : '',
        ].join(' ')}
        onClick={() => toggleGraphMetric(metric)}
        aria-pressed={graphMetrics[metric]}
        aria-label={graphMetricLabel}
        title={graphMetricLabel}
      >
        <span className={['h-2 w-2 rounded-full', colorClass].join(' ')} aria-hidden="true" />
        {label}
      </button>
    );
  };
  const graphMetricToggles = (
    <div className="flex items-center gap-1.5">
      {metricToggle('winrate', 'Win', 'bg-[var(--ui-success)]')}
      {metricToggle('score', 'Score', 'bg-[var(--ui-warning)]')}
    </div>
  );
  const overlayToggle = (
    control: AnalysisOverlayControl,
    label: string,
    icon: React.ReactNode,
    disabled = false
  ) => {
    const overlayName = ANALYSIS_OVERLAY_NAMES[control];
    const overlayActionLabel = analysisControls[control] ? `Hide ${overlayName}` : `Show ${overlayName}`;
    const topMovesHiddenByPolicy = control === 'analysisShowHints' && disabled;
    const overlayLabel = topMovesHiddenByPolicy
      ? 'Top move hints hidden while heatmap is showing'
      : overlayActionLabel;
    const overlayTitle = topMovesHiddenByPolicy
      ? 'Move heatmap is showing; top move hints are hidden'
      : overlayActionLabel;

    return (
      <button
        type="button"
        className={[
          'panel-action-button',
          analysisControls[control] ? 'active' : '',
        ].join(' ')}
        onClick={() => updateControls({ [control]: !analysisControls[control] })}
        aria-pressed={analysisControls[control]}
        aria-label={overlayLabel}
        disabled={disabled}
        title={overlayTitle}
      >
        {icon}
        <span>{label}</span>
      </button>
    );
  };
  const overlayToggles = (
    <div className="flex flex-wrap items-center gap-1.5" data-analysis-overlay-controls="true">
      {overlayToggle('analysisShowChildren', 'Children', <FaSitemap size={11} aria-hidden="true" />)}
      {overlayToggle('analysisShowEval', 'Dots', <FaCircle size={9} aria-hidden="true" />)}
      {overlayToggle(
        'analysisShowHints',
        'Top moves',
        <FaLayerGroup size={11} aria-hidden="true" />,
        analysisControls.analysisShowPolicy
      )}
      {overlayToggle('analysisShowPolicy', 'Heatmap', <FaThLarge size={11} aria-hidden="true" />)}
      {overlayToggle('analysisShowOwnership', 'Territory', <FaMap size={11} aria-hidden="true" />)}
    </div>
  );
  const cachedAnalysisCountLabel = `${analysisCacheSize} cached ${analysisCacheSize === 1 ? 'analysis' : 'analyses'}`;
  const analysisCacheTitle = analysisCacheSize > 0
    ? isGameAnalysisRunning
      ? 'Stop analysis before clearing cache'
      : `Clear ${cachedAnalysisCountLabel}`
    : 'No cached analysis to clear';
  const analysisCacheLabel = analysisCacheSize > 0
    ? isGameAnalysisRunning
      ? 'Analysis cache unavailable while game analysis is running'
      : `Clear ${cachedAnalysisCountLabel}`
    : 'No cached analysis to clear';
  const analysisCacheControl = (
    <button
      type="button"
      className="panel-action-button"
      onClick={clearAnalysisCache}
      disabled={analysisCacheSize === 0 || isGameAnalysisRunning}
      title={analysisCacheTitle}
      aria-label={analysisCacheLabel}
    >
      <FaTrash size={11} aria-hidden="true" />
      <span className="tabular-nums">{analysisCacheSize > 0 ? analysisCacheSize : '—'}</span>
    </button>
  );
  const legendButton = (
    <button
      type="button"
      className={['panel-icon-button', legendOpen ? 'active' : ''].join(' ')}
      onClick={() => setLegendOpen((prev) => !prev)}
      title={legendOpen ? 'Hide analysis legend' : 'Show analysis legend'}
      aria-label={legendOpen ? 'Hide analysis legend' : 'Show analysis legend'}
      aria-expanded={legendOpen}
      aria-controls="analysis-quality-legend"
    >
      <FaInfoCircle size={12} aria-hidden="true" />
    </button>
  );
  const qualityLegend = legendOpen ? <AnalysisQualityLegend items={qualityLegendItems} /> : null;
  // Report / Analyze / cache live in the toolbar on desktop; only the compact
  // (toolbar-less) layout needs these inline actions, so skip them otherwise to
  // avoid duplicating the same controls within a single view.
  const statsActions = compact ? (
    <AnalysisStatsActions
      onOpenGameAnalysis={onOpenGameAnalysis}
      onOpenGameReport={onOpenGameReport}
    />
  ) : null;
  const readoutGridStyle: React.CSSProperties = {
    gridTemplateColumns: 'repeat(auto-fit, minmax(4.75rem, 1fr))',
  };
  const renderBestMoveReadout = (className: string, labelClassName = 'ui-text-faint') =>
    bestMoveSummary ? (
      <div
        className={className}
        title={bestMoveSummary.title}
        data-analysis-panel-best-move="true"
      >
        <div className={labelClassName}>Best</div>
        <div className="truncate font-mono text-sm text-[var(--ui-accent)]">
          {bestMoveSummary.moveLabel}
        </div>
        <div className="mt-0.5 truncate text-[10px] font-semibold uppercase tracking-wide ui-text-faint">
          {bestMoveSummary.detailLabel}
        </div>
      </div>
    ) : null;
  const renderMoveQualityReadout = (className: string, labelClassName = 'ui-text-faint') => {
    const displayedMoveQuality = playedMoveQuality ?? nextMoveQuality;
    const qualityKind = playedMoveQuality ? 'played' : nextMoveQuality ? 'next' : 'quality';
    const toneClass = pointsSummaryClass(displayedMoveQuality?.tone ?? pointsSummary.tone);
    if (displayedMoveQuality) {
      return (
        <div
          className={className}
          title={qualityKind === 'next' ? `Next move: ${displayedMoveQuality.title}` : displayedMoveQuality.title}
          data-analysis-move-quality={qualityKind}
          data-analysis-played-move={qualityKind === 'played' ? 'true' : undefined}
          data-analysis-next-move={qualityKind === 'next' ? 'true' : undefined}
        >
          <div className={labelClassName}>{qualityKind === 'next' ? 'Next' : 'Played'}</div>
          <div className={['truncate font-mono text-sm', toneClass].join(' ')}>
            {displayedMoveQuality.playerLabel} {displayedMoveQuality.moveLabel}
          </div>
          <div className="mt-0.5 truncate text-[10px] font-semibold uppercase tracking-wide ui-text-faint">
            {[displayedMoveQuality.rankLabel, displayedMoveQuality.valueLabel].filter((part) => part !== '-').join(' · ')}
          </div>
        </div>
      );
    }

    return (
      <div className={className} title="Move quality">
        <div className={labelClassName}>Quality</div>
        <div className={['font-mono text-sm', toneClass].join(' ')}>
          {pointsSummary.label}
        </div>
      </div>
    );
  };
  const graphReadout = (
    <div
      className="grid gap-1 text-[11px]"
      data-analysis-graph-readout="true"
      style={readoutGridStyle}
    >
      <div className="min-w-0 rounded border border-[var(--ui-border)] bg-[var(--ui-surface)] px-2 py-1">
        <div className="ui-text-faint">Move</div>
        <div className="font-mono text-sm text-[var(--ui-text)]">{currentMoveNumber}</div>
      </div>
      <AnalysisCoverageReadout
        summary={analysisCoverage}
        className="min-w-0 rounded border border-[var(--ui-border)] bg-[var(--ui-surface)] px-2 py-1"
      />
      {renderBestMoveReadout('min-w-0 rounded border border-[var(--ui-border)] bg-[var(--ui-surface)] px-2 py-1')}
      {renderMoveQualityReadout('min-w-0 rounded border border-[var(--ui-border)] bg-[var(--ui-surface)] px-2 py-1')}
      <div className="min-w-0 rounded border border-[var(--ui-border)] bg-[var(--ui-surface)] px-2 py-1">
        <div className="ui-text-faint">Winrate</div>
        <div className="font-mono text-sm text-[var(--ui-success)]">
          {typeof winRate === 'number' ? `${(winRate * 100).toFixed(1)}%` : '-'}
        </div>
      </div>
      <div className="min-w-0 rounded border border-[var(--ui-border)] bg-[var(--ui-surface)] px-2 py-1">
        <div className="ui-text-faint">Score</div>
        <div className="font-mono text-sm text-[var(--ui-warning)]">
          {scoreLeadLabel}
        </div>
      </div>
    </div>
  );
  const liveVisitPresetControls = (
    <div
      className="mt-2 border-t border-[var(--ui-border)] pt-2"
      data-analysis-live-visit-presets="true"
    >
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <div className="text-[11px] font-semibold uppercase tracking-wide ui-text-faint">
          MCTS depth
        </div>
        <div className="text-[11px] ui-text-faint">Kaya-style</div>
      </div>
      <div className="grid grid-cols-2 gap-1">
        {liveVisitPresets.map((preset) => {
          const active = liveVisits === preset;
          return (
            <button
              key={preset}
              type="button"
              className={[
                'min-h-11 rounded-md border px-2 py-1 text-left transition-colors disabled:opacity-45 disabled:cursor-not-allowed',
                active
                  ? 'border-[var(--ui-accent)] bg-[var(--ui-accent-soft)] text-[var(--ui-text)]'
                  : 'border-[var(--ui-border)] bg-[var(--ui-surface)] text-[var(--ui-text-muted)] hover:bg-[var(--ui-surface-2)] hover:text-[var(--ui-text)]',
              ].join(' ')}
              onClick={() => applyLiveVisits(preset)}
              disabled={isGameAnalysisRunning}
              aria-pressed={active}
              title={isGameAnalysisRunning ? 'Stop game analysis before changing live visits' : `Set live analysis to ${preset} visits`}
            >
              <span className="block font-mono text-xs">{preset}</span>
              <span className="block text-[10px] font-semibold uppercase tracking-wide">
                {visitPresetLabel(preset)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="flex flex-col min-h-0 analysis-panel-compact">
      <div className="panel-section-header">
        <EngineStatusBadge
          label={engineMeta}
          title={engineMetaTitle}
          dotClass={engineDot}
          tone={engineSummary.tone}
          variant="inline"
          showErrorTag={!!engineError}
          className="lg:hidden"
          maxWidthClassName="max-w-[180px]"
        />
        <span className="ml-auto">{statusText}</span>
      </div>
      {isGameAnalysisRunning && gameAnalysisTotal > 0 && (
        <div className="panel-section-content border-b border-[var(--ui-border)]">
          <div className="h-2 rounded bg-[var(--ui-surface-2)] overflow-hidden">
            <div
              className="h-full bg-[var(--ui-accent)] opacity-70"
              style={{ width: `${Math.min(100, Math.round((gameAnalysisDone / gameAnalysisTotal) * 100))}%` }}
            />
          </div>
          <div className="mt-1 text-[11px] ui-text-faint">
            {gameAnalysisDone}/{gameAnalysisTotal} analyzed
          </div>
        </div>
      )}
      <div className="panel-section-content border-b border-[var(--ui-border)]">
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
          <div>
            <div className="ui-text-faint">State</div>
            <div className={engineStatus === 'error' ? 'text-[var(--ui-danger)] font-semibold' : 'text-[var(--ui-text)] font-semibold'}>
              {engineSummary.stateLabel}
            </div>
          </div>
          <div>
            <div className="ui-text-faint">Backend</div>
            <div className="text-[var(--ui-text)] font-semibold">
              {engineSummary.activeBackendLabel}{engineSummary.isFallback ? ' fallback' : ''}
            </div>
          </div>
          <div>
            <div className="ui-text-faint">Model</div>
            <div className="text-[var(--ui-text)] truncate" title={engineModelLabel ?? modelUrl}>
              {engineModelLabel ?? 'Not loaded'}
            </div>
          </div>
          <div>
            <div className="ui-text-faint">Source</div>
            <div className="text-[var(--ui-text)]">{engineSummary.modelSource}</div>
          </div>
        </div>
        {engineSummary.isFallback && (
          <div className="mt-2 text-[11px] text-[var(--ui-warning)]">
            Requested {engineSummary.requestedBackendLabel}, running {engineSummary.activeBackendLabel}.
          </div>
        )}
        {engineSummary.reasonLabel && (
          <div className="mt-2 text-[11px] ui-text-faint" data-engine-reason="true">
            {engineSummary.reasonLabel}
          </div>
        )}
        {engineError && (
          <div className="mt-2 rounded border border-[var(--ui-danger)] bg-[var(--ui-danger-soft)] p-2 text-[11px] text-[var(--ui-danger)]">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1 break-words">{engineError}</div>
              <button
                type="button"
                className="panel-icon-button ui-danger-soft shrink-0"
                onClick={() => void copyEngineError()}
                title="Copy engine error details"
                aria-label="Copy engine error details"
              >
                <FaCopy aria-hidden="true" />
              </button>
            </div>
            {engineErrorCopied && (
              <div className="mt-1 font-semibold text-[var(--ui-danger)]">Copied</div>
            )}
          </div>
        )}
        {liveVisitPresetControls}
      </div>
      {!compact && (
        <div className="panel-toolbar">
          <button type="button"
            className={[
              'panel-action-button',
              isGameAnalysisRunning && gameAnalysisType === 'quick' ? 'danger active' : '',
            ].join(' ')}
            onClick={() => {
              if (isGameAnalysisRunning && gameAnalysisType === 'quick') stopGameAnalysis();
              else startQuickGameAnalysis();
            }}
            title={
              isGameAnalysisRunning && gameAnalysisType === 'quick'
                ? 'Stop quick graph analysis'
                : 'Run a quick policy graph pass'
            }
            aria-label={
              isGameAnalysisRunning && gameAnalysisType === 'quick'
                ? 'Stop quick graph analysis'
                : 'Run quick graph analysis'
            }
          >
            {isGameAnalysisRunning && gameAnalysisType === 'quick'
              ? `Stop quick (${gameAnalysisDone}/${gameAnalysisTotal})`
              : 'Quick graph'}
          </button>
          <button type="button"
            className={[
              'panel-action-button',
              fastMctsButton.state === 'running' ? 'danger active' : '',
              fastMctsButton.state === 'complete' ? 'active' : '',
            ].join(' ')}
            onClick={() => {
              if (fastMctsButton.state === 'running') stopGameAnalysis();
              else startFastGameAnalysis();
            }}
            disabled={fastMctsButton.disabled}
            title={fastMctsButton.title}
            aria-label={fastMctsButton.ariaLabel}
            data-analysis-panel-fast-review-state={fastMctsButton.state}
          >
            {fastMctsButton.label}
          </button>
          <button type="button"
            className="panel-action-button danger"
            onClick={stopGameAnalysis}
            disabled={!isGameAnalysisRunning}
            title="Stop game analysis"
            aria-label="Stop game analysis"
          >
            Stop
          </button>
          {graphMetricToggles}
          {analysisCacheControl}
          {overlayToggles}
          <div className="ml-auto flex items-center gap-2 text-xs">
            {legendButton}
            <button type="button"
              className="panel-icon-button"
              onClick={onOpenGameAnalysis}
              title="Re-analyze…"
              aria-label="Open analysis options"
            >
              <FaRedoAlt size={12} />
            </button>
            <button type="button"
              className="panel-icon-button"
              onClick={onOpenGameReport}
              title="Game report…"
              aria-label="Open game report"
            >
              <FaFileAlt size={12} />
            </button>
          </div>
        </div>
      )}
      {!compact && qualityLegend}

      {!compact && (
        <div className="panel-tab-strip">
          <button
            type="button"
            className={['panel-tab', activeTab === 'graph' ? 'active' : ''].join(' ')}
            onClick={() => {
            updatePanels({ graphOpen: true, statsOpen: false });
          }}
        >
            <FaChartLine size={12} />
            <span>Graph</span>
          </button>
          <button
            type="button"
            className={['panel-tab', activeTab === 'stats' ? 'active' : ''].join(' ')}
            onClick={() => {
            updatePanels({ graphOpen: false, statsOpen: true });
          }}
        >
            <FaChartBar size={12} />
            <span>Stats</span>
          </button>
        </div>
      )}
      <div className="panel-section-content">
        {compact ? (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              {graphMetricToggles}
              <div className="flex items-center gap-1.5">
                {analysisCacheControl}
                {legendButton}
              </div>
            </div>
            {overlayToggles}
            {qualityLegend}
            <div className="panel-compact-graph">
              <ScoreWinrateGraph showScore={graphMetrics.score} showWinrate={graphMetrics.winrate} />
            </div>
            <div className="grid gap-1" style={readoutGridStyle}>
              {renderBestMoveReadout('min-w-0 px-2 py-1', 'text-[11px] ui-text-faint')}
              {renderMoveQualityReadout('min-w-0 px-2 py-1', 'text-[11px] ui-text-faint')}
              <div className="px-2 py-1">
                <div className="text-[11px] ui-text-faint">Winrate</div>
                <div className="font-mono text-sm text-[var(--ui-success)]">
                  {typeof winRate === 'number' ? `${(winRate * 100).toFixed(1)}%` : '-'}
                </div>
              </div>
              <div className="px-2 py-1">
                <div className="text-[11px] ui-text-faint">Score</div>
                <div className="font-mono text-sm text-[var(--ui-warning)]">
                  {scoreLeadLabel}
                </div>
              </div>
              <AnalysisCoverageReadout
                summary={analysisCoverage}
                className="px-2 py-1"
                labelClassName="text-[11px] ui-text-faint"
              />
              {statsActions}
            </div>
          </div>
        ) : activeTab === 'graph' ? (
          <div className="space-y-1.5">
            <div className="panel-compact-graph">
              <ScoreWinrateGraph showScore={graphMetrics.score} showWinrate={graphMetrics.winrate} />
            </div>
            {graphReadout}
          </div>
        ) : (
          <div className="grid gap-1" style={readoutGridStyle}>
            {renderBestMoveReadout('min-w-0 px-2 py-1', 'text-[11px] ui-text-faint')}
            {renderMoveQualityReadout('min-w-0 px-2 py-1', 'text-[11px] ui-text-faint')}
            <div className="px-2 py-1">
              <div className="text-[11px] ui-text-faint">Winrate</div>
              <div className="font-mono text-sm text-[var(--ui-success)]">
                {typeof winRate === 'number' ? `${(winRate * 100).toFixed(1)}%` : '-'}
              </div>
            </div>
            <div className="px-2 py-1">
              <div className="text-[11px] ui-text-faint">Score</div>
              <div className="font-mono text-sm text-[var(--ui-warning)]">
                {scoreLeadLabel}
              </div>
            </div>
            <AnalysisCoverageReadout
              summary={analysisCoverage}
              className="px-2 py-1"
              labelClassName="text-[11px] ui-text-faint"
            />
            {statsActions}
          </div>
        )}
      </div>
    </div>
  );
};
