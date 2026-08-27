import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { NO_VALUE, formatAnalysisScoreLead, formatAnalysisWinRate, formatReadableScoreLead, formatWinRateFavorLabel, summarizePointsLost } from '../src/utils/analysisSummary';

describe('analysis summary formatting', () => {
  it('formats win rate and score lead for compact board metrics', () => {
    expect(formatAnalysisWinRate(0.716)).toBe('71.6%');
    expect(formatAnalysisWinRate(null)).toBe(NO_VALUE);
    expect(formatAnalysisScoreLead(7.25)).toBe('B+7.3');
    expect(formatAnalysisScoreLead(-2)).toBe('W+2.0');
    expect(formatAnalysisScoreLead(0)).toBe('Jigo');
  });

  it('turns points lost into beginner-readable move quality labels', () => {
    expect(summarizePointsLost(0)).toEqual({ label: 'Best', tone: 'success' });
    expect(summarizePointsLost(-1.25)).toEqual({ label: 'Gain 1.3', tone: 'success' });
    expect(summarizePointsLost(0.6)).toEqual({ label: 'Lost 0.6', tone: 'warning' });
    expect(summarizePointsLost(2.4)).toEqual({ label: 'Lost 2.4', tone: 'danger' });
    expect(summarizePointsLost(null)).toEqual({ label: NO_VALUE, tone: 'muted' });
  });

  it('spells an absent value the same way everywhere', () => {
    // Three spellings were in use: an em dash on the desktop command bar, a
    // hyphen in the phone's readouts and a double hyphen through the whole game
    // report. The phone's row showed two of them side by side — Quality "—"
    // next to Winrate "-".
    expect(NO_VALUE).toBe('\u2014');
    expect(formatAnalysisWinRate(null)).toBe(NO_VALUE);
    expect(formatAnalysisScoreLead(null)).toBe(NO_VALUE);
    expect(formatReadableScoreLead(null)).toBe(NO_VALUE);
    expect(summarizePointsLost(null).label).toBe(NO_VALUE);

    for (const file of ['src/components/GameReportModal.tsx', 'src/components/AnalysisPanel.tsx']) {
      const source = readFileSync(file, 'utf8');
      expect(source).not.toMatch(/return '--';/);
      expect(source).not.toMatch(/\?\? '-'/);
      expect(source).not.toMatch(/: '-'(\s|;|\})/);
    }
  });

  it('describes near-even win rates without overstating a favorite', () => {
    expect(formatWinRateFavorLabel(0.503)).toBe('Even');
    expect(formatWinRateFavorLabel(0.52)).toBe('Even');
    expect(formatWinRateFavorLabel(0.521)).toBe('Black favored');
    expect(formatWinRateFavorLabel(0.479)).toBe('White favored');
    expect(formatWinRateFavorLabel(null)).toBe('');
  });

  it('formats the dashboard score lead in plain language', () => {
    expect(formatReadableScoreLead(0.4)).toBe('Black +0.4');
    expect(formatReadableScoreLead(-2)).toBe('White +2.0');
    expect(formatReadableScoreLead(0)).toBe('Even');
    expect(formatReadableScoreLead(null)).toBe('—');
  });
});
