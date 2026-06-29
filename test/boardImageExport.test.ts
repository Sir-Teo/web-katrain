import { describe, expect, it } from 'vitest';
import { dataUrlToBlob, getBoardImageFilename } from '../src/utils/boardImageExport';
import { writeClipboardImage } from '../src/utils/clipboard';
import type { GameNode } from '../src/types';

const nodeWith = (properties: Record<string, string[]>): GameNode =>
  ({ properties } as unknown as GameNode);

describe('getBoardImageFilename', () => {
  it('uses the game name and appends the move number', () => {
    const node = nodeWith({ GN: ['My Review'] });
    expect(getBoardImageFilename(node, 42)).toBe('My Review_move-42.png');
  });

  it('falls back to player names without a move suffix at move 0', () => {
    const node = nodeWith({ PB: ['Black'], PW: ['White'] });
    expect(getBoardImageFilename(node, 0)).toBe('Black vs White.png');
  });

  it('uses a timestamped name when no metadata is present', () => {
    const node = nodeWith({});
    expect(getBoardImageFilename(node, 0, 123)).toBe('game_123.png');
  });
});

describe('dataUrlToBlob', () => {
  it('decodes a base64 PNG data URL into a same-typed blob', () => {
    const blob = dataUrlToBlob('data:image/png;base64,aGVsbG8=');
    expect(blob).not.toBeNull();
    expect(blob?.type).toBe('image/png');
    expect(blob?.size).toBe(5); // "hello"
  });

  it('returns null for a non-data URL', () => {
    expect(dataUrlToBlob('not-a-data-url')).toBeNull();
  });
});

describe('writeClipboardImage', () => {
  const originalClipboardItem = (globalThis as { ClipboardItem?: unknown }).ClipboardItem;

  it('writes a ClipboardItem when the async clipboard and ClipboardItem are available', async () => {
    const written: unknown[] = [];
    (globalThis as { ClipboardItem?: unknown }).ClipboardItem = class {
      items: Record<string, Blob>;
      constructor(items: Record<string, Blob>) {
        this.items = items;
      }
    };
    const write = (items: unknown[]) => {
      written.push(...items);
      return Promise.resolve();
    };
    const target = { clipboard: { write } } as unknown as Navigator;

    const blob = new Blob(['x'], { type: 'image/png' });
    await expect(writeClipboardImage(blob, target)).resolves.toBe(true);
    expect(written).toHaveLength(1);

    (globalThis as { ClipboardItem?: unknown }).ClipboardItem = originalClipboardItem;
  });

  it('returns false when the clipboard cannot write images', async () => {
    (globalThis as { ClipboardItem?: unknown }).ClipboardItem = undefined;
    const target = { clipboard: {} } as unknown as Navigator;
    await expect(writeClipboardImage(new Blob(['x']), target)).resolves.toBe(false);
    (globalThis as { ClipboardItem?: unknown }).ClipboardItem = originalClipboardItem;
  });
});
