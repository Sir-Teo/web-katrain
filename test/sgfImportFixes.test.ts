import { describe, expect, it } from 'vitest';
import { decodeSgfBytes } from '../src/utils/sgfEncoding';
import { countSgfMoves, sgfHeaderText } from '../src/utils/sgfScan';
import { parseSgf } from '../src/utils/sgf';
import { buildShareUrl } from '../src/utils/shareLink';
import { getDirectGameImportText } from '../src/utils/pasteSgfInput';
import { pickSharedImportText } from '../src/utils/pwaOpen';

const location = { origin: 'https://example.test', pathname: '/web-katrain/', search: '' };

describe('SGF import fixes', () => {
  it('opens a file whose CA[] is empty', () => {
    const text = '(;GM[1]FF[4]CA[]SZ[19]PB[Alice];B[pd])';
    expect(decodeSgfBytes(new TextEncoder().encode(text))).toBe(text);
  });

  it('still honours a CA declared after an empty one is skipped', () => {
    const text = '(;GM[1]CA[]SZ[9];B[ee])';
    expect(() => decodeSgfBytes(new TextEncoder().encode(text))).not.toThrow();
  });

  it('accepts the app’s own share link as a drop or page paste', () => {
    const sgf = '(;GM[1]SZ[9];B[ee])';
    const url = buildShareUrl(sgf, location);
    expect(getDirectGameImportText(url)).toBe(sgf);
    expect(getDirectGameImportText('https://example.test/nothing')).toBeNull();
  });

  it('prefers a shared share link over its caption', () => {
    const sgf = '(;GM[1]SZ[9];B[ee])';
    const url = buildShareUrl(sgf, location);
    expect(pickSharedImportText({ title: 'Game', text: 'Look at this', url })).toBe(sgf);
    expect(pickSharedImportText({ text: '(;GM[1])', url: 'https://example.test/page' })).toBe('(;GM[1])');
  });

  it('counts moves the way the parser reads them', () => {
    const text = '(;GM[1]SZ[9];B [ee];Black[dd];W[cc];BL[30];C[B[aa\\]])';
    expect(countSgfMoves(text)).toBe(parseSgf(text).moves.length);
    expect(countSgfMoves(text)).toBe(3);
    expect(sgfHeaderText(text)).toBe('(;GM[1]SZ[9]');
  });
});
