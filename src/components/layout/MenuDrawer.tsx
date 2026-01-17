import React from 'react';
import { FaTimes, FaPlay, FaSave, FaFolderOpen, FaCog, FaBook, FaColumns } from 'react-icons/fa';

interface MenuDrawerProps {
  open: boolean;
  onClose: () => void;
  onNewGame: () => void;
  onSave: () => void;
  onLoad: () => void;
  onToggleLibrary: () => void;
  isLibraryOpen: boolean;
  onToggleSidebar: () => void;
  isSidebarOpen: boolean;
  onSettings: () => void;
  isAiWhite: boolean;
  isAiBlack: boolean;
  onToggleAi: (color: 'white' | 'black') => void;
}

export const MenuDrawer: React.FC<MenuDrawerProps> = ({
  open,
  onClose,
  onNewGame,
  onSave,
  onLoad,
  onToggleLibrary,
  isLibraryOpen,
  onToggleSidebar,
  isSidebarOpen,
  onSettings,
  isAiWhite,
  isAiBlack,
  onToggleAi,
}) => {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-labelledby="menu-title">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} aria-hidden="true" />
      <div className="absolute left-0 top-0 h-full w-80 bg-slate-800 border-r border-slate-700/50 shadow-xl p-3 overflow-y-auto">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold" id="menu-title">Menu</h2>
          <button
            className="text-slate-400 hover:text-white"
            onClick={onClose}
            aria-label="Close menu"
          >
            <FaTimes aria-hidden="true" />
          </button>
        </div>

        <nav className="space-y-1" aria-label="Main menu">
          <button
            className="w-full flex items-center justify-between px-3 py-2 rounded hover:bg-slate-700"
            onClick={() => {
              onNewGame();
              onClose();
            }}
            aria-label="New game, keyboard shortcut Control plus N"
          >
            <span className="flex items-center gap-2">
              <FaPlay aria-hidden="true" /> New Game
            </span>
            <kbd className="text-xs text-slate-400">Ctrl+N</kbd>
          </button>
          <button
            className="w-full flex items-center justify-between px-3 py-2 rounded hover:bg-slate-700"
            onClick={() => {
              onSave();
              onClose();
            }}
            aria-label="Save SGF file, keyboard shortcut Control plus S"
          >
            <span className="flex items-center gap-2">
              <FaSave aria-hidden="true" /> Save SGF
            </span>
            <kbd className="text-xs text-slate-400">Ctrl+S</kbd>
          </button>
          <button
            className="w-full flex items-center justify-between px-3 py-2 rounded hover:bg-slate-700"
            onClick={() => {
              onLoad();
              onClose();
            }}
            aria-label="Load SGF file, keyboard shortcut Control plus O"
          >
            <span className="flex items-center gap-2">
              <FaFolderOpen aria-hidden="true" /> Load SGF
            </span>
            <kbd className="text-xs text-slate-400">Ctrl+O</kbd>
          </button>
          <button
            className="w-full flex items-center justify-between px-3 py-2 rounded hover:bg-slate-700"
            onClick={() => {
              onToggleLibrary();
              onClose();
            }}
            aria-label="Toggle Library panel, keyboard shortcut Control plus L"
          >
            <span className="flex items-center gap-2">
              <FaBook aria-hidden="true" /> {isLibraryOpen ? 'Hide Library' : 'Show Library'}
            </span>
            <kbd className="text-xs text-slate-400">Ctrl+L</kbd>
          </button>
          <button
            className="w-full flex items-center justify-between px-3 py-2 rounded hover:bg-slate-700"
            onClick={() => {
              onToggleSidebar();
              onClose();
            }}
            aria-label="Toggle sidebar"
          >
            <span className="flex items-center gap-2">
              <FaColumns aria-hidden="true" /> {isSidebarOpen ? 'Hide Sidebar' : 'Show Sidebar'}
            </span>
            <kbd className="text-xs text-slate-400">Ctrl+B</kbd>
          </button>
          <button
            className="w-full flex items-center justify-between px-3 py-2 rounded hover:bg-slate-700"
            onClick={() => {
              onSettings();
              onClose();
            }}
            aria-label="Open settings, keyboard shortcut F8"
          >
            <span className="flex items-center gap-2">
              <FaCog aria-hidden="true" /> Settings
            </span>
            <kbd className="text-xs text-slate-400">F8</kbd>
          </button>
        </nav>

        <div className="mt-4 border-t border-slate-700/50 pt-3 space-y-2">
          <div className="text-xs text-slate-400" id="ai-toggle-label">Play vs AI</div>
          <div className="flex gap-2" role="group" aria-labelledby="ai-toggle-label">
            <button
              className={[
                'flex-1 px-3 py-2 rounded-lg text-sm font-medium',
                isAiWhite ? 'bg-emerald-600/30 text-emerald-300 border border-emerald-500/50' : 'bg-slate-800/50 text-slate-400 hover:bg-slate-700/50 border border-slate-700/30',
              ].join(' ')}
              onClick={() => onToggleAi('white')}
              aria-label={isAiWhite ? 'Disable White AI' : 'Enable White AI'}
              aria-pressed={isAiWhite}
            >
              White AI
            </button>
            <button
              className={[
                'flex-1 px-3 py-2 rounded-lg text-sm font-medium',
                isAiBlack ? 'bg-emerald-600/30 text-emerald-300 border border-emerald-500/50' : 'bg-slate-800/50 text-slate-400 hover:bg-slate-700/50 border border-slate-700/30',
              ].join(' ')}
              onClick={() => onToggleAi('black')}
              aria-label={isAiBlack ? 'Disable Black AI' : 'Enable Black AI'}
              aria-pressed={isAiBlack}
            >
              Black AI
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
