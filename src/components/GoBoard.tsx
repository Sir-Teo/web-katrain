import React, { useCallback, useMemo, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { BOARD_SIZE, type CandidateMove, type GameNode } from '../types';

const KATRAN_EVAL_THRESHOLDS = [12, 6, 3, 1.5, 0.5, 0] as const;
const KATRAN_EVAL_COLORS = [
  [0.447, 0.129, 0.42, 1],
  [0.8, 0, 0, 1],
  [0.9, 0.4, 0.1, 1],
  [0.95, 0.95, 0, 1],
  [0.67, 0.9, 0.18, 1],
  [0.117, 0.588, 0, 1],
] as const;

const OWNERSHIP_COLORS = {
  black: [0.0, 0.0, 0.1, 0.75],
  white: [0.92, 0.92, 1.0, 0.8],
} as const;
const OWNERSHIP_GAMMA = 1.33;
const EVAL_DOT_MIN_SIZE = 0.25;
const EVAL_DOT_MAX_SIZE = 0.5;
const APPROX_BOARD_COLOR = [0.95, 0.75, 0.47, 1] as const;
const HINTS_LO_ALPHA = 0.6;
const HINTS_ALPHA = 0.8;
const HINT_SCALE = 0.98;
const UNCERTAIN_HINT_SCALE = 0.7;
const TOP_MOVE_BORDER_COLOR = [10 / 255, 200 / 255, 250 / 255, 1] as const;
const HINT_TEXT_COLOR = 'black';

function evaluationClass(pointsLost: number): number {
  let i = 0;
  while (i < KATRAN_EVAL_THRESHOLDS.length - 1 && pointsLost < KATRAN_EVAL_THRESHOLDS[i]!) i++;
  return i;
}

function rgba(color: readonly [number, number, number, number], alphaOverride?: number): string {
  const a = typeof alphaOverride === 'number' ? alphaOverride : color[3];
  return `rgba(${Math.round(color[0] * 255)}, ${Math.round(color[1] * 255)}, ${Math.round(color[2] * 255)}, ${a})`;
}

function formatVisits(n: number): string {
  if (n < 1000) return String(n);
  if (n < 100_000) return `${(n / 1000).toFixed(1)}k`;
  if (n < 1_000_000) return `${Math.round(n / 1000)}k`;
  return `${Math.round(n / 1_000_000)}M`;
}

function formatLoss(x: number, extraPrecision: boolean): string {
  if (extraPrecision) {
    if (Math.abs(x) < 0.005) return '0.0';
    if (0 < x && x <= 0.995) return `+${x.toFixed(2).slice(1)}`;
    if (-0.995 <= x && x < 0) return `-${x.toFixed(2).slice(2)}`;
  }
  const v = x.toFixed(1);
  return x >= 0 ? `+${v}` : v;
}

function formatScore(x: number): string {
  return x.toFixed(1);
}

function formatWinrate(x: number): string {
  return (x * 100).toFixed(1);
}

function formatDeltaWinrate(x: number): string {
  const pct = x * 100;
  const sign = pct >= 0 ? '+' : '-';
  return `${sign}${Math.abs(pct).toFixed(1)}%`;
}

interface GoBoardProps {
    hoveredMove: CandidateMove | null;
    onHoverMove: (move: CandidateMove | null) => void;
}

export const GoBoard: React.FC<GoBoardProps> = ({ hoveredMove, onHoverMove }) => {
  const {
    board,
    playMove,
    passTurn,
    moveHistory,
    analysisData,
    isAnalysisMode,
    currentPlayer,
    settings,
    currentNode,
    boardRotation,
    regionOfInterest,
    isSelectingRegionOfInterest,
    setRegionOfInterest,
  } = useGameStore();

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

  // KaTrain-style coordinates and rotation behavior.
  const GTP_COORD = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T'] as const;
  const rotation = boardRotation ?? 0;
  const getXCoordinateText = (i: number): string => {
    if (rotation === 1) return String(i + 1);
    if (rotation === 2) return GTP_COORD[BOARD_SIZE - i - 1] ?? '';
    if (rotation === 3) return String(BOARD_SIZE - i);
    return GTP_COORD[i] ?? '';
  };
  const getYCoordinateText = (displayRowTopToBottom: number): string => {
    const i = BOARD_SIZE - 1 - displayRowTopToBottom; // KaTrain uses bottom-to-top indexing for y labels.
    if (rotation === 1) return GTP_COORD[BOARD_SIZE - i - 1] ?? '';
    if (rotation === 2) return String(BOARD_SIZE - i);
    if (rotation === 3) return GTP_COORD[i] ?? '';
    return String(i + 1);
  };

  const toDisplay = useCallback((x: number, y: number): { x: number; y: number } => {
    if (rotation === 1) return { x: BOARD_SIZE - 1 - y, y: x };
    if (rotation === 2) return { x: BOARD_SIZE - 1 - x, y: BOARD_SIZE - 1 - y };
    if (rotation === 3) return { x: y, y: BOARD_SIZE - 1 - x };
    return { x, y };
  }, [rotation]);

  const toInternal = useCallback((x: number, y: number): { x: number; y: number } => {
    if (rotation === 1) return { x: y, y: BOARD_SIZE - 1 - x };
    if (rotation === 2) return { x: BOARD_SIZE - 1 - x, y: BOARD_SIZE - 1 - y };
    if (rotation === 3) return { x: BOARD_SIZE - 1 - y, y: x };
    return { x, y };
  }, [rotation]);

  const [roiDrag, setRoiDrag] = useState<{ start: { x: number; y: number }; end: { x: number; y: number } } | null>(
    null
  );

  const childMoveCoords = useMemo(() => {
    const set = new Set<string>();
    for (const c of currentNode.children) {
      const m = c.move;
      if (!m || m.x < 0 || m.y < 0) continue;
      set.add(`${m.x},${m.y}`);
    }
    return set;
  }, [currentNode]);

  const eventToInternal = (
    e: { clientX: number; clientY: number; currentTarget: HTMLDivElement }
  ): { x: number; y: number } | null => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left - padding;
    const y = e.clientY - rect.top - padding;

    // Use Math.round to find the nearest intersection
    const displayCol = Math.round(x / cellSize);
    const displayRow = Math.round(y / cellSize);

    if (displayCol >= 0 && displayCol < BOARD_SIZE && displayRow >= 0 && displayRow < BOARD_SIZE) {
      const { x: col, y: row } = toInternal(displayCol, displayRow);
      if (col < 0 || col >= BOARD_SIZE || row < 0 || row >= BOARD_SIZE) return null;
      return { x: col, y: row };
    }
    return null;
  };

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isSelectingRegionOfInterest) return;
    const pt = eventToInternal(e);
    if (!pt) return;
    playMove(pt.x, pt.y);
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isSelectingRegionOfInterest) return;
    if (e.button !== 0) return;
    const pt = eventToInternal(e);
    if (!pt) return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    setRoiDrag({ start: pt, end: pt });
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isSelectingRegionOfInterest) return;
    if (!roiDrag) return;
    const pt = eventToInternal(e);
    if (!pt) return;
    setRoiDrag((prev) => (prev ? { ...prev, end: pt } : prev));
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isSelectingRegionOfInterest) return;
    if (!roiDrag) return;
    const pt = eventToInternal(e) ?? roiDrag.end;
    setRoiDrag(null);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // Ignore.
    }

    const xMin = Math.min(roiDrag.start.x, pt.x);
    const xMax = Math.max(roiDrag.start.x, pt.x);
    const yMin = Math.min(roiDrag.start.y, pt.y);
    const yMax = Math.max(roiDrag.start.y, pt.y);
    setRegionOfInterest({ xMin, xMax, yMin, yMax });
  };

  const handleAnalysisClick = (e: React.MouseEvent, move: CandidateMove) => {
      e.stopPropagation();
      if (move.x === -1 || move.y === -1) passTurn();
      else playMove(move.x, move.y);
  };

  // Derived from moveHistory or currentNode from store
  const lastMove = moveHistory.length > 0 ? moveHistory[moveHistory.length - 1] : null;

  const moveNumbers = useMemo(() => {
      if (!settings.showMoveNumbers) return null;
      const grid: Array<Array<number | null>> = Array.from({ length: BOARD_SIZE }, () =>
          Array<number | null>(BOARD_SIZE).fill(null)
      );
      for (let i = 0; i < moveHistory.length; i++) {
          const m = moveHistory[i]!;
          if (m.x < 0 || m.y < 0) continue;
          grid[m.y]![m.x] = i + 1;
      }
      return grid;
  }, [moveHistory, settings.showMoveNumbers]);

  const evalDots = useMemo(() => {
      if (!isAnalysisMode || !settings.analysisShowEval || settings.showLastNMistakes === 0) return [];

      const dots: Array<{ key: string; x: number; y: number; pointsLost: number; color: string; size: number }> = [];
      let node: GameNode | null = currentNode;
      let count = 0;
      let realizedPointsLost: number | null = null;

      const stoneRadius = (cellSize - 2) * 0.5;

      const parentRealizedPointsLost = (n: GameNode): number | null => {
          const move = n.move;
          const parentParent = n.parent?.parent;
          const score = n.analysis?.rootScoreLead;
          const parentParentScore = parentParent?.analysis?.rootScoreLead;
          if (!move || !parentParent) return null;
          if (typeof score !== 'number' || typeof parentParentScore !== 'number') return null;
          const sign = move.player === 'black' ? 1 : -1;
          return sign * (score - parentParentScore);
      };

      while (node && node.parent && count < settings.showLastNMistakes) {
          const move = node.move;
          if (!move || move.x < 0 || move.y < 0) {
              realizedPointsLost = parentRealizedPointsLost(node);
              node = node.parent;
              count++;
              continue;
          }

          // Skip captured stones (KaTrain draws eval dots on existing stones only).
          if (board[move.y]?.[move.x] !== move.player) {
              realizedPointsLost = parentRealizedPointsLost(node);
              node = node.parent;
              count++;
              continue;
          }

          let pointsLost: number | null = null;
          const parentScore = node.parent.analysis?.rootScoreLead;
          const childScore = node.analysis?.rootScoreLead;
          if (typeof parentScore === 'number' && typeof childScore === 'number') {
              const sign = move.player === 'black' ? 1 : -1;
              pointsLost = sign * (parentScore - childScore);
          } else {
              const parentAnalysis = node.parent.analysis;
              const candidate = parentAnalysis?.moves.find((m) => m.x === move.x && m.y === move.y);
              if (candidate) pointsLost = candidate.pointsLost;
          }

          if (pointsLost !== null) {
              const cls = evaluationClass(pointsLost);
              const color = rgba(KATRAN_EVAL_COLORS[cls]!);
              let evalScale = 1;
              if (pointsLost && realizedPointsLost) {
                  if (pointsLost <= 0.5 && realizedPointsLost <= 1.5) evalScale = 0;
                  else evalScale = Math.min(1, Math.max(0, realizedPointsLost / pointsLost));
              }
              const evalRadius = Math.sqrt(Math.max(0, Math.min(1, evalScale)));
              const dotRadius =
                stoneRadius *
                (EVAL_DOT_MIN_SIZE + evalRadius * (EVAL_DOT_MAX_SIZE - EVAL_DOT_MIN_SIZE));
              const size = Math.max(2, 2 * dotRadius);
              const d = toDisplay(move.x, move.y);
              dots.push({ key: node.id, x: d.x, y: d.y, pointsLost, color, size });
          }

          realizedPointsLost = parentRealizedPointsLost(node);
          node = node.parent;
          count++;
      }
      return dots;
  }, [board, cellSize, currentNode, isAnalysisMode, settings.analysisShowEval, settings.showLastNMistakes, toDisplay]);

  const childMoveRings = useMemo(() => {
      if (!isAnalysisMode || !settings.analysisShowChildren) return [];
      return currentNode.children
          .map((c) => c.move)
          .filter((m): m is NonNullable<typeof m> => !!m && m.x >= 0 && m.y >= 0);
  }, [currentNode, isAnalysisMode, settings.analysisShowChildren]);

  // Theme styling
  const boardColor = settings.boardTheme === 'dark' ? '#333' : (settings.boardTheme === 'flat' ? '#eebb77' : '#DCB35C');
  const lineColor = settings.boardTheme === 'dark' ? '#888' : '#000';
  const labelColor = settings.boardTheme === 'dark' ? '#ccc' : '#000';
  const approxBoardColor =
    settings.boardTheme === 'dark'
      ? boardColor
      : settings.boardTheme === 'flat'
        ? boardColor
        : rgba(APPROX_BOARD_COLOR);

  const ownershipOverlay = useMemo(() => {
      if (!isAnalysisMode || !settings.analysisShowOwnership) return [];
      const territory = analysisData?.territory ?? currentNode.parent?.analysis?.territory;
      if (!territory) return [];

      const out: React.ReactNode[] = [];
      for (let y = 0; y < BOARD_SIZE; y++) {
          for (let x = 0; x < BOARD_SIZE; x++) {
              const val = territory[y]?.[x] ?? 0;
              const mag = Math.abs(val);
              if (mag < 0.01) continue;
              const a = Math.pow(Math.min(1, mag), 1 / OWNERSHIP_GAMMA);
              const base = val > 0 ? OWNERSHIP_COLORS.black : OWNERSHIP_COLORS.white;
              const alpha = base[3] * a;
              if (alpha <= 0.001) continue;
              const d = toDisplay(x, y);

              out.push(
                  <div
                      key={`own-${x}-${y}`}
                      className="absolute pointer-events-none"
                      style={{
                          width: cellSize,
                          height: cellSize,
                          left: padding + d.x * cellSize - cellSize / 2,
                          top: padding + d.y * cellSize - cellSize / 2,
                          backgroundColor: rgba(base, alpha),
                          borderRadius: 2,
                          filter: 'blur(0.2px)',
                      }}
                  />
              );
          }
      }
      return out;
  }, [analysisData, currentNode, isAnalysisMode, settings.analysisShowOwnership, cellSize, padding, toDisplay]);

  const policyOverlay = useMemo(() => {
      if (!isAnalysisMode || !settings.analysisShowPolicy) return [];
      const policy = analysisData?.policy;
      if (!policy) return [];

      let best = 0;
      for (let i = 0; i < BOARD_SIZE * BOARD_SIZE; i++) {
          const v = policy[i] ?? -1;
          if (v > best) best = v;
      }

      const out: React.ReactNode[] = [];
      const textLb = 0.01 * 0.01;
      for (let y = 0; y < BOARD_SIZE; y++) {
          for (let x = 0; x < BOARD_SIZE; x++) {
              const p = policy[y * BOARD_SIZE + x] ?? -1;
              if (p < 0) continue;
              const d = toDisplay(x, y);
              const polOrder = Math.max(0, 5 + Math.trunc(Math.log10(Math.max(1e-9, p - 1e-9))));
              const col = KATRAN_EVAL_COLORS[Math.min(5, polOrder)]!;
              const showText = p > textLb;
              const scale = showText ? 0.95 : 0.5;
              const size = cellSize * 0.9 * scale;
              const isBest = best > 0 && p === best;

              out.push(
                  <div
                      key={`pol-${x}-${y}`}
                      className="absolute pointer-events-none flex items-center justify-center font-mono"
                      style={{
                          width: size,
                          height: size,
                          left: padding + d.x * cellSize - size / 2,
                          top: padding + d.y * cellSize - size / 2,
                          borderRadius: '50%',
                          backgroundColor: rgba(col, 0.5),
                          boxShadow: isBest ? '0 0 0 2px rgba(10,200,250,0.55)' : undefined,
                          color: 'black',
                          fontSize: 9,
                      }}
                  >
                      {showText ? `${(p * 100).toFixed(2).slice(0, 4)}%` : null}
                  </div>
              );
          }
      }
      return out;
  }, [analysisData, isAnalysisMode, settings.analysisShowPolicy, cellSize, padding, toDisplay]);

  const pvOverlay = useMemo(() => {
      const pv = hoveredMove?.pv;
      if (!isAnalysisMode || !pv || pv.length === 0) return [];

      const parseGtp = (s: string): { x: number; y: number } | null => {
          const t = s.trim().toUpperCase();
          if (t === 'PASS') return null;
          const m = /^([A-T])([1-9]|1[0-9])$/.exec(t);
          if (!m) return null;
          const colChar = m[1]!;
          if (colChar === 'I') return null;
          const raw = colChar.charCodeAt(0) - 65;
          const x = raw >= 9 ? raw - 1 : raw;
          const row = parseInt(m[2]!, 10);
          const y = BOARD_SIZE - row;
          if (x < 0 || x >= BOARD_SIZE || y < 0 || y >= BOARD_SIZE) return null;
          return { x, y };
      };

      const opp: typeof currentPlayer = currentPlayer === 'black' ? 'white' : 'black';
      const moves: Array<{ x: number; y: number; player: typeof currentPlayer; idx: number }> = [];
      for (let i = 0; i < pv.length; i++) {
          const xy = parseGtp(pv[i]!);
          if (!xy) continue;
          const d = toDisplay(xy.x, xy.y);
          moves.push({ x: d.x, y: d.y, player: i % 2 === 0 ? currentPlayer : opp, idx: i + 1 });
      }
      return moves;
  }, [hoveredMove, isAnalysisMode, currentPlayer, toDisplay]);

  const roiRect = useMemo(() => {
    const roi =
      roiDrag
        ? {
            xMin: Math.min(roiDrag.start.x, roiDrag.end.x),
            xMax: Math.max(roiDrag.start.x, roiDrag.end.x),
            yMin: Math.min(roiDrag.start.y, roiDrag.end.y),
            yMax: Math.max(roiDrag.start.y, roiDrag.end.y),
          }
        : regionOfInterest;
    if (!roi) return null;
    const a = toDisplay(roi.xMin, roi.yMin);
    const b = toDisplay(roi.xMax, roi.yMax);
    const minX = Math.min(a.x, b.x);
    const maxX = Math.max(a.x, b.x);
    const minY = Math.min(a.y, b.y);
    const maxY = Math.max(a.y, b.y);
    return {
      left: padding + minX * cellSize - cellSize / 2,
      top: padding + minY * cellSize - cellSize / 2,
      width: (maxX - minX + 1) * cellSize,
      height: (maxY - minY + 1) * cellSize,
    };
  }, [cellSize, padding, regionOfInterest, roiDrag, toDisplay]);

  return (
    <div
      className="relative shadow-lg rounded-sm cursor-pointer select-none"
      style={{
          width: boardSizePixels,
          height: boardSizePixels,
          backgroundColor: boardColor,
      }}
      onClick={handleClick}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      {/* Region of interest (KaTrain-style) */}
      {roiRect && (
        <div
          className="absolute pointer-events-none z-30"
          style={{
            left: roiRect.left,
            top: roiRect.top,
            width: roiRect.width,
            height: roiRect.height,
            border: roiDrag ? '2px dashed rgba(34,197,94,0.95)' : '2px solid rgba(34,197,94,0.95)',
            boxShadow: '0 0 0 1px rgba(0,0,0,0.35) inset',
            background: roiDrag ? 'rgba(34,197,94,0.08)' : 'rgba(34,197,94,0.04)',
          }}
        />
      )}

      {/* Coordinates */}
      {settings.showCoordinates && (
          <>
            {/* Bottom Labels (KaTrain draws x coords at the bottom edge) */}
            {Array.from({ length: BOARD_SIZE }).map((_, i) => (
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
                {getXCoordinateText(i)}
                </div>
            ))}
            {/* Left Labels (KaTrain draws y coords at the left edge) */}
            {Array.from({ length: BOARD_SIZE }).map((_, i) => (
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
                {getYCoordinateText(i)}
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
      {hoshiPoints.map(([hx, hy], idx) => {
        const d = toDisplay(hx, hy);
        return (
          <div
            key={`hoshi-${idx}`}
            className="absolute rounded-full"
            style={{
              width: 8,
              height: 8,
              left: padding + d.x * cellSize - 4,
              top: padding + d.y * cellSize - 4,
              backgroundColor: lineColor,
            }}
          />
        );
      })}

      {/* Ownership / Territory Overlay (KaTrain-style) */}
      {ownershipOverlay}

      {/* Policy Overlay (KaTrain-style) */}
      {policyOverlay}

      {/* Stones */}
      {board.map((row, y) =>
        row.map((cell, x) => {
          if (!cell) return null;
          const isLastMove = lastMove && lastMove.x === x && lastMove.y === y;
          const d = toDisplay(x, y);
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
                left: padding + d.x * cellSize - (cellSize / 2) + 1,
                top: padding + d.y * cellSize - (cellSize / 2) + 1,
                border: isLastMove ? `2px solid ${cell === 'black' ? '#fff' : '#000'}` : undefined,
                boxSizing: 'border-box',
              }}
            >
              {settings.showMoveNumbers && moveNumbers?.[y]?.[x] !== null && (
                  <div className={`text-[11px] font-bold font-mono ${cell === 'black' ? 'text-white' : 'text-black'}`}>
                      {moveNumbers?.[y]?.[x]}
                  </div>
              )}
            </div>
          );
        })
      )}

      {/* Evaluation Dots (KaTrain-style) */}
      {evalDots.map((d) => (
          <div
              key={`eval-${d.key}`}
              className="absolute pointer-events-none"
              style={{
                  width: d.size,
                  height: d.size,
                  left: padding + d.x * cellSize - d.size / 2,
                  top: padding + d.y * cellSize - d.size / 2,
                  backgroundColor: d.color,
                  backgroundImage: "url('/katrain/dot.png')",
                  backgroundSize: 'contain',
                  backgroundPosition: 'center',
                  backgroundRepeat: 'no-repeat',
                  backgroundBlendMode: 'multiply',
                  borderRadius: '50%',
                  boxShadow: '0 0 0 1px rgba(0,0,0,0.25)',
                  zIndex: 12,
              }}
          />
      ))}

      {/* Ghost Stone (Hover) */}
      {isAnalysisMode && hoveredMove && (!hoveredMove.pv || hoveredMove.pv.length === 0) && (
          (() => {
            const d = toDisplay(hoveredMove.x, hoveredMove.y);
            return (
          <div
              className={`absolute rounded-full shadow-sm flex items-center justify-center pointer-events-none opacity-50 ${
                currentPlayer === 'black'
                  ? 'bg-black'
                  : 'bg-white'
              }`}
              style={{
                  width: cellSize - 2,
                  height: cellSize - 2,
                  left: padding + d.x * cellSize - (cellSize / 2) + 1,
                  top: padding + d.y * cellSize - (cellSize / 2) + 1,
                  zIndex: 5
              }}
          />
            );
          })()
      )}

      {/* PV Overlay (Hover) */}
      {pvOverlay.map((m) => {
          const size = cellSize * 0.78;
          const isBlack = m.player === 'black';
          return (
              <div
                  key={`pv-${m.idx}-${m.x}-${m.y}`}
                  className={`absolute rounded-full flex items-center justify-center z-20 pointer-events-none border ${isBlack ? 'border-white/50' : 'border-black/40'}`}
                  style={{
                      width: size,
                      height: size,
                      left: padding + m.x * cellSize - (size / 2),
                      top: padding + m.y * cellSize - (size / 2),
                      backgroundColor: isBlack ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.65)',
                      color: isBlack ? 'white' : 'black',
                      fontSize: 11,
                      fontWeight: 700
                  }}
              >
                  {m.idx}
              </div>
          );
      })}

      {/* Children Overlay (Q) */}
      {isAnalysisMode && settings.analysisShowChildren && childMoveRings.map((m) => {
          const d = toDisplay(m.x, m.y);
          const size = cellSize * 0.92;
          const isBlack = m.player === 'black';
          return (
              <div
                  key={`child-${m.x}-${m.y}-${m.player}`}
                  className="absolute pointer-events-none"
                  style={{
                      width: size,
                      height: size,
                      left: padding + d.x * cellSize - size / 2,
                      top: padding + d.y * cellSize - size / 2,
                      borderRadius: '50%',
                      border: `2px dashed ${isBlack ? 'rgba(0,0,0,0.85)' : 'rgba(255,255,255,0.9)'}`,
                      boxShadow: isBlack ? '0 0 0 1px rgba(255,255,255,0.35)' : '0 0 0 1px rgba(0,0,0,0.35)',
                      zIndex: 14,
                  }}
              />
          );
      })}

      {/* Hints / Top Moves (E) */}
      {isAnalysisMode && analysisData && settings.analysisShowHints && !settings.analysisShowPolicy &&
        analysisData.moves.filter((m) => m.x >= 0 && m.y >= 0).map((move) => {
          const d = toDisplay(move.x, move.y);
          const isBest = move.order === 0;
          const lowVisitsThreshold = Math.max(1, settings.trainerLowVisits);
          const uncertain = move.visits < lowVisitsThreshold && !isBest && !childMoveCoords.has(`${move.x},${move.y}`);
          const scale = uncertain ? UNCERTAIN_HINT_SCALE : HINT_SCALE;
          const textOn = !uncertain;
          const alpha = uncertain ? HINTS_LO_ALPHA : HINTS_ALPHA;
          if (scale <= 0) return null;

          const cls = evaluationClass(move.pointsLost);
          const col = KATRAN_EVAL_COLORS[cls]!;
          const bg = rgba(col, alpha);

          const primary = settings.trainerTopMovesShow;
          const secondary = settings.trainerTopMovesShowSecondary;
          const show = [primary, secondary].filter((opt) => opt !== 'top_move_nothing');

          const sign = currentPlayer === 'black' ? 1 : -1;
          const playerWinRate = currentPlayer === 'black' ? move.winRate : 1 - move.winRate;
          const winRateLost = move.winRateLost ?? sign * (analysisData.rootWinRate - move.winRate);

          const getLabel = (opt: typeof primary): string => {
            switch (opt) {
              case 'top_move_delta_score':
                return formatLoss(-move.pointsLost, settings.trainerExtraPrecision);
              case 'top_move_score':
                return formatScore(sign * move.scoreLead);
              case 'top_move_winrate':
                return formatWinrate(playerWinRate);
              case 'top_move_delta_winrate':
                return formatDeltaWinrate(-winRateLost);
              case 'top_move_visits':
                return formatVisits(move.visits);
              case 'top_move_nothing':
                return '';
            }
          };

          const stoneRadius = (cellSize - 2) * 0.5;
          const evalSize = stoneRadius * scale;
          const size = 2 * evalSize;
          const showText = textOn && show.length > 0;

          return (
              <div key={`hint-${move.x}-${move.y}`}>
                {showText && (
                  <div
                    className="absolute pointer-events-none rounded-full"
                    style={{
                      width: size * 0.98,
                      height: size * 0.98,
                      left: padding + d.x * cellSize - (size * 0.98) / 2,
                      top: padding + d.y * cellSize - (size * 0.98) / 2,
                      backgroundColor: approxBoardColor,
                      zIndex: 15,
                    }}
                  />
                )}

                <div
                  className="absolute flex items-center justify-center cursor-pointer"
                  style={{
                    width: size,
                    height: size,
                    left: padding + d.x * cellSize - size / 2,
                    top: padding + d.y * cellSize - size / 2,
                    backgroundColor: bg,
                    backgroundImage: "url('/katrain/topmove.png')",
                    backgroundSize: 'contain',
                    backgroundPosition: 'center',
                    backgroundRepeat: 'no-repeat',
                    backgroundBlendMode: 'multiply',
                    maskImage: "url('/katrain/topmove.png')",
                    WebkitMaskImage: "url('/katrain/topmove.png')",
                    maskSize: 'contain',
                    WebkitMaskSize: 'contain',
                    maskPosition: 'center',
                    WebkitMaskPosition: 'center',
                    maskRepeat: 'no-repeat',
                    WebkitMaskRepeat: 'no-repeat',
                    border: isBest ? `2px solid ${rgba(TOP_MOVE_BORDER_COLOR)}` : undefined,
                    borderRadius: '50%',
                    boxSizing: 'border-box',
                    zIndex: 16,
                    color: HINT_TEXT_COLOR,
                    fontFamily:
                      'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                    fontWeight: 700,
                    fontSize: show.length === 1 ? 10 : 10,
                    lineHeight: 0.9,
                    textAlign: 'center',
                  }}
                  onClick={(e) => handleAnalysisClick(e, move)}
                  onMouseEnter={() => onHoverMove(move)}
                  onMouseLeave={() => onHoverMove(null)}
                >
                  {showText && (
                    <div className="pointer-events-none select-none">
                      {show.length === 1 ? (
                        <div>{getLabel(show[0] as typeof primary)}</div>
                      ) : (
                        <>
                          <div>{getLabel(show[0] as typeof primary)}</div>
                          <div className="text-[9px] opacity-90">{getLabel(show[1] as typeof primary)}</div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
          );
      })}

      {/* Tooltip */}
      {isAnalysisMode && hoveredMove && hoveredMove.x >= 0 && hoveredMove.y >= 0 && (
         (() => {
           const d = toDisplay(hoveredMove.x, hoveredMove.y);
           return (
         <div
             className="absolute z-20 bg-gray-900 text-white text-xs p-2 rounded shadow-lg pointer-events-none border border-gray-700"
             style={{
                 left: padding + d.x * cellSize + 20,
                 top: padding + d.y * cellSize - 20,
                 minWidth: '120px',
                 maxWidth: '240px'
             }}
         >
             <div className="font-bold mb-1">Move: {String.fromCharCode(65 + (hoveredMove.x >= 8 ? hoveredMove.x + 1 : hoveredMove.x))}{19 - hoveredMove.y}</div>
             <div>Win Rate: {(hoveredMove.winRate * 100).toFixed(1)}%</div>
             <div>Score: {hoveredMove.scoreLead > 0 ? '+' : ''}{hoveredMove.scoreLead.toFixed(1)}</div>
             {typeof hoveredMove.scoreStdev === 'number' && (
               <div>Score Stdev: {hoveredMove.scoreStdev.toFixed(1)}</div>
             )}
             <div>Points Lost: {hoveredMove.pointsLost.toFixed(1)}</div>
             {typeof hoveredMove.relativePointsLost === 'number' && (
               <div>Rel. Points Lost: {hoveredMove.relativePointsLost.toFixed(1)}</div>
             )}
             {typeof hoveredMove.winRateLost === 'number' && (
               <div>Winrate Lost: {(hoveredMove.winRateLost * 100).toFixed(1)}%</div>
             )}
             {typeof hoveredMove.prior === 'number' && (
               <div>Prior: {(hoveredMove.prior * 100).toFixed(1)}%</div>
             )}
             <div>Visits: {hoveredMove.visits}</div>
             {hoveredMove.pv && hoveredMove.pv.length > 0 && (
               <div className="mt-1 whitespace-normal break-words">
                 PV: {hoveredMove.pv.join(' ')}
               </div>
             )}
         </div>
           );
         })()
      )}

    </div>
  );
};
