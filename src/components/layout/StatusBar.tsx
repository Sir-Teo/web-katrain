import React from 'react';
import { FaBug, FaCheckCircle, FaExclamationTriangle, FaGamepad, FaSyncAlt } from 'react-icons/fa';
import { APP_BUILD_LABEL, APP_COMMIT_URL } from '../../utils/appInfo';
import { formatGamepadLabel } from '../../utils/gamepadLabel';

const ISSUE_REPORT_URL = 'https://github.com/Sir-Teo/web-katrain/issues/new/choose';

export type AutoSaveStatus = {
  state: 'pending' | 'saved' | 'failed';
  savedAt?: number;
};

interface StatusBarProps {
  moveName: string;
  blackName: string;
  whiteName: string;
  komi: number;
  boardSize: number;
  handicap: number;
  moveCount: number;
  capturedBlack: number;
  capturedWhite: number;
  endResult: string | null;
  gamepadName?: string | null;
  loadedFileKind?: LoadedFileKind;
  onGamepadNavigationDisable?: () => void;
  loadedFileName?: string | null;
  onLoadedFileRename?: (name: string) => void;
  unsavedChanges?: boolean;
  autoSaveStatus?: AutoSaveStatus | null;
}

type LoadedFileKind = 'library' | 'file' | 'ogs' | 'pasted';

