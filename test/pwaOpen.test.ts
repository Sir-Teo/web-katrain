import { describe, expect, it } from 'vitest';
import { pickSharedImportText, readSharedFromQuery } from '../src/utils/pwaOpen';

describe('readSharedFromQuery', () => {
  it('extracts recognised share params', () => {
    expect(readSharedFromQuery('?title=Game&text=hi&url=https://example.com')).toEqual({
      title: 'Game',
      text: 'hi',
      url: 'https://example.com',
    });
  });

  it('ignores empty values and unrelated params', () => {
    expect(readSharedFromQuery('?text=hello&foo=bar&url=')).toEqual({ text: 'hello' });
  });

  it('returns null when no share params are present', () => {
    expect(readSharedFromQuery('')).toBeNull();
    expect(readSharedFromQuery('?foo=bar')).toBeNull();
    expect(readSharedFromQuery(null)).toBeNull();
  });
});

describe('pickSharedImportText', () => {
  it('prefers a shared URL over text and title', () => {
    expect(pickSharedImportText({ title: 'T', text: 'some text', url: 'https://online-go.com/game/1' }))
      .toBe('https://online-go.com/game/1');
  });

  it('falls back to text, then title', () => {
    expect(pickSharedImportText({ text: '(;GM[1])' })).toBe('(;GM[1])');
    expect(pickSharedImportText({ title: 'Only title' })).toBe('Only title');
  });

  it('returns null when everything is blank', () => {
    expect(pickSharedImportText({ text: '   ', url: '' })).toBeNull();
    expect(pickSharedImportText({})).toBeNull();
  });
});
