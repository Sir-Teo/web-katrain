import type { GameNode, Player } from '../types';

/**
 * Clock data recorded in the SGF itself: `BL`/`WL` hold the seconds left on a
 * player's clock after their move, and `OB`/`OW` the byo-yomi periods they have
 * left. OGS, KGS, Fox and Tygem all write them, and nothing in the app read
 * them before -- the properties simply rode along in `node.properties`.
 *
 * What this is for: seeing where the clock went. A move that lost four points
 * after two seconds is a different mistake from one that lost four points after
 * eight minutes, and only the first is a habit worth fixing.
 */

export type ByoYomiSpec = { periods: number; periodSeconds: number };

export type MoveTime = {
  /** 1-based index of the move within the line. */
  moveNumber: number;
  player: Player;
  /** Seconds left on the clock after this move, from `BL`/`WL`. */
  timeLeftSeconds: number | null;
  /** Byo-yomi periods left after this move, from `OB`/`OW`. */
  periodsLeft: number | null;
  /**
   * Seconds spent on this move, or null when the SGF does not determine it.
   * See `computeMoveTimes` for exactly when that happens -- guessing a number
   * here would be worse than admitting the file does not say.
   */
  secondsSpent: number | null;
  /** True once the player is counting down periods rather than main time. */
  inByoYomi: boolean;
};

const parseSeconds = (raw: string | undefined): number | null => {
  if (raw === undefined) return null;
  const value = Number.parseFloat(raw.trim());
  if (!Number.isFinite(value) || value < 0) return null;
  return value;
};

const parseCount = (raw: string | undefined): number | null => {
  if (raw === undefined) return null;
  const value = Number.parseInt(raw.trim(), 10);
  if (!Number.isFinite(value) || value < 0) return null;
  return value;
};

/** Main time in seconds from the root `TM` property. */
export function parseMainTimeSeconds(properties: Record<string, string[]> | undefined): number | null {
  return parseSeconds(properties?.TM?.[0]);
}

/**
 * Byo-yomi from the root `OT` property. `OT` is free text by specification, so
 * only the `N x M byo-yomi` shape that OGS, KGS and Fox all write is recognised;
 * Canadian (`25/300`) and Fischer overtime describe a different clock and are
 * deliberately not squeezed into this shape.
 */
export function parseByoYomi(properties: Record<string, string[]> | undefined): ByoYomiSpec | null {
  const raw = properties?.OT?.[0];
  if (!raw) return null;
  const match = /(\d+)\s*[x*]\s*(\d+(?:\.\d+)?)/i.exec(raw);
  if (!match) return null;
  const periods = Number.parseInt(match[1]!, 10);
  const periodSeconds = Number.parseFloat(match[2]!);
  if (!Number.isFinite(periods) || !Number.isFinite(periodSeconds)) return null;
  if (periods <= 0 || periodSeconds <= 0) return null;
  return { periods, periodSeconds };
}

/**
 * Derives per-move thinking time for a line of play.
 *
 * `secondsSpent` is a plain difference between successive clock readings for
 * the same player, which is right for the whole main-time phase. It is reported
 * as null in three cases, all of them genuinely undetermined by the file:
 *
 * - the first move of a player when the root carries no `TM`, so there is no
 *   reading to subtract from;
 * - a move that crosses a byo-yomi period boundary (`OB`/`OW` changed), since
 *   the file records only the periods left, not how far into one the move fell;
 * - a move after which the clock reads *higher* than before it, which is a
 *   period renewing. The renewal discards exactly the number this would want.
 *
 * Guessing through those would put invented numbers next to measured ones in
 * the same series, which is the one thing a time graph must not do.
 */
export function computeMoveTimes(
  lineNodes: GameNode[],
  rootProperties?: Record<string, string[]>
): MoveTime[] {
  const mainTimeSeconds = parseMainTimeSeconds(rootProperties);
  const byoYomi = parseByoYomi(rootProperties);

  const previousTime: Record<Player, number | null> = {
    black: mainTimeSeconds,
    white: mainTimeSeconds,
  };
  const previousPeriods: Record<Player, number | null> = {
    black: byoYomi ? byoYomi.periods : null,
    white: byoYomi ? byoYomi.periods : null,
  };

  const out: MoveTime[] = [];
  let moveNumber = 0;

  for (const node of lineNodes) {
    const move = node.move;
    if (!move) continue;
    moveNumber += 1;

    const player = move.player;
    const props = node.properties;
    const timeLeftSeconds = parseSeconds(player === 'black' ? props?.BL?.[0] : props?.WL?.[0]);
    const periodsLeft = parseCount(player === 'black' ? props?.OB?.[0] : props?.OW?.[0]);

    const previous = previousTime[player];
    const previousPeriodCount = previousPeriods[player];

    let secondsSpent: number | null = null;
    const crossedPeriod =
      periodsLeft !== null && previousPeriodCount !== null && periodsLeft !== previousPeriodCount;
    if (timeLeftSeconds !== null && previous !== null && !crossedPeriod && timeLeftSeconds <= previous) {
      secondsSpent = previous - timeLeftSeconds;
    }

    out.push({
      moveNumber,
      player,
      timeLeftSeconds,
      periodsLeft,
      secondsSpent,
      inByoYomi: periodsLeft !== null,
    });

    if (timeLeftSeconds !== null) previousTime[player] = timeLeftSeconds;
    if (periodsLeft !== null) previousPeriods[player] = periodsLeft;
  }

  return out;
}

/** True when the line carries enough clock data to be worth charting. */
export function hasMoveTimeData(times: MoveTime[]): boolean {
  return times.some((entry) => entry.secondsSpent !== null);
}

/** Compact clock reading, e.g. `8s`, `1:04`, `12:30`. */
export function formatMoveTime(seconds: number): string {
  const rounded = Math.round(seconds);
  if (rounded < 60) return `${rounded}s`;
  const minutes = Math.floor(rounded / 60);
  const remainder = rounded % 60;
  return `${minutes}:${String(remainder).padStart(2, '0')}`;
}
