import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FaPause, FaPlay } from 'react-icons/fa';
import { useGameStore } from '../store/gameStore';
import { formatKaTrainClockSeconds, stepKaTrainTimer, type KaTrainTimerDisplay } from '../utils/katrainTimer';

export const Timer: React.FC<{ variant?: 'default' | 'status' }> = ({ variant = 'default' }) => {
  const timerPaused = useGameStore((s) => s.timerPaused);
  const toggleTimerPaused = useGameStore((s) => s.toggleTimerPaused);
  const timerSettings = useGameStore((s) => ({
    mainTimeMinutes: s.settings.timerMainTimeMinutes,
    byoLengthSeconds: s.settings.timerByoLengthSeconds,
    byoPeriods: s.settings.timerByoPeriods,
  }));

  const [display, setDisplay] = useState<KaTrainTimerDisplay>(() => ({
    timeSeconds: 0,
    periodsRemaining: null,
    timeout: false,
    isAiTurn: false,
  }));

  const lastUpdateMsRef = useRef<number>(0);
  const lastUpdateNodeIdRef = useRef<string | null>(null);

  useEffect(() => {
    const isDisabled = timerSettings.mainTimeMinutes <= 0 && timerSettings.byoPeriods <= 0;
    if (isDisabled) {
      lastUpdateMsRef.current = 0;
      lastUpdateNodeIdRef.current = null;
      setDisplay({
        timeSeconds: 0,
        periodsRemaining: null,
        timeout: false,
        isAiTurn: false,
      });
      return;
    }

    const tick = () => {
      const nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
      const s = useGameStore.getState();

      if (lastUpdateMsRef.current <= 0) {
        lastUpdateMsRef.current = nowMs;
        lastUpdateNodeIdRef.current = s.currentNode.id;
      }

      const isAiTurn = s.isAiPlaying && s.aiColor === s.currentPlayer;
      const periodsUsedForPlayer = s.timerPeriodsUsed[s.currentPlayer] ?? 0;
      const nodeTimeUsedSeconds = s.currentNode.timeUsedSeconds ?? 0;

      const result = stepKaTrainTimer({
        nowMs,
        lastUpdateMs: lastUpdateMsRef.current,
        lastUpdateNodeId: lastUpdateNodeIdRef.current,
        currentNodeId: s.currentNode.id,
        currentNodeHasChildren: s.currentNode.children.length > 0,
        paused: s.timerPaused,
        isAiTurn,
        mainTimeMinutes: s.settings.timerMainTimeMinutes,
        byoLengthSeconds: s.settings.timerByoLengthSeconds,
        byoPeriods: s.settings.timerByoPeriods,
        currentPlayer: s.currentPlayer,
        mainTimeUsedSeconds: s.timerMainTimeUsedSeconds,
        nodeTimeUsedSeconds,
        periodsUsedForPlayer,
      });

      lastUpdateMsRef.current = result.lastUpdateMs;
      lastUpdateNodeIdRef.current = result.lastUpdateNodeId;

      s.timerMainTimeUsedSeconds = result.mainTimeUsedSeconds;
      s.timerPeriodsUsed[s.currentPlayer] = result.periodsUsedForPlayer;
      s.currentNode.timeUsedSeconds = result.nodeTimeUsedSeconds;

      setDisplay(result.display);
    };

    lastUpdateMsRef.current = 0;
    lastUpdateNodeIdRef.current = null;
    tick();
    const id = window.setInterval(tick, 70);
    return () => window.clearInterval(id);
  }, [timerSettings.mainTimeMinutes, timerSettings.byoLengthSeconds, timerSettings.byoPeriods]);

  const isTimerDisabled = timerSettings.mainTimeMinutes <= 0 && timerSettings.byoPeriods <= 0;
  const timeText = useMemo(
    () => (isTimerDisabled ? 'Off' : formatKaTrainClockSeconds(display.timeSeconds)),
    [display.timeSeconds, isTimerDisabled]
  );
  const timeoutClass = isTimerDisabled ? 'text-slate-400' : display.timeout ? 'text-red-300' : 'text-slate-100';
  const compactTimeoutClass = isTimerDisabled
    ? 'text-[var(--ui-text-muted)]'
    : display.timeout
      ? 'text-[var(--ui-danger)]'
      : 'text-[var(--ui-text)]';

  if (variant === 'status') {
    return (
      <div className="status-bar-timer">
        <div className={['status-bar-item font-mono', compactTimeoutClass].join(' ')} title={display.isAiTurn ? 'AI to play' : undefined}>
          {timeText}
          {!isTimerDisabled && display.periodsRemaining !== null ? ` ×${display.periodsRemaining}` : ''}
        </div>
        {!isTimerDisabled && (
          <button
            type="button"
            className="status-bar-button"
            onClick={() => toggleTimerPaused()}
            title={timerPaused ? 'Resume timer' : 'Pause timer'}
          >
            {timerPaused ? <FaPlay size={10} /> : <FaPause size={10} />}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="bg-slate-900 border border-slate-700/50 rounded px-4 py-3 flex items-center gap-3">
      <div className="flex items-baseline gap-2 font-mono">
        <div className={['text-2xl leading-none', timeoutClass].join(' ')} title={display.isAiTurn ? 'AI to play' : undefined}>
          {timeText}
        </div>
        {!isTimerDisabled && display.periodsRemaining !== null && (
          <div className={['text-sm leading-none', timeoutClass].join(' ')}>
            × {display.periodsRemaining}
          </div>
        )}
      </div>

      {!isTimerDisabled && (
        <div className="ml-auto">
          <button
            type="button"
            className={[
              'h-10 w-10 flex items-center justify-center rounded border',
              'bg-slate-800 border-slate-700/50 text-slate-200 hover:bg-slate-700',
            ].join(' ')}
            onClick={() => toggleTimerPaused()}
            title={timerPaused ? 'Resume timer' : 'Pause timer'}
          >
            {timerPaused ? <FaPlay /> : <FaPause />}
          </button>
        </div>
      )}
    </div>
  );
};
