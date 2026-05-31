import { describe, expect, it } from 'vitest';
import {
  formatGameInfoPlayer,
  formatKomiLabel,
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
});
