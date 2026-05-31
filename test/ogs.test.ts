import { describe, expect, it } from 'vitest';
import { extractOgsGameId, isOgsUrl, loadSgfOrOgs } from '../src/utils/ogs';

describe('OGS URL utilities', () => {
  it('extracts game IDs from supported Online-Go game URLs', () => {
    expect(extractOgsGameId('https://online-go.com/game/81344851')).toBe('81344851');
    expect(extractOgsGameId('http://online-go.com/game/81344851/something')).toBe('81344851');
    expect(extractOgsGameId('https://www.online-go.com/game/12345?foo=bar')).toBe('12345');
    expect(extractOgsGameId('online-go.com/game/67890')).toBe('67890');
  });

  it('rejects non-OGS and spoofed hosts', () => {
    expect(isOgsUrl('https://example.com/game/81344851')).toBe(false);
    expect(isOgsUrl('https://notonline-go.com/game/81344851')).toBe(false);
    expect(isOgsUrl('https://online-go.com.evil.test/game/81344851')).toBe(false);
    expect(isOgsUrl('https://online-go.com/profile/81344851')).toBe(false);
    expect(isOgsUrl('https://online-go.com/game/not-a-number')).toBe(false);
    expect(isOgsUrl('see https://online-go.com/game/81344851')).toBe(false);
  });

  it('keeps SGF content direct even when comments mention OGS', async () => {
    const sgf = '(;GM[1]C[https://online-go.com/game/81344851])';
    await expect(loadSgfOrOgs(sgf)).resolves.toEqual({ sgf, source: 'direct' });
  });
});
