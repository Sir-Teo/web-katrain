import { readLocalStorage, writeLocalStorage } from './storage';

export type ShortcutCategory =
  | 'Navigation'
  | 'Edit'
  | 'Game Control'
  | 'Visualization'
  | 'Analysis'
  | 'File Operations'
  | 'Modals'
  | 'View';

export type ShortcutBinding = {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
};

export type ShortcutDefinition = {
  id: string;
  category: ShortcutCategory;
  label: string;
  defaultBindings: ShortcutBinding[];
};

export type ShortcutOverrides = Record<string, ShortcutBinding[] | null>;
export type ShortcutWithBindings = ShortcutDefinition & { bindings: ShortcutBinding[] | null };
export type ShortcutGroup = { title: ShortcutCategory; shortcuts: ShortcutWithBindings[] };

const STORAGE_KEY = 'web-katrain:shortcuts:v1';
export const SHORTCUTS_UPDATED_EVENT = 'web-katrain:shortcuts-updated';

export const SHORTCUT_DEFINITIONS: ShortcutDefinition[] = [
  { id: 'nav-back', category: 'Navigation', label: 'Previous move', defaultBindings: [{ key: 'ArrowLeft' }, { key: 'z' }] },
  { id: 'nav-forward', category: 'Navigation', label: 'Next move', defaultBindings: [{ key: 'ArrowRight' }, { key: 'x' }] },
  { id: 'nav-back-10', category: 'Navigation', label: 'Back 10 moves', defaultBindings: [{ key: 'ArrowLeft', shift: true }] },
  { id: 'nav-forward-10', category: 'Navigation', label: 'Forward 10 moves', defaultBindings: [{ key: 'ArrowRight', shift: true }] },
  { id: 'nav-start', category: 'Navigation', label: 'Go to start', defaultBindings: [{ key: 'Home' }] },
  { id: 'nav-end', category: 'Navigation', label: 'Go to end', defaultBindings: [{ key: 'End' }] },
  { id: 'branch-prev', category: 'Navigation', label: 'Previous branch', defaultBindings: [{ key: 'ArrowUp' }] },
  { id: 'branch-next', category: 'Navigation', label: 'Next branch', defaultBindings: [{ key: 'ArrowDown' }] },
  { id: 'make-main-branch', category: 'Navigation', label: 'Make current branch main', defaultBindings: [{ key: 'PageUp' }] },
  { id: 'undo-branch-point', category: 'Navigation', label: 'Undo to branch point', defaultBindings: [{ key: 'b' }] },
  { id: 'undo-main-branch', category: 'Navigation', label: 'Undo to main branch', defaultBindings: [{ key: 'b', shift: true }] },
  { id: 'edit-undo', category: 'Edit', label: 'Undo edit', defaultBindings: [{ key: 'z', ctrl: true }] },
  { id: 'edit-redo', category: 'Edit', label: 'Redo edit', defaultBindings: [{ key: 'z', ctrl: true, shift: true }, { key: 'y', ctrl: true }] },
  { id: 'edit-note', category: 'Edit', label: 'Edit current note', defaultBindings: [{ key: 'c' }] },
  { id: 'pass', category: 'Game Control', label: 'Pass', defaultBindings: [{ key: 'p' }] },
  { id: 'ai-move', category: 'Game Control', label: 'AI move', defaultBindings: [{ key: 'Enter' }] },
  { id: 'selfplay', category: 'Game Control', label: 'Selfplay to end', defaultBindings: [{ key: 'l' }] },
  { id: 'rotate-board', category: 'Game Control', label: 'Rotate board', defaultBindings: [{ key: 'o' }] },
  { id: 'toggle-sound', category: 'Game Control', label: 'Toggle sound', defaultBindings: [{ key: 'm', shift: true }] },
  { id: 'toggle-scoring', category: 'Game Control', label: 'Score position', defaultBindings: [{ key: 's', shift: true }] },
  { id: 'toggle-edit-mode', category: 'Game Control', label: 'Toggle edit mode', defaultBindings: [{ key: 'e', shift: true }] },
  { id: 'toggle-insert', category: 'Game Control', label: 'Toggle insert mode', defaultBindings: [{ key: 'i' }] },
  { id: 'toggle-children', category: 'Visualization', label: 'Toggle children', defaultBindings: [{ key: 'q' }] },
  { id: 'toggle-eval', category: 'Visualization', label: 'Toggle eval dots', defaultBindings: [{ key: 'w' }] },
  { id: 'toggle-hints', category: 'Visualization', label: 'Toggle top moves', defaultBindings: [{ key: 'e' }] },
  { id: 'toggle-policy', category: 'Visualization', label: 'Toggle policy', defaultBindings: [{ key: 'r' }] },
  { id: 'cycle-policy-metric', category: 'Visualization', label: 'Cycle policy metric', defaultBindings: [{ key: 'r', shift: true }] },
  { id: 'toggle-territory', category: 'Visualization', label: 'Toggle territory', defaultBindings: [{ key: 't' }] },
  { id: 'toggle-next-move-preview', category: 'Visualization', label: 'Toggle next move preview', defaultBindings: [{ key: 'v' }] },
  { id: 'toggle-coordinates', category: 'Visualization', label: 'Toggle coordinates', defaultBindings: [{ key: 'k' }] },
  { id: 'toggle-move-numbers', category: 'Visualization', label: 'Toggle move numbers', defaultBindings: [{ key: 'm' }] },
  { id: 'toggle-analysis', category: 'Analysis', label: 'Toggle analysis mode', defaultBindings: [{ key: 'Tab' }] },
  { id: 'continuous-analysis', category: 'Analysis', label: 'Continuous analysis', defaultBindings: [{ key: 'Space' }] },
  { id: 'analysis-extra', category: 'Analysis', label: 'Extra analysis', defaultBindings: [{ key: 'a' }] },
  { id: 'analysis-equalize', category: 'Analysis', label: 'Equalize', defaultBindings: [{ key: 's' }] },
  { id: 'analysis-sweep', category: 'Analysis', label: 'Sweep', defaultBindings: [{ key: 'd' }] },
  { id: 'analysis-alternative', category: 'Analysis', label: 'Alternative', defaultBindings: [{ key: 'f' }] },
  { id: 'select-region', category: 'Analysis', label: 'Select region', defaultBindings: [{ key: 'g' }] },
  { id: 'reset-analysis', category: 'Analysis', label: 'Reset analysis', defaultBindings: [{ key: 'h' }] },
  { id: 'next-mistake', category: 'Analysis', label: 'Next mistake', defaultBindings: [{ key: 'n' }] },
  { id: 'prev-mistake', category: 'Analysis', label: 'Previous mistake', defaultBindings: [{ key: 'n', shift: true }] },
  { id: 'new-game', category: 'File Operations', label: 'New game', defaultBindings: [{ key: 'n', ctrl: true }] },
  { id: 'save-sgf', category: 'File Operations', label: 'Save SGF', defaultBindings: [{ key: 's', ctrl: true }] },
  { id: 'save-library', category: 'File Operations', label: 'Save copy to library', defaultBindings: [{ key: 's', ctrl: true, shift: true }] },
  { id: 'open-sgf', category: 'File Operations', label: 'Load SGF / Photo / Model', defaultBindings: [{ key: 'o', ctrl: true }] },
  { id: 'toggle-library', category: 'File Operations', label: 'Toggle library', defaultBindings: [{ key: 'l', ctrl: true }] },
  { id: 'toggle-sidebar', category: 'File Operations', label: 'Toggle sidebar', defaultBindings: [{ key: 'b', ctrl: true }] },
  { id: 'copy-sgf', category: 'File Operations', label: 'Copy SGF', defaultBindings: [{ key: 'c', ctrl: true }] },
  { id: 'paste-sgf', category: 'File Operations', label: 'Paste SGF / OGS URL', defaultBindings: [{ key: 'v', ctrl: true }] },
  { id: 'command-palette', category: 'Modals', label: 'Command palette', defaultBindings: [{ key: 'k', ctrl: true }] },
  { id: 'keyboard-help', category: 'Modals', label: 'Keyboard shortcuts', defaultBindings: [{ key: '?' }, { key: '/', shift: true }] },
  { id: 'game-analysis-modal', category: 'Modals', label: 'Game re-analysis', defaultBindings: [{ key: 'F2' }] },
  { id: 'game-report-modal', category: 'Modals', label: 'Game report', defaultBindings: [{ key: 'F3' }] },
  { id: 'settings-modal', category: 'Modals', label: 'Settings', defaultBindings: [{ key: ',', ctrl: true }, { key: 'F8' }] },
  { id: 'escape', category: 'Modals', label: 'Close / cancel', defaultBindings: [{ key: 'Escape' }] },
  { id: 'toggle-top-bar', category: 'View', label: 'Toggle top bar', defaultBindings: [{ key: 'm', ctrl: true, shift: true }] },
  { id: 'toggle-bottom-bar', category: 'View', label: 'Toggle bottom controls', defaultBindings: [{ key: 'u', ctrl: true, shift: true }] },
  { id: 'fullscreen', category: 'View', label: 'Toggle fullscreen', defaultBindings: [{ key: 'F11' }] },
];

