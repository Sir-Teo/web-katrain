import React, { useEffect, useState } from 'react';
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
}

export const AnalysisPanel: React.FC<AnalysisPanelProps> = ({
  mode,
  modePanels,
  updatePanels,
  statusText,
  engineDot,
  engineMeta,
  engineMetaTitle,
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
}) => {
  void mode;
  const [activeTab, setActiveTab] = useState<'graph' | 'stats'>(() => {
    if (modePanels.statsOpen && !modePanels.graphOpen) return 'stats';
    return 'graph';
  });

  useEffect(() => {
    if (modePanels.statsOpen && !modePanels.graphOpen) {
      setActiveTab('stats');
    } else {
      setActiveTab('graph');
    }
  }, [modePanels.graphOpen, modePanels.statsOpen]);

  return (
    <div className="flex flex-col h-full">
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
      <div className="panel-toolbar">
        <div className="inline-flex rounded-md border border-[var(--ui-border)] overflow-hidden bg-[var(--ui-panel)]">
          <button
            className={[
              'px-2.5 py-1 text-xs font-semibold transition-colors',
              isGameAnalysisRunning && gameAnalysisType === 'quick'
                ? 'bg-[var(--ui-danger-soft)] text-[var(--ui-danger)]'
                : 'hover:bg-[var(--ui-surface-2)] text-[var(--ui-text)]',
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
          <div className="w-px bg-[var(--ui-border)]" />
          <button
            className={[
              'px-2.5 py-1 text-xs font-semibold transition-colors',
              isGameAnalysisRunning && gameAnalysisType === 'fast'
                ? 'bg-[var(--ui-danger-soft)] text-[var(--ui-danger)]'
                : 'hover:bg-[var(--ui-surface-2)] text-[var(--ui-text)]',
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
          <div className="w-px bg-[var(--ui-border)]" />
          <button
            className={[
              'px-2.5 py-1 text-xs font-semibold transition-colors',
              isGameAnalysisRunning
                ? 'ui-danger-soft'
                : 'text-[var(--ui-text-muted)] opacity-50 cursor-not-allowed',
            ].join(' ')}
            onClick={stopGameAnalysis}
            disabled={!isGameAnalysisRunning}
          >
            Stop
          </button>
        </div>
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

      <div className="panel-tab-strip">
        <button
          type="button"
          className={['panel-tab', activeTab === 'graph' ? 'active' : ''].join(' ')}
          onClick={() => {
            setActiveTab('graph');
            updatePanels({ graphOpen: true, statsOpen: false });
          }}
        >
          <span className="inline-flex items-center gap-2">
            <FaChartLine size={12} />
            Graph
          </span>
        </button>
        <button
          type="button"
          className={['panel-tab', activeTab === 'stats' ? 'active' : ''].join(' ')}
          onClick={() => {
            setActiveTab('stats');
            updatePanels({ graphOpen: false, statsOpen: true });
          }}
        >
          <span className="inline-flex items-center gap-2">
            <FaChartBar size={12} />
            Stats
          </span>
        </button>
      </div>
      <div className="panel-section-content flex-1 min-h-0">
        {activeTab === 'graph' ? (
          <div style={{ height: 130 }}>
            <ScoreWinrateGraph showScore showWinrate />
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
