import { describe, expect, it } from 'vitest';
import { parseNewGameKomi } from '../src/utils/komiInput';

describe('new game komi field', () => {
  it('reads what the player typed', () => {
    expect(parseNewGameKomi('6.5')).toBe(6.5);
    expect(parseNewGameKomi(' 7.5 ')).toBe(7.5);
    expect(parseNewGameKomi('0')).toBe(0);
    expect(parseNewGameKomi('-3')).toBe(-3);
  });

  it('does not read a cleared field as zero komi', () => {
    expect(parseNewGameKomi('')).toBeNull();
    expect(parseNewGameKomi('   ')).toBeNull();
  });

  it('refuses what no game could have', () => {
    expect(parseNewGameKomi('abc')).toBeNull();
    expect(parseNewGameKomi('Infinity')).toBeNull();
    expect(parseNewGameKomi('1e999')).toBeNull();
    expect(parseNewGameKomi('1001')).toBeNull();
    expect(parseNewGameKomi('1000')).toBe(1000);
  });
});
