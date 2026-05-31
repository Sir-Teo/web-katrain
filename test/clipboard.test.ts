import { describe, expect, it, vi } from 'vitest';
import {
  copyTextToClipboard,
  getClipboard,
  readClipboardText,
  writeClipboardText,
  writeClipboardTextLegacy,
} from '../src/utils/clipboard';

function createLegacyCopyDocument(execCommand = vi.fn(() => true)) {
  const element = {
    value: '',
    style: {},
    focus: vi.fn(),
    select: vi.fn(),
    setAttribute: vi.fn(),
  } as unknown as HTMLTextAreaElement;
  const body = {
    appendChild: vi.fn(),
    removeChild: vi.fn(),
  };
  const target = {
    body,
    createElement: vi.fn(() => element),
    execCommand,
  };

  return { body, element, target };
}

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

  it('uses a legacy selection fallback and cleans it up', async () => {
    const { body, element, target } = createLegacyCopyDocument();

    expect(writeClipboardTextLegacy('(;GM[1])', target)).toBe(true);

    expect(target.createElement).toHaveBeenCalledWith('textarea');
    expect(element.value).toBe('(;GM[1])');
    expect(element.setAttribute).toHaveBeenCalledWith('readonly', '');
    expect(element.focus).toHaveBeenCalledTimes(1);
    expect(element.select).toHaveBeenCalledTimes(1);
    expect(target.execCommand).toHaveBeenCalledWith('copy');
    expect(body.appendChild).toHaveBeenCalledWith(element);
    expect(body.removeChild).toHaveBeenCalledWith(element);
  });

  it('reports legacy copy failures without leaking temporary elements', () => {
    const execCommand = vi.fn(() => {
      throw new Error('copy blocked');
    });
    const { body, element, target } = createLegacyCopyDocument(execCommand);

    expect(writeClipboardTextLegacy('sgf', target)).toBe(false);
    expect(body.removeChild).toHaveBeenCalledWith(element);
    expect(writeClipboardTextLegacy('sgf', { body: null } as unknown as Document)).toBe(false);
    expect(writeClipboardTextLegacy('sgf', { ...target, execCommand: vi.fn(() => false) })).toBe(false);
  });

  it('falls back to legacy copy when the async clipboard is unavailable', async () => {
    const { target } = createLegacyCopyDocument();

    await expect(copyTextToClipboard('sgf', {} as Navigator, target)).resolves.toBe(true);
    expect(target.execCommand).toHaveBeenCalledWith('copy');
  });
});
