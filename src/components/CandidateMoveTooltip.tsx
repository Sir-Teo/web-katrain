import React from 'react';
import { createPortal } from 'react-dom';
import type { BoardSize, CandidateMove } from '../types';
import { formatBoardMoveLabel } from '../lib/gtp';
import { formatCandidatePointsLost, formatCandidateScore, formatCandidateWinRate } from '../utils/candidateMoveFormat';
import { getAnalysisTooltipHorizontal, getAnalysisTooltipTop } from '../utils/analysisTooltipPlacement';
import { getResizeObserverConstructor } from '../utils/resizeObserver';

type Placement = { target: HTMLElement; left: number; top: number; width: number; compact: boolean; columns: 1 | 2; ready: boolean; outside: boolean };
type Metric = { label: string; value: string; description?: string };
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

export function CandidateMoveTooltip({ boardRef, anchorX, anchorY, cellSize, boardSize, move, pvScrollHint = null }: {
  boardRef: React.RefObject<HTMLDivElement | null>;
  anchorX: number;
  anchorY: number;
  cellSize: number;
  boardSize: BoardSize;
  move: CandidateMove;
  pvScrollHint?: { shown: number; total: number } | null;
}) {
  const cardRef = React.useRef<HTMLDivElement>(null);
  const fullHeight = React.useRef<{ signature: string; height: number } | null>(null);
  const compactHeight = React.useRef<{ signature: string; height: number } | null>(null);
  const [placement, setPlacement] = React.useState<Placement | null>(null);
  const [, resize] = React.useReducer(value => value + 1, 0);
  const pv = move.pv?.join(' ') ?? '';
  const metrics: Metric[] = [
    { label: 'B win', value: formatCandidateWinRate(move.winRate), description: "Black's win rate after this move" },
    { label: 'B score', value: formatCandidateScore(move.scoreLead), description: 'Score lead for Black after this move' },
    { label: 'Loss', value: formatCandidatePointsLost(move.pointsLost), description: "Points lost against the position's evaluation" },
    { label: 'Visits', value: finite(move.visits) ? String(move.visits) : '—' },
  ];
  if (finite(move.scoreStdev)) metrics.push({ label: 'Spread', value: `±${move.scoreStdev.toFixed(1)}`, description: 'Standard deviation of the score estimate' });
  if (finite(move.relativePointsLost)) metrics.push({ label: 'Rel. loss', value: formatCandidatePointsLost(move.relativePointsLost), description: 'Points behind the top candidate' });
  if (finite(move.winRateLost)) metrics.push({ label: 'Win loss', value: formatCandidateWinRate(move.winRateLost), description: 'Win rate lost by the side to play' });
  if (finite(move.lcb)) metrics.push({ label: 'LCB', value: formatCandidateWinRate(move.lcb), description: 'Lower confidence bound for Black' });
  if (finite(move.prior)) metrics.push({ label: 'Prior', value: formatCandidateWinRate(move.prior) });
  if (finite(move.humanPrior)) metrics.push({ label: 'Human', value: formatCandidateWinRate(move.humanPrior), description: 'Human policy prior' });

  // Measure before revealing the card. Only this small component rerenders;
  // geometry updates never resize the board or repaint its canvas layers.
  React.useLayoutEffect(() => {
    const board = boardRef.current;
    if (!board) return;
    const target = board.closest<HTMLElement>('[data-board-tooltip-boundary]') ?? board;
    const bounds = target.getBoundingClientRect();
    const rect = board.getBoundingClientRect();
    if (bounds.width <= 16 || bounds.height <= 16 || rect.width <= 0) return;
    const style = getComputedStyle(target);
    const topInset = Math.max(8, Number.parseFloat(style.paddingTop) || 0);
    const bottomInset = Math.max(8, Number.parseFloat(style.paddingBottom) || 0);
    const availableHeight = bounds.height - topInset - bottomInset;
    const args = { boundaryWidth: bounds.width, boardLeft: rect.left - bounds.left, boardWidth: rect.width, boardHeight: rect.height, anchorX, anchorY, cellSize };
    const normal = getAnalysisTooltipHorizontal(args);
    const signature = `${normal.width}|${metrics.length}|${pv}|${style.fontSize}|${!!pvScrollHint}`;
    const update = (next: Placement) => setPlacement(previous => previous && Object.keys(next).every(key => previous[key as keyof Placement] === next[key as keyof Placement]) ? previous : next);
    const base: Placement = { target, ...normal, top: 8, compact: false, columns: 1, ready: false };
    if (!placement || placement.target !== target || (placement.compact && fullHeight.current?.signature !== signature)) {
      update(base);
      return;
    }
    const horizontal = placement.columns === 2 ? getAnalysisTooltipHorizontal({ ...args, minimumWidth: 320, maximumWidth: 320 }) : normal;
    if (placement.width !== horizontal.width || !cardRef.current) {
      update({ ...base, ...horizontal, compact: placement.compact, columns: placement.columns });
      return;
    }
    const height = cardRef.current.getBoundingClientRect().height;
    if (!placement.compact) fullHeight.current = { signature, height };
    else if (placement.columns === 1) compactHeight.current = { signature, height };
    const compact = (fullHeight.current?.height ?? height) > availableHeight;
    const needsColumns = compactHeight.current?.signature === signature && compactHeight.current.height > availableHeight;
    const columns = compact && needsColumns ? 2 : 1;
    const nextHorizontal = columns === 2 ? getAnalysisTooltipHorizontal({ ...args, minimumWidth: 320, maximumWidth: 320 }) : normal;
    if (compact !== placement.compact || columns !== placement.columns) {
      update({ ...base, ...nextHorizontal, compact, columns });
      return;
    }
    update({ ...base, ...horizontal, compact, columns, ready: true, top: getAnalysisTooltipTop(rect.top - bounds.top + anchorY, height, bounds.height, topInset, bottomInset) });
  });

  React.useEffect(() => {
    const target = placement?.target;
    if (!target) return;
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => resize());
    };
    const Observer = getResizeObserverConstructor();
    const observer = Observer ? new Observer(update) : null;
    for (const element of [target, boardRef.current, cardRef.current]) if (element) observer?.observe(element);
    window.addEventListener('resize', update);
    return () => { observer?.disconnect(); window.removeEventListener('resize', update); cancelAnimationFrame(frame); };
  }, [boardRef, placement?.target]);

  if (!placement) return null;
  return createPortal(
    <div
      ref={cardRef}
      role="tooltip"
      data-candidate-tooltip={formatBoardMoveLabel(move, boardSize)}
      data-tooltip-outside-board={placement.outside}
      data-tooltip-compact={placement.compact}
      data-tooltip-columns={placement.columns}
      className={`pointer-events-none absolute z-20 rounded-lg border border-[var(--ui-border-strong)] bg-[var(--ui-panel)] text-[var(--ui-text)] shadow-xl ${placement.compact ? 'p-1.5 text-[0.6875rem] leading-[0.875rem]' : 'p-2 text-xs leading-4'}`}
      style={{ left: placement.left, top: placement.top, width: placement.width, visibility: placement.ready ? 'visible' : 'hidden' }}
    >
      <div className="mb-1 flex items-center justify-between gap-1 whitespace-nowrap font-bold" role={pvScrollHint ? 'status' : undefined} data-pv-scroll-hint={pvScrollHint ? 'true' : undefined}>
        <span>{formatBoardMoveLabel(move, boardSize)}</span>
        {!!move.pv?.length && <span className="ui-text-muted font-normal" aria-label={pvScrollHint ? `${pvScrollHint.shown} of ${pvScrollHint.total} continuation moves shown` : `${move.pv.length}-move continuation`}>PV {pvScrollHint ? `${pvScrollHint.shown} / ${pvScrollHint.total}` : move.pv.length}</span>}
      </div>
      <dl className={placement.columns === 2 ? 'grid grid-cols-2 gap-x-3' : undefined}>
        {metrics.map(metric => <div key={metric.label} className="flex justify-between gap-1 whitespace-nowrap"><dt title={metric.description} className="ui-text-muted">{metric.label}</dt><dd className="font-mono tabular-nums">{metric.value}</dd></div>)}
      </dl>
      {!placement.compact && pv && <p className="mt-1 whitespace-normal break-words">PV: {pv}</p>}
      {pvScrollHint && <p className="mt-1 whitespace-normal ui-text-muted">Middle-click to keep shown moves</p>}
    </div>,
    placement.target,
  );
}
