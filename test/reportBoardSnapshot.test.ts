import { afterEach, describe, expect, it, vi } from 'vitest';
import { captureReportBoardSnapshot } from '../src/utils/reportBoardSnapshot';
import type { BoardState } from '../src/types';
import { createEmptyBoard } from '../src/utils/boardSize';

const makeBoard = (): BoardState => {
  const board = createEmptyBoard(5);
  board[0][0] = 'black';
  board[1][1] = 'white';
  return board;
};

function makeCanvasContext() {
  const gradient = { addColorStop: vi.fn() };
  return {
    arc: vi.fn(),
    beginPath: vi.fn(),
    createRadialGradient: vi.fn(() => gradient),
    fill: vi.fn(),
    fillRect: vi.fn(),
    fillText: vi.fn(),
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

  it.each([5, 19] as const)('labels all four sides of a size-%i diagram with matching Go coordinates', (size) => {
    const { context } = stubCanvas();
    captureReportBoardSnapshot({ board: createEmptyBoard(size) });
    const labels = vi.mocked(context.fillText).mock.calls.map(call => call[0]);
    expect(labels).toHaveLength(size * 4);
    expect(labels.slice(0, 4)).toEqual(['A', 'A', String(size), String(size)]);
    expect(labels.slice(-4)).toEqual([size === 5 ? 'E' : 'T', size === 5 ? 'E' : 'T', '1', '1']);
    expect(labels).not.toContain('I');
    if (size === 19) expect(labels).toContain('J');
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