const shortcutById = new Map(SHORTCUT_DEFINITIONS.map((shortcut) => [shortcut.id, shortcut]));

const normalizeKey = (key: string): string => {
  if (key === ' ') return 'Space';
  if (key === 'Spacebar') return 'Space';
  if (key === 'Esc') return 'Escape';
  return key.length === 1 ? key.toLowerCase() : key;
};

const normalizeBinding = (binding: ShortcutBinding): ShortcutBinding => ({
  key: normalizeKey(binding.key),
  ctrl: !!binding.ctrl,
  shift: !!binding.shift,
  alt: !!binding.alt,
});

const displayKey = (key: string): string => {
  switch (key) {
    case 'ArrowLeft':
      return '←';
    case 'ArrowRight':
      return '→';
    case 'ArrowUp':
      return '↑';
    case 'ArrowDown':
      return '↓';
    case 'Escape':
      return 'Esc';
    case 'PageUp':
      return 'PgUp';
    case 'PageDown':
      return 'PgDn';
    case 'Delete':
      return 'Del';
    case 'Space':
      return 'Space';
    default:
      return key.length === 1 ? key.toUpperCase() : key;
  }
};

const bindingKey = (binding: ShortcutBinding): string => {
  const b = normalizeBinding(binding);
  return `${b.ctrl ? 'C' : '-'}${b.shift ? 'S' : '-'}${b.alt ? 'A' : '-'}:${b.key}`;
};

