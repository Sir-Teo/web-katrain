import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  flushGameClock,
  formatKaTrainClockSeconds,
  msUntilClockDisplayChanges,
  tickGameClock,
  type GameClockState,
  type KaTrainClockCursor,
  type KaTrainTimerDisplay,
} from '../src/utils/katrainTimer';

const state = (overrides: Partial<GameClockState> = {}): GameClockState => ({
  currentNode: { id: 'n1', children: [], timeUsedSeconds: 0 },
  currentPlayer: 'black',
  timerPaused: false,
  timerMainTimeUsedSeconds: 0,
  timerPeriodsUsed: { black: 0, white: 0 },
  isAiPlaying: false,
  aiColor: null,
  settings: { timerMainTimeMinutes: 1, timerByoLengthSeconds: 30, timerByoPeriods: 5 },
  ...overrides,
});

const cursorAt = (ms: number, nodeId = 'n1'): KaTrainClockCursor => ({ lastUpdateMs: ms, lastUpdateNodeId: nodeId, live: false });
const main = (timeSeconds: number): KaTrainTimerDisplay => ({ timeSeconds, periodsRemaining: null, timeout: false, isAiTurn: false });
const byo = (timeSeconds: number): KaTrainTimerDisplay => ({ timeSeconds, periodsRemaining: 3, timeout: false, isAiTurn: false });

describe('msUntilClockDisplayChanges', () => {
  it('sleeps until the shown second turns instead of waking every 70ms', () => {
    expect(msUntilClockDisplayChanges(main(30))).toBe(1000);
    expect(msUntilClockDisplayChanges(main(29.5))).toBe(500);
    expect(msUntilClockDisplayChanges(byo(12.25))).toBe(250);
  });

  it('lands just past the turn for any remaining time', () => {
    for (let t = 0.05; t < 65; t += 0.137) {
      const delay = msUntilClockDisplayChanges(main(t))!;
      expect(delay).toBeGreaterThan(0);
      expect(delay).toBeLessThanOrEqual(1010);
      const later = t - delay / 1000;
      // Either the digits have changed or the phase is over.
      expect(later <= 0 || formatKaTrainClockSeconds(later) !== formatKaTrainClockSeconds(t), `t=${t}`).toBe(true);
      // ...by exactly one second, not by sleeping through one.
      if (later > 0) {
        const shownNow = Math.floor(t + 0.99);
        expect(Math.floor(later + 0.99), `t=${t}`).toBe(shownNow - 1);
      }
    }
  });

  it('wakes when main time runs out, not a second after it', () => {
    // Main time 0.3s left shows 0:01; it must switch to byo-yomi when it ends.
    expect(msUntilClockDisplayChanges(main(0.3))).toBe(300);
  });

  it('does not wake at all once out of time', () => {
    expect(msUntilClockDisplayChanges({ ...byo(0), periodsRemaining: 0, timeout: true })).toBeNull();
  });
});

describe('tickGameClock', () => {
  it('runs only while the player to move has time running', () => {
    expect(tickGameClock(state(), cursorAt(1000), 2000, { stopped: false, playing: true }).running).toBe(true);
    expect(tickGameClock(state({ timerPaused: true }), cursorAt(1000), 2000, { stopped: false, playing: true }).running).toBe(false);
    expect(tickGameClock(state({ isAiPlaying: true, aiColor: 'black' }), cursorAt(1000), 2000, { stopped: false, playing: true }).running).toBe(false);
    expect(tickGameClock(state(), cursorAt(1000), 2000, { stopped: true, playing: true }).running).toBe(false);
    const off = state({ settings: { timerMainTimeMinutes: 0, timerByoLengthSeconds: 0, timerByoPeriods: 0 } });
    expect(tickGameClock(off, cursorAt(1000), 2000, { stopped: false, playing: true }).running).toBe(false);
  });

  it('charges the time since the cursor and writes it back', () => {
    const s = state();
    const cursor = cursorAt(1000);
    const { display } = tickGameClock(s, cursor, 3500, { stopped: false, playing: true });
    expect(s.timerMainTimeUsedSeconds).toBeCloseTo(2.5, 6);
    expect(display.timeSeconds).toBeCloseTo(57.5, 6);
    expect(cursor.lastUpdateMs).toBe(3500);
    expect(cursor.live).toBe(true);
  });
});

