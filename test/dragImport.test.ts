import { describe, expect, it } from 'vitest';
import { getDroppedSgfOrOgsText, hasDraggedFiles, hasPotentialGameImportDrag } from '../src/utils/dragImport';

const transfer = (
  types: string[],
  data: Record<string, string> = {},
  filesLength = 0
) => ({
  types,
  files: { length: filesLength },
  getData: (format: string) => data[format] ?? '',
});

describe('drag import helpers', () => {
  it('recognizes file and text imports as game import drags', () => {
    expect(hasDraggedFiles(transfer(['Files'], {}, 1))).toBe(true);
    expect(hasPotentialGameImportDrag(transfer(['Files']))).toBe(true);
    expect(hasPotentialGameImportDrag(transfer(['text/uri-list']))).toBe(true);
    expect(hasPotentialGameImportDrag(transfer(['text/plain']))).toBe(true);
    expect(hasPotentialGameImportDrag(transfer(['application/json']))).toBe(false);
  });

  it('extracts OGS URLs from URI lists and Firefox URL drags', () => {
    expect(getDroppedSgfOrOgsText(transfer(
      ['text/uri-list'],
      { 'text/uri-list': '# source\nhttps://online-go.com/game/81344851\n' }
    ))).toBe('https://online-go.com/game/81344851');
    expect(getDroppedSgfOrOgsText(transfer(
      ['text/x-moz-url'],
      { 'text/x-moz-url': 'https://online-go.com/game/12345\nGame title' }
    ))).toBe('https://online-go.com/game/12345');
  });

  it('skips unsupported URI-list entries until it finds an importable game', () => {
    expect(getDroppedSgfOrOgsText(transfer(
      ['text/uri-list'],
      { 'text/uri-list': '# mixed links\nhttps://example.com/game/1\nhttps://online-go.com/game/24680\n' }
    ))).toBe('https://online-go.com/game/24680');
  });

  it('extracts raw SGF text without treating unsupported text as importable', () => {
    expect(getDroppedSgfOrOgsText(transfer(
      ['text/plain'],
      { 'text/plain': ' (;GM[1]SZ[19];B[pd]) ' }
    ))).toBe('(;GM[1]SZ[19];B[pd])');
    expect(getDroppedSgfOrOgsText(transfer(
      ['text/plain'],
      { 'text/plain': 'Review this: https://online-go.com/game/81344851' }
    ))).toBe('Review this: https://online-go.com/game/81344851');
    expect(getDroppedSgfOrOgsText(transfer(
      ['text/plain'],
      { 'text/plain': 'https://example.com/game/123' }
    ))).toBeNull();
  });
});
