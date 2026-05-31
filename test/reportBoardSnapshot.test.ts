import { afterEach, describe, expect, it, vi } from 'vitest';
import { captureReportBoardSnapshot } from '../src/utils/reportBoardSnapshot';
import type { BoardState } from '../src/types';

const makeBoard = (): BoardState => [
  ['black', null, null],
  [null, 'white', null],
  [null, null, null],
];

function makeCanvasContext() {
  const gradient = { addColorStop: vi.fn() };
  return {
    arc: vi.fn(),
    beginPath: vi.fn(),
    createRadialGradient: vi.fn(() => gradient),
    fill: vi.fn(),
    fillRect: vi.fn(),
    lineTo: vi.fn(),
    moveTo: vi.fn(),
    restore: vi.fn(),
    save: vi.fn(),
    scale: vi.fn(),
    stroke: vi.fn(),
    strokeRect: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
}

function stubCanvas(toDataURL = vi.fn(() => 'data:image/png;base64,ok')) {
  const context = makeCanvasContext();
  const canvas = {
    getContext: vi.fn(() => context),
    height: 0,
    toDataURL,
    width: 0,
  };
  vi.stubGlobal('document', {
    createElement: vi.fn(() => canvas),
  });
  vi.stubGlobal('window', { devicePixelRatio: 2 });
  return { canvas, context };
}

describe('report board snapshots', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders a report snapshot data URL when canvas export is available', () => {
    const { canvas } = stubCanvas();

    expect(captureReportBoardSnapshot({ board: makeBoard(), playedMove: { x: 0, y: 0, player: 'black' }, bestMove: 'C1' }))
      .toBe('data:image/png;base64,ok');
    expect(canvas.getContext).toHaveBeenCalledWith('2d');
  });

  it('returns null when canvas creation or export is blocked', () => {
    stubCanvas(vi.fn(() => {
      throw new Error('canvas export blocked');
    }));
    expect(captureReportBoardSnapshot({ board: makeBoard() })).toBeNull();

    vi.stubGlobal('document', {
      createElement: vi.fn(() => {
        throw new Error('canvas blocked');
      }),
    });
    expect(captureReportBoardSnapshot({ board: makeBoard() })).toBeNull();
  });
});
