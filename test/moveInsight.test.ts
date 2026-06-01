import { describe, expect, it } from 'vitest';
import { getMoveInsight, getMoveInsightCoach } from '../src/utils/moveInsight';
import type { Move } from '../src/types';

const blackMove = (x: number, y: number): Move => ({ x, y, player: 'black' });

describe('move insights', () => {
  it('names standard corner points on a 19x19 board', () => {
    expect(getMoveInsight(blackMove(3, 15), 19)).toMatchObject({
      label: '4-4 star point',
      tone: 'corner',
      learnMoreUrl: 'https://senseis.xmp.net/?44Point',
    });
    expect(getMoveInsight(blackMove(2, 16), 19)).toMatchObject({
      label: '3-3 corner point',
      tone: 'corner',
      learnMoreUrl: 'https://senseis.xmp.net/?33Point',
    });
    expect(getMoveInsight(blackMove(3, 16), 19)).toMatchObject({
      label: '3-4 corner point',
      tone: 'corner',
      learnMoreUrl: 'https://senseis.xmp.net/?34Point',
    });
  });

  it('distinguishes center and side star points', () => {
    expect(getMoveInsight(blackMove(9, 9), 19)).toMatchObject({
      label: 'Tengen',
      tone: 'center',
      learnMoreUrl: 'https://senseis.xmp.net/?Tengen',
    });
    expect(getMoveInsight(blackMove(3, 9), 19)).toMatchObject({
      label: 'Side star point',
      tone: 'side',
      learnMoreUrl: 'https://senseis.xmp.net/?StarPoint',
    });
  });

  it('describes side lines and pass moves', () => {
    expect(getMoveInsight(blackMove(9, 16), 19)).toMatchObject({
      label: '3rd-line side move',
      tone: 'side',
    });
    expect(getMoveInsight(blackMove(-1, -1), 19)).toMatchObject({
      label: 'Pass',
      tone: 'pass',
      learnMoreUrl: 'https://senseis.xmp.net/?Pass',
    });
  });

  it('returns null for root or out-of-board moves', () => {
    expect(getMoveInsight(null, 19)).toBeNull();
    expect(getMoveInsight(blackMove(19, 3), 19)).toBeNull();
  });

  it('adds beginner and pro coach cues for common shapes', () => {
    const starPoint = getMoveInsight(blackMove(3, 15), 19);
    const sideMove = getMoveInsight(blackMove(9, 16), 19);
    const pass = getMoveInsight(blackMove(-1, -1), 19);

    expect(starPoint && getMoveInsightCoach(starPoint)).toMatchObject({
      beginner: expect.stringContaining('develops quickly'),
      checks: expect.arrayContaining(['Approach side']),
    });
    expect(sideMove && getMoveInsightCoach(sideMove)).toMatchObject({
      beginner: expect.stringContaining('territory'),
      checks: expect.arrayContaining(['Extension']),
    });
    expect(pass && getMoveInsightCoach(pass)).toMatchObject({
      pro: expect.stringContaining('ko threats'),
      checks: expect.arrayContaining(['Life and death?']),
    });
  });
});
