import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getSaveStatusDisplay } from '../src/utils/saveStatusDisplay';

describe('getSaveStatusDisplay', () => {
  it('hides save state when the current game is clean', () => {
    expect(getSaveStatusDisplay(false, { state: 'saved', savedAt: 123 })).toBeNull();
  });

  it('explains that recovery saved games are still unsaved permanently', () => {
    const display = getSaveStatusDisplay(true, { state: 'saved', savedAt: Date.UTC(2026, 0, 1, 12, 30) });

    expect(display?.state).toBe('saved');
    expect(display?.label).toBe('Recovery saved');
    expect(display?.title).toContain('still unsaved until you save to Library or download SGF');
    expect(display?.tone).toBe('success');
  });

  it('uses assertive alerts for failed or oversized recovery saves', () => {
    expect(getSaveStatusDisplay(true, { state: 'failed' })).toMatchObject({
      label: 'Recovery failed',
      role: 'alert',
      ariaLive: 'assertive',
      tone: 'danger',
    });
    expect(getSaveStatusDisplay(true, { state: 'too-large' })).toMatchObject({
      compactLabel: 'Too large',
      role: 'alert',
      ariaLive: 'assertive',
      tone: 'warning',
    });
  });
});

/**
 * The badge these strings feed is rendered in one place: the mobile bottom dock.
 * A desktop window has no save-status indicator at all, so on that half of the
 * app the badge is not a channel -- and "recovery failed" was reaching nobody
 * there. Measured in a browser with `setItem` refusing the recovery key: no
 * toast, no alert, nothing, while the copy silently stopped being written.
 *
 * The too-large case was always toasted alongside its badge. This holds the
 * outright failure to the same rule, since both mean the same thing to the
 * person: the work in front of them is not coming back.
 */
describe('an autosave outcome that means the work is unprotected reaches every viewport', () => {
  const autoSaveEffect = () => {
    const source = readFileSync('src/components/Layout.tsx', 'utf8');
    const start = source.indexOf('const result = writeAutoSavedGame(');
    expect(start, 'the autosave effect moved').toBeGreaterThan(-1);
    return source.slice(start, source.indexOf('}, 500);', start));
  };

  it('toasts when the recovery copy is skipped for size', () => {
    const effect = autoSaveEffect();
    const branch = effect.slice(effect.indexOf("=== 'too-large'"));
    expect(branch, 'the too-large branch stopped toasting').toContain('toast(');
  });

  it('toasts when the recovery copy fails outright', () => {
    const effect = autoSaveEffect();
    // The final `else` -- storage full, or blocked.
    const branch = effect.slice(effect.indexOf("setAutoSaveStatus({ state: 'failed' })"));
    expect(
      branch,
      'a failed recovery save is silent on any viewport without the mobile dock'
    ).toContain('toast(');
  });
});
