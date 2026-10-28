import { describe, expect, it } from 'vitest';
import { parseDecimalDraft, parseIntegerDraft } from '../src/utils/numberDraft';

describe('number draft parsing', () => {
  it('accepts signed fractional komi without treating an empty field as zero', () => {
    expect(parseDecimalDraft(' 6.5 ')).toBe(6.5);
    expect(parseDecimalDraft('0')).toBe(0);
    expect(parseDecimalDraft('-0.5')).toBe(-0.5);
    expect(parseDecimalDraft('.5')).toBe(0.5);
    expect(parseDecimalDraft('+6.')).toBe(6);
    for (const draft of ['', ' ', '-', '.', '2abc', '0x10', '1e2', 'Infinity']) {
      expect(parseDecimalDraft(draft), draft).toBeNull();
    }
  });
  it('accepts whole non-negative integer drafts', () => {
    expect(parseIntegerDraft('0')).toBe(0);
    expect(parseIntegerDraft('12')).toBe(12);
    expect(parseIntegerDraft(' 003 ')).toBe(3);
  });

  it('rejects partial, fractional, negative, empty, and unsafe drafts', () => {
    expect(parseIntegerDraft('')).toBeNull();
    expect(parseIntegerDraft('2abc')).toBeNull();
    expect(parseIntegerDraft('1e2')).toBeNull();
    expect(parseIntegerDraft('1.5')).toBeNull();
    expect(parseIntegerDraft('-1')).toBeNull();
    expect(parseIntegerDraft('9007199254740992')).toBeNull();
  });
});