export const bindingToDisplay = (binding: ShortcutBinding): string => {
  const b = normalizeBinding(binding);
  const parts: string[] = [];
  if (b.ctrl) parts.push('Ctrl');
  if (b.shift) parts.push('Shift');
  if (b.alt) parts.push('Alt');
  parts.push(displayKey(b.key));
  return parts.join('+');
};

export const shortcutDisplay = (bindings: ShortcutBinding[] | null): string =>
  bindings === null ? 'Disabled' : bindings.map(bindingToDisplay).join(' / ');

export const loadShortcutOverrides = (): ShortcutOverrides => {
  try {
    const raw = readLocalStorage(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    const out: ShortcutOverrides = {};
    for (const [id, value] of Object.entries(parsed)) {
      if (!shortcutById.has(id)) continue;
      if (value === null) {
        out[id] = null;
      } else if (Array.isArray(value)) {
        out[id] = value
          .filter((v): v is ShortcutBinding => !!v && typeof v === 'object' && typeof v.key === 'string')
          .map(normalizeBinding);
      }
    }
    return out;
  } catch {
    return {};
  }
};

export const saveShortcutOverrides = (overrides: ShortcutOverrides): void => {
  if (writeLocalStorage(STORAGE_KEY, JSON.stringify(overrides))) {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(SHORTCUTS_UPDATED_EVENT));
    }
  }
};

export const getShortcutBindings = (id: string, overrides = loadShortcutOverrides()): ShortcutBinding[] | null => {
  if (Object.prototype.hasOwnProperty.call(overrides, id)) {
    const override = overrides[id];
    return override === null ? null : override.map(normalizeBinding);
  }
  return shortcutById.get(id)?.defaultBindings.map(normalizeBinding) ?? null;
};

export const getShortcutGroups = (overrides = loadShortcutOverrides()): ShortcutGroup[] => {
  const groups = new Map<ShortcutCategory, ShortcutWithBindings[]>();
  for (const definition of SHORTCUT_DEFINITIONS) {
    const list = groups.get(definition.category) ?? [];
    list.push({ ...definition, bindings: getShortcutBindings(definition.id, overrides) });
    groups.set(definition.category, list);
  }
  return Array.from(groups.entries()).map(([title, shortcuts]) => ({ title, shortcuts }));
};

