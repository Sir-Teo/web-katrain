import React, { useMemo, useRef, useState } from 'react';
import { shallow } from 'zustand/shallow';
import { useGameStore } from '../store/gameStore';
import type { GameNode } from '../types';

export const ScoreGraph: React.FC = () => {
  const { currentNode, jumpToNode, mistakeThreshold, treeVersion } = useGameStore(
    (state) => ({
      currentNode: state.currentNode,
      jumpToNode: state.jumpToNode,
      mistakeThreshold: state.settings.mistakeThreshold,
      treeVersion: state.treeVersion,
    }),
    shallow
  );
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

  const dataPoints = useMemo(() => {
    const threshold = mistakeThreshold ?? 3.0;
    void treeVersion;
    return nodes.map((node) => {
      const score = node.analysis?.rootScoreLead ?? 0;
      let pointsLost: number | null = null;

      if (node.move && node.parent) {
        const parentScore = node.parent.analysis?.rootScoreLead;
        const childScore = node.analysis?.rootScoreLead;
        if (typeof parentScore === 'number' && typeof childScore === 'number') {
          const sign = node.move.player === 'black' ? 1 : -1;
          pointsLost = sign * (parentScore - childScore);
        } else {
          const candidate = node.parent.analysis?.moves.find((m) => m.x === node.move!.x && m.y === node.move!.y);
          pointsLost = typeof candidate?.pointsLost === 'number' ? candidate.pointsLost : null;
        }
      }

      const isMistake = pointsLost !== null && pointsLost >= threshold;

      return { score, node, isMistake };
    });
  }, [nodes, mistakeThreshold, treeVersion]);

  const width = 300;
  const height = 100;
  const count = dataPoints.length;
  const step = width / Math.max(1, count - 1);

  const { minScore, maxScore } = useMemo(() => {
    let min = 0;
    let max = 0;
    for (const p of dataPoints) {
      if (!Number.isFinite(p.score)) continue;
      if (p.score < min) min = p.score;
      if (p.score > max) max = p.score;
    }
    // Add a bit of padding so lines don't stick to the top/bottom.
    if (min === max) {
      min -= 1;
      max += 1;
    } else {
      const pad = (max - min) * 0.1;
      min -= pad;
      max += pad;
    }
    return { minScore: min, maxScore: max };
  }, [dataPoints]);

  const scoreToY = (score: number): number => {
    const t = (score - minScore) / (maxScore - minScore);
    const clamped = Math.max(0, Math.min(1, t));
    return height - clamped * height;
  };

  const pointsStr = dataPoints
    .map((pt, i) => {
      const x = i * step;
      const y = scoreToY(pt.score);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  const zeroY = scoreToY(0);

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const index = Math.round((x / rect.width) * (count - 1));
    if (index >= 0 && index < dataPoints.length) setHoverIndex(index);
  };

  const handleMouseLeave = () => setHoverIndex(null);

  const handleClick = () => {
    if (hoverIndex !== null && dataPoints[hoverIndex]) jumpToNode(dataPoints[hoverIndex].node);
  };

  const hoverX = hoverIndex !== null ? hoverIndex * step : 0;
  const hoverScore = hoverIndex !== null ? dataPoints[hoverIndex]?.score ?? 0 : 0;
  const hoverY = hoverIndex !== null ? scoreToY(hoverScore) : 0;

  const currentIndex = Math.min(Math.max(0, highlightedIndex), Math.max(0, count - 1));
  const currentX = currentIndex * step;
  const currentY = scoreToY(dataPoints[currentIndex]?.score ?? 0);

  return (
    <div
      className="w-full h-full bg-gray-900 relative border border-gray-700 rounded overflow-hidden cursor-crosshair"
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onClick={handleClick}
    >
      <svg ref={svgRef} width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
        {/* 0 line */}
        <line x1="0" y1={zeroY} x2={width} y2={zeroY} stroke="#444" strokeDasharray="4" strokeWidth="1" />

        <polyline points={pointsStr} fill="none" stroke="#60A5FA" strokeWidth="2" vectorEffect="non-scaling-stroke" />

        <polygon points={`0,${height} ${pointsStr} ${width},${height}`} fill="url(#scoreGradient)" opacity="0.18" />

        <defs>
          <linearGradient id="scoreGradient" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#60A5FA" />
            <stop offset="100%" stopColor="#60A5FA" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Mistake Indicators */}
        {dataPoints.map((pt, i) => {
          if (!pt.isMistake) return null;
          const x = i * step;
          const y = scoreToY(pt.score);
          return <circle key={i} cx={x} cy={y} r="2" fill="#EF4444" stroke="none" />;
        })}

        {/* Current Move Indicator */}
        <circle cx={currentX} cy={currentY} r="3" fill="white" stroke="none" />

        {/* Hover Indicator */}
        {hoverIndex !== null && (
          <g>
            <line
              x1={hoverX}
              y1="0"
              x2={hoverX}
              y2={height}
              stroke="rgba(255,255,255,0.2)"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
            <circle cx={hoverX} cy={hoverY} r="4" fill="#3B82F6" stroke="white" strokeWidth="1" />
          </g>
        )}
      </svg>

      {/* Labels */}
      <div className="absolute top-1 left-1 text-[9px] text-gray-500 pointer-events-none">{maxScore.toFixed(0)}</div>
      <div className="absolute bottom-1 left-1 text-[9px] text-gray-500 pointer-events-none">{minScore.toFixed(0)}</div>

      {/* Hover Tooltip */}
      {hoverIndex !== null && (
        <div
          className="absolute bg-black bg-opacity-80 text-white text-[10px] p-1 rounded pointer-events-none"
          style={{
            left: `${Math.min(Math.max(0, hoverIndex * (100 / (count - 1 || 1))), 80)}%`,
            top: '50%',
            transform: 'translate(-50%, -50%)',
          }}
        >
          Move {hoverIndex}: {hoverScore > 0 ? '+' : ''}
          {hoverScore.toFixed(1)}
        </div>
      )}
    </div>
  );
};
