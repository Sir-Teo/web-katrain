import type { Player } from '../types';
import type { MoveReportEntry, PlayerReportStats } from './gameReport';

export type GameTagId =
  | 'epic-comeback'
  | 'missed-win'
  | 'rollercoaster'
  | 'close-game'
  | 'marathon'
  | 'perfect-play';

export type GameTag = {
  id: GameTagId;
  label: string;
  description: string;
};

export type GameTagsInput = {
  /** Move report entries in move order (as produced by computeGameReport). */
  entries: MoveReportEntry[];
  stats: Record<Player, PlayerReportStats>;
  boardSize: number;
  moveCount: number;
  /** SGF result string, e.g. "B+R", "W+3.5". */
  result?: string;
};

const COMEBACK_WIN_RATE = 0.1;
const LEAD_CHANGE_LOW = 0.4;
const LEAD_CHANGE_HIGH = 0.6;
const ROLLERCOASTER_LEAD_CHANGES = 4;
const CLOSE_GAME_MARGIN = 2.5;
const MIN_MOVE_FOR_SWING_TAGS = 20;
const PERFECT_ACCURACY = 96;
const PERFECT_MAX_POINT_LOSS = 2.5;
const PERFECT_MIN_MOVES = 30;
/** Fraction of moves that must be analyzed before swing tags are trusted. */
const MIN_ANALYSIS_COVERAGE = 0.6;

export const parseResultWinner = (result?: string): Player | null => {
  const trimmed = result?.trim().toUpperCase() ?? '';
  if (trimmed.startsWith('B+')) return 'black';
  if (trimmed.startsWith('W+')) return 'white';
  return null;
};

export const parseResultMargin = (result?: string): number | null => {
  const match = /^[BW]\+(\d+(?:\.\d+)?)$/.exec(result?.trim().toUpperCase() ?? '');
  return match ? Number(match[1]) : null;
};

const winRateFor = (player: Player, blackWinRate: number): number =>
  player === 'black' ? blackWinRate : 1 - blackWinRate;

const countLeadChanges = (entries: MoveReportEntry[]): number => {
  // Count 40%/60% band crossings so jitter around 50% is not a "lead change".
  let side: 'black' | 'white' | null = null;
  let changes = 0;
  for (const entry of entries) {
    const wr = entry.winRateAfter;
    const next = wr >= LEAD_CHANGE_HIGH ? 'black' : wr <= LEAD_CHANGE_LOW ? 'white' : null;
    if (!next) continue;
    if (side && next !== side) changes += 1;
    side = next;
  }
  return changes;
};

/**
 * Derives Kifubara-style descriptive tags for a finished, analyzed game.
 * Tags based on win-rate swings require enough analysis coverage; tags based
 * on the game record itself (marathon, close game) do not.
 */
export function computeGameTags(input: GameTagsInput): GameTag[] {
  const { entries, stats, boardSize, moveCount, result } = input;
  const tags: GameTag[] = [];
  const winner = parseResultWinner(result);
  const margin = parseResultMargin(result);

  if (moveCount >= Math.round(boardSize * boardSize * 0.7)) {
    tags.push({
      id: 'marathon',
      label: 'Marathon',
      description: `An unusually long game: ${moveCount} moves.`,
    });
  }

  if (margin !== null && margin <= CLOSE_GAME_MARGIN) {
    tags.push({
      id: 'close-game',
      label: 'Close game',
      description: `Decided by only ${margin} point${margin === 1 ? '' : 's'}.`,
    });
  }

  const hasCoverage =
    moveCount > 0 && entries.length >= Math.max(10, Math.floor(moveCount * MIN_ANALYSIS_COVERAGE));

  if (hasCoverage && winner) {
    const midGameEntries = entries.filter((entry) => entry.moveNumber >= MIN_MOVE_FOR_SWING_TAGS);
    const winnerLow = midGameEntries.reduce(
      (min, entry) => Math.min(min, winRateFor(winner, entry.winRateAfter)),
      1
    );
    if (winnerLow <= COMEBACK_WIN_RATE) {
      const winnerName = winner === 'black' ? 'Black' : 'White';
      const loserName = winner === 'black' ? 'White' : 'Black';
      tags.push({
        id: 'epic-comeback',
        label: 'Epic comeback',
        description: `${winnerName} won after falling to a ${Math.round(winnerLow * 100)}% win rate.`,
      });
      tags.push({
        id: 'missed-win',
        label: 'Missed win',
        description: `${loserName} let a ${Math.round((1 - winnerLow) * 100)}% win rate slip away.`,
      });
    }
  }

  if (hasCoverage) {
    const leadChanges = countLeadChanges(entries);
    if (leadChanges >= ROLLERCOASTER_LEAD_CHANGES) {
      tags.push({
        id: 'rollercoaster',
        label: 'Rollercoaster',
        description: `The lead changed hands ${leadChanges} times.`,
      });
    }

    for (const player of ['black', 'white'] as const) {
      const playerStats = stats[player];
      if (
        playerStats.numMoves >= PERFECT_MIN_MOVES &&
        (playerStats.accuracy ?? 0) >= PERFECT_ACCURACY &&
        (playerStats.maxPtLoss ?? Number.POSITIVE_INFINITY) <= PERFECT_MAX_POINT_LOSS
      ) {
        tags.push({
          id: 'perfect-play',
          label: 'Perfect play',
          description: `${player === 'black' ? 'Black' : 'White'} played at ${Math.round(playerStats.accuracy ?? 0)}% accuracy without a single real mistake.`,
        });
        break;
      }
    }
  }

  return tags;
}
