import { afterEach, describe, expect, it, vi } from 'vitest';
import JSZip from 'jszip';
import { importLibraryItemsFromZip } from '../src/utils/libraryZip';
import { MAX_SGF_IMPORT_BYTES } from '../src/utils/sgfImportLimits';

const sgf = '(;SZ[9]CA[UTF-8]PB[Kept];B[cc])';

describe('rejected archive games', () => {
  afterEach(() => vi.restoreAllMocks());

  it('reports every rejected game while keeping valid games and ignoring metadata', async () => {
    const zip = new JSZip();
    zip.file('Valid.sgf', sgf);
    zip.file('Malformed.gib', 'INI 0 1 0\nSTO 0 1 1 19 3');
    zip.file('Encoding.sgf', '(;SZ[9]CA[Unsupported])');
    zip.file('Oversized.ngf', 'x'.repeat(MAX_SGF_IMPORT_BYTES + 1));
    zip.file('__MACOSX/._Valid.sgf', 'metadata');
    zip.file('Readme.txt', 'Not a game');
    const rejected: { name: string; error: unknown }[] = [];
    const items = await importLibraryItemsFromZip(
      await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' }), null, 'auto',
      (name, error) => rejected.push({ name, error }),
    );
    expect(items.filter((item) => item.type === 'file').map((item) => item.name)).toEqual(['Valid']);
    expect(rejected.map((item) => item.name)).toEqual(['Encoding.sgf', 'Malformed.gib', 'Oversized.ngf']);
    expect(rejected.map((item) => (item.error as Error).message)).toEqual([
      expect.stringContaining('Unsupported SGF character encoding'),
      expect.stringContaining('Invalid GIB move on line 2'),
      'Game files are limited to 5 MB.',
    ]);
  });

  it('counts all remaining games after reaching the expansion budget without decompressing them', async () => {
    const expanded = new Uint8Array(4 * 1024 * 1024).fill(32);
    expanded.set(new TextEncoder().encode(sgf));
    const entries = Array.from({ length: 19 }, (_, i) => ({
      name: `Game-${String(i).padStart(2, '0')}.sgf`, dir: false,
      _data: { uncompressedSize: expanded.byteLength }, async: vi.fn(async () => expanded),
    }));
    vi.spyOn(JSZip, 'loadAsync').mockResolvedValue({ files: Object.fromEntries(entries.map((entry) => [entry.name, entry])) } as unknown as JSZip);
    const rejected = vi.fn();
    const imported = await importLibraryItemsFromZip(new Uint8Array(), null, 'auto', rejected);
    expect(imported).toHaveLength(16);
    expect(rejected.mock.calls.map(([name]) => name)).toEqual(['Game-16.sgf', 'Game-17.sgf', 'Game-18.sgf']);
    expect(rejected.mock.calls.every(([, error]) => /64 MB/.test(error.message))).toBe(true);
    for (const entry of entries.slice(16)) expect(entry.async).not.toHaveBeenCalled();
  });

  it('reports a false declared size and stops reading later entries', async () => {
    const oversized = { name: 'A.sgf', dir: false, _data: { uncompressedSize: 0 }, async: vi.fn(async () => new Uint8Array(64 * 1024 * 1024 + 1)) };
    const later = { name: 'B.sgf', dir: false, _data: { uncompressedSize: 1 }, async: vi.fn(async () => new TextEncoder().encode(sgf)) };
    vi.spyOn(JSZip, 'loadAsync').mockResolvedValue({ files: { 'A.sgf': oversized, 'B.sgf': later } } as unknown as JSZip);
    const rejected = vi.fn();
    expect(await importLibraryItemsFromZip(new Uint8Array(), null, 'auto', rejected)).toEqual([]);
    expect(rejected.mock.calls.map(([name]) => name)).toEqual(['A.sgf', 'B.sgf']);
    expect(later.async).not.toHaveBeenCalled();
  });
});
