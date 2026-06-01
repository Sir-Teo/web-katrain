import React from 'react';
import { FaBug, FaCheckCircle, FaExclamationTriangle, FaGamepad, FaInfoCircle, FaStar, FaSyncAlt, FaTimes } from 'react-icons/fa';
import { APP_BUILD_LABEL, APP_COMMIT_URL } from '../../utils/appInfo';
import { formatGameInfoPlayer } from '../../utils/gameInfoDisplay';
import { formatGamepadLabel } from '../../utils/gamepadLabel';
import { getMoveInsightCoach, type MoveInsight } from '../../utils/moveInsight';
import { getSaveStatusDisplay, type AutoSaveStatus } from '../../utils/saveStatusDisplay';

const ISSUE_REPORT_URL = 'https://github.com/Sir-Teo/web-katrain/issues/new/choose';

export type { AutoSaveStatus } from '../../utils/saveStatusDisplay';

interface StatusBarProps {
  moveName: string;
  moveInsight?: MoveInsight | null;
  shapeCoachEnabled?: boolean;
  onToggleShapeCoach?: () => void;
  blackName: string;
  whiteName: string;
  blackRank?: string;
  whiteRank?: string;
  komi: number;
  boardSize: number;
  handicap: number;
  moveCount: number;
  capturedBlack: number;
  capturedWhite: number;
  endResult: string | null;
  gamepadName?: string | null;
  gamepadCount?: number;
  loadedFileKind?: LoadedFileKind;
  onGamepadNavigationDisable?: () => void;
  loadedFileName?: string | null;
  onLoadedFileRename?: (name: string) => void;
  unsavedChanges?: boolean;
  autoSaveStatus?: AutoSaveStatus | null;
}

type LoadedFileKind = 'library' | 'file' | 'ogs' | 'pasted';

