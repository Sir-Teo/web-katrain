import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ManualScorePanel } from '../src/components/ManualScorePanel';
import type { ManualScoreEstimate } from '../src/utils/scoring';

const score: ManualScoreEstimate = {
  territory: [
    [1, 0, -1],
    [1, 0, -1],
    [0, 0, 0],
  ],
  blackTerritory: 2,
  whiteTerritory: 2,
  neutralPoints: 5,
  blackDeadStones: 1,
  whiteDeadStones: 0,
  blackScore: 4,
  whiteScore: 9.5,
  scoreLead: -5.5,
  result: 'W+5.5',
};

const baseProps = {
  active: true,
  score,
  blackName: 'Black',
  whiteName: 'White',
  capturedBlack: 1,
  capturedWhite: 2,
  komi: 6.5,
  deadStoneCount: 1,
  onToggle: () => undefined,
  onClear: () => undefined,
  onDone: () => undefined,
};

describe('ManualScorePanel', () => {
  it('renders neutral points in the score breakdown', () => {
    const html = renderToStaticMarkup(<ManualScorePanel {...baseProps} />);

    expect(html).toContain('Manual score');
    expect(html).toContain('Neutral');
    expect(html).toContain('aria-label="5 neutral points"');
    expect(html).toContain('W+5.5');
    expect(html).toContain('data-manual-score-status="true"');
    expect(html).toContain('data-manual-score-status-item="mode"');
    expect(html).toContain('Manual');
    expect(html).toContain('data-manual-score-status-item="dead"');
    expect(html).toContain('data-manual-score-status-item="neutral"');
    expect(html).toContain('data-manual-score-help="true"');
    expect(html).toContain('Click board stones to toggle dead chains - 1 marked dead stone');
  });

  it('marks ownership estimates as approximate', () => {
    const html = renderToStaticMarkup(
      <ManualScorePanel
        {...baseProps}
        scoreMode="estimate"
        onAutoEstimate={() => undefined}
        canAutoEstimate
        estimateSource="ownership"
      />,
    );

    expect(html).toContain('manual-score-estimate-mark');
    expect(html).toContain('≈');
    expect(html).toContain('data-score-estimate-source="ownership"');
    expect(html).toContain('Ownership');
  });

  it('exposes local playout estimates when ownership is unavailable', () => {
    const html = renderToStaticMarkup(
      <ManualScorePanel
        {...baseProps}
        scoreMode="estimate"
        onAutoEstimate={() => undefined}
        canAutoEstimate
        estimateSource="playout"
      />,
    );

    expect(html).toContain('Estimate dead stones with local playouts');
    expect(html).toContain('data-score-estimate-source="playout"');
    expect(html).toContain('Playout');
  });

  it('keeps final scoring unavailable when no manual handler is wired', () => {
    const html = renderToStaticMarkup(
      <ManualScorePanel
        {...baseProps}
        scoreMode="estimate"
        onAutoEstimate={() => undefined}
        canAutoEstimate
        estimateSource="ownership"
      />,
    );

    expect(html).toContain('<button type="button" class="" disabled=""');
  });
});
