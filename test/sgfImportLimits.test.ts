import { describe, expect, it } from 'vitest';
import { parseSgf } from '../src/utils/sgf';
import {
  MAX_SGF_IMPORT_BYTES,
  assertSgfImportSize,
  getSgfImportSizeError,
} from '../src/utils/sgfImportLimits';

describe('SGF import limits', () => {
  it('accepts a normal SGF and an exact-size file preflight', () => {
    expect(getSgfImportSizeError('(;GM[1]SZ[19];B[pd])')).toBeNull();
    expect(getSgfImportSizeError(MAX_SGF_IMPORT_BYTES)).toBeNull();
  });

  it('rejects oversized file metadata before the file is read', () => {
    expect(getSgfImportSizeError(MAX_SGF_IMPORT_BYTES + 1)).toBe('SGF files are limited to 5 MB.');
  });

  it('counts multibyte text by UTF-8 bytes', () => {
    const multibyte = '界'.repeat(Math.floor(MAX_SGF_IMPORT_BYTES / 3) + 1);
    expect(multibyte.length).toBeLessThan(MAX_SGF_IMPORT_BYTES);
    expect(() => assertSgfImportSize(multibyte)).toThrow('SGF files are limited to 5 MB.');
  });

  it('enforces the ceiling at the parser boundary for every import path', () => {
    const oversized = `(;GM[1]C[${'x'.repeat(MAX_SGF_IMPORT_BYTES)}])`;
    expect(() => parseSgf(oversized)).toThrow('SGF files are limited to 5 MB.');
  });
});
