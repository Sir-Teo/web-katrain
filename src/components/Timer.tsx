import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FaPause, FaPlay } from 'react-icons/fa';
import { useGameStore } from '../store/gameStore';
import { formatKaTrainClockSeconds, stepKaTrainTimer, type KaTrainTimerDisplay } from '../utils/katrainTimer';

export const Timer: React.FC = () => {
  const { timerPaused, toggleTimerPaused } = useGameStore((s) => ({
    timerPaused: s.timerPaused,
    toggleTimerPaused: s.toggleTimerPaused,
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

    tick();
    const id = window.setInterval(tick, 70);
    return () => window.clearInterval(id);
  }, []);

  const timeText = useMemo(() => formatKaTrainClockSeconds(display.timeSeconds), [display.timeSeconds]);
  const timeoutClass = display.timeout ? 'text-red-300' : 'text-gray-100';

  return (
    <div className="bg-gray-900 border border-gray-700 rounded px-4 py-3 flex items-center gap-3">
      <div className="flex items-baseline gap-2 font-mono">
        <div className={['text-2xl leading-none', timeoutClass].join(' ')} title={display.isAiTurn ? 'AI to play' : undefined}>
          {timeText}
        </div>
        {display.periodsRemaining !== null && (
          <div className={['text-sm leading-none', timeoutClass].join(' ')}>
            × {display.periodsRemaining}
          </div>
        )}
      </div>

      <div className="ml-auto">
        <button
          type="button"
          className={[
            'h-10 w-10 flex items-center justify-center rounded border',
            'bg-gray-800 border-gray-700 text-gray-200 hover:bg-gray-700',
          ].join(' ')}
          onClick={() => toggleTimerPaused()}
          title={timerPaused ? 'Resume timer' : 'Pause timer'}
        >
          {timerPaused ? <FaPlay /> : <FaPause />}
        </button>
      </div>
    </div>
  );
};
