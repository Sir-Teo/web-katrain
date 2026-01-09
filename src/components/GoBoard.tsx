import React, { useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { BOARD_SIZE, type CandidateMove } from '../types';

export const GoBoard: React.FC = () => {
  const { board, playMove, moveHistory, analysisData, isAnalysisMode } = useGameStore();
  const [hoveredMove, setHoveredMove] = useState<CandidateMove | null>(null);

  const cellSize = 30; // pixels
  const padding = 30;
  // Increase board size to accommodate coordinates
  const boardSizePixels = cellSize * (BOARD_SIZE + 1) + padding; // Extra padding for coords

  // Hoshi points for 19x19
  const hoshiPoints = [
    [3, 3], [3, 9], [3, 15],
    [9, 3], [9, 9], [9, 15],
    [15, 3], [15, 9], [15, 15]
  ];

  // Coordinates
  const xLabels = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T'];
  const yLabels = Array.from({ length: 19 }, (_, i) => 19 - i);

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left - padding;
    const y = e.clientY - rect.top - padding;

    // Use Math.round to find the nearest intersection
    const col = Math.round(x / cellSize);
    const row = Math.round(y / cellSize);

    if (col >= 0 && col < BOARD_SIZE && row >= 0 && row < BOARD_SIZE) {
      playMove(col, row);
    }
  };

  const handleAnalysisClick = (e: React.MouseEvent, move: CandidateMove) => {
      e.stopPropagation();
      playMove(move.x, move.y);
  };

  // Derived from moveHistory or currentNode from store
  const lastMove = moveHistory.length > 0 ? moveHistory[moveHistory.length - 1] : null;

  return (
    <div
      className="relative bg-[#DCB35C] shadow-lg rounded-sm cursor-pointer select-none"
      style={{ width: boardSizePixels, height: boardSizePixels }}
      onClick={handleClick}
    >
      {/* Coordinates */}
      {/* Top Labels */}
      {xLabels.map((label, i) => (
        <div
           key={`top-${i}`}
           className="absolute text-xs font-bold text-black"
           style={{
             left: padding + i * cellSize - 4,
             top: 5,
             width: 10,
             textAlign: 'center'
           }}
        >
          {label}
        </div>
      ))}
      {/* Bottom Labels */}
      {xLabels.map((label, i) => (
         <div
            key={`bottom-${i}`}
            className="absolute text-xs font-bold text-black"
            style={{
              left: padding + i * cellSize - 4,
              bottom: 5,
              width: 10,
              textAlign: 'center'
            }}
         >
           {label}
         </div>
       ))}
       {/* Left Labels */}
       {yLabels.map((label, i) => (
         <div
            key={`left-${i}`}
            className="absolute text-xs font-bold text-black"
            style={{
              left: 5,
              top: padding + i * cellSize - 8,
              width: 15,
              textAlign: 'center'
            }}
         >
           {label}
         </div>
       ))}
       {/* Right Labels */}
       {yLabels.map((label, i) => (
         <div
            key={`right-${i}`}
            className="absolute text-xs font-bold text-black"
            style={{
              right: 5,
              top: padding + i * cellSize - 8,
              width: 15,
              textAlign: 'center'
            }}
         >
           {label}
         </div>
       ))}


      {/* Grid Lines */}
      {Array.from({ length: BOARD_SIZE }).map((_, i) => (
        <React.Fragment key={i}>
          {/* Vertical lines */}
          <div
            className="absolute bg-black"
            style={{
              left: padding + i * cellSize,
              top: padding,
              width: 1,
              height: cellSize * (BOARD_SIZE - 1)
            }}
          />
          {/* Horizontal lines */}
          <div
            className="absolute bg-black"
            style={{
              left: padding,
              top: padding + i * cellSize,
              width: cellSize * (BOARD_SIZE - 1),
              height: 1
            }}
          />
        </React.Fragment>
      ))}

      {/* Hoshi Points */}
      {hoshiPoints.map(([hx, hy], idx) => (
        <div
          key={`hoshi-${idx}`}
          className="absolute bg-black rounded-full"
          style={{
            width: 8,
            height: 8,
            left: padding + hx * cellSize - 4,
            top: padding + hy * cellSize - 4,
          }}
        />
      ))}

      {/* Stones */}
      {board.map((row, y) =>
        row.map((cell, x) => {
          if (!cell) return null;
          const isLastMove = lastMove && lastMove.x === x && lastMove.y === y;
          return (
            <div
              key={`${x}-${y}`}
              className={`absolute rounded-full shadow-md flex items-center justify-center ${
                cell === 'black'
                  ? 'bg-black radial-gradient-black'
                  : 'bg-white radial-gradient-white'
              }`}
              style={{
                width: cellSize - 2,
                height: cellSize - 2,
                left: padding + x * cellSize - (cellSize / 2) + 1,
                top: padding + y * cellSize - (cellSize / 2) + 1,
              }}
            >
              {isLastMove && (
                 <div className={`w-3 h-3 rounded-full border-2 ${cell === 'black' ? 'border-white' : 'border-black'}`} />
              )}
            </div>
          );
        })
      )}

      {/* Analysis Overlay */}
      {isAnalysisMode && analysisData && analysisData.moves.map((move) => {
          const isBest = move.order === 0;

          let bgColor = 'bg-gray-500';
          let textColor = 'text-white';

          if (isBest) {
              bgColor = 'bg-blue-500';
          } else if (move.pointsLost < 0.5) {
              bgColor = 'bg-green-500';
          } else if (move.pointsLost < 2.0) {
              bgColor = 'bg-yellow-400';
              textColor = 'text-black';
          } else {
              bgColor = 'bg-red-500';
          }

          const opacity = isBest ? 0.9 : 0.8;
          const size = cellSize * 0.75; // slightly larger for readability

          return (
              <div
                  key={`analysis-${move.x}-${move.y}`}
                  className={`absolute rounded-full flex items-center justify-center text-[10px] font-bold z-10 cursor-pointer transition-transform hover:scale-110 ${bgColor} ${textColor}`}
                  style={{
                      width: size,
                      height: size,
                      left: padding + move.x * cellSize - (size / 2),
                      top: padding + move.y * cellSize - (size / 2),
                      opacity: opacity,
                  }}
                  onClick={(e) => handleAnalysisClick(e, move)}
                  onMouseEnter={() => setHoveredMove(move)}
                  onMouseLeave={() => setHoveredMove(null)}
              >
                  <span className="text-[9px] pointer-events-none">
                    {isBest
                       ? (move.scoreLead > 0 ? `+${move.scoreLead.toFixed(1)}` : move.scoreLead.toFixed(1))
                       : `-${move.pointsLost.toFixed(1)}`
                    }
                  </span>
              </div>
          );
      })}

      {/* Tooltip */}
      {isAnalysisMode && hoveredMove && (
         <div
             className="absolute z-20 bg-gray-900 text-white text-xs p-2 rounded shadow-lg pointer-events-none border border-gray-700"
             style={{
                 left: padding + hoveredMove.x * cellSize + 20,
                 top: padding + hoveredMove.y * cellSize - 20,
                 minWidth: '120px'
             }}
         >
             <div className="font-bold mb-1">Move: {String.fromCharCode(65 + (hoveredMove.x >= 8 ? hoveredMove.x + 1 : hoveredMove.x))}{19 - hoveredMove.y}</div>
             <div>Win Rate: {(hoveredMove.winRate * 100).toFixed(1)}%</div>
             <div>Score: {hoveredMove.scoreLead > 0 ? '+' : ''}{hoveredMove.scoreLead.toFixed(1)}</div>
             <div>Points Lost: {hoveredMove.pointsLost.toFixed(1)}</div>
             <div>Visits: {hoveredMove.visits}</div>
         </div>
      )}

    </div>
  );
};
