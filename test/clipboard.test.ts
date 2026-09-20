import { describe, expect, it, vi } from 'vitest';
import {
  CLIPBOARD_OPERATION_TIMEOUT_MS,
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

  it('times out stalled async clipboard operations', async () => {
    vi.useFakeTimers();
    try {
      const target = {
        clipboard: {
          writeText: vi.fn(() => new Promise<void>(() => {})),
          readText: vi.fn(() => new Promise<string>(() => {})),
        },
      } as unknown as Navigator;

      const writePromise = writeClipboardText('sgf', target);
      const readPromise = readClipboardText(target);
      await vi.advanceTimersByTimeAsync(CLIPBOARD_OPERATION_TIMEOUT_MS);

      await expect(writePromise).resolves.toBe(false);
      await expect(readPromise).resolves.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('uses legacy copy when async clipboard write stalls', async () => {
    vi.useFakeTimers();
    try {
      const target = {
        clipboard: {
          writeText: vi.fn(() => new Promise<void>(() => {})),
        },
      } as unknown as Navigator;
      const { target: legacyTarget } = createLegacyCopyDocument();

      const copyPromise = copyTextToClipboard('sgf', target, legacyTarget);
      await vi.advanceTimersByTimeAsync(CLIPBOARD_OPERATION_TIMEOUT_MS);

      await expect(copyPromise).resolves.toBe(true);
      expect(legacyTarget.execCommand).toHaveBeenCalledWith('copy');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('the legacy copy gives focus back', () => {
  /**
   * The fallback focuses a hidden textarea to select from it. Removing that
   * textarea left focus on `document.body`, so the "Copy details" button the
   * reader pressed stopped being where Tab resumed from -- on the one path that
   * only runs when the modern clipboard API was missing or refused.
   *
   * `restoreFocusIfUnclaimed` reads the *global* document, which this stands in
   * for: the suite runs without a DOM, so the focus moves the real elements
   * would make are made by hand here.
   */
  function withFocusTracking(run: (ctx: {
    button: { focus: ReturnType<typeof vi.fn> };
    setActive: (value: unknown) => void;
    body: object;
  }) => void) {
    const body = { nodeName: 'BODY' };
    const button = { focus: vi.fn() };
    let active: unknown = button;
    const stub = { body, get activeElement() { return active; } };
    const had = Object.getOwnPropertyDescriptor(globalThis, 'document');
    Object.defineProperty(globalThis, 'document', { value: stub, configurable: true, writable: true });
    try {
      run({ button, body, setActive: (value) => { active = value; } });
    } finally {
      if (had) Object.defineProperty(globalThis, 'document', had);
      else Reflect.deleteProperty(globalThis, 'document');
    }
  }

  it('restores the control that was focused before the copy', () => {
    withFocusTracking(({ button, body, setActive }) => {
      const { target, element } = createLegacyCopyDocument();
      // Focusing the textarea takes focus; removing it drops focus to body.
      (element.focus as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => setActive(element));
      target.body.removeChild.mockImplementation(() => setActive(body));

      expect(writeClipboardTextLegacy('copied', target as never)).toBe(true);
      expect(button.focus).toHaveBeenCalledWith({ preventScroll: true });
    });
  });

  it('leaves focus alone when something else claimed it', () => {
    withFocusTracking(({ button, setActive }) => {
      const dialog = { nodeName: 'DIALOG' };
      // Stands in for a dialog that opens and takes focus while the copy runs.
      const { target } = createLegacyCopyDocument(vi.fn(() => { setActive(dialog); return true; }));

      expect(writeClipboardTextLegacy('copied', target as never)).toBe(true);
      expect(button.focus).not.toHaveBeenCalled();
    });
  });

  it('does not fail a successful copy when the restore throws', () => {
    withFocusTracking(({ button, body, setActive }) => {
      button.focus.mockImplementation(() => { throw new Error('detached'); });
      const { target } = createLegacyCopyDocument();
      target.body.removeChild.mockImplementation(() => setActive(body));

      expect(writeClipboardTextLegacy('copied', target as never)).toBe(true);
      expect(button.focus).toHaveBeenCalled();
    });
  });
});
