import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  evalColorToCss,
  getKaTrainEvalColors,
  KATRAIN_EVAL_COLORS_BY_THEME,
} from '../src/utils/katrainTheme';

describe('move-quality colours', () => {
  it('are KaTrain 0..1 channels, which CSS cannot read directly', () => {
    for (const table of Object.values(KATRAIN_EVAL_COLORS_BY_THEME)) {
      for (const colour of table) {
        for (const channel of colour) {
          expect(channel).toBeGreaterThanOrEqual(0);
          expect(channel).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it('convert to a CSS colour on the 0..255 scale', () => {
    const [blunder] = getKaTrainEvalColors('theme:normal');

    // Read straight into `rgb()` these channels round to nothing: the blunder
    // colour rendered as pure black, and so did every other one. That is what
    // the candidate PV tiles were drawing before this helper existed.
    expect(evalColorToCss(blunder!)).toBe('rgba(114, 33, 107, 1)');
    expect(evalColorToCss(blunder!, 0.5)).toBe('rgba(114, 33, 107, 0.5)');
  });

  it('is the only way the components read the table', () => {
    // A second conversion is a second chance to forget the scale.
    for (const path of [
      'src/components/CandidatePvTiles.tsx',
      'src/components/AnalysisPanel.tsx',
    ]) {
      const source = readFileSync(path, 'utf8');
      expect(source, path).toContain('evalColorToCss');
      expect(source, path).not.toMatch(/`rgb\(\$\{r\}/);
    }
  });
});
