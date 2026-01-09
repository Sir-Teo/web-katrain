import React from 'react';
import { useGameStore } from '../store/gameStore';

export const WinRateGraph: React.FC = () => {
    // In a real app, this would use the analysis history.
    // For now, we'll mock it or just show a static placeholder that updates slightly.
    // But since we don't have analysis history stored yet, let's just make a visual placeholder
    // that looks like a graph.

    // We can use the moveHistory length to generate some random points if we want it to look dynamic
    const { moveHistory } = useGameStore();

    // Generate mock data points based on move count
    const points = React.useMemo(() => {
        const data = [];
        let current = 50;
        for (let i = 0; i <= moveHistory.length; i++) {
            // Pseudo-random walk
            const change = (Math.sin(i * 0.5) * 5) + (Math.random() * 4 - 2);
            current = Math.max(0, Math.min(100, current + change));
            data.push(current);
        }
        return data;
    }, [moveHistory.length]);

    const width = 300;
    const height = 100;
    const step = width / Math.max(1, points.length - 1);

    const pathD = points.map((val, i) => {
        const x = i * step;
        const y = height - (val / 100 * height);
        return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
    }).join(' ');

    return (
        <div className="w-full h-full bg-gray-900 relative border border-gray-700 rounded overflow-hidden">
            <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
                {/* 50% line */}
                <line x1="0" y1={height/2} x2={width} y2={height/2} stroke="#444" strokeDasharray="4" />

                {/* Graph line */}
                <path d={pathD} fill="none" stroke="#10B981" strokeWidth="2" />

                {/* Area under curve (optional) */}
                <path d={`${pathD} L ${width} ${height} L 0 ${height} Z`} fill="url(#gradient)" opacity="0.2" />

                <defs>
                    <linearGradient id="gradient" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%" stopColor="#10B981" />
                        <stop offset="100%" stopColor="#10B981" stopOpacity="0" />
                    </linearGradient>
                </defs>
            </svg>

            {/* Labels */}
            <div className="absolute top-1 left-1 text-[10px] text-gray-500">100%</div>
            <div className="absolute bottom-1 left-1 text-[10px] text-gray-500">0%</div>
        </div>
    );
};
