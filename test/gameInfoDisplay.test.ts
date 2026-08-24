import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  formatGameInfoPlayer,
  formatGameInfoTitle,
  formatKomiLabel,
  getFirstGameInfoLink,
  getVisibleGameInfoDetails,
  hasGameInfoMetadata,
  readRootInfoValue,
} from '../src/utils/gameInfoDisplay';

describe('game info display helpers', () => {
  it('trims SGF root values and hides empty optional details', () => {
    const details = getVisibleGameInfoDetails({
      EV: ['  Club league  '],
      DT: [''],
      PC: ['   '],
      RE: ['B+R'],
      TM: ['10m + byo-yomi'],
    });

    expect(details).toEqual([
      { key: 'EV', label: 'Event', value: 'Club league' },
      { key: 'RE', label: 'Result', value: 'B+R' },
      { key: 'TM', label: 'Time', value: '10m + byo-yomi' },
    ]);
  });

  it('formats players with rank fallback', () => {
    expect(formatGameInfoPlayer(' Lee Sedol ', ' 9p ', 'Black')).toBe('Lee Sedol (9p)');
    expect(formatGameInfoPlayer('', '1d', 'White')).toBe('White (1d)');
    expect(formatGameInfoPlayer('', '', 'Black')).toBe('Black');
  });

  it('derives a useful title when the SGF has no explicit game name', () => {
    expect(formatGameInfoTitle({ GN: ['  Teaching game  '], PB: ['Black'], PW: ['White'] })).toBe('Teaching game');
    expect(formatGameInfoTitle({ PB: ['Gu Li'], PW: ['Lee Sedol'], EV: ['LG Cup'] })).toBe('Gu Li vs Lee Sedol');
    expect(formatGameInfoTitle({ PB: ['Gu Li'] })).toBe('Gu Li vs White');
    expect(formatGameInfoTitle({ EV: ['Club league'] })).toBe('Club league');
    expect(formatGameInfoTitle({})).toBe('Untitled game');
  });

  it('keeps the mobile edit completion action available while the long form scrolls', () => {
    const component = readFileSync('src/components/GameInfoPanel.tsx', 'utf8');
    const css = readFileSync('src/index.css', 'utf8');

    expect(component).toContain('data-game-info-display-actions={displayMode');
    expect(component).toContain('<div className="game-info-edit-header');
    expect(css).toMatch(/@media \(max-width: 1023px\)[\s\S]*\.game-info-edit-header \{[^}]*position: sticky;[^}]*top: 0;/);
  });

  it('detects meaningful metadata beyond default rules', () => {
    expect(hasGameInfoMetadata({ PB: ['  '], PW: [''] })).toBe(false);
    expect(hasGameInfoMetadata({ GN: ['Teaching game'] })).toBe(true);
    expect(hasGameInfoMetadata({ DT: ['2026-05-31'] })).toBe(true);
    expect(hasGameInfoMetadata({ HA: ['2'] })).toBe(true);
  });

  it('normalizes direct root reads and komi display', () => {
    expect(readRootInfoValue({ GN: ['  Title  '] }, 'GN')).toBe('Title');
    expect(readRootInfoValue({}, 'GN')).toBe('');
    expect(formatKomiLabel(6.5001)).toBe('6.5');
    expect(formatKomiLabel(Number.NaN)).toBe('6.5');
  });

  it('extracts safe source links from visible SGF metadata', () => {
    expect(getFirstGameInfoLink({
      PC: ['OGS: https://online-go.com/game/81344851).'],
    })).toEqual({
      href: 'https://online-go.com/game/81344851',
      sourceKey: 'PC',
      sourceLabel: 'Place',
    });

    expect(getFirstGameInfoLink({
      EV: ['https://example.com/event'],
      PC: ['https://online-go.com/game/81344851'],
    })).toEqual({
      href: 'https://example.com/event',
      sourceKey: 'EV',
      sourceLabel: 'Event',
    });

    expect(getFirstGameInfoLink({ PC: ['ftp://example.com/game.sgf'] })).toBeNull();
    expect(getFirstGameInfoLink({ PC: ['not a url'] })).toBeNull();
  });
});
