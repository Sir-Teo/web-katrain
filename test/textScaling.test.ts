import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const FIXED_PX_TEXT = /text-\[\d+(?:\.\d+)?px\]/g;

const sourceFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(entry) ? [full] : [];
  });

describe('text scaling', () => {
  it('sizes text in rem so it follows the browser font-size setting', () => {
    // The detector must catch a known-bad class before it can prove anything.
    expect('text-[11px]'.match(FIXED_PX_TEXT)).toHaveLength(1);
    expect('text-[0.6875rem]'.match(FIXED_PX_TEXT)).toBeNull();

    // A fixed px size ignores the reader's font-size preference. The boxes
    // around it are rem-based and grow anyway, so at 200% the 9-11px labels
    // stayed frozen inside controls that had doubled — measured on the Pass
    // button: box 44px -> 88px while its text stayed 11px.
    const offenders = sourceFiles('src').flatMap((file) => {
      const hits = readFileSync(file, 'utf8').match(FIXED_PX_TEXT) ?? [];
      return hits.map((hit) => `${file}: ${hit}`);
    });

    expect(offenders).toEqual([]);
  });
});
