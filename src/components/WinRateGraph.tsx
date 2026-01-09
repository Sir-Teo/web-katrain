import React, { useMemo, useRef, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import type { GameNode } from '../types';

export const WinRateGraph: React.FC = () => {
    const { currentNode, jumpToNode } = useGameStore();
    const svgRef = useRef<SVGSVGElement>(null);
    const [hoverIndex, setHoverIndex] = useState<number | null>(null);

    // 1. Traverse up from currentNode to root to get the full path
    const nodePath = useMemo(() => {
        const path: GameNode[] = [];
        let node: GameNode | null = currentNode;
        while (node) {
            path.push(node);
            node = node.parent;
        }
        return path.reverse(); // Now it's [Root, Move1, Move2, ..., Current]
    }, [currentNode]);

    // 2. Extract analysis data
    const dataPoints = useMemo(() => {
        return nodePath.map((node) => {
            const winRate = node.analysis ? node.analysis.rootWinRate : 0.5;
            // Maybe handle score lead too? Graph typically shows win rate.
            // Katrain shows win rate line and score lead bars (sometimes).
            // Let's stick to win rate line for now.
            return { winRate, node };
        });
    }, [nodePath]);

    const width = 300;
    const height = 100;
    const count = dataPoints.length;
    // Ensure we always have at least 2 points for a line, or handle single point
    const step = width / Math.max(1, count - 1);

    const pointsStr = dataPoints.map((pt, i) => {
        const x = i * step;
        // Invert Y because SVG 0 is top
        const y = height - (pt.winRate * height);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!svgRef.current) return;
        const rect = svgRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;

        // Find nearest index mapping from visual width to data index
        // x / rect.width gives 0..1 ratio
        // Multiply by (count - 1) to get index
        const index = Math.round((x / rect.width) * (count - 1));
        if (index >= 0 && index < dataPoints.length) {
            setHoverIndex(index);
        }
    };

    const handleMouseLeave = () => {
        setHoverIndex(null);
    };

    const handleClick = () => {
        if (hoverIndex !== null && dataPoints[hoverIndex]) {
            jumpToNode(dataPoints[hoverIndex].node);
        }
    };

    // Calculate hover dot position
    let hoverX = 0;
    let hoverY = 0;
    let hoverWinRate = 0;
    if (hoverIndex !== null && dataPoints[hoverIndex]) {
        hoverX = hoverIndex * step;
        hoverWinRate = dataPoints[hoverIndex].winRate;
        hoverY = height - (hoverWinRate * height);
    }

    // Current move indicator (last point)
    const currentIndex = count - 1;
    const currentX = currentIndex * step;
    const currentY = height - (dataPoints[currentIndex].winRate * height);

    return (
        <div
            className="w-full h-full bg-gray-900 relative border border-gray-700 rounded overflow-hidden cursor-crosshair"
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            onClick={handleClick}
        >
            <svg
                ref={svgRef}
                width="100%"
                height="100%"
                viewBox={`0 0 ${width} ${height}`}
                preserveAspectRatio="none"
            >
                {/* 50% line */}
                <line x1="0" y1={height/2} x2={width} y2={height/2} stroke="#444" strokeDasharray="4" strokeWidth="1" />

                {/* Graph line */}
                <polyline
                    points={pointsStr}
                    fill="none"
                    stroke="#10B981"
                    strokeWidth="2"
                    vectorEffect="non-scaling-stroke"
                />

                {/* Fill area */}
                <polygon
                    points={`0,${height} ${pointsStr} ${width},${height}`}
                    fill="url(#gradient)"
                    opacity="0.2"
                />

                <defs>
                    <linearGradient id="gradient" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%" stopColor="#10B981" />
                        <stop offset="100%" stopColor="#10B981" stopOpacity="0" />
                    </linearGradient>
                </defs>

                {/* Current Move Indicator */}
                <circle cx={currentX} cy={currentY} r="3" fill="white" stroke="none" />

                {/* Hover Indicator */}
                {hoverIndex !== null && (
                    <g>
                        <line x1={hoverX} y1="0" x2={hoverX} y2={height} stroke="rgba(255,255,255,0.2)" strokeWidth="1" vectorEffect="non-scaling-stroke"/>
                        <circle cx={hoverX} cy={hoverY} r="4" fill="#3B82F6" stroke="white" strokeWidth="1" />
                    </g>
                )}
            </svg>

            {/* Labels */}
            <div className="absolute top-1 left-1 text-[9px] text-gray-500 pointer-events-none">100%</div>
            <div className="absolute bottom-1 left-1 text-[9px] text-gray-500 pointer-events-none">0%</div>

            {/* Hover Tooltip */}
            {hoverIndex !== null && (
                <div
                    className="absolute bg-black bg-opacity-80 text-white text-[10px] p-1 rounded pointer-events-none"
                    style={{
                        left: `${Math.min(Math.max(0, hoverIndex * (100 / (count - 1 || 1))), 80)}%`,
                        top: '50%',
                        transform: 'translate(-50%, -50%)'
                    }}
                >
                    {(hoverWinRate * 100).toFixed(1)}%
                </div>
            )}
        </div>
    );
};
