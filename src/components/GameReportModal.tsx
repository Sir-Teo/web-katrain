import React, { useMemo } from 'react';
import { FaTimes } from 'react-icons/fa';
import { useGameStore } from '../store/gameStore';
import { computeGameReport } from '../utils/gameReport';
import type { Player } from '../types';

interface GameReportModalProps {
  onClose: () => void;
}

const DEFAULT_EVAL_THRESHOLDS = [12, 6, 3, 1.5, 0.5, 0];

function fmtPct(x: number | undefined): string {
  if (typeof x !== 'number' || !Number.isFinite(x)) return '—';
  return `${(x * 100).toFixed(1)}%`;
}

function fmtNum(x: number | undefined, digits = 2): string {
  if (typeof x !== 'number' || !Number.isFinite(x)) return '—';
  return x.toFixed(digits);
}

export const GameReportModal: React.FC<GameReportModalProps> = ({ onClose }) => {
  const { currentNode, settings } = useGameStore();

  const report = useMemo(() => {
    const thresholds = settings.trainerEvalThresholds?.length ? settings.trainerEvalThresholds : DEFAULT_EVAL_THRESHOLDS;
    return computeGameReport({ currentNode, thresholds });
  }, [currentNode, settings.trainerEvalThresholds]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-gray-800 rounded-lg shadow-xl w-[44rem] max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <h2 className="text-lg font-semibold text-white">Game Report (KaTrain)</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white" title="Close">
            <FaTimes />
          </button>
        </div>

        <div className="p-4 space-y-4 overflow-y-auto">
          <div className="bg-gray-900 border border-gray-700 rounded p-3">
            <div className="text-sm font-semibold text-gray-200 mb-2">Key Stats</div>
            <div className="grid grid-cols-3 gap-2 text-sm">
              <div className="text-gray-400" />
              <div className="text-center font-mono text-gray-200">Black</div>
              <div className="text-center font-mono text-gray-200">White</div>

              {[
                ['Moves', (p: Player) => String(report.stats[p].numMoves)],
                ['Accuracy', (p: Player) => fmtNum(report.stats[p].accuracy, 1)],
                ['Mean point loss', (p: Player) => fmtNum(report.stats[p].meanPtLoss, 2)],
                ['Weighted point loss', (p: Player) => fmtNum(report.stats[p].weightedPtLoss, 2)],
                ['AI top move', (p: Player) => fmtPct(report.stats[p].aiTopMove)],
                ['AI top5 / approved', (p: Player) => fmtPct(report.stats[p].aiTop5Move)],
              ].map(([label, valueFn]) => (
                <React.Fragment key={label}>
                  <div className="text-gray-300">{label}</div>
                  <div className="text-center font-mono text-gray-200">{valueFn('black')}</div>
                  <div className="text-center font-mono text-gray-200">{valueFn('white')}</div>
                </React.Fragment>
              ))}
            </div>
            <p className="text-xs text-gray-500 mt-3">
              Requires analysis on consecutive moves (both parent and child) to compute point loss.
            </p>
          </div>

          <div className="bg-gray-900 border border-gray-700 rounded p-3">
            <div className="text-sm font-semibold text-gray-200 mb-2">Point Loss Histogram</div>
            <div className="grid grid-cols-3 gap-2 text-sm">
              <div className="text-gray-400">Threshold</div>
              <div className="text-center font-mono text-gray-200">B</div>
              <div className="text-center font-mono text-gray-200">W</div>

              {report.labels
                .map((label, idx) => ({ label, idx }))
                .reverse()
                .map(({ label, idx }) => (
                  <React.Fragment key={label}>
                    <div className="text-gray-300">{label}</div>
                    <div className="text-center font-mono text-gray-200">{report.histogram[idx]!.black}</div>
                    <div className="text-center font-mono text-gray-200">{report.histogram[idx]!.white}</div>
                  </React.Fragment>
                ))}
            </div>
          </div>
        </div>

        <div className="p-4 bg-gray-900 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded font-medium"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
