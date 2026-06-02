import React from 'react';
import { FaSearch, FaTimes } from 'react-icons/fa';
import {
  getShortcutBindings,
  loadShortcutOverrides,
  SHORTCUTS_UPDATED_EVENT,
  shortcutDisplay,
} from '../utils/shortcuts';
import { normalizeCommandQuery, scoreCommandMatch } from '../utils/commandPalette';
import { useEscapeToClose } from '../hooks/useEscapeToClose';

export type CommandPaletteCommand = {
  id: string;
  label: string;
  category: string;
  run: () => void;
  shortcutId?: string;
  keywords?: string[];
};

interface CommandPaletteModalProps {
  commands: CommandPaletteCommand[];
  onClose: () => void;
}

export const CommandPaletteModal: React.FC<CommandPaletteModalProps> = ({ commands, onClose }) => {
  useEscapeToClose(onClose);
  const [query, setQuery] = React.useState('');
  const [activeIndex, setActiveIndex] = React.useState(0);
  const [overrides, setOverrides] = React.useState(() => loadShortcutOverrides());
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    inputRef.current?.focus();
  }, []);

  React.useEffect(() => {
    const refresh = () => setOverrides(loadShortcutOverrides());
    window.addEventListener(SHORTCUTS_UPDATED_EVENT, refresh);
    return () => window.removeEventListener(SHORTCUTS_UPDATED_EVENT, refresh);
  }, []);

  const shortcutLabels = React.useMemo(() => {
    const labels = new Map<string, string>();
    for (const command of commands) {
      if (!command.shortcutId || labels.has(command.shortcutId)) continue;
      labels.set(command.shortcutId, shortcutDisplay(getShortcutBindings(command.shortcutId, overrides)));
    }
    return labels;
  }, [commands, overrides]);

  const filteredCommands = React.useMemo(() => {
    const normalizedQuery = normalizeCommandQuery(query);
    if (!normalizedQuery) return commands;
    return commands.flatMap((command, index) => {
      const shortcut = command.shortcutId ? shortcutLabels.get(command.shortcutId) : '';
      const score = scoreCommandMatch({
        label: command.label,
        category: command.category,
        id: command.id,
        shortcut,
        keywords: command.keywords,
      }, normalizedQuery);
      return score === null ? [] : [{ command, index, score }];
    })
      .sort((a, b) => a.score - b.score || a.index - b.index)
      .map((entry) => entry.command);
  }, [commands, query, shortcutLabels]);

  React.useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  React.useEffect(() => {
    if (activeIndex >= filteredCommands.length) {
      setActiveIndex(Math.max(0, filteredCommands.length - 1));
    }
  }, [activeIndex, filteredCommands.length]);

  const runCommand = React.useCallback((command: CommandPaletteCommand) => {
    onClose();
    command.run();
  }, [onClose]);

  const activeCommand = filteredCommands[activeIndex] ?? null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-3 pt-[8dvh] sm:p-6 sm:pt-[12vh] mobile-safe-inset mobile-safe-area-bottom">
      <div
        className="ui-panel w-[94vw] max-w-2xl overflow-hidden rounded-lg border shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="command-palette-title"
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            setActiveIndex((index) => Math.min(Math.max(0, filteredCommands.length - 1), index + 1));
            return;
          }
          if (event.key === 'ArrowUp') {
            event.preventDefault();
            setActiveIndex((index) => Math.max(0, index - 1));
            return;
          }
          if (event.key === 'Enter' && activeCommand) {
            event.preventDefault();
            runCommand(activeCommand);
          }
        }}
        data-command-palette="true"
      >
        <div className="ui-bar flex items-center justify-between gap-3 border-b border-[var(--ui-border)] p-4">
          <div className="min-w-0">
            <h2 id="command-palette-title" className="text-lg font-semibold text-[var(--ui-text)]">
              Command Palette
            </h2>
            <div className="mt-0.5 text-xs ui-text-faint" aria-live="polite" data-command-palette-count="true">
              {filteredCommands.length} command{filteredCommands.length === 1 ? '' : 's'}
            </div>
          </div>
          <button
            type="button"
            className="ui-control grid shrink-0 place-items-center rounded-lg text-[var(--ui-text-muted)] hover:bg-[var(--ui-surface-2)] hover:text-[var(--ui-text)]"
            onClick={onClose}
            aria-label="Close command palette"
          >
            <FaTimes aria-hidden="true" />
          </button>
        </div>
        <div className="p-3">
          <label className="relative block">
            <FaSearch
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ui-text-faint)]"
              aria-hidden="true"
              size={12}
            />
            <input
              ref={inputRef}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.currentTarget.value)}
              className="ui-input h-11 w-full rounded-lg border py-2 pl-8 pr-9 text-sm text-[var(--ui-text)]"
              placeholder="Search commands"
              aria-label="Search commands"
              data-command-palette-search="true"
            />
            {query && (
              <button
                type="button"
                className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded text-[var(--ui-text-muted)] hover:bg-[var(--ui-surface-2)] hover:text-[var(--ui-text)]"
                onClick={() => setQuery('')}
                aria-label="Clear command search"
              >
                <FaTimes aria-hidden="true" size={11} />
              </button>
            )}
          </label>
        </div>
        <div className="max-h-[56dvh] overflow-y-auto overscroll-contain px-3 pb-3" role="listbox" aria-label="Commands">
          {filteredCommands.length === 0 ? (
            <div className="ui-surface rounded-lg border p-4 text-sm ui-text-muted" data-command-palette-empty="true">
              No commands match "{query.trim()}".
            </div>
          ) : (
            <div className="space-y-1">
              {filteredCommands.map((command, index) => {
                const selected = index === activeIndex;
                const shortcut = command.shortcutId ? shortcutLabels.get(command.shortcutId) : null;
                return (
                  <button
                    key={command.id}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    className={[
                      'flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors',
                      selected
                        ? 'border-[var(--ui-accent)] bg-[var(--ui-accent-soft)] text-[var(--ui-text)]'
                        : 'border-transparent hover:border-[var(--ui-border)] hover:bg-[var(--ui-surface-2)]',
                    ].join(' ')}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => runCommand(command)}
                    data-command-palette-item={command.id}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-[var(--ui-text)]">{command.label}</span>
                      <span className="mt-0.5 block truncate text-xs ui-text-faint">{command.category}</span>
                    </span>
                    {shortcut && (
                      <kbd className="shrink-0 rounded ui-surface-2 px-2 py-0.5 text-xs font-mono text-[var(--ui-text)]">
                        {shortcut}
                      </kbd>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
