import React, { useMemo, useRef, useState } from 'react';
import { shallow } from 'zustand/shallow';
import { useGameStore } from '../store/gameStore';
import { getCurrentLineNodes } from '../utils/branchNavigation';
import { smoothAnalysisGraphValues } from '../utils/analysisSmoothing';
import { getKaTrainEvalColors } from '../utils/katrainTheme';
import { computeNodePointsLost, DEFAULT_EVAL_THRESHOLDS, getEvaluationClass } from '../utils/nodeAnalysis';
import { publicUrl } from '../utils/publicUrl';
import { isGraphKeyboardNavigationKey, nextGraphKeyboardIndex } from '../utils/graphKeyboard';
import { hasVisibleGraphData } from '../utils/graphDataAvailability';

const SCORE_GRANULARITY = 5;
const WINRATE_GRANULARITY = 10;
const KATRAN_BOX_BG = 'rgb(46, 65, 88)';
const KATRAN_SCORE_COLOR = 'rgb(77, 179, 230)'; // Theme.SCORE_COLOR (BLUE)
const KATRAN_WINRATE_COLOR = 'rgb(26, 204, 26)'; // Theme.WINRATE_COLOR (GREEN)
const KATRAN_GRAPH_DOT_COLOR = 'rgb(217, 77, 77)'; // Theme.GRAPH_DOT_COLOR
const KATRAN_GRAPH_BG_URL = publicUrl('katrain/graph_bg.png');
const KATRAN_SCORE_MARKER_COLOR = 'rgb(51, 153, 204)'; // Theme.SCORE_MARKER_COLOR
const KATRAN_WINRATE_MARKER_COLOR = 'rgb(13, 179, 13)'; // Theme.WINRATE_MARKER_COLOR
const MIN_QUALITY_MARKER_LOSS = 0.5;

function computeSymmetricScale(values: number[], granularity: number): number {
  const finite = values.filter((v) => Number.isFinite(v));
  const min = finite.length > 0 ? Math.min(...finite) : 0;
  const max = finite.length > 0 ? Math.max(...finite) : 0;
  const absMax = Math.max(-min, max);
  return Math.max(Math.ceil(absMax / granularity), 1) * granularity;
}

function buildPath(args: { values: number[]; xScale: number; yOf: (v: number) => number }): string {
  const { values, xScale, yOf } = args;
  let d = '';
  let started = false;
  for (let i = 0; i < values.length; i++) {
    const v = values[i]!;
    if (!Number.isFinite(v)) {
      started = false;
      continue;
    }
    const x = i * xScale;
    const y = yOf(v);
    if (!started) {
      d += `M ${x.toFixed(2)} ${y.toFixed(2)}`;
      started = true;
    } else {
      d += ` L ${x.toFixed(2)} ${y.toFixed(2)}`;
    }
  }
  return d;
}

function lastFinite(values: number[]): number {
  for (let i = values.length - 1; i >= 0; i--) {
    const v = values[i]!;
    if (Number.isFinite(v)) return v;
  }
  return 0;
}

function rgba(color: readonly [number, number, number, number], alphaOverride?: number): string {
  const a = typeof alphaOverride === 'number' ? alphaOverride : color[3];
  return `rgba(${Math.round(color[0] * 255)}, ${Math.round(color[1] * 255)}, ${Math.round(color[2] * 255)}, ${a})`;
}

function formatPointLoss(pointsLost: number): string {
  return pointsLost < 0 ? `Gain ${Math.abs(pointsLost).toFixed(1)}` : `Loss ${pointsLost.toFixed(1)}`;
}

