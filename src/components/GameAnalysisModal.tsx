import React, { useMemo, useState } from 'react';
import { FaTimes } from 'react-icons/fa';
import { shallow } from 'zustand/shallow';
import { useGameStore } from '../store/gameStore';
import { ENGINE_MAX_VISITS } from '../engine/katago/limits';
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
import { useEscapeToClose } from '../hooks/useEscapeToClose';

interface GameAnalysisModalProps {
  onClose: () => void;
}

const MAX_VISITS_ID = 'game-analysis-max-visits';
const LIMIT_MOVES_ID = 'game-analysis-limit-moves';
const START_MOVE_ID = 'game-analysis-start-move';
const END_MOVE_ID = 'game-analysis-end-move';
const MISTAKES_ONLY_ID = 'game-analysis-mistakes-only';
const STATUS_LABEL_ID = 'game-analysis-status-label';
const DEPTH_PRESETS_LABEL_ID = 'game-analysis-depth-presets-label';

export const GameAnalysisModal: React.FC<GameAnalysisModalProps> = ({ onClose }) => {
  useEscapeToClose(onClose);
  const {
    currentNode,
    isGameAnalysisRunning,
    gameAnalysisType,
    gameAnalysisDone,
    gameAnalysisTotal,
    defaultVisits,
    startFullGameAnalysis,
    stopGameAnalysis,
  } = useGameStore(
    (state) => ({
      currentNode: state.currentNode,
      isGameAnalysisRunning: state.isGameAnalysisRunning,
      gameAnalysisType: state.gameAnalysisType,
      gameAnalysisDone: state.gameAnalysisDone,
      gameAnalysisTotal: state.gameAnalysisTotal,
      defaultVisits: state.settings.katagoVisits,
      startFullGameAnalysis: state.startFullGameAnalysis,
      stopGameAnalysis: state.stopGameAnalysis,
    }),
    shallow
  );

  const defaultStartMove = useMemo(() => currentNode.gameState.moveHistory.length, [currentNode]);
  const defaultMaxVisits = useMemo(() => clampAnalysisVisits(defaultVisits), [defaultVisits]);

  const [visits, setVisits] = useState<number>(defaultMaxVisits);
  const [useMoveRange, setUseMoveRange] = useState<boolean>(false);
  const [startMove, setStartMove] = useState<number>(defaultStartMove);
  const [endMove, setEndMove] = useState<number>(999);
  const [mistakesOnly, setMistakesOnly] = useState<boolean>(false);

  const isRunning = isGameAnalysisRunning && gameAnalysisType === 'full';
  const visitPresets = useMemo(
    () => mergeVisitPresets(ANALYSIS_VISIT_PRESETS, defaultMaxVisits),
    [defaultMaxVisits]
  );

  const clampInt = (v: string, fallback: number): number => {
    const n = Number.parseInt(v || String(fallback), 10);
    if (!Number.isFinite(n)) return fallback;
    return n;
  };

  const onStart = () => {
    const v = clampAnalysisVisits(visits);
    const range = useMoveRange ? ([startMove, endMove] as [number, number]) : null;
    startFullGameAnalysis({ visits: v, moveRange: range, mistakesOnly });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 sm:p-6 mobile-safe-inset mobile-safe-area-bottom">
      <div
        className="ui-panel rounded-lg shadow-xl w-[92vw] max-w-[28rem] max-h-[90dvh] overflow-hidden flex flex-col border"
        role="dialog"
        aria-modal="true"
        aria-labelledby="game-analysis-title"
      >
        <div className="flex items-center justify-between p-4 border-b border-[var(--ui-border)] ui-bar">
          <h2 id="game-analysis-title" className="text-lg font-semibold text-[var(--ui-text)]">Re-analyze Game (KaTrain)</h2>
          <button
            type="button"
            onClick={onClose}
            className="ui-control grid shrink-0 place-items-center rounded-lg text-[var(--ui-text-muted)] hover:bg-[var(--ui-surface-2)] hover:text-[var(--ui-text)]"
            title="Close"
            aria-label="Close game analysis"
          >
            <FaTimes aria-hidden="true" />
          </button>
        </div>

        <div className="p-4 space-y-4 overflow-y-auto overscroll-contain">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label htmlFor={MAX_VISITS_ID} className="text-[var(--ui-text-muted)] block text-sm">Max Visits</label>
              <input
                id={MAX_VISITS_ID}
                type="number"
                min={ANALYSIS_MIN_VISITS}
                max={ENGINE_MAX_VISITS}
                value={visits}
                onChange={(e) => setVisits(clampAnalysisVisits(clampInt(e.target.value, defaultMaxVisits)))}
                className="w-full ui-input rounded p-2 border focus:border-[var(--ui-accent)] outline-none text-sm font-mono"
              />
              <p className="text-xs ui-text-faint">Defaults to engine Visits ({defaultMaxVisits}).</p>
            </div>

            <div className="space-y-1">
              <div id={STATUS_LABEL_ID} className="text-[var(--ui-text-muted)] block text-sm">Status</div>
              <div
                className="w-full ui-surface rounded p-2 border border-[var(--ui-border)] text-sm font-mono"
                role="status"
                aria-labelledby={STATUS_LABEL_ID}
              >
                {isRunning ? `${gameAnalysisDone}/${gameAnalysisTotal}` : '—'}
              </div>
              <div className="flex gap-2 mt-2">
                <button
                  type="button"
                  className="flex-1 px-3 py-2 rounded bg-[var(--ui-surface-2)] hover:brightness-110 text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
                  disabled={!isRunning}
                  onClick={() => stopGameAnalysis()}
                >
                  Stop
                </button>
              </div>
            </div>
          </div>

          <div
            className="pt-2 border-t border-[var(--ui-border)] space-y-2"
            role="group"
            aria-labelledby={DEPTH_PRESETS_LABEL_ID}
            data-game-analysis-visit-presets="true"
          >
            <div className="flex items-center justify-between gap-2">
              <div id={DEPTH_PRESETS_LABEL_ID} className="text-[var(--ui-text-muted)] text-sm">MCTS depth presets</div>
              <span className="text-xs ui-text-faint">Kaya-style</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {visitPresets.map((preset) => {
                const active = visits === preset;
                return (
                  <button
                    key={preset}
                    type="button"
                    className={[
                      'rounded border px-2 py-2 text-left transition-colors',
                      active
                        ? 'border-[var(--ui-accent)] bg-[var(--ui-accent-soft)] text-[var(--ui-text)]'
                        : 'border-[var(--ui-border)] bg-[var(--ui-surface)] text-[var(--ui-text-muted)] hover:bg-[var(--ui-surface-2)] hover:text-[var(--ui-text)]',
                    ].join(' ')}
                    onClick={() => setVisits(preset)}
                    aria-pressed={active}
                  >
                    <span className="block font-mono text-sm">{preset}</span>
                    <span className="block text-[10px] font-semibold uppercase tracking-wide">
                      {visitPresetLabel(preset, defaultMaxVisits)}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="pt-1">
              <input
                type="range"
                min={ANALYSIS_VISIT_SLIDER_MIN}
                max={ANALYSIS_VISIT_SLIDER_MAX}
                step={0.01}
                value={visitCountToSliderValue(visits)}
                className="analysis-command-bar__depth-slider"
                aria-label="Game analysis depth slider"
                aria-valuetext={`${visits} visits`}
                data-game-analysis-depth-slider="true"
                style={{ '--analysis-depth-fill': `${visitSliderFillPercent(visits)}%` } as React.CSSProperties}
                onChange={(event) => setVisits(sliderValueToVisitCount(Number.parseFloat(event.currentTarget.value)))}
              />
              <div className="analysis-command-bar__depth-scale" aria-hidden="true">
                <span>{ANALYSIS_MIN_VISITS}</span>
                <span>{formatVisitCount(ENGINE_MAX_VISITS)}</span>
              </div>
            </div>
          </div>

          <div className="pt-2 border-t border-[var(--ui-border)] space-y-3">
            <div className="flex items-center justify-between">
              <label htmlFor={LIMIT_MOVES_ID} className="text-[var(--ui-text-muted)]">Limit to moves</label>
              <input
                id={LIMIT_MOVES_ID}
                type="checkbox"
                checked={useMoveRange}
                onChange={(e) => setUseMoveRange(e.target.checked)}
                className="toggle"
              />
            </div>

            <div className={['grid grid-cols-2 gap-3', useMoveRange ? '' : 'opacity-40'].join(' ')}>
              <div className="space-y-1">
                <label htmlFor={START_MOVE_ID} className="text-[var(--ui-text-muted)] block text-sm">From move</label>
                <input
                  id={START_MOVE_ID}
                  type="number"
                  min={0}
                  step={1}
                  disabled={!useMoveRange}
                  value={startMove}
                  onChange={(e) => setStartMove(Math.max(0, clampInt(e.target.value, defaultStartMove)))}
                  className="w-full ui-input rounded p-2 border focus:border-[var(--ui-accent)] outline-none text-sm font-mono disabled:opacity-60"
                />
              </div>
              <div className="space-y-1">
                <label htmlFor={END_MOVE_ID} className="text-[var(--ui-text-muted)] block text-sm">To move</label>
                <input
                  id={END_MOVE_ID}
                  type="number"
                  min={0}
                  step={1}
                  disabled={!useMoveRange}
                  value={endMove}
                  onChange={(e) => setEndMove(Math.max(0, clampInt(e.target.value, 999)))}
                  className="w-full ui-input rounded p-2 border focus:border-[var(--ui-accent)] outline-none text-sm font-mono disabled:opacity-60"
                />
              </div>
            </div>
            <p className="text-xs ui-text-faint">
              Matches KaTrain: moves are 0-indexed (0 = first move).
            </p>
          </div>

          <div className="pt-2 border-t border-[var(--ui-border)]">
            <div className="flex items-center justify-between">
              <label htmlFor={MISTAKES_ONLY_ID} className="text-[var(--ui-text-muted)]">Re-analyze mistakes only</label>
              <input
                id={MISTAKES_ONLY_ID}
                type="checkbox"
                checked={mistakesOnly}
                onChange={(e) => setMistakesOnly(e.target.checked)}
                className="toggle"
              />
            </div>
            <p className="text-xs ui-text-faint mt-2">
              Uses KaTrain’s default mistake threshold (from trainer thresholds). Requires existing analysis to detect mistakes.
            </p>
          </div>
        </div>

        <div className="p-4 ui-bar flex justify-end gap-2 border-t border-[var(--ui-border)]">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-[var(--ui-surface-2)] hover:brightness-110 text-[var(--ui-text)] border border-[var(--ui-border)] rounded font-medium"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onStart}
            className="px-4 py-2 ui-accent-bg hover:brightness-110 rounded font-medium"
          >
            Analyze
          </button>
        </div>
      </div>
    </div>
  );
};
