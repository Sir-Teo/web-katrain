import React from 'react';
import { FaCloudDownloadAlt, FaTimes } from 'react-icons/fa';
import { readLocalStorage, writeLocalStorage } from '../utils/storage';
import {
  OGS_SYNC_USERNAME_STORAGE_KEY,
  collectExistingOgsGameIds,
  downloadNewOgsGames,
  formatOgsSyncSummary,
  listOgsFinishedGames,
  resolveOgsPlayer,
  type OgsSyncOutcome,
  type OgsSyncProgress,
  type OgsSyncedGame,
} from '../utils/ogsSync';
import { getOgsBackoffRemainingMs } from '../utils/ogsQueue';
import { useInitialDialogFocus } from '../hooks/useInitialDialogFocus';
import type { LibraryItem } from '../utils/library';
import { useEscapeToClose } from '../hooks/useEscapeToClose';

interface OgsSyncModalProps {
  items: LibraryItem[];
  onClose: () => void;
  onImport: (username: string, games: OgsSyncedGame[]) => void;
}

type SyncSummary = OgsSyncOutcome;

const LIMIT_OPTIONS = [10, 25, 50] as const;

export const OgsSyncModal: React.FC<OgsSyncModalProps> = ({ items, onClose, onImport }) => {
  const [username, setUsername] = React.useState(
    () => readLocalStorage(OGS_SYNC_USERNAME_STORAGE_KEY) ?? ''
  );
  const [limit, setLimit] = React.useState<number>(25);
  const [isRunning, setIsRunning] = React.useState(false);
  const [progress, setProgress] = React.useState<OgsSyncProgress | null>(null);

  /**
   * A throttled sync is parked behind the queue's shared backoff, which can run
   * to two minutes. Without this the counter simply stops moving and the sync
   * looks hung — which is the failure the queue was written to avoid, only
   * moved from the download log to the screen.
   */
  const [backoffSeconds, setBackoffSeconds] = React.useState(0);
  React.useEffect(() => {
    if (!isRunning) {
      setBackoffSeconds(0);
      return;
    }
    const tick = () => setBackoffSeconds(Math.ceil(getOgsBackoffRemainingMs() / 1000));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [isRunning]);
  const [summary, setSummary] = React.useState<SyncSummary | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const cancelledRef = React.useRef(false);
  const mountedRef = React.useRef(true);
  const inputRef = React.useRef<HTMLInputElement>(null);
  useEscapeToClose(onClose);
  const dialogRef = useInitialDialogFocus<HTMLDivElement>(true, { initialFocusRef: inputRef });

  // Closing the dialog mid-sync stops it, like Stop does; the games already
  // downloaded are still imported (see runSync).
  React.useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      cancelledRef.current = true;
    };
  }, []);

  const [isStopping, setIsStopping] = React.useState(false);
  const stopSync = () => {
    cancelledRef.current = true;
    setIsStopping(true);
  };

  const runSync = async () => {
    const trimmed = username.trim();
    if (!trimmed || isRunning) return;
    cancelledRef.current = false;
    setIsStopping(false);
    setIsRunning(true);
    setError(null);
    setSummary(null);
    setProgress(null);
    try {
      const player = await resolveOgsPlayer(trimmed);
      writeLocalStorage(OGS_SYNC_USERNAME_STORAGE_KEY, player.username);
      const games = await listOgsFinishedGames(player.id, limit);
      if (cancelledRef.current) {
        if (mountedRef.current) setSummary({ added: 0, skipped: 0, failed: 0, username: player.username, stopped: true });
        return;
      }
      if (games.length === 0) {
        setError(`"${player.username}" has no finished games OGS will list.`);
        return;
      }
      const { synced, skipped, failed, notDownloaded } = await downloadNewOgsGames(
        games,
        collectExistingOgsGameIds(items),
        (next) => {
          if (mountedRef.current) setProgress(next);
        },
        () => cancelledRef.current
      );
      // Stopping -- with Stop, or by closing the dialog -- used to return here
      // and drop every game already downloaded. They are kept now; the parent
      // announces the import itself, so it also reaches someone who closed
      // the dialog.
      const stopped = cancelledRef.current;
      if (synced.length > 0) onImport(player.username, synced);
      if (!mountedRef.current) return;
      setSummary({
        added: synced.length,
        skipped,
        failed: failed.length,
        username: player.username,
        stopped: stopped && notDownloaded > 0,
        notDownloaded: stopped ? notDownloaded : 0,
      });
    } catch (cause) {
      if (!cancelledRef.current && mountedRef.current) {
        setError(cause instanceof Error ? cause.message : 'OGS sync failed.');
      }
    } finally {
      if (mountedRef.current) {
        setIsRunning(false);
        setIsStopping(false);
        setProgress(null);
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-3 mobile-safe-inset mobile-safe-area-bottom">
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="ui-panel flex max-h-full w-full max-w-lg flex-col overflow-hidden rounded-lg border shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ogs-sync-title"
      >
        <div className="ogs-sync-header ui-bar flex items-center justify-between border-b border-[var(--ui-border)] px-4 py-3">
          <h2 id="ogs-sync-title" className="text-lg font-semibold text-[var(--ui-text)]">
            Sync OGS Games
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="ui-control grid place-items-center rounded-lg text-[var(--ui-text-muted)] hover:bg-[var(--ui-surface-2)] hover:text-[var(--ui-text)]"
            aria-label="Close OGS sync"
          >
            <FaTimes aria-hidden="true" />
          </button>
        </div>

        <div className="ogs-sync-body min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
          <div className="ogs-sync-intro text-sm text-[var(--ui-text-muted)]">
            Downloads your latest finished games from online-go.com into an{' '}
            <span className="font-semibold">OGS - username</span> library folder. Games already
            synced are skipped, so it is safe to run again after playing more.
          </div>
          <label className="block text-sm font-medium text-[var(--ui-text)]" htmlFor="ogs-sync-username">
            OGS username
          </label>
          <input
            id="ogs-sync-username"
            ref={inputRef}
            value={username}
            onChange={(event) => {
              setUsername(event.target.value);
              setError(null);
              setSummary(null);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void runSync();
            }}
            disabled={isRunning}
            className="min-h-11 w-full rounded-lg border ui-input px-3 py-2 text-sm text-[var(--ui-text)] desktop-shell:min-h-0"
            placeholder="e.g. your OGS account name"
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
          <label className="block text-sm font-medium text-[var(--ui-text)]" htmlFor="ogs-sync-limit">
            Fetch up to
          </label>
          <select
            id="ogs-sync-limit"
            value={limit}
            onChange={(event) => setLimit(Number(event.target.value))}
            disabled={isRunning}
            className="min-h-11 ui-input rounded border px-2 py-1 text-sm text-[var(--ui-text)] desktop-shell:min-h-0"
          >
            {LIMIT_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option} most recent games
              </option>
            ))}
          </select>

          {isRunning && (
            <div
              className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-surface)] px-3 py-2 text-sm text-[var(--ui-text-muted)]"
              role="status"
              aria-live="polite"
            >
              {isStopping
                ? 'Stopping...'
                : backoffSeconds > 0
                  ? `OGS is rate limiting us - resuming in ${backoffSeconds}s...`
                  : progress && progress.total > 0
                    ? `Downloading ${Math.min(progress.downloaded + 1, progress.total)} of ${progress.total}${
                        progress.current ? ` - ${progress.current.black} vs ${progress.current.white}` : ''
                      }...`
                    : 'Looking up player and games...'}
            </div>
          )}
          {error && (
            <div className="ui-danger-soft rounded-lg border px-3 py-2 text-sm" role="alert">
              {error}
            </div>
          )}
          {summary && (
            <div
              className="rounded-lg border border-[var(--ui-accent)] bg-[var(--ui-accent-soft)] px-3 py-2 text-sm text-[var(--ui-accent)]"
              role="status"
            >
              {formatOgsSyncSummary(summary)}
            </div>
          )}
        </div>

        <div className="ogs-sync-footer ui-bar flex items-center justify-end gap-2 border-t border-[var(--ui-border)] px-4 py-3">
          {isRunning ? (
            <button
              type="button"
              onClick={stopSync}
              disabled={isStopping}
              className="min-h-11 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-surface)] px-4 py-2 text-sm font-semibold text-[var(--ui-text)] not-disabled:hover:bg-[var(--ui-surface-2)] disabled:opacity-50"
              data-ogs-sync-stop="true"
            >
              {isStopping ? 'Stopping...' : 'Stop'}
            </button>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="min-h-11 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-surface)] px-4 py-2 text-sm font-semibold text-[var(--ui-text)] hover:bg-[var(--ui-surface-2)]"
            >
              {summary ? 'Done' : 'Cancel'}
            </button>
          )}
          <button
            type="button"
            onClick={() => void runSync()}
            disabled={!username.trim() || isRunning}
            className="min-h-11 rounded-lg border border-[var(--ui-accent)] bg-[var(--ui-accent)] px-4 py-2 text-sm font-semibold text-[var(--ui-accent-contrast)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span className="inline-flex items-center gap-2">
              <FaCloudDownloadAlt aria-hidden="true" />
              {isRunning ? 'Syncing...' : summary ? 'Sync Again' : 'Sync'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};

OgsSyncModal.displayName = 'OgsSyncModal';
