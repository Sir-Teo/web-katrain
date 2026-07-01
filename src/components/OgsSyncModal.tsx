import React from 'react';
import { FaCloudDownloadAlt, FaTimes } from 'react-icons/fa';
import { readLocalStorage, writeLocalStorage } from '../utils/storage';
import {
  OGS_SYNC_USERNAME_STORAGE_KEY,
  collectExistingOgsGameIds,
  downloadNewOgsGames,
  listOgsFinishedGames,
  resolveOgsPlayer,
  type OgsSyncProgress,
  type OgsSyncedGame,
} from '../utils/ogsSync';
import type { LibraryItem } from '../utils/library';
import { useEscapeToClose } from '../hooks/useEscapeToClose';

interface OgsSyncModalProps {
  items: LibraryItem[];
  onClose: () => void;
  onImport: (username: string, games: OgsSyncedGame[]) => void;
}

type SyncSummary = {
  added: number;
  skipped: number;
  failed: number;
  username: string;
};

const LIMIT_OPTIONS = [10, 25, 50] as const;

export const OgsSyncModal: React.FC<OgsSyncModalProps> = ({ items, onClose, onImport }) => {
  const [username, setUsername] = React.useState(
    () => readLocalStorage(OGS_SYNC_USERNAME_STORAGE_KEY) ?? ''
  );
  const [limit, setLimit] = React.useState<number>(25);
  const [isRunning, setIsRunning] = React.useState(false);
  const [progress, setProgress] = React.useState<OgsSyncProgress | null>(null);
  const [summary, setSummary] = React.useState<SyncSummary | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const cancelledRef = React.useRef(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  useEscapeToClose(onClose);

  React.useEffect(() => {
    window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => {
      cancelledRef.current = true;
    };
  }, []);

  const runSync = async () => {
    const trimmed = username.trim();
    if (!trimmed || isRunning) return;
    cancelledRef.current = false;
    setIsRunning(true);
    setError(null);
    setSummary(null);
    setProgress(null);
    try {
      const player = await resolveOgsPlayer(trimmed);
      writeLocalStorage(OGS_SYNC_USERNAME_STORAGE_KEY, player.username);
      const games = await listOgsFinishedGames(player.id, limit);
      if (games.length === 0) {
        setError(`"${player.username}" has no finished games OGS will list.`);
        return;
      }
      const { synced, skipped, failed } = await downloadNewOgsGames(
        games,
        collectExistingOgsGameIds(items),
        setProgress,
        () => cancelledRef.current
      );
      if (cancelledRef.current) return;
      if (synced.length > 0) onImport(player.username, synced);
      setSummary({
        added: synced.length,
        skipped,
        failed: failed.length,
        username: player.username,
      });
    } catch (cause) {
      if (!cancelledRef.current) {
        setError(cause instanceof Error ? cause.message : 'OGS sync failed.');
      }
    } finally {
      setIsRunning(false);
      setProgress(null);
    }
  };

  const summaryText = (result: SyncSummary): string => {
    const parts = [
      `Added ${result.added} game${result.added === 1 ? '' : 's'} to "OGS - ${result.username}".`,
    ];
    if (result.skipped > 0) parts.push(`${result.skipped} already in your library.`);
    if (result.failed > 0) parts.push(`${result.failed} failed to download.`);
    return parts.join(' ');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-3 mobile-safe-inset mobile-safe-area-bottom">
      <div
        className="ui-panel flex w-full max-w-lg flex-col overflow-hidden rounded-lg border shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ogs-sync-title"
      >
        <div className="ui-bar flex items-center justify-between border-b border-[var(--ui-border)] px-4 py-3">
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

        <div className="space-y-3 p-4">
          <div className="text-sm text-[var(--ui-text-muted)]">
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
            className="w-full rounded-lg border ui-input px-3 py-2 text-sm text-[var(--ui-text)]"
            placeholder="e.g. your OGS account name"
            autoComplete="off"
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
            className="ui-input rounded border px-2 py-1 text-sm text-[var(--ui-text)]"
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
              {progress && progress.total > 0
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
              {summaryText(summary)}
            </div>
          )}
        </div>

        <div className="ui-bar flex items-center justify-end gap-2 border-t border-[var(--ui-border)] px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-surface)] px-4 py-2 text-sm font-semibold text-[var(--ui-text)] hover:bg-[var(--ui-surface-2)]"
          >
            {summary ? 'Done' : 'Cancel'}
          </button>
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
