import { afterEach, describe, expect, it, vi } from 'vitest';
import { captureBoardSnapshot } from '../src/utils/boardSnapshot';

function makeRect(left: number, top: number, width: number, height: number) {
  return { left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) };
}

function makeCanvasContext() {
  return {
    drawImage: vi.fn(),
    fillRect: vi.fn(),
    scale: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    fillText: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
}

function stubSnapshotDom(options: {
  createElement?: () => unknown;
  getComputedStyle?: (element: Element) => Partial<CSSStyleDeclaration>;
  toDataURL?: () => string;
  coordinates?: HTMLElement[];
} = {}) {
  const context = makeCanvasContext();
  const canvas = {
    getContext: vi.fn(() => context),
    height: 0,
    toDataURL: options.toDataURL ?? vi.fn(() => 'data:image/png;base64,ok'),
    width: 0,
  };
  const layer = {
    getBoundingClientRect: vi.fn(() => makeRect(14, 18, 80, 60)),
  } as unknown as HTMLCanvasElement;
  const board = {
    getBoundingClientRect: vi.fn(() => makeRect(10, 12, 100, 90)),
    querySelectorAll: vi.fn((selector: string) => selector === 'canvas' ? [layer] : options.coordinates ?? []),
  } as unknown as HTMLElement;

  vi.stubGlobal('document', {
    createElement: vi.fn(options.createElement ?? (() => canvas)),
    querySelector: vi.fn(() => board),
  });
  vi.stubGlobal('window', {
    devicePixelRatio: 2,
    getComputedStyle:
      options.getComputedStyle ??
      vi.fn((element: Element) =>
        element === board
          ? { backgroundColor: '#d1b17c', backgroundImage: 'none', zIndex: '0' }
          : { backgroundColor: '', backgroundImage: 'none', zIndex: '4' }
      ),
  });

  return { board, canvas, context, layer };
}

describe('board snapshots', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('captures the board and canvas layers into a data URL', async () => {
    const { canvas, context, layer } = stubSnapshotDom();

    await expect(captureBoardSnapshot()).resolves.toBe('data:image/png;base64,ok');

    expect(canvas.width).toBe(200);
    expect(canvas.height).toBe(180);
    expect(context.scale).toHaveBeenCalledWith(2, 2);
    expect(context.fillRect).toHaveBeenCalledWith(0, 0, 100, 90);
    expect(context.drawImage).toHaveBeenCalledWith(layer, 4, 6, 80, 60);
  });

  it('uses fallback styles when getComputedStyle is blocked', async () => {
    const { context } = stubSnapshotDom({
      getComputedStyle: () => {
        throw new Error('style blocked');
      },
    });

    await expect(captureBoardSnapshot()).resolves.toBe('data:image/png;base64,ok');
    expect(context.fillRect).toHaveBeenCalledWith(0, 0, 100, 90);
  });

  it('includes visible coordinate labels with their displayed text and position', async () => {
    const column = { textContent: 'D', getBoundingClientRect: () => makeRect(44, 92, 12, 10) } as unknown as HTMLElement;
    const row = { textContent: '9', getBoundingClientRect: () => makeRect(12, 42, 8, 10) } as unknown as HTMLElement;
    const { context } = stubSnapshotDom({
      coordinates: [column, row],
      getComputedStyle: () => ({ backgroundColor: '#d1b17c', backgroundImage: 'none', font: '700 10px Arial', color: 'rgb(50, 40, 30)', zIndex: '4' }),
    });
    await expect(captureBoardSnapshot()).resolves.toBe('data:image/png;base64,ok');
    expect(context.fillText).toHaveBeenCalledWith('D', 40, 85);
    expect(context.fillText).toHaveBeenCalledWith('9', 6, 35);
  });

  it.each(['load', 'error'])('freezes the chosen position and geometry before a delayed texture %s', async outcome => {
    const { board, context, layer } = stubSnapshotDom();
    vi.stubGlobal('window', {
      devicePixelRatio: 2,
      getComputedStyle: (element: Element) => element === board
        ? { backgroundColor: '#d1b17c', backgroundImage: 'url(texture.png)' }
        : { zIndex: '4' },
    });
    const images: Array<{ onload: (() => void) | null; onerror: ((error: Error) => void) | null }> = [];
    vi.stubGlobal('Image', class {
      crossOrigin = '';
      src = '';
      onload: (() => void) | null = null;
      onerror: ((error: Error) => void) | null = null;
      constructor() { images.push(this); }
    });
    let position = 'chosen position';
    const captured: string[] = [];
    vi.mocked(context.drawImage).mockImplementation(source => {
      if (source === layer) captured.push(position);
    });
    const snapshot = captureBoardSnapshot();
    position = 'later move';
    vi.mocked(layer.getBoundingClientRect).mockReturnValue(makeRect(30, 40, 40, 30));
    if (outcome === 'load') images[0]!.onload!();
    else images[0]!.onerror!(new Error('texture unavailable'));
    await expect(snapshot).resolves.toBe('data:image/png;base64,ok');
    expect(captured).toEqual(['chosen position']);
    expect(context.drawImage).toHaveBeenCalledWith(layer, 4, 6, 80, 60);
  });

  it('returns null when canvas creation or export is blocked', async () => {
    stubSnapshotDom({
      createElement: () => {
        throw new Error('canvas blocked');
      },
    });
    await expect(captureBoardSnapshot()).resolves.toBeNull();

    stubSnapshotDom({
      toDataURL: () => {
        throw new Error('export blocked');
      },
    });
    await expect(captureBoardSnapshot()).resolves.toBeNull();
  });
});
