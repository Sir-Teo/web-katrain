import type { Player } from '../types';
import type { MoveReportEntry } from './gameReport';

// Auto-generated "narrative" chips summarising a game's arc, à la kifubara's
// Epic Comeback / Blowout / Close labels. Two tiers of signal:
//   - tagsFromResult: metadata-only (SGF RE), safe for library/pro-game cards.
//   - tagsFromReport: needs full move analysis (win-rate/score history).

export type NarrativeTagTone = 'good' | 'bad' | 'neutral';

export interface NarrativeTag {
  id: string;
  label: string;
  tone: NarrativeTagTone;
  title: string;
}

export interface ParsedResult {
  winner: Player | 'draw' | null;
  margin: number | null; // points, when the result is a numeric margin
  byResign: boolean;
  byTime: boolean;
  isVoid: boolean;
}

const RESULT_RE = /^([BW])\+(R|T|F|\d+(?:\.\d+)?)/i;

export function parseResultString(re?: string | null): ParsedResult {
  const empty: ParsedResult = { winner: null, margin: null, byResign: false, byTime: false, isVoid: false };
  if (!re || typeof re !== 'string') return empty;
  const trimmed = re.trim();
  if (!trimmed) return empty;
  const lower = trimmed.toLowerCase();
  if (lower === 'draw' || lower === '0' || lower === 'jigo') {
    return { ...empty, winner: 'draw' };
  }
  if (lower === 'void' || lower === '?') {
    return { ...empty, isVoid: true };
  }
  const match = RESULT_RE.exec(trimmed);
  if (!match) return empty;
  const winner: Player = match[1]!.toUpperCase() === 'B' ? 'black' : 'white';
  const detail = match[2]!.toUpperCase();
  if (detail === 'R') return { winner, margin: null, byResign: true, byTime: false, isVoid: false };
  if (detail === 'T') return { winner, margin: null, byResign: false, byTime: true, isVoid: false };
  if (detail === 'F') return { winner, margin: null, byResign: false, byTime: false, isVoid: false };
  const margin = Number.parseFloat(detail);
  return { winner, margin: Number.isFinite(margin) ? margin : null, byResign: false, byTime: false, isVoid: false };
}

const BLOWOUT_MARGIN = 25;
const CLOSE_MARGIN = 2;

/** Metadata-only tags derivable from the SGF result string alone. */
export function tagsFromResult(re?: string | null): NarrativeTag[] {
  const parsed = parseResultString(re);
  const tags: NarrativeTag[] = [];
  if (parsed.winner === 'draw') {
    tags.push({ id: 'draw', label: 'Draw', tone: 'neutral', title: 'The game was a draw (jigo).' });
    return tags;
  }
  if (parsed.margin != null) {
    if (parsed.margin >= BLOWOUT_MARGIN) {
      tags.push({ id: 'blowout', label: 'Blowout', tone: 'neutral', title: `Decided by ${parsed.margin} points.` });
    } else if (parsed.margin <= CLOSE_MARGIN) {
      tags.push({ id: 'close', label: 'Close', tone: 'neutral', title: `Decided by only ${parsed.margin} points.` });
    }
  } else if (parsed.byResign) {
    tags.push({ id: 'resign', label: 'Resignation', tone: 'neutral', title: 'The game ended by resignation.' });
  } else if (parsed.byTime) {
    tags.push({ id: 'time', label: 'Time', tone: 'neutral', title: 'The game was decided on time.' });
  }
  return tags;
}

const COMEBACK_LOW = 0.3; // eventual winner dipped to <= this win probability
const MISSED_WIN_HIGH = 0.85; // eventual loser reached >= this win probability
const WIRE_MARGIN = 0.5; // winner never crossed below this after the opening

/**
 * Analysis-derived tags. `entries` are the ordered, analyzed move entries from a
 * GameReport (winRateAfter/scoreAfter are black-positive). `re` refines the winner.
 */
