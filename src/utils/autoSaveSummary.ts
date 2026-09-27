import type { BoardState } from '../types';
import { applyCapturesInPlace, applySelfCaptureInPlace } from './gameLogic';
import { formatGameInfoPlayer, readRootInfoValue } from './gameInfoDisplay';
import { getSgfDownloadFilenameFromProperties, parseSgf } from './sgf';

/** What the recovery prompt shows about a copy, so restoring or discarding it is not a blind choice. */
export type AutoSaveSummary = {
  players: string;
  /** Moves on the main line; null when the copy could not be read. */
  moveCount: number | null;
  boardSize: number | null;
  /** Final position of the main line, for the preview. */
  board: BoardState | null;
  lastMove: { x: number; y: number } | null;
  filename: string;
};

export function formatAutoSaveMoveCount(moveCount: number): string {
  return `${moveCount} ${moveCount === 1 ? 'move' : 'moves'}`;
}

export function summarizeAutoSavedGame(sgf: string, savedAt: number): AutoSaveSummary {
  try {
    const parsed = parseSgf(sgf);
    const props = parsed.tree?.props ?? {};
    const black = formatGameInfoPlayer(readRootInfoValue(props, 'PB'), readRootInfoValue(props, 'BR'), 'Black');
    const white = formatGameInfoPlayer(readRootInfoValue(props, 'PW'), readRootInfoValue(props, 'WR'), 'White');
    const board = parsed.initialBoard.map((row) => [...row]);
    let lastMove: AutoSaveSummary['lastMove'] = null;
    for (const move of parsed.moves) {
      if (move.x < 0 || move.y < 0) continue; // pass
      board[move.y]![move.x] = move.player;
      applyCapturesInPlace(board, move.x, move.y, move.player);
      applySelfCaptureInPlace(board, move.x, move.y);
      lastMove = { x: move.x, y: move.y };
    }
    return {
      players: `${black} vs ${white}`,
      moveCount: parsed.moves.length,
      boardSize: board.length,
      board,
      lastMove,
      filename: getSgfDownloadFilenameFromProperties(props, savedAt),
    };
  } catch {
    // Unreadable: it can still be downloaded as it is.
    return {
      players: 'Unreadable game record',
      moveCount: null,
      boardSize: null,
      board: null,
      lastMove: null,
      filename: `recovered_${savedAt}.sgf`,
    };
  }
}
