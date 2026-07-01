import { describe, expect, it } from 'vitest';
import { computeGameTags, parseResultMargin, parseResultWinner } from '../src/utils/gameTags';
import type { MoveReportEntry, PlayerReportStats } from '../src/utils/gameReport';
import type { Player } from '../src/types';

const entry = (moveNumber: number, winRateAfter: number, player: Player = moveNumber % 2 === 1 ? 'black' : 'white'): MoveReportEntry =>
  ({
    moveNumber,
    player,
    winRateAfter,
    winRateBefore: winRateAfter,
    pointsLost: 0,
    pointsGained: 0,
    scoreBefore: 0,
    scoreAfter: 0,
    scoreDelta: 0,
    scoreSwing: 0,
    winRateDelta: 0,
    winRateSwing: 0,
    move: 'D4',
    phase: 'middleGame',
    node: {} as MoveReportEntry['node'],
  }) as MoveReportEntry;

const emptyStats: Record<Player, PlayerReportStats> = {
  black: { numMoves: 0 },
  white: { numMoves: 0 },
};

const steadyEntries = (count: number, winRateAfter: number): MoveReportEntry[] =>
  Array.from({ length: count }, (_, i) => entry(i + 1, winRateAfter));

describe('result parsing', () => {
  it('parses winners and margins', () => {
    expect(parseResultWinner('B+R')).toBe('black');
    expect(parseResultWinner('w+3.5')).toBe('white');
    expect(parseResultWinner('Void')).toBeNull();
    expect(parseResultMargin('W+0.5')).toBe(0.5);
    expect(parseResultMargin('B+R')).toBeNull();
  });
});

describe('computeGameTags', () => {
  it('tags marathon games from the record alone', () => {
    const tags = computeGameTags({
      entries: [],
      stats: emptyStats,
      boardSize: 19,
      moveCount: 280,
      result: 'B+R',
    });
    expect(tags.map((tag) => tag.id)).toContain('marathon');
  });

  it('tags close games from the result margin', () => {
    const tags = computeGameTags({
      entries: [],
      stats: emptyStats,
      boardSize: 19,
      moveCount: 200,
      result: 'W+0.5',
    });
    expect(tags.map((tag) => tag.id)).toEqual(['close-game']);
  });

  it('tags comeback and missed win when the winner was nearly lost', () => {
    const entries = [
      ...steadyEntries(30, 0.5),
      entry(31, 0.05), // black nearly lost mid-game
      ...Array.from({ length: 30 }, (_, i) => entry(32 + i, 0.9)),
    ];
    const tags = computeGameTags({
      entries,
      stats: emptyStats,
      boardSize: 19,
      moveCount: entries.length,
      result: 'B+R',
    });
    const ids = tags.map((tag) => tag.id);
    expect(ids).toContain('epic-comeback');
    expect(ids).toContain('missed-win');
  });

  it('does not tag comebacks without analysis coverage', () => {
    const tags = computeGameTags({
      entries: [entry(31, 0.05)],
      stats: emptyStats,
      boardSize: 19,
      moveCount: 200,
      result: 'B+R',
    });
    expect(tags.map((tag) => tag.id)).not.toContain('epic-comeback');
  });

  it('tags rollercoaster games with repeated lead changes', () => {
    const swings = [0.7, 0.3, 0.7, 0.3, 0.7, 0.3];
    const entries = swings.flatMap((wr, i) => steadyEntries(10, wr).map((e, j) => entry(i * 10 + j + 1, wr)));
    const tags = computeGameTags({
      entries,
      stats: emptyStats,
      boardSize: 19,
      moveCount: entries.length,
      result: 'B+R',
    });
    expect(tags.map((tag) => tag.id)).toContain('rollercoaster');
  });

  it('tags perfect play from player accuracy', () => {
    const entries = steadyEntries(80, 0.6);
    const stats: Record<Player, PlayerReportStats> = {
      black: { numMoves: 40, accuracy: 98, maxPtLoss: 1.2 },
      white: { numMoves: 40, accuracy: 70, maxPtLoss: 12 },
    };
    const tags = computeGameTags({
      entries,
      stats,
      boardSize: 19,
      moveCount: 80,
      result: 'B+R',
    });
    expect(tags.map((tag) => tag.id)).toContain('perfect-play');
  });

  it('returns no tags for a quiet, ordinary game', () => {
    const tags = computeGameTags({
      entries: steadyEntries(100, 0.55),
      stats: emptyStats,
      boardSize: 19,
      moveCount: 100,
      result: 'B+4.5',
    });
    expect(tags).toEqual([]);
  });
});
