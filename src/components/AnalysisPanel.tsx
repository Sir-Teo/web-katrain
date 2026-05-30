import React from 'react';
import { FaChartLine, FaChartBar, FaRedoAlt, FaFileAlt } from 'react-icons/fa';
import { ScoreWinrateGraph } from './ScoreWinrateGraph';
import type { UiMode, UiState } from './layout/types';
import { EngineStatusBadge } from './layout/ui';

interface AnalysisPanelProps {
  mode: UiMode;
  modePanels: UiState['panels'][UiMode];
  updatePanels: (
    partial: Partial<UiState['panels'][UiMode]> | ((current: UiState['panels'][UiMode]) => Partial<UiState['panels'][UiMode]>)
  ) => void;
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
  startFastGameAnalysis: () => void;
  stopGameAnalysis: () => void;
  onOpenGameAnalysis: () => void;
  onOpenGameReport: () => void;
  winRate: number | null;
  scoreLead: number | null;
  pointsLost: number | null;
  compact?: boolean;
}

type GraphMetric = keyof UiState['panels'][UiMode]['graph'];

export const AnalysisPanel: React.FC<AnalysisPanelProps> = ({
  mode,
  modePanels,
  updatePanels,
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
  onOpenGameAnalysis,
  onOpenGameReport,
  winRate,
  scoreLead,
  pointsLost,
  compact = false,
}) => {
  void mode;
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
          <div className="ml-auto flex items-center gap-2 text-xs">
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
            {graphMetricToggles}
            <div className="panel-compact-graph">
              <ScoreWinrateGraph showScore={graphMetrics.score} showWinrate={graphMetrics.winrate} />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="px-2 py-1.5">
                <div className="text-[11px] ui-text-faint">Winrate</div>
                <div className="font-mono text-sm text-[var(--ui-success)]">
                  {typeof winRate === 'number' ? `${(winRate * 100).toFixed(1)}%` : '-'}
                </div>
              </div>
              <div className="px-2 py-1.5">
                <div className="text-[11px] ui-text-faint">Score</div>
                <div className="font-mono text-sm text-[var(--ui-warning)]">
                  {typeof scoreLead === 'number' ? `${scoreLead > 0 ? '+' : ''}${scoreLead.toFixed(1)}` : '-'}
                </div>
              </div>
              <div className="px-2 py-1.5">
                <div className="text-[11px] ui-text-faint">
                  {pointsLost != null && pointsLost < 0 ? 'Gained' : 'Lost'}
                </div>
                <div className="font-mono text-sm text-[var(--ui-danger)]">
                  {pointsLost != null ? Math.abs(pointsLost).toFixed(1) : '-'}
                </div>
              </div>
            </div>
          </div>
        ) : activeTab === 'graph' ? (
          <div className="panel-compact-graph">
            <ScoreWinrateGraph showScore={graphMetrics.score} showWinrate={graphMetrics.winrate} />
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            <div className="px-2 py-1.5">
              <div className="text-[11px] ui-text-faint">Winrate</div>
              <div className="font-mono text-sm text-[var(--ui-success)]">
                {typeof winRate === 'number' ? `${(winRate * 100).toFixed(1)}%` : '-'}
              </div>
            </div>
            <div className="px-2 py-1.5">
              <div className="text-[11px] ui-text-faint">Score</div>
              <div className="font-mono text-sm text-[var(--ui-warning)]">
                {typeof scoreLead === 'number' ? `${scoreLead > 0 ? '+' : ''}${scoreLead.toFixed(1)}` : '-'}
              </div>
            </div>
            <div className="px-2 py-1.5">
              <div className="text-[11px] ui-text-faint">
                {pointsLost != null && pointsLost < 0 ? 'Gained' : 'Lost'}
              </div>
              <div className="font-mono text-sm text-[var(--ui-danger)]">
                {pointsLost != null ? Math.abs(pointsLost).toFixed(1) : '-'}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
