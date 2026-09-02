import { describe, expect, it } from 'vitest';
import {
  centerPoint,
  chooseAntiMirrorMove,
  isCentral,
  isNearCentral,
  isOpponentMirroring,
  mirrorPoint,
} from '../src/utils/antiMirrorAi';
import type { BoardState, CandidateMove, Move, Player } from '../src/types';

const emptyBoard = (size = 19): BoardState =>
  Array.from({ length: size }, () => Array.from({ length: size }, () => null as Player | null));

const candidate = (x: number, y: number, pointsLost: number, order: number): CandidateMove => ({
  x,
  y,
  winRate: 0.5,
  scoreLead: 0,
  visits: 100,
  pointsLost,
  order,
});

/** Black plays, White answers on the mirror point, `count` times. */
const mirrorHistory = (count: number, size = 19): Move[] => {
  const moves: Move[] = [];
  for (let i = 0; i < count; i++) {
    const x = i % (size - 4);
    const y = (i * 3) % (size - 4);
    moves.push({ x, y, player: 'black' });
    moves.push({ x: size - 1 - x, y: size - 1 - y, player: 'white' });
  }
  return moves;
};

describe('KataGo location helpers', () => {
  it('mirrors through the centre', () => {
    expect(mirrorPoint({ x: 3, y: 3 }, 19)).toEqual({ x: 15, y: 15 });
    expect(mirrorPoint({ x: 9, y: 9 }, 19)).toEqual({ x: 9, y: 9 });
  });

  it('only has a centre point on odd boards', () => {
    expect(centerPoint(19)).toEqual({ x: 9, y: 9 });
    expect(centerPoint(9)).toEqual({ x: 4, y: 4 });
    expect(centerPoint(8)).toBeNull();
  });

  it('matches isCentral and isNearCentral', () => {
    expect(isCentral({ x: 9, y: 9 }, 19)).toBe(true);
    expect(isCentral({ x: 8, y: 9 }, 19)).toBe(false);
    expect(isNearCentral({ x: 8, y: 10 }, 19)).toBe(true);
    expect(isNearCentral({ x: 7, y: 9 }, 19)).toBe(false);
  });
});

describe('isOpponentMirroring', () => {
  it('spots a sustained mirror', () => {
    expect(
      isOpponentMirroring({ moveHistory: mirrorHistory(16), boardSize: 19, rootPlayer: 'black' })
    ).toBe(true);
  });

  it('uses KataGo\'s threshold exactly', () => {
    // mirrorCount >= 7 + 0.5 * totalCount, so an all-mirror game needs 14 replies.
    expect(
      isOpponentMirroring({ moveHistory: mirrorHistory(13), boardSize: 19, rootPlayer: 'black' })
    ).toBe(false);
    expect(
      isOpponentMirroring({ moveHistory: mirrorHistory(14), boardSize: 19, rootPlayer: 'black' })
    ).toBe(true);
  });

  it('needs more than a handful of mirrored moves', () => {
    expect(
      isOpponentMirroring({ moveHistory: mirrorHistory(3), boardSize: 19, rootPlayer: 'black' })
    ).toBe(false);
  });

  it('needs the most recent move to be a mirror too', () => {
    const history = mirrorHistory(16);
    history[history.length - 1] = { x: 0, y: 0, player: 'white' };
    expect(isOpponentMirroring({ moveHistory: history, boardSize: 19, rootPlayer: 'black' })).toBe(false);
  });

  it('ignores our own moves when counting', () => {
    // The same history seen from White's side: Black is not the one copying.
    expect(
      isOpponentMirroring({ moveHistory: mirrorHistory(16), boardSize: 19, rootPlayer: 'white' })
    ).toBe(false);
  });

  it('says no for an ordinary game', () => {
    const history: Move[] = [
      { x: 15, y: 3, player: 'black' },
      { x: 3, y: 15, player: 'white' },
      { x: 15, y: 15, player: 'black' },
      { x: 3, y: 3, player: 'white' },
    ];
    expect(isOpponentMirroring({ moveHistory: history, boardSize: 19, rootPlayer: 'black' })).toBe(false);
  });
});

describe('chooseAntiMirrorMove', () => {
  it('takes the centre point when it is available', () => {
    const choice = chooseAntiMirrorMove({
      candidates: [candidate(3, 3, 0, 0), candidate(9, 9, 1.2, 1)],
      board: emptyBoard(),
      boardSize: 19,
      opponent: 'white',
    });
    expect(choice?.move).toMatchObject({ x: 9, y: 9 });
    expect(choice?.reason).toContain('centre point');
  });

  it('leans on an opponent stone already on the centre', () => {
    const board = emptyBoard();
    board[9]![9] = 'white';
    const choice = chooseAntiMirrorMove({
      candidates: [candidate(3, 3, 0, 0), candidate(9, 8, 1.0, 1), candidate(11, 11, 0.5, 2)],
      board,
      boardSize: 19,
      opponent: 'white',
    });
    expect(choice?.move).toMatchObject({ x: 9, y: 8 });
    expect(choice?.reason).toContain('leaned');
  });

  it('will not throw the game away to break the mirror', () => {
    const choice = chooseAntiMirrorMove({
      candidates: [candidate(3, 3, 0, 0), candidate(9, 9, 40, 1)],
      board: emptyBoard(),
      boardSize: 19,
      opponent: 'white',
    });
    // The centre costs 40 points, so it is dropped; nothing else is central.
    expect(choice).toBeNull();
  });

  it('prefers the cheaper move inside the same tier', () => {
    const choice = chooseAntiMirrorMove({
      candidates: [candidate(8, 10, 2.0, 0), candidate(10, 8, 0.4, 1)],
      board: emptyBoard(),
      boardSize: 19,
      opponent: 'white',
    });
    expect(choice?.move).toMatchObject({ x: 10, y: 8 });
  });

  it('has nothing to say when every candidate is a pass', () => {
    expect(
      chooseAntiMirrorMove({
        candidates: [candidate(-1, -1, 0, 0)],
        board: emptyBoard(),
        boardSize: 19,
        opponent: 'white',
      })
    ).toBeNull();
  });
});
