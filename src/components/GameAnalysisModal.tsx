import React, { useMemo, useState } from 'react';
import { FaTimes } from 'react-icons/fa';
import { useGameStore } from '../store/gameStore';
import { ENGINE_MAX_VISITS } from '../engine/katago/limits';

interface GameAnalysisModalProps {
  onClose: () => void;
}

export const GameAnalysisModal: React.FC<GameAnalysisModalProps> = ({ onClose }) => {
  const { currentNode, isGameAnalysisRunning, gameAnalysisType, gameAnalysisDone, gameAnalysisTotal, startFullGameAnalysis, stopGameAnalysis } =
    useGameStore();

  const defaultStartMove = useMemo(() => currentNode.gameState.moveHistory.length, [currentNode]);

  const [visits, setVisits] = useState<number>(2500);
  const [useMoveRange, setUseMoveRange] = useState<boolean>(false);
  const [startMove, setStartMove] = useState<number>(defaultStartMove);
  const [endMove, setEndMove] = useState<number>(999);
  const [mistakesOnly, setMistakesOnly] = useState<boolean>(false);

  const isRunning = isGameAnalysisRunning && gameAnalysisType === 'full';

  const clampInt = (v: string, fallback: number): number => {
    const n = Number.parseInt(v || String(fallback), 10);
    if (!Number.isFinite(n)) return fallback;
    return n;
  };

  const onStart = () => {
    const v = Math.max(16, Math.min(ENGINE_MAX_VISITS, Math.floor(visits)));
    const range = useMoveRange ? ([startMove, endMove] as [number, number]) : null;
    startFullGameAnalysis({ visits: v, moveRange: range, mistakesOnly });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-gray-800 rounded-lg shadow-xl w-[28rem] max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <h2 className="text-lg font-semibold text-white">Re-analyze Game (KaTrain)</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white" title="Close">
            <FaTimes />
          </button>
        </div>

        <div className="p-4 space-y-4 overflow-y-auto">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-gray-300 block text-sm">Max Visits</label>
              <input
                type="number"
                min={16}
                max={ENGINE_MAX_VISITS}
                value={visits}
                onChange={(e) => setVisits(Math.max(16, clampInt(e.target.value, 2500)))}
                className="w-full bg-gray-700 text-white rounded p-2 border border-gray-600 focus:border-green-500 outline-none text-sm font-mono"
              />
              <p className="text-xs text-gray-500">KaTrain default is 2500.</p>
            </div>

            <div className="space-y-1">
              <label className="text-gray-300 block text-sm">Status</label>
              <div className="w-full bg-gray-900 text-gray-200 rounded p-2 border border-gray-700 text-sm font-mono">
                {isRunning ? `${gameAnalysisDone}/${gameAnalysisTotal}` : '—'}
              </div>
              <div className="flex gap-2 mt-2">
                <button
                  type="button"
                  className="flex-1 px-3 py-2 rounded bg-gray-700 hover:bg-gray-600 text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
                  disabled={!isRunning}
                  onClick={() => stopGameAnalysis()}
                >
                  Stop
                </button>
              </div>
            </div>
          </div>

          <div className="pt-2 border-t border-gray-700 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-gray-300">Limit to moves</label>
              <input
                type="checkbox"
                checked={useMoveRange}
                onChange={(e) => setUseMoveRange(e.target.checked)}
                className="toggle"
              />
            </div>

            <div className={['grid grid-cols-2 gap-3', useMoveRange ? '' : 'opacity-40'].join(' ')}>
              <div className="space-y-1">
                <label className="text-gray-300 block text-sm">From move</label>
                <input
                  type="number"
                  min={0}
                  step={1}
                  disabled={!useMoveRange}
                  value={startMove}
                  onChange={(e) => setStartMove(Math.max(0, clampInt(e.target.value, defaultStartMove)))}
                  className="w-full bg-gray-700 text-white rounded p-2 border border-gray-600 focus:border-green-500 outline-none text-sm font-mono disabled:opacity-60"
                />
              </div>
              <div className="space-y-1">
                <label className="text-gray-300 block text-sm">To move</label>
                <input
                  type="number"
                  min={0}
                  step={1}
                  disabled={!useMoveRange}
                  value={endMove}
                  onChange={(e) => setEndMove(Math.max(0, clampInt(e.target.value, 999)))}
                  className="w-full bg-gray-700 text-white rounded p-2 border border-gray-600 focus:border-green-500 outline-none text-sm font-mono disabled:opacity-60"
                />
              </div>
            </div>
            <p className="text-xs text-gray-500">
              Matches KaTrain: moves are 0-indexed (0 = first move).
            </p>
          </div>

          <div className="pt-2 border-t border-gray-700">
            <div className="flex items-center justify-between">
              <label className="text-gray-300">Re-analyze mistakes only</label>
              <input
                type="checkbox"
                checked={mistakesOnly}
                onChange={(e) => setMistakesOnly(e.target.checked)}
                className="toggle"
              />
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Uses KaTrain’s default mistake threshold (from trainer thresholds). Requires existing analysis to detect mistakes.
            </p>
          </div>
        </div>

        <div className="p-4 bg-gray-900 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded font-medium"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onStart}
            className="px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded font-medium"
          >
            Analyze
          </button>
        </div>
      </div>
    </div>
  );
};

