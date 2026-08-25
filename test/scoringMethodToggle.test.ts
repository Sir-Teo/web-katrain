import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('scoring method toggle', () => {
  const source = () => readFileSync('src/components/ManualScorePanel.tsx', 'utf8');

  it('does not disable the mode that is currently selected', () => {
    // aria-pressed says "this is the chosen option"; disabled says "this control
    // is unavailable". Setting both made the selected half of the pair
    // unfocusable and announced as dimmed, so the only mode a keyboard or
    // screen-reader user could perceive was the one they had not picked.
    expect(source()).not.toContain("disabled={!onUseManualScore || scoreMode === 'manual'}");
    expect(source()).toContain('disabled={!onUseManualScore}');
  });

  it('still gates Estimate on whether an estimate is possible', () => {
    // That one is a real capability check, not a restatement of selection.
    expect(source()).toContain('disabled={!onAutoEstimate || !canAutoEstimate}');
  });

  it('keeps selection on aria-pressed for both halves', () => {
    const text = source();

    expect(text).toContain("aria-pressed={scoreMode === 'estimate'}");
    expect(text).toContain("aria-pressed={scoreMode === 'manual'}");
  });
});
