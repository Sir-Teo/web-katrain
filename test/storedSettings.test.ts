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

  /**
   * Surviving the normalizer was never the whole contract: what comes out of it
   * is spread over the defaults and handed straight to the UI. These fields
   * were not checked at all, and `trainerEvalThresholds` was the one that took
   * a screen down — its readers guard with `?.length`, which a string passes,
   * so a stored `"abc"` reached `computeGameReport` and threw on
   * `thresholds.map`.
   */
  describe('fields the UI reads back without re-checking', () => {
    it('keeps a threshold ladder it can use', () => {
      const thresholds = [12, 6, 3, 1.5, 0.5, 0];
      expect(normalizeStoredSettings({ trainerEvalThresholds: thresholds })?.trainerEvalThresholds)
        .toEqual(thresholds);
    });

    it.each([
      ['a string that passes a length check', 'abc'],
      ['a single threshold, which has no bucket below it', [5]],
      ['non-numeric entries', [12, 'six', 3]],
      ['a non-finite entry', [12, Number.NaN, 3]],
      ['an object', { 0: 12, length: 2 }],
      ['nothing at all', []],
    ])('drops trainerEvalThresholds that is %s', (_label, trainerEvalThresholds) => {
      expect(normalizeStoredSettings({ trainerEvalThresholds })).not.toHaveProperty('trainerEvalThresholds');
    });

    /**
     * The readers clamp these, but `Math.max(1, Math.min(value, 64))` is not a
     * clamp: with a string or NaN both comparisons are false and the answer is
     * NaN, which still passes for a number everywhere below. Confirmed against
     * the real engine in `engineBatchSizeGuard`: a NaN batch size returned an
     * analysis with no visits in it at all.
     */
    it.each([
      'katagoBatchSize', 'katagoVisits', 'katagoFastVisits', 'katagoMaxChildren',
      'katagoTopK', 'katagoMaxTimeMs', 'katagoWideRootNoise', 'katagoRootPolicyTemperature',
      'katagoAnalysisPvLen', 'noteFontScale', 'tsumegoFrameMargin', 'setupPositionMove',
      'setupPositionAdvantage', 'timerMainTimeMinutes', 'timerByoLengthSeconds',
      'timerByoPeriods', 'timerMinimalUseSeconds', 'showLastNMistakes', 'mistakeThreshold',
      'animPvTimeSeconds', 'animPvMoves', 'trainerLowVisits',
    ])('keeps a real number for %s and drops anything that is not one', (key) => {
      expect(normalizeStoredSettings({ [key]: 12 })).toHaveProperty(key, 12);
      // Zero and negatives are the readers' business; being a number is this one's.
      expect(normalizeStoredSettings({ [key]: 0 })).toHaveProperty(key, 0);
      // A number written as text still says what the reader wanted.
      expect(normalizeStoredSettings({ [key]: '12' })).toHaveProperty(key, 12);
      for (const bad of ['abc', '', ' ', null, {}, [], true, Number.NaN]) {
        expect(normalizeStoredSettings({ [key]: bad }), `${key} = ${String(bad)}`).not.toHaveProperty(key);
      }
    });

    it.each([
      ['trainerShowDots', [true, false, true, true, true, true], 7],
      ['trainerSaveFeedback', [true, true, true, true, false, false], 'yes'],
      ['uiTheme', 'kaya', 'nope'],
      ['uiDensity', 'compact', 'roomy'],
      ['gameRules', 'tromp-taylor', 'martian'],
      ['trainerTheme', 'theme:red-green-colourblind', 'theme:neon'],
      ['trainerTopMovesShow', 'top_move_winrate', 'top_move_vibes'],
      ['trainerTopMovesShowSecondary', 'top_move_nothing', 42],
      ['analysisPolicyMetric', 'delta_score', 'delta_everything'],
      ['analysisSwingCompare', 'best', 'sideways'],
      ['katagoOwnershipMode', 'tree', 'forest'],
    ])('keeps a valid %s and drops an invalid one', (key, valid, invalid) => {
      expect(normalizeStoredSettings({ [key]: valid })).toHaveProperty(key, valid);
      expect(normalizeStoredSettings({ [key]: invalid })).not.toHaveProperty(key);
    });
  });
});