export const filterShortcutGroups = (groups: ShortcutGroup[], query: string): ShortcutGroup[] => {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return groups;
  return groups
    .map((group) => ({
      ...group,
      shortcuts: group.shortcuts.filter((shortcut) => {
        const textHaystack = [
          group.title,
          shortcut.label,
          shortcut.id,
        ].join(' ').toLowerCase();
        const bindingDisplay = shortcutDisplay(shortcut.bindings).toLowerCase();
        const bindingMatches = normalizedQuery.includes('+')
          ? bindingDisplay.split('/').some((binding) => binding.trim() === normalizedQuery)
          : bindingDisplay.includes(normalizedQuery);
        return textHaystack.includes(normalizedQuery) || bindingMatches;
      }),
    }))
    .filter((group) => group.shortcuts.length > 0);
};

export const eventToShortcutBinding = (event: KeyboardEvent | React.KeyboardEvent): ShortcutBinding | null => {
  const key = normalizeKey(event.key);
  if (key === 'Control' || key === 'Meta' || key === 'Shift' || key === 'Alt') return null;
  return {
    key,
    ctrl: event.ctrlKey || event.metaKey,
    shift: event.shiftKey,
    alt: event.altKey,
  };
};

export const isShortcutRecordingCancelKey = (event: KeyboardEvent | React.KeyboardEvent): boolean =>
  normalizeKey(event.key) === 'Escape';

export const eventMatchesBinding = (event: KeyboardEvent, binding: ShortcutBinding): boolean => {
  const b = normalizeBinding(binding);
  const key = normalizeKey(event.key);
  return key === b.key && (event.ctrlKey || event.metaKey) === !!b.ctrl && event.shiftKey === !!b.shift && event.altKey === !!b.alt;
};

export const eventMatchesShortcut = (event: KeyboardEvent, id: string, overrides = loadShortcutOverrides()): boolean => {
  const bindings = getShortcutBindings(id, overrides);
  if (!bindings) return false;
  return bindings.some((binding) => eventMatchesBinding(event, binding));
};

export const findShortcutCollision = (
  binding: ShortcutBinding,
  currentId: string,
  overrides = loadShortcutOverrides()
): ShortcutDefinition | null => {
  const key = bindingKey(binding);
  for (const definition of SHORTCUT_DEFINITIONS) {
    if (definition.id === currentId) continue;
    const bindings = getShortcutBindings(definition.id, overrides);
    if (!bindings) continue;
    if (bindings.some((candidate) => bindingKey(candidate) === key)) return definition;
  }
  return null;
};

export const createShortcutCollisionReplacement = (
  overrides: ShortcutOverrides,
  currentId: string,
  conflictingId: string,
  binding: ShortcutBinding
): ShortcutOverrides => {
  const next: ShortcutOverrides = { ...overrides };
  const normalizedBinding = normalizeBinding(binding);
  const collisionKey = bindingKey(normalizedBinding);
  const conflictingBindings = getShortcutBindings(conflictingId, overrides);
  const remainingConflictingBindings = conflictingBindings?.filter(
    (candidate) => bindingKey(candidate) !== collisionKey
  );

  next[conflictingId] =
    remainingConflictingBindings && remainingConflictingBindings.length > 0
      ? remainingConflictingBindings.map(normalizeBinding)
      : null;
  next[currentId] = [normalizedBinding];
  return next;
};

export const setShortcutOverride = (id: string, bindings: ShortcutBinding[] | null): void => {
  const overrides = loadShortcutOverrides();
  overrides[id] = bindings === null ? null : bindings.map(normalizeBinding);
  saveShortcutOverrides(overrides);
};

export const replaceShortcutCollisionOverride = (
  currentId: string,
  conflictingId: string,
  binding: ShortcutBinding
): void => {
  const overrides = loadShortcutOverrides();
  saveShortcutOverrides(createShortcutCollisionReplacement(overrides, currentId, conflictingId, binding));
};

export const resetShortcutOverride = (id: string): void => {
  const overrides = loadShortcutOverrides();
  delete overrides[id];
  saveShortcutOverrides(overrides);
};

export const resetAllShortcutOverrides = (): void => {
  saveShortcutOverrides({});
};
