import React from 'react';
import { FaTimes } from 'react-icons/fa';
import type { AutoSavedGame } from '../utils/autoSave';

type AutoSaveRecoveryModalProps = {
  snapshot: AutoSavedGame;
  onRestore: () => void;
  onDismiss: () => void;
};

export const AutoSaveRecoveryModal: React.FC<AutoSaveRecoveryModalProps> = ({
  snapshot,
  onRestore,
  onDismiss,
}) => {
  const savedAt = new Date(snapshot.savedAt);
  const savedAtLabel = Number.isFinite(savedAt.getTime()) ? savedAt.toLocaleString() : 'an earlier session';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="auto-save-recovery-title"
        className="ui-panel border rounded-lg shadow-xl w-full max-w-md overflow-hidden"
      >
        <div className="ui-bar border-b border-[var(--ui-border)] px-4 py-3 flex items-center justify-between">
          <h2 id="auto-save-recovery-title" className="text-base font-semibold text-[var(--ui-text)]">
            Restore Auto-Saved Game
          </h2>
          <button type="button" onClick={onDismiss} className="ui-text-faint hover:text-white" aria-label="Close">
            <FaTimes />
          </button>
        </div>
        <div className="p-4 space-y-4">
          <p className="text-sm text-[var(--ui-text-muted)]">
            An unsaved game from {savedAtLabel} is available.
          </p>
          <div className="flex justify-end gap-2">
            <button type="button" className="panel-action-button" onClick={onDismiss}>
              Keep Current
            </button>
            <button type="button" className="panel-action-button active" onClick={onRestore}>
              Restore
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
