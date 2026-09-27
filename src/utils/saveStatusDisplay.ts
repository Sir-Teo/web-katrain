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

/**
 * A write that is skipped or refused leaves the last copy that did fit in
 * place. Say how old it is: the badge otherwise reads as if nothing were
 * protected, or -- worse, after a reload -- as if everything were.
 */
export function describeRetainedRecovery(savedAt: number | undefined): string {
  if (!savedAt) return '';
  return ` The recovery copy from ${formatSaveStatusTime(savedAt)} does not include newer changes.`;
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

  const retainedDetail = autoSaveStatus.savedAt ? formatSaveStatusTime(autoSaveStatus.savedAt) : undefined;
  const retained = describeRetainedRecovery(autoSaveStatus.savedAt);

  if (autoSaveStatus.state === 'too-large') {
    return {
      state: 'too-large',
      label: 'Recovery skipped',
      compactLabel: 'Too large',
      detail: retainedDetail,
      title: `Game is too large for recovery auto-save (${AUTO_SAVE_MAX_LABEL}).${retained} Save to Library or download SGF to keep changes.`,
      tone: 'warning',
      role: 'alert',
      ariaLive: 'assertive',
    };
  }

  return {
    state: 'failed',
    label: 'Recovery failed',
    compactLabel: 'Save failed',
    detail: retainedDetail,
    title: `Recovery auto-save failed.${retained} Save to Library or download SGF to keep changes.`,
    tone: 'danger',
    role: 'alert',
    ariaLive: 'assertive',
  };
}
