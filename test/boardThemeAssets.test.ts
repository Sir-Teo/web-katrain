import { readFileSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { useGameStore } from '../src/store/gameStore';

/**
 * The default board is the largest thing a first visit downloads after the main
 * bundle, so it is worth keeping honest about.
 *
 * Its coordinates were carrying six decimal places against a 1024-unit viewBox
 * rendered around 690px, which is a precision of about a ten-thousandth of a
 * pixel. Rounded to two, the rendered board differs by at most 2/255 on any
 * channel with 1.24% of channels differing at all -- and the file is a third
 * smaller.
 */
const BOARD = 'public/themes/hikaru/board.svg';

describe('default board asset', () => {
  it('is the theme a first visit actually loads', () => {
    // If the default moves, this file is guarding the wrong asset.
    expect(useGameStore.getState().settings.boardTheme).toBe('hikaru');
  });

  it('stays within the size it was reduced to', () => {
    const raw = readFileSync(BOARD);
    const gzipped = gzipSync(raw, { level: 9 }).byteLength;
    // Was 292,019 raw / 112,248 gzipped before the coordinates were rounded.
    expect(statSync(BOARD).size).toBeLessThan(250_000);
    expect(gzipped).toBeLessThan(90_000);
  });

  it('keeps the document intact outside its geometry', () => {
    const svg = readFileSync(BOARD, 'utf8');
    /**
     * Rounding every number in the file, rather than only the geometry, also
     * rewrote `version="1.0"` to `1.00` and the Dublin Core namespace to
     * `elements/1.10/`. Neither changes a pixel, so the render comparison that
     * cleared the change could not see it. These can.
     */
    expect(svg).toContain('http://purl.org/dc/elements/1.1/');
    expect(svg).toContain('http://creativecommons.org/ns#');
    expect(svg).toContain('<?xml version="1.0" encoding="UTF-8"');
    expect(svg).toContain('viewBox="0 0 1024.000000 1024.000000"');
    // No stray URL got a decimal rewritten into it.
    expect(svg).not.toMatch(/https?:\/\/[^"']*\d\.\d\d\//);
  });
});