export function tagsFromReport(entries: MoveReportEntry[], re?: string | null): NarrativeTag[] {
  const tags: NarrativeTag[] = [];
  if (!entries || entries.length < 4) return tags;

  const parsed = parseResultString(re);
  const ordered = [...entries].sort((a, b) => a.moveNumber - b.moveNumber);
  const finalEntry = ordered[ordered.length - 1]!;
  const finalBlackWin = finalEntry.winRateAfter;
  const finalScore = finalEntry.scoreAfter; // black-positive points

  // Winner: prefer the recorded result, else the final win-rate.
  const winner: Player | 'draw' | null =
    parsed.winner ?? (Math.abs(finalBlackWin - 0.5) < 0.02 ? 'draw' : finalBlackWin >= 0.5 ? 'black' : 'white');
  if (winner === 'draw' || winner == null) {
    if (Math.abs(finalScore) <= CLOSE_MARGIN) {
      tags.push({ id: 'close', label: 'Close', tone: 'neutral', title: 'A very tight game.' });
    }
    return tags;
  }

  // Ignore the noisy opening third when judging swings.
  const start = Math.min(ordered.length - 1, Math.max(2, Math.floor(ordered.length * 0.2)));
  const midGame = ordered.slice(start);
  const blackWinSeries = midGame.map((e) => e.winRateAfter);
  const minBlackWin = Math.min(...blackWinSeries);
  const maxBlackWin = Math.max(...blackWinSeries);

  // Comeback: the eventual winner was clearly losing at some point.
  const winnerLowestWin = winner === 'black' ? minBlackWin : 1 - maxBlackWin;
  if (winnerLowestWin <= COMEBACK_LOW) {
    tags.push({
      id: 'comeback',
      label: 'Comeback',
      tone: 'good',
      title: `${winner === 'black' ? 'Black' : 'White'} recovered from a losing position to win.`,
    });
  } else {
    // Wire-to-wire: the winner led from the opening on without ever falling behind.
    const winnerNeverBehind = winner === 'black' ? minBlackWin >= WIRE_MARGIN : maxBlackWin <= 1 - WIRE_MARGIN;
    if (winnerNeverBehind) {
      tags.push({ id: 'wire', label: 'Wire-to-wire', tone: 'neutral', title: `${winner === 'black' ? 'Black' : 'White'} led throughout.` });
    }
  }

  // Missed win: the eventual loser held a near-decisive lead and let it slip.
  const loserHighestWin = winner === 'black' ? 1 - minBlackWin : maxBlackWin;
  if (loserHighestWin >= MISSED_WIN_HIGH) {
    tags.push({
      id: 'missedWin',
      label: 'Missed win',
      tone: 'bad',
      title: `${winner === 'black' ? 'White' : 'Black'} reached a winning position but lost.`,
    });
  }

  // Margin-based flavour from the final analyzed score (only meaningful if the game was scored out).
  if (!parsed.byResign) {
    if (Math.abs(finalScore) >= BLOWOUT_MARGIN) {
      tags.push({ id: 'blowout', label: 'Blowout', tone: 'neutral', title: `Final lead of about ${Math.abs(finalScore).toFixed(0)} points.` });
    } else if (parsed.margin != null && parsed.margin <= CLOSE_MARGIN) {
      tags.push({ id: 'close', label: 'Close', tone: 'neutral', title: `Decided by only ${parsed.margin} points.` });
    }
  }

  return dedupeTags(tags);
}

function dedupeTags(tags: NarrativeTag[]): NarrativeTag[] {
  const seen = new Set<string>();
  const out: NarrativeTag[] = [];
  for (const tag of tags) {
    if (seen.has(tag.id)) continue;
    seen.add(tag.id);
    out.push(tag);
  }
  return out;
}

export function narrativeTagToneClass(tone: NarrativeTagTone): string {
  switch (tone) {
    case 'good':
      return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-500';
    case 'bad':
      return 'border-rose-500/40 bg-rose-500/10 text-rose-500';
    default:
      return 'border-[var(--ui-border)] bg-[var(--ui-surface)] text-[var(--ui-text-muted)]';
  }
}
