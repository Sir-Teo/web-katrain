import React from 'react';
import { FaTimes, FaPlay, FaSave, FaFolderOpen, FaCog, FaCopy, FaPaste, FaKeyboard } from 'react-icons/fa';

interface MenuDrawerProps {
  open: boolean;
  onClose: () => void;
  onNewGame: () => void;
  onSave: () => void;
  onLoad: () => void;
  onCopy: () => void;
  onPaste: () => void;
  onSettings: () => void;
  onKeyboardHelp: () => void;
  recentItems?: Array<{ id: string; name: string; updatedAt: number; sgf: string }>;
  onOpenRecent?: (sgf: string) => void;
}

export const MenuDrawer: React.FC<MenuDrawerProps> = ({
  open,
  onClose,
  onNewGame,
  onSave,
  onLoad,
  onCopy,
  onPaste,
  onSettings,
  onKeyboardHelp,
  recentItems = [],
  onOpenRecent,
}) => {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-labelledby="menu-title">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} aria-hidden="true" />
      <div className="absolute left-0 top-0 h-full w-[90vw] max-w-sm ui-panel border-r shadow-xl p-3 overflow-y-auto overscroll-contain mobile-safe-inset mobile-safe-area-bottom">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold" id="menu-title">Menu</h2>
          <button
            className="ui-text-muted hover:text-white"
            onClick={onClose}
            aria-label="Close menu"
          >
            <FaTimes aria-hidden="true" />
          </button>
        </div>

        <nav className="space-y-4" aria-label="Main menu">
          <div>
            <div className="px-3 text-xs uppercase tracking-wide ui-text-faint mb-2">Game</div>
            <button
              className="w-full flex items-center justify-between px-3 py-2 rounded hover:bg-[var(--ui-surface-2)]"
              onClick={() => {
                onNewGame();
                onClose();
              }}
              aria-label="New game, keyboard shortcut Control plus N"
            >
              <span className="flex items-center gap-2">
                <FaPlay aria-hidden="true" /> New Game
              </span>
              <kbd className="text-xs ui-text-faint">Ctrl+N</kbd>
            </button>
            <button
              className="w-full flex items-center justify-between px-3 py-2 rounded hover:bg-[var(--ui-surface-2)]"
              onClick={() => {
                onSave();
                onClose();
              }}
              aria-label="Save SGF file, keyboard shortcut Control plus S"
            >
              <span className="flex items-center gap-2">
                <FaSave aria-hidden="true" /> Save SGF
              </span>
              <kbd className="text-xs ui-text-faint">Ctrl+S</kbd>
            </button>
            <button
              className="w-full flex items-center justify-between px-3 py-2 rounded hover:bg-[var(--ui-surface-2)]"
              onClick={() => {
                onLoad();
                onClose();
              }}
              aria-label="Load SGF file, keyboard shortcut Control plus O"
            >
              <span className="flex items-center gap-2">
                <FaFolderOpen aria-hidden="true" /> Load SGF
              </span>
              <kbd className="text-xs ui-text-faint">Ctrl+O</kbd>
            </button>
          </div>
          <div>
            <div className="px-3 text-xs uppercase tracking-wide ui-text-faint mb-2">Edit</div>
            <button
              className="w-full flex items-center justify-between px-3 py-2 rounded hover:bg-[var(--ui-surface-2)]"
              onClick={() => {
                onCopy();
                onClose();
              }}
              aria-label="Copy SGF, keyboard shortcut Control plus C"
            >
              <span className="flex items-center gap-2">
                <FaCopy aria-hidden="true" /> Copy SGF
              </span>
              <kbd className="text-xs ui-text-faint">Ctrl+C</kbd>
            </button>
            <button
              className="w-full flex items-center justify-between px-3 py-2 rounded hover:bg-[var(--ui-surface-2)]"
              onClick={() => {
                onPaste();
                onClose();
              }}
              aria-label="Paste SGF or OGS URL, keyboard shortcut Control plus V"
            >
              <span className="flex items-center gap-2">
                <FaPaste aria-hidden="true" /> Paste SGF / OGS
              </span>
              <kbd className="text-xs ui-text-faint">Ctrl+V</kbd>
            </button>
          </div>
          <div>
            <div className="px-3 text-xs uppercase tracking-wide ui-text-faint mb-2">Settings</div>
            <button
              className="w-full flex items-center justify-between px-3 py-2 rounded hover:bg-[var(--ui-surface-2)]"
              onClick={() => {
                onSettings();
                onClose();
              }}
              aria-label="Open settings, keyboard shortcut F8"
            >
              <span className="flex items-center gap-2">
                <FaCog aria-hidden="true" /> Settings
              </span>
              <kbd className="text-xs ui-text-faint">F8</kbd>
            </button>
            <button
              className="w-full flex items-center justify-between px-3 py-2 rounded hover:bg-[var(--ui-surface-2)]"
              onClick={() => {
                onKeyboardHelp();
                onClose();
              }}
              aria-label="Open keyboard shortcuts"
            >
              <span className="flex items-center gap-2">
                <FaKeyboard aria-hidden="true" /> Keyboard Shortcuts
              </span>
              <kbd className="text-xs ui-text-faint">?</kbd>
            </button>
          </div>
        </nav>

        {recentItems.length > 0 && onOpenRecent && (
          <div className="mt-2 border-t border-[var(--ui-border)] pt-2 space-y-2">
            <div className="text-xs ui-text-faint px-3 uppercase tracking-wide">Recent</div>
            <div className="space-y-1">
              {recentItems.map((item) => (
                <button
                  key={item.id}
                  className="w-full text-left px-3 py-2 rounded hover:bg-[var(--ui-surface-2)] text-sm text-[var(--ui-text)]"
                  onClick={() => {
                    onOpenRecent(item.sgf);
                    onClose();
                  }}
                >
                  <div className="truncate">{item.name}</div>
                  <div className="text-[11px] ui-text-faint">
                    {new Date(item.updatedAt).toLocaleString()}
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
