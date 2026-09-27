import React from 'react';
import { useInitialDialogFocus } from '../hooks/useInitialDialogFocus';
import { formatLibraryTimestamp } from '../utils/library';
import type { RecoverableAutoSave } from '../utils/autoSave';
import { formatAutoSaveMoveCount, summarizeAutoSavedGame, type AutoSaveSummary } from '../utils/autoSaveSummary';
import { downloadBlob } from '../utils/objectUrl';
import { StaticBoard } from './StaticBoard';

type AutoSaveRecoveryModalProps = {
  /** Newest first. More than one when several tabs left unsaved games behind. */
  snapshots: RecoverableAutoSave[];
  onRestore: (id: string) => void;
  onDiscard: (id: string) => void;
};

// Shared minute-precision format: a recovery prompt needs the date, but not
// the seconds a bare toLocaleString() was printing.
const formatSavedAt = (savedAt: number): string => formatLibraryTimestamp(savedAt) || 'an earlier session';

const describeGameShape = (summary: AutoSaveSummary): string =>
  summary.moveCount === null || summary.boardSize === null
    ? ''
    : `${formatAutoSaveMoveCount(summary.moveCount)} · ${summary.boardSize}×${summary.boardSize}`;

export const AutoSaveRecoveryModal: React.FC<AutoSaveRecoveryModalProps> = ({
  snapshots,
  onRestore,
  onDiscard,
}) => {
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const selected = snapshots.find((snapshot) => snapshot.id === selectedId) ?? snapshots[0];
  const multiple = snapshots.length > 1;
  // Players, length and final position, so choosing is not blind. Parsed
  // once per list: a copy can be megabytes.
  const summaries = React.useMemo(
    () => new Map(snapshots.map((snapshot) => [snapshot.id, summarizeAutoSavedGame(snapshot.sgf, snapshot.savedAt)])),
    [snapshots],
  );
  const [downloadFailed, setDownloadFailed] = React.useState(false);
  const restoreButtonRef = React.useRef<HTMLButtonElement>(null);
  const dialogRef = useInitialDialogFocus<HTMLDivElement>(true, {
    focusContainer: false,
    initialFocusRef: restoreButtonRef,
  });

  if (!selected) return null;
  const summary = summaries.get(selected.id) ?? summarizeAutoSavedGame(selected.sgf, selected.savedAt);
  const shape = describeGameShape(summary);

  // A way to keep the game without restoring it over the board, and a last
  // chance before discarding it.
  const downloadSelected = () => {
    const blob = new Blob([selected.sgf], { type: 'application/x-go-sgf' });
    setDownloadFailed(!downloadBlob(blob, summary.filename));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="auto-save-recovery-title"
        aria-describedby="auto-save-recovery-description"
        className="ui-panel border rounded-lg shadow-xl w-full max-w-md max-h-[90dvh] overflow-hidden flex flex-col"
      >
        <div className="ui-bar border-b border-[var(--ui-border)] px-4 py-3">
          <h2 id="auto-save-recovery-title" className="text-base font-semibold text-[var(--ui-text)]">
            Restore Auto-Saved Game
          </h2>
        </div>
        <div className="p-4 space-y-4 overflow-y-auto">
          <p id="auto-save-recovery-description" className="text-sm text-[var(--ui-text-muted)]">
            {multiple
              ? `${snapshots.length} unsaved games from earlier sessions are available. Choose one to restore, or discard the ones you do not need and keep the game currently on the board.`
              : `An unsaved game from ${formatSavedAt(selected.savedAt)} is available. Restore it, or discard the auto-save and keep the game currently on the board.`}
          </p>
          {multiple && (
            <fieldset className="space-y-1">
              <legend className="sr-only">Auto-saved games</legend>
              {snapshots.map((snapshot) => {
                const rowSummary = summaries.get(snapshot.id);
                return (
                  <label
                    key={snapshot.id}
                    className={[
                      'flex min-h-11 cursor-pointer items-center gap-2 rounded border px-3 py-2 text-sm',
                      snapshot.id === selected.id
                        ? 'border-[var(--ui-accent)] bg-[var(--ui-accent-soft)] text-[var(--ui-text)]'
                        : 'border-[var(--ui-border)] text-[var(--ui-text-muted)]',
                    ].join(' ')}
                  >
                    <input
                      type="radio"
                      name="auto-save-recovery-choice"
                      value={snapshot.id}
                      checked={snapshot.id === selected.id}
                      onChange={() => {
                        setSelectedId(snapshot.id);
                        setDownloadFailed(false);
                      }}
                    />
                    <span className="min-w-0">
                      <span className="block truncate">{rowSummary?.players}</span>
                      <span className="block text-xs text-[var(--ui-text-muted)]">
                        {[formatSavedAt(snapshot.savedAt), rowSummary ? describeGameShape(rowSummary) : ''].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                  </label>
                );
              })}
            </fieldset>
          )}
          <div className="flex items-start gap-3" data-auto-save-recovery-summary="true">
            {summary.board && (
              <div className="w-28 shrink-0 overflow-hidden rounded">
                <StaticBoard
                  board={summary.board}
                  lastMove={summary.lastMove}
                  maxPx={112}
                  ariaLabel="Final position of the auto-saved game"
                />
              </div>
            )}
            <div className="min-w-0 space-y-1 text-sm">
              <p className="font-semibold text-[var(--ui-text)] break-words">{summary.players}</p>
              {shape && <p className="text-[var(--ui-text-muted)]">{shape}</p>}
            </div>
          </div>
          {downloadFailed && (
            <p role="alert" className="text-sm text-[var(--ui-danger)]">
              Could not start the SGF download in this browser.
            </p>
          )}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" className="panel-action-button danger" onClick={() => {
              setDownloadFailed(false);
              onDiscard(selected.id);
            }}>
              Discard Auto-Save
            </button>
            <button type="button" className="panel-action-button" onClick={downloadSelected}>
              Download SGF
            </button>
            <button ref={restoreButtonRef} type="button" className="panel-action-button active" onClick={() => onRestore(selected.id)} autoFocus>
              Restore Game
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
