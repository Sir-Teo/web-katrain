import { describe, expect, it } from 'vitest';
import {
  narrativeTagToneClass,
  parseResultString,
  tagsFromReport,
  tagsFromResult,
} from '../src/utils/narrativeTags';
import type { MoveReportEntry } from '../src/utils/gameReport';

const ids = (tags: { id: string }[]) => tags.map((tag) => tag.id).sort();

/** Only the fields narrativeTags reads; the rest of a report entry is irrelevant here. */
function entry(moveNumber: number, winRateAfter: number, scoreAfter = 0): MoveReportEntry {
  return { moveNumber, winRateAfter, scoreAfter } as unknown as MoveReportEntry;
}

/** A game whose black win rate walks through the given series. */
function game(series: number[], finalScore = 0): MoveReportEntry[] {
  return series.map((winRate, index) =>
    entry(index + 1, winRate, index === series.length - 1 ? finalScore : 0)
  );
}

describe('reading an SGF result string', () => {
  it('reads a winner and a point margin', () => {
    expect(parseResultString('B+12.5')).toEqual({
      winner: 'black', margin: 12.5, byResign: false, byTime: false, isVoid: false,
    });
    expect(parseResultString('W+3')).toMatchObject({ winner: 'white', margin: 3 });
  });

  it('reads the non-numeric endings', () => {
    expect(parseResultString('B+R')).toMatchObject({ winner: 'black', byResign: true, margin: null });
    expect(parseResultString('W+T')).toMatchObject({ winner: 'white', byTime: true, margin: null });
    expect(parseResultString('B+F')).toMatchObject({ winner: 'black', byResign: false, byTime: false });
  });

  it('reads the spelled-out forms real SGFs carry', () => {
    expect(parseResultString('B+Resign')).toMatchObject({ winner: 'black', byResign: true });
    expect(parseResultString('W+Time')).toMatchObject({ winner: 'white', byTime: true });
    expect(parseResultString('b+r')).toMatchObject({ winner: 'black', byResign: true });
  });

  it('reads the several spellings of a drawn game', () => {
    for (const value of ['Draw', 'draw', '0', 'Jigo']) {
      expect(parseResultString(value)).toMatchObject({ winner: 'draw' });
    }
  });

  it('marks a void or unknown result rather than guessing a winner', () => {
    expect(parseResultString('Void')).toMatchObject({ isVoid: true, winner: null });
    expect(parseResultString('?')).toMatchObject({ isVoid: true, winner: null });
  });

  it('has no opinion about a missing or unreadable result', () => {
    const empty = { winner: null, margin: null, byResign: false, byTime: false, isVoid: false };
    expect(parseResultString(undefined)).toEqual(empty);
    expect(parseResultString(null)).toEqual(empty);
    expect(parseResultString('   ')).toEqual(empty);
    expect(parseResultString('nonsense')).toEqual(empty);
    expect(parseResultString('B+')).toEqual(empty);
  });

  it('ignores whitespace around a result', () => {
    expect(parseResultString('  W+5.5  ')).toMatchObject({ winner: 'white', margin: 5.5 });
  });
});

describe('tags from the result alone', () => {
  it('labels a draw and stops there', () => {
    expect(ids(tagsFromResult('Draw'))).toEqual(['draw']);
  });

  it('labels a wide margin and a narrow one', () => {
    expect(ids(tagsFromResult('B+40'))).toEqual(['blowout']);
    expect(ids(tagsFromResult('W+1.5'))).toEqual(['close']);
  });

  it('leaves a middling margin unlabelled', () => {
    expect(tagsFromResult('B+10')).toEqual([]);
  });

  it('labels how a game ended when there is no margin', () => {
    expect(ids(tagsFromResult('B+R'))).toEqual(['resign']);
    expect(ids(tagsFromResult('W+T'))).toEqual(['time']);
  });

  it('says nothing about a void or missing result', () => {
    expect(tagsFromResult('Void')).toEqual([]);
    expect(tagsFromResult(undefined)).toEqual([]);
  });
});

describe('tags from the analyzed game', () => {
  it('says nothing about a game too short to have an arc', () => {
    expect(tagsFromReport(game([0.5, 0.5, 0.5]))).toEqual([]);
    expect(tagsFromReport([])).toEqual([]);
  });

  it('calls a recovery from a losing position a comeback', () => {
    // Black sinks to 0.1 and comes back to win.
    const tags = tagsFromReport(game([0.5, 0.5, 0.4, 0.1, 0.2, 0.6, 0.9]), 'B+R');
    expect(tags.map((tag) => tag.id)).toContain('comeback');
  });

  it('calls an unbroken lead wire-to-wire', () => {
    const tags = tagsFromReport(game([0.6, 0.7, 0.75, 0.8, 0.85, 0.9]), 'B+R');
    expect(tags.map((tag) => tag.id)).toContain('wire');
    expect(tags.map((tag) => tag.id)).not.toContain('comeback');
  });

  it('flags a near-decisive lead that was let slip', () => {
    // White reaches 0.95 (black at 0.05), then loses.
    const tags = tagsFromReport(game([0.5, 0.4, 0.2, 0.05, 0.3, 0.7, 0.9]), 'B+R');
    expect(tags.map((tag) => tag.id)).toContain('missedWin');
  });

  it('reads the winner from the result rather than the final win rate', () => {
    // The series ends favouring Black, but the result says White won.
    const tags = tagsFromReport(game([0.5, 0.55, 0.6, 0.7, 0.8, 0.9]), 'W+R');
    expect(tags.map((tag) => tag.id)).toContain('missedWin');
  });

  it('falls back to the final win rate when the result is missing', () => {
    const tags = tagsFromReport(game([0.5, 0.5, 0.5, 0.5, 0.5, 0.5]));
    expect(ids(tags)).toEqual(['close']);
  });

  it('does not call a resigned game close or a blowout on score', () => {
    // A resignation has no scored margin, so the score-based flavour is skipped.
    const tags = tagsFromReport(game([0.6, 0.7, 0.8, 0.85, 0.9, 0.95], 40), 'B+R');
    expect(tags.map((tag) => tag.id)).not.toContain('blowout');
  });

  it('adds a blowout from the final score when the game was scored out', () => {
    const tags = tagsFromReport(game([0.6, 0.7, 0.8, 0.85, 0.9, 0.95], 40), 'B+40');
    expect(tags.map((tag) => tag.id)).toContain('blowout');
  });

  it('never repeats a tag', () => {
    const tags = tagsFromReport(game([0.6, 0.7, 0.8, 0.85, 0.9, 0.95], 40), 'B+40');
    expect(new Set(tags.map((tag) => tag.id)).size).toBe(tags.length);
  });

  it('reads entries in move order however they arrive', () => {
    const inOrder = game([0.5, 0.4, 0.1, 0.3, 0.7, 0.9]);
    const shuffled = [...inOrder].reverse();
    expect(ids(tagsFromReport(shuffled, 'B+R'))).toEqual(ids(tagsFromReport(inOrder, 'B+R')));
  });
});

describe('tone classes', () => {
  it('gives each tone a distinct class', () => {
    const good = narrativeTagToneClass('good');
    const bad = narrativeTagToneClass('bad');
    const neutral = narrativeTagToneClass('neutral');
    expect(new Set([good, bad, neutral]).size).toBe(3);
    expect(good).toContain('emerald');
    expect(bad).toContain('rose');
  });
});
