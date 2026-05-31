import { describe, expect, it } from 'vitest';
import type { AnalysisResult, CandidateMove, GameNode, Move } from '../src/types';
import { formatBoardMoveLabel, getPlayedMoveQuality } from '../src/utils/playedMoveQuality';

const board = (size = 19) => Array.from({ length: size }, () => Array.from({ length: size }, () => null));
const territory = (size = 19) => Array.from({ length: size }, () => Array.from({ length: size }, () => 0));

function candidate(partial: Partial<CandidateMove> & Pick<CandidateMove, 'x' | 'y' | 'order'>): CandidateMove {
  return {
    x: partial.x,
    y: partial.y,
    order: partial.order,
    winRate: partial.winRate ?? 0.5,
    scoreLead: partial.scoreLead ?? 0,
    visits: partial.visits ?? 100,
    pointsLost: partial.pointsLost ?? 0,
  };
}

function analysis(moves: CandidateMove[]): AnalysisResult {
  return {
    rootWinRate: 0.5,
    rootScoreLead: 0,
    moves,
    territory: territory(),
  };
}

function node(args: { move: Move | null; parent: GameNode | null; analysis?: AnalysisResult | null }): GameNode {
  return {
    id: Math.random().toString(36),
    parent: args.parent,
    children: [],
    move: args.move,
    gameState: {
      board: board(),
      currentPlayer: args.move?.player === 'black' ? 'white' : 'black',
      moveHistory: args.move ? [args.move] : [],
      capturedBlack: 0,
      capturedWhite: 0,
      komi: 6.5,
    },
    analysis: args.analysis ?? null,
    analysisVisitsRequested: 0,
  };
}

describe('played move quality', () => {
  it('formats board coordinates using GTP-style labels', () => {
    expect(formatBoardMoveLabel({ x: 0, y: 0 }, 19)).toBe('A19');
    expect(formatBoardMoveLabel({ x: 8, y: 18 }, 19)).toBe('J1');
    expect(formatBoardMoveLabel({ x: -1, y: -1 }, 19)).toBe('Pass');
  });

  it('labels the played move when it matches the engine top move', () => {
    const move = { x: 3, y: 15, player: 'black' as const };
    const root = node({
      move: null,
      parent: null,
      analysis: analysis([candidate({ x: 3, y: 15, order: 0, pointsLost: 0 })]),
    });
    const played = node({ move, parent: root });

    expect(getPlayedMoveQuality(played)).toMatchObject({
      moveLabel: 'D4',
      playerLabel: 'B',
      rank: 1,
      rankLabel: '#1',
      valueLabel: 'Best',
      detailLabel: 'B D4 #1',
      tone: 'success',
    });
  });

  it('surfaces rank, loss, and best move for non-best candidates', () => {
    const root = node({
      move: null,
      parent: null,
      analysis: analysis([
        candidate({ x: 3, y: 15, order: 0, pointsLost: 0 }),
        candidate({ x: 10, y: 10, order: 1, pointsLost: 0.4 }),
        candidate({ x: 15, y: 3, order: 2, pointsLost: 2.4 }),
      ]),
    });
    const played = node({ move: { x: 15, y: 3, player: 'white' }, parent: root });

    const quality = getPlayedMoveQuality(played);
    expect(quality).toMatchObject({
      moveLabel: 'Q16',
      playerLabel: 'W',
      rank: 3,
      rankLabel: '#3',
      valueLabel: 'Lost 2.4',
      detailLabel: 'W Q16 #3',
      tone: 'danger',
    });
    expect(quality?.title).toContain('best was D4');
  });

  it('falls back to point loss when the move is outside the engine candidate list', () => {
    const root = node({ move: null, parent: null, analysis: analysis([]) });
    const played = node({ move: { x: 10, y: 10, player: 'black' }, parent: root });

    expect(getPlayedMoveQuality(played, -0.3)).toMatchObject({
      moveLabel: 'L9',
      playerLabel: 'B',
      rank: null,
      rankLabel: 'Unranked',
      valueLabel: 'Gain 0.3',
      detailLabel: 'B L9',
      tone: 'success',
    });
  });
});
