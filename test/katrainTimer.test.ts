import { afterEach, describe, expect, it } from 'vitest';
import {
  acquireSharedClockCursor,
  describeKaTrainClock,
  formatKaTrainClockSeconds,
  isGameClockStopped,
  mountedClockCount,
  releaseSharedClockCursor,
  stepKaTrainTimer,
  type KaTrainClockCursor,
  type KaTrainTimerDisplay,
} from '../src/utils/katrainTimer';

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

  it('charges a tick that crosses the end of main time to byo-yomi', () => {
    // A throttled background tab ticked 30s with 1s of main time left: 29s
    // belong to the first period, not to main time, where they vanished.
    const r = stepKaTrainTimer({
      nowMs: 30_000,
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
      mainTimeUsedSeconds: 59,
      nodeTimeUsedSeconds: 0,
      periodsUsedForPlayer: 0,
    });
    expect(r.mainTimeUsedSeconds).toBe(60);
    expect(r.nodeTimeUsedSeconds).toBeCloseTo(29);
    expect(r.display.timeSeconds).toBeCloseTo(1);
    expect(r.display.periodsRemaining).toBe(5);
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

describe('what the clock says out loud', () => {
  /**
   * Running out of time turned the digits red and changed nothing else -- no
   * title, no icon, no label. "0:00 x0" is the information, but only for
   * someone who can see the colour and knows to read it that way; spoken, it is
   * bare numerals.
   *
   * Describing, not refereeing: this clock is a practice aid like KaTrain's, so
   * a timeout still does not forfeit the game.
   */
  const display = (over: Partial<KaTrainTimerDisplay>): KaTrainTimerDisplay => ({
    timeSeconds: 30,
    periodsRemaining: null,
    timeout: false,
    isAiTurn: false,
    ...over,
  });

  it('names main time', () => {
    expect(describeKaTrainClock(display({ timeSeconds: 90 }))).toBe('Main time, 1:30 remaining');
  });

  it('names byo-yomi, and counts one period in the singular', () => {
    expect(describeKaTrainClock(display({ timeSeconds: 30, periodsRemaining: 5 }))).toBe(
      'Byo-yomi, 0:30 remaining, 5 periods left'
    );
    expect(describeKaTrainClock(display({ timeSeconds: 30, periodsRemaining: 1 }))).toBe(
      'Byo-yomi, 0:30 remaining, 1 period left'
    );
  });

  it('says running out in words, which was the whole gap', () => {
    expect(describeKaTrainClock(display({ timeSeconds: 0, periodsRemaining: 0, timeout: true }))).toBe(
      'Out of time'
    );
  });

  it('says the clock is off rather than reading a meaningless zero', () => {
    expect(describeKaTrainClock(display({}), true)).toBe('Clock off, no time control set');
  });
});

describe('the clock every mounted Timer shares', () => {
  const baseArgs = {
    currentNodeId: 'n1',
    currentNodeHasChildren: false,
    paused: false,
    isAiTurn: false,
    mainTimeMinutes: 10,
    byoLengthSeconds: 30,
    byoPeriods: 5,
    currentPlayer: 'black' as const,
    nodeTimeUsedSeconds: 0,
    periodsUsedForPlayer: 0,
  };

  /** One clock on screen, stepping from `cursor` and charging `charged`. */
  const tick = (cursor: KaTrainClockCursor, nowMs: number, charged: { mainTimeUsedSeconds: number }) => {
    const result = stepKaTrainTimer({
      ...baseArgs,
      nowMs,
      lastUpdateMs: cursor.lastUpdateMs,
      lastUpdateNodeId: cursor.lastUpdateNodeId,
      mainTimeUsedSeconds: charged.mainTimeUsedSeconds,
    });
    cursor.lastUpdateMs = result.lastUpdateMs;
    cursor.lastUpdateNodeId = result.lastUpdateNodeId;
    charged.mainTimeUsedSeconds = result.mainTimeUsedSeconds;
  };

  afterEach(() => {
    while (mountedClockCount() > 0) releaseSharedClockCursor();
  });

  it('charges six seconds once, however many clocks are on screen', () => {
    // Measured before this at 390x844, where the classic shell mounts a clock
    // in the top bar and another in the right panel: 6s of wall clock took
    // 12.04s off the game.
    const cursor = acquireSharedClockCursor();
    acquireSharedClockCursor();
    cursor.lastUpdateMs = 1_000;
    cursor.lastUpdateNodeId = 'n1';
    const charged = { mainTimeUsedSeconds: 0 };

    tick(cursor, 7_000, charged);
    tick(cursor, 7_000, charged);

    expect(charged.mainTimeUsedSeconds).toBeCloseTo(6, 6);
  });

  it('would charge it twice if each clock kept its own cursor', () => {
    // The shape of the bug, kept so the fix cannot be quietly undone.
    const own = () => ({ lastUpdateMs: 1_000, lastUpdateNodeId: 'n1' as string | null });
    const charged = { mainTimeUsedSeconds: 0 };
    tick(own(), 7_000, charged);
    tick(own(), 7_000, charged);
    expect(charged.mainTimeUsedSeconds).toBeCloseTo(12, 6);
  });

  it('hands every clock the same cursor, and leaves it alone after the first', () => {
    const first = acquireSharedClockCursor();
    first.lastUpdateMs = 500;
    first.lastUpdateNodeId = 'n1';

    const second = acquireSharedClockCursor();

    expect(second).toBe(first);
    expect(second.lastUpdateMs).toBe(500);
    expect(mountedClockCount()).toBe(2);
  });

  it('re-seeds once no clock is left, so a gap is not charged to anyone', () => {
    const cursor = acquireSharedClockCursor();
    acquireSharedClockCursor();
    cursor.lastUpdateMs = 500;
    cursor.lastUpdateNodeId = 'n1';

    releaseSharedClockCursor();
    expect(cursor.lastUpdateMs).toBe(500);

    releaseSharedClockCursor();
    const later = acquireSharedClockCursor();

    expect(later.lastUpdateMs).toBe(0);
    expect(later.lastUpdateNodeId).toBeNull();
  });

  it('does not go negative when more clocks are released than acquired', () => {
    releaseSharedClockCursor();
    releaseSharedClockCursor();
    expect(mountedClockCount()).toBe(0);
    expect(acquireSharedClockCursor().lastUpdateMs).toBe(0);
  });
});

describe('isGameClockStopped', () => {
  const root = { move: null, parent: null, properties: {} as Record<string, string[]> };
  const child = (parent: object, move: { x: number; y: number } | null, extra: object = {}) => ({ move, parent, ...extra });

  it('keeps running mid-game and after a single pass', () => {
    const m1 = child(root, { x: 3, y: 3 });
    expect(isGameClockStopped(m1, root)).toBe(false);
    expect(isGameClockStopped(child(m1, { x: -1, y: -1 }), root)).toBe(false);
  });

  it('stops after two passes, a resignation, or on a record that has a result', () => {
    const pass1 = child(root, { x: -1, y: -1 });
    expect(isGameClockStopped(child(pass1, { x: -1, y: -1 }), root)).toBe(true);
    expect(isGameClockStopped(child(root, { x: 3, y: 3 }, { endState: 'W+R' }), root)).toBe(true);
    const finished = { ...root, properties: { RE: ['B+R'] } };
    expect(isGameClockStopped(child(finished, { x: 3, y: 3 }), finished)).toBe(true);
    const unknown = { ...root, properties: { RE: ['?'] } };
    expect(isGameClockStopped(child(unknown, { x: 3, y: 3 }), unknown)).toBe(false);
  });
});
