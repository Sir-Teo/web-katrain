import React from 'react';
import { FaSearch, FaTimes } from 'react-icons/fa';
import {
  bindingToDisplay,
  createShortcutCollisionReplacement,
  eventToShortcutBinding,
  filterShortcutGroups,
  filterShortcutGroupsByStatus,
  findShortcutCollision,
  getShortcutBindings,
  getShortcutGroups,
  isShortcutRecordingCancelKey,
  loadShortcutOverrides,
  replaceShortcutCollisionOverride,
  resetAllShortcutOverrides,
  resetShortcutOverride,
  setShortcutOverride,
  shortcutDisplay,
  type ShortcutBinding,
  type ShortcutStatusFilter,
} from '../utils/shortcuts';

const isBindingEmpty = (binding: ShortcutBinding | null): binding is null => !binding || !binding.key;

type ShortcutCollisionState = {
  binding: ShortcutBinding;
  conflictId: string;
  conflictLabel: string;
  message: string;
  targetId: string;
};

export const ShortcutSettingsPanel: React.FC = () => {
  const [overrides, setOverrides] = React.useState(() => loadShortcutOverrides());
  const [recordingId, setRecordingId] = React.useState<string | null>(null);
  const [collision, setCollision] = React.useState<ShortcutCollisionState | null>(null);
  const [confirmResetAll, setConfirmResetAll] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState<ShortcutStatusFilter>('all');

  const refresh = React.useCallback(() => setOverrides(loadShortcutOverrides()), []);
  const hasCustomizations = Object.keys(overrides).length > 0;
  const shortcutGroups = React.useMemo(() => getShortcutGroups(overrides), [overrides]);
  const normalizedQuery = query.trim().toLowerCase();
  const queryFilteredShortcutGroups = React.useMemo(
    () => filterShortcutGroups(shortcutGroups, normalizedQuery),
    [normalizedQuery, shortcutGroups]
  );
  const visibleShortcutGroups = React.useMemo(
    () => filterShortcutGroupsByStatus(queryFilteredShortcutGroups, statusFilter, overrides),
    [overrides, queryFilteredShortcutGroups, statusFilter]
  );
  const visibleShortcutCount = visibleShortcutGroups.reduce((count, group) => count + group.shortcuts.length, 0);
  const totalShortcutCount = shortcutGroups.reduce((count, group) => count + group.shortcuts.length, 0);
  const customShortcutCount = Object.keys(overrides).length;
  const disabledShortcutCount = Object.values(overrides).filter((binding) => binding === null).length;
  const filterOptions: Array<{ id: ShortcutStatusFilter; label: string; count: number }> = [
    { id: 'all', label: 'All', count: totalShortcutCount },
    { id: 'custom', label: 'Edited', count: customShortcutCount },
    { id: 'disabled', label: 'Disabled', count: disabledShortcutCount },
  ];

  React.useEffect(() => {
    if (!hasCustomizations) setConfirmResetAll(false);
  }, [hasCustomizations]);

  React.useEffect(() => {
    if (statusFilter === 'custom' && customShortcutCount === 0) setStatusFilter('all');
    if (statusFilter === 'disabled' && disabledShortcutCount === 0) setStatusFilter('all');
  }, [customShortcutCount, disabledShortcutCount, statusFilter]);

  const handleRecordEvent = React.useCallback((event: KeyboardEvent | React.KeyboardEvent) => {
    const id = recordingId;
    if (!id) return;
    event.preventDefault();
    event.stopPropagation();
    if (isShortcutRecordingCancelKey(event)) {
      setRecordingId(null);
      setCollision(null);
      setConfirmResetAll(false);
      return;
    }
    const binding = eventToShortcutBinding(event);
    if (isBindingEmpty(binding)) return;
    const conflict = findShortcutCollision(binding, id, overrides);
    if (conflict) {
      setRecordingId(null);
      setCollision({
        binding,
        conflictId: conflict.id,
        conflictLabel: conflict.label,
        message: `${bindingToDisplay(binding)} is already assigned to ${conflict.label}.`,
        targetId: id,
      });
      return;
    }
    setShortcutOverride(id, [binding]);
    setRecordingId(null);
    setCollision(null);
    setConfirmResetAll(false);
    refresh();
  }, [overrides, recordingId, refresh]);

  React.useEffect(() => {
    if (!recordingId) return;
    const handleKeyDown = (event: KeyboardEvent) => handleRecordEvent(event);
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [handleRecordEvent, recordingId]);

  const handleDisable = (id: string) => {
    setShortcutOverride(id, null);
    setCollision(null);
    setConfirmResetAll(false);
    refresh();
  };

  const handleReset = (id: string) => {
    resetShortcutOverride(id);
    setCollision(null);
    setConfirmResetAll(false);
    refresh();
  };

  const requestResetAll = () => {
    if (!hasCustomizations) return;
    setRecordingId(null);
    setCollision(null);
    setConfirmResetAll(true);
  };

  const handleResetAll = () => {
    resetAllShortcutOverrides();
    setCollision(null);
    setRecordingId(null);
    setConfirmResetAll(false);
    refresh();
  };

  const handleReplaceCollision = () => {
    if (!collision) return;
    replaceShortcutCollisionOverride(collision.targetId, collision.conflictId, collision.binding);
    setRecordingId(null);
    setCollision(null);
    setConfirmResetAll(false);
    refresh();
  };

  const previewReplacement = React.useMemo(() => {
    if (!collision) return null;
    return createShortcutCollisionReplacement(
      overrides,
      collision.targetId,
      collision.conflictId,
      collision.binding
    );
  }, [collision, overrides]);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border ui-surface p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-xs font-semibold ui-text-muted tracking-[0.12em] uppercase">Shortcut Editor</div>
            <div className="mt-1 text-sm ui-text-faint">Record one binding per command, disable commands you do not use, and resolve collisions before saving.</div>
          </div>
          <button
            type="button"
            className="px-3 py-2 rounded-lg ui-surface-2 border text-xs font-semibold text-[var(--ui-text-muted)] hover:text-[var(--ui-text)] disabled:opacity-40 disabled:cursor-not-allowed"
            onClick={requestResetAll}
            disabled={!hasCustomizations}
            data-shortcut-reset-all="true"
            title={hasCustomizations ? 'Reset custom shortcuts' : 'No custom shortcuts'}
          >
            Reset all
          </button>
        </div>
        {confirmResetAll && (
          <div
            className="mt-3 rounded-lg border border-[var(--ui-warning)] bg-[var(--ui-warning-soft)] px-3 py-2 text-sm text-[var(--ui-warning)]"
            data-shortcut-reset-confirm="true"
          >
            <div className="font-semibold">Reset custom shortcuts?</div>
            <div className="mt-1 text-xs">Custom bindings and disabled commands will return to their defaults.</div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="px-3 py-2 rounded-lg border border-[var(--ui-warning)] bg-[var(--ui-warning)] text-xs font-semibold text-black"
                onClick={handleResetAll}
              >
                Reset defaults
              </button>
              <button
                type="button"
                className="px-3 py-2 rounded-lg border ui-surface-2 text-xs font-semibold text-[var(--ui-text-muted)] hover:text-[var(--ui-text)]"
                onClick={() => setConfirmResetAll(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
        {collision && (
          <div
            className="mt-3 rounded-lg border border-[var(--ui-warning)] bg-[var(--ui-warning-soft)] px-3 py-2 text-sm text-[var(--ui-warning)]"
            data-shortcut-collision="true"
          >
            <div className="font-semibold">Shortcut conflict</div>
            <div className="mt-1">{collision.message}</div>
            <div className="mt-1 text-xs">
              Replace will assign {bindingToDisplay(collision.binding)} here and leave {collision.conflictLabel}{' '}
              {shortcutDisplay(getShortcutBindings(collision.conflictId, previewReplacement ?? overrides)).toLowerCase()}.
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="px-3 py-2 rounded-lg border border-[var(--ui-warning)] bg-[var(--ui-warning)] text-xs font-semibold text-black"
                onClick={handleReplaceCollision}
              >
                Replace
              </button>
              <button
                type="button"
                className="px-3 py-2 rounded-lg border ui-surface-2 text-xs font-semibold text-[var(--ui-text-muted)] hover:text-[var(--ui-text)]"
                onClick={() => {
                  setCollision(null);
                  setRecordingId(null);
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
          <label className="relative flex-1 min-w-0">
            <FaSearch
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ui-text-faint)]"
              aria-hidden="true"
              size={12}
            />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.currentTarget.value)}
              className="ui-input h-10 w-full rounded-lg border py-2 pl-8 pr-9 text-sm text-[var(--ui-text)]"
              placeholder="Search shortcuts"
              aria-label="Search shortcuts"
              data-shortcut-search="true"
            />
            {query && (
              <button
                type="button"
                className="absolute right-2 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded text-[var(--ui-text-muted)] hover:bg-[var(--ui-surface-2)] hover:text-[var(--ui-text)]"
                onClick={() => setQuery('')}
                aria-label="Clear shortcut search"
              >
                <FaTimes aria-hidden="true" size={11} />
              </button>
            )}
          </label>
          <div className="text-xs font-semibold ui-text-muted" aria-live="polite" data-shortcut-search-count="true">
            {visibleShortcutCount} command{visibleShortcutCount === 1 ? '' : 's'}
          </div>
        </div>
        <div className="mt-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap gap-2" aria-label="Shortcut filter">
            {filterOptions.map((option) => {
              const isActive = statusFilter === option.id;
              const isUnavailable = option.id !== 'all' && option.count === 0;
              return (
                <button
                  key={option.id}
                  type="button"
                  className={[
                    'rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-45',
                    isActive
                      ? 'border-[var(--ui-accent)] bg-[var(--ui-accent-soft)] text-[var(--ui-accent)]'
                      : 'ui-surface-2 text-[var(--ui-text-muted)] hover:text-[var(--ui-text)]',
                  ].join(' ')}
                  aria-pressed={isActive}
                  data-shortcut-filter={option.id}
                  disabled={isUnavailable}
                  onClick={() => setStatusFilter(option.id)}
                >
                  {option.label}
                  <span className="ml-2 font-mono ui-text-faint">{option.count}</span>
                </button>
              );
            })}
          </div>
          <div className="text-xs ui-text-muted" aria-live="polite" data-shortcut-custom-summary="true">
            {customShortcutCount} edited / {disabledShortcutCount} disabled
          </div>
        </div>
      </div>

      {visibleShortcutGroups.map((group) => (
        <div key={group.title} className="rounded-xl border ui-surface overflow-hidden">
          <div className="px-4 py-2 border-b border-[var(--ui-border)] bg-[var(--ui-surface-2)] text-xs font-semibold ui-text-muted tracking-[0.12em] uppercase">
            {group.title}
          </div>
          <div className="divide-y divide-[var(--ui-border)]">
            {group.shortcuts.map((shortcut) => {
              const activeBindings = getShortcutBindings(shortcut.id, overrides);
              const isCustom = Object.prototype.hasOwnProperty.call(overrides, shortcut.id);
              const isRecording = recordingId === shortcut.id;
              const isDisabled = activeBindings === null;
              return (
                <div key={shortcut.id} className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2 p-3 items-center">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-[var(--ui-text)]">{shortcut.label}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                      <kbd className="px-2 py-0.5 rounded ui-input border font-mono text-[var(--ui-text)]">
                        {shortcutDisplay(activeBindings)}
                      </kbd>
                      {isCustom && (
                        <span className="px-1.5 py-0.5 rounded border border-[var(--ui-accent)] text-[var(--ui-accent)] bg-[var(--ui-accent-soft)]">
                          {activeBindings === null ? 'disabled' : 'custom'}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      className={[
                        'px-3 py-2 rounded-lg border text-xs font-semibold',
                        isRecording
                          ? 'border-[var(--ui-accent)] bg-[var(--ui-accent-soft)] text-[var(--ui-accent)]'
                          : 'ui-surface-2 text-[var(--ui-text-muted)] hover:text-[var(--ui-text)]',
                      ].join(' ')}
                      onClick={() => {
                        setRecordingId(shortcut.id);
                        setCollision(null);
                        setConfirmResetAll(false);
                      }}
                      aria-pressed={isRecording}
                      aria-label={isRecording ? `Press keys for ${shortcut.label}` : `Record shortcut for ${shortcut.label}`}
                    >
                      {isRecording ? 'Press keys' : 'Record'}
                    </button>
                    <button
                      type="button"
                      className="px-3 py-2 rounded-lg border ui-surface-2 text-xs font-semibold text-[var(--ui-text-muted)] hover:text-[var(--ui-text)] disabled:opacity-40 disabled:cursor-not-allowed"
                      onClick={() => handleDisable(shortcut.id)}
                      disabled={isDisabled}
                      title={isDisabled ? 'Shortcut is already disabled' : `Disable ${shortcut.label}`}
                    >
                      Disable
                    </button>
                    <button
                      type="button"
                      className="px-3 py-2 rounded-lg border ui-surface-2 text-xs font-semibold text-[var(--ui-text-muted)] hover:text-[var(--ui-text)] disabled:opacity-40 disabled:cursor-not-allowed"
                      onClick={() => handleReset(shortcut.id)}
                      disabled={!isCustom}
                      title={isCustom ? `Reset ${shortcut.label}` : 'Shortcut is already using the default'}
                    >
                      Reset
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
      {(normalizedQuery || statusFilter !== 'all') && visibleShortcutGroups.length === 0 && (
        <div className="rounded-xl border ui-surface p-4 text-sm ui-text-muted" data-shortcut-search-empty="true">
          {normalizedQuery
            ? `No shortcuts match "${query.trim()}"${statusFilter === 'all' ? '' : ` in ${statusFilter === 'custom' ? 'edited' : 'disabled'} shortcuts`}.`
            : `No ${statusFilter === 'custom' ? 'edited' : 'disabled'} shortcuts yet.`}
        </div>
      )}
    </div>
  );
};
