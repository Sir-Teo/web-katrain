import { describe, expect, it } from 'vitest';
import { DEFAULT_BOARD_SIZE } from '../src/types';
import { computeJapaneseManualScoreFromOwnership } from '../src/utils/manualScore';

function emptyBoard() {
  return Array.from({ length: DEFAULT_BOARD_SIZE }, () => Array.from({ length: DEFAULT_BOARD_SIZE }, () => null));
}

function grid(v: number) {
  return Array.from({ length: DEFAULT_BOARD_SIZE }, () => Array.from({ length: DEFAULT_BOARD_SIZE }, () => v));
}

describe('computeJapaneseManualScoreFromOwnership', () => {
  it('computes a deterministic score when ownership is confident', () => {
    const score = computeJapaneseManualScoreFromOwnership({
      board: emptyBoard(),
      komi: 6.5,
      capturedBlack: 0,
      capturedWhite: 0,
      currentOwnership: grid(1),
      previousOwnership: grid(1),
    });
    expect(score).toBe('B+354.5');
  });

  it('returns null when ownership is too uncertain', () => {
    const score = computeJapaneseManualScoreFromOwnership({
      board: emptyBoard(),
      komi: 6.5,
      capturedBlack: 0,
      capturedWhite: 0,
      currentOwnership: grid(0.5),
      previousOwnership: grid(0.5),
    });
    expect(score).toBe(null);
  });
});
