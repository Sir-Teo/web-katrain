import React from 'react';
import { FaTimes, FaPlay, FaSave, FaFolderOpen, FaCog, FaCopy, FaPaste, FaKeyboard, FaHome, FaCamera, FaInfoCircle, FaBook, FaBolt, FaSearch } from 'react-icons/fa';
import { APP_BUILD_LABEL, APP_COMMIT_URL } from '../../utils/appInfo';
import { useEscapeToClose } from '../../hooks/useEscapeToClose';
import { useShortcutLabels } from '../../hooks/useShortcutLabels';
import { formatLibrarySize, type LibraryFile } from '../../utils/library';
import { getQuickNewGameWarning } from '../../utils/quickNewGame';
import { APP_LOCALE_OPTIONS, getAppLocaleOption } from '../../utils/locales';
import type { AppLocaleId, BoardSize } from '../../types';

const MENU_DRAWER_SHORTCUT_IDS = [
  'new-game',
  'save-sgf',
  'save-library',
  'open-sgf',
  'copy-sgf',
  'paste-sgf',
  'command-palette',
  'settings-modal',
  'keyboard-help',
] as const;

interface MenuDrawerProps {
  open: boolean;
  onClose: () => void;
  onHome?: () => void;
  onQuickNewGame: () => void;
  onNewGame: () => void;
  onSave: () => void;
  saveLabel?: string;
  onSaveToLibrary: () => void;
  onLoad: () => void;
  onScanBoard: () => void;
  onCopy: () => void;
  onPaste: () => void;
  onSettings: () => void;
  onCommandPalette: () => void;
  onKeyboardHelp: () => void;
  onAbout: () => void;
  appLocale?: AppLocaleId;
  onLocaleChange?: (locale: AppLocaleId) => void;
  quickNewGameBoardSize?: BoardSize;
  recentItems?: LibraryFile[];
  onOpenRecent?: (item: LibraryFile) => void;
}

