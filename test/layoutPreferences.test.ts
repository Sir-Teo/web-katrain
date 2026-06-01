import { describe, expect, it } from 'vitest';
import { shouldOpenLibraryByDefault } from '../src/utils/layoutPreferences';

describe('layout preferences', () => {
  it('keeps explicit desktop library panel choices sticky', () => {
    expect(shouldOpenLibraryByDefault('true', { width: 1024, height: 768 })).toBe(true);
    expect(shouldOpenLibraryByDefault('true', { width: 390, height: 844 })).toBe(false);
    expect(shouldOpenLibraryByDefault('false', { width: 1280, height: 800 })).toBe(false);
  });

  it('opens the library by default for roomy new desktop sessions', () => {
    expect(shouldOpenLibraryByDefault(null, { width: 1280, height: 800 })).toBe(true);
    expect(shouldOpenLibraryByDefault('', { width: 1440, height: 768 })).toBe(true);
  });

  it('keeps first-run compact desktop, mobile, and unknown viewports board-first', () => {
    expect(shouldOpenLibraryByDefault(null, { width: 1024, height: 768 })).toBe(false);
    expect(shouldOpenLibraryByDefault(null, { width: 390, height: 844 })).toBe(false);
    expect(shouldOpenLibraryByDefault(null, { width: 844, height: 390 })).toBe(false);
    expect(shouldOpenLibraryByDefault(null, null)).toBe(false);
  });
});
