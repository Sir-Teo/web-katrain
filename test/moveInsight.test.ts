import { describe, expect, it } from 'vitest';
import { getMoveInsight, getMoveInsightCoach } from '../src/utils/moveInsight';
import type { BoardState, Move } from '../src/types';

const blackMove = (x: number, y: number): Move => ({ x, y, player: 'black' });
const whiteMove = (x: number, y: number): Move => ({ x, y, player: 'white' });
const emptyBoard = (size: number): BoardState => Array.from({ length: size }, () => Array.from({ length: size }, () => null));

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

  it('prefers tactical capture, atari, and connect labels when parent board context is available', () => {
    const captureBoard = emptyBoard(9);
    captureBoard[0]![1] = 'white';
    captureBoard[0]![2] = 'black';
    captureBoard[1]![1] = 'black';

    expect(getMoveInsight(blackMove(0, 0), 9, captureBoard)).toMatchObject({
      label: 'Capture',
      tone: 'tactical',
      detail: expect.stringContaining('Captures 1 white stone'),
    });

    const atariBoard = emptyBoard(9);
    atariBoard[0]![1] = 'white';
    atariBoard[1]![1] = 'black';

    expect(getMoveInsight(blackMove(0, 0), 9, atariBoard)).toMatchObject({
      label: 'Atari',
      tone: 'tactical',
      learnMoreUrl: 'https://senseis.xmp.net/?Atari',
    });

    const selfAtariBoard = emptyBoard(9);
    selfAtariBoard[0]![1] = 'white';
    selfAtariBoard[1]![0] = 'white';
    selfAtariBoard[1]![2] = 'white';

    expect(getMoveInsight(blackMove(1, 1), 9, selfAtariBoard)).toMatchObject({
      label: 'Self-atari',
      tone: 'tactical',
      detail: expect.stringContaining('only one liberty'),
    });

    const suicideBoard = emptyBoard(9);
    suicideBoard[0]![1] = 'white';
    suicideBoard[1]![0] = 'white';
    suicideBoard[1]![2] = 'white';
    suicideBoard[2]![1] = 'white';

    expect(getMoveInsight(blackMove(1, 1), 9, suicideBoard)).toMatchObject({
      label: 'Suicide',
      tone: 'tactical',
      learnMoreUrl: 'https://senseis.xmp.net/?Suicide',
    });

    const connectBoard = emptyBoard(9);
    connectBoard[1]![0] = 'white';
    connectBoard[1]![2] = 'white';

    expect(getMoveInsight(whiteMove(1, 1), 9, connectBoard)).toMatchObject({
      label: 'Connect',
      tone: 'tactical',
    });

    const fillBoard = emptyBoard(9);
    fillBoard[0]![1] = 'black';
    fillBoard[1]![0] = 'black';
    fillBoard[1]![2] = 'black';
    fillBoard[2]![1] = 'black';

    expect(getMoveInsight(blackMove(1, 1), 9, fillBoard)).toMatchObject({
      label: 'Fill',
      tone: 'tactical',
      detail: expect.stringContaining('fully surrounded'),
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

  it('adds beginner and pro coach cues for tactical labels', () => {
    expect(getMoveInsightCoach({ label: 'Atari', detail: '', tone: 'tactical' })).toMatchObject({
      beginner: expect.stringContaining('one liberty'),
      checks: expect.arrayContaining(['Escape route']),
    });
    expect(getMoveInsightCoach({ label: 'Capture', detail: '', tone: 'tactical' })).toMatchObject({
      pro: expect.stringContaining('snapback'),
      checks: expect.arrayContaining(['Ko']),
    });
    expect(getMoveInsightCoach({ label: 'Self-atari', detail: '', tone: 'tactical' })).toMatchObject({
      beginner: expect.stringContaining('captured next'),
      checks: expect.arrayContaining(['Ladder']),
    });
    expect(getMoveInsightCoach({ label: 'Suicide', detail: '', tone: 'tactical' })).toMatchObject({
      pro: expect.stringContaining('ruleset'),
      checks: expect.arrayContaining(['Legality']),
    });
    expect(getMoveInsightCoach({ label: 'Connect', detail: '', tone: 'tactical' })).toMatchObject({
      beginner: expect.stringContaining('harder to cut'),
      checks: expect.arrayContaining(['Shape']),
    });
    expect(getMoveInsightCoach({ label: 'Fill', detail: '', tone: 'tactical' })).toMatchObject({
      pro: expect.stringContaining('seki'),
      checks: expect.arrayContaining(['Eye shape']),
    });
  });
});