export const StatusBar: React.FC<StatusBarProps> = ({
  moveName,
  moveInsight = null,
  shapeCoachEnabled = true,
  onToggleShapeCoach,
  blackName,
  whiteName,
  blackRank = '',
  whiteRank = '',
  komi,
  boardSize,
  handicap,
  moveCount,
  capturedBlack,
  capturedWhite,
  endResult,
  gamepadName,
  gamepadCount = 0,
  loadedFileKind = 'library',
  onGamepadNavigationDisable,
  loadedFileName = null,
  onLoadedFileRename,
  unsavedChanges = false,
  autoSaveStatus = null,
}) => {
  const [isEditingLoadedFileName, setIsEditingLoadedFileName] = React.useState(false);
  const [loadedFileNameDraft, setLoadedFileNameDraft] = React.useState(loadedFileName ?? '');
  const [moveInsightOpen, setMoveInsightOpen] = React.useState(false);
  const finishingEditRef = React.useRef(false);
  const moveInsightRef = React.useRef<HTMLDivElement>(null);
  const moveInsightButtonRef = React.useRef<HTMLButtonElement>(null);
  const moveInsightCloseRef = React.useRef<HTMLButtonElement>(null);
  const moveInsightPopoverId = React.useId();
  const moveInsightTitleId = React.useId();
  const moveInsightCoach = moveInsight ? getMoveInsightCoach(moveInsight) : null;

  React.useEffect(() => {
    if (!isEditingLoadedFileName) setLoadedFileNameDraft(loadedFileName ?? '');
  }, [isEditingLoadedFileName, loadedFileName]);

  React.useEffect(() => {
    setMoveInsightOpen(false);
  }, [moveInsight?.detail, moveInsight?.label, moveInsight?.tone, shapeCoachEnabled]);

  React.useEffect(() => {
    if (!moveInsightOpen) return undefined;
    moveInsightCloseRef.current?.focus({ preventScroll: true });

    const closeMoveInsight = (restoreFocus = false) => {
      setMoveInsightOpen(false);
      if (restoreFocus && typeof window !== 'undefined') {
        window.setTimeout(() => moveInsightButtonRef.current?.focus({ preventScroll: true }), 0);
      }
    };

    const handlePointerDown = (event: PointerEvent) => {
      if (moveInsightRef.current?.contains(event.target as Node)) return;
      closeMoveInsight();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        closeMoveInsight(true);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [moveInsightOpen]);

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
  const blackPlayerLabel = formatGameInfoPlayer(blackName, blackRank, 'Black');
  const whitePlayerLabel = formatGameInfoPlayer(whiteName, whiteRank, 'White');
  const hasMultipleGamepads = gamepadCount > 1;
  const gamepadStatusText = hasMultipleGamepads
    ? `Gamepad navigation: ${gamepadName}. ${gamepadCount} controllers connected; using the most recently active. Click to disable.`
    : `Gamepad navigation: ${gamepadName}. Click to disable.`;
  const saveStatusDisplay = getSaveStatusDisplay(unsavedChanges, autoSaveStatus);
  const saveStatusClass = saveStatusDisplay
    ? saveStatusDisplay.tone === 'danger'
      ? 'bg-[var(--ui-danger-soft)] text-[var(--ui-danger)] border-[var(--ui-danger)]'
      : saveStatusDisplay.tone === 'success'
        ? 'bg-[var(--ui-success-soft)] text-[var(--ui-success)] border-[var(--ui-success)]'
        : saveStatusDisplay.tone === 'accent'
          ? 'bg-[var(--ui-accent-soft)] text-[var(--ui-accent)] border-[var(--ui-accent)]'
          : 'bg-[var(--ui-warning-soft)] text-[var(--ui-warning)] border-[var(--ui-warning)]'
    : '';

  return (
    <div className="status-bar flex flex-wrap gap-2 px-3 py-2 items-center text-xs">
      <div className="status-bar-section flex flex-wrap gap-2 items-center">
        <div className="px-2 py-1 rounded bg-[var(--ui-surface-2)] text-[var(--ui-text)] font-semibold border border-[var(--ui-border)] shadow-sm">
          {moveName}
        </div>

        {onToggleShapeCoach && (
          <button
            type="button"
            className={[
              'px-2 py-1 rounded border shadow-sm hidden lg:flex items-center gap-1.5 transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--ui-accent)] focus:ring-offset-1 focus:ring-offset-[var(--ui-bg)]',
              shapeCoachEnabled
                ? 'bg-[var(--ui-accent-soft)] text-[var(--ui-accent)] border-[var(--ui-accent)] hover:bg-[var(--ui-accent)] hover:text-[var(--ui-accent-contrast)]'
                : 'bg-[var(--ui-surface)] text-[var(--ui-text-faint)] border-[var(--ui-border)] hover:text-[var(--ui-text)] hover:border-[var(--ui-accent)]',
            ].join(' ')}
            onClick={onToggleShapeCoach}
            title={shapeCoachEnabled ? 'Hide shape coach' : 'Show shape coach'}
            aria-label={shapeCoachEnabled ? 'Hide shape coach' : 'Show shape coach'}
            aria-pressed={shapeCoachEnabled}
            data-status-shape-coach-toggle="true"
          >
            <FaStar aria-hidden="true" />
            <span className="hidden xl:inline font-semibold">Shape</span>
          </button>
        )}

        {shapeCoachEnabled && moveInsight && moveInsightCoach && (
          <div
            ref={moveInsightRef}
            className="relative hidden lg:flex min-w-[9.5rem] max-w-[260px] shrink-0"
            data-status-move-insight={moveInsight.tone}
          >
            <button
              type="button"
              ref={moveInsightButtonRef}
              className="flex w-full min-w-0 items-center gap-1.5 rounded border border-[var(--ui-accent)] bg-[var(--ui-accent-soft)] px-2 py-1 text-[var(--ui-accent)] shadow-sm transition-colors hover:bg-[var(--ui-surface-2)] hover:text-[var(--ui-text)] focus:outline-none focus:ring-2 focus:ring-[var(--ui-accent)] focus:ring-offset-1 focus:ring-offset-[var(--ui-bg)]"
              title={`${moveInsight.detail} Click for beginner and pro study cues.`}
              aria-label={`${moveInsightOpen ? 'Close' : 'Open'} Shape Coach details for ${moveInsight.label}`}
              aria-haspopup="dialog"
              aria-expanded={moveInsightOpen}
              aria-controls={moveInsightPopoverId}
              onClick={() => setMoveInsightOpen((open) => !open)}
              data-status-move-insight-toggle="true"
            >
              <span className="shrink-0 opacity-75">Shape:</span>
              <span className="min-w-0 flex-1 truncate text-left font-semibold" data-status-move-insight-label="true">
                {moveInsight.label}
              </span>
              <FaInfoCircle className="shrink-0" aria-hidden="true" />
            </button>
            {moveInsightOpen && (
              <div
                id={moveInsightPopoverId}
                role="dialog"
                aria-modal="false"
                aria-labelledby={moveInsightTitleId}
                className="absolute bottom-full left-0 z-50 mb-2 w-80 max-w-[calc(100vw-2rem)] rounded border border-[var(--ui-border)] bg-[var(--ui-panel)] p-3 text-[11px] text-[var(--ui-text-muted)] shadow-2xl"
                data-status-move-insight-popover="true"
              >
                <div className="mb-2 flex min-w-0 items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[10px] font-semibold uppercase ui-text-faint">Shape Coach</div>
                    <div id={moveInsightTitleId} className="truncate text-xs font-semibold text-[var(--ui-text)]">{moveInsight.label}</div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <span className="rounded border border-[var(--ui-accent)] bg-[var(--ui-accent-soft)] px-1.5 py-0.5 text-[10px] font-semibold capitalize text-[var(--ui-accent)]">
                      {moveInsight.tone}
                    </span>
                    <button
                      type="button"
                      ref={moveInsightCloseRef}
                      className="rounded p-1 text-[var(--ui-text-faint)] transition-colors hover:bg-[var(--ui-surface-2)] hover:text-[var(--ui-text)] focus:outline-none focus:ring-2 focus:ring-[var(--ui-accent)]"
                      onClick={() => {
                        setMoveInsightOpen(false);
                        window.setTimeout(() => moveInsightButtonRef.current?.focus({ preventScroll: true }), 0);
                      }}
                      aria-label="Close Shape Coach details"
                      title="Close Shape Coach details"
                    >
                      <FaTimes size={10} aria-hidden="true" />
                    </button>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <p>
                    <span className="font-semibold text-[var(--ui-text)]">Beginner: </span>
                    {moveInsightCoach.beginner}
                  </p>
                  <p>
                    <span className="font-semibold text-[var(--ui-text)]">Pro: </span>
                    {moveInsightCoach.pro}
                  </p>
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {moveInsightCoach.checks.map((check) => (
                    <span key={check} className="rounded border border-[var(--ui-border)] bg-[var(--ui-surface)] px-1.5 py-0.5 text-[10px] ui-text-faint">
                      {check}
                    </span>
                  ))}
                </div>
                {moveInsight.learnMoreUrl ? (
                  <a
                    href={moveInsight.learnMoreUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-flex rounded border border-[var(--ui-border)] bg-[var(--ui-surface)] px-2 py-1 text-[10px] font-semibold text-[var(--ui-accent)] hover:bg-[var(--ui-surface-2)]"
                    aria-label={`Learn more about ${moveInsight.label}`}
                  >
                    Learn more
                  </a>
                ) : null}
              </div>
            )}
          </div>
        )}

        <div className="px-2 py-1 rounded bg-[var(--ui-surface)] text-[var(--ui-text-muted)] border border-[var(--ui-border)] shadow-sm flex items-center gap-1.5 truncate max-w-[280px]" title={`${blackPlayerLabel} vs ${whitePlayerLabel}`}>
          <span className="status-player status-player-black" aria-hidden="true" />
          <span className="truncate">{blackPlayerLabel}</span>
          <span className="text-[var(--ui-text-faint)]">vs</span>
          <span className="status-player status-player-white" aria-hidden="true" />
          <span className="truncate">{whitePlayerLabel}</span>
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
          <span className="text-[var(--ui-text)] font-medium">{capturedWhite}</span>
        </span>
        <span className="flex items-center gap-1">
          <span className="status-player status-player-white" aria-hidden="true" />
          <span className="text-[var(--ui-text)] font-medium">{capturedBlack}</span>
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
                className="min-w-0 truncate text-left text-[var(--ui-text)] font-medium hover:text-[var(--ui-text)] disabled:hover:text-[var(--ui-text)]"
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

      {saveStatusDisplay && (
        <div
          className={['px-2 py-1 rounded font-semibold border shadow-sm flex items-center gap-1.5', saveStatusClass].join(' ')}
          data-save-status="true"
          data-save-state={saveStatusDisplay.state}
          role={saveStatusDisplay.role}
          aria-live={saveStatusDisplay.ariaLive}
          title={saveStatusDisplay.title}
          aria-label={saveStatusDisplay.title}
        >
          {saveStatusDisplay.state === 'failed' || saveStatusDisplay.state === 'too-large' || saveStatusDisplay.state === 'dirty' ? (
            <FaExclamationTriangle aria-hidden="true" />
          ) : saveStatusDisplay.state === 'pending' ? (
            <FaSyncAlt className="animate-spin" aria-hidden="true" />
          ) : (
            <FaCheckCircle aria-hidden="true" />
          )}
          <span>{saveStatusDisplay.label}</span>
          {saveStatusDisplay.detail && (
            <span className="font-mono text-[var(--ui-text-muted)]">{saveStatusDisplay.detail}</span>
          )}
        </div>
      )}

      {gamepadName && (
        <button
          type="button"
          className="px-2 py-1 rounded bg-[var(--ui-accent-soft)] text-[var(--ui-accent)] border border-[var(--ui-accent)] shadow-sm flex max-w-[2.25rem] sm:max-w-[10rem] lg:max-w-[280px] items-center justify-center sm:justify-start gap-1.5 truncate hover:bg-[var(--ui-accent)] hover:text-[var(--ui-accent-contrast)] focus:outline-none focus:ring-2 focus:ring-[var(--ui-accent)] focus:ring-offset-1 focus:ring-offset-[var(--ui-bg)] disabled:pointer-events-none"
          title={gamepadStatusText}
          aria-label={hasMultipleGamepads ? gamepadStatusText.replace('Gamepad navigation:', 'Gamepad navigation connected:') : `Gamepad navigation connected: ${gamepadName}. Click to disable.`}
          data-gamepad-status="connected"
          data-gamepad-count={gamepadCount || 1}
          onClick={onGamepadNavigationDisable}
          disabled={!onGamepadNavigationDisable}
        >
          <FaGamepad aria-hidden="true" />
          <span className="hidden sm:inline font-semibold">Gamepad</span>
          {hasMultipleGamepads && (
            <span className="hidden sm:inline rounded border border-current px-1 text-[10px] font-bold leading-4">
              x{gamepadCount}
            </span>
          )}
          <span className="hidden md:inline min-w-0 truncate font-mono text-[var(--ui-text-muted)]">
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
