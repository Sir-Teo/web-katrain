import React from 'react';
import { APP_BUILD_LABEL } from '../../utils/appInfo';

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
  loadedFileName?: string | null;
  onLoadedFileRename?: (name: string) => void;
  unsavedChanges?: boolean;
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
  loadedFileName = null,
  onLoadedFileRename,
  unsavedChanges = false,
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
            title={onLoadedFileRename ? `Loaded from Library: ${loadedFileName}. Click to rename.` : `Loaded from Library: ${loadedFileName}`}
          >
            <span className="text-[var(--ui-text-faint)]">Library:</span>
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
            ) : (
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
            )}
          </div>
        )}

      {unsavedChanges && (
        <div className="px-2 py-1 rounded bg-[var(--ui-warning-soft)] text-[var(--ui-warning)] font-semibold border border-[var(--ui-warning)] shadow-sm" title="Unsaved changes">
          Unsaved
        </div>
      )}

      {gamepadName && (
        <div className="px-2 py-1 rounded bg-[var(--ui-accent-soft)] text-[var(--ui-accent)] border border-[var(--ui-accent)] shadow-sm hidden lg:flex max-w-[220px] truncate" title={`Gamepad navigation: ${gamepadName}`}>
          Gamepad
        </div>
      )}
      </div>
      <div
        className="ml-auto hidden xl:flex items-center px-2 py-1 rounded bg-[var(--ui-surface)] text-[var(--ui-text-faint)] border border-[var(--ui-border)] shadow-sm"
        title={APP_BUILD_LABEL}
      >
        {APP_BUILD_LABEL}
      </div>
    </div>
  );
};
