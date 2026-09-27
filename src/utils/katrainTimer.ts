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
  /**
   * Whether the last step charged time: the player's clock was running on a
   * leaf. Time since then belongs to that node and player, even if the move
   * that ends it has already landed by the time anyone looks.
   */
  live?: boolean;
}

const sharedCursor: KaTrainClockCursor = { lastUpdateMs: 0, lastUpdateNodeId: null, live: false };
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
    sharedCursor.live = false;
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
      // A tick that crosses the end of main time charges the rest to
      // byo-yomi. KaTrain charges all of it to main time, which loses little
      // at its 0.1s tick; a background tab here ticks once a second or once a
      // minute, and a sleeping laptop not at all, so the overshoot could hand
      // a player a whole period back.
      const mainTimeRemaining = mainTimeSeconds - mainTimeUsedSeconds;
      const mainPart = mainTimeRemaining > 0 ? Math.min(dtSec, mainTimeRemaining) : 0;
      mainTimeUsedSeconds += mainPart;
      nodeTimeUsedSeconds += dtSec - mainPart;
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

type ClockNode = {
  move?: { x: number; y: number } | null;
  parent?: ClockNode | null;
  endState?: string | null;
  properties?: Record<string, string[]>;
};

/**
 * A clock with nothing to time: the game ended on two passes or a result, or
 * the record already carries one. After a resignation the AI is switched off,
 * so the clock went on counting for whoever was to move and ran a finished
 * game out of time.
 */
export function isGameClockStopped(node: ClockNode, root: ClockNode): boolean {
  if (node.endState) return true;
  const isPass = (n: ClockNode | null | undefined) => !!n?.move && n.move.x < 0 && n.move.y < 0;
  if (isPass(node) && isPass(node.parent)) return true;
  const recorded = root.properties?.RE?.[0]?.trim();
  return !!recorded && recorded !== '?';
}

/** The parts of the game store a clock reads and writes. */
export interface GameClockState {
  currentNode: { id: string; children: readonly unknown[]; timeUsedSeconds?: number };
  currentPlayer: Player;
  timerPaused: boolean;
  timerMainTimeUsedSeconds: number;
  timerPeriodsUsed: Record<Player, number>;
  isAiPlaying: boolean;
  aiColor: Player | null;
  settings: { timerMainTimeMinutes: number; timerByoLengthSeconds: number; timerByoPeriods: number };
}

export const IDLE_CLOCK_DISPLAY: KaTrainTimerDisplay = {
  timeSeconds: 0,
  periodsRemaining: null,
  timeout: false,
  isAiTurn: false,
};

export function isGameClockDisabled(settings: GameClockState['settings']): boolean {
  return settings.timerMainTimeMinutes <= 0 && settings.timerByoPeriods <= 0;
}

/**
 * Step the clock against the store as it is now, writing the time used back
 * into it. `running` says whether the displayed time is moving, i.e. whether
 * anything needs to wake up before the next state change.
 */
export function tickGameClock(
  s: GameClockState,
  cursor: KaTrainClockCursor,
  nowMs: number,
  opts: { stopped: boolean }
): { display: KaTrainTimerDisplay; running: boolean } {
  if (isGameClockDisabled(s.settings)) {
    cursor.live = false;
    return { display: IDLE_CLOCK_DISPLAY, running: false };
  }
  if (cursor.lastUpdateMs <= 0) {
    cursor.lastUpdateMs = nowMs;
    cursor.lastUpdateNodeId = s.currentNode.id;
  }

  const isAiTurn = s.isAiPlaying && s.aiColor === s.currentPlayer;
  const paused = s.timerPaused || opts.stopped;
  const hasChildren = s.currentNode.children.length > 0;

  const result = stepKaTrainTimer({
    nowMs,
    lastUpdateMs: cursor.lastUpdateMs,
    lastUpdateNodeId: cursor.lastUpdateNodeId,
    currentNodeId: s.currentNode.id,
    currentNodeHasChildren: hasChildren,
    paused,
    isAiTurn,
    mainTimeMinutes: s.settings.timerMainTimeMinutes,
    byoLengthSeconds: s.settings.timerByoLengthSeconds,
    byoPeriods: s.settings.timerByoPeriods,
    currentPlayer: s.currentPlayer,
    mainTimeUsedSeconds: s.timerMainTimeUsedSeconds,
    nodeTimeUsedSeconds: s.currentNode.timeUsedSeconds ?? 0,
    periodsUsedForPlayer: s.timerPeriodsUsed[s.currentPlayer] ?? 0,
  });

  cursor.lastUpdateMs = result.lastUpdateMs;
  cursor.lastUpdateNodeId = result.lastUpdateNodeId;
  s.timerMainTimeUsedSeconds = result.mainTimeUsedSeconds;
  s.timerPeriodsUsed[s.currentPlayer] = result.periodsUsedForPlayer;
  s.currentNode.timeUsedSeconds = result.nodeTimeUsedSeconds;

  const running = !paused && !isAiTurn && !result.display.timeout;
  cursor.live = running && !hasChildren;
  return { display: result.display, running };
}

