import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FaTimes } from 'react-icons/fa';
import { shallow } from 'zustand/shallow';
import { useGameStore } from '../store/gameStore';
import { computeGameReport, type MoveReportEntry } from '../utils/gameReport';
import { BOARD_SIZE, type CandidateMove, type Player } from '../types';
import { ScoreWinrateGraph } from './ScoreWinrateGraph';
import { PanelHeaderButton } from './layout/ui';
import { captureBoardSnapshot } from '../utils/boardSnapshot';
import { parseGtpMove } from '../lib/gtp';

interface GameReportModalProps {
  onClose: () => void;
  setReportHoverMove: (move: CandidateMove | null) => void;
}

const DEFAULT_EVAL_THRESHOLDS = [12, 6, 3, 1.5, 0.5, 0];

function fmtPct(x: number | undefined): string {
  if (typeof x !== 'number' || !Number.isFinite(x)) return '--';
  return `${(x * 100).toFixed(1)}%`;
}

function fmtNum(x: number | undefined, digits = 2): string {
  if (typeof x !== 'number' || !Number.isFinite(x)) return '--';
  return x.toFixed(digits);
}

export const GameReportModal: React.FC<GameReportModalProps> = ({ onClose, setReportHoverMove }) => {
  const {
    currentNode,
    trainerEvalThresholds,
    treeVersion,
    jumpToNode,
    gameAnalysisDone,
    gameAnalysisTotal,
    isGameAnalysisRunning,
  } = useGameStore(
    (state) => ({
      currentNode: state.currentNode,
      trainerEvalThresholds: state.settings.trainerEvalThresholds,
      treeVersion: state.treeVersion,
      jumpToNode: state.jumpToNode,
      gameAnalysisDone: state.gameAnalysisDone,
      gameAnalysisTotal: state.gameAnalysisTotal,
      isGameAnalysisRunning: state.isGameAnalysisRunning,
    }),
    shallow
  );
  const [depthFilter, setDepthFilter] = useState<[number, number] | null>(null);
  const [reportGraph, setReportGraph] = useState({ score: true, winrate: true });
  const [playerFilter, setPlayerFilter] = useState<'all' | Player>('all');
  const [snapshotUrl, setSnapshotUrl] = useState<string | null>(null);
  const [snapshotError, setSnapshotError] = useState<string | null>(null);
  const [isPreparingPdf, setIsPreparingPdf] = useState(false);
  const [pdfSnapshots, setPdfSnapshots] = useState<Array<{ id: string; dataUrl: string | null; entry: MoveReportEntry }>>([]);
  const [pdfProgress, setPdfProgress] = useState<{ done: number; total: number } | null>(null);
  const [graphTick, setGraphTick] = useState(0);
  const snapshotTimerRef = useRef<number | null>(null);
  const sectionClass =
    'rounded-xl border border-slate-700/60 bg-slate-900/70 p-4 shadow-[0_10px_30px_rgba(15,23,42,0.35)] print-surface';
  const sectionTitleClass = 'text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400';
  const labelClass = 'text-slate-300';
  const generatedAt = useMemo(() => new Date(), []);

  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      @media print {
        @page {
          size: A4 landscape;
          margin: 12mm;
        }
        html,
        body,
        #root {
          height: auto !important;
          overflow: visible !important;
        }
        body > * {
          visibility: hidden !important;
        }
        .report-print,
        .report-print * {
          visibility: visible !important;
        }
        .report-overlay {
          position: static !important;
          inset: auto !important;
          height: auto !important;
          min-height: auto !important;
          overflow: visible !important;
          background: transparent !important;
        }
        .app-root {
          height: auto !important;
          min-height: auto !important;
          overflow: visible !important;
        }
        .report-print {
          position: static !important;
          left: auto !important;
          top: auto !important;
          width: auto !important;
          max-height: none !important;
          height: auto !important;
          overflow: visible !important;
          background: #ffffff !important;
          font-family: 'Source Serif 4', 'Times New Roman', serif !important;
        }
        .report-print .report-scroll {
          overflow: visible !important;
          max-height: none !important;
          height: auto !important;
        }
        .report-print * {
          color: #0f172a !important;
          border-color: #e2e8f0 !important;
          box-shadow: none !important;
        }
        .report-print .print-surface {
          background: #ffffff !important;
        }
        .report-print .print-muted {
          color: #475569 !important;
        }
        .report-print .print-break-avoid {
          break-inside: avoid !important;
          page-break-inside: avoid !important;
        }
        .report-print .pdf-title {
          font-family: 'Source Sans 3', 'Helvetica Neue', Arial, sans-serif !important;
          font-weight: 600 !important;
          letter-spacing: 0.08em !important;
          text-transform: uppercase !important;
        }
        .report-print .pdf-meta {
          font-family: 'Source Sans 3', 'Helvetica Neue', Arial, sans-serif !important;
          text-transform: uppercase !important;
          letter-spacing: 0.12em !important;
          font-size: 10px !important;
          color: #64748b !important;
        }
        .report-print .pdf-page {
          break-after: page !important;
          page-break-after: always !important;
          padding: 8mm !important;
          border: 1px solid #e2e8f0 !important;
          border-radius: 6px !important;
          background: #ffffff !important;
        }
        .report-print .pdf-page:last-child {
          break-after: auto !important;
          page-break-after: auto !important;
        }
        .report-print .pdf-board {
          width: 100% !important;
          max-height: 62vh !important;
          height: auto !important;
          object-fit: contain !important;
        }
        .report-print .pdf-tree-line {
          border-left: 1px solid #cbd5e1 !important;
          padding-left: 12px !important;
          margin-left: 6px !important;
        }
        .report-print .pdf-tree-node {
          position: relative !important;
          padding-left: 6px !important;
        }
        .report-print .pdf-tree-node::before {
          content: '' !important;
          position: absolute !important;
          left: -14px !important;
          top: 6px !important;
          width: 8px !important;
          height: 8px !important;
          border-radius: 999px !important;
          background: #0f172a !important;
          border: 1px solid #cbd5e1 !important;
        }
        .print-hide {
          display: none !important;
        }
        .print-only {
          display: block !important;
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
  }, [currentNode, depthFilter, trainerEvalThresholds, treeVersion, gameAnalysisDone, gameAnalysisTotal]);

  const analyzedMoves = report.stats.black.numMoves + report.stats.white.numMoves;
  const totalMoves = report.movesInFilter;
  const coverage = totalMoves > 0 ? analyzedMoves / totalMoves : 0;
  const playerFilterLabel = playerFilter === 'all' ? 'All players' : playerFilter === 'black' ? 'Black' : 'White';
  const statsPlayers: Array<Player> = playerFilter === 'all' ? ['black', 'white'] : [playerFilter];
  const allMistakes = useMemo(() => {
    const entries = report.moveEntries.filter((entry) => playerFilter === 'all' || entry.player === playerFilter);
    entries.sort((a, b) => b.pointsLost - a.pointsLost);
    return entries;
  }, [playerFilter, report.moveEntries]);
  const topMistakes = useMemo(() => allMistakes.slice(0, 10), [allMistakes]);
  const pdfMistakes = topMistakes;
  const maxHist = Math.max(
    1,
    ...report.histogram.map((row) => Math.max(row.black, row.white))
  );
  const maxHistByPlayer = useMemo(() => {
    const maxBlack = Math.max(1, ...report.histogram.map((row) => row.black));
    const maxWhite = Math.max(1, ...report.histogram.map((row) => row.white));
    return { black: maxBlack, white: maxWhite };
  }, [report.histogram]);

  const phaseLabel = depthFilter
    ? depthFilter[0] === 0 && depthFilter[1] === 0.14
      ? 'Opening'
      : depthFilter[0] === 0.14 && depthFilter[1] === 0.4
        ? 'Midgame'
        : 'Endgame'
    : 'Entire Game';

  const graphRange = useMemo(() => {
    if (!depthFilter) return null;
    const [fromFrac, toFrac] = depthFilter;
    const boardSquares = BOARD_SIZE * BOARD_SIZE;
    const start = Math.ceil(fromFrac * boardSquares);
    const end = Math.max(start, Math.ceil(toFrac * boardSquares) - 1);
    return { start, end };
  }, [depthFilter]);

  const waitForBoardRender = () =>
    new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          window.setTimeout(() => resolve(), 200);
        });
      });
    });

  const waitForPvRender = async () => {
    if (typeof document === 'undefined') return;
    const board = document.querySelector<HTMLElement>('[data-board-snapshot="true"]');
    if (!board) return;
    const initial = board.dataset.pvRendered ?? '';
    const start = performance.now();
    while (performance.now() - start < 1200) {
      const next = board.dataset.pvRendered ?? '';
      if (next && next !== initial) return;
      await new Promise((resolve) => setTimeout(resolve, 60));
    }
  };

  const buildReportHoverMove = (entry: MoveReportEntry): CandidateMove | null => {
    const parentMoves = entry.node.parent?.analysis?.moves ?? [];
    const best =
      parentMoves.find((m) => m.order === 0) ??
      parentMoves.reduce<CandidateMove | null>((acc, m) => {
        if (!acc) return m;
        return m.pointsLost < acc.pointsLost ? m : acc;
      }, null);
    if (best) {
      const pvLine =
        best.pv && best.pv.length > 0
          ? best.pv
          : entry.topMove
            ? [entry.topMove, ...(entry.pv ?? [])]
            : entry.pv ?? [];
      return {
        ...best,
        pv: pvLine,
      };
    }
    if (!entry.topMove) return null;
    const parsed = parseGtpMove(entry.topMove);
    if (!parsed || parsed.kind !== 'move') return null;
    const pvLine =
      entry.pv && entry.pv.length > 0 && entry.pv[0] === entry.topMove
        ? entry.pv
        : [entry.topMove, ...(entry.pv ?? [])];
    return {
      x: parsed.x,
      y: parsed.y,
      winRate: 0.5,
      scoreLead: 0,
      visits: 0,
      pointsLost: entry.pointsLost,
      order: 0,
      pv: pvLine,
    };
  };

  const preparePdf = async () => {
    if (isPreparingPdf) return;
    setIsPreparingPdf(true);
    setPdfProgress({ done: 0, total: pdfMistakes.length });
    const originalNode = currentNode;
    const snapshots: Array<{ id: string; dataUrl: string | null; entry: MoveReportEntry }> = [];
    try {
      for (let i = 0; i < pdfMistakes.length; i++) {
        const entry = pdfMistakes[i]!;
        const targetNode = entry.node.parent ?? entry.node;
        jumpToNode(targetNode);
        setReportHoverMove(buildReportHoverMove(entry));
        await waitForBoardRender();
        await waitForPvRender();
        const dataUrl = await captureBoardSnapshot();
        snapshots.push({ id: entry.node.id, dataUrl, entry });
        setPdfProgress({ done: i + 1, total: pdfMistakes.length });
      }
    } finally {
      setReportHoverMove(null);
      if (originalNode) {
        jumpToNode(originalNode);
      }
    }
    setPdfSnapshots(snapshots);
    setIsPreparingPdf(false);
    setPdfProgress(null);
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    window.print();
  };

  const handleDownloadPdf = () => {
    if (pdfMistakes.length === 0) {
      window.print();
      return;
    }
    void preparePdf();
  };

  const formatPv = (pv?: string[], max = 12) => {
    if (!pv || pv.length === 0) return '-';
    const sliced = pv.slice(0, max);
    return `${sliced.join(' ')}${pv.length > max ? ' ...' : ''}`;
  };

  const renderMistakeRows = (entries: MoveReportEntry[], showJump: boolean) => {
    return entries.map((entry) => (
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
          {showJump ? (
            <button
              type="button"
              className="px-2 py-1 rounded bg-slate-800/70 border border-slate-700/50 text-slate-200 hover:bg-slate-700/70 print-hide"
              onClick={() => jumpToNode(entry.node)}
            >
              Jump to move
            </button>
          ) : (
            <span className="text-slate-400">-</span>
          )}
        </div>
        <div className="col-span-12 text-[10px] text-slate-500 font-mono print-muted">
          PV: {formatPv(entry.pv)}
        </div>
      </React.Fragment>
    ));
  };

  const renderPvTree = (entry: MoveReportEntry) => {
    const pv = entry.pv ?? [];
    const line =
      entry.topMove && (pv.length === 0 || pv[0] !== entry.topMove)
        ? [entry.topMove, ...pv]
        : pv;
    if (line.length === 0) {
      return <div className="text-xs text-slate-500">PV unavailable.</div>;
    }
    const max = 24;
    const nodes = line.slice(0, max);
    return (
      <div className="space-y-1 pdf-tree-line">
        {nodes.map((move, idx) => (
          <div key={`${move}-${idx}`} className="text-xs font-mono text-slate-700 pdf-tree-node">
            {idx + 1}. {move}
          </div>
        ))}
        {line.length > max && <div className="text-[10px] text-slate-500">... {line.length - max} more</div>}
      </div>
    );
  };

  const refreshSnapshot = async () => {
    setSnapshotError(null);
    try {
      const dataUrl = await captureBoardSnapshot();
      if (!dataUrl) {
        setSnapshotError('Snapshot unavailable.');
        return;
      }
      setSnapshotUrl(dataUrl);
    } catch {
      setSnapshotError('Snapshot unavailable.');
    }
  };

  useEffect(() => {
    if (!isGameAnalysisRunning) return;
    const id = window.setInterval(() => {
      setGraphTick((tick) => tick + 1);
    }, 900);
    return () => window.clearInterval(id);
  }, [isGameAnalysisRunning]);

  useEffect(() => {
    if (snapshotTimerRef.current) {
      window.clearTimeout(snapshotTimerRef.current);
    }
    snapshotTimerRef.current = window.setTimeout(() => {
      void refreshSnapshot();
    }, 120);
    return () => {
      if (snapshotTimerRef.current) {
        window.clearTimeout(snapshotTimerRef.current);
      }
    };
  }, [treeVersion, currentNode?.id]);

  useEffect(() => {
    setPdfSnapshots([]);
  }, [playerFilter, depthFilter, treeVersion]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 report-overlay">
      <div className="bg-slate-900/90 rounded-2xl shadow-2xl w-[56rem] max-h-[90vh] overflow-hidden flex flex-col report-print border border-slate-700/60">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700/50 bg-slate-900/90">
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-slate-400">KaTrain Report</div>
            <h2 className="text-lg font-semibold text-white">Game Analysis Summary</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white print-hide" title="Close">
            <FaTimes />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4 overflow-y-auto report-scroll">
          <div className="space-y-4 print-hide">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 print-hide">
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
                    'px-3 py-2 rounded-lg border text-sm font-semibold transition-colors',
                    active
                      ? 'bg-emerald-600/80 border-emerald-500/60 text-white'
                      : 'bg-slate-900/80 border-slate-700/50 text-slate-200 hover:bg-slate-800/70',
                  ].join(' ')}
                >
                  {b.label}
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-2 print-hide">
            {[
              { key: 'all', label: 'All players' },
              { key: 'black', label: 'Black' },
              { key: 'white', label: 'White' },
            ].map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => setPlayerFilter(opt.key as 'all' | Player)}
                className={[
                  'px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors',
                  playerFilter === opt.key
                    ? 'bg-slate-200 text-slate-900 border-slate-200'
                    : 'bg-slate-900/70 border-slate-700/50 text-slate-200 hover:bg-slate-800/80',
                ].join(' ')}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className={sectionClass}>
              <div className={sectionTitleClass}>Phase</div>
              <div className="mt-2 text-lg font-semibold text-slate-100">{phaseLabel}</div>
              <div className="mt-1 text-xs text-slate-400">Filter applies to report metrics.</div>
            </div>
            <div className={sectionClass}>
              <div className={sectionTitleClass}>Analyzed Moves</div>
              <div className="mt-2 text-lg font-semibold text-slate-100">
                {analyzedMoves}/{totalMoves || 0}
              </div>
              <div className="mt-2 h-2 rounded-full bg-slate-800/70 overflow-hidden">
                <div
                  className="h-full bg-emerald-500/70"
                  style={{ width: `${Math.round(coverage * 100)}%` }}
                />
              </div>
              <div className="mt-2 text-xs text-slate-400">Filters apply to analysis coverage.</div>
            </div>
            <div className={sectionClass}>
              <div className={sectionTitleClass}>Coverage</div>
              <div className="mt-2 text-lg font-semibold text-slate-100">{fmtPct(coverage)}</div>
              <div className="mt-1 text-xs text-slate-400">Based on moves with analysis data.</div>
            </div>
          </div>

          <div className={sectionClass}>
            <div className={sectionTitleClass}>Key Stats</div>
            <div className={['mt-3 grid gap-2 text-sm', statsPlayers.length === 2 ? 'grid-cols-3' : 'grid-cols-2'].join(' ')}>
              <div className="text-slate-500 text-xs uppercase tracking-wide">Metric</div>
              {statsPlayers.map((player) => (
                <div key={player} className="text-center text-xs uppercase tracking-wide text-slate-500">
                  {player === 'black' ? 'Black' : 'White'}
                </div>
              ))}

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
                  <div className={labelClass}>{label}</div>
                  {statsPlayers.map((player) => (
                    <div key={`${label}-${player}`} className="text-center font-mono text-slate-200">
                      {valueFn(player)}
                    </div>
                  ))}
                </React.Fragment>
              ))}
            </div>
            <p className="text-xs text-gray-500 mt-3">
              Requires analysis on consecutive moves (both parent and child) to compute point loss.
            </p>
          </div>

          <div className={sectionClass}>
            <div className="flex items-center justify-between">
              <div className={sectionTitleClass}>Board Snapshot</div>
              <button
                type="button"
                onClick={refreshSnapshot}
                className="px-3 py-1 rounded-full text-xs font-semibold border border-slate-700/60 text-slate-200 hover:bg-slate-800/80 print-hide"
              >
                Refresh
              </button>
            </div>
            <div className="mt-3 rounded-lg border border-slate-700/60 bg-slate-950/40 p-3 flex items-center justify-center">
              {snapshotUrl ? (
                <img
                  src={snapshotUrl}
                  alt="Board snapshot"
                  className="max-h-[260px] w-auto rounded-md border border-slate-700/60"
                />
              ) : (
                <div className="text-sm text-slate-400">
                  {snapshotError ?? 'Capturing board snapshot...'}
                </div>
              )}
            </div>
            <div className="mt-2 text-xs text-slate-400 print-muted">
              Snapshot reflects the current board position and auto-updates on move.
            </div>
          </div>

          <div className={sectionClass}>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className={sectionTitleClass}>Analysis Graph</div>
                <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-200 border border-emerald-400/40 print-hide">
                  Live
                </span>
              </div>
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
            <div className="mt-3 bg-slate-950/40 border border-slate-700/50 rounded-lg p-2">
              {reportGraph.score || reportGraph.winrate ? (
                <div style={{ height: 160 }}>
                  <ScoreWinrateGraph
                    key={`${graphRange?.start ?? 0}-${graphRange?.end ?? 'all'}-${treeVersion}-${gameAnalysisDone}-${graphTick}-${reportGraph.score ? 's' : ''}${reportGraph.winrate ? 'w' : ''}`}
                    showScore={reportGraph.score}
                    showWinrate={reportGraph.winrate}
                    range={graphRange}
                  />
                </div>
              ) : (
                <div className="h-20 flex items-center justify-center text-slate-500 text-sm">Graph hidden</div>
              )}
            </div>
            <div className="mt-2 text-xs text-slate-400">
              Score lead and winrate are from the current analysis data.
            </div>
          </div>

          <div className={sectionClass}>
            <div className={sectionTitleClass}>Biggest Mistakes</div>
            {topMistakes.length === 0 ? (
              <div className="mt-2 text-sm text-slate-500">No analyzed moves in this range.</div>
            ) : (
              <div className="mt-3 grid grid-cols-12 gap-2 text-xs text-slate-400">
                <div className="col-span-2 uppercase tracking-wide text-[10px]">Move</div>
                <div className="col-span-1 text-center uppercase tracking-wide text-[10px]">P</div>
                <div className="col-span-2 uppercase tracking-wide text-[10px]">Played</div>
                <div className="col-span-2 uppercase tracking-wide text-[10px]">Top</div>
                <div className="col-span-2 text-right uppercase tracking-wide text-[10px]">Loss</div>
                <div className="col-span-3 text-right uppercase tracking-wide text-[10px]">Jump</div>
                {renderMistakeRows(topMistakes, true)}
              </div>
            )}
          </div>

          <div className={sectionClass}>
            <div className="flex items-center justify-between">
              <div className={sectionTitleClass}>Point Loss Histogram</div>
              <div className="flex items-center gap-2 text-[10px] text-slate-400">
                <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-slate-200/80" />Black</span>
                <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-slate-400/80" />White</span>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-12 gap-2 text-xs">
              <div className="col-span-3 uppercase tracking-wide text-[10px] text-slate-500">Threshold</div>
              <div className="col-span-5 uppercase tracking-wide text-[10px] text-slate-500">Distribution</div>
              {playerFilter === 'all' ? (
                <>
                  <div className="col-span-2 text-center uppercase tracking-wide text-[10px] text-slate-500">B</div>
                  <div className="col-span-2 text-center uppercase tracking-wide text-[10px] text-slate-500">W</div>
                </>
              ) : (
                <div className="col-span-4 text-center uppercase tracking-wide text-[10px] text-slate-500">
                  {playerFilter === 'black' ? 'Black' : 'White'}
                </div>
              )}

              {report.labels
                .map((label, idx) => ({ label, idx }))
                .reverse()
                .map(({ label, idx }) => {
                  const row = report.histogram[idx]!;
                  const blackWidth = `${Math.round((row.black / maxHist) * 100)}%`;
                  const whiteWidth = `${Math.round((row.white / maxHist) * 100)}%`;
                  const singleWidth =
                    playerFilter === 'black'
                      ? `${Math.round((row.black / maxHistByPlayer.black) * 100)}%`
                      : `${Math.round((row.white / maxHistByPlayer.white) * 100)}%`;
                  return (
                    <React.Fragment key={label}>
                      <div className="col-span-3 text-slate-300">{label}</div>
                      <div className="col-span-5">
                        <div className="h-2 rounded-full bg-slate-800/70 overflow-hidden flex">
                          {playerFilter === 'all' ? (
                            <>
                              <div className="h-full bg-slate-200/80" style={{ width: blackWidth }} />
                              <div className="h-full bg-slate-400/80" style={{ width: whiteWidth }} />
                            </>
                          ) : (
                            <div
                              className={playerFilter === 'black' ? 'h-full bg-slate-200/80' : 'h-full bg-slate-400/80'}
                              style={{ width: singleWidth }}
                            />
                          )}
                        </div>
                      </div>
                      {playerFilter === 'all' ? (
                        <>
                          <div className="col-span-2 text-center font-mono text-slate-200">{row.black}</div>
                          <div className="col-span-2 text-center font-mono text-slate-200">{row.white}</div>
                        </>
                      ) : (
                        <div className="col-span-4 text-center font-mono text-slate-200">
                          {playerFilter === 'black' ? row.black : row.white}
                        </div>
                      )}
                    </React.Fragment>
                  );
                })}
            </div>
          </div>
          </div>

          <div className="hidden print-only space-y-6">
            <div className="pdf-page">
              <div className="flex items-start justify-between gap-6">
                <div>
                  <div className="pdf-meta">KaTrain Report</div>
                  <div className="pdf-title text-lg">Game Analysis Summary</div>
                </div>
                <div className="text-xs text-slate-600">
                  {generatedAt.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                  {' - '}
                  {generatedAt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-4 text-sm">
                <div>
                  <div className="pdf-meta">Phase</div>
                  <div className="text-base font-semibold text-slate-900">{phaseLabel}</div>
                </div>
                <div>
                  <div className="pdf-meta">Coverage</div>
                  <div className="text-base font-semibold text-slate-900">{fmtPct(coverage)}</div>
                </div>
                <div>
                  <div className="pdf-meta">Analyzed Moves</div>
                  <div className="text-base font-semibold text-slate-900">
                    {analyzedMoves}/{totalMoves || 0}
                  </div>
                </div>
              </div>
              <div className="mt-4 text-xs text-slate-600">
                Filters: {phaseLabel} - {playerFilterLabel} • Showing top {pdfMistakes.length} mistakes
              </div>
            </div>

            {pdfMistakes.length === 0 ? (
              <div className="pdf-page">
                <div className="text-sm text-slate-600">No analyzed moves in this range.</div>
              </div>
            ) : (
              (pdfSnapshots.length > 0
                ? pdfSnapshots
                : pdfMistakes.map((entry) => ({ id: entry.node.id, dataUrl: null, entry }))
              ).map(({ id, dataUrl, entry }, idx) => (
                <div key={id} className="pdf-page">
                  <div className="flex items-start justify-between gap-6">
                    <div>
                      <div className="pdf-meta">
                        Mistake {idx + 1} of {pdfMistakes.length}
                      </div>
                      <div className="text-lg font-semibold text-slate-900">
                        Move {entry.moveNumber} - {entry.player === 'black' ? 'Black' : 'White'}
                      </div>
                      <div className="text-sm text-slate-700">
                        Played {entry.move} • Best {entry.topMove ?? '-'} • Loss {fmtNum(entry.pointsLost, 2)}
                      </div>
                    </div>
                    <div className="text-xs text-slate-600">
                      Phase: {phaseLabel}
                    </div>
                  </div>
                  <div className="mt-4 flex items-center justify-center border border-slate-200 rounded-md bg-white p-3">
                    {dataUrl ? (
                      <img src={dataUrl} alt={`Move ${entry.moveNumber} snapshot`} className="pdf-board" />
                    ) : (
                      <div className="text-[10px] text-slate-500">Snapshot missing</div>
                    )}
                  </div>
                  <div className="mt-4">
                    <div className="pdf-meta">Correct Move Tree</div>
                    <div className="mt-2">{renderPvTree(entry)}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="px-5 py-4 bg-slate-900/90 border-t border-slate-700/50 flex items-center justify-between print:hidden">
          <button
            type="button"
            onClick={handleDownloadPdf}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-semibold disabled:opacity-60"
            disabled={isPreparingPdf}
          >
            {isPreparingPdf
              ? `Preparing (${pdfProgress?.done ?? 0}/${pdfProgress?.total ?? pdfMistakes.length})`
              : 'Download PDF'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-semibold"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
