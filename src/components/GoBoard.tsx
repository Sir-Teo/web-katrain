import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { BOARD_SIZE, type CandidateMove, type GameNode } from '../types';
import { parseGtpMove } from '../lib/gtp';

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
const STONE_COLORS = {
  black: [0.05, 0.05, 0.05, 1],
  white: [0.95, 0.95, 0.95, 1],
} as const;
const OWNERSHIP_GAMMA = 1.33;
const EVAL_DOT_MIN_SIZE = 0.25;
const EVAL_DOT_MAX_SIZE = 0.5;
const STONE_SIZE = 0.505; // KaTrain Theme.STONE_SIZE
const STONE_MIN_ALPHA = 0.85; // KaTrain Theme.STONE_MIN_ALPHA
const MARK_SIZE = 0.42; // KaTrain Theme.MARK_SIZE
const APPROX_BOARD_COLOR = [0.95, 0.75, 0.47, 1] as const;
const REGION_BORDER_COLOR = [64 / 255, 85 / 255, 110 / 255, 1] as const; // KaTrain Theme.REGION_BORDER_COLOR
const NEXT_MOVE_DASH_CONTRAST_COLORS = {
  black: [0.85, 0.85, 0.85, 1],
  white: [0.5, 0.5, 0.5, 1],
} as const; // KaTrain Theme.NEXT_MOVE_DASH_CONTRAST_COLORS
const PASS_CIRCLE_COLOR = [0.45, 0.05, 0.45, 0.7] as const; // KaTrain Theme.PASS_CIRCLE_COLOR
const PASS_CIRCLE_TEXT_COLOR = [0.85, 0.85, 0.85, 1] as const; // KaTrain Theme.PASS_CIRCLE_TEXT_COLOR
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
    pvUpToMove: number | null;
    uiMode: 'play' | 'analyze';
}

