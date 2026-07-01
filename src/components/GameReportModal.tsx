import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FaBookOpen, FaBullseye, FaInfoCircle, FaTimes } from 'react-icons/fa';
import { shallow } from 'zustand/shallow';
import { useGameStore } from '../store/gameStore';
import {
  GAME_REPORT_PHASES,
  MOVE_POLICY_CATEGORIES,
  computeGameReport,
  describeReportSwing,
  getPhaseAnalysisMoveRange,
  getPhaseLabel,
  getPhaseMoveRange,
  getReportStudyFocus,
  getPointLossBucket,
  getReportRecoveries,
  getReportTurningPoints,
  sortMoveReportEntries,
  type GameReportMistakeSort,
  type GameReportPhaseFilter,
  type MoveReportEntry,
  type MovePolicyCategory,
} from '../utils/gameReport';
import type { CandidateMove, GameNode, Player } from '../types';
import { DEFAULT_BOARD_SIZE } from '../types';
import { ScoreWinrateGraph } from './ScoreWinrateGraph';
import { PanelHeaderButton } from './layout/ui';
import { captureBoardSnapshot } from '../utils/boardSnapshot';
import { normalizeBoardSize } from '../utils/boardSize';
import { captureReportBoardSnapshot } from '../utils/reportBoardSnapshot';
import { formatGameInfoPlayer, readRootInfoValue } from '../utils/gameInfoDisplay';
import { computeGameTags } from '../utils/gameTags';
import { setTimedNotification } from '../utils/timedNotification';
import { afterAnimationFrames } from '../utils/animationFrame';
import { printWindow } from '../utils/print';
import { useEscapeToClose } from '../hooks/useEscapeToClose';

interface GameReportModalProps {
  onClose: () => void;
  setReportHoverMove: (move: CandidateMove | null) => void;
}

const DEFAULT_EVAL_THRESHOLDS = [12, 6, 3, 1.5, 0.5, 0];
const HISTOGRAM_COLORS = ['#fb7185', '#f97316', '#f59e0b', '#84cc16', '#38bdf8', '#94a3b8'];
const CRITICAL_SWING_THRESHOLD = 5;
const RECOVERY_THRESHOLD = 1.5;
const POLICY_GUIDE: Array<{ category: MovePolicyCategory; detail: string }> = [
  { category: 'aiMove', detail: 'Engine top choice, or effectively tied with the top policy move.' },
  { category: 'good', detail: 'Rank 2-3, or at least 50% of the top move policy.' },
  { category: 'inaccuracy', detail: 'Rank 4-10, or at least 10% of the top move policy.' },
  { category: 'mistake', detail: 'Rank 11-20, or at least 2% of the top move policy.' },
  { category: 'blunder', detail: 'Outside the top 20 and below 2% of the top move policy.' },
];

function fmtPct(x: number | undefined): string {
  if (typeof x !== 'number' || !Number.isFinite(x)) return '--';
  return `${(x * 100).toFixed(1)}%`;
}

function fmtNum(x: number | undefined, digits = 2): string {
  if (typeof x !== 'number' || !Number.isFinite(x)) return '--';
  return x.toFixed(digits);
}

function fmtSigned(x: number | undefined, digits = 1): string {
  if (typeof x !== 'number' || !Number.isFinite(x)) return '--';
  return x > 0 ? `+${x.toFixed(digits)}` : x.toFixed(digits);
}

function fmtPolicyPct(value: number | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '--';
  return `${Math.round(value * 100)}%`;
}

function fmtWinRate(value: number | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '--';
  return `${(value * 100).toFixed(1)}%`;
}

function fmtWinSwing(value: number | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '--';
  const points = value * 100;
  return points > 0 ? `+${points.toFixed(1)}pp` : `${points.toFixed(1)}pp`;
}

function policyCategoryLabel(category: MovePolicyCategory | undefined): string {
  switch (category) {
    case 'aiMove':
      return 'AI move';
    case 'good':
      return 'Good';
    case 'inaccuracy':
      return 'Inaccuracy';
    case 'mistake':
      return 'Mistake';
    case 'blunder':
      return 'Blunder';
    default:
      return 'Unranked';
  }
}

function policyCategoryClass(category: MovePolicyCategory | undefined): string {
  switch (category) {
    case 'aiMove':
      return 'text-sky-500 border-sky-500/40 bg-sky-500/10';
    case 'good':
      return 'text-emerald-500 border-emerald-500/40 bg-emerald-500/10';
    case 'inaccuracy':
      return 'text-amber-600 border-amber-500/40 bg-amber-500/10';
    case 'mistake':
      return 'text-orange-600 border-orange-500/40 bg-orange-500/10';
    case 'blunder':
      return 'text-rose-500 border-rose-500/40 bg-rose-500/10';
    default:
      return 'text-[var(--ui-text-muted)] border-[var(--ui-border)] bg-[var(--ui-surface)]';
  }
}

function policyCategoryColor(category: MovePolicyCategory): string {
  switch (category) {
    case 'aiMove':
      return '#38bdf8';
    case 'good':
      return '#34d399';
    case 'inaccuracy':
      return '#fbbf24';
    case 'mistake':
      return '#fb923c';
    case 'blunder':
      return '#fb7185';
  }
}

function rootPropertiesForNode(node: GameNode): Record<string, string[]> {
  let root = node;
  while (root.parent) root = root.parent;
  return root.properties ?? {};
}

