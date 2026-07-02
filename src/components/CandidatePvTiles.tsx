import React, { useEffect, useMemo } from 'react';
import { shallow } from 'zustand/shallow';
import { useGameStore } from '../store/gameStore';
import type { CandidateMove } from '../types';
import { getEvaluationClass } from '../utils/nodeAnalysis';
import { getKaTrainEvalColors } from '../utils/katrainTheme';

interface CandidatePvTilesProps {
  /** `${x},${y}` of the currently pinned candidate, or null. */
  pinnedKey: string | null;
  /** Pin a candidate's PV onto the board (or null to clear). */
  onPin: (move: CandidateMove | null) => void;
}

const moveKey = (move: CandidateMove) => `${move.x},${move.y}`;

function moveLabel(move: CandidateMove, boardSize: number): string {
  if (move.x < 0 || move.y < 0) return 'Pass';
  const col = String.fromCharCode(65 + (move.x >= 8 ? move.x + 1 : move.x));
  return `${col}${boardSize - move.y}`;
}

/**
 * Touch-friendly alternative to hovering candidate moves: a row of tiles that,
 * when tapped, pin that move's principal variation onto the board as a numbered
 * ghost sequence without navigating. Tap again (or another tile) to swap/clear.
 */
export const CandidatePvTiles: React.FC<CandidatePvTilesProps> = ({ pinnedKey, onPin }) => {
  const { moves, boardSize, nodeId, trainerTheme } = useGameStore(
    (state) => ({
      moves: state.currentNode.analysis?.moves ?? null,
      boardSize: state.currentNode.gameState.board.length,
      nodeId: state.currentNode.id,
      trainerTheme: state.settings.trainerTheme,
    }),
    shallow
  );

  const evalColors = useMemo(() => getKaTrainEvalColors(trainerTheme), [trainerTheme]);

  const tiles = useMemo(
    () =>
      (moves ?? [])
        .filter((m) => m.x >= 0 && m.y >= 0 && m.pv && m.pv.length > 0)
        .slice(0, 12),
    [moves]
  );

  // A pinned preview belongs to the node it was pinned on; drop it when the
  // position changes so the board ghost never desyncs.
  useEffect(() => {
    if (pinnedKey) onPin(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeId]);

  if (tiles.length === 0) return null;

  return (
    <div className="flex items-center gap-1.5 overflow-x-auto px-1 py-1" aria-label="Preview continuations">
      {tiles.map((move) => {
        const key = moveKey(move);
        const active = pinnedKey === key;
        const cls = getEvaluationClass(move.pointsLost, undefined, evalColors.length);
        const [r, g, b] = evalColors[cls] ?? [148, 163, 184, 1];
        const dot = `rgb(${r}, ${g}, ${b})`;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onPin(active ? null : move)}
            aria-pressed={active}
            className={[
              'flex shrink-0 items-center gap-1.5 rounded-lg border px-2 py-1 text-xs font-mono transition-colors',
              active
                ? 'border-[var(--ui-accent)] bg-[var(--ui-accent-soft)] text-[var(--ui-text)]'
                : 'border-[var(--ui-border)] bg-[var(--ui-surface)] text-[var(--ui-text-muted)] hover:bg-[var(--ui-surface-2)]',
            ].join(' ')}
            title={`Preview ${moveLabel(move, boardSize)} continuation (${move.pv?.length ?? 0} moves)`}
          >
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: dot }} aria-hidden="true" />
            <span>{moveLabel(move, boardSize)}</span>
          </button>
        );
      })}
      {pinnedKey && (
        <button
          type="button"
          onClick={() => onPin(null)}
          className="shrink-0 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-surface)] px-2 py-1 text-xs text-[var(--ui-text-muted)] hover:bg-[var(--ui-surface-2)]"
          title="Clear preview"
        >
          Clear
        </button>
      )}
    </div>
  );
};

CandidatePvTiles.displayName = 'CandidatePvTiles';
