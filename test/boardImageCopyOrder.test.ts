import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { copyBoardImage } from '../src/utils/boardImageExport';
import { captureBoardSnapshot } from '../src/utils/boardSnapshot';
import { copyTextToClipboard } from '../src/utils/clipboard';

vi.mock('../src/utils/boardSnapshot', () => ({ captureBoardSnapshot: vi.fn() }));
const image = (text: string) => `data:image/png;base64,${btoa(text)}`;
let contents: string;
let writeText: ReturnType<typeof vi.fn>;
beforeEach(() => {
  contents = '';
  vi.mocked(captureBoardSnapshot).mockReset();
  writeText = vi.fn(async (text: string) => { contents = text; });
  vi.stubGlobal('navigator', { clipboard: {
    writeText,
    write: vi.fn(async (items: Array<{ items: Record<string, Blob> }>) => {
      contents = await items[0]!.items['image/png']!.text();
    }),
  } });
  vi.stubGlobal('ClipboardItem', class {
    items: Record<string, Blob>;
    constructor(items: Record<string, Blob>) { this.items = items; }
  });
});
afterEach(() => vi.unstubAllGlobals());

describe('prepared board image copy ordering', () => {
  it('preserves text copied after an older image capture started', async () => {
    let finish!: (value: string) => void;
    vi.mocked(captureBoardSnapshot).mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    const older = copyBoardImage();
    await expect(copyTextToClipboard('newer text')).resolves.toBe(true);
    finish(image('older image'));
    await older;
    expect(contents).toBe('newer text');
  });

  it('preserves a newer image when an older capture finishes later', async () => {
    let finish!: (value: string) => void;
    vi.mocked(captureBoardSnapshot)
      .mockReturnValueOnce(new Promise(resolve => { finish = resolve; }))
      .mockResolvedValueOnce(image('newer image'));
    const older = copyBoardImage();
    await expect(copyBoardImage()).resolves.toBe(true);
    finish(image('older image'));
    await older;
    expect(contents).toBe('newer image');
  });

  it('keeps a newer image when an older text copy falls back after rejection', async () => {
    let reject!: (reason: Error) => void;
    writeText.mockImplementationOnce(() => new Promise<void>((_resolve, fail) => { reject = fail; }));
    const textarea = { value: '', style: {}, focus: vi.fn(), select: vi.fn(), setAttribute: vi.fn() };
    const legacy = {
      body: { appendChild: vi.fn(), removeChild: vi.fn() },
      createElement: vi.fn(() => textarea),
      execCommand: vi.fn(() => { contents = textarea.value; return true; }),
    };
    const older = copyTextToClipboard('older text', undefined, legacy as unknown as Document);
    vi.mocked(captureBoardSnapshot).mockResolvedValueOnce(image('newer image'));
    await expect(copyBoardImage()).resolves.toBe(true);
    reject(new Error('Old text write denied'));
    await older;
    expect(contents).toBe('newer image');
    expect(legacy.execCommand).not.toHaveBeenCalled();
  });
});
