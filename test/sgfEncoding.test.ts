import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import JSZip from 'jszip';
import { decodeSgfBytes, readSgfFile } from '../src/utils/sgfEncoding';
import { parseSgf } from '../src/utils/sgf';
import { createLibraryZipBlob, importLibraryItemsFromZip } from '../src/utils/libraryZip';
import { createLibraryItem } from '../src/utils/library';
import { MAX_SGF_IMPORT_BYTES } from '../src/utils/sgfImportLimits';

const utf8 = (text: string) => new TextEncoder().encode(text);
const fixture = (name: string) => readFileSync(new URL(`./fixtures/sgf-encoding/${name}.sgf`, import.meta.url));
const records = [
  ['shift-jis', '本因坊', '呉清源', '手筋の研究'],
  ['euc-kr', '이세돌', '조훈현', '바둑 공부'],
  ['gbk', '古力', '柯洁', '围棋研究'],
  ['latin1', 'André', 'François', 'Étude annotée'],
] as const;

describe('SGF byte decoding', () => {
  it.each(records)('preserves %s player names, comments, and moves through UTF-8 re-opening', async (name, black, white, comment) => {
    const text = await readSgfFile(new Blob([fixture(name)]));
    const parsed = parseSgf(text);
    expect(parsed.tree!.props).toMatchObject({ CA: ['UTF-8'], PB: [black], PW: [white], C: [comment] });
    expect(parsed.moves).toEqual([{ x: 3, y: 3, player: 'black' }]);
    expect(decodeSgfBytes(utf8(text))).toBe(text);
  });

  it('does not treat CA-looking comment text or child properties as the root declaration', () => {
    const text = '(;GM[1]SZ[9]C[Example CA[Unsupported\\] and \\] escaped];B[dd]CA[Unsupported])';
    expect(decodeSgfBytes(utf8(text))).toBe(text);
  });

  it('finds a declaration after a Shift-JIS character whose final byte is a backslash', () => {
    // ソ = 83 5C; scanning raw bytes as SGF would mistake the following ] for
    // an escaped bracket and swallow the actual CA property.
    const bytes = new Uint8Array([...utf8('(;GM[1]SZ[9]C['), 0x83, 0x5c, ...utf8(']CA[Shift_JIS];B[dd])')]);
    expect(parseSgf(decodeSgfBytes(bytes)).tree!.props).toMatchObject({ C: ['ソ'], CA: ['UTF-8'] });
  });

  it('supports legacy property spelling, whitespace, and escaped charset labels', () => {
    const bytes = new Uint8Array([...utf8('(;GM[1]SZ[9]ChArset [ISO-8859-\\1]C['), 0xe9, ...utf8('])')]);
    expect(parseSgf(decodeSgfBytes(bytes)).tree!.props).toMatchObject({ C: ['é'], CA: ['UTF-8'] });
  });

  it('keeps undeclared UTF-8 and uses the SGF Latin-1 default for non-UTF-8 bytes', () => {
    const modern = decodeSgfBytes(utf8('(;SZ[9]C[棋譜])'));
    expect(parseSgf(modern).tree!.props).toMatchObject({ C: ['棋譜'], CA: ['UTF-8'] });
    const old = decodeSgfBytes(new Uint8Array([...utf8('(;SZ[9]C['), 0xe9, 0x85, ...utf8('])')]));
    expect(parseSgf(old).tree!.props).toMatchObject({ C: ['é\u0085'], CA: ['UTF-8'] });
    expect(decodeSgfBytes(utf8(old))).toBe(old);
  });

  it.each(['utf-8', 'utf-16le', 'utf-16be'] as const)('honors a %s BOM over an outdated declaration', (encoding) => {
    const text = '(;SZ[9]CA[ISO-8859-1]C[棋譜])';
    let bytes: Uint8Array;
    if (encoding === 'utf-8') bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...utf8(text)]);
    else {
      const little = encoding === 'utf-16le';
      bytes = new Uint8Array(2 + text.length * 2);
      bytes.set(little ? [0xff, 0xfe] : [0xfe, 0xff]);
      const view = new DataView(bytes.buffer);
      for (let i = 0; i < text.length; i++) view.setUint16(2 + 2 * i, text.charCodeAt(i), little);
    }
    expect(parseSgf(decodeSgfBytes(bytes)).tree!.props).toMatchObject({ C: ['棋譜'], CA: ['UTF-8'] });
  });

  it('rejects unsupported and malformed declared encodings without replacement characters', () => {
    expect(() => decodeSgfBytes(utf8('(;SZ[9]CA[Unsupported]C[Study])'))).toThrow(/Unsupported SGF character encoding/);
    const invalid = new Uint8Array([...utf8('(;SZ[9]CA[UTF-8]C['), 0xff, ...utf8('])')]);
    expect(() => decodeSgfBytes(invalid)).toThrow(/invalid UTF-8 text/);
  });

  it('checks file size before reading and validates the actual byte count', async () => {
    const arrayBuffer = vi.fn();
    await expect(readSgfFile({ size: MAX_SGF_IMPORT_BYTES + 1, arrayBuffer } as unknown as Blob)).rejects.toThrow(/5 MB/);
    expect(arrayBuffer).not.toHaveBeenCalled();
    expect(() => decodeSgfBytes(new Uint8Array(MAX_SGF_IMPORT_BYTES + 1))).toThrow(/5 MB/);
  });
});

describe('legacy records in library archives', () => {
  it('exports pasted Unicode with a matching declaration even if its source named a legacy charset', async () => {
    const pasted = '(;SZ[9]CA[Shift_JIS]PB[本因坊]C[手筋の研究])';
    const { blob } = await createLibraryZipBlob([createLibraryItem('Pasted', pasted)]);
    const reopened = await importLibraryItemsFromZip(blob);
    expect(reopened).toHaveLength(1);
    expect(reopened[0]).toMatchObject({ metadata: { black: '本因坊' } });
    expect(reopened[0]!.type === 'file' && reopened[0]!.sgf).toBe(pasted.replace('CA[Shift_JIS]', 'CA[UTF-8]'));
  });

  it('decodes each entry and preserves text after export and re-import', async () => {
    const zip = new JSZip();
    for (const [name] of records) zip.file(`Studies/${name}.sgf`, fixture(name));
    zip.file('Studies/bad.sgf', utf8('(;SZ[9]CA[Unsupported])'));
    const items = await importLibraryItemsFromZip(await zip.generateAsync({ type: 'uint8array' }));
    const files = items.filter((item) => item.type === 'file');
    expect(files).toHaveLength(4);
    for (const [name, black, white, comment] of records) {
      const file = files.find((item) => item.name === name)!;
      expect(file.metadata).toMatchObject({ black, white });
      expect(parseSgf(file.sgf).tree!.props).toMatchObject({ CA: ['UTF-8'], C: [comment] });
    }
    const { blob } = await createLibraryZipBlob(items);
    const reopened = (await importLibraryItemsFromZip(blob)).filter((item) => item.type === 'file');
    expect(reopened.map((item) => item.sgf)).toEqual(files.map((item) => item.sgf));
  });
});
