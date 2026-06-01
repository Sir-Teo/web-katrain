import React from 'react';
import { FaTimes, FaTrash } from 'react-icons/fa';

interface AnalysisCacheClearConfirmModalProps {
  count: number;
  onCancel: () => void;
  onConfirm: () => void;
}

const formatAnalysisCount = (count: number): string =>
  count === 1 ? '1 cached analysis' : `${count} cached analyses`;

export const AnalysisCacheClearConfirmModal: React.FC<AnalysisCacheClearConfirmModalProps> = ({
  count,
  onCancel,
  onConfirm,
}) => {
  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      event.stopPropagation();
      if (event.key === 'Escape') {
        event.preventDefault();
        onCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [onCancel]);

  const label = formatAnalysisCount(count);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/65 p-3 mobile-safe-inset mobile-safe-area-bottom">
      <div
        className="ui-panel flex w-full max-w-md flex-col overflow-hidden rounded-lg border shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="analysis-cache-clear-title"
        aria-describedby="analysis-cache-clear-description"
        data-analysis-cache-clear-confirm="true"
      >
        <div className="ui-bar flex items-center justify-between border-b border-[var(--ui-border)] px-4 py-3">
          <h2 id="analysis-cache-clear-title" className="text-lg font-semibold text-[var(--ui-text)]">
            Clear Analysis Cache
          </h2>
          <button
            type="button"
            onClick={onCancel}
            className="ui-control grid place-items-center rounded-lg text-[var(--ui-text-muted)] hover:bg-[var(--ui-surface-2)] hover:text-[var(--ui-text)]"
            aria-label="Cancel clear analysis cache"
          >
            <FaTimes aria-hidden="true" />
          </button>
        </div>

        <div className="space-y-3 p-4">
          <p id="analysis-cache-clear-description" className="text-sm leading-6 text-[var(--ui-text-muted)]">
            This removes {label} from the current game. Moves and notes stay unchanged, but restored SGF analysis
            will not be exported again unless you run analysis for those positions.
          </p>
          <div className="rounded border border-[var(--ui-warning)] bg-[var(--ui-warning-soft)] px-3 py-2 text-sm font-semibold text-[var(--ui-warning)]">
            You can analyze the game again later.
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
            <span className="inline-flex items-center gap-2"><FaTrash aria-hidden="true" /> Clear {label}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

AnalysisCacheClearConfirmModal.displayName = 'AnalysisCacheClearConfirmModal';
