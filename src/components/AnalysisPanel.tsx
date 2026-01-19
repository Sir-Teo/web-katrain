import React from 'react';
import { ScoreWinrateGraph } from './ScoreWinrateGraph';
import type { UiMode, UiState } from './layout/types';
import { EngineStatusBadge, PanelHeaderButton, SectionHeader } from './layout/ui';

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

  return (
    <div className="ui-surface border rounded p-3 space-y-3">
      <div className="flex items-center justify-between gap-2 text-xs ui-text-faint">
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
        <div>
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
      <div className="flex flex-wrap gap-2">
        <button
          className={[
            'px-2 py-1 rounded text-xs font-medium',
            isGameAnalysisRunning && gameAnalysisType === 'quick'
              ? 'ui-danger-soft border'
              : 'bg-[var(--ui-surface-2)] text-[var(--ui-text)] border border-[var(--ui-border)] hover:brightness-110',
          ].join(' ')}
          onClick={() => {
            if (isGameAnalysisRunning && gameAnalysisType === 'quick') stopGameAnalysis();
            else startQuickGameAnalysis();
          }}
        >
          {isGameAnalysisRunning && gameAnalysisType === 'quick'
            ? `Stop quick (${gameAnalysisDone}/${gameAnalysisTotal})`
            : 'Run quick graph'}
        </button>
        <button
          className={[
            'px-2 py-1 rounded text-xs font-medium',
            isGameAnalysisRunning && gameAnalysisType === 'fast'
              ? 'ui-danger-soft border'
              : 'bg-[var(--ui-surface-2)] text-[var(--ui-text)] border border-[var(--ui-border)] hover:brightness-110',
          ].join(' ')}
          onClick={() => {
            if (isGameAnalysisRunning && gameAnalysisType === 'fast') stopGameAnalysis();
            else startFastGameAnalysis();
          }}
        >
          {isGameAnalysisRunning && gameAnalysisType === 'fast'
            ? `Stop fast (${gameAnalysisDone}/${gameAnalysisTotal})`
            : 'Run fast MCTS'}
        </button>
        <button
          className="px-2 py-1 rounded text-xs font-medium bg-[var(--ui-surface-2)] text-[var(--ui-text)] border border-[var(--ui-border)] hover:brightness-110 disabled:opacity-50"
          onClick={stopGameAnalysis}
          disabled={!isGameAnalysisRunning}
        >
          Stop analysis
        </button>
        <button
          className="px-2 py-1 rounded text-xs font-medium bg-[var(--ui-surface-2)] text-[var(--ui-text)] border border-[var(--ui-border)] hover:brightness-110"
          onClick={onOpenGameAnalysis}
        >
          Re-analyze…
        </button>
        <button
          className="px-2 py-1 rounded text-xs font-medium bg-[var(--ui-surface-2)] text-[var(--ui-text)] border border-[var(--ui-border)] hover:brightness-110"
          onClick={onOpenGameReport}
        >
          Game report…
        </button>
      </div>

      <div>
        <SectionHeader
          title="Score / Winrate Graph"
          open={modePanels.graphOpen}
          onToggle={() => updatePanels((current) => ({ graphOpen: !current.graphOpen }))}
          actions={
            <div className="flex gap-1">
              <PanelHeaderButton
                label="Score"
                colorClass="bg-blue-600/30"
                active={modePanels.graph.score}
                onClick={() =>
                  updatePanels((current) => ({ graph: { ...current.graph, score: !current.graph.score } }))
                }
              />
              <PanelHeaderButton
                label="Win%"
                colorClass="bg-green-600/30"
                active={modePanels.graph.winrate}
                onClick={() =>
                  updatePanels((current) => ({ graph: { ...current.graph, winrate: !current.graph.winrate } }))
                }
              />
            </div>
          }
        />
        {modePanels.graphOpen && (
          <div className="mt-2 ui-surface border rounded p-2">
            {modePanels.graph.score || modePanels.graph.winrate ? (
              <div style={{ height: 140 }}>
                <ScoreWinrateGraph showScore={modePanels.graph.score} showWinrate={modePanels.graph.winrate} />
              </div>
            ) : (
              <div className="h-20 flex items-center justify-center ui-text-faint text-sm">Graph hidden</div>
            )}
          </div>
        )}
      </div>

      <div>
        <SectionHeader
          title="Move Stats"
          open={modePanels.statsOpen}
          onToggle={() => updatePanels((current) => ({ statsOpen: !current.statsOpen }))}
          actions={
            <div className="flex gap-1">
              <PanelHeaderButton
                label="Score"
                colorClass="bg-blue-600/30"
                active={modePanels.stats.score}
                onClick={() =>
                  updatePanels((current) => ({ stats: { ...current.stats, score: !current.stats.score } }))
                }
              />
              <PanelHeaderButton
                label="Win%"
                colorClass="bg-green-600/30"
                active={modePanels.stats.winrate}
                onClick={() =>
                  updatePanels((current) => ({ stats: { ...current.stats, winrate: !current.stats.winrate } }))
                }
              />
              <PanelHeaderButton
                label="Pts"
                colorClass="bg-red-600/30"
                active={modePanels.stats.points}
                onClick={() =>
                  updatePanels((current) => ({ stats: { ...current.stats, points: !current.stats.points } }))
                }
              />
            </div>
          }
        />
        {modePanels.statsOpen && (
          <div className="mt-2 ui-surface border rounded overflow-hidden">
            {modePanels.stats.winrate && (
              <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--ui-border)]">
                <div className="text-sm text-[var(--ui-text-muted)]">Winrate</div>
                <div className="font-mono text-sm text-[var(--ui-success)]">
                  {typeof winRate === 'number' ? `${(winRate * 100).toFixed(1)}%` : '-'}
                </div>
              </div>
            )}
            {modePanels.stats.score && (
              <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--ui-border)]">
                <div className="text-sm text-[var(--ui-text-muted)]">Score</div>
                <div className="font-mono text-sm text-[var(--ui-warning)]">
                  {typeof scoreLead === 'number' ? `${scoreLead > 0 ? '+' : ''}${scoreLead.toFixed(1)}` : '-'}
                </div>
              </div>
            )}
            {modePanels.stats.points && (
              <div className="flex items-center justify-between px-3 py-2">
                <div className="text-sm text-[var(--ui-text-muted)]">
                  {pointsLost != null && pointsLost < 0 ? 'Points gained' : 'Points lost'}
                </div>
                <div className="font-mono text-sm text-[var(--ui-danger)]">{pointsLost != null ? Math.abs(pointsLost).toFixed(1) : '-'}</div>
              </div>
            )}
            {!modePanels.stats.winrate && !modePanels.stats.score && !modePanels.stats.points && (
              <div className="px-3 py-3 text-sm ui-text-faint">Stats hidden</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
