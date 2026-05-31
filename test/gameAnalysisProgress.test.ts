import { describe, expect, it } from 'vitest';
import { formatDuration, summarizeGameAnalysisProgress } from '../src/utils/gameAnalysisProgress';

describe('game analysis progress summary', () => {
  it('formats compact durations for review ETAs', () => {
    expect(formatDuration(450)).toBe('1s');
    expect(formatDuration(59_100)).toBe('1m');
    expect(formatDuration(61_000)).toBe('1m 1s');
    expect(formatDuration(3_600_000)).toBe('1h');
    expect(formatDuration(3_900_000)).toBe('1h 5m');
    expect(formatDuration(0)).toBeNull();
  });

  it('summarizes counts, percentages, and estimated remaining time', () => {
    expect(
      summarizeGameAnalysisProgress({
        done: 25,
        total: 100,
        startedAtMs: 1_000,
        nowMs: 11_000,
      })
    ).toMatchObject({
      countLabel: '25/100',
      percentLabel: '25%',
      buttonLabel: '25/100',
      captionLabel: '25/100 · 25% · ETA 30s',
      title: 'Game review progress: 25/100, 25%, ETA 30s',
      etaLabel: '30s',
    });
  });

  it('omits ETA before enough progress is available', () => {
    expect(
      summarizeGameAnalysisProgress({
        done: 0,
        total: 50,
        startedAtMs: 1_000,
        nowMs: 11_000,
      })
    ).toMatchObject({
      countLabel: '0/50',
      percentLabel: '0%',
      captionLabel: '0/50 · 0%',
      etaLabel: null,
    });
  });

  it('returns null for unknown totals', () => {
    expect(summarizeGameAnalysisProgress({ done: 5, total: 0, startedAtMs: null, nowMs: 0 })).toBeNull();
  });
});
