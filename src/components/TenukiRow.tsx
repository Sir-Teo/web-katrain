import React from 'react';
import { useGameStore } from '../store/gameStore';
import { summarizeTenukiRow } from '../utils/tenukiValue';
import { formatMoveLabel } from './layout/ui-utils';

/**
 * "Can I play elsewhere?" -- the question a player actually asks over the board.
 * The engine settles it by evaluating the same position after the side to move
 * passes, which hands the point to the opponent; the gap between the two leads
 * prices it.
 *
 * On demand rather than always-on: it costs a second full search, so it is a
 * button the reader presses, not another number that appears unbidden.
 *
 * Self-contained and store-reading, like `ScoreWinrateGraph`, because the
 * desktop dashboard and the mobile panel keep separate markup by design and
 * this control should not be written twice to sit in both.
 */
export const TenukiRow: React.FC<{ className?: string }> = ({ className }) => {
  const currentNode = useGameStore((state) => state.currentNode);
  const treeVersion = useGameStore((state) => state.treeVersion);
  const tenukiAnalysis = useGameStore((state) => state.tenukiAnalysis);
  const analyzeTenuki = useGameStore((state) => state.analyzeTenuki);

  // Node analysis mutates in place; treeVersion bumps whenever it changes.
  void treeVersion;

  const row = summarizeTenukiRow({
    tenuki: tenukiAnalysis?.nodeId === currentNode.id ? tenukiAnalysis : null,
    hasAnalysis: !!currentNode.analysis && Number.isFinite(currentNode.analysis.rootScoreLead),
    formatPoint: (x, y) => formatMoveLabel(x, y, currentNode.gameState.board.length),
  });

  return (
    <div
      className={[
        'mt-1.5 flex items-center gap-2 border-t border-[var(--ui-border)] pt-1.5',
        className ?? '',
      ].join(' ')}
      data-analysis-tenuki="true"
      data-analysis-tenuki-status={row.status}
    >
      <button
        type="button"
        className="panel-action-button"
        onClick={() => analyzeTenuki()}
        disabled={row.disabled}
        title={row.disabledReason ?? 'Evaluate the position again after a pass, to price the point here'}
        aria-label="Ask what playing elsewhere would cost"
      >
        {row.buttonLabel}
      </button>
      <div className="min-w-0 flex-1 text-[0.6875rem] ui-text-faint">{row.summary}</div>
    </div>
  );
};
