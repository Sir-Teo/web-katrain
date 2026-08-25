import { describe, expect, it } from 'vitest';
import { isStaleBuildError } from '../src/utils/errorReporting';

describe('stale build error', () => {
  it('recognises a lazy chunk that no longer exists, in each browser wording', () => {
    // Measured in Chrome by deleting a chunk from dist and opening Settings.
    expect(isStaleBuildError(
      'Failed to fetch dynamically imported module: http://x/assets/SettingsModal-B_hUt1_4.js'
    )).toBe(true);
    expect(isStaleBuildError('error loading dynamically imported module')).toBe(true); // Firefox
    expect(isStaleBuildError('Importing a module script failed.')).toBe(true); // Safari
    expect(isStaleBuildError('ChunkLoadError: Loading chunk 42 failed.')).toBe(true);
    expect(isStaleBuildError('Loading chunk vendor-abc failed')).toBe(true);
  });

  it('leaves real crashes reported as crashes', () => {
    expect(isStaleBuildError("Cannot read properties of null (reading 'focus')")).toBe(false);
    expect(isStaleBuildError('Maximum update depth exceeded')).toBe(false);
    expect(isStaleBuildError('Analysis error: Invalid int token: html>')).toBe(false);
    // A module that loaded fine but threw on evaluation is a genuine bug.
    expect(isStaleBuildError('TypeError: undefined is not a function')).toBe(false);
  });

  it('handles a missing message rather than throwing', () => {
    expect(isStaleBuildError(null)).toBe(false);
    expect(isStaleBuildError(undefined)).toBe(false);
    expect(isStaleBuildError('')).toBe(false);
  });
});
