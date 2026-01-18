import React, { useEffect, useMemo, useState } from 'react';
import { FaTimes } from 'react-icons/fa';
import { shallow } from 'zustand/shallow';
import { useGameStore } from '../store/gameStore';
import { computeGameReport } from '../utils/gameReport';
import type { Player } from '../types';
import { ScoreWinrateGraph } from './ScoreWinrateGraph';
import { PanelHeaderButton } from './layout/ui';

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
  const { currentNode, trainerEvalThresholds, treeVersion, jumpToNode } = useGameStore(
    (state) => ({
      currentNode: state.currentNode,
      trainerEvalThresholds: state.settings.trainerEvalThresholds,
      treeVersion: state.treeVersion,
      jumpToNode: state.jumpToNode,
    }),
    shallow
  );
  const [depthFilter, setDepthFilter] = useState<[number, number] | null>(null);
  const [reportGraph, setReportGraph] = useState({ score: true, winrate: true });

  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      @media print {
        body > * {
          visibility: hidden !important;
        }
        .report-print,
        .report-print * {
          visibility: visible !important;
        }
        .report-print {
          position: absolute;
          left: 0;
          top: 0;
          width: 100%;
          background: #ffffff !important;
        }
        .report-print * {
          color: #0f172a !important;
          border-color: #e2e8f0 !important;
          box-shadow: none !important;
        }
      }
    `;
    document.head.appendChild(style);
    return () => {
      document.head.removeChild(style);
    };
  }, []);

  const report = useMemo(() => {
    void treeVersion;
    const thresholds = trainerEvalThresholds?.length ? trainerEvalThresholds : DEFAULT_EVAL_THRESHOLDS;
    return computeGameReport({ currentNode, thresholds, depthFilter });
  }, [currentNode, depthFilter, trainerEvalThresholds, treeVersion]);

  const analyzedMoves = report.stats.black.numMoves + report.stats.white.numMoves;
  const totalMoves = report.movesInFilter;
  const coverage = totalMoves > 0 ? analyzedMoves / totalMoves : 0;
  const topMistakes = useMemo(() => {
    const entries = [...report.moveEntries];
    entries.sort((a, b) => b.pointsLost - a.pointsLost);
    return entries.slice(0, 10);
  }, [report.moveEntries]);
  const maxHist = Math.max(
    1,
    ...report.histogram.map((row) => Math.max(row.black, row.white))
  );

  const phaseLabel = depthFilter
    ? depthFilter[0] === 0 && depthFilter[1] === 0.14
      ? 'Opening'
      : depthFilter[0] === 0.14 && depthFilter[1] === 0.4
        ? 'Midgame'
        : 'Endgame'
    : 'Entire Game';

  const handleDownloadPdf = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-slate-800 rounded-lg shadow-xl w-[52rem] max-h-[90vh] overflow-hidden flex flex-col report-print">
        <div className="flex items-center justify-between p-4 border-b border-slate-700/50">
          <h2 className="text-lg font-semibold text-white">Game Report (KaTrain)</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white" title="Close">
            <FaTimes />
          </button>
        </div>

        <div className="p-4 space-y-4 overflow-y-auto">
          <div className="grid grid-cols-4 gap-2">
            {[
              { key: 'all', label: 'Entire Game', filter: null },
              { key: 'opening', label: 'Opening', filter: [0, 0.14] as [number, number] },
              { key: 'midgame', label: 'Midgame', filter: [0.14, 0.4] as [number, number] },
              { key: 'endgame', label: 'Endgame', filter: [0.4, 10] as [number, number] },
            ].map((b) => {
              const active =
                (b.filter === null && depthFilter === null) ||
                (b.filter !== null && depthFilter !== null && b.filter[0] === depthFilter[0] && b.filter[1] === depthFilter[1]);
              return (
                <button
                  key={b.key}
                  type="button"
                  onClick={() => setDepthFilter(b.filter)}
                  className={[
                    'px-3 py-2 rounded border text-sm font-medium',
                    active ? 'bg-green-600 border-green-500 text-white' : 'bg-slate-900 border-slate-700/50 text-slate-200 hover:bg-slate-700',
                  ].join(' ')}
                >
                  {b.label}
                </button>
              );
            })}
          </div>

          <div className="bg-slate-900 border border-slate-700/50 rounded p-3 flex flex-wrap items-center gap-3 text-sm">
            <div className="text-slate-300 font-semibold">{phaseLabel}</div>
            <div className="text-slate-400">Analyzed moves</div>
            <div className="font-mono text-slate-100">{analyzedMoves}/{totalMoves || 0}</div>
            <div className="text-slate-400">Coverage</div>
            <div className="font-mono text-slate-100">{fmtPct(coverage)}</div>
          </div>

          <div className="bg-slate-900 border border-slate-700/50 rounded p-3">
            <div className="text-sm font-semibold text-slate-200 mb-2">Key Stats</div>
            <div className="grid grid-cols-3 gap-2 text-sm">
              <div className="text-slate-400" />
              <div className="text-center font-mono text-slate-200">Black</div>
              <div className="text-center font-mono text-slate-200">White</div>

              {(
                [
                  ['Moves', (p: Player) => String(report.stats[p].numMoves)],
                  ['Accuracy', (p: Player) => fmtNum(report.stats[p].accuracy, 1)],
                  ['Complexity', (p: Player) => fmtPct(report.stats[p].complexity)],
                  ['Mean point loss', (p: Player) => fmtNum(report.stats[p].meanPtLoss, 2)],
                  ['Weighted point loss', (p: Player) => fmtNum(report.stats[p].weightedPtLoss, 2)],
                  ['Total point loss', (p: Player) => fmtNum(report.stats[p].totalPtLoss, 2)],
                  ['Max point loss', (p: Player) => fmtNum(report.stats[p].maxPtLoss, 2)],
                  ['AI top move', (p: Player) => fmtPct(report.stats[p].aiTopMove)],
                  ['AI top5 / approved', (p: Player) => fmtPct(report.stats[p].aiTop5Move)],
                ] as Array<[string, (p: Player) => string]>
              ).map(([label, valueFn]) => (
                <React.Fragment key={label}>
                  <div className="text-slate-300">{label}</div>
                  <div className="text-center font-mono text-slate-200">{valueFn('black')}</div>
                  <div className="text-center font-mono text-slate-200">{valueFn('white')}</div>
                </React.Fragment>
              ))}
            </div>
            <p className="text-xs text-gray-500 mt-3">
              Requires analysis on consecutive moves (both parent and child) to compute point loss.
            </p>
          </div>

          <div className="bg-slate-900 border border-slate-700/50 rounded p-3">
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="text-sm font-semibold text-slate-200">Analysis Graph</div>
              <div className="flex items-center gap-1">
                <PanelHeaderButton
                  label="Score"
                  colorClass="bg-blue-600/30"
                  active={reportGraph.score}
                  onClick={() => setReportGraph((prev) => ({ ...prev, score: !prev.score }))}
                />
                <PanelHeaderButton
                  label="Win%"
                  colorClass="bg-green-600/30"
                  active={reportGraph.winrate}
                  onClick={() => setReportGraph((prev) => ({ ...prev, winrate: !prev.winrate }))}
                />
              </div>
            </div>
            <div className="bg-slate-900 border border-slate-700/50 rounded p-2">
              {reportGraph.score || reportGraph.winrate ? (
                <div style={{ height: 160 }}>
                  <ScoreWinrateGraph showScore={reportGraph.score} showWinrate={reportGraph.winrate} />
                </div>
              ) : (
                <div className="h-20 flex items-center justify-center text-slate-500 text-sm">Graph hidden</div>
              )}
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-700/50 rounded p-3">
            <div className="text-sm font-semibold text-slate-200 mb-2">Biggest Mistakes</div>
            {topMistakes.length === 0 ? (
              <div className="text-sm text-slate-500">No analyzed moves in this range.</div>
            ) : (
              <div className="grid grid-cols-12 gap-2 text-xs text-slate-400">
                <div className="col-span-2">Move</div>
                <div className="col-span-1 text-center">P</div>
                <div className="col-span-2">Played</div>
                <div className="col-span-2">Top</div>
                <div className="col-span-2 text-right">Loss</div>
                <div className="col-span-3 text-right">Jump</div>
                {topMistakes.map((entry) => (
                  <React.Fragment key={`${entry.node.id}-${entry.moveNumber}`}>
                    <div className="col-span-2 text-slate-200 font-mono">#{entry.moveNumber}</div>
                    <div className="col-span-1 text-center font-semibold text-slate-200">
                      {entry.player === 'black' ? 'B' : 'W'}
                    </div>
                    <div className="col-span-2 text-slate-200 font-mono">{entry.move}</div>
                    <div className="col-span-2 text-slate-300 font-mono">
                      {entry.topMove ?? '-'}
                    </div>
                    <div className="col-span-2 text-right font-mono text-rose-300">
                      {fmtNum(entry.pointsLost, 2)}
                    </div>
                    <div className="col-span-3 text-right">
                      <button
                        type="button"
                        className="px-2 py-1 rounded bg-slate-800/70 border border-slate-700/50 text-slate-200 hover:bg-slate-700/70"
                        onClick={() => jumpToNode(entry.node)}
                      >
                        Jump to move
                      </button>
                    </div>
                  </React.Fragment>
                ))}
              </div>
            )}
          </div>

          <div className="bg-slate-900 border border-slate-700/50 rounded p-3">
            <div className="text-sm font-semibold text-slate-200 mb-2">Point Loss Histogram</div>
            <div className="grid grid-cols-12 gap-2 text-xs">
              <div className="col-span-3 text-slate-400">Threshold</div>
              <div className="col-span-5 text-slate-400">Distribution</div>
              <div className="col-span-2 text-center font-mono text-slate-400">B</div>
              <div className="col-span-2 text-center font-mono text-slate-400">W</div>

              {report.labels
                .map((label, idx) => ({ label, idx }))
                .reverse()
                .map(({ label, idx }) => {
                  const row = report.histogram[idx]!;
                  const blackWidth = `${Math.round((row.black / maxHist) * 100)}%`;
                  const whiteWidth = `${Math.round((row.white / maxHist) * 100)}%`;
                  return (
                    <React.Fragment key={label}>
                      <div className="col-span-3 text-slate-300">{label}</div>
                      <div className="col-span-5">
                        <div className="h-2 rounded bg-slate-800/70 overflow-hidden flex">
                          <div className="h-full bg-slate-200/70" style={{ width: blackWidth }} />
                          <div className="h-full bg-slate-400/70" style={{ width: whiteWidth }} />
                        </div>
                      </div>
                      <div className="col-span-2 text-center font-mono text-slate-200">{row.black}</div>
                      <div className="col-span-2 text-center font-mono text-slate-200">{row.white}</div>
                    </React.Fragment>
                  );
                })}
            </div>
          </div>
        </div>

        <div className="p-4 bg-slate-900 flex items-center justify-between">
          <button
            type="button"
            onClick={handleDownloadPdf}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded font-medium"
          >
            Download PDF
          </button>
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
