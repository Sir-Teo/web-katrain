import React from 'react';
import {
  FaBook,
  FaChartLine,
  FaClipboard,
  FaCog,
  FaFolderOpen,
  FaPlay,
  FaTimes,
  FaThLarge,
} from 'react-icons/fa';
import type { LibraryFile } from '../utils/library';

interface MobileHomeProps {
  open: boolean;
  blackName: string;
  whiteName: string;
  boardSize: number;
  moveCount: number;
  engineMeta: string;
  recentItems: LibraryFile[];
  onClose: () => void;
  onNewGame: () => void;
  onOpenSgf: () => void;
  onPasteSgf: () => void;
  onOpenLibrary: () => void;
  onOpenReport: () => void;
  onOpenSettings: () => void;
  onOpenRecent: (sgf: string) => void;
}

interface HomeActionProps {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  primary?: boolean;
}

const HomeAction: React.FC<HomeActionProps> = ({ label, icon, onClick, primary }) => (
  <button
    type="button"
    onClick={onClick}
    className={[
      'min-h-12 rounded-lg border px-3 py-3 text-left transition-colors touch-manipulation',
      'flex items-center gap-3',
      primary
        ? 'border-[var(--ui-accent)] bg-[var(--ui-accent)] text-[var(--ui-accent-contrast)]'
        : 'border-[var(--ui-border)] bg-[var(--ui-surface)] text-[var(--ui-text)] hover:bg-[var(--ui-surface-2)]',
    ].join(' ')}
  >
    <span
      className={[
        'grid h-9 w-9 shrink-0 place-items-center rounded-md',
        primary ? 'bg-black/15' : 'bg-[var(--ui-surface-2)] text-[var(--ui-accent)]',
      ].join(' ')}
      aria-hidden="true"
    >
      {icon}
    </span>
    <span className="min-w-0 flex-1 truncate text-sm font-semibold">{label}</span>
  </button>
);

export const MobileHome: React.FC<MobileHomeProps> = ({
  open,
  blackName,
  whiteName,
  boardSize,
  moveCount,
  engineMeta,
  recentItems,
  onClose,
  onNewGame,
  onOpenSgf,
  onPasteSgf,
  onOpenLibrary,
  onOpenReport,
  onOpenSettings,
  onOpenRecent,
}) => {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[45] lg:hidden ui-bg mobile-safe-inset mobile-safe-area-bottom">
      <div className="flex h-full min-h-0 flex-col">
        <header className="ui-bar border-b border-[var(--ui-border)] px-3 py-2">
          <div className="flex min-h-11 items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate text-base font-bold text-[var(--ui-text)]">web-KaTrain</div>
              <div className="truncate text-xs ui-text-muted">
                {blackName} vs {whiteName}
              </div>
            </div>
            <button
              type="button"
              className="ui-control grid place-items-center rounded-lg text-[var(--ui-text-muted)] hover:bg-[var(--ui-surface-2)] hover:text-[var(--ui-text)]"
              onClick={onClose}
              aria-label="Open board"
            >
              <FaTimes aria-hidden="true" />
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto px-3 py-3">
          <section className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel)] p-3">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-md bg-[var(--ui-surface)] px-2 py-2">
                <div className="text-[11px] uppercase tracking-wide ui-text-faint">Board</div>
                <div className="mt-1 text-sm font-semibold">{boardSize}x{boardSize}</div>
              </div>
              <div className="rounded-md bg-[var(--ui-surface)] px-2 py-2">
                <div className="text-[11px] uppercase tracking-wide ui-text-faint">Move</div>
                <div className="mt-1 text-sm font-semibold">#{moveCount}</div>
              </div>
              <div className="rounded-md bg-[var(--ui-surface)] px-2 py-2">
                <div className="text-[11px] uppercase tracking-wide ui-text-faint">Engine</div>
                <div className="mt-1 truncate text-sm font-semibold">{engineMeta.split(' · ')[0] ?? 'Idle'}</div>
              </div>
            </div>
          </section>

          <section className="mt-3 grid grid-cols-1 gap-2">
            <HomeAction label="Continue Board" icon={<FaThLarge />} onClick={onClose} primary />
            <HomeAction label="New Game" icon={<FaPlay />} onClick={onNewGame} />
            <HomeAction label="Open SGF" icon={<FaFolderOpen />} onClick={onOpenSgf} />
            <HomeAction label="Paste SGF / OGS" icon={<FaClipboard />} onClick={onPasteSgf} />
            <HomeAction label="Game Library" icon={<FaBook />} onClick={onOpenLibrary} />
            <HomeAction label="Game Report" icon={<FaChartLine />} onClick={onOpenReport} />
            <HomeAction label="Settings" icon={<FaCog />} onClick={onOpenSettings} />
          </section>

          {recentItems.length > 0 && (
            <section className="mt-4">
              <div className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide ui-text-faint">Recent</div>
              <div className="space-y-2">
                {recentItems.slice(0, 4).map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    className="min-h-12 w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-surface)] px-3 py-2 text-left hover:bg-[var(--ui-surface-2)]"
                    onClick={() => onOpenRecent(item.sgf)}
                  >
                    <div className="truncate text-sm font-semibold text-[var(--ui-text)]">{item.name}</div>
                    <div className="mt-1 truncate text-xs ui-text-faint">
                      {new Date(item.updatedAt).toLocaleString()}
                    </div>
                  </button>
                ))}
              </div>
            </section>
          )}
        </main>
      </div>
    </div>
  );
};

MobileHome.displayName = 'MobileHome';
