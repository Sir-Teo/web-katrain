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
