import React, { useEffect, useRef, useState } from 'react';
import { FaSave, FaTimes } from 'react-icons/fa';
import { useEscapeToClose } from '../hooks/useEscapeToClose';
import type { LibraryFolderOption } from '../utils/library';

interface SaveToLibraryDialogProps {
  open: boolean;
  initialName: string;
  folderOptions: LibraryFolderOption[];
  initialFolderId: string | null;
  onClose: () => void;
  onSave: (name: string, folderId: string | null) => boolean | Promise<boolean>;
}

const NAME_INPUT_ID = 'save-to-library-name';
const FOLDER_SELECT_ID = 'save-to-library-folder';

export const SaveToLibraryDialog: React.FC<SaveToLibraryDialogProps> = ({
  open,
  initialName,
  folderOptions,
  initialFolderId,
  onClose,
  onSave,
}) => {
  const [name, setName] = useState(initialName);
  const [folderId, setFolderId] = useState<string | null>(initialFolderId);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const trimmedName = name.trim();
  useEscapeToClose(onClose, open && !saving);

  useEffect(() => {
    if (!open) return;
    window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);
  }, [open]);

  if (!open) return null;

  const submit = async () => {
    if (!trimmedName || saving) return;
    setSaving(true);
    const saved = await onSave(trimmedName, folderId);
    if (saved) onClose();
    else setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="save-to-library-title"
        className="ui-panel border rounded-lg shadow-xl w-full max-w-sm overflow-hidden"
      >
        <div className="ui-bar border-b border-[var(--ui-border)] px-4 py-3 flex items-center justify-between">
          <h2 id="save-to-library-title" className="text-base font-semibold text-[var(--ui-text)]">
            Save Copy to Library
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="ui-control grid shrink-0 place-items-center rounded-lg text-[var(--ui-text-muted)] hover:bg-[var(--ui-surface-2)] hover:text-[var(--ui-text)]"
            aria-label="Close"
          >
            <FaTimes aria-hidden="true" />
          </button>
        </div>
        <div className="p-4 space-y-3">
          <div className="block space-y-1">
            <label htmlFor={NAME_INPUT_ID} className="block text-sm font-medium text-[var(--ui-text-muted)]">
              Name
            </label>
            <input
              id={NAME_INPUT_ID}
              ref={inputRef}
              value={name}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                event.stopPropagation();
                if (event.key === 'Enter') void submit();
                if (event.key === 'Escape') onClose();
              }}
              placeholder="Game name"
              className="w-full ui-input border rounded px-3 py-2 text-sm text-[var(--ui-text)] focus:border-[var(--ui-accent)] outline-none"
            />
          </div>
          <div className="block space-y-1">
            <label htmlFor={FOLDER_SELECT_ID} className="block text-sm font-medium text-[var(--ui-text-muted)]">
              Save to folder
            </label>
            <select
              id={FOLDER_SELECT_ID}
              value={folderId ?? ''}
              onChange={(event) => setFolderId(event.target.value || null)}
              onKeyDown={(event) => {
                event.stopPropagation();
                if (event.key === 'Escape') onClose();
              }}
              className="w-full ui-input border rounded px-3 py-2 text-sm text-[var(--ui-text)] focus:border-[var(--ui-accent)] outline-none"
            >
              <option value="">Root</option>
              {folderOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {`${'-- '.repeat(option.depth)}${option.name}`}
                </option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" className="panel-action-button" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button
              type="button"
              className="panel-action-button active"
              onClick={() => void submit()}
              disabled={!trimmedName || saving}
            >
              <span className="inline-flex items-center gap-2">
                <FaSave />
                {saving ? 'Saving...' : 'Save'}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

SaveToLibraryDialog.displayName = 'SaveToLibraryDialog';
