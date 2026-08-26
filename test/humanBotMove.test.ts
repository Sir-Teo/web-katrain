import { describe, expect, it } from 'vitest';
import { describeHumanBotPick, pickHumanBotMove } from '../src/utils/humanBotMove';
import type { CandidateMove } from '../src/types';

// ---------------------------------------------------------------------------
// Playing like a human of a given rank, the way KataGo's own human-bot configs do
// (cpp/configs/gtp_human5k_example.cfg): the search's play selection values are
// moved onto the human SL policy and sampled with the chosen-move temperature,
// rather than the bot simply taking the net's best move — always taking the top
// move plays noticeably stronger than the rank it is imitating. Passing keeps the
// search's own weight, since the human records the net learned from often omit it.
// ---------------------------------------------------------------------------

const policyOf = (entries: Array<[number, number, number]>, boardSize = 9): Float32Array => {
  const policy = new Float32Array(boardSize * boardSize + 1).fill(-1);
  for (const [x, y, p] of entries) policy[y * boardSize + x] = p;
  return policy;
};

const candidateOf = (over: Partial<CandidateMove>): CandidateMove =>
  ({ x: 0, y: 0, winRate: 0.5, scoreLead: 0, visits: 1, pointsLost: 0, order: 0, ...over }) as CandidateMove;

describe('human bot move', () => {
  it('samples proportionally to the human policy', () => {
    const humanPolicy = policyOf([
      [2, 2, 0.6],
      [6, 6, 0.4],
    ]);
    // Random values land in each move's slice of the total weight.
    const first = pickHumanBotMove({ humanPolicy, boardSize: 9, random: () => 0.1 })!;
    expect(`${first.x},${first.y}`).toBe('2,2');
    expect(first.prob).toBeCloseTo(0.6, 6); // Float32 policy

    const second = pickHumanBotMove({ humanPolicy, boardSize: 9, random: () => 0.9 })!;
    expect(`${second.x},${second.y}`).toBe('6,6');
  });

  it('does not always take the most likely move', () => {
    const humanPolicy = policyOf([
      [2, 2, 0.55],
      [6, 6, 0.45],
    ]);
    const picks = new Set<string>();
    for (const r of [0.05, 0.3, 0.7, 0.95]) {
      const pick = pickHumanBotMove({ humanPolicy, boardSize: 9, random: () => r })!;
      picks.add(`${pick.x},${pick.y}`);
    }
    expect(picks.size).toBe(2);
  });

  it('sharpens toward the favourite as temperature falls', () => {
    const humanPolicy = policyOf([
      [2, 2, 0.6],
      [6, 6, 0.4],
    ]);
    // At a low temperature applied to every move, the leading one takes almost all
    // the weight, so a draw that picked the second at the default now picks the first.
    const hot = pickHumanBotMove({ humanPolicy, boardSize: 9, random: () => 0.65 })!;
    expect(`${hot.x},${hot.y}`).toBe('6,6');
    const cold = pickHumanBotMove({
      humanPolicy,
      boardSize: 9,
      params: { temperature: 0.2, temperatureEarly: 0.2, temperatureOnlyBelowProb: 1 },
      random: () => 0.65,
    })!;
    expect(`${cold.x},${cold.y}`).toBe('2,2');
  });

  it('damps the tail of the policy but leaves the leading moves alone', () => {
    const humanPolicy = policyOf([
      [2, 2, 0.6],
      [6, 6, 0.395],
      [0, 0, 0.005],
    ]);
    // KataGo's chosenMoveTemperatureOnlyBelowProb is 0.01, so the 0.5% move is the
    // only one reshaped: its slice ends up smaller than its raw share of the total.
    const drawAtTailShare = 1 - 0.005 / 2;
    const pick = pickHumanBotMove({ humanPolicy, boardSize: 9, random: () => drawAtTailShare })!;
    expect(`${pick.x},${pick.y}`).not.toBe('0,0');
  });

  it('skips moves the board does not allow', () => {
    const humanPolicy = policyOf([
      [2, 2, 0.9],
      [6, 6, 0.1],
    ]);
    const pick = pickHumanBotMove({
      humanPolicy,
      boardSize: 9,
      isLegal: (x, y) => !(x === 2 && y === 2),
      random: () => 0.5,
    })!;
    expect(`${pick.x},${pick.y}`).toBe('6,6');
  });

  it('follows the human policy over the search when imitating', () => {
    const humanPolicy = policyOf([
      [2, 2, 0.2],
      [6, 6, 0.8],
    ]);
    // The search overwhelmingly prefers 2,2 — the imitating bot still plays 6,6,
    // because humanSLChosenMoveProp of 1 hands the whole shape to the human net.
    const pick = pickHumanBotMove({
      humanPolicy,
      boardSize: 9,
      candidates: [
        candidateOf({ x: 2, y: 2, visits: 100, playSelectionValue: 100, utility: 0.4, humanPrior: 0.2 }),
        candidateOf({ x: 6, y: 6, visits: 1, playSelectionValue: 1, utility: -0.4, humanPrior: 0.8, order: 1 }),
      ],
      random: () => 0.9,
    })!;
    expect(`${pick.x},${pick.y}`).toBe('6,6');
  });

  it('prefers the move the search likes when the PIKL lambda is small', () => {
    const humanPolicy = policyOf([
      [2, 2, 0.2],
      [6, 6, 0.8],
    ]);
    const pick = pickHumanBotMove({
      humanPolicy,
      boardSize: 9,
      playerToMove: 'black',
      params: { piklLambda: 0.08 },
      candidates: [
        candidateOf({ x: 2, y: 2, visits: 100, playSelectionValue: 100, utility: 0.4, humanPrior: 0.2 }),
        candidateOf({ x: 6, y: 6, visits: 1, playSelectionValue: 1, utility: -0.4, humanPrior: 0.8, order: 1 }),
      ],
      random: () => 0.9,
    })!;
    expect(`${pick.x},${pick.y}`).toBe('2,2');
  });

  it('passes when the engine wants to pass', () => {
    const humanPolicy = policyOf([[2, 2, 1]]);
    const enginePass = { x: -1, y: -1, winRate: 0.5, scoreLead: 0, visits: 10, pointsLost: 0, order: 0 } as CandidateMove;
    const pick = pickHumanBotMove({ humanPolicy, boardSize: 9, engineBest: enginePass })!;
    expect(pick.isPass).toBe(true);
    expect(pick.x).toBe(-1);
  });

  it('reports nothing when the policy has no legal move', () => {
    const humanPolicy = policyOf([]);
    expect(pickHumanBotMove({ humanPolicy, boardSize: 9 })).toBeNull();
  });

  it('says what it played and how likely that was', () => {
    const pick = { x: 3, y: 3, prob: 0.25, isPass: false };
    expect(describeHumanBotPick(pick, 'rank_5k', 9)).toBe(
      'Human (rank_5k) played D6, which players of that rank pick 25.0% of the time.'
    );
    expect(describeHumanBotPick({ x: -1, y: -1, prob: 0, isPass: true }, 'rank_5k', 9)).toContain('passed');
  });
});