function formatAutoSaveTime(savedAt: number): string {
  return new Date(savedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export const StatusBar: React.FC<StatusBarProps> = ({
  moveName,
  blackName,
  whiteName,
  komi,
  boardSize,
  handicap,
  moveCount,
  capturedBlack,
  capturedWhite,
  endResult,
  gamepadName,
  loadedFileKind = 'library',
  onGamepadNavigationDisable,
  loadedFileName = null,
  onLoadedFileRename,
  unsavedChanges = false,
  autoSaveStatus = null,
}) => {
  const [isEditingLoadedFileName, setIsEditingLoadedFileName] = React.useState(false);
  const [loadedFileNameDraft, setLoadedFileNameDraft] = React.useState(loadedFileName ?? '');
  const finishingEditRef = React.useRef(false);

  React.useEffect(() => {
    if (!isEditingLoadedFileName) setLoadedFileNameDraft(loadedFileName ?? '');
  }, [isEditingLoadedFileName, loadedFileName]);

  const finishLoadedFileNameEdit = (commit: boolean) => {
    if (finishingEditRef.current) return;
    finishingEditRef.current = true;
    window.setTimeout(() => {
      finishingEditRef.current = false;
    }, 0);
    const nextName = loadedFileNameDraft.trim();
    setIsEditingLoadedFileName(false);
    if (commit && nextName && nextName !== loadedFileName) {
      onLoadedFileRename?.(nextName);
    } else {
      setLoadedFileNameDraft(loadedFileName ?? '');
    }
  };

  const loadedFileLabel: Record<LoadedFileKind, string> = {
    library: 'Library:',
    file: 'File:',
    ogs: 'OGS:',
    pasted: 'Imported:',
  };
  const loadedFileSource: Record<LoadedFileKind, string> = {
    library: 'Library',
    file: 'file',
    ogs: 'OGS',
    pasted: 'pasted SGF',
  };
  const loadedFileTitle =
    loadedFileKind === 'library'
      ? onLoadedFileRename
        ? `Loaded from Library: ${loadedFileName}. Click to rename.`
        : `Loaded from Library: ${loadedFileName}`
      : `Loaded from ${loadedFileSource[loadedFileKind]}: ${loadedFileName}`;

  return (
    <div className="status-bar flex flex-wrap gap-2 px-3 py-2 items-center text-xs">
      <div className="status-bar-section flex flex-wrap gap-2 items-center">
        <div className="px-2 py-1 rounded bg-[var(--ui-surface-2)] text-[var(--ui-text)] font-semibold border border-[var(--ui-border)] shadow-sm">
          {moveName}
        </div>

        <div className="px-2 py-1 rounded bg-[var(--ui-surface)] text-[var(--ui-text-muted)] border border-[var(--ui-border)] shadow-sm flex items-center gap-1.5 truncate max-w-[250px]" title={`${blackName} vs ${whiteName}`}>
          <span className="status-player status-player-black" aria-hidden="true" />
          <span className="truncate">{blackName}</span>
          <span className="text-[var(--ui-text-faint)]">vs</span>
          <span className="status-player status-player-white" aria-hidden="true" />
          <span className="truncate">{whiteName}</span>
        </div>

      <div className="px-2 py-1 rounded bg-[var(--ui-surface)] text-[var(--ui-text-muted)] border border-[var(--ui-border)] shadow-sm">
        Komi: <span className="text-[var(--ui-text)] font-medium">{komi}</span>
      </div>

      <div className="px-2 py-1 rounded bg-[var(--ui-surface)] text-[var(--ui-text-muted)] border border-[var(--ui-border)] shadow-sm">
        Size: <span className="text-[var(--ui-text)] font-medium">{boardSize}×{boardSize}</span>
      </div>

      {handicap > 0 && (
        <div className="px-2 py-1 rounded bg-[var(--ui-accent-soft)] text-[var(--ui-accent)] font-medium border border-[var(--ui-accent)] shadow-sm">
          H{handicap}
        </div>
      )}

      <div className="px-2 py-1 rounded bg-[var(--ui-surface)] text-[var(--ui-text-muted)] border border-[var(--ui-border)] shadow-sm xl:flex hidden">
        Moves: <span className="text-[var(--ui-text)] font-medium">{moveCount}</span>
      </div>

      <div className="px-2 py-1 rounded bg-[var(--ui-surface)] text-[var(--ui-text-muted)] border border-[var(--ui-border)] shadow-sm hidden md:flex items-center gap-1.5" title="Stones captured by each player">
        Captures:
        <span className="flex items-center gap-1 ml-1">
          <span className="status-player status-player-black" aria-hidden="true" />
          <span className="text-white font-medium">{capturedWhite}</span>
        </span>
        <span className="flex items-center gap-1">
          <span className="status-player status-player-white" aria-hidden="true" />
          <span className="text-white font-medium">{capturedBlack}</span>
        </span>
      </div>

      {endResult && (
        <div className="px-2 py-1 rounded bg-[var(--ui-success-soft)] text-[var(--ui-success)] font-bold border border-[var(--ui-success)] shadow-sm">
          {endResult}
        </div>
      )}

        {loadedFileName && (
          <div
            className="px-2 py-1 rounded bg-[var(--ui-surface)] text-[var(--ui-text-muted)] border border-[var(--ui-border)] shadow-sm hidden sm:flex items-center gap-1.5 max-w-[280px]"
            title={loadedFileTitle}
            data-loaded-file-kind={loadedFileKind}
          >
            <span className="text-[var(--ui-text-faint)]">{loadedFileLabel[loadedFileKind]}</span>
            {isEditingLoadedFileName ? (
              <input
                autoFocus
                aria-label="Loaded library file name"
                className="w-36 rounded border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-1 py-0.5 text-xs font-medium text-[var(--ui-text)] outline-none focus:border-[var(--ui-accent)]"
                value={loadedFileNameDraft}
                onChange={(event) => setLoadedFileNameDraft(event.target.value)}
                onBlur={() => finishLoadedFileNameEdit(true)}
                onKeyDown={(event) => {
                  event.stopPropagation();
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    finishLoadedFileNameEdit(true);
                  } else if (event.key === 'Escape') {
                    event.preventDefault();
                    finishLoadedFileNameEdit(false);
                  }
                }}
              />
            ) : onLoadedFileRename ? (
              <button
                type="button"
                className="min-w-0 truncate text-left text-[var(--ui-text)] font-medium hover:text-white disabled:hover:text-[var(--ui-text)]"
                onClick={() => {
                  if (!onLoadedFileRename) return;
                  setLoadedFileNameDraft(loadedFileName);
                  setIsEditingLoadedFileName(true);
                }}
                disabled={!onLoadedFileRename}
              >
                {loadedFileName}
              </button>
            ) : (
              <span className="min-w-0 truncate text-left text-[var(--ui-text)] font-medium">
                {loadedFileName}
              </span>
            )}
          </div>
        )}

      {unsavedChanges && (
        <div className="px-2 py-1 rounded bg-[var(--ui-warning-soft)] text-[var(--ui-warning)] font-semibold border border-[var(--ui-warning)] shadow-sm" title="Unsaved changes">
          Unsaved
        </div>
      )}

      {unsavedChanges && autoSaveStatus && (
        <div
          className={[
            'px-2 py-1 rounded font-semibold border shadow-sm hidden sm:flex items-center gap-1.5',
            autoSaveStatus.state === 'failed'
              ? 'bg-[var(--ui-danger-soft)] text-[var(--ui-danger)] border-[var(--ui-danger)]'
              : autoSaveStatus.state === 'pending'
                ? 'bg-[var(--ui-accent-soft)] text-[var(--ui-accent)] border-[var(--ui-accent)]'
                : 'bg-[var(--ui-success-soft)] text-[var(--ui-success)] border-[var(--ui-success)]',
          ].join(' ')}
          data-autosave-status={autoSaveStatus.state}
          role={autoSaveStatus.state === 'failed' ? 'alert' : 'status'}
          aria-live={autoSaveStatus.state === 'failed' ? 'assertive' : 'polite'}
          title={
            autoSaveStatus.state === 'failed'
              ? 'Recovery auto-save failed.'
              : autoSaveStatus.state === 'pending'
                ? 'Recovery auto-save is updating.'
                : autoSaveStatus.savedAt
                  ? `Recovery auto-saved at ${formatAutoSaveTime(autoSaveStatus.savedAt)}.`
                  : 'Recovery auto-saved.'
          }
        >
          {autoSaveStatus.state === 'failed' ? (
            <FaExclamationTriangle aria-hidden="true" />
          ) : autoSaveStatus.state === 'pending' ? (
            <FaSyncAlt className="animate-spin" aria-hidden="true" />
          ) : (
            <FaCheckCircle aria-hidden="true" />
          )}
          <span>
            {autoSaveStatus.state === 'failed'
              ? 'Autosave failed'
              : autoSaveStatus.state === 'pending'
                ? 'Autosaving'
                : 'Auto-saved'}
          </span>
          {autoSaveStatus.state === 'saved' && autoSaveStatus.savedAt && (
            <span className="font-mono text-[var(--ui-text-muted)]">{formatAutoSaveTime(autoSaveStatus.savedAt)}</span>
          )}
        </div>
      )}

      {gamepadName && (
        <button
          type="button"
          className="px-2 py-1 rounded bg-[var(--ui-accent-soft)] text-[var(--ui-accent)] border border-[var(--ui-accent)] shadow-sm hidden lg:flex max-w-[280px] items-center gap-1.5 truncate hover:bg-[var(--ui-accent)] hover:text-[var(--ui-accent-contrast)] focus:outline-none focus:ring-2 focus:ring-[var(--ui-accent)] focus:ring-offset-1 focus:ring-offset-[var(--ui-bg)] disabled:pointer-events-none"
          title={`Gamepad navigation: ${gamepadName}. Click to disable.`}
          aria-label={`Gamepad navigation connected: ${gamepadName}. Click to disable.`}
          data-gamepad-status="connected"
          onClick={onGamepadNavigationDisable}
          disabled={!onGamepadNavigationDisable}
        >
          <FaGamepad aria-hidden="true" />
          <span className="font-semibold">Gamepad</span>
          <span className="min-w-0 truncate font-mono text-[var(--ui-text-muted)]">
            {formatGamepadLabel(gamepadName)}
          </span>
        </button>
      )}
      </div>
      <div className="ml-auto hidden xl:flex items-center gap-2">
        <a
          href={ISSUE_REPORT_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 px-2 py-1 rounded bg-[var(--ui-surface)] text-[var(--ui-text-muted)] border border-[var(--ui-border)] shadow-sm hover:text-[var(--ui-text)] hover:border-[var(--ui-accent)] transition-colors"
          title="Report an issue on GitHub"
          aria-label="Report an issue on GitHub"
          data-status-report-issue="true"
        >
          <FaBug aria-hidden="true" />
          <span>Report</span>
        </a>
        {APP_COMMIT_URL ? (
          <a
            href={APP_COMMIT_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center px-2 py-1 rounded bg-[var(--ui-surface)] text-[var(--ui-text-faint)] border border-[var(--ui-border)] shadow-sm hover:text-[var(--ui-text)] hover:border-[var(--ui-accent)] transition-colors"
            title={`Open build commit: ${APP_BUILD_LABEL}`}
            aria-label={`Open build commit ${APP_BUILD_LABEL}`}
            data-status-build-link="true"
          >
            {APP_BUILD_LABEL}
          </a>
        ) : (
          <div
            className="flex items-center px-2 py-1 rounded bg-[var(--ui-surface)] text-[var(--ui-text-faint)] border border-[var(--ui-border)] shadow-sm"
            title={APP_BUILD_LABEL}
          >
            {APP_BUILD_LABEL}
          </div>
        )}
      </div>
    </div>
  );
};
