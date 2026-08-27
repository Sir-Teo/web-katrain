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

  it('names featured games by the half of the name that identifies a player', () => {
    const source = readFileSync('src/components/ProGamesModal.tsx', 'utf8');

    // Every bundled game is an East Asian name written family-name-first.
    // Taking the last word made "Cho Chikun vs O Rissei" read "Chikun v
    // Rissei", and "Lee Sedol vs Gu Li" read "Sedol v Li" — two given names,
    // one of which looks like a surname that is not his.
    expect(source).not.toContain("split(' ').slice(-1)[0]");
    expect(source).toContain('{shortPlayerName(g.black)} v {shortPlayerName(g.white)}');
    expect(source).toContain("const first = name.trim().split(/\\s+/)[0];");
    // The full names and ranks stay on the chip's title either way.
    expect(source).toContain('title={`${playerLine(g.black, g.blackRank)} vs ${playerLine(g.white, g.whiteRank)}`}');
  });

  it('uses the final board as a compact thumbnail on narrow screens', () => {
    const css = readFileSync('src/index.css', 'utf8');

    expect(css).toMatch(/@media \(max-width: 639px\)[\s\S]*\.pro-games-preview \{[^}]*max-width: 11rem !important;/);
    expect(css).toMatch(/@media \(max-width: 639px\)[\s\S]*\.pro-games-load \{[^}]*margin-top: 12px !important;/);
  });
});
