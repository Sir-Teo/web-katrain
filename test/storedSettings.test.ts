import { describe, expect, it } from 'vitest';
import { normalizeStoredSettings } from '../src/store/gameStore';

/**
 * localStorage is input the app did not write: editable by hand, kept across
 * versions, and full of values that were valid two releases ago. Losing one
 * preference to a bad value is fine; failing to start is not.
 */
describe('normalizeStoredSettings', () => {
  it('keeps a settings object it recognises', () => {
    const settings = normalizeStoredSettings({ showCoordinates: false, katagoVisits: 777 });

    expect(settings?.showCoordinates).toBe(false);
    expect(settings?.katagoVisits).toBe(777);
  });

  it.each(['auto', 'utf-8', 'euc-kr', 'gb18030', 'big5', 'shift_jis', 'windows-1252'])(
    'preserves a supported legacy game encoding: %s', (legacyGameEncoding) => {
      expect(normalizeStoredSettings({ legacyGameEncoding })?.legacyGameEncoding).toBe(legacyGameEncoding);
    },
  );

  it.each(['latin42', 7, null, [], {}])('drops an invalid legacy game encoding: %j', (legacyGameEncoding) => {
    expect(normalizeStoredSettings({ legacyGameEncoding })).not.toHaveProperty('legacyGameEncoding');
  });

  it('moves a visit count off the old default rather than pinning someone to it', () => {
    // Anyone who never touched the setting is carrying the previous default,
    // and leaving it would keep them on it forever. A number they chose that
    // happens to differ is left alone.
    expect(normalizeStoredSettings({ katagoVisits: 500 })?.katagoVisits).not.toBe(500);
    expect(normalizeStoredSettings({ katagoVisits: 501 })?.katagoVisits).toBe(501);
  });

  it('refuses anything that is not a settings object', () => {
    expect(normalizeStoredSettings(null)).toBeNull();
    expect(normalizeStoredSettings(undefined)).toBeNull();
    expect(normalizeStoredSettings('a string')).toBeNull();
    expect(normalizeStoredSettings(42)).toBeNull();
    // An array is an object to typeof, and spreading one over the defaults
    // would put numeric keys into the settings.
    expect(normalizeStoredSettings([1, 2, 3])).toBeNull();
  });

  it('drops a value that names something the app no longer has', () => {
    const settings = normalizeStoredSettings({
      boardTheme: 'a theme that was removed',
      appLocale: 'kl',
      analysisExperience: 'wizard',
      katagoBackend: 'quantum',
    });

    expect(settings).not.toBeNull();
    expect('boardTheme' in settings!).toBe(false);
    expect('appLocale' in settings!).toBe(false);
    expect('analysisExperience' in settings!).toBe(false);
    expect('katagoBackend' in settings!).toBe(false);
  });

  it('pulls a number back into the range that has a meaning', () => {
    const settings = normalizeStoredSettings({ defaultBoardSize: 'huge', defaultHandicap: 1e9 });

    // 9, 13 and 19 are the sizes with tensors; anything else has no board.
    expect([9, 13, 19]).toContain(settings?.defaultBoardSize);
    expect(settings?.defaultHandicap).toBeLessThanOrEqual(9);
    expect(settings?.defaultHandicap).toBeGreaterThanOrEqual(0);
  });

  it('forgets an uploaded model whose blob URL died with the page', () => {
    expect('humanSlModelUrl' in normalizeStoredSettings({ humanSlModelUrl: 'blob:http://x/y' })!).toBe(false);
    expect('katagoModelUrl' in normalizeStoredSettings({ katagoModelUrl: 42 })!).toBe(false);
  });

  it('survives the shapes a corrupt entry actually takes', () => {
    // Each of these was loaded into the running app first; none of them stopped
    // it starting, and none of them may start throwing here either.
    const nasty: unknown[] = [
      { katagoVisits: 'lots', noteFontScale: 'big', tsumegoFrameMargin: 999, showCoordinates: 'yes' },
      { katagoVisits: -1e9, noteFontScale: Number.MAX_SAFE_INTEGER, katagoTopK: -5, trainerLowVisits: -1 },
      { katagoVisits: { a: [1, { b: 2 }] }, boardTheme: ['x'] },
      { defaultBoardSize: Number.NaN, defaultHandicap: Number.POSITIVE_INFINITY },
      Object.create(null),
    ];

    for (const input of nasty) {
      expect(() => normalizeStoredSettings(input)).not.toThrow();
    }
  });
});
