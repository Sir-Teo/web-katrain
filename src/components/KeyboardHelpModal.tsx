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
      { key: 'Ctrl+V', description: 'Paste SGF' },
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-slate-800 rounded-lg shadow-xl w-[800px] max-w-[95vw] max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-slate-700/50">
          <h2 className="text-lg font-semibold text-white">Keyboard Shortcuts</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <FaTimes />
          </button>
        </div>
        <div className="p-4 overflow-y-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {SHORTCUT_CATEGORIES.map((category) => (
              <div key={category.title} className="bg-slate-900 rounded-lg p-3 border border-slate-700/50">
                <h3 className="text-sm font-semibold text-slate-200 mb-2 pb-2 border-b border-slate-700/50">
                  {category.title}
                </h3>
                <div className="space-y-1">
                  {category.shortcuts.map((shortcut) => (
                    <div key={shortcut.key} className="flex items-center justify-between text-sm">
                      <span className="text-slate-400">{shortcut.description}</span>
                      <kbd className="px-2 py-0.5 bg-slate-700 rounded text-xs font-mono text-slate-200 ml-2 whitespace-nowrap">
                        {shortcut.key}
                      </kbd>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="p-3 border-t border-slate-700/50 text-center">
          <span className="text-xs text-slate-500">Press <kbd className="px-1.5 py-0.5 bg-slate-700 rounded text-xs font-mono text-slate-300">?</kbd> or <kbd className="px-1.5 py-0.5 bg-slate-700 rounded text-xs font-mono text-slate-300">Esc</kbd> to close</span>
        </div>
      </div>
    </div>
  );
};