export const GameReportModal: React.FC<GameReportModalProps> = ({ onClose, setReportHoverMove }) => {
  const {
    currentNode,
    activeBranchChildIds,
    trainerEvalThresholds,
    treeVersion,
    jumpToNode,
    gameAnalysisDone,
    gameAnalysisTotal,
    gameAnalysisType,
    isGameAnalysisRunning,
    isInsertMode,
    startFastGameAnalysis,
    stopGameAnalysis,
  } = useGameStore(
    (state) => ({
      currentNode: state.currentNode,
      activeBranchChildIds: state.activeBranchChildIds,
      trainerEvalThresholds: state.settings.trainerEvalThresholds,
      treeVersion: state.treeVersion,
      jumpToNode: state.jumpToNode,
      gameAnalysisDone: state.gameAnalysisDone,
      gameAnalysisTotal: state.gameAnalysisTotal,
      gameAnalysisType: state.gameAnalysisType,
      isGameAnalysisRunning: state.isGameAnalysisRunning,
      isInsertMode: state.isInsertMode,
      startFastGameAnalysis: state.startFastGameAnalysis,
      stopGameAnalysis: state.stopGameAnalysis,
    }),
    shallow
  );
  const [phaseFilter, setPhaseFilter] = useState<GameReportPhaseFilter>('all');
  const [reportGraph, setReportGraph] = useState({ score: true, winrate: true });
  const [playerFilter, setPlayerFilter] = useState<'all' | Player>('all');
  const [bucketFilter, setBucketFilter] = useState<number | null>(null);
  const [policyFilter, setPolicyFilter] = useState<MovePolicyCategory | null>(null);
  const [mistakeSort, setMistakeSort] = useState<GameReportMistakeSort>('loss');
  const [reviewQueue, setReviewQueue] = useState<MoveReportEntry[]>([]);
  const [reviewIndex, setReviewIndex] = useState(0);
  const [snapshotUrl, setSnapshotUrl] = useState<string | null>(null);
  const [snapshotError, setSnapshotError] = useState<string | null>(null);
  const [isPreparingPdf, setIsPreparingPdf] = useState(false);
  const [pdfSnapshots, setPdfSnapshots] = useState<Array<{ id: string; dataUrl: string | null; entry: MoveReportEntry }>>([]);
  const [graphTick, setGraphTick] = useState(0);
  const [showReportGuide, setShowReportGuide] = useState(false);
  useEscapeToClose(onClose, !showReportGuide);
  const reportGuideButtonRef = useRef<HTMLButtonElement>(null);
  const reportGuideCloseRef = useRef<HTMLButtonElement>(null);
  const snapshotTimerRef = useRef<number | null>(null);
  const boardSize = normalizeBoardSize(currentNode.gameState.board.length, DEFAULT_BOARD_SIZE);
  const sectionClass =
    'rounded-xl border ui-surface p-4 shadow-[0_10px_30px_rgba(0,0,0,0.35)] print-surface';
  const sectionTitleClass = 'text-[11px] font-semibold uppercase tracking-[0.2em] ui-text-faint';
  const labelClass = 'text-[var(--ui-text-muted)]';
  const valueClass = 'text-[var(--ui-text)]';
  const mutedClass = 'text-[var(--ui-text-muted)]';
  const faintClass = 'text-[var(--ui-text-faint)]';
  const secondaryPillClass =
    'inline-flex min-h-11 items-center justify-center rounded-full border border-[var(--ui-border)] bg-[var(--ui-surface)] text-[var(--ui-text-muted)] hover:bg-[var(--ui-surface-2)] hover:text-[var(--ui-text)]';
  const secondaryButtonClass =
    'inline-flex min-h-11 items-center justify-center rounded border border-[var(--ui-border)] bg-[var(--ui-surface)] text-[var(--ui-text)] hover:bg-[var(--ui-surface-2)]';
  const insetSurfaceClass = 'rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel)]';
  const generatedAt = useMemo(() => new Date(), []);
  const playerNames = useMemo(() => {
    void treeVersion;
    const rootProps = rootPropertiesForNode(currentNode);
    return {
      black: formatGameInfoPlayer(
        readRootInfoValue(rootProps, 'PB'),
        readRootInfoValue(rootProps, 'BR'),
        'Black'
      ),
      white: formatGameInfoPlayer(
        readRootInfoValue(rootProps, 'PW'),
        readRootInfoValue(rootProps, 'WR'),
        'White'
      ),
    } satisfies Record<Player, string>;
  }, [currentNode, treeVersion]);
  const reportThresholds = useMemo(
    () => (trainerEvalThresholds?.length ? trainerEvalThresholds : DEFAULT_EVAL_THRESHOLDS),
    [trainerEvalThresholds]
  );

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
          width: 100% !important;
          max-width: none !important;
          box-sizing: border-box !important;
          min-height: calc(100vh - 24mm) !important;
          display: flex !important;
          flex-direction: column !important;
        }
        .report-print .pdf-page:last-child {
          break-after: auto !important;
          page-break-after: auto !important;
        }
        .report-print .pdf-board {
          width: 100% !important;
          max-height: 70vh !important;
          height: auto !important;
          object-fit: contain !important;
        }
        .report-print .pdf-board-wrap {
          flex: 1 !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          border: 1px solid #e2e8f0 !important;
          border-radius: 8px !important;
          padding: 8px !important;
          background: #f8fafc !important;
        }
        .report-print .pdf-cover-title {
          font-size: 26px !important;
          letter-spacing: 0.18em !important;
        }
        .report-print .pdf-cover-subtitle {
          font-family: 'Source Sans 3', 'Helvetica Neue', Arial, sans-serif !important;
          font-size: 14px !important;
          letter-spacing: 0.12em !important;
          text-transform: uppercase !important;
          color: #64748b !important;
        }
        .report-print .pdf-section-title {
          font-family: 'Source Sans 3', 'Helvetica Neue', Arial, sans-serif !important;
          font-size: 11px !important;
          letter-spacing: 0.2em !important;
          text-transform: uppercase !important;
          color: #64748b !important;
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

  const reportsByPhase = useMemo(() => {
    void treeVersion;
    void gameAnalysisDone;
    void gameAnalysisTotal;
    const next = {} as Record<GameReportPhaseFilter, ReturnType<typeof computeGameReport>>;
    for (const phase of GAME_REPORT_PHASES) {
      next[phase.key] = computeGameReport({
        currentNode,
        thresholds: reportThresholds,
        activeBranchChildIds,
        phaseFilter: phase.key,
      });
    }
    return next;
  }, [
    activeBranchChildIds,
    currentNode,
    reportThresholds,
    treeVersion,
    gameAnalysisDone,
    gameAnalysisTotal,
  ]);

  const report = reportsByPhase[phaseFilter] ?? reportsByPhase.all;
  const gameTags = useMemo(() => {
    void treeVersion;
    const wholeGame = reportsByPhase.all;
    return computeGameTags({
      entries: wholeGame.moveEntries,
      stats: wholeGame.stats,
      boardSize,
      moveCount: wholeGame.movesInFilter,
      result: readRootInfoValue(rootPropertiesForNode(currentNode), 'RE'),
    });
  }, [boardSize, currentNode, reportsByPhase, treeVersion]);
  const phaseCounts = useMemo(() => {
    return GAME_REPORT_PHASES.reduce(
      (acc, phase) => {
        const phaseReport = reportsByPhase[phase.key];
        const analyzed = (phaseReport?.stats.black.numMoves ?? 0) + (phaseReport?.stats.white.numMoves ?? 0);
        const total = phaseReport?.movesInFilter ?? 0;
        acc[phase.key] = {
          analyzed,
          total,
        };
        return acc;
      },
      {} as Record<GameReportPhaseFilter, { analyzed: number; total: number }>
    );
  }, [reportsByPhase]);

  const analyzedMoves = report.stats.black.numMoves + report.stats.white.numMoves;
  const totalMoves = report.movesInFilter;
  const coverage = totalMoves > 0 ? analyzedMoves / totalMoves : 0;
  const hasReviewTargets = totalMoves > 0;
  const hasFullCoverage = hasReviewTargets && coverage >= 0.999;
  const phaseLabel = getPhaseLabel(phaseFilter);
  const reviewMoveRange = useMemo(() => getPhaseAnalysisMoveRange(boardSize, phaseFilter), [boardSize, phaseFilter]);
  const reviewScopeLabel = phaseFilter === 'all' ? 'fast review' : `${phaseLabel.toLowerCase()} review`;
  const reviewButtonLabel = isGameAnalysisRunning
    ? `Stop ${gameAnalysisType ?? 'analysis'}${gameAnalysisTotal > 0 ? ` (${gameAnalysisDone}/${gameAnalysisTotal})` : ''}`
    : hasFullCoverage
      ? `Re-run ${reviewScopeLabel}`
      : hasReviewTargets
      ? `Run ${reviewScopeLabel}`
      : 'No moves to review';
  const coveragePercent = totalMoves > 0 ? Math.round(coverage * 100) : 0;
  const analysisStatusTitle = isGameAnalysisRunning
    ? 'Review running'
    : hasFullCoverage
      ? 'Analysis complete'
      : hasReviewTargets
        ? 'Partial analysis'
        : 'No moves to review';
  const analysisStatusDetail = isGameAnalysisRunning
    ? `Fast review is updating the report${gameAnalysisTotal > 0 ? ` (${gameAnalysisDone}/${gameAnalysisTotal})` : ''}.`
    : hasFullCoverage
      ? 'Every move in this filter has consecutive analysis, so the report is complete.'
      : hasReviewTargets
        ? `${analyzedMoves}/${totalMoves} moves have report-grade consecutive analysis. Run ${reviewScopeLabel} to fill the gaps.`
        : 'Load or play a game with moves before running a report review.';
  const playerFilterLabel = playerFilter === 'all' ? 'All players' : playerNames[playerFilter];
  const statsPlayers: Array<Player> = playerFilter === 'all' ? ['black', 'white'] : [playerFilter];
  const filteredReportEntries = useMemo(() => {
    return report.moveEntries.filter((entry) => {
      if (playerFilter !== 'all' && entry.player !== playerFilter) return false;
      if (bucketFilter != null && getPointLossBucket(entry.pointsLost, report.thresholds) !== bucketFilter) return false;
      if (policyFilter && entry.policy?.category !== policyFilter) return false;
      return true;
    });
  }, [bucketFilter, playerFilter, policyFilter, report.moveEntries, report.thresholds]);
  const allMistakes = useMemo(
    () => sortMoveReportEntries(filteredReportEntries, mistakeSort),
    [filteredReportEntries, mistakeSort]
  );
  const topMistakes = useMemo(() => allMistakes.slice(0, 10), [allMistakes]);
  const studyFocus = useMemo(
    () => getReportStudyFocus({ reportsByPhase, phaseFilter, playerFilter }),
    [phaseFilter, playerFilter, reportsByPhase]
  );
  const pdfMistakes = topMistakes;
  const turningPoints = useMemo(
    () => getReportTurningPoints(filteredReportEntries, CRITICAL_SWING_THRESHOLD, 5),
    [filteredReportEntries]
  );
  const recoveries = useMemo(
    () => getReportRecoveries(filteredReportEntries, RECOVERY_THRESHOLD, 5),
    [filteredReportEntries]
  );
  const maxHist = Math.max(
    1,
    ...report.histogram.map((row) => Math.max(row.black, row.white))
  );
  const maxHistByPlayer = useMemo(() => {
    const maxBlack = Math.max(1, ...report.histogram.map((row) => row.black));
    const maxWhite = Math.max(1, ...report.histogram.map((row) => row.white));
    return { black: maxBlack, white: maxWhite };
  }, [report.histogram]);
  const playerDistributions = useMemo(() => {
    return (['black', 'white'] as const).map((player) => {
      const total = report.histogram.reduce((acc, row) => acc + row[player], 0);
      return {
        player,
        total,
        segments: report.labels.map((label, idx) => ({
          label,
          count: report.histogram[idx]?.[player] ?? 0,
          color: HISTOGRAM_COLORS[idx % HISTOGRAM_COLORS.length]!,
        })),
      };
    });
  }, [report.histogram, report.labels]);
  const bucketFilterLabel = bucketFilter == null ? null : report.labels[bucketFilter] ?? null;
  const policyFilterLabel = policyFilter ? policyCategoryLabel(policyFilter) : null;
  const mistakeSortLabel = mistakeSort === 'policy' ? 'Quality' : 'Loss';

  const activeFilterLabels = useMemo(() => {
    const labels = [phaseLabel, playerFilterLabel];
    if (bucketFilterLabel) labels.push(`Loss ${bucketFilterLabel}`);
    if (policyFilterLabel) labels.push(`Quality ${policyFilterLabel}`);
    return labels;
  }, [bucketFilterLabel, phaseLabel, playerFilterLabel, policyFilterLabel]);
  const keyStatRows: Array<{ label: string; description: string; value: (p: Player) => string }> = [
    {
      label: 'Moves',
      description: 'Analyzed moves included by the current phase, player, loss, and policy filters.',
      value: (p) => String(report.stats[p].numMoves),
    },
    {
      label: 'Accuracy',
      description: 'KaTrain-style score-loss accuracy; higher values mean less weighted point loss.',
      value: (p) => fmtNum(report.stats[p].accuracy, 1),
    },
    {
      label: 'Policy accuracy',
      description: 'Move quality score from policy rank and relative policy probability.',
      value: (p) => fmtNum(report.stats[p].policyAccuracy, 1),
    },
    {
      label: 'Complexity',
      description: 'Average policy-weighted difficulty of the positions analyzed.',
      value: (p) => fmtPct(report.stats[p].complexity),
    },
    {
      label: 'Mean point loss',
      description: 'Average points lost per analyzed move.',
      value: (p) => fmtNum(report.stats[p].meanPtLoss, 2),
    },
    {
      label: 'Avg point swing',
      description: 'Average points gained minus points lost per analyzed move; positive values mean the player recovered more than they gave up.',
      value: (p) => fmtSigned(report.stats[p].meanPtSwing, 2),
    },
    {
      label: 'Weighted point loss',
      description: 'Point loss weighted by position difficulty, matching KaTrain report semantics.',
      value: (p) => fmtNum(report.stats[p].weightedPtLoss, 2),
    },
    {
      label: 'Total point loss',
      description: 'Sum of point loss across analyzed moves in the active filters.',
      value: (p) => fmtNum(report.stats[p].totalPtLoss, 2),
    },
    {
      label: 'Net point swing',
      description: 'Total points gained minus points lost across analyzed moves in the active filters.',
      value: (p) => fmtSigned(report.stats[p].totalPtSwing, 2),
    },
    {
      label: 'Max point loss',
      description: 'Largest single-move point loss in the active filters.',
      value: (p) => fmtNum(report.stats[p].maxPtLoss, 2),
    },
    {
      label: 'AI top move',
      description: 'Share of moves that exactly matched the engine top choice.',
      value: (p) => fmtPct(report.stats[p].aiTopMove),
    },
    {
      label: 'AI top5 move',
      description: 'Share of moves that ranked inside the engine top five policy candidates.',
      value: (p) => fmtPct(report.stats[p].aiTop5Move),
    },
    {
      label: 'AI approved',
      description: 'Share of moves accepted by KaTrain’s looser top-move or low-loss approval rule.',
      value: (p) => fmtPct(report.stats[p].aiApprovedMove),
    },
  ];
  const lossBucketGuide = useMemo(
    () =>
      report.labels.map((label, idx) => ({
        label,
        color: HISTOGRAM_COLORS[idx] ?? HISTOGRAM_COLORS[HISTOGRAM_COLORS.length - 1]!,
      })),
    [report.labels]
  );

  const graphRange = useMemo(() => {
    return getPhaseMoveRange(boardSize, phaseFilter);
  }, [boardSize, phaseFilter]);

  const preparePrint = async () => {
    if (isPreparingPdf) return;
    setIsPreparingPdf(true);
    try {
      const snapshots = pdfMistakes.map((entry) => ({
        id: entry.node.id,
        dataUrl: captureReportBoardSnapshot({
          board: entry.node.gameState.board,
          playedMove: entry.node.move,
          bestMove: entry.topMove,
        }),
        entry,
      }));
      setPdfSnapshots(snapshots);
      await afterAnimationFrames(2);
      if (!printWindow()) {
        setTimedNotification('Print dialog unavailable in this browser.', 'error', 2500);
      }
    } finally {
      setIsPreparingPdf(false);
    }
  };

  const handlePrintReport = () => {
    void preparePrint();
  };

  const handleReviewClick = () => {
    if (isGameAnalysisRunning) stopGameAnalysis();
    else startFastGameAnalysis({ moveRange: reviewMoveRange });
  };

  const startReviewQueue = (entries: MoveReportEntry[]) => {
    if (entries.length === 0) return;
    setReviewQueue(entries);
    setReviewIndex(0);
    jumpToNode(entries[0]!.node);
  };

  const activeReview = reviewQueue[reviewIndex] ?? null;
  const reviewStep = (delta: number) => {
    if (reviewQueue.length === 0) return;
    const next = Math.max(0, Math.min(reviewQueue.length - 1, reviewIndex + delta));
    setReviewIndex(next);
    jumpToNode(reviewQueue[next]!.node);
  };

  const startPractice = (entry: MoveReportEntry) => {
    if (isInsertMode) {
      setTimedNotification('Finish insert mode before starting mistake practice.', 'error', 2500);
      return;
    }

    const target = entry.node.parent ?? entry.node;
    jumpToNode(target);
    window.setTimeout(() => {
      const latest = useGameStore.getState();
      if (!latest.isInsertMode && latest.currentNode.children.length > 0) {
        latest.toggleInsertMode();
      }
      setTimedNotification(`Practice move ${entry.moveNumber}: try a correction for ${playerNames[entry.player]}.`, 'info', 2500);
    }, 0);
    setReportHoverMove(null);
    onClose();
  };

  const formatPv = (pv?: string[], max = 12) => {
    if (!pv || pv.length === 0) return '-';
    const sliced = pv.slice(0, max);
    return `${sliced.join(' ')}${pv.length > max ? ' ...' : ''}`;
  };

  const renderMistakeRows = (entries: MoveReportEntry[], showJump: boolean) => {
    return entries.map((entry) => {
      const previewMove = entry.topCandidate ?? null;
      const policy = entry.policy;
      const policyRank = policy?.rank ? `#${policy.rank}` : 'unranked';
      const policyTitle = policy
        ? `Policy rank ${policyRank}; played prior ${fmtPolicyPct(policy.playedPrior)}; top prior ${fmtPolicyPct(policy.topPrior)}; ${fmtPolicyPct(policy.relativePrior)} of top move`
        : 'Policy data unavailable';
      return (
        <div
          key={`${entry.node.id}-${entry.moveNumber}`}
          className="contents"
          onMouseEnter={() => setReportHoverMove(previewMove)}
          onMouseLeave={() => setReportHoverMove(null)}
        >
          <div className={`col-span-2 font-mono ${valueClass}`}>#{entry.moveNumber}</div>
          <div className={`col-span-1 text-center font-semibold ${valueClass}`}>
            {entry.player === 'black' ? 'B' : 'W'}
          </div>
          <div className={`col-span-2 font-mono ${valueClass}`}>{entry.move}</div>
          <div className={`col-span-2 font-mono ${mutedClass}`}>
            {entry.topMove ?? '-'}
          </div>
          <div className="col-span-2 text-right font-mono text-rose-300">
            {fmtNum(entry.pointsLost, 2)}
          </div>
          <div className="col-span-3 text-right">
            {showJump ? (
              <div className="flex flex-wrap justify-end gap-1 print-hide">
                <button
                  type="button"
                  className={`px-2 py-1 ${secondaryButtonClass}`}
                  onClick={() => jumpToNode(entry.node)}
                >
                  Jump
                </button>
                <button
                  type="button"
                  className="px-2 py-1 rounded bg-[var(--ui-accent-soft)] border border-[var(--ui-accent)] text-[var(--ui-accent)] hover:brightness-110"
                  onClick={() => startPractice(entry)}
                >
                  <span className="inline-flex items-center gap-1"><FaBullseye /> Practice</span>
                </button>
              </div>
            ) : (
              <span className={mutedClass}>-</span>
            )}
          </div>
          <div className={`col-span-12 text-[10px] font-mono print-muted ${faintClass}`}>
            <div className="flex flex-wrap items-center gap-2">
              <span title={policyTitle}>
                Policy: <span className={[
                  'inline-flex items-center rounded-full border px-1.5 py-0.5 font-semibold',
                  policyCategoryClass(policy?.category),
                ].join(' ')}>
                  {policyCategoryLabel(policy?.category)}
                </span>{' '}
                {policyRank} · {fmtPolicyPct(policy?.relativePrior)} of top
              </span>
              <span>
                Win: {fmtWinRate(entry.winRateBefore)} {'->'} {fmtWinRate(entry.winRateAfter)} ({fmtWinSwing(entry.winRateSwing)})
              </span>
              <span>PV: {formatPv(entry.pv)}</span>
            </div>
          </div>
        </div>
      );
    });
  };

  const renderPvTree = (entry: MoveReportEntry) => {
    const pv = entry.pv ?? [];
    const line =
      entry.topMove && (pv.length === 0 || pv[0] !== entry.topMove)
        ? [entry.topMove, ...pv]
        : pv;
    if (line.length === 0) {
      return <div className={`text-xs ${faintClass}`}>PV unavailable.</div>;
    }
    const max = 24;
    const nodes = line.slice(0, max);
    return (
      <div className="space-y-1 pdf-tree-line">
        {nodes.map((move, idx) => (
          <div key={`${move}-${idx}`} className={`text-xs font-mono ${mutedClass} pdf-tree-node`}>
            {idx + 1}. {move}
          </div>
        ))}
        {line.length > max && <div className={`text-[10px] ${faintClass}`}>... {line.length - max} more</div>}
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
  }, [bucketFilter, mistakeSort, playerFilter, phaseFilter, policyFilter, treeVersion]);

  useEffect(() => {
    setBucketFilter(null);
    setPolicyFilter(null);
  }, [phaseFilter]);

  useEffect(() => {
    if (phaseFilter !== 'all' && phaseCounts[phaseFilter]?.total === 0) {
      setPhaseFilter('all');
    }
  }, [phaseCounts, phaseFilter]);

  useEffect(() => {
    setReviewQueue([]);
    setReviewIndex(0);
    setReportHoverMove(null);
  }, [bucketFilter, mistakeSort, phaseFilter, playerFilter, policyFilter, setReportHoverMove, treeVersion]);

  useEffect(() => () => setReportHoverMove(null), [setReportHoverMove]);

  useEffect(() => {
    if (!showReportGuide) return;
    reportGuideCloseRef.current?.focus({ preventScroll: true });
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      setShowReportGuide(false);
      window.setTimeout(() => reportGuideButtonRef.current?.focus({ preventScroll: true }), 0);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [showReportGuide]);

  const closeReportGuide = () => {
    setShowReportGuide(false);
    window.setTimeout(() => reportGuideButtonRef.current?.focus({ preventScroll: true }), 0);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 report-overlay p-3 sm:p-6 mobile-safe-inset mobile-safe-area-bottom">
      <div
        className="ui-panel rounded-2xl shadow-2xl w-[92vw] max-w-[56rem] max-h-[90dvh] overflow-hidden flex flex-col report-print border"
        role="dialog"
        aria-modal="true"
        aria-labelledby="game-report-title"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--ui-border)] ui-bar">
          <div>
            <div className="text-xs uppercase tracking-[0.2em] ui-text-faint">KaTrain Report</div>
            <h2 id="game-report-title" className="text-lg font-semibold text-[var(--ui-text)]">
              Game Analysis Summary
            </h2>
            <div className="mt-1 text-sm ui-text-muted">
              {playerNames.black} vs {playerNames.white}
            </div>
            {gameTags.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Game tags">
                {gameTags.map((tag) => (
                  <span
                    key={tag.id}
                    title={tag.description}
                    data-game-tag={tag.id}
                    className="inline-flex items-center rounded-full border border-[var(--ui-accent)] bg-[var(--ui-accent-soft)] px-2.5 py-0.5 text-xs font-semibold text-[var(--ui-accent)]"
                  >
                    {tag.label}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 print-hide">
            <button
              type="button"
              ref={reportGuideButtonRef}
              onClick={() => setShowReportGuide(true)}
              className="inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-surface)] px-3 py-2 text-sm font-semibold text-[var(--ui-text)] hover:bg-[var(--ui-surface-2)]"
              title="Open report guide"
              aria-label="Open report guide"
            >
              <FaInfoCircle aria-hidden="true" />
              <span className="hidden sm:inline">Guide</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="ui-control grid shrink-0 place-items-center rounded-lg text-[var(--ui-text-muted)] hover:bg-[var(--ui-surface-2)] hover:text-[var(--ui-text)]"
              title="Close"
              aria-label="Close game report"
            >
              <FaTimes aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="px-5 py-4 space-y-4 overflow-y-auto overscroll-contain report-scroll">
          <div className="print-hide space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {GAME_REPORT_PHASES.map((b) => {
                const active = phaseFilter === b.key;
                const counts = phaseCounts[b.key] ?? { analyzed: 0, total: 0 };
                const disabled = b.key !== 'all' && counts.total === 0;
                const moveWord = counts.total === 1 ? 'move' : 'moves';
                const tabLabel = disabled
                  ? `${b.label}, no moves`
                  : `${b.label}, ${counts.analyzed} of ${counts.total} analyzed ${moveWord}`;
                return (
                  <button
                    key={b.key}
                    type="button"
                    onClick={() => {
                      if (!disabled) setPhaseFilter(b.key);
                    }}
                    disabled={disabled}
                    aria-label={tabLabel}
                    title={
                      disabled
                        ? `No moves in ${b.label}`
                        : `${counts.analyzed}/${counts.total} analyzed ${moveWord} in ${b.label}`
                    }
                    className={[
                      'min-h-11 min-w-0 inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border text-sm font-semibold transition-colors',
                      active
                        ? 'bg-[var(--ui-accent-soft)] border-[var(--ui-accent)] text-[var(--ui-accent)]'
                        : disabled
                          ? 'bg-[var(--ui-surface)] border-[var(--ui-border)] text-[var(--ui-text-muted)] opacity-55 cursor-not-allowed'
                          : 'bg-[var(--ui-surface)] border-[var(--ui-border)] text-[var(--ui-text)] hover:bg-[var(--ui-surface-2)]',
                    ].join(' ')}
                  >
                    <span className="min-w-0 truncate">{b.label}</span>
                    <span className="shrink-0 rounded-full border border-current/20 px-1.5 py-0.5 font-mono text-[11px] leading-none opacity-80">
                      {counts.analyzed}/{counts.total}
                    </span>
                  </button>
                );
              })}
            </div>

          <div className="flex flex-wrap items-center gap-2 print-hide">
            {[
              { key: 'all', label: 'All players' },
              { key: 'black', label: playerNames.black },
              { key: 'white', label: playerNames.white },
            ].map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => setPlayerFilter(opt.key as 'all' | Player)}
                className={[
                  'inline-flex min-h-11 items-center justify-center px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors',
                  playerFilter === opt.key
                    ? 'bg-[var(--ui-accent-soft)] text-[var(--ui-accent)] border-[var(--ui-accent)]'
                    : 'bg-[var(--ui-surface)] border-[var(--ui-border)] text-[var(--ui-text-muted)] hover:bg-[var(--ui-surface-2)] hover:text-[var(--ui-text)]',
                ].join(' ')}
              >
                {opt.label}
              </button>
            ))}
            {bucketFilterLabel && (
              <button
                type="button"
                onClick={() => setBucketFilter(null)}
                className="inline-flex min-h-11 items-center justify-center px-3 py-1.5 rounded-full text-xs font-semibold border bg-[var(--ui-accent-soft)] border-[var(--ui-accent)] text-[var(--ui-accent)]"
                title="Clear loss bucket filter"
              >
                Loss {bucketFilterLabel} x
              </button>
            )}
            {policyFilter && policyFilterLabel && (
              <button
                type="button"
                onClick={() => setPolicyFilter(null)}
                className={[
                  'inline-flex min-h-11 items-center justify-center px-3 py-1.5 rounded-full text-xs font-semibold border',
                  policyCategoryClass(policyFilter),
                ].join(' ')}
                title="Clear policy quality filter"
              >
                Quality {policyFilterLabel} x
              </button>
            )}
          </div>

          <div className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface)] p-3 shadow-[0_10px_30px_rgba(0,0,0,0.22)]">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className={sectionTitleClass}>{analysisStatusTitle}</div>
                <div className="mt-1 text-sm text-[var(--ui-text-muted)]">{analysisStatusDetail}</div>
              </div>
              <button
                type="button"
                onClick={handleReviewClick}
                disabled={isPreparingPdf || (!isGameAnalysisRunning && !hasReviewTargets)}
                className={[
                  'min-h-11 shrink-0 rounded-lg px-3 py-2 text-sm font-semibold disabled:opacity-60',
                  isGameAnalysisRunning
                    ? 'bg-rose-600/80 text-white hover:bg-rose-500'
                    : hasFullCoverage
                      ? 'bg-[var(--ui-surface-2)] text-[var(--ui-text)] border border-[var(--ui-border)] hover:brightness-110'
                      : 'ui-accent-bg hover:brightness-110',
                ].join(' ')}
              >
                {reviewButtonLabel}
              </button>
            </div>
            <div
              className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--ui-surface-2)]"
              role="progressbar"
              aria-label="Report analysis coverage"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={coveragePercent}
            >
              <div
                className={['h-full', hasFullCoverage ? 'bg-emerald-400' : 'bg-[var(--ui-accent)]'].join(' ')}
                style={{ width: `${coveragePercent}%` }}
              />
            </div>
          </div>

          {studyFocus && (
            <div className={sectionClass} data-game-report-study-focus="true" aria-label="Study focus">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <FaBookOpen className="text-[var(--ui-accent)]" aria-hidden="true" />
                    <div className={sectionTitleClass}>Study Focus</div>
                  </div>
                  <div className={`mt-2 text-lg font-semibold ${valueClass}`}>{studyFocus.issueLabel}</div>
                  <div className={`mt-1 text-xs ${mutedClass}`}>
                    Suggested from the weakest phase/player slice in the current filters.
                  </div>
                </div>
                <span className="shrink-0 rounded-full border border-[var(--ui-accent)] bg-[var(--ui-accent-soft)] px-3 py-1 text-xs font-semibold text-[var(--ui-accent)]">
                  {getPhaseLabel(studyFocus.phase)} · {playerNames[studyFocus.player]}
                </span>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                <div>
                  <div className={faintClass}>Analyzed</div>
                  <div className={`mt-1 font-mono text-sm ${valueClass}`}>{studyFocus.analyzedMoves}</div>
                </div>
                <div>
                  <div className={faintClass}>Weighted loss</div>
                  <div className={`mt-1 font-mono text-sm ${valueClass}`}>{fmtNum(studyFocus.weightedPtLoss, 2)}</div>
                </div>
                <div>
                  <div className={faintClass}>Mean loss</div>
                  <div className={`mt-1 font-mono text-sm ${valueClass}`}>{fmtNum(studyFocus.meanPtLoss, 2)}</div>
                </div>
                <div>
                  <div className={faintClass}>Policy</div>
                  <div className={`mt-1 font-mono text-sm ${valueClass}`}>{fmtNum(studyFocus.policyAccuracy, 1)}</div>
                </div>
              </div>

              {studyFocus.policyProblem && (
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                  <span className={mutedClass}>Policy pattern:</span>
                  <span className={[
                    'rounded-full border px-2 py-0.5 font-semibold',
                    policyCategoryClass(studyFocus.policyProblem.category),
                  ].join(' ')}>
                    {policyCategoryLabel(studyFocus.policyProblem.category)}
                  </span>
                  <span className={`font-mono ${faintClass}`}>
                    {studyFocus.policyProblem.count} moves · {fmtPct(studyFocus.policyProblem.ratio)}
                  </span>
                </div>
              )}

              <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--ui-text-faint)]">Beginner next step</div>
                  <div className={`mt-1 ${mutedClass}`}>{studyFocus.beginnerTip}</div>
                </div>
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--ui-text-faint)]">Pro review</div>
                  <div className={`mt-1 ${mutedClass}`}>{studyFocus.proTip}</div>
                </div>
              </div>

              {studyFocus.topEntry && (
                <div className={`mt-3 flex flex-wrap items-center gap-2 border-t border-[var(--ui-border)] pt-3 text-xs ${mutedClass}`}>
                  <span className={`font-mono font-semibold ${valueClass}`}>#{studyFocus.topEntry.moveNumber}</span>
                  <span>{studyFocus.topEntry.player === 'black' ? 'B' : 'W'} {studyFocus.topEntry.move}</span>
                  <span className="font-mono text-[var(--ui-danger)]">-{fmtNum(studyFocus.topEntry.pointsLost, 2)}</span>
                  <span>Engine preferred {studyFocus.topEntry.topMove ?? '-'}</span>
                  <div className="ml-auto flex flex-wrap gap-2 print-hide">
                    <button
                      type="button"
                      onClick={() => jumpToNode(studyFocus.topEntry!.node)}
                      className={`px-2 py-1 ${secondaryButtonClass}`}
                    >
                      Jump
                    </button>
                    <button
                      type="button"
                      onClick={() => startPractice(studyFocus.topEntry!)}
                      className="rounded border border-[var(--ui-accent)] bg-[var(--ui-accent-soft)] px-2 py-1 font-semibold text-[var(--ui-accent)] hover:brightness-110"
                    >
                      <span className="inline-flex items-center gap-1"><FaBullseye aria-hidden="true" /> Practice</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className={sectionClass}>
              <div className={sectionTitleClass}>Phase</div>
              <div className={`mt-2 text-lg font-semibold ${valueClass}`}>{phaseLabel}</div>
              <div className={`mt-1 text-xs ${mutedClass}`}>Filter applies to report metrics.</div>
            </div>
            <div className={sectionClass}>
              <div className={sectionTitleClass}>Analyzed Moves</div>
              <div className={`mt-2 text-lg font-semibold ${valueClass}`}>
                {analyzedMoves}/{totalMoves || 0}
              </div>
              <div className="mt-2 h-2 rounded-full bg-[var(--ui-surface-2)] overflow-hidden">
                <div
                  className="h-full bg-[var(--ui-accent)] opacity-70"
                  style={{ width: `${Math.round(coverage * 100)}%` }}
                />
              </div>
              <div className={`mt-2 text-xs ${mutedClass}`}>Filters apply to analysis coverage.</div>
            </div>
            <div className={sectionClass}>
              <div className={sectionTitleClass}>Coverage</div>
              <div className={`mt-2 text-lg font-semibold ${valueClass}`}>{fmtPct(coverage)}</div>
              <div className={`mt-1 text-xs ${mutedClass}`}>Based on moves with analysis data.</div>
            </div>
          </div>

          <div className={sectionClass}>
            <div className={sectionTitleClass}>Key Stats</div>
            <div className={['mt-3 grid gap-2 text-sm', statsPlayers.length === 2 ? 'grid-cols-3' : 'grid-cols-2'].join(' ')}>
              <div className={`text-xs uppercase tracking-wide ${faintClass}`}>Metric</div>
              {statsPlayers.map((player) => (
                <div key={player} className={`min-w-0 truncate text-center text-xs font-semibold ${faintClass}`} title={playerNames[player]}>
                  {playerNames[player]}
                </div>
              ))}

              {keyStatRows.map(({ label, description, value }) => (
                <React.Fragment key={label}>
                  <div className={labelClass} title={description} aria-label={`${label}. ${description}`}>
                    {label}
                  </div>
                  {statsPlayers.map((player) => (
                    <div key={`${label}-${player}`} className={`text-center font-mono ${valueClass}`}>
                      {value(player)}
                    </div>
                  ))}
                </React.Fragment>
              ))}
            </div>
            <p className={`mt-3 text-xs ${faintClass}`}>
              Requires analysis on consecutive moves (both parent and child) to compute point loss.
            </p>
          </div>

          <div className={sectionClass}>
            <div className={sectionTitleClass}>Policy Quality</div>
            <div className={['mt-3 grid gap-4', statsPlayers.length === 2 ? 'sm:grid-cols-2' : 'grid-cols-1'].join(' ')}>
              {statsPlayers.map((player) => {
                const distribution = report.stats[player].policyDistribution;
                const total = distribution?.total ?? 0;
                return (
                  <div key={player} className={`${insetSurfaceClass} p-3`}>
                    <div className="flex items-center justify-between gap-3">
                      <div className={`flex items-center gap-2 text-sm font-semibold ${valueClass}`}>
                        <span
                          className={[
                            'h-2.5 w-2.5 rounded-full border',
                            player === 'black' ? 'game-report-player-swatch--black' : 'game-report-player-swatch--white',
                          ].join(' ')}
                          aria-hidden="true"
                        />
                        <span className="min-w-0 truncate" title={playerNames[player]}>{playerNames[player]}</span>
                      </div>
                      <div className="text-right">
                        <div className={`text-[10px] uppercase tracking-wide ${faintClass}`}>Policy accuracy</div>
                        <div className={`font-mono text-sm ${valueClass}`}>{fmtNum(report.stats[player].policyAccuracy, 1)}</div>
                      </div>
                    </div>
                    <div className="mt-3 h-4 rounded-full bg-[var(--ui-surface-2)] overflow-hidden flex border border-[var(--ui-border)]">
                      {total === 0 ? (
                        <div className="h-full w-full bg-[var(--ui-border)]" />
                      ) : (
                        MOVE_POLICY_CATEGORIES
                          .filter((category) => (distribution?.[category] ?? 0) > 0)
                          .map((category) => {
                            const count = distribution?.[category] ?? 0;
                            return (
                              <div
                                key={`${player}-${category}`}
                                className="h-full"
                                style={{
                                  width: `${(count / total) * 100}%`,
                                  backgroundColor: policyCategoryColor(category),
                                }}
                                title={`${policyCategoryLabel(category)}: ${count}`}
                              />
                            );
                          })
                      )}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {MOVE_POLICY_CATEGORIES.map((category) => {
                        const count = distribution?.[category] ?? 0;
                        const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                        const active = policyFilter === category && (playerFilter === 'all' || playerFilter === player);
                        const playerLabel = playerNames[player];
                        const categoryLabel = policyCategoryLabel(category);
                        const moveWord = count === 1 ? 'move' : 'moves';
                        return (
                          <button
                            type="button"
                            key={`${player}-${category}-legend`}
                            onClick={() => {
                              setPlayerFilter(player);
                              setPolicyFilter((prev) => (prev === category && playerFilter === player ? null : category));
                            }}
                            disabled={count === 0}
                            aria-pressed={active}
                            aria-label={
                              count === 0
                                ? `${playerLabel} ${categoryLabel}: no moves`
                                : `Filter ${playerLabel} policy quality ${categoryLabel}: ${count} ${moveWord}, ${pct}%`
                            }
                            title={
                              count === 0
                                ? `No ${categoryLabel} moves for ${playerLabel}`
                                : `Filter ${playerLabel} mistakes to ${categoryLabel}`
                            }
                            className={[
                              'inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] transition-colors',
                              active
                                ? 'border-[var(--ui-accent)] bg-[var(--ui-accent-soft)] text-[var(--ui-accent)] ring-1 ring-[var(--ui-accent)]'
                                : 'border-[var(--ui-border)] bg-[var(--ui-surface)] text-[var(--ui-text-muted)] hover:bg-[var(--ui-surface-2)] hover:text-[var(--ui-text)]',
                              count === 0 ? 'opacity-45 cursor-not-allowed hover:bg-[var(--ui-surface)]' : '',
                            ].join(' ')}
                          >
                            <span
                              className="h-2 w-2 rounded-full"
                              style={{ backgroundColor: policyCategoryColor(category) }}
                              aria-hidden="true"
                            />
                            <span>{categoryLabel}</span>
                            <span className="font-mono text-[var(--ui-text-muted)]">{count}</span>
                            <span className="font-mono text-[var(--ui-text-faint)]">{pct}%</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className={sectionClass}>
            <div className="flex items-center justify-between">
              <div className={sectionTitleClass}>Board Snapshot</div>
              <button
                type="button"
                onClick={refreshSnapshot}
                className={`px-3 py-1 text-xs font-semibold print-hide ${secondaryPillClass}`}
              >
                Refresh
              </button>
            </div>
            <div className={`mt-3 p-3 flex items-center justify-center ${insetSurfaceClass}`}>
              {snapshotUrl ? (
                <img
                  src={snapshotUrl}
                  alt="Board snapshot"
                  className="max-h-[260px] w-auto rounded-md border border-[var(--ui-border)]"
                />
              ) : (
                <div className={`text-sm ${mutedClass}`}>
                  {snapshotError ?? 'Capturing board snapshot...'}
                </div>
              )}
            </div>
            <div className={`mt-2 text-xs print-muted ${mutedClass}`}>
              Snapshot reflects the current board position and auto-updates on move.
            </div>
          </div>

          <div className={sectionClass}>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className={sectionTitleClass}>Analysis Graph</div>
                <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full ui-accent-soft border print-hide">
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
            <div className={`mt-3 p-2 ${insetSurfaceClass}`}>
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
                <div className={`h-20 flex items-center justify-center text-sm ${faintClass}`}>Graph hidden</div>
              )}
            </div>
            <div className={`mt-2 text-xs ${mutedClass}`}>
              Score lead and winrate are from the current analysis data.
            </div>
          </div>

          <div className={sectionClass}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className={sectionTitleClass}>Critical Swings</div>
              <span className={`rounded-full border border-[var(--ui-border)] bg-[var(--ui-surface)] px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${mutedClass}`}>
                {turningPoints.length} over {CRITICAL_SWING_THRESHOLD} pts
              </span>
            </div>
            {turningPoints.length === 0 ? (
              <div className={`mt-2 text-sm ${faintClass}`}>No major score swings match these filters.</div>
            ) : (
              <div className="mt-3 space-y-2">
                {turningPoints.map((entry) => (
                  <div
                    key={`${entry.node.id}-swing-${entry.moveNumber}`}
                    className={`flex flex-wrap items-center gap-2 px-3 py-2 text-xs ${insetSurfaceClass}`}
                  >
                    <span className={`font-mono font-semibold ${valueClass}`}>#{entry.moveNumber}</span>
                    <span className={`rounded-full border border-[var(--ui-border)] px-2 py-0.5 font-semibold ${mutedClass}`}>
                      {entry.player === 'black' ? 'B' : 'W'} {entry.move}
                    </span>
                    <span className={`font-mono ${mutedClass}`}>
                      {fmtSigned(entry.scoreBefore)} {'->'} {fmtSigned(entry.scoreAfter)}
                    </span>
                    <span className={['font-mono font-semibold', entry.winRateSwing >= 0 ? 'text-emerald-300' : 'text-rose-300'].join(' ')}>
                      Win {fmtWinSwing(entry.winRateSwing)}
                    </span>
                    <span className={['font-mono font-semibold', entry.scoreDelta >= 0 ? valueClass : mutedClass].join(' ')}>
                      {describeReportSwing(entry)}
                    </span>
                    {entry.policy && (
                      <span className={[
                        'rounded-full border px-2 py-0.5 font-semibold',
                        policyCategoryClass(entry.policy.category),
                      ].join(' ')}>
                        {policyCategoryLabel(entry.policy.category)} #{entry.policy.rank || '?'}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => jumpToNode(entry.node)}
                      className={`ml-auto px-2 py-1 print-hide ${secondaryButtonClass}`}
                    >
                      Jump
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className={sectionClass}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className={sectionTitleClass}>Best Recoveries</div>
              <span className={`rounded-full border border-[var(--ui-border)] bg-[var(--ui-surface)] px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${mutedClass}`}>
                {recoveries.length} over {RECOVERY_THRESHOLD} pts
              </span>
            </div>
            {recoveries.length === 0 ? (
              <div className={`mt-2 text-sm ${faintClass}`}>No point-gaining recovery moves match these filters.</div>
            ) : (
              <div className="mt-3 space-y-2">
                {recoveries.map((entry) => (
                  <div
                    key={`${entry.node.id}-recovery-${entry.moveNumber}`}
                    className={`flex flex-wrap items-center gap-2 px-3 py-2 text-xs ${insetSurfaceClass}`}
                  >
                    <span className={`font-mono font-semibold ${valueClass}`}>#{entry.moveNumber}</span>
                    <span className={`rounded-full border border-[var(--ui-border)] px-2 py-0.5 font-semibold ${mutedClass}`}>
                      {entry.player === 'black' ? 'B' : 'W'} {entry.move}
                    </span>
                    <span className={`font-mono ${mutedClass}`}>
                      {fmtSigned(entry.scoreBefore)} {'->'} {fmtSigned(entry.scoreAfter)}
                    </span>
                    <span className={['font-mono font-semibold', entry.winRateSwing >= 0 ? 'text-emerald-300' : 'text-rose-300'].join(' ')}>
                      Win {fmtWinSwing(entry.winRateSwing)}
                    </span>
                    <span className="font-mono font-semibold text-emerald-300">
                      {describeReportSwing(entry)}
                    </span>
                    {entry.policy && (
                      <span className={[
                        'rounded-full border px-2 py-0.5 font-semibold',
                        policyCategoryClass(entry.policy.category),
                      ].join(' ')}>
                        {policyCategoryLabel(entry.policy.category)} #{entry.policy.rank || '?'}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => jumpToNode(entry.node)}
                      className={`ml-auto px-2 py-1 print-hide ${secondaryButtonClass}`}
                    >
                      Jump
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className={sectionClass}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <div className={sectionTitleClass}>Biggest Mistakes</div>
                <div
                  className="inline-flex rounded-full border border-[var(--ui-border)] bg-[var(--ui-surface)] p-0.5 print-hide"
                  aria-label="Mistake sort order"
                >
                  {[
                    { key: 'loss', label: 'Loss', title: 'Sort by point loss' },
                    { key: 'policy', label: 'Quality', title: 'Sort by policy severity' },
                  ].map((option) => {
                    const active = mistakeSort === option.key;
                    return (
                      <button
                        key={option.key}
                        type="button"
                        onClick={() => setMistakeSort(option.key as GameReportMistakeSort)}
                        aria-pressed={active}
                        title={option.title}
                        className={[
                          'px-2.5 py-1 rounded-full text-[11px] font-semibold transition-colors',
                          active
                            ? 'bg-[var(--ui-accent-soft)] text-[var(--ui-accent)]'
                            : 'text-[var(--ui-text-muted)] hover:text-[var(--ui-text)] hover:bg-[var(--ui-surface-2)]',
                        ].join(' ')}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <button
                type="button"
                onClick={() => startReviewQueue(topMistakes)}
                disabled={topMistakes.length === 0}
                className={`px-3 py-1 text-xs font-semibold disabled:opacity-40 print-hide ${secondaryPillClass}`}
              >
                Review {topMistakes.length}
              </button>
            </div>
            {activeReview && (
              <div className={`mt-3 p-3 print-hide ${insetSurfaceClass}`}>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className={sectionTitleClass}>Review Queue</span>
                  <span className={`font-mono ${mutedClass}`}>
                    {reviewIndex + 1}/{reviewQueue.length}
                  </span>
                  <span className={mutedClass}>
                    Move {activeReview.moveNumber} · {playerNames[activeReview.player]} · {activeReview.move}
                  </span>
                  <span className="font-mono text-rose-300">-{fmtNum(activeReview.pointsLost, 2)}</span>
                  {activeReview.policy && (
                    <span className={[
                      'rounded-full border px-2 py-0.5 font-semibold',
                      policyCategoryClass(activeReview.policy.category),
                    ].join(' ')}>
                      {policyCategoryLabel(activeReview.policy.category)} #{activeReview.policy.rank || '?'} · {fmtPolicyPct(activeReview.policy.relativePrior)}
                    </span>
                  )}
                  <div className="ml-auto flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => startPractice(activeReview)}
                      className="px-2 py-1 rounded border border-[var(--ui-accent)] text-[var(--ui-accent)] hover:brightness-110"
                    >
                      Practice
                    </button>
                    <button
                      type="button"
                      onClick={() => reviewStep(-1)}
                      disabled={reviewIndex === 0}
                      className={`px-2 py-1 disabled:opacity-40 ${secondaryButtonClass}`}
                    >
                      Prev
                    </button>
                    <button
                      type="button"
                      onClick={() => reviewStep(1)}
                      disabled={reviewIndex >= reviewQueue.length - 1}
                      className={`px-2 py-1 disabled:opacity-40 ${secondaryButtonClass}`}
                    >
                      Next
                    </button>
                    <button
                      type="button"
                      onClick={() => setReviewQueue([])}
                      className={`px-2 py-1 ${secondaryButtonClass}`}
                    >
                      Close
                    </button>
                  </div>
                </div>
                <div className={`mt-2 text-xs ${mutedClass}`}>
                  Played {activeReview.move}; engine preferred {activeReview.topMove ?? '-'}.
                </div>
              </div>
            )}
            {topMistakes.length === 0 ? (
              <div className={`mt-2 text-sm ${faintClass}`}>No moves match these filters.</div>
            ) : (
              <div className={`mt-3 grid grid-cols-12 gap-2 text-xs ${mutedClass}`}>
                <div className="col-span-2 uppercase tracking-wide text-[10px]">Move</div>
                <div className="col-span-1 text-center uppercase tracking-wide text-[10px]">P</div>
                <div className="col-span-2 uppercase tracking-wide text-[10px]">Played</div>
                <div className="col-span-2 uppercase tracking-wide text-[10px]">Top</div>
                <div className="col-span-2 text-right uppercase tracking-wide text-[10px]">Loss</div>
                <div className="col-span-3 text-right uppercase tracking-wide text-[10px]">Action</div>
                {renderMistakeRows(topMistakes, true)}
              </div>
            )}
          </div>

          <div className={sectionClass}>
            <div className="flex items-center justify-between">
              <div className={sectionTitleClass}>Point Loss Histogram</div>
              <div className={`flex items-center gap-2 text-[10px] ${mutedClass}`}>
                <span className="inline-flex items-center gap-1"><span className="game-report-histogram-swatch game-report-histogram-bar--black" />Black</span>
                <span className="inline-flex items-center gap-1"><span className="game-report-histogram-swatch game-report-histogram-bar--white" />White</span>
              </div>
            </div>
            <div className="mt-3 space-y-2">
              {playerDistributions.map(({ player, total, segments }) => (
                <div key={player}>
                  <div className={`mb-1 flex items-center justify-between text-[10px] uppercase tracking-wide ${faintClass}`}>
                    <span>{player === 'black' ? 'Black distribution' : 'White distribution'}</span>
                    <span>{total} moves</span>
                  </div>
                  <div className="h-3 rounded-full bg-[var(--ui-surface-2)] overflow-hidden flex border border-[var(--ui-border)]">
                    {total === 0 ? (
                      <div className="h-full w-full bg-[var(--ui-border)]" />
                    ) : (
                      segments
                        .filter((segment) => segment.count > 0)
                        .map((segment) => (
                          <button
                            type="button"
                            key={`${player}-${segment.label}`}
                            className="h-full hover:brightness-125 focus-visible:z-10"
                            onClick={() => {
                              setPlayerFilter(player);
                              setBucketFilter(report.labels.findIndex((label) => label === segment.label));
                            }}
                            title={`${segment.label}: ${segment.count}`}
                            style={{
                              width: `${(segment.count / total) * 100}%`,
                              backgroundColor: segment.color,
                            }}
                            aria-label={`${player} ${segment.label}: ${segment.count}`}
                          />
                        ))
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 grid grid-cols-12 gap-2 text-xs">
              <div className={`col-span-3 uppercase tracking-wide text-[10px] ${faintClass}`}>Threshold</div>
              <div className={`col-span-5 uppercase tracking-wide text-[10px] ${faintClass}`}>Distribution</div>
              {playerFilter === 'all' ? (
                <>
                  <div className={`col-span-2 text-center uppercase tracking-wide text-[10px] ${faintClass}`}>B</div>
                  <div className={`col-span-2 text-center uppercase tracking-wide text-[10px] ${faintClass}`}>W</div>
                </>
              ) : (
                <div className={`col-span-4 text-center uppercase tracking-wide text-[10px] ${faintClass}`}>
                  {playerNames[playerFilter]}
                </div>
              )}

              {report.labels
                .map((label, idx) => ({ label, idx }))
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
                      <div className={`col-span-3 ${mutedClass}`}>{label}</div>
                      <div className="col-span-5">
                        <button
                          type="button"
                          className={[
                            'h-2 w-full rounded-full bg-[var(--ui-surface-2)] overflow-hidden flex hover:brightness-125',
                            bucketFilter === idx ? 'ring-2 ring-[var(--ui-accent)]' : '',
                          ].join(' ')}
                          onClick={() => setBucketFilter(bucketFilter === idx ? null : idx)}
                          aria-label={`Filter loss bucket ${label}`}
                        >
                          {playerFilter === 'all' ? (
                            <>
                              <div className="h-full game-report-histogram-bar--black" style={{ width: blackWidth }} />
                              <div className="h-full game-report-histogram-bar--white" style={{ width: whiteWidth }} />
                            </>
                          ) : (
                            <div
                              className={[
                                'h-full',
                                playerFilter === 'black'
                                  ? 'game-report-histogram-bar--black'
                                  : 'game-report-histogram-bar--white',
                              ].join(' ')}
                              style={{ width: singleWidth }}
                            />
                          )}
                        </button>
                      </div>
                      {playerFilter === 'all' ? (
                        <>
                          <div className={`col-span-2 text-center font-mono ${valueClass}`}>{row.black}</div>
                          <div className={`col-span-2 text-center font-mono ${valueClass}`}>{row.white}</div>
                        </>
                      ) : (
                        <div className={`col-span-4 text-center font-mono ${valueClass}`}>
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
                  <div className="pdf-cover-subtitle">KaTrain Official Report</div>
                  <div className="pdf-cover-title pdf-title">Game Analysis Summary</div>
                  <div className="mt-2 text-sm font-semibold text-slate-700">
                    {playerNames.black} vs {playerNames.white}
                  </div>
                </div>
                <div className="text-xs text-slate-600">
                  {generatedAt.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                  {' • '}
                  {generatedAt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
              <div className="mt-5 grid grid-cols-3 gap-4 text-sm">
                <div>
                  <div className="pdf-section-title">Phase</div>
                  <div className="text-base font-semibold text-slate-900">{phaseLabel}</div>
                </div>
                <div>
                  <div className="pdf-section-title">Coverage</div>
                  <div className="text-base font-semibold text-slate-900">{fmtPct(coverage)}</div>
                </div>
                <div>
                  <div className="pdf-section-title">Analyzed Moves</div>
                  <div className="text-base font-semibold text-slate-900">
                    {analyzedMoves}/{totalMoves || 0}
                  </div>
                </div>
              </div>
              <div className="mt-6 text-sm text-slate-700">
                Filters: {activeFilterLabels.join(' - ')} • Sort: {mistakeSortLabel} • Showing top {pdfMistakes.length} mistakes
              </div>
              <div className="mt-6">
                <div className="pdf-section-title">Key Stats</div>
                <div className={['mt-2 grid gap-x-4 gap-y-1 text-xs', statsPlayers.length === 2 ? 'grid-cols-3' : 'grid-cols-2'].join(' ')}>
                  <div className="font-semibold uppercase tracking-wide text-slate-500">Metric</div>
                  {statsPlayers.map((player) => (
                    <div key={`pdf-stats-${player}`} className="truncate text-center font-semibold text-slate-500">
                      {playerNames[player]}
                    </div>
                  ))}
                  {keyStatRows.map(({ label, value }) => (
                    <React.Fragment key={`pdf-${label}`}>
                      <div className="text-slate-600">{label}</div>
                      {statsPlayers.map((player) => (
                        <div key={`pdf-${label}-${player}`} className="text-center font-mono text-slate-900">
                          {value(player)}
                        </div>
                      ))}
                    </React.Fragment>
                  ))}
                </div>
              </div>
              <div className="mt-6">
                <div className="pdf-section-title">Policy Quality</div>
                <div className={['mt-2 grid gap-3 text-xs', statsPlayers.length === 2 ? 'grid-cols-2' : 'grid-cols-1'].join(' ')}>
                  {statsPlayers.map((player) => {
                    const distribution = report.stats[player].policyDistribution;
                    const total = distribution?.total ?? 0;
                    return (
                      <div key={`pdf-policy-${player}`} className="rounded border border-slate-300 p-2">
                        <div className="flex items-center justify-between gap-3">
                          <div className="truncate font-semibold text-slate-900">{playerNames[player]}</div>
                          <div className="font-mono text-slate-700">Policy acc. {fmtNum(report.stats[player].policyAccuracy, 1)}</div>
                        </div>
                        <div className="mt-2 flex h-2 overflow-hidden rounded bg-slate-200">
                          {total === 0 ? (
                            <div className="h-full w-full bg-slate-300" />
                          ) : (
                            MOVE_POLICY_CATEGORIES
                              .filter((category) => (distribution?.[category] ?? 0) > 0)
                              .map((category) => {
                                const count = distribution?.[category] ?? 0;
                                return (
                                  <div
                                    key={`pdf-policy-${player}-${category}`}
                                    className="h-full"
                                    style={{
                                      width: `${(count / total) * 100}%`,
                                      backgroundColor: policyCategoryColor(category),
                                    }}
                                  />
                                );
                              })
                          )}
                        </div>
                        <div className="mt-2 grid grid-cols-5 gap-1">
                          {MOVE_POLICY_CATEGORIES.map((category) => {
                            const count = distribution?.[category] ?? 0;
                            const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                            return (
                              <div key={`pdf-policy-label-${player}-${category}`} className="min-w-0">
                                <div className="truncate text-slate-600">{policyCategoryLabel(category)}</div>
                                <div className="font-mono text-slate-900">
                                  {count} ({pct}%)
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="mt-6">
                <div className="pdf-section-title">Critical Swings</div>
                {turningPoints.length === 0 ? (
                  <div className="mt-2 text-sm text-slate-600">No major score swings match these filters.</div>
                ) : (
                  <div className="mt-2 space-y-2 text-sm">
                    {turningPoints.map((entry) => (
                      <div
                        key={`${entry.node.id}-pdf-swing-${entry.moveNumber}`}
                        className="flex items-center justify-between gap-4 rounded border border-slate-300 px-3 py-2"
                      >
                        <div>
                          <span className="font-semibold text-slate-900">Move {entry.moveNumber}</span>
                          <span className="text-slate-700">
                            {' '}
                            {playerNames[entry.player]} {entry.move}
                          </span>
                        </div>
                        <div className="font-mono text-slate-700">
                          {fmtSigned(entry.scoreBefore)} {'->'} {fmtSigned(entry.scoreAfter)}
                        </div>
                        <div className="font-mono text-slate-700">Win {fmtWinSwing(entry.winRateSwing)}</div>
                        <div className="font-semibold text-slate-900">{describeReportSwing(entry)}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="mt-6">
                <div className="pdf-section-title">Best Recoveries</div>
                {recoveries.length === 0 ? (
                  <div className="mt-2 text-sm text-slate-600">No point-gaining recovery moves match these filters.</div>
                ) : (
                  <div className="mt-2 space-y-2 text-sm">
                    {recoveries.map((entry) => (
                      <div
                        key={`${entry.node.id}-pdf-recovery-${entry.moveNumber}`}
                        className="flex items-center justify-between gap-4 rounded border border-slate-300 px-3 py-2"
                      >
                        <div>
                          <span className="font-semibold text-slate-900">Move {entry.moveNumber}</span>
                          <span className="text-slate-700">
                            {' '}
                            {playerNames[entry.player]} {entry.move}
                          </span>
                        </div>
                        <div className="font-mono text-slate-700">
                          {fmtSigned(entry.scoreBefore)} {'->'} {fmtSigned(entry.scoreAfter)}
                        </div>
                        <div className="font-mono text-slate-700">Win {fmtWinSwing(entry.winRateSwing)}</div>
                        <div className="font-semibold text-slate-900">
                          {describeReportSwing(entry)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
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
                      <div className="pdf-section-title">
                        Mistake {idx + 1} of {pdfMistakes.length}
                      </div>
                      <div className="text-lg font-semibold text-slate-900">
                        Move {entry.moveNumber} - {playerNames[entry.player]}
                      </div>
                      <div className="text-sm text-slate-700">
                        Played {entry.move} • Best {entry.topMove ?? '-'} • Loss {fmtNum(entry.pointsLost, 2)} • Win {fmtWinSwing(entry.winRateSwing)}
                      </div>
                    </div>
                    <div className="text-xs text-slate-600">
                      Phase: {phaseLabel}
                    </div>
                  </div>
                  <div className="mt-4 pdf-board-wrap">
                    {dataUrl ? (
                      <img src={dataUrl} alt={`Move ${entry.moveNumber} snapshot`} className="pdf-board" />
                    ) : (
                      <div className="text-[10px] text-slate-500">Snapshot missing</div>
                    )}
                  </div>
                  <div className="mt-4">
                    <div className="pdf-section-title">Correct Move Tree</div>
                    <div className="mt-2">{renderPvTree(entry)}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="px-5 py-4 ui-bar border-t border-[var(--ui-border)] flex flex-wrap items-center justify-between gap-3 print-hide">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleReviewClick}
              className={[
                'min-h-11 px-4 py-2 rounded-lg font-semibold disabled:opacity-60',
                isGameAnalysisRunning
                  ? 'bg-rose-600/80 hover:bg-rose-500 text-white'
                  : hasFullCoverage
                    ? 'bg-[var(--ui-surface-2)] text-[var(--ui-text)] border border-[var(--ui-border)] hover:brightness-110'
                    : 'ui-accent-bg hover:brightness-110',
              ].join(' ')}
              disabled={isPreparingPdf || (!isGameAnalysisRunning && !hasReviewTargets)}
            >
              {reviewButtonLabel}
            </button>
            <button
              type="button"
              onClick={handlePrintReport}
              className="min-h-11 px-4 py-2 bg-[var(--ui-surface-2)] hover:brightness-110 text-[var(--ui-text)] border border-[var(--ui-border)] rounded-lg font-semibold disabled:opacity-60"
              disabled={isPreparingPdf}
            >
              {isPreparingPdf
                ? 'Preparing print...'
                : 'Print / Save PDF'}
            </button>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 px-4 py-2 ui-accent-bg hover:brightness-110 rounded-lg font-semibold"
          >
            Done
          </button>
        </div>
      </div>
      {showReportGuide && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4 print-hide"
          role="dialog"
          aria-modal="true"
          aria-labelledby="report-guide-title"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeReportGuide();
          }}
        >
          <div className="ui-panel flex max-h-[88dvh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border shadow-2xl">
            <div className="flex items-center justify-between gap-4 border-b border-[var(--ui-border)] px-5 py-4 ui-bar">
              <div>
                <div className={sectionTitleClass}>Report Guide</div>
                <h3 id="report-guide-title" className="text-lg font-semibold text-[var(--ui-text)]">
                  Reading this report
                </h3>
              </div>
              <button
                type="button"
                ref={reportGuideCloseRef}
                onClick={closeReportGuide}
                className="ui-control grid shrink-0 place-items-center rounded-lg text-[var(--ui-text-muted)] hover:bg-[var(--ui-surface-2)] hover:text-[var(--ui-text)]"
                aria-label="Close report guide"
                title="Close report guide"
              >
                <FaTimes aria-hidden="true" />
              </button>
            </div>
            <div className="space-y-5 overflow-y-auto px-5 py-4 text-sm">
              <section>
                <div className={sectionTitleClass}>Policy Quality</div>
                <div className="mt-3 divide-y divide-[var(--ui-border)] rounded-lg border border-[var(--ui-border)]">
                  {POLICY_GUIDE.map(({ category, detail }) => (
                    <div key={category} className="grid gap-2 px-3 py-2 sm:grid-cols-[8rem_1fr]">
                      <div className="inline-flex items-center gap-2 font-semibold text-[var(--ui-text)]">
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: policyCategoryColor(category) }}
                          aria-hidden="true"
                        />
                        {policyCategoryLabel(category)}
                      </div>
                      <div className="text-[var(--ui-text-muted)]">{detail}</div>
                    </div>
                  ))}
                </div>
              </section>

              <section>
                <div className={sectionTitleClass}>Point Loss Buckets</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {lossBucketGuide.map(({ label, color }) => (
                    <span
                      key={label}
                      className="inline-flex items-center gap-2 rounded-full border border-[var(--ui-border)] bg-[var(--ui-surface)] px-3 py-1 font-mono text-xs text-[var(--ui-text)]"
                    >
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} aria-hidden="true" />
                      {label}
                    </span>
                  ))}
                </div>
                <p className="mt-2 text-xs text-[var(--ui-text-muted)]">
                  Point loss uses consecutive analyzed positions, so gaps in analysis are excluded from the report.
                </p>
              </section>

              <section>
                <div className={sectionTitleClass}>Core Metrics</div>
                <dl className="mt-3 grid gap-3 sm:grid-cols-3">
                  <div>
                    <dt className="font-semibold text-[var(--ui-text)]">Accuracy</dt>
                    <dd className="mt-1 text-xs text-[var(--ui-text-muted)]">
                      Score-loss accuracy weighted by position difficulty.
                    </dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-[var(--ui-text)]">Policy accuracy</dt>
                    <dd className="mt-1 text-xs text-[var(--ui-text-muted)]">
                      Average quality score from the policy category distribution.
                    </dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-[var(--ui-text)]">Complexity</dt>
                    <dd className="mt-1 text-xs text-[var(--ui-text-muted)]">
                      How much policy mass sits on point-losing alternatives.
                    </dd>
                  </div>
                </dl>
              </section>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
