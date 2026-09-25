import { describe, expect, it } from 'vitest';
import { parseKomiInput } from '../src/utils/komiInput';

describe('komi input field', () => {
  it('reads what the player typed', () => {
    expect(parseKomiInput('6.5')).toBe(6.5);
    expect(parseKomiInput(' 7.5 ')).toBe(7.5);
    expect(parseKomiInput('0')).toBe(0);
    expect(parseKomiInput('-3')).toBe(-3);
  });

  it('does not read a cleared field as zero komi', () => {
    expect(parseKomiInput('')).toBeNull();
    expect(parseKomiInput('   ')).toBeNull();
  });

  it('refuses what no game could have', () => {
    expect(parseKomiInput('abc')).toBeNull();
    expect(parseKomiInput('Infinity')).toBeNull();
    expect(parseKomiInput('1e999')).toBeNull();
    expect(parseKomiInput('1001')).toBeNull();
    expect(parseKomiInput('1000')).toBe(1000);
  });
});
