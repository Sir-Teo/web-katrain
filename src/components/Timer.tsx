import React, { useMemo, useSyncExternalStore } from 'react';
import { FaPause, FaPlay } from 'react-icons/fa';
import { shallow } from 'zustand/shallow';
import { useGameStore } from '../store/gameStore';
import {
  acquireSharedClockCursor,
  describeKaTrainClock,
  flushGameClock,
  formatKaTrainClockSeconds,
  IDLE_CLOCK_DISPLAY,
  isGameClockPlaying,
  isGameClockStopped,
  msUntilClockDisplayChanges,
  releaseSharedClockCursor,
  setActiveGameClockSync,
  subscribeGameClockPlaying,
  tickGameClock,
  type KaTrainTimerDisplay,
} from '../utils/katrainTimer';
import { getAnimationNow } from '../utils/animationFrame';

type GameState = ReturnType<typeof useGameStore.getState>;

const isClockStopped = (s: GameState): boolean => isGameClockStopped(s.currentNode, s.rootNode);

const sameDisplay = (a: KaTrainTimerDisplay, b: KaTrainTimerDisplay): boolean =>
  a.timeSeconds === b.timeSeconds &&
  a.periodsRemaining === b.periodsRemaining &&
  a.timeout === b.timeout &&
  a.isAiTurn === b.isAiTurn;

/**
 * One driver for every clock on screen.
 *
 * Each <Timer> used to run its own loop: a 70ms interval that woke a phone
 * fourteen times a second, twice with two clocks mounted, to redraw a number
 * that changes once a second. Now the first clock to mount starts a single
 * driver and the last to unmount stops it. It steps the game clock on every
 * state change that matters, and otherwise sleeps until the shown second
 * turns. Nothing is scheduled at all while the clock cannot move (paused,
 * the AI's turn, a finished game, out of time).
 */
let clockDisplay: KaTrainTimerDisplay = IDLE_CLOCK_DISPLAY;
const displayListeners = new Set<() => void>();
let stopDriver: (() => void) | null = null;

function publish(next: KaTrainTimerDisplay): void {
  // A new object each step would re-render every clock with nothing to show.
  if (sameDisplay(clockDisplay, next)) return;
  clockDisplay = next;
  displayListeners.forEach((listener) => listener());
}

function startClockDriver(): () => void {
  // Shared, not per-instance: see acquireSharedClockCursor.
  const cursor = acquireSharedClockCursor();
  let wake: number | null = null;

  const cancelWake = () => {
    if (wake !== null) window.clearTimeout(wake);
    wake = null;
  };

  const step = () => {
    cancelWake();
    const s = useGameStore.getState();
    const { display, running } = tickGameClock(s, cursor, getAnimationNow(), {
      stopped: isClockStopped(s),
      playing: isGameClockPlaying(),
    });
    publish(display);
    if (!running) return;
    const delay = msUntilClockDisplayChanges(display);
    if (delay !== null) wake = window.setTimeout(step, delay);
  };

  const restep = (prev: GameState, s: GameState) => {
    const nowMs = getAnimationNow();
    // Time since the last wake belongs to the position it was spent on.
    flushGameClock(prev, s, cursor, nowMs);
    // Whatever was not charged just now was not being spent: paused, the
    // AI's turn, off the end of the line, in Review. Resuming must not bill it.
    cursor.lastUpdateMs = nowMs;
    step();
  };

  step();
  setActiveGameClockSync(step);
  // Into Review: charge up to the switch, then stop. Back to Play: start from
  // now, so the time spent reviewing is not billed on return.
  const unsubscribePlaying = subscribeGameClockPlaying(() => {
    const s = useGameStore.getState();
    restep(s, s);
  });
  const unsubscribe = useGameStore.subscribe((s, prev) => {
    if (
      s.currentNode === prev.currentNode &&
      s.timerPaused === prev.timerPaused &&
      s.currentPlayer === prev.currentPlayer &&
      s.isAiPlaying === prev.isAiPlaying &&
      s.aiColor === prev.aiColor &&
      s.treeVersion === prev.treeVersion &&
      s.rootNode === prev.rootNode &&
      s.settings.timerMainTimeMinutes === prev.settings.timerMainTimeMinutes &&
      s.settings.timerByoLengthSeconds === prev.settings.timerByoLengthSeconds &&
      s.settings.timerByoPeriods === prev.settings.timerByoPeriods
    ) return;
    restep(prev, s);
  });

  return () => {
    unsubscribe();
    unsubscribePlaying();
    cancelWake();
    setActiveGameClockSync(null);
    releaseSharedClockCursor();
  };
}