export const MenuDrawer: React.FC<MenuDrawerProps> = ({
  open,
  onClose,
  onHome,
  onQuickNewGame,
  onNewGame,
  onSave,
  saveLabel = 'Save SGF',
  onSaveToLibrary,
  onLoad,
  onScanBoard,
  onCopy,
  onPaste,
  onSettings,
  onCommandPalette,
  onKeyboardHelp,
  onAbout,
  appLocale = 'en',
  onLocaleChange,
  quickNewGameBoardSize = 19,
  recentItems = [],
  onOpenRecent,
}) => {
  const shortcutLabels = useShortcutLabels(MENU_DRAWER_SHORTCUT_IDS);
  const quickNewGameWarning = getQuickNewGameWarning(quickNewGameBoardSize);
  const activeLocale = getAppLocaleOption(appLocale);
  useEscapeToClose(onClose, open);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-labelledby="menu-title">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} aria-hidden="true" />
      <div className="absolute left-0 top-0 h-full w-[90vw] max-w-sm ui-panel border-r shadow-xl p-3 overflow-y-auto overscroll-contain mobile-safe-inset mobile-safe-area-bottom">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold" id="menu-title">Menu</h2>
            <div className="mt-1 text-[11px] ui-text-faint">
              {APP_COMMIT_URL ? (
                <a
                  href={APP_COMMIT_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block max-w-full truncate hover:text-[var(--ui-text)]"
                  title={`Open build commit: ${APP_BUILD_LABEL}`}
                  aria-label={`Open build commit ${APP_BUILD_LABEL}`}
                  data-menu-build-link="true"
                >
                  {APP_BUILD_LABEL}
                </a>
              ) : (
                <span className="block max-w-full truncate">{APP_BUILD_LABEL}</span>
              )}
            </div>
          </div>
          <button type="button"
            className="shrink-0 ui-text-muted hover:text-[var(--ui-text)]"
            onClick={onClose}
            aria-label="Close menu"
          >
            <FaTimes aria-hidden="true" />
          </button>
        </div>

        <nav className="space-y-4" aria-label="Main menu">
          <div>
            <div className="px-3 text-xs uppercase tracking-wide ui-text-faint mb-2">Game</div>
            {onHome && (
              <button type="button"
                className="w-full flex items-center justify-between px-3 py-2 rounded hover:bg-[var(--ui-surface-2)]"
                onClick={() => {
                  onHome();
                  onClose();
                }}
                aria-label="Open home"
              >
                <span className="flex items-center gap-2">
                  <FaHome aria-hidden="true" /> Home
                </span>
              </button>
            )}
            <button type="button"
              className="w-full flex items-center justify-between px-3 py-2 rounded hover:bg-[var(--ui-surface-2)]"
              onClick={() => {
                onQuickNewGame();
                onClose();
              }}
              aria-label={quickNewGameWarning}
              title={quickNewGameWarning}
            >
              <span className="flex items-center gap-2">
                <FaBolt aria-hidden="true" /> Quick New Game
              </span>
              <span className="text-xs ui-text-faint">Immediate</span>
            </button>
            <button type="button"
              className="w-full flex items-center justify-between px-3 py-2 rounded hover:bg-[var(--ui-surface-2)]"
              onClick={() => {
                onNewGame();
                onClose();
              }}
              aria-label={`New game, keyboard shortcut ${shortcutLabels['new-game']}`}
            >
              <span className="flex items-center gap-2">
                <FaPlay aria-hidden="true" /> New Game
              </span>
              <kbd className="text-xs ui-text-faint">{shortcutLabels['new-game']}</kbd>
            </button>
            <button type="button"
              className="w-full flex items-center justify-between px-3 py-2 rounded hover:bg-[var(--ui-surface-2)]"
              onClick={() => {
                onSave();
                onClose();
              }}
              aria-label={`${saveLabel}, keyboard shortcut ${shortcutLabels['save-sgf']}`}
            >
              <span className="flex items-center gap-2">
                <FaSave aria-hidden="true" /> {saveLabel}
              </span>
              <kbd className="text-xs ui-text-faint">{shortcutLabels['save-sgf']}</kbd>
            </button>
            <button type="button"
              className="w-full flex items-center justify-between px-3 py-2 rounded hover:bg-[var(--ui-surface-2)]"
              onClick={() => {
                onSaveToLibrary();
                onClose();
              }}
              aria-label={`Save a copy to Library, keyboard shortcut ${shortcutLabels['save-library']}`}
            >
              <span className="flex items-center gap-2">
                <FaBook aria-hidden="true" /> Save Copy to Library
              </span>
              <kbd className="text-xs ui-text-faint">{shortcutLabels['save-library']}</kbd>
            </button>
            <button type="button"
              className="w-full flex items-center justify-between px-3 py-2 rounded hover:bg-[var(--ui-surface-2)]"
              onClick={() => {
                onLoad();
                onClose();
              }}
              aria-label={`Load SGF file, board photo, or model weights, keyboard shortcut ${shortcutLabels['open-sgf']}`}
            >
              <span className="flex items-center gap-2">
                <FaFolderOpen aria-hidden="true" /> Load SGF / Photo / Model
              </span>
              <kbd className="text-xs ui-text-faint">{shortcutLabels['open-sgf']}</kbd>
            </button>
            <button type="button"
              className="w-full flex items-center justify-between px-3 py-2 rounded hover:bg-[var(--ui-surface-2)]"
              onClick={() => {
                onScanBoard();
                onClose();
              }}
              aria-label="Open photo board"
            >
              <span className="flex items-center gap-2">
                <FaCamera aria-hidden="true" /> Photo Board
              </span>
            </button>
          </div>
          <div>
            <div className="px-3 text-xs uppercase tracking-wide ui-text-faint mb-2">Edit</div>
            <button type="button"
              className="w-full flex items-center justify-between px-3 py-2 rounded hover:bg-[var(--ui-surface-2)]"
              onClick={() => {
                onCopy();
                onClose();
              }}
              aria-label={`Copy SGF, keyboard shortcut ${shortcutLabels['copy-sgf']}`}
            >
              <span className="flex items-center gap-2">
                <FaCopy aria-hidden="true" /> Copy SGF
              </span>
              <kbd className="text-xs ui-text-faint">{shortcutLabels['copy-sgf']}</kbd>
            </button>
            <button type="button"
              className="w-full flex items-center justify-between px-3 py-2 rounded hover:bg-[var(--ui-surface-2)]"
              onClick={() => {
                onPaste();
                onClose();
              }}
              aria-label={`Paste SGF or OGS URL, keyboard shortcut ${shortcutLabels['paste-sgf']}`}
            >
              <span className="flex items-center gap-2">
                <FaPaste aria-hidden="true" /> Paste SGF / OGS
              </span>
              <kbd className="text-xs ui-text-faint">{shortcutLabels['paste-sgf']}</kbd>
            </button>
          </div>
          <div>
            <div className="px-3 text-xs uppercase tracking-wide ui-text-faint mb-2">Settings</div>
            <label
              htmlFor="menu-app-locale"
              className="w-full flex items-center justify-between gap-3 px-3 py-2 rounded"
            >
              <span className="flex min-w-0 flex-col">
                <span className="text-sm text-[var(--ui-text)]">{activeLocale.languageLabel}</span>
                <span className="text-xs ui-text-faint truncate">{activeLocale.label}</span>
              </span>
              <select
                id="menu-app-locale"
                value={activeLocale.value}
                onChange={(event) => onLocaleChange?.(event.target.value as AppLocaleId)}
                className="ui-input min-h-11 max-w-[9rem] rounded border px-2 py-1 text-sm text-[var(--ui-text)]"
                data-menu-locale="true"
              >
                {APP_LOCALE_OPTIONS.map((locale) => (
                  <option key={locale.value} value={locale.value}>
                    {locale.label}
                  </option>
                ))}
              </select>
            </label>
            <button type="button"
              className="w-full flex items-center justify-between px-3 py-2 rounded hover:bg-[var(--ui-surface-2)]"
              onClick={() => {
                onCommandPalette();
                onClose();
              }}
              aria-label={`Open command palette, keyboard shortcut ${shortcutLabels['command-palette']}`}
            >
              <span className="flex items-center gap-2">
                <FaSearch aria-hidden="true" /> Command Palette
              </span>
              <kbd className="text-xs ui-text-faint">{shortcutLabels['command-palette']}</kbd>
            </button>
            <button type="button"
              className="w-full flex items-center justify-between px-3 py-2 rounded hover:bg-[var(--ui-surface-2)]"
              onClick={() => {
                onSettings();
                onClose();
              }}
              aria-label={`Open settings, keyboard shortcut ${shortcutLabels['settings-modal']}`}
            >
              <span className="flex items-center gap-2">
                <FaCog aria-hidden="true" /> Settings
              </span>
              <kbd className="text-xs ui-text-faint">{shortcutLabels['settings-modal']}</kbd>
            </button>
            <button type="button"
              className="w-full flex items-center justify-between px-3 py-2 rounded hover:bg-[var(--ui-surface-2)]"
              onClick={() => {
                onKeyboardHelp();
                onClose();
              }}
              aria-label={`Open keyboard shortcuts, keyboard shortcut ${shortcutLabels['keyboard-help']}`}
            >
              <span className="flex items-center gap-2">
                <FaKeyboard aria-hidden="true" /> Keyboard Shortcuts
              </span>
              <kbd className="text-xs ui-text-faint">{shortcutLabels['keyboard-help']}</kbd>
            </button>
            <button type="button"
              className="w-full flex items-center justify-between px-3 py-2 rounded hover:bg-[var(--ui-surface-2)]"
              onClick={() => {
                onAbout();
                onClose();
              }}
              aria-label="Open about dialog"
            >
              <span className="flex items-center gap-2">
                <FaInfoCircle aria-hidden="true" /> About
              </span>
              <span className="text-xs ui-text-faint">Build</span>
            </button>
          </div>
        </nav>

        {recentItems.length > 0 && onOpenRecent && (
          <div className="mt-2 border-t border-[var(--ui-border)] pt-2 space-y-2">
            <div className="text-xs ui-text-faint px-3 uppercase tracking-wide">Recent</div>
            <div className="space-y-1">
              {recentItems.map((item) => (
                <button type="button"
                  key={item.id}
                  className="w-full text-left px-3 py-2 rounded hover:bg-[var(--ui-surface-2)] text-sm text-[var(--ui-text)]"
                  onClick={() => {
                    onOpenRecent(item);
                    onClose();
                  }}
                >
                  <div className="truncate">{item.name}</div>
                  <div className="text-[11px] ui-text-faint">
                    {item.moveCount} moves · {formatLibrarySize(item.size)} · {new Date(item.updatedAt).toLocaleString()}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
