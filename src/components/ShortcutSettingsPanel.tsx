import React from 'react';
import {
  bindingToDisplay,
  createShortcutCollisionReplacement,
  eventToShortcutBinding,
  findShortcutCollision,
  getShortcutBindings,
  getShortcutGroups,
  loadShortcutOverrides,
  replaceShortcutCollisionOverride,
  resetAllShortcutOverrides,
  resetShortcutOverride,
  setShortcutOverride,
  shortcutDisplay,
  type ShortcutBinding,
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

  const refresh = () => setOverrides(loadShortcutOverrides());

  const handleRecord = (id: string, event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (recordingId !== id) return;
    event.preventDefault();
    event.stopPropagation();
    const binding = eventToShortcutBinding(event);
    if (isBindingEmpty(binding)) return;
    const conflict = findShortcutCollision(binding, id, overrides);
    if (conflict) {
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
    refresh();
  };

  const handleDisable = (id: string) => {
    setShortcutOverride(id, null);
    setCollision(null);
    refresh();
  };

  const handleReset = (id: string) => {
    resetShortcutOverride(id);
    setCollision(null);
    refresh();
  };

  const handleResetAll = () => {
    resetAllShortcutOverrides();
    setCollision(null);
    setRecordingId(null);
    refresh();
  };

  const handleReplaceCollision = () => {
    if (!collision) return;
    replaceShortcutCollisionOverride(collision.targetId, collision.conflictId, collision.binding);
    setRecordingId(null);
    setCollision(null);
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
            className="px-3 py-2 rounded-lg ui-surface-2 border text-xs font-semibold text-[var(--ui-text-muted)] hover:text-[var(--ui-text)]"
            onClick={handleResetAll}
          >
            Reset all
          </button>
        </div>
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
      </div>

      {getShortcutGroups(overrides).map((group) => (
        <div key={group.title} className="rounded-xl border ui-surface overflow-hidden">
          <div className="px-4 py-2 border-b border-[var(--ui-border)] bg-[var(--ui-surface-2)] text-xs font-semibold ui-text-muted tracking-[0.12em] uppercase">
            {group.title}
          </div>
          <div className="divide-y divide-[var(--ui-border)]">
            {group.shortcuts.map((shortcut) => {
              const activeBindings = getShortcutBindings(shortcut.id, overrides);
              const isCustom = Object.prototype.hasOwnProperty.call(overrides, shortcut.id);
              const isRecording = recordingId === shortcut.id;
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
                      }}
                      onKeyDown={(event) => handleRecord(shortcut.id, event)}
                    >
                      {isRecording ? 'Press keys' : 'Record'}
                    </button>
                    <button
                      type="button"
                      className="px-3 py-2 rounded-lg border ui-surface-2 text-xs font-semibold text-[var(--ui-text-muted)] hover:text-[var(--ui-text)]"
                      onClick={() => handleDisable(shortcut.id)}
                    >
                      Disable
                    </button>
                    <button
                      type="button"
                      className="px-3 py-2 rounded-lg border ui-surface-2 text-xs font-semibold text-[var(--ui-text-muted)] hover:text-[var(--ui-text)]"
                      onClick={() => handleReset(shortcut.id)}
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
    </div>
  );
};