function subscribeClockDisplay(listener: () => void): () => void {
  displayListeners.add(listener);
  if (displayListeners.size === 1) stopDriver = startClockDriver();
  return () => {
    displayListeners.delete(listener);
    if (displayListeners.size === 0) {
      stopDriver?.();
      stopDriver = null;
    }
  };
}

const getClockDisplay = (): KaTrainTimerDisplay => clockDisplay;

export const Timer: React.FC<{ variant?: 'default' | 'status' }> = ({ variant = 'default' }) => {
  const timerPaused = useGameStore((s) => s.timerPaused);
  const toggleTimerPaused = useGameStore((s) => s.toggleTimerPaused);
  const timerSettings = useGameStore(
    (s) => ({
      mainTimeMinutes: s.settings.timerMainTimeMinutes,
      byoLengthSeconds: s.settings.timerByoLengthSeconds,
      byoPeriods: s.settings.timerByoPeriods,
    }),
    shallow
  );

  const display = useSyncExternalStore(subscribeClockDisplay, getClockDisplay, getClockDisplay);

  const isTimerDisabled = timerSettings.mainTimeMinutes <= 0 && timerSettings.byoPeriods <= 0;
  const effectiveDisplay = isTimerDisabled
    ? { timeSeconds: 0, periodsRemaining: null, timeout: false, isAiTurn: false }
    : display;
  const timeText = useMemo(
    () => (isTimerDisabled ? 'Off' : formatKaTrainClockSeconds(effectiveDisplay.timeSeconds)),
    [effectiveDisplay.timeSeconds, isTimerDisabled]
  );
  const timeLabel = describeKaTrainClock(effectiveDisplay, isTimerDisabled);

  const timeoutClass = isTimerDisabled
    ? 'text-[var(--ui-text-muted)]'
    : effectiveDisplay.timeout
      ? 'text-[var(--ui-danger)]'
      : 'text-[var(--ui-text)]';
  const compactTimeoutClass = isTimerDisabled
    ? 'text-[var(--ui-text-muted)]'
    : effectiveDisplay.timeout
      ? 'text-[var(--ui-danger)]'
      : 'text-[var(--ui-text)]';

  if (variant === 'status') {
    // A status chip reading "Off" is noise next to the game facts — a game
    // with no time control simply has no clock.
    if (isTimerDisabled) return null;
    return (
      <div className="status-bar-timer">
        <div
          className={['status-bar-item font-mono', compactTimeoutClass].join(' ')}
          title={effectiveDisplay.isAiTurn ? 'AI to play' : timeLabel}
          aria-label={timeLabel}
          data-timer-timeout={effectiveDisplay.timeout ? 'true' : undefined}
        >
          {timeText}
          {effectiveDisplay.periodsRemaining !== null ? ` ×${effectiveDisplay.periodsRemaining}` : ''}
        </div>
        <button
          type="button"
          className="status-bar-button"
          onClick={() => toggleTimerPaused()}
          title={timerPaused ? 'Resume timer' : 'Pause timer'}
          aria-label={timerPaused ? 'Resume timer' : 'Pause timer'}
        >
          {timerPaused ? <FaPlay size={10} /> : <FaPause size={10} />}
        </button>
      </div>
    );
  }

  return (
    <div className="ui-surface border border-[var(--ui-border)] rounded px-4 py-3 flex items-center gap-3">
      <div className="flex items-baseline gap-2 font-mono">
        <div
          className={['text-2xl leading-none', timeoutClass].join(' ')}
          title={effectiveDisplay.isAiTurn ? 'AI to play' : timeLabel}
          aria-label={timeLabel}
          data-timer-timeout={effectiveDisplay.timeout ? 'true' : undefined}
        >
          {timeText}
        </div>
        {!isTimerDisabled && effectiveDisplay.periodsRemaining !== null && (
          <div className={['text-sm leading-none', timeoutClass].join(' ')}>
            × {effectiveDisplay.periodsRemaining}
          </div>
        )}
      </div>

      {!isTimerDisabled && (
        <div className="ml-auto">
          <button
            type="button"
            className={[
              'h-10 w-10 flex items-center justify-center rounded border',
              'bg-[var(--ui-surface-2)] border-[var(--ui-border)] text-[var(--ui-text)] hover:bg-[var(--ui-surface)]',
            ].join(' ')}
            onClick={() => toggleTimerPaused()}
            title={timerPaused ? 'Resume timer' : 'Pause timer'}
            aria-label={timerPaused ? 'Resume timer' : 'Pause timer'}
          >
            {timerPaused ? <FaPlay /> : <FaPause />}
          </button>
        </div>
      )}
    </div>
  );
};
