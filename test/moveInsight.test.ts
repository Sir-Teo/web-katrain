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

  it('recognizes clean corner approaches and enclosures from Kaya patterns', () => {
    const lowApproachBoard = emptyBoard(19);
    lowApproachBoard[3]![16] = 'white';

    expect(getMoveInsight(blackMove(14, 2), 19, lowApproachBoard)).toMatchObject({
      label: 'Low approach',
      tone: 'corner',
      learnMoreUrl: 'https://senseis.xmp.net/?34PointLowApproach',
    });

    const highApproachBoard = emptyBoard(19);
    highApproachBoard[3]![15] = 'white';

    expect(getMoveInsight(blackMove(13, 3), 19, highApproachBoard)).toMatchObject({
      label: 'High approach',
      tone: 'corner',
      learnMoreUrl: 'https://senseis.xmp.net/?44PointHighApproach',
    });

    const lowEnclosureBoard = emptyBoard(19);
    lowEnclosureBoard[3]![16] = 'black';

    expect(getMoveInsight(blackMove(14, 2), 19, lowEnclosureBoard)).toMatchObject({
      label: 'Low enclosure',
      tone: 'corner',
      learnMoreUrl: 'https://senseis.xmp.net/?3453Enclosure',
    });

    const highEnclosureBoard = emptyBoard(19);
    highEnclosureBoard[3]![15] = 'black';

    expect(getMoveInsight(blackMove(13, 3), 19, highEnclosureBoard)).toMatchObject({
      label: 'High enclosure',
      tone: 'corner',
      learnMoreUrl: 'https://senseis.xmp.net/?4464Enclosure',
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

    const emptyTriangleBoard = emptyBoard(9);
    emptyTriangleBoard[0]![1] = 'black';
    emptyTriangleBoard[1]![0] = 'black';

    expect(getMoveInsight(blackMove(1, 1), 9, emptyTriangleBoard)).toMatchObject({
      label: 'Empty triangle',
      tone: 'tactical',
      learnMoreUrl: 'https://senseis.xmp.net/?EmptyTriangle',
    });

    const bambooJointBoard = emptyBoard(9);
    bambooJointBoard[0]![0] = 'black';
    bambooJointBoard[0]![1] = 'black';
    bambooJointBoard[2]![0] = 'black';

    expect(getMoveInsight(blackMove(1, 2), 9, bambooJointBoard)).toMatchObject({
      label: 'Bamboo joint',
      tone: 'tactical',
      learnMoreUrl: 'https://senseis.xmp.net/?BambooJoint',
    });

    const tigersMouthBoard = emptyBoard(9);
    tigersMouthBoard[1]![0] = 'black';
    tigersMouthBoard[2]![1] = 'black';

    expect(getMoveInsight(blackMove(2, 1), 9, tigersMouthBoard)).toMatchObject({
      label: "Tiger's mouth",
      tone: 'tactical',
      learnMoreUrl: 'https://senseis.xmp.net/?TigersMouth',
    });

    const cutBoard = emptyBoard(9);
    cutBoard[3]![4] = 'white';
    cutBoard[4]![3] = 'white';
    cutBoard[4]![4] = 'black';

    expect(getMoveInsight(blackMove(3, 3), 9, cutBoard)).toMatchObject({
      label: 'Cut',
      tone: 'tactical',
      learnMoreUrl: 'https://senseis.xmp.net/?Cut',
    });

    const haneBoard = emptyBoard(9);
    haneBoard[3]![4] = 'white';
    haneBoard[4]![4] = 'black';

    expect(getMoveInsight(blackMove(3, 3), 9, haneBoard)).toMatchObject({
      label: 'Hane',
      tone: 'tactical',
      learnMoreUrl: 'https://senseis.xmp.net/?Hane',
    });

    const wedgeBoard = emptyBoard(9);
    wedgeBoard[3]![3] = 'white';
    wedgeBoard[3]![5] = 'white';

    expect(getMoveInsight(blackMove(4, 3), 9, wedgeBoard)).toMatchObject({
      label: 'Wedge',
      tone: 'tactical',
      learnMoreUrl: 'https://senseis.xmp.net/?Wedge',
    });

    const shoulderHitBoard = emptyBoard(9);
    shoulderHitBoard[4]![4] = 'white';

    expect(getMoveInsight(blackMove(3, 3), 9, shoulderHitBoard)).toMatchObject({
      label: 'Shoulder hit',
      tone: 'tactical',
      learnMoreUrl: 'https://senseis.xmp.net/?ShoulderHit',
    });

    const attachmentBoard = emptyBoard(9);
    attachmentBoard[3]![4] = 'white';

    expect(getMoveInsight(blackMove(3, 3), 9, attachmentBoard)).toMatchObject({
      label: 'Attachment',
      tone: 'tactical',
      learnMoreUrl: 'https://senseis.xmp.net/?Attachment',
    });

    const diagonalBoard = emptyBoard(9);
    diagonalBoard[4]![4] = 'black';

    expect(getMoveInsight(blackMove(3, 3), 9, diagonalBoard)).toMatchObject({
      label: 'Diagonal (kosumi)',
      tone: 'tactical',
      learnMoreUrl: 'https://senseis.xmp.net/?Kosumi',
    });

    const onePointJumpBoard = emptyBoard(9);
    onePointJumpBoard[3]![5] = 'black';

    expect(getMoveInsight(blackMove(3, 3), 9, onePointJumpBoard)).toMatchObject({
      label: 'One-point jump',
      tone: 'tactical',
      learnMoreUrl: 'https://senseis.xmp.net/?OnePointJump',
    });

    const twoPointJumpBoard = emptyBoard(9);
    twoPointJumpBoard[3]![6] = 'black';

    expect(getMoveInsight(blackMove(3, 3), 9, twoPointJumpBoard)).toMatchObject({
      label: 'Two-point jump',
      tone: 'tactical',
      learnMoreUrl: 'https://senseis.xmp.net/?TwoPointJump',
    });

    const smallKnightBoard = emptyBoard(9);
    smallKnightBoard[4]![5] = 'black';

    expect(getMoveInsight(blackMove(3, 3), 9, smallKnightBoard)).toMatchObject({
      label: 'Small knight',
      tone: 'tactical',
      learnMoreUrl: 'https://senseis.xmp.net/?Keima',
    });

    const largeKnightBoard = emptyBoard(9);
    largeKnightBoard[4]![6] = 'black';

    expect(getMoveInsight(blackMove(3, 3), 9, largeKnightBoard)).toMatchObject({
      label: 'Large knight',
      tone: 'tactical',
      learnMoreUrl: 'https://senseis.xmp.net/?LargeKnightsMove',
    });

    const diagonalJumpBoard = emptyBoard(9);
    diagonalJumpBoard[5]![5] = 'black';

    expect(getMoveInsight(blackMove(3, 3), 9, diagonalJumpBoard)).toMatchObject({
      label: 'Diagonal jump',
      tone: 'tactical',
      learnMoreUrl: 'https://senseis.xmp.net/?DiagonalJump',
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
    expect(getMoveInsightCoach({ label: 'Empty triangle', detail: '', tone: 'tactical' })).toMatchObject({
      beginner: expect.stringContaining('slow and heavy'),
      checks: expect.arrayContaining(['Efficiency']),
    });
    expect(getMoveInsightCoach({ label: 'Bamboo joint', detail: '', tone: 'tactical' })).toMatchObject({
      beginner: expect.stringContaining('connects lightly'),
      checks: expect.arrayContaining(['Cut resistance']),
    });
    expect(getMoveInsightCoach({ label: "Tiger's mouth", detail: '', tone: 'tactical' })).toMatchObject({
      beginner: expect.stringContaining('cutting point'),
      checks: expect.arrayContaining(['Peep']),
    });
    expect(getMoveInsightCoach({ label: 'Cut', detail: '', tone: 'tactical' })).toMatchObject({
      beginner: expect.stringContaining('split'),
      checks: expect.arrayContaining(['Ladder']),
    });
    expect(getMoveInsightCoach({ label: 'Hane', detail: '', tone: 'tactical' })).toMatchObject({
      beginner: expect.stringContaining('bends around'),
      checks: expect.arrayContaining(['Counter-hane']),
    });
    expect(getMoveInsightCoach({ label: 'Wedge', detail: '', tone: 'tactical' })).toMatchObject({
      beginner: expect.stringContaining('pushes between'),
      checks: expect.arrayContaining(['Counter-cut']),
    });
    expect(getMoveInsightCoach({ label: 'Shoulder hit', detail: '', tone: 'tactical' })).toMatchObject({
      beginner: expect.stringContaining('leans on'),
      checks: expect.arrayContaining(['Direction']),
    });
    expect(getMoveInsightCoach({ label: 'Attachment', detail: '', tone: 'tactical' })).toMatchObject({
      beginner: expect.stringContaining('touches'),
      checks: expect.arrayContaining(['Crosscut']),
    });
    expect(getMoveInsightCoach({ label: 'Diagonal (kosumi)', detail: '', tone: 'tactical' })).toMatchObject({
      beginner: expect.stringContaining('connects lightly'),
      checks: expect.arrayContaining(['Efficiency']),
    });
    expect(getMoveInsightCoach({ label: 'One-point jump', detail: '', tone: 'tactical' })).toMatchObject({
      beginner: expect.stringContaining('extends quickly'),
      checks: expect.arrayContaining(['Peep']),
    });
    expect(getMoveInsightCoach({ label: 'Two-point jump', detail: '', tone: 'tactical' })).toMatchObject({
      beginner: expect.stringContaining('faster'),
      checks: expect.arrayContaining(['Invasion']),
    });
    expect(getMoveInsightCoach({ label: 'Small knight', detail: '', tone: 'tactical' })).toMatchObject({
      beginner: expect.stringContaining('flexible connection'),
      checks: expect.arrayContaining(['Attachment']),
    });
    expect(getMoveInsightCoach({ label: 'Large knight', detail: '', tone: 'tactical' })).toMatchObject({
      beginner: expect.stringContaining('wider'),
      checks: expect.arrayContaining(['Support']),
    });
    expect(getMoveInsightCoach({ label: 'Diagonal jump', detail: '', tone: 'tactical' })).toMatchObject({
      beginner: expect.stringContaining('links stones'),
      checks: expect.arrayContaining(['Forcing points']),
    });
    expect(getMoveInsightCoach({ label: 'Low approach', detail: '', tone: 'corner' })).toMatchObject({
      beginner: expect.stringContaining('stable base'),
      checks: expect.arrayContaining(['Pincer']),
    });
    expect(getMoveInsightCoach({ label: 'High approach', detail: '', tone: 'corner' })).toMatchObject({
      beginner: expect.stringContaining('outside influence'),
      checks: expect.arrayContaining(['Target']),
    });
    expect(getMoveInsightCoach({ label: 'Low enclosure', detail: '', tone: 'corner' })).toMatchObject({
      beginner: expect.stringContaining('secures the corner'),
      checks: expect.arrayContaining(['Corner secure']),
    });
    expect(getMoveInsightCoach({ label: 'High enclosure', detail: '', tone: 'corner' })).toMatchObject({
      beginner: expect.stringContaining('wider corner'),
      checks: expect.arrayContaining(['Invasion aji']),
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