describe('flushGameClock', () => {
  it('charges a move that lands between wakes to the position it was played from', () => {
    // Last wake at 1s; the move lands at 1.8s. The old step saw a new node
    // and started it from zero, dropping the 0.8s.
    const prev = state();
    const cursor = cursorAt(500);
    tickGameClock(prev, cursor, 1000, { stopped: false, playing: true });
    expect(prev.timerMainTimeUsedSeconds).toBeCloseTo(0.5, 6);
    const child = { id: 'n2', children: [], timeUsedSeconds: 0 };
    (prev.currentNode.children as unknown[]).push(child);
    const next = { ...prev, currentNode: child, currentPlayer: 'white' as const };

    flushGameClock(prev, next, cursor, 1800);

    expect(next.timerMainTimeUsedSeconds).toBeCloseTo(1.3, 6);
    expect(cursor.lastUpdateMs).toBe(1800);
  });

  it('charges nothing when the clock was not running', () => {
    const prev = state({ timerPaused: true });
    const cursor = cursorAt(0);
    tickGameClock(prev, cursor, 1000, { stopped: false, playing: true });
    const next = { ...prev, timerPaused: false };
    flushGameClock(prev, next, cursor, 60_000);
    expect(next.timerMainTimeUsedSeconds).toBe(0);
  });

  it('does not bill the old game to a new one', () => {
    const prev = state();
    const cursor = cursorAt(0);
    tickGameClock(prev, cursor, 1000, { stopped: false, playing: true });
    const next = state({ currentNode: { id: 'root2', children: [], timeUsedSeconds: 0 }, timerPeriodsUsed: { black: 0, white: 0 } });
    flushGameClock(prev, next, cursor, 5000);
    expect(next.timerMainTimeUsedSeconds).toBe(0);
  });
});

describe('the clock in Review', () => {
  // What the driver does on any change: charge up to now, move the cursor to
  // now, step the new state.
  const restep = (prev: GameClockState, s: GameClockState, cursor: KaTrainClockCursor, nowMs: number, playing: boolean) => {
    flushGameClock(prev, s, cursor, nowMs);
    cursor.lastUpdateMs = nowMs;
    return tickGameClock(s, cursor, nowMs, { stopped: false, playing });
  };

  it('does not run while reviewing', () => {
    const s = state();
    const { running } = tickGameClock(s, cursorAt(1000), 5000, { stopped: false, playing: false });
    expect(running).toBe(false);
    expect(s.timerMainTimeUsedSeconds).toBe(0);
  });

  it('charges up to the switch to Review, and nothing spent there on return', () => {
    const s = state();
    const cursor = cursorAt(1000);
    tickGameClock(s, cursor, 1000, { stopped: false, playing: true });

    // Two seconds of play, then into Review.
    expect(restep(s, s, cursor, 3000, false).running).toBe(false);
    expect(s.timerMainTimeUsedSeconds).toBeCloseTo(2, 6);

    // A minute of reviewing, then back to Play: the minute is not billed.
    expect(restep(s, s, cursor, 63_000, true).running).toBe(true);
    expect(s.timerMainTimeUsedSeconds).toBeCloseTo(2, 6);

    // And the clock picks up from there.
    tickGameClock(s, cursor, 64_000, { stopped: false, playing: true });
    expect(s.timerMainTimeUsedSeconds).toBeCloseTo(3, 6);
  });

  it('is told the mode by the layout', () => {
    const layout = readFileSync('src/components/Layout.tsx', 'utf8');
    expect(layout).toMatch(/useLayoutEffect\(\(\) => \{\s*setGameClockPlaying\(mode === 'play'\);\s*\}, \[mode\]\);/);
    const timer = readFileSync('src/components/Timer.tsx', 'utf8');
    expect(timer).toContain('playing: isGameClockPlaying()');
    expect(timer).toContain('subscribeGameClockPlaying(');
  });
});

describe('Timer driver', () => {
  it('has no fixed fast interval left', () => {
    const source = readFileSync('src/components/Timer.tsx', 'utf8');
    expect(source).not.toContain('setInterval');
    expect(source).toContain('msUntilClockDisplayChanges');
    // One driver for every clock on screen, started by the first to mount.
    expect(source).toContain('if (displayListeners.size === 1) stopDriver = startClockDriver();');
  });
});
