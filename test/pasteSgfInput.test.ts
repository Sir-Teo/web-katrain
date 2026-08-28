import { describe, expect, it } from 'vitest';
import { getDirectGameImportText, getPasteSgfInputInfo } from '../src/utils/pasteSgfInput';

const SGF = '(;GM[1]FF[4]SZ[19];B[pd];W[dd])';

describe('recognising what was pasted', () => {
  it('says nothing is there yet for empty input', () => {
    expect(getPasteSgfInputInfo('').kind).toBe('empty');
    expect(getPasteSgfInputInfo('   \n  ').kind).toBe('empty');
  });

  it('recognises SGF by its opening bracket', () => {
    expect(getPasteSgfInputInfo(SGF).kind).toBe('sgf');
    expect(getPasteSgfInputInfo(`  ${SGF}  `).kind).toBe('sgf');
  });

  it('recognises an OGS game and names the id back', () => {
    const info = getPasteSgfInputInfo('https://online-go.com/game/12345');
    expect(info.kind).toBe('ogs');
    expect(info.gameId).toBe('12345');
    expect(info.helper).toContain('12345');
    expect(info.submitStatus).toContain('12345');
    expect(info.errorStatus).toContain('12345');
  });

  it('tells the reader other links are not downloaded', () => {
    const info = getPasteSgfInputInfo('https://example.com/game/12345');
    expect(info.kind).toBe('url');
    expect(info.helper).toContain('Only Online-Go game links are downloaded');
  });

  it('reads a bare domain as a URL, not as SGF text', () => {
    expect(getPasteSgfInputInfo('www.example.com').kind).toBe('url');
    expect(getPasteSgfInputInfo('example.com/game').kind).toBe('url');
  });

  it('treats anything else as text it will try to parse', () => {
    expect(getPasteSgfInputInfo('just some words').kind).toBe('text');
    expect(getPasteSgfInputInfo(';B[pd]').kind).toBe('text');
  });

  it('always gives the reader something to read in every state', () => {
    for (const value of ['', SGF, 'https://online-go.com/game/1', 'https://example.com', 'words']) {
      const info = getPasteSgfInputInfo(value);
      expect(info.helper.trim()).not.toBe('');
      expect(info.submitStatus.trim()).not.toBe('');
      expect(info.errorStatus.trim()).not.toBe('');
    }
  });

  it('says how to fix it when the paste cannot be used', () => {
    expect(getPasteSgfInputInfo(SGF).errorStatus).toContain('starts with (;');
    expect(getPasteSgfInputInfo('https://online-go.com/game/1').errorStatus).toContain('public');
  });
});

describe('deciding what can be imported without asking', () => {
  it('takes SGF text and an OGS link straight through', () => {
    expect(getDirectGameImportText(SGF)).toBe(SGF);
    expect(getDirectGameImportText(' https://online-go.com/game/12345 '))
      .toBe('https://online-go.com/game/12345');
  });

  it('refuses anything it cannot act on', () => {
    expect(getDirectGameImportText('')).toBeNull();
    expect(getDirectGameImportText('   ')).toBeNull();
    expect(getDirectGameImportText(null)).toBeNull();
    expect(getDirectGameImportText(undefined)).toBeNull();
    expect(getDirectGameImportText('https://example.com/game/1')).toBeNull();
    expect(getDirectGameImportText('just some words')).toBeNull();
  });

  it('agrees with getPasteSgfInputInfo about what is importable', () => {
    for (const value of [SGF, 'https://online-go.com/game/12345']) {
      expect(getDirectGameImportText(value)).not.toBeNull();
      expect(['sgf', 'ogs']).toContain(getPasteSgfInputInfo(value).kind);
    }
    for (const value of ['https://example.com', 'words', '']) {
      expect(getDirectGameImportText(value)).toBeNull();
      expect(['sgf', 'ogs']).not.toContain(getPasteSgfInputInfo(value).kind);
    }
  });
});
