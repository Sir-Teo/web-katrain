import React from 'react';
import { FaFlag, FaTimes } from 'react-icons/fa';
import type { Player } from '../types';
import { useInitialDialogFocus } from '../hooks/useInitialDialogFocus';
import { getPlayerLabel, getResignResult, getResignWinnerLabel } from '../utils/resign';

interface ResignConfirmModalProps {
  player: Player;
  onCancel: () => void;
  onConfirm: () => void;
}

export const ResignConfirmModal: React.FC<ResignConfirmModalProps> = ({
  player,
  onCancel,
  onConfirm,
}) => {
  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [onCancel]);

  const playerLabel = getPlayerLabel(player);
  const dialogRef = useInitialDialogFocus<HTMLDivElement>(true, { focusContainer: false });
  const winnerLabel = getResignWinnerLabel(player);
  const result = getResignResult(player);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/65 p-3 mobile-safe-inset mobile-safe-area-bottom"
      onClick={onCancel}
    >
      <div
        className="ui-panel flex w-full max-w-md flex-col overflow-hidden rounded-lg border shadow-xl"
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="resign-confirm-title"
        aria-describedby="resign-confirm-description"
        data-resign-confirm="true"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="ui-bar flex items-center justify-between border-b border-[var(--ui-border)] px-4 py-3">
          <h2 id="resign-confirm-title" className="text-lg font-semibold text-[var(--ui-text)]">
            Resign Game
          </h2>
          <button
            type="button"
            onClick={onCancel}
            className="ui-control grid place-items-center rounded-lg text-[var(--ui-text-muted)] hover:bg-[var(--ui-surface-2)] hover:text-[var(--ui-text)]"
            aria-label="Cancel resign"
          >
            <FaTimes aria-hidden="true" />
          </button>
        </div>

        <div className="space-y-3 p-4">
          <p id="resign-confirm-description" className="text-sm leading-6 text-[var(--ui-text-muted)]">
            {playerLabel} resigns. {winnerLabel} wins by resignation.
          </p>
          <div className="rounded border border-[var(--ui-danger)] bg-[var(--ui-danger-soft)] px-3 py-2 text-sm font-semibold text-[var(--ui-danger)]">
            Result: {result}
          </div>
        </div>

        <div className="ui-bar flex flex-wrap justify-end gap-2 border-t border-[var(--ui-border)] px-4 py-3">
          <button
            type="button"
            onClick={onCancel}
            className="min-h-11 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-surface)] px-4 py-2 text-sm font-semibold text-[var(--ui-text)] hover:bg-[var(--ui-surface-2)]"
            autoFocus
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="min-h-11 rounded-lg border border-[var(--ui-danger)] bg-[var(--ui-danger-soft)] px-4 py-2 text-sm font-semibold text-[var(--ui-danger)] hover:bg-[var(--ui-surface-2)]"
          >
            <span className="inline-flex items-center gap-2"><FaFlag aria-hidden="true" /> Resign as {playerLabel}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

ResignConfirmModal.displayName = 'ResignConfirmModal';
