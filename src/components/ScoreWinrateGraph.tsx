import React, { useMemo, useRef, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import type { GameNode } from '../types';
import { publicUrl } from '../utils/publicUrl';

const SCORE_GRANULARITY = 5;
const WINRATE_GRANULARITY = 10;
const KATRAN_BOX_BG = 'rgb(46, 65, 88)';
const KATRAN_SCORE_COLOR = 'rgb(77, 179, 230)'; // Theme.SCORE_COLOR (BLUE)
const KATRAN_WINRATE_COLOR = 'rgb(26, 204, 26)'; // Theme.WINRATE_COLOR (GREEN)
const KATRAN_GRAPH_DOT_COLOR = 'rgb(217, 77, 77)'; // Theme.GRAPH_DOT_COLOR
const KATRAN_GRAPH_BG_URL = publicUrl('katrain/graph_bg.png');
const KATRAN_SCORE_MARKER_COLOR = 'rgb(51, 153, 204)'; // Theme.SCORE_MARKER_COLOR
const KATRAN_WINRATE_MARKER_COLOR = 'rgb(13, 179, 13)'; // Theme.WINRATE_MARKER_COLOR

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

export const ScoreWinrateGraph: React.FC<{ showScore: boolean; showWinrate: boolean }> = ({ showScore, showWinrate }) => {
  const { currentNode, jumpToNode } = useGameStore();
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  // KaTrain-style graph: show the whole mainline for the current branch.
  const { nodes, highlightedIndex } = useMemo(() => {
    const path: GameNode[] = [];
    let node: GameNode | null = currentNode;
    while (node) {
      path.push(node);
      node = node.parent;
    }
    path.reverse(); // [Root..Current]

    const out: GameNode[] = [...path];
    let cursor: GameNode = currentNode;
    while (cursor.children.length > 0) {
      cursor = cursor.children[0]!;
      out.push(cursor);
    }

    return { nodes: out, highlightedIndex: Math.max(0, path.length - 1) };
  }, [currentNode]);

  const width = 300;
  const height = 100;

  const scoreValues = useMemo(() => nodes.map((n) => n.analysis?.rootScoreLead ?? Number.NaN), [nodes]);
  const winrateValues = useMemo(
    () => nodes.map((n) => (typeof n.analysis?.rootWinRate === 'number' ? (n.analysis.rootWinRate - 0.5) * 100 : Number.NaN)),
    [nodes]
  );

  const scoreScale = useMemo(() => computeSymmetricScale(scoreValues, SCORE_GRANULARITY), [scoreValues]);
  const winrateScale = useMemo(() => computeSymmetricScale(winrateValues, WINRATE_GRANULARITY), [winrateValues]);

  const count = nodes.length;
  const xScale = width / Math.max(count - 1, 15);

  const yScore = (v: number): number => height / 2 - (v / scoreScale) * (height / 2);
  const yWin = (v: number): number => height / 2 - (v / winrateScale) * (height / 2);

  const scorePath = useMemo(
    () =>
      buildPath({
        values: scoreValues,
        xScale,
        yOf: (v) => height / 2 - (v / scoreScale) * (height / 2),
      }),
    [scoreValues, xScale, scoreScale]
  );
  const winratePath = useMemo(
    () =>
      buildPath({
        values: winrateValues,
        xScale,
        yOf: (v) => height / 2 - (v / winrateScale) * (height / 2),
      }),
    [winrateValues, xScale, winrateScale]
  );

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const index = Math.round((x / rect.width) * (count - 1));
    if (index >= 0 && index < count) setHoverIndex(index);
  };

  const handleMouseLeave = () => setHoverIndex(null);

  const handleClick = () => {
    if (hoverIndex !== null && nodes[hoverIndex]) jumpToNode(nodes[hoverIndex]);
  };

  const clampedHighlighted = Math.min(Math.max(0, highlightedIndex), Math.max(0, count - 1));
  const currentX = clampedHighlighted * xScale;

  const currentScore = Number.isFinite(scoreValues[clampedHighlighted]!)
    ? scoreValues[clampedHighlighted]!
    : lastFinite(scoreValues);
  const currentWin = Number.isFinite(winrateValues[clampedHighlighted]!)
    ? winrateValues[clampedHighlighted]!
    : lastFinite(winrateValues);

  const currentScoreY = yScore(currentScore);
  const currentWinY = yWin(currentWin);

  const hoverX = hoverIndex !== null ? hoverIndex * xScale : 0;
  const hoverScore = hoverIndex !== null ? (Number.isFinite(scoreValues[hoverIndex]!) ? scoreValues[hoverIndex]! : lastFinite(scoreValues.slice(0, hoverIndex + 1))) : 0;
  const hoverWin = hoverIndex !== null ? (Number.isFinite(winrateValues[hoverIndex]!) ? winrateValues[hoverIndex]! : lastFinite(winrateValues.slice(0, hoverIndex + 1))) : 0;
  const hoverScoreY = yScore(hoverScore);
  const hoverWinY = yWin(hoverWin);

  const hoverTooltip =
    hoverIndex !== null
      ? `Move ${hoverIndex}: ${showWinrate ? `${(50 + hoverWin).toFixed(1)}%` : ''}${showScore && showWinrate ? ' · ' : ''}${showScore ? `${hoverScore >= 0 ? 'B' : 'W'}+${Math.abs(hoverScore).toFixed(1)}` : ''}`
      : '';

  return (
    <div
      className="w-full h-full relative border border-gray-700 rounded overflow-hidden cursor-crosshair"
      style={{
        backgroundColor: KATRAN_BOX_BG,
        backgroundImage: `url('${KATRAN_GRAPH_BG_URL}')`,
        backgroundSize: '100% 100%',
        backgroundRepeat: 'no-repeat',
      }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onClick={handleClick}
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
