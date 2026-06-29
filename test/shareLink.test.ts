import { describe, expect, it } from 'vitest';
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
