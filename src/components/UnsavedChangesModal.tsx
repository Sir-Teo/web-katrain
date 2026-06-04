import React from 'react';
import { FaDownload, FaSave, FaTimes, FaTrash } from 'react-icons/fa';
import { useEscapeToClose } from '../hooks/useEscapeToClose';

export type UnsavedChangesChoice = 'save' | 'discard' | 'cancel';

interface UnsavedChangesModalProps {
  onChoice: (choice: UnsavedChangesChoice) => void;
  saveTarget?: 'download' | 'library';
}

export const UnsavedChangesModal: React.FC<UnsavedChangesModalProps> = ({ onChoice, saveTarget = 'download' }) => {
  const savesToLibrary = saveTarget === 'library';
  const SaveIcon = savesToLibrary ? FaSave : FaDownload;
  useEscapeToClose(() => onChoice('cancel'));

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/65 p-3 mobile-safe-inset mobile-safe-area-bottom"
      onClick={() => onChoice('cancel')}
    >
      <div
        className="ui-panel flex w-full max-w-md flex-col overflow-hidden rounded-lg border shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="unsaved-changes-title"
        aria-describedby="unsaved-changes-description"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="ui-bar flex items-center justify-between border-b border-[var(--ui-border)] px-4 py-3">
          <h2 id="unsaved-changes-title" className="text-lg font-semibold text-[var(--ui-text)]">
            Unsaved changes
          </h2>
          <button
            type="button"
            onClick={() => onChoice('cancel')}
            className="ui-control grid place-items-center rounded-lg text-[var(--ui-text-muted)] hover:bg-[var(--ui-surface-2)] hover:text-[var(--ui-text)]"
            aria-label="Cancel"
          >
            <FaTimes aria-hidden="true" />
          </button>
        </div>

        <div className="space-y-3 p-4">
          <p id="unsaved-changes-description" className="text-sm leading-6 text-[var(--ui-text-muted)]">
            {savesToLibrary
              ? 'The loaded library game has unsaved changes. Save it to Library before replacing it?'
              : 'The current game has changes that are not saved. Save an SGF before replacing it?'}
          </p>
        </div>

        <div className="ui-bar flex flex-wrap justify-end gap-2 border-t border-[var(--ui-border)] px-4 py-3">
          <button
            type="button"
            onClick={() => onChoice('cancel')}
            className="min-h-11 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-surface)] px-4 py-2 text-sm font-semibold text-[var(--ui-text)] hover:bg-[var(--ui-surface-2)]"
            autoFocus
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onChoice('discard')}
            className="min-h-11 rounded-lg border border-[var(--ui-danger)] bg-[var(--ui-danger-soft)] px-4 py-2 text-sm font-semibold text-[var(--ui-danger)] hover:bg-[var(--ui-surface-2)]"
          >
            <span className="inline-flex items-center gap-2"><FaTrash /> Discard</span>
          </button>
          <button
            type="button"
            onClick={() => onChoice('save')}
            className="min-h-11 rounded-lg border border-[var(--ui-accent)] bg-[var(--ui-accent)] px-4 py-2 text-sm font-semibold text-[var(--ui-accent-contrast)]"
          >
            <span className="inline-flex items-center gap-2"><SaveIcon /> {savesToLibrary ? 'Save to Library' : 'Save SGF'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

UnsavedChangesModal.displayName = 'UnsavedChangesModal';