/**
 * Charge the time since the last step to the position it was spent on.
 *
 * Called when the state changes, before stepping the new state. The clock
 * wakes about once a second now, and a move that landed between wakes used to
 * lose everything since the last one: the step saw a new node and started it
 * from zero. At a 70ms tick that was a rounding error; at one second it would
 * hand back half a second a move.
 *
 * Skipped when the change reset the clock (a new game), so the old game's
 * seconds are not billed to the new one.
 */
export function flushGameClock(
  prev: GameClockState,
  next: GameClockState,
  cursor: KaTrainClockCursor,
  nowMs: number
): void {
  const wasLive = cursor.live && cursor.lastUpdateNodeId === prev.currentNode.id;
  cursor.live = false;
  if (!wasLive) return;
  if (next.timerPeriodsUsed !== prev.timerPeriodsUsed) return;
  if (next.timerMainTimeUsedSeconds !== prev.timerMainTimeUsedSeconds) return;
  if (isGameClockDisabled(prev.settings)) return;

  const periodsUsed = next.timerPeriodsUsed;
  const result = stepKaTrainTimer({
    nowMs,
    lastUpdateMs: cursor.lastUpdateMs,
    lastUpdateNodeId: cursor.lastUpdateNodeId,
    currentNodeId: prev.currentNode.id,
    // It was a leaf when last stepped, and the move that ends the wait is
    // what gave it a child.
    currentNodeHasChildren: false,
    paused: false,
    isAiTurn: false,
    mainTimeMinutes: prev.settings.timerMainTimeMinutes,
    byoLengthSeconds: prev.settings.timerByoLengthSeconds,
    byoPeriods: prev.settings.timerByoPeriods,
    currentPlayer: prev.currentPlayer,
    mainTimeUsedSeconds: prev.timerMainTimeUsedSeconds,
    nodeTimeUsedSeconds: prev.currentNode.timeUsedSeconds ?? 0,
    periodsUsedForPlayer: periodsUsed[prev.currentPlayer] ?? 0,
  });

  cursor.lastUpdateMs = result.lastUpdateMs;
  prev.timerMainTimeUsedSeconds = result.mainTimeUsedSeconds;
  next.timerMainTimeUsedSeconds = result.mainTimeUsedSeconds;
  periodsUsed[prev.currentPlayer] = result.periodsUsedForPlayer;
  prev.currentNode.timeUsedSeconds = result.nodeTimeUsedSeconds;
}

/** A timer firing a hair early lands before the digit turns; aim just past it. */
const CLOCK_WAKE_SLACK_MS = 10;

/**
 * How long until the clock shows something different, or null if it never
 * will without a state change.
 *
 * The clock used to wake every 70ms, fourteen times a second, to show a
 * number that changes once a second. It now wakes when the shown second
 * turns, or when the phase ends (main time into byo-yomi, or one period into
 * the next), whichever is sooner.
 */
export function msUntilClockDisplayChanges(display: KaTrainTimerDisplay): number | null {
  if (display.timeout) return null;
  const remaining = Math.max(0, display.timeSeconds);
  // formatKaTrainClockSeconds shows floor(t + 0.99): the digit turns when
  // t + 0.99 drops below the next whole number down.
  const shown = remaining + 0.99;
  const untilDigit = shown - Math.floor(shown);
  const seconds = Math.min(untilDigit, remaining);
  // The epsilon keeps float noise (0.29000000000000004) from adding a ms.
  return Math.min(1000 + CLOCK_WAKE_SLACK_MS, Math.ceil(seconds * 1000 - 1e-6) + CLOCK_WAKE_SLACK_MS);
}

/**
 * Brings the store up to date with the running clock, for code that reads
 * time used between wakes (the minimum-thinking-time check on a move). Set by
 * whichever clock driver is running; a no-op when none is.
 */
let activeClockSync: (() => void) | null = null;

export function setActiveGameClockSync(sync: (() => void) | null): void {
  activeClockSync = sync;
}

export function syncGameClockNow(): void {
  activeClockSync?.();
}
