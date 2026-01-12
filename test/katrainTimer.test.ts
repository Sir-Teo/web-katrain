import { describe, expect, it } from 'vitest';
import { formatKaTrainClockSeconds, stepKaTrainTimer } from '../src/utils/katrainTimer';

describe('katrainTimer', () => {
  it('formats time with KaTrain-style ceil', () => {
    expect(formatKaTrainClockSeconds(0)).toBe('0:00');
    expect(formatKaTrainClockSeconds(0.01)).toBe('0:01');
    expect(formatKaTrainClockSeconds(59.01)).toBe('1:00');
    expect(formatKaTrainClockSeconds(60)).toBe('1:00');
  });

  it('counts down main time while running', () => {
    const r = stepKaTrainTimer({
      nowMs: 2000,
      lastUpdateMs: 0,
      lastUpdateNodeId: 'n1',
      currentNodeId: 'n1',
      currentNodeHasChildren: false,
      paused: false,
      isAiTurn: false,
      mainTimeMinutes: 1,
      byoLengthSeconds: 30,
      byoPeriods: 5,
      currentPlayer: 'black',
      mainTimeUsedSeconds: 0,
      nodeTimeUsedSeconds: 0,
      periodsUsedForPlayer: 0,
    });
    expect(r.mainTimeUsedSeconds).toBeCloseTo(2);
    expect(r.display.periodsRemaining).toBe(null);
    expect(r.display.timeout).toBe(false);
    expect(r.display.timeSeconds).toBeCloseTo(60 - 2);
  });

  it('uses byo-yomi periods after main time expires', () => {
    const r = stepKaTrainTimer({
      nowMs: 1000,
      lastUpdateMs: 0,
      lastUpdateNodeId: 'n1',
      currentNodeId: 'n1',
      currentNodeHasChildren: false,
      paused: false,
      isAiTurn: false,
      mainTimeMinutes: 0,
      byoLengthSeconds: 5,
      byoPeriods: 2,
      currentPlayer: 'white',
      mainTimeUsedSeconds: 0,
      nodeTimeUsedSeconds: 0,
      periodsUsedForPlayer: 0,
    });
    expect(r.nodeTimeUsedSeconds).toBeCloseTo(1);
    expect(r.display.periodsRemaining).toBe(2);
    expect(r.display.timeSeconds).toBeCloseTo(4);
  });

  it('consumes periods when time exceeds byo length', () => {
    const r = stepKaTrainTimer({
      nowMs: 12_000,
      lastUpdateMs: 0,
      lastUpdateNodeId: 'n1',
      currentNodeId: 'n1',
      currentNodeHasChildren: false,
      paused: false,
      isAiTurn: false,
      mainTimeMinutes: 0,
      byoLengthSeconds: 5,
      byoPeriods: 2,
      currentPlayer: 'black',
      mainTimeUsedSeconds: 0,
      nodeTimeUsedSeconds: 0,
      periodsUsedForPlayer: 0,
    });

    // 12s with 5s periods -> consumes 2 periods (max) and times out.
    expect(r.periodsUsedForPlayer).toBe(2);
    expect(r.display.periodsRemaining).toBe(0);
    expect(r.display.timeout).toBe(true);
    expect(r.display.timeSeconds).toBe(0);
  });

  it('resets per-move time when node changes (KaTrain semantics)', () => {
    const r = stepKaTrainTimer({
      nowMs: 1000,
      lastUpdateMs: 0,
      lastUpdateNodeId: 'old',
      currentNodeId: 'new',
      currentNodeHasChildren: false,
      paused: false,
      isAiTurn: false,
      mainTimeMinutes: 0,
      byoLengthSeconds: 5,
      byoPeriods: 2,
      currentPlayer: 'black',
      mainTimeUsedSeconds: 0,
      nodeTimeUsedSeconds: 3,
      periodsUsedForPlayer: 0,
    });
    expect(r.nodeTimeUsedSeconds).toBe(0);
    expect(r.display.timeSeconds).toBe(5);
  });
});

