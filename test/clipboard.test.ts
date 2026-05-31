import { describe, expect, it, vi } from 'vitest';
import { getClipboard, readClipboardText, writeClipboardText } from '../src/utils/clipboard';

describe('clipboard helpers', () => {
  it('reads and writes through available clipboard APIs', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const readText = vi.fn().mockResolvedValue('(;GM[1])');
    const clipboard = { writeText, readText } as unknown as Clipboard;
    const target = { clipboard } as Navigator;

    expect(getClipboard(target)).toBe(clipboard);
    await expect(writeClipboardText('sgf', target)).resolves.toBe(true);
    await expect(readClipboardText(target)).resolves.toBe('(;GM[1])');
    expect(writeText).toHaveBeenCalledWith('sgf');
  });

  it('returns fallbacks when clipboard is missing or blocked', async () => {
    const blocked = {
      get clipboard() {
        throw new Error('clipboard blocked');
      },
    } as unknown as Navigator;
    const rejecting = {
      clipboard: {
        writeText: vi.fn().mockRejectedValue(new Error('denied')),
        readText: vi.fn().mockRejectedValue(new Error('denied')),
      },
    } as unknown as Navigator;

    expect(getClipboard(null)).toBeNull();
    expect(getClipboard(blocked)).toBeNull();
    await expect(writeClipboardText('sgf', blocked)).resolves.toBe(false);
    await expect(readClipboardText(blocked)).resolves.toBeNull();
    await expect(writeClipboardText('sgf', rejecting)).resolves.toBe(false);
    await expect(readClipboardText(rejecting)).resolves.toBeNull();
  });
});
