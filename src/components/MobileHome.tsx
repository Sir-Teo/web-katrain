import React from 'react';
import {
  FaBook,
  FaCamera,
  FaChartLine,
  FaClipboard,
  FaCog,
  FaCopy,
  FaFolderOpen,
  FaGamepad,
  FaPlay,
  FaBolt,
  FaSave,
  FaTimes,
  FaThLarge,
} from 'react-icons/fa';
import { formatLibrarySize, formatLibraryTimestamp, type LibraryFile } from '../utils/library';
import { formatGamepadLabel } from '../utils/gamepadLabel';
import { getQuickNewGameWarning } from '../utils/quickNewGame';
import type { BoardSize } from '../types';
import { useEscapeToClose } from '../hooks/useEscapeToClose';

interface MobileHomeProps {
  open: boolean;
  blackName: string;
  whiteName: string;
  boardSize: number;
  moveCount: number;
  /** Moves in the current line, so the home screen can tell a loaded game from an untouched board. */
  totalMoveCount: number;
  engineMeta: string;
  gamepadName?: string | null;
  gamepadCount?: number;
  recentItems: LibraryFile[];
  onClose: () => void;
  onGamepadNavigationDisable?: () => void;
  quickNewGameBoardSize?: BoardSize;
  onQuickNewGame: () => void;
  onNewGame: () => void;
  onOpenSgf: () => void;
  onScanBoard: () => void;
  onSaveToLibrary: () => void;
  onCopySgf: () => void;
  onPasteSgf: () => void;
  onOpenLibrary: () => void;
  onOpenReport: () => void;
  onOpenSettings: () => void;
  onOpenRecent: (item: LibraryFile) => void;
}

interface HomeActionProps {
  label: string;
  compactLabel?: string;
  icon: React.ReactNode;
  onClick: () => void;
  primary?: boolean;
  hint?: string;
  title?: string;
  ariaLabel?: string;
}

const HomeAction: React.FC<HomeActionProps> = ({ label, compactLabel, icon, onClick, primary, hint, title, ariaLabel }) => (
  <button
    type="button"
    onClick={onClick}
    title={title}
    aria-label={ariaLabel}
    className={[
      'min-h-12 w-full px-3 py-3 text-left transition-colors touch-manipulation',
      'flex items-center gap-3',
      primary
        ? 'border-l-2 border-[var(--ui-accent)] bg-[var(--ui-accent-soft)] text-[var(--ui-accent)]'
        : 'text-[var(--ui-text)] hover:bg-[var(--ui-surface-2)]',
    ].join(' ')}
  >
    <span
      className={[
        'mobile-home-action-icon grid h-9 w-9 shrink-0 place-items-center',
        primary ? 'text-[var(--ui-accent)]' : 'text-[var(--ui-text-muted)]',
      ].join(' ')}
      aria-hidden="true"
    >
      {icon}
    </span>
    <span className="mobile-home-action-copy min-w-0 flex-1">
      <span className="mobile-home-action-label-full block truncate text-sm font-semibold">{label}</span>
      {compactLabel ? (
        <span className="mobile-home-action-label-compact hidden text-xs font-semibold">{compactLabel}</span>
      ) : null}
      {hint ? <span className="mobile-home-action-hint mt-0.5 block truncate text-[0.6875rem] opacity-75">{hint}</span> : null}
    </span>
  </button>
);

