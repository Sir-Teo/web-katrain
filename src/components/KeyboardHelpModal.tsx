import React from 'react';
import { FaTimes } from 'react-icons/fa';
import { getShortcutGroups, shortcutDisplay } from '../utils/shortcuts';

interface KeyboardHelpModalProps {
  onClose: () => void;
}

export const KeyboardHelpModal: React.FC<KeyboardHelpModalProps> = ({ onClose }) => {
  const groups = getShortcutGroups();
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 sm:p-6 mobile-safe-inset mobile-safe-area-bottom">
      <div className="ui-panel rounded-lg shadow-xl w-[92vw] max-w-[800px] max-h-[90dvh] overflow-hidden flex flex-col border">
        <div className="flex items-center justify-between p-4 border-b border-[var(--ui-border)] ui-bar">
          <h2 className="text-lg font-semibold text-[var(--ui-text)]">Keyboard Shortcuts</h2>
          <button onClick={onClose} className="ui-text-faint hover:text-white">
            <FaTimes />
          </button>
        </div>
        <div className="p-4 overflow-y-auto overscroll-contain">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {groups.map((category) => (
              <div key={category.title} className="ui-surface rounded-lg p-3 border">
                <h3 className="text-sm font-semibold text-[var(--ui-text)] mb-2 pb-2 border-b border-[var(--ui-border)]">
                  {category.title}
                </h3>
                <div className="space-y-1">
                  {category.shortcuts.map((shortcut) => (
                    <div key={shortcut.id} className="flex items-center justify-between text-sm">
                      <span className="ui-text-faint">{shortcut.label}</span>
                      <kbd className="px-2 py-0.5 ui-surface-2 rounded text-xs font-mono text-[var(--ui-text)] ml-2 whitespace-nowrap">
                        {shortcutDisplay(shortcut.bindings)}
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
