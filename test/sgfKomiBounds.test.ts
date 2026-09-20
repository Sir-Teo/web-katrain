import { describe, expect, it } from 'vitest';
import { parseSgf } from '../src/utils/sgf';

/**
 * `KM` comes out of a file another program wrote, and the guard on it was
 * `!Number.isNaN(parseFloat(value))`, which rejects `abc` and accepts
 * `Infinity`. Every score the app shows is territory minus komi.
 */
describe('komi read out of a game file', () => {
  const komiOf = (value: string) => parseSgf(`(;GM[1]FF[4]SZ[9]KM[${value}];B[dd])`).komi;

  it('keeps a komi a real game would have', () => {
    expect(komiOf('6.5')).toBe(6.5);
    expect(komiOf('0')).toBe(0);
    expect(komiOf('-3.5')).toBe(-3.5);
    expect(komiOf('7')).toBe(7);
  });

  it('falls back when the file does not name a number', () => {
    expect(komiOf('abc')).toBe(6.5);
    expect(komiOf('')).toBe(6.5);
  });

  it('refuses a komi that is not a finite number', () => {
    // parseFloat('Infinity') is Infinity, and Infinity is not NaN.
    expect(Number.isFinite(komiOf('Infinity'))).toBe(true);
    expect(Number.isFinite(komiOf('-Infinity'))).toBe(true);
    // An exponent large enough to overflow reaches Infinity the same way.
    expect(Number.isFinite(komiOf('1e999'))).toBe(true);
  });

  it('leaves a score computable whatever the file said', () => {
    for (const value of ['Infinity', '-Infinity', '1e999', 'abc', '6.5']) {
      const { komi } = parseSgf(`(;GM[1]FF[4]SZ[9]KM[${value}];B[dd])`);
      expect(Number.isFinite(20 - komi), `komi from ${value}`).toBe(true);
    }
  });
});