export const ScoreWinrateGraph: React.FC<{
  showScore: boolean;
  showWinrate: boolean;
  range?: { start: number; end: number } | null;
}> = ({ showScore, showWinrate, range = null }) => {
  const {
    currentNode,
    activeBranchChildIds,
    jumpToNode,
    trainerTheme,
    trainerEvalThresholds,
    trainerShowDots,
    treeVersion,
    gameAnalysisDone,
  } = useGameStore(
    (state) => ({
      currentNode: state.currentNode,
      activeBranchChildIds: state.activeBranchChildIds,
      jumpToNode: state.jumpToNode,
      trainerTheme: state.settings.trainerTheme,
      trainerEvalThresholds: state.settings.trainerEvalThresholds,
      trainerShowDots: state.settings.trainerShowDots,
      treeVersion: state.treeVersion,
      gameAnalysisDone: state.gameAnalysisDone,
    }),
    shallow
  );
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  // KaTrain-style graph: show the whole mainline for the current branch.
  const { nodes, highlightedIndex } = useMemo(() => {
    void treeVersion;
    void gameAnalysisDone;
    const lineNodes = getCurrentLineNodes(currentNode, activeBranchChildIds);
    const currentIndex = lineNodes.findIndex((node) => node.id === currentNode.id);

    return { nodes: lineNodes, highlightedIndex: Math.max(0, currentIndex) };
  }, [activeBranchChildIds, currentNode, treeVersion, gameAnalysisDone]);

  const { displayNodes, highlighted } = useMemo(() => {
    if (nodes.length === 0) return { displayNodes: nodes, highlighted: 0 };
    if (!range) return { displayNodes: nodes, highlighted: Math.max(0, highlightedIndex) };
    const start = Math.max(0, Math.min(range.start, nodes.length - 1));
    const end = Math.max(start, Math.min(range.end, nodes.length - 1));
    const sliced = nodes.slice(start, end + 1);
    const adjusted = Math.min(Math.max(0, highlightedIndex - start), Math.max(0, sliced.length - 1));
    return { displayNodes: sliced, highlighted: adjusted };
  }, [highlightedIndex, nodes, range]);

  const width = 300;
  const height = 100;

  const { scoreValues, winrateValues } = useMemo(() => {
    void treeVersion;
    void gameAnalysisDone;
    const scores: number[] = [];
    const winrates: number[] = [];
    for (const node of displayNodes) {
      scores.push(node.analysis?.rootScoreLead ?? Number.NaN);
      const rawWin = node.analysis?.rootWinRate;
      winrates.push(typeof rawWin === 'number' ? (rawWin - 0.5) * 100 : Number.NaN);
    }
    return { scoreValues: scores, winrateValues: winrates };
  }, [displayNodes, treeVersion, gameAnalysisDone]);

  const smoothedScoreValues = useMemo(() => smoothAnalysisGraphValues(scoreValues), [scoreValues]);
  const smoothedWinrateValues = useMemo(() => smoothAnalysisGraphValues(winrateValues), [winrateValues]);
  const hasGraphData = hasVisibleGraphData({
    showScore,
    showWinrate,
    scoreValues: smoothedScoreValues,
    winrateValues: smoothedWinrateValues,
  });
  const emptyStateId = React.useId();

  const scoreScale = useMemo(() => computeSymmetricScale(smoothedScoreValues, SCORE_GRANULARITY), [smoothedScoreValues]);
  const winrateScale = useMemo(() => computeSymmetricScale(smoothedWinrateValues, WINRATE_GRANULARITY), [smoothedWinrateValues]);

  const count = displayNodes.length;
  const xScale = width / Math.max(count - 1, 15);

  const yScore = (v: number): number => height / 2 - (v / scoreScale) * (height / 2);
  const yWin = (v: number): number => height / 2 - (v / winrateScale) * (height / 2);

  const scorePath = useMemo(
    () =>
      buildPath({
        values: smoothedScoreValues,
        xScale,
        yOf: (v) => height / 2 - (v / scoreScale) * (height / 2),
      }),
    [smoothedScoreValues, xScale, scoreScale]
  );
  const winratePath = useMemo(
    () =>
      buildPath({
        values: smoothedWinrateValues,
        xScale,
        yOf: (v) => height / 2 - (v / winrateScale) * (height / 2),
      }),
    [smoothedWinrateValues, xScale, winrateScale]
  );

  const evalColors = useMemo(() => getKaTrainEvalColors(trainerTheme), [trainerTheme]);
  const evalThresholds = trainerEvalThresholds?.length ? trainerEvalThresholds : DEFAULT_EVAL_THRESHOLDS;
  const qualityMarkers = useMemo(() => {
    void treeVersion;
    void gameAnalysisDone;
    return displayNodes
      .map((node, index) => {
        if (index === 0) return null;
        const rawPointsLost = computeNodePointsLost(node);
        if (typeof rawPointsLost !== 'number' || !Number.isFinite(rawPointsLost)) return null;
        const pointsLost = Math.max(0, rawPointsLost);
        if (pointsLost <= MIN_QUALITY_MARKER_LOSS) return null;
        const cls = getEvaluationClass(pointsLost, evalThresholds, evalColors.length);
        if (trainerShowDots?.[cls] === false) return null;
        return {
          index,
          x: index * xScale,
          y: height - 7,
          pointsLost,
          color: rgba(evalColors[cls]!, 0.92),
          radius: Math.min(5, 2.2 + Math.sqrt(pointsLost) * 0.55),
        };
      })
      .filter((marker): marker is NonNullable<typeof marker> => marker !== null);
  }, [displayNodes, evalColors, evalThresholds, gameAnalysisDone, trainerShowDots, treeVersion, xScale]);

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const index = Math.round((x / rect.width) * (count - 1));
    if (index >= 0 && index < count) setHoverIndex(index);
  };

  const handleMouseLeave = () => setHoverIndex(null);

  const handleClick = () => {
    if (hoverIndex !== null && displayNodes[hoverIndex]) jumpToNode(displayNodes[hoverIndex]);
  };

  const clampedHighlighted = Math.min(Math.max(0, highlighted), Math.max(0, count - 1));
  const currentX = clampedHighlighted * xScale;
  const activeGraphIndex = hoverIndex ?? clampedHighlighted;
  const activeMoveIndex = activeGraphIndex + (range?.start ?? 0);

  const handleFocus = () => {
    if (count > 0) setHoverIndex((index) => index ?? clampedHighlighted);
  };

  const handleBlur = () => setHoverIndex(null);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      if (hoverIndex !== null && displayNodes[hoverIndex]) {
        event.preventDefault();
        event.stopPropagation();
        jumpToNode(displayNodes[hoverIndex]);
      }
      return;
    }

    if (!isGraphKeyboardNavigationKey(event.key)) return;
    const navigationKey = event.key;
    event.preventDefault();
    event.stopPropagation();
    setHoverIndex((index) =>
      nextGraphKeyboardIndex({
        key: navigationKey,
        currentIndex: index,
        highlightedIndex: clampedHighlighted,
        count,
      })
    );
  };

  const currentScore = Number.isFinite(smoothedScoreValues[clampedHighlighted]!)
    ? smoothedScoreValues[clampedHighlighted]!
    : lastFinite(smoothedScoreValues);
  const currentWin = Number.isFinite(smoothedWinrateValues[clampedHighlighted]!)
    ? smoothedWinrateValues[clampedHighlighted]!
    : lastFinite(smoothedWinrateValues);

  const currentScoreY = yScore(currentScore);
  const currentWinY = yWin(currentWin);

  const hoverX = hoverIndex !== null ? hoverIndex * xScale : 0;
  const hoverScore = hoverIndex !== null ? (Number.isFinite(smoothedScoreValues[hoverIndex]!) ? smoothedScoreValues[hoverIndex]! : lastFinite(smoothedScoreValues.slice(0, hoverIndex + 1))) : 0;
  const hoverWin = hoverIndex !== null ? (Number.isFinite(smoothedWinrateValues[hoverIndex]!) ? smoothedWinrateValues[hoverIndex]! : lastFinite(smoothedWinrateValues.slice(0, hoverIndex + 1))) : 0;
  const hoverScoreY = yScore(hoverScore);
  const hoverWinY = yWin(hoverWin);

  const hoverMoveIndex = hoverIndex !== null ? hoverIndex + (range?.start ?? 0) : null;
  const hoverPointsLost = hoverIndex !== null && displayNodes[hoverIndex] ? computeNodePointsLost(displayNodes[hoverIndex]!) : null;
  const hoverLossText =
    typeof hoverPointsLost === 'number' && Number.isFinite(hoverPointsLost) && Math.abs(hoverPointsLost) > 0.05
      ? formatPointLoss(hoverPointsLost)
      : '';
  const hoverMetricsText = `${showWinrate ? `${(50 + hoverWin).toFixed(1)}%` : ''}${showScore && showWinrate ? ' - ' : ''}${showScore ? `${hoverScore >= 0 ? 'B' : 'W'}+${Math.abs(hoverScore).toFixed(1)}` : ''}`;
  const hoverTooltip =
    hoverMoveIndex !== null
      ? [`Move ${hoverMoveIndex}`, hoverMetricsText, hoverLossText].filter(Boolean).join(' · ')
      : '';

  return (
    <div
      className="w-full h-full relative border border-[var(--ui-border)] rounded overflow-hidden cursor-crosshair focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ui-accent)]"
      role="slider"
      tabIndex={0}
      aria-label={
        hasGraphData
          ? 'Analysis graph move preview. Use arrow keys to preview moves, Enter to jump to the selected move.'
          : 'Analysis graph. No analyzed moves yet.'
      }
      aria-valuemin={range?.start ?? 0}
      aria-valuemax={(range?.start ?? 0) + Math.max(0, count - 1)}
      aria-valuenow={activeMoveIndex}
      aria-valuetext={hasGraphData ? (hoverTooltip || `Move ${activeMoveIndex}`) : 'No analyzed moves yet'}
      aria-disabled={!hasGraphData}
      aria-describedby={hasGraphData ? undefined : emptyStateId}
      data-analysis-score-winrate-graph="true"
      data-analysis-graph-has-data={hasGraphData ? 'true' : 'false'}
      style={{
        backgroundColor: KATRAN_BOX_BG,
        backgroundImage: `url('${KATRAN_GRAPH_BG_URL}')`,
        backgroundSize: '100% 100%',
        backgroundRepeat: 'no-repeat',
      }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onClick={handleClick}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
    >
      <svg ref={svgRef} width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
        {/* Lines */}
        {showScore && (
          <path
            d={scorePath}
            fill="none"
            stroke={KATRAN_SCORE_COLOR}
            strokeWidth="1.1"
            vectorEffect="non-scaling-stroke"
          />
        )}
        {showWinrate && (
          <path
            d={winratePath}
            fill="none"
            stroke={KATRAN_WINRATE_COLOR}
            strokeWidth="1.1"
            vectorEffect="non-scaling-stroke"
          />
        )}

        {/* Move quality markers */}
        {qualityMarkers.length > 0 && (
          <g aria-label="Move quality markers">
            {qualityMarkers.map((marker) => (
              <circle
                key={`quality-${marker.index}`}
                cx={marker.x}
                cy={marker.y}
                r={marker.radius}
                fill={marker.color}
                stroke="rgba(255,255,255,0.72)"
                strokeWidth="0.7"
                vectorEffect="non-scaling-stroke"
                data-move-quality="true"
              >
                <title>{`Move ${marker.index + (range?.start ?? 0)}: ${formatPointLoss(marker.pointsLost)}`}</title>
              </circle>
            ))}
          </g>
        )}

        {/* Current dot */}
        {showScore && <circle cx={currentX} cy={currentScoreY} r="3" fill={KATRAN_GRAPH_DOT_COLOR} stroke="none" />}
        {showWinrate && <circle cx={currentX} cy={currentWinY} r="3" fill={KATRAN_GRAPH_DOT_COLOR} stroke="none" />}

        {/* Hover indicator */}
        {hoverIndex !== null && (
          <g>
            <line
              x1={hoverX}
              y1="0"
              x2={hoverX}
              y2={height}
              stroke="rgb(128,128,128)"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
            {showScore && <circle cx={hoverX} cy={hoverScoreY} r="3" fill={KATRAN_GRAPH_DOT_COLOR} stroke="none" />}
            {showWinrate && <circle cx={hoverX} cy={hoverWinY} r="3" fill={KATRAN_GRAPH_DOT_COLOR} stroke="none" />}
          </g>
        )}
      </svg>

      {!hasGraphData && (
        <div
          id={emptyStateId}
          className="pointer-events-none absolute inset-0 z-10 grid place-items-center bg-black/20 px-3 text-center"
          data-analysis-graph-empty-state="true"
        >
          <div className="rounded border border-white/15 bg-black/55 px-3 py-2 text-[11px] font-semibold text-white/85 shadow-sm">
            No analyzed moves yet
          </div>
        </div>
      )}

      {/* Score ticks (KaTrain-like) */}
      {showScore && (
        <>
          <div
            className="absolute top-1 right-1 text-[9px] pointer-events-none"
            style={{ color: KATRAN_SCORE_MARKER_COLOR }}
          >{`B+${scoreScale}`}</div>
          <div
            className="absolute top-1/2 right-1 -translate-y-1/2 text-[9px] pointer-events-none"
            style={{ color: KATRAN_SCORE_MARKER_COLOR }}
          >
            Jigo
          </div>
          <div
            className="absolute bottom-1 right-1 text-[9px] pointer-events-none"
            style={{ color: KATRAN_SCORE_MARKER_COLOR }}
          >{`W+${scoreScale}`}</div>
        </>
      )}

      {/* Winrate ticks (KaTrain-like) */}
      {showWinrate && (
        <>
          <div
            className="absolute top-1 left-1 text-[9px] pointer-events-none"
            style={{ color: KATRAN_WINRATE_MARKER_COLOR }}
          >{`${50 + winrateScale}%`}</div>
          <div
            className="absolute bottom-1 left-1 text-[9px] pointer-events-none"
            style={{ color: KATRAN_WINRATE_MARKER_COLOR }}
          >{`${50 - winrateScale}%`}</div>
        </>
      )}

      {/* Hover tooltip */}
      {hoverIndex !== null && (
        <div
          className="absolute bg-black bg-opacity-80 text-white text-[10px] px-2 py-1 rounded pointer-events-none"
          aria-live="polite"
          data-analysis-graph-tooltip="true"
          style={{
            left: `${Math.min(Math.max(0, hoverIndex * (100 / (count - 1 || 1))), 88)}%`,
            top: '50%',
            transform: 'translate(-50%, -50%)',
          }}
        >
          {hoverTooltip}
        </div>
      )}
    </div>
  );
};
