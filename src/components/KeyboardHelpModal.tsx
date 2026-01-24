import React from 'react';
import { FaTimes } from 'react-icons/fa';

interface KeyboardHelpModalProps {
  onClose: () => void;
}

const SHORTCUT_CATEGORIES = [
  {
    title: 'Navigation',
    shortcuts: [
      { key: '← / Z', description: 'Previous move' },
      { key: '→ / X', description: 'Next move' },
      { key: 'Shift+←', description: 'Back 10 moves' },
      { key: 'Shift+→', description: 'Forward 10 moves' },
      { key: 'Home', description: 'Go to start' },
      { key: 'End', description: 'Go to end' },
      { key: '↑ / ↓', description: 'Switch branch' },
      { key: 'PageUp', description: 'Make current branch main' },
      { key: 'B', description: 'Undo to branch point' },
      { key: 'Shift+B', description: 'Undo to main branch' },
    ],
  },
  {
    title: 'Game Control',
    shortcuts: [
      { key: 'P', description: 'Pass' },
      { key: 'Enter', description: 'AI move' },
      { key: 'L', description: 'Selfplay to end' },
      { key: 'O', description: 'Rotate board' },
      { key: 'I', description: 'Toggle insert mode' },
    ],
  },
  {
    title: 'Visualization',
    shortcuts: [
      { key: 'Q', description: 'Toggle children' },
      { key: 'W', description: 'Toggle eval dots' },
      { key: 'E', description: 'Toggle top moves' },
      { key: 'R', description: 'Toggle policy' },
      { key: 'T', description: 'Toggle territory' },
      { key: 'K', description: 'Toggle coordinates' },
      { key: 'M', description: 'Toggle move numbers' },
    ],
  },
  {
    title: 'Analysis',
    shortcuts: [
      { key: 'Tab', description: 'Toggle analysis mode' },
      { key: 'Space', description: 'Continuous analysis' },
      { key: 'A', description: 'Extra analysis' },
      { key: 'S', description: 'Equalize' },
      { key: 'D', description: 'Sweep' },
      { key: 'F', description: 'Alternative' },
      { key: 'G', description: 'Select region' },
      { key: 'H', description: 'Reset analysis' },
      { key: 'N', description: 'Next mistake' },
      { key: 'Shift+N', description: 'Previous mistake' },
    ],
  },
  {
    title: 'File Operations',
    shortcuts: [
      { key: 'Ctrl+N', description: 'New game' },
      { key: 'Ctrl+S', description: 'Save SGF' },
      { key: 'Ctrl+O', description: 'Load SGF' },
      { key: 'Ctrl+L', description: 'Toggle library' },
      { key: 'Ctrl+B', description: 'Toggle sidebar' },
      { key: 'Ctrl+C', description: 'Copy SGF' },
      { key: 'Ctrl+V', description: 'Paste SGF / OGS URL' },
    ],
  },
  {
    title: 'Modals',
    shortcuts: [
      { key: '?', description: 'Keyboard shortcuts' },
      { key: 'F2', description: 'Game re-analysis' },
      { key: 'F3', description: 'Game report' },
      { key: 'F8', description: 'Settings' },
      { key: 'Esc', description: 'Close / cancel' },
    ],
  },
  {
    title: 'View',
    shortcuts: [
      { key: 'F', description: 'Toggle fullscreen' },
    ],
  },
];

export const KeyboardHelpModal: React.FC<KeyboardHelpModalProps> = ({ onClose }) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 sm:p-6 mobile-safe-inset mobile-safe-area-bottom">
      <div className="ui-panel rounded-lg shadow-xl w-[92vw] max-w-[800px] max-h-[90dvh] overflow-hidden flex flex-col border">
        <div className="flex items-center justify-between p-4 border-b border-[var(--ui-border)] ui-bar">
          <h2 className="text-lg font-semibold text-[var(--ui-text)]">Keyboard Shortcuts</h2>
          <button onClick={onClose} className="ui-text-faint hover:text-white">
            <FaTimes />
          </button>
        </div>
        <div className="p-4 overflow-y-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {SHORTCUT_CATEGORIES.map((category) => (
              <div key={category.title} className="ui-surface rounded-lg p-3 border">
                <h3 className="text-sm font-semibold text-[var(--ui-text)] mb-2 pb-2 border-b border-[var(--ui-border)]">
                  {category.title}
                </h3>
                <div className="space-y-1">
                  {category.shortcuts.map((shortcut) => (
                    <div key={shortcut.key} className="flex items-center justify-between text-sm">
                      <span className="ui-text-faint">{shortcut.description}</span>
                      <kbd className="px-2 py-0.5 ui-surface-2 rounded text-xs font-mono text-[var(--ui-text)] ml-2 whitespace-nowrap">
                        {shortcut.key}
                      </kbd>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="p-3 border-t border-[var(--ui-border)] text-center">
          <span className="text-xs ui-text-faint">Press <kbd className="px-1.5 py-0.5 ui-surface-2 rounded text-xs font-mono text-[var(--ui-text)]">?</kbd> or <kbd className="px-1.5 py-0.5 ui-surface-2 rounded text-xs font-mono text-[var(--ui-text)]">Esc</kbd> to close</span>
        </div>
      </div>
    </div>
  );
};
