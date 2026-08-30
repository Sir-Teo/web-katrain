import React from 'react';
import { useInitialDialogFocus } from '../hooks/useInitialDialogFocus';
import { formatLibraryTimestamp } from '../utils/library';
import type { AutoSavedGame } from '../utils/autoSave';

type AutoSaveRecoveryModalProps = {
  snapshot: AutoSavedGame;
  onRestore: () => void;
  onDiscard: () => void;
};

export const AutoSaveRecoveryModal: React.FC<AutoSaveRecoveryModalProps> = ({
  snapshot,
  onRestore,
  onDiscard,
}) => {
  // Shared minute-precision format: a recovery prompt needs the date, but not
  // the seconds a bare toLocaleString() was printing.
  const savedAtLabel = formatLibraryTimestamp(snapshot.savedAt) || 'an earlier session';
  const restoreButtonRef = React.useRef<HTMLButtonElement>(null);
  const dialogRef = useInitialDialogFocus<HTMLDivElement>(true, {
    focusContainer: false,
    initialFocusRef: restoreButtonRef,
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="auto-save-recovery-title"
        aria-describedby="auto-save-recovery-description"
        className="ui-panel border rounded-lg shadow-xl w-full max-w-md overflow-hidden"
      >
        <div className="ui-bar border-b border-[var(--ui-border)] px-4 py-3">
          <h2 id="auto-save-recovery-title" className="text-base font-semibold text-[var(--ui-text)]">
            Restore Auto-Saved Game
          </h2>
        </div>
        <div className="p-4 space-y-4">
          <p id="auto-save-recovery-description" className="text-sm text-[var(--ui-text-muted)]">
            An unsaved game from {savedAtLabel} is available. Restore it, or discard the auto-save and keep the game currently on the board.
          </p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" className="panel-action-button danger" onClick={onDiscard}>
              Discard Auto-Save
            </button>
            <button ref={restoreButtonRef} type="button" className="panel-action-button active" onClick={onRestore} autoFocus>
              Restore Game
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
