import React from 'react';
import { useEscapeToClose } from '../hooks/useEscapeToClose';
import { useInitialDialogFocus } from '../hooks/useInitialDialogFocus';

interface SaveToLibraryLoadingDialogProps {
  onClose: () => void;
  returnFocus?: HTMLElement | null;
}

export const SaveToLibraryLoadingDialog: React.FC<SaveToLibraryLoadingDialogProps> = ({ onClose, returnFocus }) => {
  const cancelRef = React.useRef<HTMLButtonElement>(null);
  useEscapeToClose(onClose);
  const dialogRef = useInitialDialogFocus<HTMLDivElement>(true, { initialFocusRef: cancelRef, returnFocus });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 mobile-safe-inset mobile-safe-area-bottom">
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="save-to-library-title"
        aria-busy="true"
        data-save-to-library-loading="true"
        className="ui-panel w-full max-w-sm overflow-hidden rounded-lg border shadow-xl"
      >
        <div className="ui-bar border-b border-[var(--ui-border)] px-4 py-3">
          <h2 id="save-to-library-title" className="text-base font-semibold text-[var(--ui-text)]">Save Copy to Library</h2>
        </div>
        <p role="status" className="p-4 text-sm text-[var(--ui-text-muted)]">Reading saved folders…</p>
        <div className="ui-bar flex justify-end border-t border-[var(--ui-border)] px-4 py-3">
          <button ref={cancelRef} autoFocus type="button" onClick={onClose} className="min-h-11 rounded border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-4 text-sm font-semibold text-[var(--ui-text)] hover:brightness-110">Cancel</button>
        </div>
      </div>
    </div>
  );
};