export const MobileHome: React.FC<MobileHomeProps> = ({
  open,
  blackName,
  whiteName,
  boardSize,
  moveCount,
  totalMoveCount,
  engineMeta,
  gamepadName,
  gamepadCount = 0,
  recentItems,
  onClose,
  onGamepadNavigationDisable,
  quickNewGameBoardSize = 19,
  onQuickNewGame,
  onNewGame,
  onOpenSgf,
  onScanBoard,
  onSaveToLibrary,
  onCopySgf,
  onPasteSgf,
  onOpenLibrary,
  onOpenReport,
  onOpenSettings,
  onOpenRecent,
}) => {
  const homeRef = React.useRef<HTMLDivElement>(null);
  const closeButtonRef = React.useRef<HTMLButtonElement>(null);
  useEscapeToClose(onClose, open);

  // On a first visit there is nothing to continue: the board is empty and
  // "Continue Board" was the accented primary anyway. Lead with starting a
  // game until a game exists, and say Open Board for what is really a way
  // back to an untouched board.
  const hasGameToContinue = totalMoveCount > 0;

  React.useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const focusableSelector = [
      'a[href]:not([tabindex="-1"])',
      'button:not([disabled]):not([tabindex="-1"])',
      'input:not([disabled]):not([tabindex="-1"])',
      'select:not([disabled]):not([tabindex="-1"])',
      'textarea:not([disabled]):not([tabindex="-1"])',
      '[tabindex]:not([tabindex="-1"])',
    ].join(',');
    const focusCloseButton = window.requestAnimationFrame(() => {
      closeButtonRef.current?.focus({ preventScroll: true });
    });
    const keepFocusInHome = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || event.defaultPrevented) return;
      const home = homeRef.current;
      if (!home) return;
      const focusableElements = Array.from(home.querySelectorAll<HTMLElement>(focusableSelector))
        .filter((element) => element.getClientRects().length > 0);
      const first = focusableElements[0];
      const last = focusableElements[focusableElements.length - 1];
      if (!first || !last) {
        event.preventDefault();
        return;
      }
      const activeElement = document.activeElement;
      if (event.shiftKey && (activeElement === first || !home.contains(activeElement))) {
        event.preventDefault();
        last.focus({ preventScroll: true });
      } else if (!event.shiftKey && (activeElement === last || !home.contains(activeElement))) {
        event.preventDefault();
        first.focus({ preventScroll: true });
      }
    };

    document.addEventListener('keydown', keepFocusInHome, true);
    return () => {
      window.cancelAnimationFrame(focusCloseButton);
      document.removeEventListener('keydown', keepFocusInHome, true);
      if (previouslyFocused?.isConnected) previouslyFocused.focus({ preventScroll: true });
    };
  }, [open]);

  /**
   * The stylesheet drops the PWA install banner to the screen edge while this
   * overlay is up, so it stops floating over the action list -- but it keys off
   * `:root[data-mobile-home='open']`, and nothing set that. The attribute below
   * lives on this element as `data-mobile-home="true"`, which the rule cannot
   * see and would not match anyway. The banner covered a recent-games row on
   * every phone-width screen, exactly what the rule was written to prevent.
   */
  React.useEffect(() => {
    const root = document.documentElement;
    if (!open) {
      root.removeAttribute('data-mobile-home');
      return;
    }
    root.dataset.mobileHome = 'open';
    return () => {
      root.removeAttribute('data-mobile-home');
    };
  }, [open]);

  if (!open) return null;

  const compactGamepadName = gamepadName ? formatGamepadLabel(gamepadName, 18) : null;
  const hasMultipleGamepads = gamepadCount > 1;
  const gamepadStatusText = hasMultipleGamepads
    ? `Gamepad navigation connected: ${gamepadName}. ${gamepadCount} controllers connected; using the most recently active. Tap to disable.`
    : `Gamepad navigation connected: ${gamepadName}. Tap to disable.`;
  const quickNewGameWarning = getQuickNewGameWarning(quickNewGameBoardSize);

  return (
    <div
      ref={homeRef}
      className="fixed inset-0 z-[45] desktop-shell:hidden ui-bg mobile-safe-inset mobile-safe-area-bottom"
      role="dialog"
      aria-modal="true"
      aria-labelledby="mobile-home-title"
      data-mobile-home="true"
    >
      <div className="flex h-full min-h-0 flex-col">
        <header className="ui-bar border-b border-[var(--ui-border)] px-3 py-2">
          <div className="flex min-h-11 items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h2 id="mobile-home-title" className="truncate text-base font-bold text-[var(--ui-text)]">Web KaTrain</h2>
              <div className="truncate text-xs ui-text-muted">
                {blackName} vs {whiteName}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {compactGamepadName && (
                <button
                  type="button"
                  className="ui-control relative grid place-items-center rounded-lg border border-[var(--ui-accent)] bg-[var(--ui-accent-soft)] text-[var(--ui-accent)] shadow-sm hover:bg-[var(--ui-accent)] hover:text-[var(--ui-accent-contrast)] disabled:pointer-events-none disabled:opacity-70"
                  onClick={onGamepadNavigationDisable}
                  title={gamepadStatusText}
                  aria-label={gamepadStatusText}
                  data-mobile-gamepad-status="connected"
                  data-mobile-gamepad-label={compactGamepadName}
                  data-mobile-gamepad-count={gamepadCount || 1}
                  disabled={!onGamepadNavigationDisable}
                >
                  <FaGamepad aria-hidden="true" />
                  {hasMultipleGamepads && (
                    <span className="absolute -right-1 -top-1 grid min-h-4 min-w-4 place-items-center rounded-full border border-[var(--ui-panel)] bg-[var(--ui-accent)] px-1 text-[0.5625rem] font-bold leading-none text-[var(--ui-accent-contrast)]">
                      {gamepadCount}
                    </span>
                  )}
                </button>
              )}
              <button
                type="button"
                ref={closeButtonRef}
                className="ui-control grid place-items-center rounded-lg text-[var(--ui-text-muted)] hover:bg-[var(--ui-surface-2)] hover:text-[var(--ui-text)]"
                onClick={onClose}
                aria-label="Open board"
                title="Return to board"
              >
                <FaTimes aria-hidden="true" />
              </button>
            </div>
          </div>
        </header>

        <main
          className="mobile-home-main flex-1 overflow-y-auto px-3 py-3"
          style={{
            paddingBottom: 'calc(0.75rem + var(--pwa-banner-height, 0px))',
            scrollPaddingBottom: 'calc(0.75rem + var(--pwa-banner-height, 0px))',
          }}
        >
          <section className="mobile-home-summary border-y border-[var(--ui-border)] py-3">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="px-2 py-2">
                <div className="text-[0.6875rem] uppercase tracking-wide ui-text-faint">Board</div>
                <div className="mt-1 text-sm font-semibold">{boardSize}×{boardSize}</div>
              </div>
              <div className="border-x border-[var(--ui-border)] px-2 py-2">
                <div className="text-[0.6875rem] uppercase tracking-wide ui-text-faint">Move</div>
                <div className="mt-1 text-sm font-semibold">
                  #{moveCount}
                  {hasGameToContinue ? <span className="ui-text-faint"> / {totalMoveCount}</span> : null}
                </div>
              </div>
              <div className="px-2 py-2">
                <div className="text-[0.6875rem] uppercase tracking-wide ui-text-faint">Engine</div>
                <div className="mt-1 truncate text-sm font-semibold">{engineMeta.split(' · ')[0] ?? 'Idle'}</div>
              </div>
            </div>
          </section>

          <section
            className="mobile-home-actions mobile-home-actions--primary mt-3 border-y border-[var(--ui-border)]"
            aria-label="Start or continue"
          >
            <HomeAction
              label={hasGameToContinue ? 'Continue Board' : 'Open Board'}
              compactLabel={hasGameToContinue ? 'Continue' : 'Board'}
              icon={<FaThLarge />}
              onClick={onClose}
              primary={hasGameToContinue}
            />
            <HomeAction
              label="Quick New Game"
              compactLabel="Quick Game"
              icon={<FaBolt />}
              onClick={onQuickNewGame}
              hint={`${quickNewGameBoardSize}×${quickNewGameBoardSize} defaults`}
              title={quickNewGameWarning}
              ariaLabel={quickNewGameWarning}
              primary={!hasGameToContinue}
            />
            <HomeAction label="New Game" compactLabel="New Game" icon={<FaPlay />} onClick={onNewGame} />
            <HomeAction label="Open SGF / Model" compactLabel="Open SGF" icon={<FaFolderOpen />} onClick={onOpenSgf} />
            <HomeAction label="Photo Board" compactLabel="Photo Board" icon={<FaCamera />} onClick={onScanBoard} hint="Camera or image" />
            <HomeAction label="Paste SGF / OGS" compactLabel="Paste SGF" icon={<FaClipboard />} onClick={onPasteSgf} />
          </section>

          {recentItems.length > 0 && (
            <section className="mobile-home-recent mt-4">
              <div className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide ui-text-faint">Recent</div>
              <div className="space-y-2">
                {recentItems.slice(0, 3).map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    className="min-h-12 w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-surface)] px-3 py-2 text-left hover:bg-[var(--ui-surface-2)]"
                    onClick={() => onOpenRecent(item)}
                  >
                    <div className="truncate text-sm font-semibold text-[var(--ui-text)]">{item.name}</div>
                    <div className="mt-1 truncate text-xs ui-text-faint">
                      {item.moveCount} moves · {formatLibrarySize(item.size)} · {formatLibraryTimestamp(item.updatedAt)}
                    </div>
                  </button>
                ))}
              </div>
            </section>
          )}

          <section className="mobile-home-manage mt-4">
            <div className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide ui-text-faint">Manage</div>
            <div
              className="mobile-home-actions mobile-home-actions--secondary border-y border-[var(--ui-border)]"
              aria-label="Manage game and app"
            >
              <HomeAction label="Save Copy to Library" compactLabel="Save Copy" icon={<FaSave />} onClick={onSaveToLibrary} />
              <HomeAction label="Copy SGF" compactLabel="Copy SGF" icon={<FaCopy />} onClick={onCopySgf} />
              <HomeAction label="Game Library" compactLabel="Library" icon={<FaBook />} onClick={onOpenLibrary} />
              <HomeAction label="Game Report" compactLabel="Report" icon={<FaChartLine />} onClick={onOpenReport} />
              <HomeAction label="Settings" compactLabel="Settings" icon={<FaCog />} onClick={onOpenSettings} />
            </div>
          </section>
        </main>
      </div>
    </div>
  );
};

MobileHome.displayName = 'MobileHome';