export const GoBoard: React.FC<GoBoardProps> = ({ hoveredMove, onHoverMove, pvUpToMove, uiMode }) => {
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
    timerPaused,
    timerMainTimeUsedSeconds,
    isAiPlaying,
    aiColor,
  } = useGameStore();

  const containerRef = useRef<HTMLDivElement>(null);
  const ownershipCanvasRef = useRef<HTMLCanvasElement>(null);
  const [containerSize, setContainerSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });

  const toast = useCallback((message: string, type: 'info' | 'error' | 'success' = 'info') => {
    useGameStore.setState({ notification: { message, type } });
    if (typeof window !== 'undefined') window.setTimeout(() => useGameStore.setState({ notification: null }), 2500);
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const rect = el.getBoundingClientRect();
      setContainerSize({ width: rect.width, height: rect.height });
    };
    update();
    if (typeof ResizeObserver === 'undefined') return;
    const obs = new ResizeObserver(() => update());
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // KaTrain grid spacing/margins (see `badukpan.py:get_grid_spaces_margins`).
  const gridSpacesMarginX = useMemo(
    () => (settings.showCoordinates ? { left: 1.5, right: 0.75 } : { left: 0.75, right: 0.75 }),
    [settings.showCoordinates]
  );
  const gridSpacesMarginY = useMemo(
    () => (settings.showCoordinates ? { bottom: 1.5, top: 0.75 } : { bottom: 0.75, top: 0.75 }),
    [settings.showCoordinates]
  );

  const xGridSpaces = (BOARD_SIZE - 1) + gridSpacesMarginX.left + gridSpacesMarginX.right;
  const yGridSpaces = (BOARD_SIZE - 1) + gridSpacesMarginY.bottom + gridSpacesMarginY.top;

  const cellSize = useMemo(() => {
    const w = containerSize.width > 0 ? containerSize.width : 640;
    const h = containerSize.height > 0 ? containerSize.height : 640;
    const grid = Math.floor(Math.min(w / xGridSpaces, h / yGridSpaces) + 0.1);
    return Math.max(10, Math.min(80, grid));
  }, [containerSize.height, containerSize.width, xGridSpaces, yGridSpaces]);

  const boardWidth = cellSize * xGridSpaces;
  const boardHeight = cellSize * yGridSpaces;
  const originX = Math.floor(cellSize * gridSpacesMarginX.left + 0.5);
  const originY = Math.floor(cellSize * gridSpacesMarginY.top + 0.5);
  const coordOffset = (cellSize * 1.5) / 2;

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
  const [cursorPt, setCursorPt] = useState<{ x: number; y: number } | null>(null);

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
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Use Math.round to find the nearest intersection
    const displayCol = Math.round((x - originX) / cellSize);
    const displayRow = Math.round((y - originY) / cellSize);

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

    // KaTrain minimal_time_use enforcement in byo-yomi (Play mode only).
    const isAiTurn = isAiPlaying && aiColor === currentPlayer;
    if (uiMode === 'play' && !isAiTurn && !timerPaused && currentNode.children.length === 0) {
      const mainSeconds = Math.max(0, Math.floor((settings.timerMainTimeMinutes ?? 0) * 60));
      const mainRemaining = mainSeconds - Math.max(0, timerMainTimeUsedSeconds ?? 0);
      const minUse = Math.max(0, Math.floor(settings.timerMinimalUseSeconds ?? 0));
      const used = Math.max(0, currentNode.timeUsedSeconds ?? 0);
      if (minUse > 0 && mainRemaining <= 0 && used < minUse) {
        toast(`Think for at least ${minUse} seconds before playing.`, 'info');
        return;
      }
    }

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
    const pt = eventToInternal(e);
    setCursorPt(pt);
    if (!isSelectingRegionOfInterest) return;
    if (!roiDrag) return;
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

  const handlePointerLeave = () => setCursorPt(null);

  const handleAnalysisClick = (e: React.MouseEvent, move: CandidateMove) => {
      e.stopPropagation();
      if (move.x === -1 || move.y === -1) passTurn();
      else playMove(move.x, move.y);
  };

  // Derived from moveHistory or currentNode from store
  const lastMove = moveHistory.length > 0 ? moveHistory[moveHistory.length - 1] : null;

  const lastMoveMark = useMemo(() => {
    if (!lastMove || lastMove.x < 0 || lastMove.y < 0) return null;
    const cell = board[lastMove.y]?.[lastMove.x];
    if (!cell) return null;
    const d = toDisplay(lastMove.x, lastMove.y);
    const stoneDiameter = 2 * (cellSize * STONE_SIZE);
    const innerDiameter = stoneDiameter * 0.8;
    const col = cell === 'black' ? rgba(STONE_COLORS.white) : rgba(STONE_COLORS.black);
    return {
      left: originX + d.x * cellSize - innerDiameter / 2,
      top: originY + d.y * cellSize - innerDiameter / 2,
      size: innerDiameter,
      color: col,
    };
  }, [board, cellSize, lastMove, originX, originY, toDisplay]);

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

      const stoneRadius = cellSize * STONE_SIZE;

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
                stoneRadius * (EVAL_DOT_MIN_SIZE + evalRadius * (EVAL_DOT_MAX_SIZE - EVAL_DOT_MIN_SIZE));
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
  const labelColor = settings.boardTheme === 'dark' ? '#ccc' : '#404040';
  const approxBoardColor =
    settings.boardTheme === 'dark'
      ? boardColor
      : settings.boardTheme === 'flat'
        ? boardColor
        : rgba(APPROX_BOARD_COLOR);

  const territory = analysisData?.territory ?? currentNode.parent?.analysis?.territory ?? null;

  const ownershipTexture = useMemo(() => {
    if (!isAnalysisMode || !settings.analysisShowOwnership) return null;
    if (!territory) return null;

    const width = BOARD_SIZE + 2;
    const height = BOARD_SIZE + 2;
    const bytes = new Uint8ClampedArray(width * height * 4);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const displayX = x - 1;
        const displayY = y - 1;

        const inBoard = displayX >= 0 && displayX < BOARD_SIZE && displayY >= 0 && displayY < BOARD_SIZE;
        const clampedDisplayX = Math.max(0, Math.min(displayX, BOARD_SIZE - 1));
        const clampedDisplayY = Math.max(0, Math.min(displayY, BOARD_SIZE - 1));
        const internal = toInternal(clampedDisplayX, clampedDisplayY);

        const val = territory[internal.y]?.[internal.x] ?? 0;
        const base = val > 0 ? OWNERSHIP_COLORS.black : OWNERSHIP_COLORS.white;
        let alpha = inBoard ? Math.abs(val) : 0;
        if (alpha > 1) alpha = 1;
        alpha = alpha ** (1 / OWNERSHIP_GAMMA);
        alpha = base[3] * alpha;

        const idx = 4 * (y * width + x);
        bytes[idx] = Math.round(base[0] * 255);
        bytes[idx + 1] = Math.round(base[1] * 255);
        bytes[idx + 2] = Math.round(base[2] * 255);
        bytes[idx + 3] = Math.round(alpha * 255);
      }
    }

    return { width, height, bytes };
  }, [isAnalysisMode, settings.analysisShowOwnership, territory, toInternal]);

  useEffect(() => {
    const canvas = ownershipCanvasRef.current;
    if (!canvas || !ownershipTexture) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    canvas.width = ownershipTexture.width;
    canvas.height = ownershipTexture.height;
    ctx.putImageData(new ImageData(ownershipTexture.bytes, ownershipTexture.width, ownershipTexture.height), 0, 0);
  }, [ownershipTexture]);

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
              const stoneRadius = cellSize * STONE_SIZE;
              const bgRadius = stoneRadius * HINT_SCALE * 0.98;
              const coloredRadius = stoneRadius * HINT_SCALE * scale;
              const bgSize = 2 * bgRadius;
              const size = 2 * coloredRadius;
              const isBest = best > 0 && p === best;

              if (showText) {
                out.push(
                  <div
                    key={`pol-bg-${x}-${y}`}
                    className="absolute pointer-events-none rounded-full"
                    style={{
                      width: bgSize,
                      height: bgSize,
                      left: originX + d.x * cellSize - bgSize / 2,
                      top: originY + d.y * cellSize - bgSize / 2,
                      backgroundColor: approxBoardColor,
                      zIndex: 15,
                    }}
                  />
                );
              }

              const labelRaw = `${(100 * p).toFixed(2)}`.slice(0, 4) + '%';
              out.push(
                <div
                  key={`pol-${x}-${y}`}
                  className="absolute pointer-events-none flex items-center justify-center font-mono rounded-full"
                  style={{
                    width: size,
                    height: size,
                    left: originX + d.x * cellSize - size / 2,
                    top: originY + d.y * cellSize - size / 2,
                    backgroundColor: rgba(col, 0.5),
                    border: isBest ? `2px solid ${rgba(TOP_MOVE_BORDER_COLOR, 0.5)}` : undefined,
                    boxSizing: 'border-box',
                    zIndex: 16,
                    color: 'black',
                    fontSize: cellSize / 4,
                    lineHeight: 1,
                    textAlign: 'center',
                  }}
                >
                  {showText ? labelRaw : null}
                </div>
              );
          }
      }
      return out;
  }, [analysisData, approxBoardColor, cellSize, isAnalysisMode, originX, originY, settings.analysisShowPolicy, toDisplay]);

	  const pvOverlay = useMemo(() => {
	      const pv = hoveredMove?.pv;
	      if (!isAnalysisMode || !pv || pv.length === 0) return [];

	      const upToMove = typeof pvUpToMove === 'number' ? pvUpToMove : pv.length;
	      const opp: typeof currentPlayer = currentPlayer === 'black' ? 'white' : 'black';
	      const moves: Array<{ x: number; y: number; player: typeof currentPlayer; idx: number }> = [];
	      for (let i = 0; i < pv.length; i++) {
	          if (i > upToMove) break;
	          const m = parseGtpMove(pv[i]!);
	          if (!m || m.kind !== 'move') continue;
	          const d = toDisplay(m.x, m.y);
	          moves.push({ x: d.x, y: d.y, player: i % 2 === 0 ? currentPlayer : opp, idx: i + 1 });
	      }
	      return moves;
	  }, [hoveredMove, isAnalysisMode, pvUpToMove, currentPlayer, toDisplay]);

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
      left: originX + minX * cellSize - cellSize / 3,
      top: originY + minY * cellSize - cellSize / 3,
      width: (maxX - minX) * cellSize + (2 / 3) * cellSize,
      height: (maxY - minY) * cellSize + (2 / 3) * cellSize,
    };
  }, [cellSize, originX, originY, regionOfInterest, roiDrag, toDisplay]);

  const bestHintMoveCoords = useMemo(() => {
    if (!isAnalysisMode || !settings.analysisShowHints || settings.analysisShowPolicy) return null;
    const best = analysisData?.moves.find((m) => m.order === 0 && m.x >= 0 && m.y >= 0);
    return best ? { x: best.x, y: best.y } : null;
  }, [analysisData, isAnalysisMode, settings.analysisShowHints, settings.analysisShowPolicy]);

  const passCircle = useMemo(() => {
    const m = lastMove;
    if (!m || m.x >= 0 || m.y >= 0) return null;
    const cx = originX + ((BOARD_SIZE - 1) / 2) * cellSize;
    const cy = originY + ((BOARD_SIZE - 1) / 2) * cellSize;
    const size = Math.min(boardWidth, boardHeight) * 0.227;
    return { cx, cy, size };
  }, [boardHeight, boardWidth, cellSize, lastMove, originX, originY]);

  return (
    <div ref={containerRef} className="w-full h-full flex items-center justify-center">
	      <div
	        className="relative shadow-lg rounded-sm cursor-pointer select-none"
	        style={{
            width: boardWidth,
            height: boardHeight,
            backgroundColor: boardColor,
            backgroundImage: settings.boardTheme === 'bamboo' ? "url('/katrain/board.png')" : undefined,
            backgroundSize: settings.boardTheme === 'bamboo' ? '100% 100%' : undefined,
            backgroundRepeat: settings.boardTheme === 'bamboo' ? 'no-repeat' : undefined,
            overflow: 'hidden',
        }}
	        onClick={handleClick}
	        onPointerDown={handlePointerDown}
	        onPointerMove={handlePointerMove}
	        onPointerUp={handlePointerUp}
	        onPointerLeave={handlePointerLeave}
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
            border: `${roiDrag || isSelectingRegionOfInterest ? Math.max(1, cellSize * 0.07) : Math.max(1, cellSize * 0.045)}px solid ${rgba(REGION_BORDER_COLOR)}`,
            boxShadow: 'none',
            background: 'transparent',
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
                    className="absolute font-bold"
                    style={{
                    left: originX + i * cellSize,
                    top: originY + (BOARD_SIZE - 1) * cellSize + coordOffset,
                    transform: 'translate(-50%, -50%)',
                    fontSize: cellSize / 1.5,
                    color: labelColor,
                    textAlign: 'center',
                    }}
                >
                {getXCoordinateText(i)}
                </div>
            ))}
            {/* Left Labels (KaTrain draws y coords at the left edge) */}
            {Array.from({ length: BOARD_SIZE }).map((_, i) => (
                <div
                    key={`left-${i}`}
                    className="absolute font-bold"
                    style={{
                    left: originX - coordOffset,
                    top: originY + i * cellSize,
                    transform: 'translate(-50%, -50%)',
                    fontSize: cellSize / 1.5,
                    color: labelColor,
                    textAlign: 'center',
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
              left: originX + i * cellSize,
              top: originY,
              width: 1,
              height: cellSize * (BOARD_SIZE - 1),
              backgroundColor: lineColor
            }}
          />
          {/* Horizontal lines */}
          <div
            className="absolute"
            style={{
              left: originX,
              top: originY + i * cellSize,
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
        const r = cellSize * 0.1;
        return (
          <div
            key={`hoshi-${idx}`}
            className="absolute rounded-full"
            style={{
              width: 2 * r,
              height: 2 * r,
              left: originX + d.x * cellSize - r,
              top: originY + d.y * cellSize - r,
              backgroundColor: lineColor,
            }}
          />
        );
      })}

      {/* Ownership / Territory Overlay (KaTrain-style) */}
      {ownershipTexture && (
        <canvas
          ref={ownershipCanvasRef}
          className="absolute pointer-events-none"
          style={{
            left: originX - cellSize * 1.5,
            top: originY - cellSize * 1.5,
            width: cellSize * (BOARD_SIZE + 2),
            height: cellSize * (BOARD_SIZE + 2),
            zIndex: 3,
          }}
        />
      )}

      {/* Policy Overlay (KaTrain-style) */}
      {policyOverlay}

      {/* Stones */}
      {board.map((row, y) =>
        row.map((cell, x) => {
          if (!cell) return null;
          const d = toDisplay(x, y);
          const stoneDiameter = 2 * (cellSize * STONE_SIZE);
          const ownershipVal = isAnalysisMode && settings.analysisShowOwnership && territory ? (territory[y]?.[x] ?? 0) : null;
          const ownershipAbs = ownershipVal !== null ? Math.min(1, Math.abs(ownershipVal)) : 0;
          const owner =
            ownershipVal !== null
              ? ownershipVal > 0
                ? 'black'
                : 'white'
              : null;
          const stoneAlpha =
            ownershipVal !== null && owner
              ? cell === owner
                ? STONE_MIN_ALPHA + (1 - STONE_MIN_ALPHA) * ownershipAbs
                : STONE_MIN_ALPHA
              : 1;
          const showMark = ownershipVal !== null && owner && cell !== owner && ownershipAbs > 0;
          const markSize = Math.max(0, MARK_SIZE * ownershipAbs * stoneDiameter);
          const markColor = owner === 'black' ? STONE_COLORS.black : STONE_COLORS.white;
          const otherColor = owner === 'black' ? STONE_COLORS.white : STONE_COLORS.black;
          const outlineColor = [
            (markColor[0] + otherColor[0]) / 2,
            (markColor[1] + otherColor[1]) / 2,
            (markColor[2] + otherColor[2]) / 2,
            1,
          ] as const;
          return (
            <div
              key={`${x}-${y}`}
              className="absolute flex items-center justify-center"
              style={{
                width: stoneDiameter,
                height: stoneDiameter,
                left: originX + d.x * cellSize - stoneDiameter / 2,
                top: originY + d.y * cellSize - stoneDiameter / 2,
                borderRadius: '50%',
                boxSizing: 'border-box',
              }}
            >
              <div
                className="absolute inset-0"
                style={{
                  backgroundImage: `url('/katrain/${cell === 'black' ? 'B_stone.png' : 'W_stone.png'}')`,
                  backgroundSize: 'contain',
                  backgroundPosition: 'center',
                  backgroundRepeat: 'no-repeat',
                  opacity: stoneAlpha,
                }}
              />

              {showMark && markSize > 0 && (
                <div
                  className="absolute"
                  style={{
                    width: markSize,
                    height: markSize,
                    left: '50%',
                    top: '50%',
                    transform: 'translate(-50%, -50%)',
                    backgroundColor: rgba(markColor),
                    border: `1px solid ${rgba(outlineColor)}`,
                    boxSizing: 'border-box',
                  }}
                />
              )}

              {settings.showMoveNumbers && moveNumbers?.[y]?.[x] !== null && (
                  <div
                    className="font-bold font-mono"
                    style={{
                      color: 'rgba(217,173,102,0.8)',
                      fontSize: (cellSize * STONE_SIZE) * 0.9,
                    }}
                  >
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
                  left: originX + d.x * cellSize - d.size / 2,
                  top: originY + d.y * cellSize - d.size / 2,
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

	      {/* Last Move Marker (KaTrain-style) */}
	      {lastMoveMark && (
	        <div
          className="absolute pointer-events-none"
          style={{
            width: lastMoveMark.size,
            height: lastMoveMark.size,
            left: lastMoveMark.left,
            top: lastMoveMark.top,
            backgroundColor: lastMoveMark.color,
            maskImage: "url('/katrain/inner.png')",
            WebkitMaskImage: "url('/katrain/inner.png')",
            maskSize: 'contain',
            WebkitMaskSize: 'contain',
            maskPosition: 'center',
            WebkitMaskPosition: 'center',
            maskRepeat: 'no-repeat',
            WebkitMaskRepeat: 'no-repeat',
            zIndex: 13,
          }}
        />
	      )}

	      {/* Ghost Stone (Cursor) */}
	      {cursorPt && !isSelectingRegionOfInterest && !board[cursorPt.y]?.[cursorPt.x] && (
	        (() => {
	          const d = toDisplay(cursorPt.x, cursorPt.y);
	          const stoneDiameter = 2 * (cellSize * STONE_SIZE);
	          return (
	            <div
	              className="absolute rounded-full shadow-sm flex items-center justify-center pointer-events-none"
	              style={{
	                width: stoneDiameter,
	                height: stoneDiameter,
	                left: originX + d.x * cellSize - stoneDiameter / 2,
	                top: originY + d.y * cellSize - stoneDiameter / 2,
	                backgroundImage: `url('/katrain/${currentPlayer === 'black' ? 'B_stone.png' : 'W_stone.png'}')`,
	                backgroundSize: 'contain',
	                backgroundPosition: 'center',
	                backgroundRepeat: 'no-repeat',
	                opacity: 0.6,
	                zIndex: 5,
	              }}
	            />
	          );
	        })()
	      )}

	      {/* Ghost Stone (Hover) */}
	      {isAnalysisMode && hoveredMove && (!hoveredMove.pv || hoveredMove.pv.length === 0) && (
	          (() => {
	            const d = toDisplay(hoveredMove.x, hoveredMove.y);
            const stoneDiameter = 2 * (cellSize * STONE_SIZE);
            return (
          <div
              className="absolute rounded-full shadow-sm flex items-center justify-center pointer-events-none"
              style={{
                  width: stoneDiameter,
                  height: stoneDiameter,
                  left: originX + d.x * cellSize - stoneDiameter / 2,
                  top: originY + d.y * cellSize - stoneDiameter / 2,
                  backgroundImage: `url('/katrain/${currentPlayer === 'black' ? 'B_stone.png' : 'W_stone.png'}')`,
                  backgroundSize: 'contain',
                  backgroundPosition: 'center',
                  backgroundRepeat: 'no-repeat',
                  opacity: 0.6,
                  zIndex: 5
              }}
          />
            );
          })()
      )}

	      {/* PV Overlay (Hover) */}
	      {pvOverlay.map((m) => {
	          const stoneRadius = cellSize * STONE_SIZE;
	          const size = 2 * stoneRadius + 1;
	          const textColor = m.player === 'black' ? 'white' : 'black';
	          return (
	              <div
	                  key={`pv-${m.idx}-${m.x}-${m.y}`}
	                  className="absolute flex items-center justify-center pointer-events-none"
	                  style={{
	                      width: size,
	                      height: size,
	                      left: originX + m.x * cellSize - stoneRadius - 1,
	                      top: originY + m.y * cellSize - stoneRadius,
	                      zIndex: 20,
	                  }}
	              >
	                  <div
	                    className="absolute inset-0"
	                    style={{
	                      backgroundImage: `url('/katrain/${m.player === 'black' ? 'B_stone.png' : 'W_stone.png'}')`,
	                      backgroundSize: 'contain',
	                      backgroundPosition: 'center',
	                      backgroundRepeat: 'no-repeat',
	                    }}
	                  />
	                  <div
	                    className="font-bold"
	                    style={{
	                      color: textColor,
	                      fontSize: cellSize / 1.45,
	                      lineHeight: 1,
	                    }}
	                  >
	                    {m.idx}
	                  </div>
	              </div>
	          );
	      })}

      {/* Children Overlay (Q) */}
      {isAnalysisMode && settings.analysisShowChildren && childMoveRings.map((m) => {
          const d = toDisplay(m.x, m.y);
          const strokeWidth = Math.max(1, cellSize * 0.04);
          const ringRadius = Math.max(0, cellSize * STONE_SIZE - strokeWidth);
          const ringSize = 2 * (ringRadius + strokeWidth);
          const isBest = !!bestHintMoveCoords && bestHintMoveCoords.x === m.x && bestHintMoveCoords.y === m.y;
          const showContrast = !isBest;
          const dashDeg = showContrast ? 18 : 10;
          const circumference = 2 * Math.PI * ringRadius;
          const dash = (circumference * dashDeg) / 360;
          const gap = (circumference * (30 - dashDeg)) / 360;
          const stoneCol = rgba(m.player === 'black' ? STONE_COLORS.black : STONE_COLORS.white);
          const contrastCol = rgba(NEXT_MOVE_DASH_CONTRAST_COLORS[m.player]);
          return (
              <svg
                key={`child-${m.x}-${m.y}-${m.player}`}
                className="absolute pointer-events-none"
                width={ringSize}
                height={ringSize}
                viewBox={`0 0 ${ringSize} ${ringSize}`}
                style={{
                  left: originX + d.x * cellSize - ringSize / 2,
                  top: originY + d.y * cellSize - ringSize / 2,
                  zIndex: 14,
                }}
              >
                {showContrast && (
                  <circle
                    cx={ringSize / 2}
                    cy={ringSize / 2}
                    r={ringRadius}
                    fill="none"
                    stroke={contrastCol}
                    strokeWidth={strokeWidth}
                  />
                )}
                <circle
                  cx={ringSize / 2}
                  cy={ringSize / 2}
                  r={ringRadius}
                  fill="none"
                  stroke={stoneCol}
                  strokeWidth={strokeWidth}
                  strokeDasharray={`${dash} ${gap}`}
                  strokeLinecap="round"
                />
              </svg>
          );
      })}

      {/* Pass Circle (KaTrain-style) */}
      {passCircle && (
        <div
          className="absolute pointer-events-none rounded-full flex items-center justify-center"
          style={{
            left: passCircle.cx - passCircle.size / 2,
            top: passCircle.cy - passCircle.size / 2,
            width: passCircle.size,
            height: passCircle.size,
            backgroundColor: rgba(PASS_CIRCLE_COLOR),
            zIndex: 18,
          }}
        >
          <div
            style={{
              color: rgba(PASS_CIRCLE_TEXT_COLOR),
              fontSize: passCircle.size * 0.25,
              lineHeight: 1,
              fontWeight: 700,
            }}
          >
            Pass
          </div>
        </div>
      )}

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

          const stoneRadius = cellSize * STONE_SIZE;
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
                      left: originX + d.x * cellSize - (size * 0.98) / 2,
                      top: originY + d.y * cellSize - (size * 0.98) / 2,
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
                    left: originX + d.x * cellSize - size / 2,
                    top: originY + d.y * cellSize - size / 2,
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
                 left: originX + d.x * cellSize + 20,
                 top: originY + d.y * cellSize - 20,
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
    </div>
  );
};
