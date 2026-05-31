import { parseGtpMove } from '../lib/gtp';
import { normalizeBoardSize } from './boardSize';
import { DEFAULT_BOARD_SIZE, type BoardState, type Move } from '../types';

const BOARD_IMAGE_SIZE = 640;
const BOARD_PADDING = 42;

function boardPoint(x: number, y: number, cell: number): { px: number; py: number } {
  return {
    px: BOARD_PADDING + x * cell,
    py: BOARD_PADDING + y * cell,
  };
}

function starPoints(boardSize: number): Array<[number, number]> {
  if (boardSize === 19) {
    return [
      [3, 3], [9, 3], [15, 3],
      [3, 9], [9, 9], [15, 9],
      [3, 15], [9, 15], [15, 15],
    ];
  }
  if (boardSize === 13) return [[3, 3], [9, 3], [6, 6], [3, 9], [9, 9]];
  if (boardSize === 9) return [[2, 2], [6, 2], [4, 4], [2, 6], [6, 6]];
  return [];
}

function drawStone(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: 'black' | 'white') {
  const grad = ctx.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.15, x, y, r);
  if (color === 'black') {
    grad.addColorStop(0, '#4b5563');
    grad.addColorStop(1, '#020617');
    ctx.strokeStyle = '#020617';
  } else {
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(1, '#cbd5e1');
    ctx.strokeStyle = '#64748b';
  }
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

function drawRing(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawSquare(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 4;
  ctx.strokeRect(x - r, y - r, r * 2, r * 2);
  ctx.restore();
}

export function captureReportBoardSnapshot(args: {
  board: BoardState;
  playedMove?: Move | null;
  bestMove?: string | null;
}): string | null {
  if (typeof document === 'undefined') return null;
  const boardSize = normalizeBoardSize(args.board.length, DEFAULT_BOARD_SIZE);
  if (boardSize <= 1) return null;

  try {
    const canvas = document.createElement('canvas');
    const scale = typeof window === 'undefined' ? 1 : Math.max(1, Math.min(window.devicePixelRatio || 1, 2));
    canvas.width = BOARD_IMAGE_SIZE * scale;
    canvas.height = BOARD_IMAGE_SIZE * scale;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.scale(scale, scale);

    const cell = (BOARD_IMAGE_SIZE - BOARD_PADDING * 2) / (boardSize - 1);
    const lineStart = BOARD_PADDING;
    const lineEnd = BOARD_IMAGE_SIZE - BOARD_PADDING;

    ctx.fillStyle = '#d7a85f';
    ctx.fillRect(0, 0, BOARD_IMAGE_SIZE, BOARD_IMAGE_SIZE);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(0, 0, BOARD_IMAGE_SIZE, BOARD_IMAGE_SIZE);

    ctx.strokeStyle = 'rgba(44, 24, 16, 0.78)';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < boardSize; i++) {
      const p = BOARD_PADDING + i * cell;
      ctx.beginPath();
      ctx.moveTo(lineStart, p);
      ctx.lineTo(lineEnd, p);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(p, lineStart);
      ctx.lineTo(p, lineEnd);
      ctx.stroke();
    }

    ctx.fillStyle = 'rgba(44, 24, 16, 0.78)';
    for (const [x, y] of starPoints(boardSize)) {
      const { px, py } = boardPoint(x, y, cell);
      ctx.beginPath();
      ctx.arc(px, py, 4.2, 0, Math.PI * 2);
      ctx.fill();
    }

    const stoneRadius = Math.max(10, cell * 0.44);
    for (let y = 0; y < boardSize; y++) {
      for (let x = 0; x < boardSize; x++) {
        const stone = args.board[y]?.[x];
        if (!stone) continue;
        const { px, py } = boardPoint(x, y, cell);
        drawStone(ctx, px, py, stoneRadius, stone);
      }
    }

    if (args.playedMove && args.playedMove.x >= 0 && args.playedMove.y >= 0) {
      const { px, py } = boardPoint(args.playedMove.x, args.playedMove.y, cell);
      drawRing(ctx, px, py, stoneRadius * 0.72, '#ef4444');
    }

    if (args.bestMove) {
      const best = parseGtpMove(args.bestMove, boardSize);
      if (best?.kind === 'move') {
        const { px, py } = boardPoint(best.x, best.y, cell);
        drawSquare(ctx, px, py, stoneRadius * 0.72, '#16a34a');
      }
    }

    return canvas.toDataURL('image/png');
  } catch {
    return null;
  }
}
