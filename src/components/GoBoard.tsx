import React, { useMemo } from 'react';
import { useGameStore } from '../store/gameStore';
import { BOARD_SIZE, type CandidateMove, type GameNode } from '../types';

interface GoBoardProps {
    hoveredMove: CandidateMove | null;
    onHoverMove: (move: CandidateMove | null) => void;
}

export const GoBoard: React.FC<GoBoardProps> = ({ hoveredMove, onHoverMove }) => {
  const { board, playMove, moveHistory, analysisData, isAnalysisMode, currentPlayer, settings, currentNode } = useGameStore();

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

  // Compute past mistakes to display on board
  const pastMistakes = useMemo(() => {
      if (!isAnalysisMode || settings.showLastNMistakes === 0) return [];

      const mistakes: { x: number, y: number, pointsLost: number }[] = [];
      let node: GameNode | null = currentNode;
      let count = 0;

      while (node && node.parent && count < settings.showLastNMistakes) {
          const move = node.move;
          const parentAnalysis = node.parent.analysis;

          if (move && parentAnalysis) {
              // Find the move in parent's analysis
              const candidate = parentAnalysis.moves.find(m => m.x === move.x && m.y === move.y);
              if (candidate && candidate.pointsLost > 0.5) { // Only show significant mistakes
                  mistakes.push({
                      x: move.x,
                      y: move.y,
                      pointsLost: candidate.pointsLost
                  });
              }
          }
          node = node.parent;
          count++;
      }
      return mistakes;
  }, [currentNode, isAnalysisMode, settings.showLastNMistakes]);

  // Theme styling
  const boardColor = settings.boardTheme === 'dark' ? '#333' : (settings.boardTheme === 'flat' ? '#eebb77' : '#DCB35C');
  const lineColor = settings.boardTheme === 'dark' ? '#888' : '#000';
  const labelColor = settings.boardTheme === 'dark' ? '#ccc' : '#000';

  return (
    <div
      className="relative shadow-lg rounded-sm cursor-pointer select-none"
      style={{
          width: boardSizePixels,
          height: boardSizePixels,
          backgroundColor: boardColor,
      }}
      onClick={handleClick}
    >
      {/* Coordinates */}
      {settings.showCoordinates && (
          <>
            {/* Top Labels */}
            {xLabels.map((label, i) => (
                <div
                key={`top-${i}`}
                className="absolute text-xs font-bold"
                style={{
                    left: padding + i * cellSize - 4,
                    top: 5,
                    width: 10,
                    textAlign: 'center',
                    color: labelColor
                }}
                >
                {label}
                </div>
            ))}
            {/* Bottom Labels */}
            {xLabels.map((label, i) => (
                <div
                    key={`bottom-${i}`}
                    className="absolute text-xs font-bold"
                    style={{
                    left: padding + i * cellSize - 4,
                    bottom: 5,
                    width: 10,
                    textAlign: 'center',
                    color: labelColor
                    }}
                >
                {label}
                </div>
            ))}
            {/* Left Labels */}
            {yLabels.map((label, i) => (
                <div
                    key={`left-${i}`}
                    className="absolute text-xs font-bold"
                    style={{
                    left: 5,
                    top: padding + i * cellSize - 8,
                    width: 15,
                    textAlign: 'center',
                    color: labelColor
                    }}
                >
                {label}
                </div>
            ))}
            {/* Right Labels */}
            {yLabels.map((label, i) => (
                <div
                    key={`right-${i}`}
                    className="absolute text-xs font-bold"
                    style={{
                    right: 5,
                    top: padding + i * cellSize - 8,
                    width: 15,
                    textAlign: 'center',
                    color: labelColor
                    }}
                >
                {label}
                </div>
            ))}
          </>
      )}


      {/* Grid Lines */}
      {Array.from({ length: BOARD_SIZE }).map((_, i) => (
        <React.Fragment key={i}>
          {/* Vertical lines */}
          <div
            className="absolute"
            style={{
              left: padding + i * cellSize,
              top: padding,
              width: 1,
              height: cellSize * (BOARD_SIZE - 1),
              backgroundColor: lineColor
            }}
          />
          {/* Horizontal lines */}
          <div
            className="absolute"
            style={{
              left: padding,
              top: padding + i * cellSize,
              width: cellSize * (BOARD_SIZE - 1),
              height: 1,
              backgroundColor: lineColor
            }}
          />
        </React.Fragment>
      ))}

      {/* Hoshi Points */}
      {hoshiPoints.map(([hx, hy], idx) => (
        <div
          key={`hoshi-${idx}`}
          className="absolute rounded-full"
          style={{
            width: 8,
            height: 8,
            left: padding + hx * cellSize - 4,
            top: padding + hy * cellSize - 4,
            backgroundColor: lineColor
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

      {/* Past Mistakes Overlay */}
      {pastMistakes.map((mistake, i) => {
          let color = 'bg-yellow-400';
          if (mistake.pointsLost > 5) color = 'bg-red-600';
          else if (mistake.pointsLost > 2) color = 'bg-orange-500';

          return (
              <div
                  key={`mistake-${mistake.x}-${mistake.y}`}
                  className={`absolute rounded-full ${color} z-10 pointer-events-none`}
                  style={{
                      width: 10,
                      height: 10,
                      left: padding + mistake.x * cellSize - 5,
                      top: padding + mistake.y * cellSize - 5,
                      border: '1px solid white'
                  }}
              />
          );
      })}

      {/* Ghost Stone (Hover) */}
      {isAnalysisMode && hoveredMove && (
          <div
              className={`absolute rounded-full shadow-sm flex items-center justify-center pointer-events-none opacity-50 ${
                currentPlayer === 'black'
                  ? 'bg-black'
                  : 'bg-white'
              }`}
              style={{
                  width: cellSize - 2,
                  height: cellSize - 2,
                  left: padding + hoveredMove.x * cellSize - (cellSize / 2) + 1,
                  top: padding + hoveredMove.y * cellSize - (cellSize / 2) + 1,
                  zIndex: 5
              }}
          />
      )}

      {/* Analysis Overlay (Next Moves) */}
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
                  onMouseEnter={() => onHoverMove(move)}
                  onMouseLeave={() => onHoverMove(null)}
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
