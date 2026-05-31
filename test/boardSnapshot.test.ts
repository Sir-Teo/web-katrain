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
  } as unknown as CanvasRenderingContext2D;
}

function stubSnapshotDom(options: {
  createElement?: () => unknown;
  getComputedStyle?: (element: Element) => Partial<CSSStyleDeclaration>;
  toDataURL?: () => string;
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
    querySelectorAll: vi.fn(() => [layer]),
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
