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
import { getBestMoveSummary } from '../utils/bestMoveSummary';
import { getPlayedMoveQuality } from '../utils/playedMoveQuality';

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

function evalColorToCss(color: EvalColor): string {
  return `rgba(${Math.round(color[0] * 255)}, ${Math.round(color[1] * 255)}, ${Math.round(color[2] * 255)}, ${color[3]})`;
}

function pointsSummaryClass(tone: ReturnType<typeof summarizePointsLost>['tone']): string {
  if (tone === 'success') return 'text-[var(--ui-success)]';
  if (tone === 'warning') return 'text-[var(--ui-warning)]';
  if (tone === 'danger') return 'text-[var(--ui-danger)]';
  return 'text-[var(--ui-text-muted)]';
}

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
  const updateSettings = useGameStore((state) => state.updateSettings);
  const [legendOpen, setLegendOpen] = React.useState(false);
  const graphMetrics = modePanels.graph;
  const activeTab: 'graph' | 'stats' =
    modePanels.statsOpen && !modePanels.graphOpen ? 'stats' : 'graph';
  const activeBackend = engineBackend ?? requestedBackend;
  const isFallback = !!engineBackend && engineBackend !== requestedBackend;
  const modelSource = modelUrl.startsWith('/models/') || modelUrl.startsWith('models/')
    ? 'Bundled'
    : modelUrl.startsWith('http')
      ? 'Remote'
      : 'Local';
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
  const bestMoveAnalysis = currentNode.analysis ?? currentNode.parent?.analysis ?? null;
  const bestMoveSummary = React.useMemo(
    () => getBestMoveSummary(bestMoveAnalysis, currentNode.gameState.board.length),
    [bestMoveAnalysis, currentNode.gameState.board.length]
  );
  const playedMoveQuality = React.useMemo(
    () => getPlayedMoveQuality(currentNode, pointsLost),
    [currentNode, pointsLost]
  );
  const applyLiveVisits = React.useCallback((visits: number) => {
    const nextVisits = clampAnalysisVisits(visits);
    if (nextVisits === liveVisits) return;

    updateSettings({ katagoVisits: nextVisits });
    useGameStore.setState({
      notification: { message: `Live analysis depth: ${nextVisits} visits`, type: 'info' },
    });
    window.setTimeout(() => useGameStore.setState({ notification: null }), 1800);
    if (isAnalysisMode) {
      window.setTimeout(() => {
        void useGameStore.getState().runAnalysis({ force: true, visits: nextVisits });
      }, 0);
    }
  }, [isAnalysisMode, liveVisits, updateSettings]);
  const toggleGraphMetric = (metric: GraphMetric) => {
    updatePanels((current) => {
      const next = { ...current.graph, [metric]: !current.graph[metric] };
      return next.score || next.winrate ? { graph: next } : {};
    });
  };
  const metricToggle = (metric: GraphMetric, label: string, colorClass: string) => (
    <button
      type="button"
      className={[
        'px-2 py-1 rounded-md border text-xs font-medium flex items-center gap-1.5 transition-colors',
        graphMetrics[metric]
          ? 'bg-[var(--ui-surface-2)] border-[var(--ui-border-strong)] text-[var(--ui-text)]'
          : 'bg-[var(--ui-surface)] border-[var(--ui-border)] text-[var(--ui-text-muted)] hover:bg-[var(--ui-surface-2)] hover:text-[var(--ui-text)]',
      ].join(' ')}
      onClick={() => toggleGraphMetric(metric)}
      aria-pressed={graphMetrics[metric]}
      title={`Toggle ${label.toLowerCase()} graph`}
    >
      <span className={['h-2 w-2 rounded-full', colorClass].join(' ')} aria-hidden="true" />
      {label}
    </button>
  );
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
  ) => (
    <button
      type="button"
      className={[
        'panel-action-button',
        analysisControls[control] ? 'active' : '',
      ].join(' ')}
      onClick={() => updateControls({ [control]: !analysisControls[control] })}
      aria-pressed={analysisControls[control]}
      disabled={disabled}
      title={`Toggle ${label.toLowerCase()} overlay`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
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
      {overlayToggle('analysisShowPolicy', 'Policy', <FaThLarge size={11} aria-hidden="true" />)}
      {overlayToggle('analysisShowOwnership', 'Territory', <FaMap size={11} aria-hidden="true" />)}
    </div>
  );
  const analysisCacheControl = (
    <button
      type="button"
      className="panel-action-button"
      onClick={clearAnalysisCache}
      disabled={analysisCacheSize === 0 || isGameAnalysisRunning}
      title={
        analysisCacheSize > 0
          ? isGameAnalysisRunning
            ? 'Stop analysis before clearing cache'
            : `Clear ${analysisCacheSize} cached ${analysisCacheSize === 1 ? 'analysis' : 'analyses'}`
          : 'No cached analysis'
      }
      aria-label="Clear analysis cache"
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
      title="Move quality legend"
      aria-label="Move quality legend"
      aria-expanded={legendOpen}
      aria-controls="analysis-quality-legend"
    >
      <FaInfoCircle size={12} aria-hidden="true" />
    </button>
  );
  const qualityLegend = legendOpen ? (
    <div
      id="analysis-quality-legend"
      className="border-b border-[var(--ui-border)] bg-[var(--ui-surface)] px-2 py-2 text-[11px]"
      data-analysis-quality-legend="true"
    >
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <div className="font-semibold text-[var(--ui-text)]">Move quality</div>
        <div className="ui-text-faint">Points lost</div>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {qualityLegendItems.map((item) => (
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
    </div>
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
  const renderPlayedMoveReadout = (className: string, labelClassName = 'ui-text-faint') => {
    const toneClass = pointsSummaryClass(playedMoveQuality?.tone ?? pointsSummary.tone);
    if (playedMoveQuality) {
      return (
        <div
          className={className}
          title={playedMoveQuality.title}
          data-analysis-played-move="true"
        >
          <div className={labelClassName}>Played</div>
          <div className={['truncate font-mono text-sm', toneClass].join(' ')}>
            {playedMoveQuality.playerLabel} {playedMoveQuality.moveLabel}
          </div>
          <div className="mt-0.5 truncate text-[10px] font-semibold uppercase tracking-wide ui-text-faint">
            {[playedMoveQuality.rankLabel, playedMoveQuality.valueLabel].filter((part) => part !== '-').join(' · ')}
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
      className="grid gap-1.5 text-[11px]"
      data-analysis-graph-readout="true"
      style={readoutGridStyle}
    >
      <div className="min-w-0 rounded border border-[var(--ui-border)] bg-[var(--ui-surface)] px-2 py-1.5">
        <div className="ui-text-faint">Move</div>
        <div className="font-mono text-sm text-[var(--ui-text)]">{currentMoveNumber}</div>
      </div>
      {renderBestMoveReadout('min-w-0 rounded border border-[var(--ui-border)] bg-[var(--ui-surface)] px-2 py-1.5')}
      {renderPlayedMoveReadout('min-w-0 rounded border border-[var(--ui-border)] bg-[var(--ui-surface)] px-2 py-1.5')}
      <div className="min-w-0 rounded border border-[var(--ui-border)] bg-[var(--ui-surface)] px-2 py-1.5">
        <div className="ui-text-faint">Winrate</div>
        <div className="font-mono text-sm text-[var(--ui-success)]">
          {typeof winRate === 'number' ? `${(winRate * 100).toFixed(1)}%` : '-'}
        </div>
      </div>
      <div className="min-w-0 rounded border border-[var(--ui-border)] bg-[var(--ui-surface)] px-2 py-1.5">
        <div className="ui-text-faint">Score</div>
        <div className="font-mono text-sm text-[var(--ui-warning)]">
          {scoreLeadLabel}
        </div>
      </div>
    </div>
  );
  const liveVisitPresetControls = (
    <div
      className="mt-3 border-t border-[var(--ui-border)] pt-3"
      data-analysis-live-visit-presets="true"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="text-[11px] font-semibold uppercase tracking-wide ui-text-faint">
          MCTS depth
        </div>
        <div className="text-[11px] ui-text-faint">Kaya-style</div>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {liveVisitPresets.map((preset) => {
          const active = liveVisits === preset;
          return (
            <button
              key={preset}
              type="button"
              className={[
                'rounded-md border px-2 py-1.5 text-left transition-colors disabled:opacity-45 disabled:cursor-not-allowed',
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
    <div className="flex flex-col min-h-0">
      <div className="panel-section-header">
        <EngineStatusBadge
          label={engineMeta}
          title={engineMetaTitle}
          dotClass={engineDot}
          variant="inline"
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
        <div className="grid grid-cols-2 gap-2 text-[11px]">
          <div>
            <div className="ui-text-faint">State</div>
            <div className={engineStatus === 'error' ? 'text-[var(--ui-danger)] font-semibold' : 'text-[var(--ui-text)] font-semibold'}>
              {engineStatus}
            </div>
          </div>
          <div>
            <div className="ui-text-faint">Backend</div>
            <div className="text-[var(--ui-text)] font-semibold">
              {activeBackend}{isFallback ? ' fallback' : ''}
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
            <div className="text-[var(--ui-text)]">{modelSource}</div>
          </div>
        </div>
        {isFallback && (
          <div className="mt-2 text-[11px] text-[var(--ui-warning)]">
            Requested {requestedBackend}, running {engineBackend}.
          </div>
        )}
        {engineError && (
          <div className="mt-2 text-[11px] text-[var(--ui-danger)] break-words">
            {engineError}
          </div>
        )}
        {liveVisitPresetControls}
      </div>
      {!compact && (
        <div className="panel-toolbar">
          <button
            className={[
              'panel-action-button',
              isGameAnalysisRunning && gameAnalysisType === 'quick' ? 'danger active' : '',
            ].join(' ')}
            onClick={() => {
              if (isGameAnalysisRunning && gameAnalysisType === 'quick') stopGameAnalysis();
              else startQuickGameAnalysis();
            }}
          >
            {isGameAnalysisRunning && gameAnalysisType === 'quick'
              ? `Stop quick (${gameAnalysisDone}/${gameAnalysisTotal})`
              : 'Quick graph'}
          </button>
          <button
            className={[
              'panel-action-button',
              isGameAnalysisRunning && gameAnalysisType === 'fast' ? 'danger active' : '',
            ].join(' ')}
            onClick={() => {
              if (isGameAnalysisRunning && gameAnalysisType === 'fast') stopGameAnalysis();
              else startFastGameAnalysis();
            }}
          >
            {isGameAnalysisRunning && gameAnalysisType === 'fast'
              ? `Stop fast (${gameAnalysisDone}/${gameAnalysisTotal})`
              : 'Fast MCTS'}
          </button>
          <button
            className="panel-action-button danger"
            onClick={stopGameAnalysis}
            disabled={!isGameAnalysisRunning}
          >
            Stop
          </button>
          {graphMetricToggles}
          {analysisCacheControl}
          {overlayToggles}
          <div className="ml-auto flex items-center gap-2 text-xs">
            {legendButton}
            <button
              className="panel-icon-button"
              onClick={onOpenGameAnalysis}
              title="Re-analyze…"
            >
              <FaRedoAlt size={12} />
            </button>
            <button
              className="panel-icon-button"
              onClick={onOpenGameReport}
              title="Game report…"
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
          <div className="space-y-2">
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
            <div className="grid gap-2" style={readoutGridStyle}>
              {renderBestMoveReadout('min-w-0 px-2 py-1.5', 'text-[11px] ui-text-faint')}
              {renderPlayedMoveReadout('min-w-0 px-2 py-1.5', 'text-[11px] ui-text-faint')}
              <div className="px-2 py-1.5">
                <div className="text-[11px] ui-text-faint">Winrate</div>
                <div className="font-mono text-sm text-[var(--ui-success)]">
                  {typeof winRate === 'number' ? `${(winRate * 100).toFixed(1)}%` : '-'}
                </div>
              </div>
              <div className="px-2 py-1.5">
                <div className="text-[11px] ui-text-faint">Score</div>
                <div className="font-mono text-sm text-[var(--ui-warning)]">
                  {scoreLeadLabel}
                </div>
              </div>
            </div>
          </div>
        ) : activeTab === 'graph' ? (
          <div className="space-y-2">
            <div className="panel-compact-graph">
              <ScoreWinrateGraph showScore={graphMetrics.score} showWinrate={graphMetrics.winrate} />
            </div>
            {graphReadout}
          </div>
        ) : (
          <div className="grid gap-2" style={readoutGridStyle}>
            {renderBestMoveReadout('min-w-0 px-2 py-1.5', 'text-[11px] ui-text-faint')}
            {renderPlayedMoveReadout('min-w-0 px-2 py-1.5', 'text-[11px] ui-text-faint')}
            <div className="px-2 py-1.5">
              <div className="text-[11px] ui-text-faint">Winrate</div>
              <div className="font-mono text-sm text-[var(--ui-success)]">
                {typeof winRate === 'number' ? `${(winRate * 100).toFixed(1)}%` : '-'}
              </div>
            </div>
            <div className="px-2 py-1.5">
              <div className="text-[11px] ui-text-faint">Score</div>
              <div className="font-mono text-sm text-[var(--ui-warning)]">
                {scoreLeadLabel}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
