import { describe, expect, it } from 'vitest';
import pako from 'pako';
import { PRELOADED_GAMES } from '../src/data/preloadedGames';
import {
  buildShareUrl,
  decodeSgfFromFragment,
  encodeSgfToFragment,
} from '../src/utils/shareLink';

const SGF = '(;GM[1]FF[4]SZ[19];B[pd];W[dp];B[pp];W[dd])';

describe('shareLink', () => {
  it('round-trips an SGF through the fragment', () => {
    const fragment = encodeSgfToFragment(SGF);
    expect(fragment.startsWith('sgf=')).toBe(true);
    expect(decodeSgfFromFragment(fragment)).toBe(SGF);
    expect(decodeSgfFromFragment(`#${fragment}`)).toBe(SGF);
  });

  it('produces a URL-safe value (no +, /, = padding)', () => {
    const fragment = encodeSgfToFragment(SGF.repeat(20));
    const value = fragment.slice('sgf='.length);
    expect(value).not.toMatch(/[+/=]/);
    expect(decodeSgfFromFragment(fragment)).toBe(SGF.repeat(20));
  });

  it('round-trips valid SGF with whitespace before its first node', () => {
    const formatted = '(\n  ;GM[1]FF[4]SZ[19]\n  ;B[pd]\n)';
    expect(decodeSgfFromFragment(encodeSgfToFragment(formatted))).toBe(formatted);
  });

  it('returns null for missing, malformed, or non-SGF fragments', () => {
    expect(decodeSgfFromFragment(null)).toBeNull();
    expect(decodeSgfFromFragment('')).toBeNull();
    expect(decodeSgfFromFragment('other=value')).toBeNull();
    expect(decodeSgfFromFragment('sgf=not-valid-base64-$$$')).toBeNull();
  });

  it('builds a share URL that embeds the SGF and round-trips back', () => {
    const url = buildShareUrl(SGF, {
      origin: 'https://sir-teo.github.io',
      pathname: '/web-katrain/',
      search: '',
    });
    expect(url.startsWith('https://sir-teo.github.io/web-katrain/#sgf=')).toBe(true);
    const fragment = url.slice(url.indexOf('#'));
    expect(decodeSgfFromFragment(fragment)).toBe(SGF);
  });
});

/** The same base64url the encoder uses, so a test can forge a fragment. */
const forgeFragment = (payload: string): string => {
  const deflated = pako.deflate(payload);
  let binary = '';
  for (const byte of deflated) binary += String.fromCharCode(byte);
  return `sgf=${Buffer.from(binary, 'binary').toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`;
};

describe('a share link from someone else', () => {
  it('still carries a real game of nearly three hundred moves', () => {
    // The bound must not be tight enough to break the thing it protects.
    const longest = PRELOADED_GAMES.reduce((a, b) => (a.sgf.length > b.sgf.length ? a : b));

    expect(longest.sgf.length).toBeGreaterThan(1000);
    expect(decodeSgfFromFragment(encodeSgfToFragment(longest.sgf))).toBe(longest.sgf);
  });

  it('refuses a fragment that expands past what an SGF may be', () => {
    // Measured before the bound: a 271,803-character fragment inflated to 200MB
    // and 391MB of heap, during startup, before the result was judged not to be
    // an SGF at all.
    const bomb = forgeFragment('a'.repeat(20 * 1024 * 1024));

    const started = Date.now();
    expect(decodeSgfFromFragment(bomb)).toBeNull();
    expect(Date.now() - started, 'should stop early, not inflate it all').toBeLessThan(2000);
  });

  it('refuses an oversized fragment before inflating anything', () => {
    const huge = forgeFragment('a'.repeat(200 * 1024 * 1024));

    expect(huge.length).toBeGreaterThan(256 * 1024);
    const started = Date.now();
    expect(decodeSgfFromFragment(huge)).toBeNull();
    expect(Date.now() - started, 'the length check should be the whole cost').toBeLessThan(500);
  });

  it('is unmoved by a fragment that is not deflate at all', () => {
    expect(decodeSgfFromFragment('sgf=' + 'A'.repeat(500))).toBeNull();
    expect(decodeSgfFromFragment('sgf=%%%%')).toBeNull();
  });
});
