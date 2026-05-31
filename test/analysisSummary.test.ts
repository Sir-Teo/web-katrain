import { describe, expect, it } from 'vitest';
import { formatAnalysisScoreLead, formatAnalysisWinRate, summarizePointsLost } from '../src/utils/analysisSummary';

describe('analysis summary formatting', () => {
  it('formats win rate and score lead for compact board metrics', () => {
    expect(formatAnalysisWinRate(0.716)).toBe('71.6%');
    expect(formatAnalysisWinRate(null)).toBe('-');
    expect(formatAnalysisScoreLead(7.25)).toBe('B+7.3');
    expect(formatAnalysisScoreLead(-2)).toBe('W+2.0');
  });

  it('turns points lost into beginner-readable move quality labels', () => {
    expect(summarizePointsLost(0)).toEqual({ label: 'Best', tone: 'success' });
    expect(summarizePointsLost(-1.25)).toEqual({ label: 'Gain 1.3', tone: 'success' });
    expect(summarizePointsLost(0.6)).toEqual({ label: 'Lost 0.6', tone: 'warning' });
    expect(summarizePointsLost(2.4)).toEqual({ label: 'Lost 2.4', tone: 'danger' });
    expect(summarizePointsLost(null)).toEqual({ label: '-', tone: 'muted' });
  });
});
