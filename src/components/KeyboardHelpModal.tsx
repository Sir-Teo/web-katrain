import React from 'react';
import { FaCog, FaGamepad, FaMouse, FaSearch, FaTimes } from 'react-icons/fa';
import {
  filterShortcutGroups,
  getShortcutBindings,
  getShortcutGroups,
  loadShortcutOverrides,
  SHORTCUTS_UPDATED_EVENT,
  shortcutDisplay,
} from '../utils/shortcuts';
import { useEscapeToClose } from '../hooks/useEscapeToClose';
import { useInitialDialogFocus } from '../hooks/useInitialDialogFocus';
import { filterKeyboardReferenceItems } from '../utils/keyboardHelp';

interface KeyboardHelpModalProps {
  onClose: () => void;
  onOpenShortcutSettings?: () => void;
  returnFocus?: HTMLElement | null;
}

const GAMEPAD_HELP = [
  // The D-pad and both sticks map to the same four commands in
  // getGamepadNavigationInput, so they are one row rather than two identical ones.
  { control: 'D-pad / either stick', action: 'Previous/next move, previous/next branch' },
  { control: 'LB / RB', action: 'Back/forward 10 moves' },
  { control: 'Select / Start', action: 'Go to start/end' },
  { control: 'B / A', action: 'Previous/next move' },
] as const;

const POINTER_HELP = [
  { control: 'Pinch', action: 'Zoom the board on touch screens' },
  { control: 'Wheel', action: 'Previous/next move over the board or move tree' },
  { control: 'Shift + wheel', action: 'Previous/next mistake over the board or move tree' },
] as const;

