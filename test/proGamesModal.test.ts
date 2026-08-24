import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('ProGamesModal responsive detail', () => {
  it('keeps the study action ahead of optional editorial context', () => {
    const source = readFileSync('src/components/ProGamesModal.tsx', 'utf8');
    const loadAction = source.indexOf('className="pro-games-load');
    const editorial = source.indexOf('{selected.editorial &&');

    expect(loadAction).toBeGreaterThanOrEqual(0);
    expect(editorial).toBeGreaterThan(loadAction);
  });

  it('uses the final board as a compact thumbnail on narrow screens', () => {
    const css = readFileSync('src/index.css', 'utf8');

    expect(css).toMatch(/@media \(max-width: 639px\)[\s\S]*\.pro-games-preview \{[^}]*max-width: 11rem !important;/);
    expect(css).toMatch(/@media \(max-width: 639px\)[\s\S]*\.pro-games-load \{[^}]*margin-top: 12px !important;/);
  });
});
