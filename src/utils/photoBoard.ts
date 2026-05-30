import type { BoardSize, Player } from '../types';
import { coordinateToSgf } from './sgf';

export type PhotoBoardStone = Player | null;

export interface PhotoBoardSetup {
  boardSize: BoardSize;
  stones: PhotoBoardStone[];
  komi?: number;
  nextPlayer?: Player;
  sourceName?: string;
}

const escapeSgfValue = (value: string): string =>
  value.replace(/\\/g, '\\\\').replace(/]/g, '\\]');

const playerToSgf = (player: Player): 'B' | 'W' => (player === 'black' ? 'B' : 'W');

export function buildPhotoBoardSetupSgf({
  boardSize,
  stones,
  komi = 6.5,
  nextPlayer = 'black',
  sourceName,
}: PhotoBoardSetup): string {
  if (stones.length !== boardSize * boardSize) {
    throw new Error(`Expected ${boardSize * boardSize} intersections for a ${boardSize}x${boardSize} board.`);
  }

  const black: string[] = [];
  const white: string[] = [];
  stones.forEach((stone, index) => {
    if (!stone) return;
    const x = index % boardSize;
    const y = Math.floor(index / boardSize);
    const point = coordinateToSgf(x, y);
    if (stone === 'black') black.push(point);
    else white.push(point);
  });

  const props = [
    'GM[1]',
    'FF[4]',
    'CA[UTF-8]',
    'AP[web-KaTrain:photo-board]',
    `SZ[${boardSize}]`,
    `KM[${Number.isFinite(komi) ? komi : 6.5}]`,
    `PL[${playerToSgf(nextPlayer)}]`,
    'GN[Photo board position]',
  ];
  if (sourceName?.trim()) props.push(`SO[${escapeSgfValue(sourceName.trim())}]`);
  if (black.length > 0) props.push(...black.map((point) => `AB[${point}]`));
  if (white.length > 0) props.push(...white.map((point) => `AW[${point}]`));
  props.push('C[Manual board import]');

  return `(;${props.join('')})`;
}