export const KeyboardHelpModal: React.FC<KeyboardHelpModalProps> = ({ onClose, onOpenShortcutSettings, returnFocus }) => {
  useEscapeToClose(onClose);
  const dialogRef = useInitialDialogFocus<HTMLDivElement>(true, { returnFocus });
  const [overrides, setOverrides] = React.useState(() => loadShortcutOverrides());
  const [query, setQuery] = React.useState('');

  React.useEffect(() => {
    const refresh = () => setOverrides(loadShortcutOverrides());
    window.addEventListener(SHORTCUTS_UPDATED_EVENT, refresh);
    return () => window.removeEventListener(SHORTCUTS_UPDATED_EVENT, refresh);
  }, []);

  const groups = React.useMemo(() => getShortcutGroups(overrides), [overrides]);
  const normalizedQuery = query.trim().toLowerCase();
  const visibleGroups = React.useMemo(
    () => filterShortcutGroups(groups, normalizedQuery),
    [groups, normalizedQuery]
  );
  const visibleShortcutCount = visibleGroups.reduce((count, group) => count + group.shortcuts.length, 0);
  const visibleGamepadHelp = React.useMemo(
    () => filterKeyboardReferenceItems(GAMEPAD_HELP, normalizedQuery),
    [normalizedQuery]
  );
  const visiblePointerHelp = React.useMemo(
    () => filterKeyboardReferenceItems(POINTER_HELP, normalizedQuery),
    [normalizedQuery]
  );
  const visibleResultCount = visibleShortcutCount + visibleGamepadHelp.length + visiblePointerHelp.length;
  const helpShortcutLabel = shortcutDisplay(getShortcutBindings('keyboard-help', overrides));
  const closeShortcutLabel = shortcutDisplay(getShortcutBindings('escape', overrides));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 sm:p-6 mobile-safe-inset mobile-safe-area-bottom">
      <div
        className="ui-panel rounded-lg shadow-xl w-[92vw] max-w-[800px] max-h-[90dvh] overflow-hidden flex flex-col border"
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="keyboard-help-title"
      >
        <div className="flex items-center justify-between p-4 border-b border-[var(--ui-border)] ui-bar">
          {/* The header compacts below 360px, but a viewport threshold cannot
              know the reader enlarged their text: at 200% on a 375px phone the
              controls kept their full width and squeezed the title to 7px of
              the 161px it needs. Claim the leftover space and ellipsize instead
              of hard-clipping, so this degrades at any width and text size. */}
          <div className="min-w-0 flex-1">
            <h2 id="keyboard-help-title" className="keyboard-help-title truncate font-semibold text-[var(--ui-text)]">
              Keyboard Shortcuts
            </h2>
            <div className="mt-0.5 truncate text-xs ui-text-faint" aria-live="polite" data-keyboard-help-count="true">
              {normalizedQuery
                ? `${visibleResultCount} result${visibleResultCount === 1 ? '' : 's'}`
                : `${visibleShortcutCount} command${visibleShortcutCount === 1 ? '' : 's'}`}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {onOpenShortcutSettings && (
              <button
                type="button"
                className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-surface)] px-3 text-xs font-semibold text-[var(--ui-text-muted)] transition-colors hover:border-[var(--ui-accent)] hover:text-[var(--ui-text)]"
                onClick={onOpenShortcutSettings}
                aria-label="Customize keyboard shortcuts"
                data-keyboard-help-customize="true"
              >
                <FaCog aria-hidden="true" size={12} />
                <span className="keyboard-help-customize-label" aria-hidden="true">Customize</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="ui-control grid shrink-0 place-items-center rounded-lg text-[var(--ui-text-muted)] hover:bg-[var(--ui-surface-2)] hover:text-[var(--ui-text)]"
              aria-label="Close keyboard shortcuts"
            >
              <FaTimes aria-hidden="true" />
            </button>
          </div>
        </div>
        <div className="p-4 overflow-y-auto overscroll-contain">
          <label className="relative mb-4 block">
            <FaSearch
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ui-text-faint)]"
              aria-hidden="true"
              size={12}
            />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.currentTarget.value)}
              className="ui-input h-11 w-full rounded-lg border py-2 pl-8 pr-12 text-sm text-[var(--ui-text)]"
              placeholder="Search shortcuts"
              aria-label="Search shortcuts"
              data-keyboard-help-search="true"
            />
            {query && (
              <button
                type="button"
                className="absolute right-1 top-1/2 grid min-h-11 min-w-11 -translate-y-1/2 place-items-center rounded-lg text-[var(--ui-text-muted)] hover:bg-[var(--ui-surface-2)] hover:text-[var(--ui-text)]"
                onClick={() => setQuery('')}
                aria-label="Clear shortcut search"
              >
                <FaTimes aria-hidden="true" size={11} />
              </button>
            )}
          </label>
          {(visibleGamepadHelp.length > 0 || visiblePointerHelp.length > 0) && (
          <div className="mb-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
            {visiblePointerHelp.length > 0 && (
            <section className="ui-surface rounded-lg border p-3" data-keyboard-help-pointer="true">
              <div className="mb-2 flex items-center gap-2 border-b border-[var(--ui-border)] pb-2">
                <FaMouse aria-hidden="true" className="text-[var(--ui-accent)]" />
                <h3 className="text-sm font-semibold text-[var(--ui-text)]">Touch / Trackpad / Mouse</h3>
              </div>
              <div className="grid grid-cols-1 gap-1">
                {visiblePointerHelp.map((item) => (
                  <div key={item.control} className="flex items-center justify-between gap-3 rounded-md bg-[var(--ui-surface-2)] px-2 py-1.5 text-sm">
                    <span className="ui-text-faint">{item.action}</span>
                    <kbd className="shrink-0 rounded bg-[var(--ui-panel)] px-2 py-0.5 text-xs font-mono text-[var(--ui-text)]">
                      {item.control}
                    </kbd>
                  </div>
                ))}
              </div>
            </section>
            )}
            {visibleGamepadHelp.length > 0 && (
            <section className="ui-surface rounded-lg border p-3" data-keyboard-help-gamepad="true">
              <div className="mb-2 flex items-center gap-2 border-b border-[var(--ui-border)] pb-2">
                <FaGamepad aria-hidden="true" className="text-[var(--ui-accent)]" />
                <h3 className="text-sm font-semibold text-[var(--ui-text)]">Gamepad</h3>
              </div>
              <div className="grid grid-cols-1 gap-1">
                {visibleGamepadHelp.map((item) => (
                  <div key={item.control} className="flex items-center justify-between gap-3 rounded-md bg-[var(--ui-surface-2)] px-2 py-1.5 text-sm">
                    <span className="ui-text-faint">{item.action}</span>
                    <kbd className="shrink-0 rounded bg-[var(--ui-panel)] px-2 py-0.5 text-xs font-mono text-[var(--ui-text)]">
                      {item.control}
                    </kbd>
                  </div>
                ))}
              </div>
            </section>
            )}
          </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {visibleGroups.map((category) => (
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
          {normalizedQuery && visibleResultCount === 0 && (
            <div className="ui-surface rounded-lg border p-4 text-sm ui-text-muted" data-keyboard-help-empty="true">
              No shortcuts match "{query.trim()}".
            </div>
          )}
        </div>
        {/* Keys the device may not have: on touch the X beside the title is the
            way out, and the app hides keyboard hints elsewhere on mobile too. */}
        <div className="mobile-shortcut-hint p-3 border-t border-[var(--ui-border)] text-center">
          <span className="text-xs ui-text-faint">
            Press{' '}
            <kbd className="px-1.5 py-0.5 ui-surface-2 rounded text-xs font-mono text-[var(--ui-text)]">
              {helpShortcutLabel}
            </kbd>{' '}
            or{' '}
            <kbd className="px-1.5 py-0.5 ui-surface-2 rounded text-xs font-mono text-[var(--ui-text)]">
              {closeShortcutLabel}
            </kbd>{' '}
            to close
          </span>
        </div>
      </div>
    </div>
  );
};
