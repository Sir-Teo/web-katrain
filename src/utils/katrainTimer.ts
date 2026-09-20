import type { Player } from '../types';

export type KaTrainTimerStepArgs = {
  nowMs: number;
  lastUpdateMs: number;
  lastUpdateNodeId: string | null;
  currentNodeId: string;
  currentNodeHasChildren: boolean;

  paused: boolean;
  isAiTurn: boolean;

  mainTimeMinutes: number;
  byoLengthSeconds: number;
  byoPeriods: number;

  currentPlayer: Player;
  mainTimeUsedSeconds: number;
  nodeTimeUsedSeconds: number;
  periodsUsedForPlayer: number;
};

export type KaTrainTimerDisplay = {
  timeSeconds: number;
  periodsRemaining: number | null;
  timeout: boolean;
  isAiTurn: boolean;
};

export type KaTrainTimerStepResult = {
  lastUpdateMs: number;
  lastUpdateNodeId: string;
  mainTimeUsedSeconds: number;
  nodeTimeUsedSeconds: number;
  periodsUsedForPlayer: number;
  display: KaTrainTimerDisplay;
};

export function formatKaTrainClockSeconds(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds + 0.99));
  const m = Math.floor(s / 60);
  const ss = s % 60;
  return `${m}:${String(ss).padStart(2, '0')}`;
}

/**
 * What the clock would say out loud.
 *
 * Running out of time turned the digits red and changed nothing else -- no
 * title, no icon, no label -- so "0:00 x0" carried the meaning only for someone
 * who could see the colour and knew to read it. This is the text equivalent.
 *
 * It describes, it does not referee: the clock here is a practice aid like
 * KaTrain's, and forfeiting on time would be a rules change rather than a
 * label.
 */
export function describeKaTrainClock(display: KaTrainTimerDisplay, disabled = false): string {
  if (disabled) return 'Clock off, no time control set';
  if (display.timeout) return 'Out of time';
  const remaining = `${formatKaTrainClockSeconds(display.timeSeconds)} remaining`;
  if (display.periodsRemaining === null) return `Main time, ${remaining}`;
  const periods = display.periodsRemaining;
  return `Byo-yomi, ${remaining}, ${periods} period${periods === 1 ? '' : 's'} left`;
}

/** Where the clock had got to in wall time, and on which node. */
export interface KaTrainClockCursor {
  lastUpdateMs: number;
  lastUpdateNodeId: string | null;
}

const sharedCursor: KaTrainClockCursor = { lastUpdateMs: 0, lastUpdateNodeId: null };
let mountedClocks = 0;

/**
 * The one cursor every mounted clock steps from.
 *
 * `stepKaTrainTimer` charges the time between the cursor and now, so a clock
 * that keeps its own cursor charges the same seconds again. Every instance
 * writes to the same store fields, so the game's clock ran once per instance
 * on screen: measured at 390x844, where the classic shell mounts one in the
 * top bar and one in the right panel, six seconds of wall clock charged
 * **12.04s** of main time and a ten-minute game would be gone in five. The
 * desktop dashboard mounts a single clock, which is why it kept correct time
 * and this went unnoticed.
 *
 * Shared, whichever instance ticks first advances the clock and the rest find
 * no elapsed time to charge -- and they still render from a step result taken
 * against the same state, so the two clocks agree.
 *
 * Reset only when the first clock appears. Keeping a stale cursor across a gap
 * with no clock mounted would charge the whole gap to whoever is to move.
 */
export function acquireSharedClockCursor(): KaTrainClockCursor {
  mountedClocks += 1;
  if (mountedClocks === 1) {
    sharedCursor.lastUpdateMs = 0;
    sharedCursor.lastUpdateNodeId = null;
  }
  return sharedCursor;
}

export function releaseSharedClockCursor(): void {
  mountedClocks = Math.max(0, mountedClocks - 1);
}

/** Exposed so a test can prove the reset happens on the first clock only. */
export function mountedClockCount(): number {
  return mountedClocks;
}

export function stepKaTrainTimer(args: KaTrainTimerStepArgs): KaTrainTimerStepResult {
  const nowMs = args.nowMs;
  const lastUpdateMs = Number.isFinite(args.lastUpdateMs) ? args.lastUpdateMs : nowMs;

  const dtSec = Math.max(0, (nowMs - lastUpdateMs) / 1000);

  const mainTimeSeconds = Math.max(0, Math.floor(args.mainTimeMinutes * 60));
  const byoLengthSeconds = Math.max(1, Math.floor(args.byoLengthSeconds));
  const byoPeriods = Math.max(1, Math.floor(args.byoPeriods));

  let mainTimeUsedSeconds = Math.max(0, args.mainTimeUsedSeconds);
  let nodeTimeUsedSeconds = Math.max(0, args.nodeTimeUsedSeconds);
  let periodsUsedForPlayer = Math.max(0, Math.floor(args.periodsUsedForPlayer));

  const isRunning = !args.paused && !args.isAiTurn;
  const isSameNode = args.lastUpdateNodeId === args.currentNodeId;
  const isLeaf = !args.currentNodeHasChildren;

  if (isRunning) {
    if (isSameNode && isLeaf) {
      const mainTimeRemaining = mainTimeSeconds - mainTimeUsedSeconds;
      if (mainTimeRemaining > 0) mainTimeUsedSeconds += dtSec;
      else nodeTimeUsedSeconds += dtSec;
    } else {
      nodeTimeUsedSeconds = 0;
    }

    const mainTimeRemaining = mainTimeSeconds - mainTimeUsedSeconds;
    if (mainTimeRemaining <= 0) {
      let timeRemaining = byoLengthSeconds - nodeTimeUsedSeconds;
      while (timeRemaining < 0 && periodsUsedForPlayer < byoPeriods) {
        nodeTimeUsedSeconds -= byoLengthSeconds;
        timeRemaining += byoLengthSeconds;
        periodsUsedForPlayer += 1;
      }
    }
  }

  const mainTimeRemaining = mainTimeSeconds - mainTimeUsedSeconds;
  const periodsRemaining = byoPeriods - periodsUsedForPlayer;
  const timeout = mainTimeRemaining <= 0 && periodsRemaining <= 0;

  const display: KaTrainTimerDisplay =
    mainTimeRemaining > 0
      ? {
          timeSeconds: mainTimeRemaining,
          periodsRemaining: null,
          timeout: false,
          isAiTurn: args.isAiTurn,
        }
      : {
          timeSeconds: timeout ? 0 : Math.max(0, byoLengthSeconds - nodeTimeUsedSeconds),
          periodsRemaining: Math.max(0, periodsRemaining),
          timeout,
          isAiTurn: args.isAiTurn,
        };

  return {
    lastUpdateMs: nowMs,
    lastUpdateNodeId: args.currentNodeId,
    mainTimeUsedSeconds,
    nodeTimeUsedSeconds,
    periodsUsedForPlayer,
    display,
  };
}

