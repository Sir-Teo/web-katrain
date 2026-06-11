import { AUTO_SAVE_MAX_LABEL } from './autoSave';

export type AutoSaveStatus = {
  state: 'pending' | 'saved' | 'failed' | 'too-large';
  savedAt?: number;
};

export type SaveStatusDisplayState = AutoSaveStatus['state'] | 'dirty';

export interface SaveStatusDisplay {
  state: SaveStatusDisplayState;
  label: string;
  compactLabel: string;
  detail?: string;
  title: string;
  tone: 'warning' | 'success' | 'danger' | 'accent';
  role: 'status' | 'alert';
  ariaLive: 'polite' | 'assertive';
}

export function formatSaveStatusTime(savedAt: number): string {
  return new Date(savedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function getSaveStatusDisplay(
  unsavedChanges: boolean,
  autoSaveStatus: AutoSaveStatus | null = null,
): SaveStatusDisplay | null {
  if (!unsavedChanges) return null;

  if (!autoSaveStatus) {
    return {
      state: 'dirty',
      label: 'Unsaved',
      compactLabel: 'Unsaved',
      title: 'Unsaved changes. Save to Library or download SGF to keep this game permanently.',
      tone: 'warning',
      role: 'status',
      ariaLive: 'polite',
    };
  }

  if (autoSaveStatus.state === 'pending') {
    return {
      state: 'pending',
      label: 'Recovery saving',
      compactLabel: 'Saving',
      title: 'Unsaved changes. Updating the recovery copy; save to Library or download SGF for a permanent copy.',
      tone: 'accent',
      role: 'status',
      ariaLive: 'polite',
    };
  }

  if (autoSaveStatus.state === 'saved') {
    const detail = autoSaveStatus.savedAt ? formatSaveStatusTime(autoSaveStatus.savedAt) : undefined;
    return {
      state: 'saved',
      label: 'Recovery saved',
      // Keep the compact badge short and fixed-width; the save time stays in
      // the detail/title so narrow bottom bars never clip it mid-string.
      compactLabel: 'Saved',
      detail,
      title: detail
        ? `Recovery copy saved at ${detail}. This game is still unsaved until you save to Library or download SGF.`
        : 'Recovery copy saved. This game is still unsaved until you save to Library or download SGF.',
      tone: 'success',
      role: 'status',
      ariaLive: 'polite',
    };
  }

  if (autoSaveStatus.state === 'too-large') {
    return {
      state: 'too-large',
      label: 'Recovery skipped',
      compactLabel: 'Too large',
      title: `Game is too large for recovery auto-save (${AUTO_SAVE_MAX_LABEL}). Save to Library or download SGF to keep changes.`,
      tone: 'warning',
      role: 'alert',
      ariaLive: 'assertive',
    };
  }

  return {
    state: 'failed',
    label: 'Recovery failed',
    compactLabel: 'Save failed',
    title: 'Recovery auto-save failed. Save to Library or download SGF to keep changes.',
    tone: 'danger',
    role: 'alert',
    ariaLive: 'assertive',
  };
}
