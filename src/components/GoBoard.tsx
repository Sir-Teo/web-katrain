import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FaCheck } from 'react-icons/fa';
import { shallow } from 'zustand/shallow';
import { useGameStore } from '../store/gameStore';
import { DEFAULT_BOARD_SIZE, type CandidateMove, type GameNode } from '../types';
import { parseGtpMove } from '../lib/gtp';
import { getKaTrainEvalColors } from '../utils/katrainTheme';
import { publicUrl } from '../utils/publicUrl';
import { getBoardTheme } from '../utils/boardThemes';
import { getHoshiPoints, normalizeBoardSize } from '../utils/boardSize';
import { expandSgfPointList, sgfCoordToXy } from '../utils/sgf';
import { getHorizontalSwipeNavigationAction } from '../utils/swipeNavigation';
import {
  getWheelNavigationAction,
  WHEEL_NAVIGATION_THROTTLE_MS,
} from '../utils/wheelNavigation';
import { getActiveChild } from '../utils/branchNavigation';
import { fuzzyStoneOffset } from '../utils/fuzzyPlacement';
import { formatBoardMoveLabel } from '../utils/playedMoveQuality';
import { setTimedNotification, type TimedNotificationType } from '../utils/timedNotification';
import { getTapConfirmAction, TAP_CONFIRM_TIMEOUT_MS, type TapConfirmPoint } from '../utils/tapConfirm';
import { playNavigationHaptic, playStoneHaptic } from '../utils/haptics';
import { getResizeObserverConstructor } from '../utils/resizeObserver';
import { getBoardTooltipPlacement } from '../utils/boardTooltipPlacement';
import {
  getInitialBoardKeyboardCursor,
  moveBoardKeyboardCursor,
  type BoardKeyboardPoint,
} from '../utils/boardKeyboardNavigation';
import { boardToQaString, countBoardStones } from '../utils/boardQaSnapshot';

const KATRAN_EVAL_THRESHOLDS = [12, 6, 3, 1.5, 0.5, 0] as const;
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
const DOT_URL = publicUrl('katrain/dot.png');
const INNER_URL = publicUrl('katrain/inner.png');
const TOPMOVE_URL = publicUrl('katrain/topmove.png');

const parsePercent = (value: string | undefined, fallback = 1): number => {
  if (!value) return fallback;
  const trimmed = value.trim();
  if (trimmed.endsWith('%')) {
    const num = Number.parseFloat(trimmed.slice(0, -1));
    return Number.isFinite(num) ? num / 100 : fallback;
  }
  return fallback;
};

const parseEm = (value: string | undefined, base: number): number => {
  if (!value) return 0;
  const trimmed = value.trim();
  if (trimmed === '0') return 0;
  const num = Number.parseFloat(trimmed.replace(/em$/, ''));
  if (!Number.isFinite(num)) return 0;
  return num * base;
};

function evaluationClass(pointsLost: number, thresholds: readonly number[] = KATRAN_EVAL_THRESHOLDS, colorsLen = 6): number {
  let i = 0;
  while (i < thresholds.length - 1 && pointsLost < thresholds[i]!) i++;
  return Math.max(0, Math.min(i, colorsLen - 1));
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
  forcePvOverlay?: boolean;
  scoringMode?: boolean;
  scoreTerritory?: number[][] | null;
  deadStones?: ReadonlySet<string>;
  onToggleDeadStone?: (x: number, y: number) => void;
}

type EditDragState = {
  pointerId: number;
  painted: Set<string>;
};

export const GoBoard: React.FC<GoBoardProps> = ({
  hoveredMove,
  onHoverMove,
  pvUpToMove,
  uiMode,
  forcePvOverlay = false,
  scoringMode = false,
  scoreTerritory = null,
  deadStones,
  onToggleDeadStone,
}) => {
  const {
    board,
    playMove,
    isEditMode,
    editTool,
    applyEditTool,
    toggleBoardPointMarkup,
    moveHistory,
    analysisData,
    isAnalysisMode,
    currentPlayer,
    settings,
    currentNode,
    activeBranchChildIds,
    boardRotation,
    regionOfInterest,
    isSelectingRegionOfInterest,
    setRegionOfInterest,
    isAiPlaying,
    aiColor,
    treeVersion,
    navigateBack,
    navigateForward,
    navigateNextMistake,
    navigatePrevMistake,
  } = useGameStore(
    (state) => ({
      board: state.board,
      playMove: state.playMove,
      isEditMode: state.isEditMode,
      editTool: state.editTool,
      applyEditTool: state.applyEditTool,
      toggleBoardPointMarkup: state.toggleBoardPointMarkup,
      moveHistory: state.moveHistory,
      analysisData: state.analysisData,
      isAnalysisMode: state.isAnalysisMode,
      currentPlayer: state.currentPlayer,
      settings: state.settings,
      currentNode: state.currentNode,
      activeBranchChildIds: state.activeBranchChildIds,
      boardRotation: state.boardRotation,
      regionOfInterest: state.regionOfInterest,
      isSelectingRegionOfInterest: state.isSelectingRegionOfInterest,
      setRegionOfInterest: state.setRegionOfInterest,
      isAiPlaying: state.isAiPlaying,
      aiColor: state.aiColor,
      treeVersion: state.treeVersion,
      navigateBack: state.navigateBack,
      navigateForward: state.navigateForward,
      navigateNextMistake: state.navigateNextMistake,
      navigatePrevMistake: state.navigatePrevMistake,
    }),
    shallow
  );
  const wheelDeltaRef = useRef(0);
  const wheelThrottleRef = useRef<number | null>(null);
  const tapConfirmTimerRef = useRef<number | null>(null);
  const editDragRef = useRef<EditDragState | null>(null);

  useEffect(() => {
    return () => {
      if (wheelThrottleRef.current !== null) window.clearTimeout(wheelThrottleRef.current);
      if (tapConfirmTimerRef.current !== null) window.clearTimeout(tapConfirmTimerRef.current);
    };
  }, []);

  const handleWheel = useCallback(
    (e: React.WheelEvent<HTMLDivElement>) => {
      // Allow browser zoom
      if (e.ctrlKey || e.metaKey) return;
      if (scoringMode) return;
      if (wheelThrottleRef.current !== null) return;

      const { deltaX, deltaY } = e;
      if (deltaX === 0 && deltaY === 0) return;

      const dominantDelta =
        Math.abs(deltaY) >= Math.abs(deltaX) ? deltaY : deltaX;
      wheelDeltaRef.current += dominantDelta;
      const action = getWheelNavigationAction({
        deltaX: 0,
        deltaY: wheelDeltaRef.current,
        shiftKey: e.shiftKey,
      });
      if (!action) return;

      wheelDeltaRef.current = 0;
      wheelThrottleRef.current = window.setTimeout(() => {
        wheelThrottleRef.current = null;
      }, WHEEL_NAVIGATION_THROTTLE_MS);

      switch (action) {
        case 'prevMistake':
          navigatePrevMistake();
          break;
        case 'nextMistake':
          navigateNextMistake();
          break;
        case 'back':
          navigateBack();
          break;
        case 'forward':
          navigateForward();
          break;
      }
    },
    [
      navigateBack,
      navigateForward,
      navigateNextMistake,
      navigatePrevMistake,
      scoringMode,
    ]
  );

  const visibleAnalysis = analysisData ?? currentNode.analysis ?? null;
  const hasAnalysisOverlay = isAnalysisMode || !!visibleAnalysis;
  const pvOverlayEnabled = hasAnalysisOverlay || forcePvOverlay;
  const boardSize = normalizeBoardSize(board.length, DEFAULT_BOARD_SIZE);
  const hoshiPoints = useMemo(() => getHoshiPoints(boardSize), [boardSize]);

  const containerRef = useRef<HTMLDivElement>(null);
  const boardSnapshotRef = useRef<HTMLDivElement>(null);
  const swipeStartRef = useRef<{ id: number; x: number; y: number; time: number } | null>(null);
  const suppressNextClickRef = useRef(false);
  const gridCanvasRef = useRef<HTMLCanvasElement>(null);
  const ownershipCanvasRef = useRef<HTMLCanvasElement>(null);
  const ghostCanvasRef = useRef<HTMLCanvasElement>(null);
  const stonesCanvasRef = useRef<HTMLCanvasElement>(null);
  const markupCanvasRef = useRef<HTMLCanvasElement>(null);
  const lastMoveCanvasRef = useRef<HTMLCanvasElement>(null);
  const ringsCanvasRef = useRef<HTMLCanvasElement>(null);
  const pvCanvasRef = useRef<HTMLCanvasElement>(null);
  const policyCanvasRef = useRef<HTMLCanvasElement>(null);
  const hintsCanvasRef = useRef<HTMLCanvasElement>(null);
  const evalCanvasRef = useRef<HTMLCanvasElement>(null);
  const dotImageRef = useRef<HTMLImageElement | null>(null);
  const topMoveImageRef = useRef<HTMLImageElement | null>(null);
  const stoneImagesRef = useRef<{ black: HTMLImageElement[]; white: HTMLImageElement[]; inner: HTMLImageElement | null }>({
    black: [],
    white: [],
    inner: null,
  });
  const [dotTextureVersion, setDotTextureVersion] = useState(0);
  const [topMoveTextureVersion, setTopMoveTextureVersion] = useState(0);
  const [stoneTextureVersion, setStoneTextureVersion] = useState(0);
  const [containerSize, setContainerSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const [pendingTap, setPendingTap] = useState<TapConfirmPoint | null>(null);
  const [isKeyboardCursorActive, setIsKeyboardCursorActive] = useState(false);

  const evalThresholds: readonly number[] = settings.trainerEvalThresholds?.length ? settings.trainerEvalThresholds : KATRAN_EVAL_THRESHOLDS;
  const boardTheme = useMemo(() => getBoardTheme(settings.boardTheme), [settings.boardTheme]);
  const evalColors = useMemo(() => getKaTrainEvalColors(settings.trainerTheme), [settings.trainerTheme]);
  const showEvalDotsForPlayer = useMemo(() => {
    if (settings.trainerEvalShowAi) return { black: true, white: true };
    return {
      black: !(isAiPlaying && aiColor === 'black'),
      white: !(isAiPlaying && aiColor === 'white'),
    };
  }, [aiColor, isAiPlaying, settings.trainerEvalShowAi]);

  const toast = useCallback((message: string, type: TimedNotificationType = 'info') => {
    setTimedNotification(message, type, 2500);
  }, []);

  const clearPendingTap = useCallback(() => {
    if (tapConfirmTimerRef.current !== null) {
      window.clearTimeout(tapConfirmTimerRef.current);
      tapConfirmTimerRef.current = null;
    }
    setPendingTap(null);
  }, []);

  const schedulePendingTapClear = useCallback(() => {
    if (tapConfirmTimerRef.current !== null) window.clearTimeout(tapConfirmTimerRef.current);
    tapConfirmTimerRef.current = window.setTimeout(() => {
      tapConfirmTimerRef.current = null;
      setPendingTap(null);
    }, TAP_CONFIRM_TIMEOUT_MS);
  }, []);

  const cancelTouchGesture = useCallback(
    (suppressClick = false) => {
      swipeStartRef.current = null;
      clearPendingTap();
      if (suppressClick) suppressNextClickRef.current = true;
    },
    [clearPendingTap]
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const rect = el.getBoundingClientRect();
      setContainerSize({ width: rect.width, height: rect.height });
    };
    update();
    const ResizeObserverConstructor = getResizeObserverConstructor();
    if (!ResizeObserverConstructor) return;
    const obs = new ResizeObserverConstructor(() => update());
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    const img = new Image();
    img.src = DOT_URL;
    dotImageRef.current = img;
    const handleLoad = () => setDotTextureVersion((v) => v + 1);
    if (img.complete) handleLoad();
    else img.addEventListener('load', handleLoad);
    return () => img.removeEventListener('load', handleLoad);
  }, []);

  useEffect(() => {
    const img = new Image();
    img.src = TOPMOVE_URL;
    topMoveImageRef.current = img;
    const handleLoad = () => setTopMoveTextureVersion((v) => v + 1);
    if (img.complete) handleLoad();
    else img.addEventListener('load', handleLoad);
    return () => img.removeEventListener('load', handleLoad);
  }, []);

  useEffect(() => {
    const buildImages = (paths: Array<string | undefined>) =>
      paths
        .filter((p): p is string => !!p)
        .map((src) => {
          const img = new Image();
          img.src = src;
          return img;
        });

    const blackPaths = [boardTheme.stones.black.image, ...(boardTheme.stones.black.imageVariations ?? [])];
    const whitePaths = [boardTheme.stones.white.image, ...(boardTheme.stones.white.imageVariations ?? [])];
    const black = buildImages(blackPaths);
    const white = buildImages(whitePaths);
    const inner = new Image();
    inner.src = INNER_URL;
    stoneImagesRef.current = { black, white, inner };

    const handleLoad = () => setStoneTextureVersion((v) => v + 1);
    const images = [...black, ...white, inner];
    for (const img of images) {
      if (img.complete) handleLoad();
      else img.addEventListener('load', handleLoad);
    }
    return () => {
      for (const img of images) img.removeEventListener('load', handleLoad);
    };
  }, [boardTheme]);

  // KaTrain grid spacing/margins (see `badukpan.py:get_grid_spaces_margins`).
  const gridSpacesMarginX = useMemo(
    () => (settings.showCoordinates ? { left: 1.5, right: 0.75 } : { left: 0.75, right: 0.75 }),
    [settings.showCoordinates]
  );
  const gridSpacesMarginY = useMemo(
    () => (settings.showCoordinates ? { bottom: 1.5, top: 0.75 } : { bottom: 0.75, top: 0.75 }),
    [settings.showCoordinates]
  );

  const xGridSpaces = (boardSize - 1) + gridSpacesMarginX.left + gridSpacesMarginX.right;
  const yGridSpaces = (boardSize - 1) + gridSpacesMarginY.bottom + gridSpacesMarginY.top;

  const cellSize = useMemo(() => {
    const fallbackWidth = typeof window !== 'undefined' ? Math.max(260, window.innerWidth - 16) : 640;
    const fallbackHeight = typeof window !== 'undefined' ? Math.max(260, window.innerHeight - 160) : 640;
    const w = containerSize.width > 0 ? containerSize.width : fallbackWidth;
    const h = containerSize.height > 0 ? containerSize.height : fallbackHeight;
    const grid = Math.floor(Math.min(w / xGridSpaces, h / yGridSpaces) + 0.1);
    return Math.max(10, Math.min(80, grid));
  }, [containerSize.height, containerSize.width, xGridSpaces, yGridSpaces]);

  const boardWidth = cellSize * xGridSpaces;
  const boardHeight = cellSize * yGridSpaces;
  const originX = Math.floor(cellSize * gridSpacesMarginX.left + 0.5);
  const originY = Math.floor(cellSize * gridSpacesMarginY.top + 0.5);
  const coordOffset = (cellSize * 1.5) / 2;

  const setupOverlayCanvas = useCallback(
    (canvas: HTMLCanvasElement): CanvasRenderingContext2D | null => {
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
      const width = Math.max(1, boardWidth);
      const height = Math.max(1, boardHeight);
      const pixelWidth = Math.max(1, Math.round(width * dpr));
      const pixelHeight = Math.max(1, Math.round(height * dpr));
      if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
      if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = true;
      return ctx;
    },
    [boardHeight, boardWidth]
  );

  // KaTrain-style coordinates and rotation behavior.
  const GTP_COORD = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T'] as const;
  const gtpCoord = GTP_COORD.slice(0, boardSize);
  const rotation = boardRotation ?? 0;
  const getXCoordinateText = (i: number): string => {
    if (rotation === 1) return String(i + 1);
    if (rotation === 2) return gtpCoord[boardSize - i - 1] ?? '';
    if (rotation === 3) return String(boardSize - i);
    return gtpCoord[i] ?? '';
  };
  const getYCoordinateText = (displayRowTopToBottom: number): string => {
    const i = boardSize - 1 - displayRowTopToBottom; // KaTrain uses bottom-to-top indexing for y labels.
    if (rotation === 1) return gtpCoord[boardSize - i - 1] ?? '';
    if (rotation === 2) return String(boardSize - i);
    if (rotation === 3) return gtpCoord[i] ?? '';
    return String(i + 1);
  };

  const toDisplay = useCallback((x: number, y: number): { x: number; y: number } => {
    if (rotation === 1) return { x: boardSize - 1 - y, y: x };
    if (rotation === 2) return { x: boardSize - 1 - x, y: boardSize - 1 - y };
    if (rotation === 3) return { x: y, y: boardSize - 1 - x };
    return { x, y };
  }, [boardSize, rotation]);

  const toInternal = useCallback((x: number, y: number): { x: number; y: number } => {
    if (rotation === 1) return { x: y, y: boardSize - 1 - x };
    if (rotation === 2) return { x: boardSize - 1 - x, y: boardSize - 1 - y };
    if (rotation === 3) return { x: boardSize - 1 - y, y: x };
    return { x, y };
  }, [boardSize, rotation]);

  // Theme styling
  const boardColor = boardTheme.board.backgroundColor;
  const lineColor = boardTheme.board.foregroundColor ?? '#000';
  const labelColor = boardTheme.coordColor ?? '#404040';
  const approxBoardColor = boardTheme.board.texture ? rgba(APPROX_BOARD_COLOR) : boardColor;
  const boardTexture = boardTheme.board.texture;

  // Derived from moveHistory or currentNode from store
  const lastMove = moveHistory.length > 0 ? moveHistory[moveHistory.length - 1] : null;

  const moveNumbers = useMemo(() => {
    if (!settings.showMoveNumbers) return null;
    const grid: Array<Array<number | null>> = Array.from({ length: boardSize }, () =>
      Array<number | null>(boardSize).fill(null)
    );
    for (let i = 0; i < moveHistory.length; i++) {
      const m = moveHistory[i]!;
      if (m.x < 0 || m.y < 0) continue;
      grid[m.y]![m.x] = i + 1;
    }
    return grid;
  }, [boardSize, moveHistory, settings.showMoveNumbers]);

  const childMoveRings = useMemo(() => {
    if (!hasAnalysisOverlay || !settings.analysisShowChildren) return [];
    return currentNode.children
      .map((c) => c.move)
      .filter((m): m is NonNullable<typeof m> => !!m && m.x >= 0 && m.y >= 0);
  }, [currentNode, hasAnalysisOverlay, settings.analysisShowChildren]);

  const bestHintMoveCoords = useMemo(() => {
    if (!hasAnalysisOverlay || !settings.analysisShowHints || settings.analysisShowPolicy) return null;
    const best = visibleAnalysis?.moves.find((m) => m.order === 0 && m.x >= 0 && m.y >= 0);
    return best ? { x: best.x, y: best.y } : null;
  }, [hasAnalysisOverlay, settings.analysisShowHints, settings.analysisShowPolicy, visibleAnalysis]);

  const showOwnership = hasAnalysisOverlay && settings.analysisShowOwnership;
  const editSetupPlayer: 'black' | 'white' | null =
    editTool === 'setup-black' ? 'black' : editTool === 'setup-white' ? 'white' : null;
  const analysisTerritory =
    showOwnership && visibleAnalysis && (visibleAnalysis.ownershipMode ?? 'root') !== 'none' ? visibleAnalysis.territory : null;
  const parentTerritory =
    showOwnership && currentNode.parent?.analysis && (currentNode.parent.analysis.ownershipMode ?? 'root') !== 'none'
      ? currentNode.parent.analysis.territory
      : null;
  const territory = (scoringMode ? scoreTerritory : null) ?? analysisTerritory ?? parentTerritory ?? null;
  const shouldShowHints = hasAnalysisOverlay && !!visibleAnalysis && settings.analysisShowHints && !settings.analysisShowPolicy;
  const canHoverAnalysisMove = hasAnalysisOverlay && !!visibleAnalysis && (shouldShowHints || settings.analysisShowPolicy);
  const hoverMoveMap = useMemo(() => {
    if (!canHoverAnalysisMove || !visibleAnalysis) return null;
    const map = new Map<string, CandidateMove>();
    for (const move of visibleAnalysis.moves) {
      if (move.x < 0 || move.y < 0) continue;
      map.set(`${move.x},${move.y}`, move);
    }
    return map;
  }, [canHoverAnalysisMove, visibleAnalysis]);

  const [roiDrag, setRoiDrag] = useState<{ start: { x: number; y: number }; end: { x: number; y: number } } | null>(
    null
  );
  const [cursorPt, setCursorPt] = useState<BoardKeyboardPoint | null>(null);

  useEffect(() => {
    if (!canHoverAnalysisMove && hoveredMove) onHoverMove(null);
  }, [canHoverAnalysisMove, hoveredMove, onHoverMove]);

  useEffect(() => {
    const canvas = gridCanvasRef.current;
    if (!canvas) return;
    const ctx = setupOverlayCanvas(canvas);
    if (!ctx) return;

    const startX = originX;
    const startY = originY;
    const endX = originX + cellSize * (boardSize - 1);
    const endY = originY + cellSize * (boardSize - 1);
    ctx.lineWidth = 1;
    ctx.strokeStyle = lineColor;
    ctx.beginPath();
    for (let i = 0; i < boardSize; i++) {
      const x = originX + i * cellSize + 0.5;
      ctx.moveTo(x, startY);
      ctx.lineTo(x, endY);
      const y = originY + i * cellSize + 0.5;
      ctx.moveTo(startX, y);
      ctx.lineTo(endX, y);
    }
    ctx.stroke();

    ctx.fillStyle = lineColor;
    const r = cellSize * 0.1;
    for (const [hx, hy] of hoshiPoints) {
      const d = toDisplay(hx, hy);
      const cx = originX + d.x * cellSize;
      const cy = originY + d.y * cellSize;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }, [boardSize, cellSize, hoshiPoints, lineColor, originX, originY, setupOverlayCanvas, toDisplay]);

  useEffect(() => {
    const canvas = stonesCanvasRef.current;
    if (!canvas) return;
    const ctx = setupOverlayCanvas(canvas);
    if (!ctx) return;

    const blackImages = stoneImagesRef.current.black;
    const whiteImages = stoneImagesRef.current.white;
    const stoneRadius = cellSize * STONE_SIZE;
    const stoneDiameter = 2 * stoneRadius;
    const blackConfig = boardTheme.stones.black;
    const whiteConfig = boardTheme.stones.white;
    const fontSize = stoneDiameter * 0.9;

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font =
      `bold ${fontSize}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace`;

    for (let y = 0; y < boardSize; y++) {
      for (let x = 0; x < boardSize; x++) {
        const cell = board[y]?.[x] ?? null;
        if (!cell) continue;
        const d = toDisplay(x, y);
        const cx = originX + d.x * cellSize;
        const cy = originY + d.y * cellSize;
        const stoneConfig = cell === 'black' ? blackConfig : whiteConfig;
        const scale = parsePercent(stoneConfig.size, 1);
        const diameter = stoneDiameter * scale;
        const radius = diameter / 2;
        const offsetX = parseEm(stoneConfig.imageOffsetX, stoneDiameter);
        const offsetY = parseEm(stoneConfig.imageOffsetY, stoneDiameter);
        const fuzzy = fuzzyStoneOffset(boardSize, x, y, settings.fuzzyStonePlacement);
        const stoneCx = cx + fuzzy.dxFactor * stoneDiameter;
        const stoneCy = cy + fuzzy.dyFactor * stoneDiameter;
        const left = stoneCx - radius + offsetX;
        const top = stoneCy - radius + offsetY;

        const deadStoneKey = `${x},${y}`;
        const isDeadScoringStone = scoringMode && !!deadStones?.has(deadStoneKey);
        const ownershipVal =
          (scoringMode || (isAnalysisMode && settings.analysisShowOwnership)) && territory
            ? (territory[y]?.[x] ?? 0)
            : null;
        const ownershipAbs = ownershipVal !== null ? Math.min(1, Math.abs(ownershipVal)) : 0;
        const owner =
          ownershipVal !== null
            ? ownershipVal > 0
              ? 'black'
              : 'white'
            : null;
        const stoneAlpha =
          isDeadScoringStone
            ? 0.45
            : ownershipVal !== null && owner
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

        ctx.globalAlpha = stoneAlpha;
        const moveNumber = moveNumbers?.[y]?.[x];
        const imageList = cell === 'black' ? blackImages : whiteImages;
        const variantIndex = imageList.length > 0
          ? Math.abs(((moveNumber ?? 0) + x * 7 + y * 13) % imageList.length)
          : 0;
        const img = imageList[variantIndex];
        const shadowOffsetX = parseEm(stoneConfig.shadowOffsetX, stoneDiameter);
        const shadowOffsetY = parseEm(stoneConfig.shadowOffsetY, stoneDiameter);
        const shadowBlur = parseEm(stoneConfig.shadowBlur, stoneDiameter);
        const hasShadow = stoneConfig.shadowColor && stoneConfig.shadowColor !== 'transparent';
        ctx.save();
        if (hasShadow) {
          ctx.shadowColor = stoneConfig.shadowColor!;
          ctx.shadowOffsetX = shadowOffsetX;
          ctx.shadowOffsetY = shadowOffsetY;
          ctx.shadowBlur = shadowBlur;
        }
        if (img && img.complete && img.naturalWidth > 0) {
          ctx.drawImage(img, left, top, diameter, diameter);
        } else {
          ctx.beginPath();
          ctx.fillStyle = stoneConfig.backgroundColor ?? rgba(cell === 'black' ? STONE_COLORS.black : STONE_COLORS.white);
          ctx.arc(stoneCx, stoneCy, radius, 0, Math.PI * 2);
          ctx.fill();
          const borderWidth = parseEm(stoneConfig.borderWidth, stoneDiameter);
          if (borderWidth > 0 && stoneConfig.borderColor) {
            ctx.lineWidth = borderWidth;
            ctx.strokeStyle = stoneConfig.borderColor;
            ctx.stroke();
          }
        }
        ctx.restore();
        ctx.globalAlpha = 1;

        if (showMark && markSize > 0) {
          ctx.fillStyle = rgba(markColor);
          ctx.strokeStyle = rgba(outlineColor);
          const markLeft = stoneCx - markSize / 2;
          const markTop = stoneCy - markSize / 2;
          ctx.fillRect(markLeft, markTop, markSize, markSize);
          ctx.strokeRect(markLeft, markTop, markSize, markSize);
        }

        if (isDeadScoringStone) {
          const cross = stoneDiameter * 0.28;
          ctx.save();
          ctx.lineCap = 'round';
          ctx.lineWidth = Math.max(2, stoneDiameter * 0.075);
          ctx.strokeStyle = 'rgba(12, 18, 28, 0.62)';
          ctx.beginPath();
          ctx.moveTo(stoneCx - cross, stoneCy - cross);
          ctx.lineTo(stoneCx + cross, stoneCy + cross);
          ctx.moveTo(stoneCx + cross, stoneCy - cross);
          ctx.lineTo(stoneCx - cross, stoneCy + cross);
          ctx.stroke();
          ctx.lineWidth = Math.max(2, stoneDiameter * 0.052);
          ctx.strokeStyle = 'rgba(251, 113, 133, 0.96)';
          ctx.beginPath();
          ctx.moveTo(stoneCx - cross, stoneCy - cross);
          ctx.lineTo(stoneCx + cross, stoneCy + cross);
          ctx.moveTo(stoneCx + cross, stoneCy - cross);
          ctx.lineTo(stoneCx - cross, stoneCy + cross);
          ctx.stroke();
          ctx.restore();
        }

        if (settings.showMoveNumbers && moveNumber != null) {
          ctx.fillStyle = 'rgba(217,173,102,0.8)';
          ctx.fillText(String(moveNumber), stoneCx, stoneCy);
        }
      }
    }
  }, [
    board,
    boardSize,
    boardTheme,
    cellSize,
    deadStones,
    isAnalysisMode,
    moveNumbers,
    originX,
    originY,
    scoringMode,
    settings.analysisShowOwnership,
    settings.fuzzyStonePlacement,
    settings.showMoveNumbers,
    setupOverlayCanvas,
    stoneTextureVersion,
    territory,
    toDisplay,
  ]);

  useEffect(() => {
    const canvas = markupCanvasRef.current;
    if (!canvas) return;
    const ctx = setupOverlayCanvas(canvas);
    if (!ctx) return;

    const props = currentNode.properties ?? {};
    const fontFamily =
      'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';
    const radius = cellSize * 0.27;
    const lineWidth = Math.max(2, cellSize * 0.045);

    const pointFromCoord = (coord: string): { x: number; y: number; cx: number; cy: number; stone: 'black' | 'white' | null } | null => {
      const { x, y } = sgfCoordToXy(coord);
      if (x < 0 || y < 0 || x >= boardSize || y >= boardSize) return null;
      const d = toDisplay(x, y);
      return {
        x,
        y,
        cx: originX + d.x * cellSize,
        cy: originY + d.y * cellSize,
        stone: board[y]?.[x] ?? null,
      };
    };

    const colorsForStone = (stone: 'black' | 'white' | null) => {
      if (stone === 'black') {
        return {
          main: 'rgba(255,255,255,0.94)',
          halo: 'rgba(0,0,0,0.45)',
          fill: 'rgba(12,18,28,0.36)',
        };
      }
      return {
        main: 'rgba(20,28,40,0.94)',
        halo: 'rgba(255,255,255,0.72)',
        fill: stone === 'white' ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.64)',
      };
    };

    const strokeWithHalo = (draw: () => void, colors: ReturnType<typeof colorsForStone>) => {
      ctx.lineWidth = lineWidth + 2;
      ctx.strokeStyle = colors.halo;
      draw();
      ctx.stroke();
      ctx.lineWidth = lineWidth;
      ctx.strokeStyle = colors.main;
      draw();
      ctx.stroke();
    };

    const drawTriangle = (coord: string) => {
      const pt = pointFromCoord(coord);
      if (!pt) return;
      const colors = colorsForStone(pt.stone);
      const draw = () => {
        ctx.beginPath();
        ctx.moveTo(pt.cx, pt.cy - radius);
        ctx.lineTo(pt.cx + radius * 0.9, pt.cy + radius * 0.58);
        ctx.lineTo(pt.cx - radius * 0.9, pt.cy + radius * 0.58);
        ctx.closePath();
      };
      strokeWithHalo(draw, colors);
    };

    const drawSquare = (coord: string) => {
      const pt = pointFromCoord(coord);
      if (!pt) return;
      const colors = colorsForStone(pt.stone);
      const size = radius * 1.6;
      strokeWithHalo(() => {
        ctx.beginPath();
        ctx.rect(pt.cx - size / 2, pt.cy - size / 2, size, size);
      }, colors);
    };

    const drawCircle = (coord: string) => {
      const pt = pointFromCoord(coord);
      if (!pt) return;
      const colors = colorsForStone(pt.stone);
      strokeWithHalo(() => {
        ctx.beginPath();
        ctx.arc(pt.cx, pt.cy, radius * 0.86, 0, Math.PI * 2);
      }, colors);
    };

    const drawCross = (coord: string) => {
      const pt = pointFromCoord(coord);
      if (!pt) return;
      const colors = colorsForStone(pt.stone);
      strokeWithHalo(() => {
        ctx.beginPath();
        ctx.moveTo(pt.cx - radius * 0.78, pt.cy - radius * 0.78);
        ctx.lineTo(pt.cx + radius * 0.78, pt.cy + radius * 0.78);
        ctx.moveTo(pt.cx + radius * 0.78, pt.cy - radius * 0.78);
        ctx.lineTo(pt.cx - radius * 0.78, pt.cy + radius * 0.78);
      }, colors);
    };

    const drawLabel = (value: string) => {
      const sep = value.indexOf(':');
      if (sep < 0) return;
      const coord = value.slice(0, sep);
      const label = value.slice(sep + 1).trim();
      if (!label) return;
      const pt = pointFromCoord(coord);
      if (!pt) return;
      const colors = colorsForStone(pt.stone);
      const bgRadius = Math.max(radius * 0.98, cellSize * 0.18);
      ctx.beginPath();
      ctx.arc(pt.cx, pt.cy, bgRadius, 0, Math.PI * 2);
      ctx.fillStyle = colors.fill;
      ctx.fill();
      ctx.lineWidth = Math.max(1, lineWidth * 0.5);
      ctx.strokeStyle = colors.halo;
      ctx.stroke();

      const fontSize = Math.max(10, Math.min(cellSize * 0.42, label.length > 2 ? (cellSize * 0.86) / label.length : cellSize * 0.42));
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `800 ${fontSize}px ${fontFamily}`;
      ctx.lineWidth = Math.max(2, fontSize * 0.16);
      ctx.strokeStyle = colors.halo;
      ctx.strokeText(label, pt.cx, pt.cy + fontSize * 0.02);
      ctx.fillStyle = colors.main;
      ctx.fillText(label, pt.cx, pt.cy + fontSize * 0.02);
    };

    const forEachPoint = (coord: string, draw: (coord: string) => void) => {
      if (!coord.includes(':')) {
        draw(coord);
        return;
      }
      for (const point of expandSgfPointList(coord, boardSize)) {
        draw(`${String.fromCharCode(97 + point.x)}${String.fromCharCode(97 + point.y)}`);
      }
    };

    for (const coord of props.TR ?? []) forEachPoint(coord, drawTriangle);
    for (const coord of props.SQ ?? []) forEachPoint(coord, drawSquare);
    for (const coord of props.CR ?? []) forEachPoint(coord, drawCircle);
    for (const coord of props.MA ?? []) forEachPoint(coord, drawCross);
    for (const label of props.LB ?? []) drawLabel(label);
  }, [
    board,
    boardSize,
    cellSize,
    currentNode,
    originX,
    originY,
    setupOverlayCanvas,
    toDisplay,
    treeVersion,
  ]);

  useEffect(() => {
    const canvas = ghostCanvasRef.current;
    if (!canvas) return;
    const ctx = setupOverlayCanvas(canvas);
    if (!ctx) return;
    if (isSelectingRegionOfInterest) return;
    if (scoringMode) return;

    const blackImages = stoneImagesRef.current.black;
    const whiteImages = stoneImagesRef.current.white;
    const stoneRadius = cellSize * STONE_SIZE;
    const stoneDiameter = 2 * stoneRadius;

    const drawGhost = (x: number, y: number, player: typeof currentPlayer, alpha = 0.6) => {
      const d = toDisplay(x, y);
      const stoneConfig = player === 'black' ? boardTheme.stones.black : boardTheme.stones.white;
      const scale = parsePercent(stoneConfig.size, 1);
      const diameter = stoneDiameter * scale;
      const radius = diameter / 2;
      const offsetX = parseEm(stoneConfig.imageOffsetX, stoneDiameter);
      const offsetY = parseEm(stoneConfig.imageOffsetY, stoneDiameter);
      const left = originX + d.x * cellSize - radius + offsetX;
      const top = originY + d.y * cellSize - radius + offsetY;
      ctx.save();
      ctx.globalAlpha = alpha;
      const imageList = player === 'black' ? blackImages : whiteImages;
      const img = imageList[0];
      if (img && img.complete && img.naturalWidth > 0) {
        ctx.drawImage(img, left, top, diameter, diameter);
      } else {
        ctx.beginPath();
        ctx.fillStyle = rgba(player === 'black' ? STONE_COLORS.black : STONE_COLORS.white);
        ctx.arc(left + radius, top + radius, radius, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    };

    const drawEditPreview = (x: number, y: number) => {
      const d = toDisplay(x, y);
      const cx = originX + d.x * cellSize;
      const cy = originY + d.y * cellSize;
      const r = Math.max(8, cellSize * 0.25);
      const accent = 'rgba(34,197,94,0.92)';
      const halo = 'rgba(0,0,0,0.45)';
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineWidth = Math.max(2, cellSize * 0.045);
      ctx.strokeStyle = halo;
      ctx.fillStyle = 'rgba(34,197,94,0.18)';
      ctx.beginPath();
      ctx.arc(cx, cy, r * 1.28, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = accent;
      if (editTool === 'setup-erase' || editTool === 'marker-erase') {
        ctx.beginPath();
        ctx.arc(cx, cy, r * 1.08, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(cx - r * 0.75, cy - r * 0.75);
        ctx.lineTo(cx + r * 0.75, cy + r * 0.75);
        ctx.moveTo(cx + r * 0.75, cy - r * 0.75);
        ctx.lineTo(cx - r * 0.75, cy + r * 0.75);
        ctx.stroke();
      } else if (editTool === 'marker-triangle') {
        ctx.beginPath();
        ctx.moveTo(cx, cy - r);
        ctx.lineTo(cx + r * 0.88, cy + r * 0.58);
        ctx.lineTo(cx - r * 0.88, cy + r * 0.58);
        ctx.closePath();
        ctx.stroke();
      } else if (editTool === 'marker-square') {
        ctx.strokeRect(cx - r * 0.75, cy - r * 0.75, r * 1.5, r * 1.5);
      } else if (editTool === 'marker-circle') {
        ctx.beginPath();
        ctx.arc(cx, cy, r * 0.82, 0, Math.PI * 2);
        ctx.stroke();
      } else if (editTool === 'marker-cross') {
        ctx.beginPath();
        ctx.moveTo(cx - r * 0.75, cy - r * 0.75);
        ctx.lineTo(cx + r * 0.75, cy + r * 0.75);
        ctx.moveTo(cx + r * 0.75, cy - r * 0.75);
        ctx.lineTo(cx - r * 0.75, cy + r * 0.75);
        ctx.stroke();
      } else if (editTool === 'label-alpha' || editTool === 'label-number') {
        ctx.beginPath();
        ctx.arc(cx, cy, r * 1.04, 0, Math.PI * 2);
        ctx.stroke();
        ctx.font = `800 ${Math.max(10, cellSize * 0.34)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = accent;
        ctx.fillText(editTool === 'label-alpha' ? 'A' : '1', cx, cy + 1);
      }
      ctx.restore();
    };

    if (isEditMode) {
      if (editSetupPlayer && cursorPt) {
        const existing = board[cursorPt.y]?.[cursorPt.x] ?? null;
        drawGhost(cursorPt.x, cursorPt.y, editSetupPlayer, existing === editSetupPlayer ? 0.25 : 0.68);
      } else if (cursorPt) {
        drawEditPreview(cursorPt.x, cursorPt.y);
      }
      return;
    }

    if (pendingTap && pendingTap.player === currentPlayer && !board[pendingTap.y]?.[pendingTap.x]) {
      drawGhost(pendingTap.x, pendingTap.y, pendingTap.player, 0.72);
    }

    if (cursorPt && !board[cursorPt.y]?.[cursorPt.x]) {
      const isPendingPoint = pendingTap && pendingTap.x === cursorPt.x && pendingTap.y === cursorPt.y;
      if (!isPendingPoint) drawGhost(cursorPt.x, cursorPt.y, currentPlayer, 0.6);
    }

    if (pvOverlayEnabled && hoveredMove && (!hoveredMove.pv || hoveredMove.pv.length === 0)) {
      if (hoveredMove.x >= 0 && hoveredMove.y >= 0) {
        drawGhost(hoveredMove.x, hoveredMove.y, currentPlayer, 0.6);
      }
    }

    if (settings.showNextMovePreview) {
      const nextMove = getActiveChild(currentNode, activeBranchChildIds)?.move;
      if (nextMove && nextMove.x >= 0 && nextMove.y >= 0 && !board[nextMove.y]?.[nextMove.x]) {
        drawGhost(nextMove.x, nextMove.y, nextMove.player, 0.35);
      }
    }
  }, [
    board,
    cellSize,
    cursorPt,
    currentPlayer,
    editTool,
    editSetupPlayer,
    isEditMode,
    hoveredMove,
    isAnalysisMode,
    isSelectingRegionOfInterest,
    originX,
    originY,
    pendingTap,
    pvOverlayEnabled,
    setupOverlayCanvas,
    stoneTextureVersion,
    toDisplay,
    boardTheme,
    currentNode,
    activeBranchChildIds,
    settings.showNextMovePreview,
    scoringMode,
  ]);

  useEffect(() => {
    const canvas = lastMoveCanvasRef.current;
    if (!canvas) return;
    const ctx = setupOverlayCanvas(canvas);
    if (!ctx) return;
    if (!lastMove || lastMove.x < 0 || lastMove.y < 0) return;
    const cell = board[lastMove.y]?.[lastMove.x];
    if (!cell) return;

    const d = toDisplay(lastMove.x, lastMove.y);
    const stoneDiameter = 2 * (cellSize * STONE_SIZE);
    const innerDiameter = stoneDiameter * 0.8;
    const left = originX + d.x * cellSize - innerDiameter / 2;
    const top = originY + d.y * cellSize - innerDiameter / 2;
    const color = cell === 'black' ? rgba(STONE_COLORS.white) : rgba(STONE_COLORS.black);
    const innerImg = stoneImagesRef.current.inner;

    if (innerImg && innerImg.complete && innerImg.naturalWidth > 0) {
      ctx.drawImage(innerImg, left, top, innerDiameter, innerDiameter);
      ctx.save();
      ctx.globalCompositeOperation = 'source-in';
      ctx.fillStyle = color;
      ctx.fillRect(left, top, innerDiameter, innerDiameter);
      ctx.restore();
    } else {
      const r = innerDiameter / 2;
      ctx.beginPath();
      ctx.arc(left + r, top + r, r, 0, Math.PI * 2);
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(1, cellSize * 0.04);
      ctx.stroke();
    }
  }, [board, cellSize, lastMove, originX, originY, setupOverlayCanvas, stoneTextureVersion, toDisplay]);

  useEffect(() => {
    const canvas = ringsCanvasRef.current;
    if (!canvas) return;
    const ctx = setupOverlayCanvas(canvas);
    if (!ctx) return;
    if (!hasAnalysisOverlay || !settings.analysisShowChildren) return;
    if (childMoveRings.length === 0) return;

    const strokeWidth = Math.max(1, cellSize * 0.04);
    const ringRadius = Math.max(0, cellSize * STONE_SIZE - strokeWidth);
    if (ringRadius <= 0) return;
    ctx.lineWidth = strokeWidth;
    ctx.lineCap = 'round';

    for (const m of childMoveRings) {
      const d = toDisplay(m.x, m.y);
      const cx = originX + d.x * cellSize;
      const cy = originY + d.y * cellSize;
      const isBest = !!bestHintMoveCoords && bestHintMoveCoords.x === m.x && bestHintMoveCoords.y === m.y;
      const showContrast = !isBest;
      const dashDeg = showContrast ? 18 : 10;
      const circumference = 2 * Math.PI * ringRadius;
      const dash = (circumference * dashDeg) / 360;
      const gap = (circumference * (30 - dashDeg)) / 360;
      const stoneCol = rgba(m.player === 'black' ? STONE_COLORS.black : STONE_COLORS.white);
      const contrastCol = rgba(NEXT_MOVE_DASH_CONTRAST_COLORS[m.player]);

      if (showContrast) {
        ctx.setLineDash([]);
        ctx.strokeStyle = contrastCol;
        ctx.beginPath();
        ctx.arc(cx, cy, ringRadius, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.setLineDash([dash, gap]);
      ctx.strokeStyle = stoneCol;
      ctx.beginPath();
      ctx.arc(cx, cy, ringRadius, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }, [
    bestHintMoveCoords,
    cellSize,
    childMoveRings,
    hasAnalysisOverlay,
    originX,
    originY,
    settings.analysisShowChildren,
    setupOverlayCanvas,
    toDisplay,
  ]);

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

    if (displayCol >= 0 && displayCol < boardSize && displayRow >= 0 && displayRow < boardSize) {
      const { x: col, y: row } = toInternal(displayCol, displayRow);
      if (col < 0 || col >= boardSize || row < 0 || row >= boardSize) return null;
      return { x: col, y: row };
    }
    return null;
  };

  const samePoint = (
    a: { x: number; y: number } | null,
    b: { x: number; y: number } | null
  ): boolean => (a?.x === b?.x && a?.y === b?.y);
  const editDragKey = (pt: { x: number; y: number }): string => `${pt.x},${pt.y}`;

  const tryPlayPoint = useCallback(
    (pt: { x: number; y: number }): boolean => {
      // KaTrain minimal_time_use enforcement in byo-yomi (Play mode only).
      const isAiTurn = isAiPlaying && aiColor === currentPlayer;
      const { timerPaused: isTimerPaused, timerMainTimeUsedSeconds } = useGameStore.getState();
      if (uiMode === 'play' && !isAiTurn && !isTimerPaused && currentNode.children.length === 0) {
        const mainSeconds = Math.max(0, Math.floor((settings.timerMainTimeMinutes ?? 0) * 60));
        const mainRemaining = mainSeconds - Math.max(0, timerMainTimeUsedSeconds ?? 0);
        const minUse = Math.max(0, Math.floor(settings.timerMinimalUseSeconds ?? 0));
        const used = Math.max(0, currentNode.timeUsedSeconds ?? 0);
        if (minUse > 0 && mainRemaining <= 0 && used < minUse) {
          toast(`Think for at least ${minUse} seconds before playing.`, 'info');
          clearPendingTap();
          return false;
        }
      }

      const beforeNodeId = useGameStore.getState().currentNode.id;
      playMove(pt.x, pt.y);
      const didMove = useGameStore.getState().currentNode.id !== beforeNodeId;
      if (didMove && settings.hapticFeedback) playStoneHaptic();
      clearPendingTap();
      return didMove;
    },
    [
      aiColor,
      clearPendingTap,
      currentNode.children.length,
      currentNode.timeUsedSeconds,
      currentPlayer,
      isAiPlaying,
      playMove,
      settings.hapticFeedback,
      settings.timerMainTimeMinutes,
      settings.timerMinimalUseSeconds,
      toast,
      uiMode,
    ]
  );

  const activateKeyboardCursor = useCallback(() => {
    setIsKeyboardCursorActive(true);
    setCursorPt((prev) => {
      const next = getInitialBoardKeyboardCursor(prev, boardSize);
      return samePoint(prev, next) ? prev : next;
    });
  }, [boardSize]);

  const handleBoardFocus = () => {
    activateKeyboardCursor();
  };

  const handleBoardBlur = () => {
    setIsKeyboardCursorActive(false);
  };

  const handleBoardKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;

    const movement: Record<string, [number, number] | undefined> = {
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
    };
    const delta = movement[event.key];
    if (delta) {
      event.preventDefault();
      event.stopPropagation();
      clearPendingTap();
      setIsKeyboardCursorActive(true);
      setCursorPt((prev) => moveBoardKeyboardCursor(prev, boardSize, delta[0], delta[1]));
      return;
    }

    if (event.key === 'Escape') {
      if (!isKeyboardCursorActive && !cursorPt) return;
      event.preventDefault();
      event.stopPropagation();
      clearPendingTap();
      setIsKeyboardCursorActive(false);
      setCursorPt(null);
      return;
    }

    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    event.stopPropagation();
    clearPendingTap();
    const pt = getInitialBoardKeyboardCursor(cursorPt, boardSize);
    setIsKeyboardCursorActive(true);
    setCursorPt(pt);

    if (scoringMode) {
      if (board[pt.y]?.[pt.x]) onToggleDeadStone?.(pt.x, pt.y);
      return;
    }
    if (isEditMode) {
      applyEditTool(pt.x, pt.y);
      return;
    }
    tryPlayPoint(pt);
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length !== 1) {
      cancelTouchGesture(true);
      return;
    }
    if (scoringMode || isEditMode || isSelectingRegionOfInterest) {
      swipeStartRef.current = null;
      return;
    }
    const touch = e.touches.item(0);
    if (!touch) return;
    swipeStartRef.current = { id: touch.identifier, x: touch.clientX, y: touch.clientY, time: Date.now() };
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length !== 1) cancelTouchGesture(true);
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length > 0) {
      cancelTouchGesture(true);
      return;
    }
    const start = swipeStartRef.current;
    swipeStartRef.current = null;
    if (!start) return;

    let endX: number | null = null;
    let endY: number | null = null;
    for (let i = 0; i < e.changedTouches.length; i++) {
      const candidate = e.changedTouches.item(i);
      if (candidate?.identifier === start.id) {
        endX = candidate.clientX;
        endY = candidate.clientY;
        break;
      }
    }
    if (endX == null || endY == null) {
      const fallback = e.changedTouches.item(0);
      if (!fallback) return;
      endX = fallback.clientX;
      endY = fallback.clientY;
    }

    const action = getHorizontalSwipeNavigationAction({
      startX: start.x,
      startY: start.y,
      endX,
      endY,
      startTimeMs: start.time,
      endTimeMs: Date.now(),
      isEditMode,
      isSelectingRegionOfInterest,
    });
    if (action) {
      e.preventDefault();
      e.stopPropagation();
      suppressNextClickRef.current = true;
      clearPendingTap();
      const beforeNodeId = useGameStore.getState().currentNode.id;
      if (action === 'next') navigateForward();
      else navigateBack();
      const didNavigate = useGameStore.getState().currentNode.id !== beforeNodeId;
      if (didNavigate && settings.hapticFeedback) playNavigationHaptic();
      return;
    }

    if (uiMode !== 'play' || scoringMode || isEditMode || isSelectingRegionOfInterest) return;

    const tapDistance = Math.hypot(endX - start.x, endY - start.y);
    e.preventDefault();
    e.stopPropagation();
    suppressNextClickRef.current = true;

    if (tapDistance > Math.max(10, cellSize * 0.35)) {
      clearPendingTap();
      return;
    }

    const pt = eventToInternal({ clientX: endX, clientY: endY, currentTarget: e.currentTarget });
    if (!pt || board[pt.y]?.[pt.x]) {
      clearPendingTap();
      return;
    }

    const confirmAction = getTapConfirmAction(pendingTap, pt, currentPlayer, Date.now());
    if (confirmAction.type === 'commit') {
      tryPlayPoint(pt);
      return;
    }

    setCursorPt(pt);
    setPendingTap(confirmAction.pending);
    schedulePendingTapClear();
  };

  const handleTouchCancel = () => {
    cancelTouchGesture(true);
  };

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (suppressNextClickRef.current) {
      suppressNextClickRef.current = false;
      return;
    }
    if (isSelectingRegionOfInterest) return;
    const pt = eventToInternal(e);
    if (!pt) return;

    if (scoringMode) {
      if (board[pt.y]?.[pt.x]) onToggleDeadStone?.(pt.x, pt.y);
      return;
    }

    if (isEditMode) {
      applyEditTool(pt.x, pt.y);
      return;
    }

    tryPlayPoint(pt);
  };

  const handleContextMenu = (e: React.MouseEvent<HTMLDivElement>) => {
    const pt = eventToInternal(e);
    if (!pt) return;
    e.preventDefault();
    e.stopPropagation();
    suppressNextClickRef.current = true;
    if (scoringMode || isSelectingRegionOfInterest) return;
    toggleBoardPointMarkup(pt.x, pt.y);
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;

    if (isEditMode && !scoringMode && !isSelectingRegionOfInterest) {
      const pt = eventToInternal(e);
      if (!pt) return;
      e.preventDefault();
      e.stopPropagation();
      suppressNextClickRef.current = true;
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // Ignore browsers that do not keep capture for this pointer.
      }
      setCursorPt(pt);
      editDragRef.current = { pointerId: e.pointerId, painted: new Set([editDragKey(pt)]) };
      applyEditTool(pt.x, pt.y);
      return;
    }

    if (!isSelectingRegionOfInterest) return;
    const pt = eventToInternal(e);
    if (!pt) return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    setRoiDrag({ start: pt, end: pt });
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const localX = e.clientX - rect.left;
    const localY = e.clientY - rect.top;
    const displayCol = Math.round((localX - originX) / cellSize);
    const displayRow = Math.round((localY - originY) / cellSize);
    let pt: { x: number; y: number } | null = null;
    if (displayCol >= 0 && displayCol < boardSize && displayRow >= 0 && displayRow < boardSize) {
      const internal = toInternal(displayCol, displayRow);
      if (internal.x >= 0 && internal.x < boardSize && internal.y >= 0 && internal.y < boardSize) {
        pt = internal;
      }
    }
    setCursorPt((prev) => (samePoint(prev, pt) ? prev : pt));
    if (scoringMode) {
      if (hoveredMove) onHoverMove(null);
      return;
    }
    const activeEditDrag = editDragRef.current;
    if (activeEditDrag?.pointerId === e.pointerId && isEditMode && !isSelectingRegionOfInterest) {
      if (pt) {
        const key = editDragKey(pt);
        if (!activeEditDrag.painted.has(key)) {
          activeEditDrag.painted.add(key);
          applyEditTool(pt.x, pt.y, { paintOnly: true });
        }
      }
      if (hoveredMove) onHoverMove(null);
      return;
    }
    if (!isSelectingRegionOfInterest) {
      if (canHoverAnalysisMove && hoverMoveMap && pt) {
        const move = hoverMoveMap.get(`${pt.x},${pt.y}`) ?? null;
        if (move) {
          const isBest = move.order === 0;
          const lowVisitsThreshold = Math.max(1, settings.trainerLowVisits);
          const uncertain =
            shouldShowHints && move.visits < lowVisitsThreshold && !isBest && !childMoveCoords.has(`${move.x},${move.y}`);
          const policyPrior = visibleAnalysis?.policy?.[move.y * boardSize + move.x] ?? move.prior ?? 0;
          const policyScale = policyPrior > 0.01 * 0.01 ? 0.95 : 0.5;
          const scale = shouldShowHints ? (uncertain ? UNCERTAIN_HINT_SCALE : HINT_SCALE) : HINT_SCALE * policyScale;
          const radius = cellSize * STONE_SIZE * scale;
          const d = toDisplay(move.x, move.y);
          const cx = originX + d.x * cellSize;
          const cy = originY + d.y * cellSize;
          const dx = localX - cx;
          const dy = localY - cy;
          const inHint = dx * dx + dy * dy <= radius * radius;
          if (inHint) {
            if (!hoveredMove || hoveredMove.x !== move.x || hoveredMove.y !== move.y) onHoverMove(move);
          } else if (hoveredMove) {
            onHoverMove(null);
          }
        } else if (hoveredMove) {
          onHoverMove(null);
        }
      } else if (hoveredMove) {
        onHoverMove(null);
      }
      return;
    }
    if (!roiDrag) return;
    if (!pt) return;
    setRoiDrag((prev) => {
      if (!prev) return prev;
      if (samePoint(prev.end, pt)) return prev;
      return { ...prev, end: pt };
    });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (editDragRef.current?.pointerId === e.pointerId) {
      editDragRef.current = null;
      suppressNextClickRef.current = true;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // Ignore.
      }
      return;
    }

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

  const handlePointerCancel = (e: React.PointerEvent<HTMLDivElement>) => {
    if (editDragRef.current?.pointerId === e.pointerId) {
      editDragRef.current = null;
    }
    if (roiDrag) setRoiDrag(null);
  };

  const handlePointerLeave = () => {
    setCursorPt(null);
    if (hoveredMove) onHoverMove(null);
  };

  const ownershipTexture = useMemo(() => {
    if (!scoringMode && (!hasAnalysisOverlay || !settings.analysisShowOwnership)) return null;
    if (!territory) return null;

    const width = boardSize + 2;
    const height = boardSize + 2;
    const bytes = new Uint8ClampedArray(width * height * 4);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const displayX = x - 1;
        const displayY = y - 1;

        const inBoard = displayX >= 0 && displayX < boardSize && displayY >= 0 && displayY < boardSize;
        const clampedDisplayX = Math.max(0, Math.min(displayX, boardSize - 1));
        const clampedDisplayY = Math.max(0, Math.min(displayY, boardSize - 1));
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
  }, [boardSize, hasAnalysisOverlay, scoringMode, settings.analysisShowOwnership, territory, toInternal]);

  useEffect(() => {
    const canvas = ownershipCanvasRef.current;
    if (!canvas || !ownershipTexture) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    canvas.width = ownershipTexture.width;
    canvas.height = ownershipTexture.height;
    ctx.putImageData(new ImageData(ownershipTexture.bytes, ownershipTexture.width, ownershipTexture.height), 0, 0);
  }, [ownershipTexture]);

  useEffect(() => {
    const canvas = evalCanvasRef.current;
    if (!canvas) return;
    const ctx = setupOverlayCanvas(canvas);
    if (!ctx) return;
    if (!isAnalysisMode || !settings.analysisShowEval || settings.showLastNMistakes === 0) return;
    void treeVersion;

    const dotImg = dotImageRef.current;
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

      if (!showEvalDotsForPlayer[move.player]) {
        realizedPointsLost = parentRealizedPointsLost(node);
        node = node.parent;
        count++;
        continue;
      }

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
        const cls = evaluationClass(pointsLost, evalThresholds, evalColors.length);
        if (settings.trainerShowDots?.[cls] === false) {
          realizedPointsLost = parentRealizedPointsLost(node);
          node = node.parent;
          count++;
          continue;
        }
        const color = rgba(evalColors[cls]!);
        let evalScale = 1;
        if (pointsLost && realizedPointsLost) {
          if (pointsLost <= 0.5 && realizedPointsLost <= 1.5) evalScale = 0;
          else evalScale = Math.min(1, Math.max(0, realizedPointsLost / pointsLost));
        }
        const evalRadius = Math.sqrt(Math.max(0, Math.min(1, evalScale)));
        const dotRadius = stoneRadius * (EVAL_DOT_MIN_SIZE + evalRadius * (EVAL_DOT_MAX_SIZE - EVAL_DOT_MIN_SIZE));
        const size = Math.max(2, 2 * dotRadius);
        const d = toDisplay(move.x, move.y);
        const cx = originX + d.x * cellSize;
        const cy = originY + d.y * cellSize;

        ctx.beginPath();
        ctx.arc(cx, cy, size / 2, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();

        if (dotImg && dotImg.complete && dotImg.naturalWidth > 0) {
          ctx.save();
          ctx.globalCompositeOperation = 'multiply';
          ctx.beginPath();
          ctx.arc(cx, cy, size / 2, 0, Math.PI * 2);
          ctx.clip();
          ctx.drawImage(dotImg, cx - size / 2, cy - size / 2, size, size);
          ctx.restore();
        }

        ctx.beginPath();
        ctx.arc(cx, cy, size / 2, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(0,0,0,0.25)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      realizedPointsLost = parentRealizedPointsLost(node);
      node = node.parent;
      count++;
    }
  }, [
    board,
    cellSize,
    currentNode,
    evalColors,
    evalThresholds,
    isAnalysisMode,
    originX,
    originY,
    settings.analysisShowEval,
    settings.showLastNMistakes,
    settings.trainerShowDots,
    setupOverlayCanvas,
    showEvalDotsForPlayer,
    toDisplay,
    dotTextureVersion,
    treeVersion,
  ]);

  useEffect(() => {
    const canvas = policyCanvasRef.current;
    if (!canvas) return;
    const ctx = setupOverlayCanvas(canvas);
    if (!ctx) return;
    if (!hasAnalysisOverlay || !settings.analysisShowPolicy) return;
    const policy = visibleAnalysis?.policy;
    if (!policy) return;

    let best = 0;
    for (let i = 0; i < boardSize * boardSize; i++) {
      const v = policy[i] ?? -1;
      if (v > best) best = v;
    }

    const textLb = 0.01 * 0.01;
    const stoneRadius = cellSize * STONE_SIZE;
    const bgRadius = stoneRadius * HINT_SCALE * 0.98;
    const fontSize = cellSize / 4;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font =
      `${fontSize}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace`;
    const moveMap = new Map<string, CandidateMove>();
    for (const move of visibleAnalysis.moves) {
      if (move.x >= 0 && move.y >= 0) moveMap.set(`${move.x},${move.y}`, move);
    }
    const heatmapMetric = settings.analysisPolicyMetric ?? 'policy';
    const sign = currentPlayer === 'black' ? 1 : -1;
    const getPolicyLabel = (x: number, y: number, p: number): string => {
      if (heatmapMetric === 'delta_score') {
        const move = moveMap.get(`${x},${y}`);
        return move ? formatLoss(-move.pointsLost, settings.trainerExtraPrecision) : '';
      }
      if (heatmapMetric === 'delta_winrate') {
        const move = moveMap.get(`${x},${y}`);
        if (!move) return '';
        const winRateLost = move.winRateLost ?? sign * (visibleAnalysis.rootWinRate - move.winRate);
        return formatDeltaWinrate(-winRateLost);
      }
      return `${(100 * p).toFixed(2)}`.slice(0, 4) + '%';
    };

    for (let y = 0; y < boardSize; y++) {
      for (let x = 0; x < boardSize; x++) {
        const p = policy[y * boardSize + x] ?? -1;
        if (p < 0) continue;
        const d = toDisplay(x, y);
        const polOrder = Math.max(0, 5 + Math.trunc(Math.log10(Math.max(1e-9, p - 1e-9))));
        const col = evalColors[Math.min(evalColors.length - 1, polOrder)]!;
        const labelRaw = getPolicyLabel(x, y, p);
        const showText = p > textLb && labelRaw.length > 0;
        const scale = showText ? 0.95 : 0.5;
        const coloredRadius = stoneRadius * HINT_SCALE * scale;
        const isBest = best > 0 && p === best;
        const cx = originX + d.x * cellSize;
        const cy = originY + d.y * cellSize;

        if (showText) {
          ctx.beginPath();
          ctx.arc(cx, cy, bgRadius, 0, Math.PI * 2);
          ctx.fillStyle = approxBoardColor;
          ctx.fill();
        }

        ctx.beginPath();
        ctx.arc(cx, cy, coloredRadius, 0, Math.PI * 2);
        ctx.fillStyle = rgba(col, 0.5);
        ctx.fill();
        if (isBest) {
          ctx.strokeStyle = rgba(TOP_MOVE_BORDER_COLOR, 0.5);
          ctx.lineWidth = 2;
          ctx.stroke();
        }

        if (showText) {
          ctx.fillStyle = 'black';
          ctx.fillText(labelRaw, cx, cy);
        }
      }
    }
  }, [
    approxBoardColor,
    boardSize,
    cellSize,
    evalColors,
    hasAnalysisOverlay,
    originX,
    originY,
    currentPlayer,
    settings.analysisPolicyMetric,
    settings.analysisShowPolicy,
    settings.trainerExtraPrecision,
    setupOverlayCanvas,
    toDisplay,
    visibleAnalysis,
  ]);

  useEffect(() => {
    const canvas = hintsCanvasRef.current;
    if (!canvas) return;
    const ctx = setupOverlayCanvas(canvas);
    if (!ctx) return;
    if (!shouldShowHints || !visibleAnalysis) return;

    const moves = visibleAnalysis.moves.filter((m) => m.x >= 0 && m.y >= 0);
    if (moves.length === 0) return;

    const topMoveImg = topMoveImageRef.current;
    const lowVisitsThreshold = Math.max(1, settings.trainerLowVisits);
    const primary = settings.trainerTopMovesShow;
    const secondary = settings.trainerTopMovesShowSecondary;
    const show = [primary, secondary].filter((opt) => opt !== 'top_move_nothing');
    const showText = show.length > 0;
    const sign = currentPlayer === 'black' ? 1 : -1;
    const stoneRadius = cellSize * STONE_SIZE;
    const fontFamily =
      'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';
    const baseFontSize = 10;
    const subFontSize = 9;

    const getLabel = (move: CandidateMove, opt: typeof primary): string => {
      switch (opt) {
        case 'top_move_delta_score':
          return formatLoss(-move.pointsLost, settings.trainerExtraPrecision);
        case 'top_move_score':
          return formatScore(sign * move.scoreLead);
        case 'top_move_winrate': {
          const playerWinRate = currentPlayer === 'black' ? move.winRate : 1 - move.winRate;
          return formatWinrate(playerWinRate);
        }
        case 'top_move_delta_winrate': {
          const winRateLost = move.winRateLost ?? sign * (visibleAnalysis.rootWinRate - move.winRate);
          return formatDeltaWinrate(-winRateLost);
        }
        case 'top_move_visits':
          return formatVisits(move.visits);
        case 'top_move_nothing':
          return '';
      }
    };

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (const move of moves) {
      const d = toDisplay(move.x, move.y);
      const isBest = move.order === 0;
      const uncertain = move.visits < lowVisitsThreshold && !isBest && !childMoveCoords.has(`${move.x},${move.y}`);
      const scale = uncertain ? UNCERTAIN_HINT_SCALE : HINT_SCALE;
      const textOn = !uncertain && showText;
      const alpha = uncertain ? HINTS_LO_ALPHA : HINTS_ALPHA;
      if (scale <= 0) continue;

      const cls = evaluationClass(move.pointsLost, evalThresholds, evalColors.length);
      const col = evalColors[cls]!;
      const bg = rgba(col, alpha);

      const evalSize = stoneRadius * scale;
      const size = 2 * evalSize;
      const cx = originX + d.x * cellSize;
      const cy = originY + d.y * cellSize;
      const left = cx - evalSize;
      const top = cy - evalSize;

      if (textOn) {
        ctx.beginPath();
        ctx.arc(cx, cy, evalSize * 0.98, 0, Math.PI * 2);
        ctx.fillStyle = approxBoardColor;
        ctx.fill();
      }

      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, evalSize, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillStyle = bg;
      ctx.fill();
      if (topMoveImg && topMoveImg.complete && topMoveImg.naturalWidth > 0) {
        ctx.globalCompositeOperation = 'multiply';
        ctx.drawImage(topMoveImg, left, top, size, size);
      }
      ctx.restore();

      if (isBest) {
        ctx.beginPath();
        ctx.arc(cx, cy, evalSize - 1, 0, Math.PI * 2);
        ctx.strokeStyle = rgba(TOP_MOVE_BORDER_COLOR);
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      if (textOn) {
        ctx.fillStyle = HINT_TEXT_COLOR;
        if (show.length === 1) {
          ctx.font = `700 ${baseFontSize}px ${fontFamily}`;
          ctx.fillText(getLabel(move, show[0] as typeof primary), cx, cy);
        } else {
          ctx.font = `700 ${baseFontSize}px ${fontFamily}`;
          ctx.fillText(getLabel(move, show[0] as typeof primary), cx, cy - baseFontSize * 0.35);
          ctx.font = `700 ${subFontSize}px ${fontFamily}`;
          ctx.globalAlpha = 0.9;
          ctx.fillText(getLabel(move, show[1] as typeof primary), cx, cy + subFontSize * 0.55);
          ctx.globalAlpha = 1;
        }
      }
    }
  }, [
    approxBoardColor,
    cellSize,
    childMoveCoords,
    currentPlayer,
    evalColors,
    evalThresholds,
    originX,
    originY,
    settings.trainerExtraPrecision,
    settings.trainerLowVisits,
    settings.trainerTopMovesShow,
    settings.trainerTopMovesShowSecondary,
    setupOverlayCanvas,
    shouldShowHints,
    topMoveTextureVersion,
    toDisplay,
    visibleAnalysis,
  ]);

  const pvMoves = useMemo(() => {
    const pv = hoveredMove?.pv;
    if (!pvOverlayEnabled || !pv || pv.length === 0) return [];

    const upToMove = typeof pvUpToMove === 'number' ? pvUpToMove : pv.length;
    const opp: typeof currentPlayer = currentPlayer === 'black' ? 'white' : 'black';
    const moves: Array<{ x: number; y: number; player: typeof currentPlayer; idx: number }> = [];
    for (let i = 0; i < pv.length; i++) {
      if (i > upToMove) break;
      const m = parseGtpMove(pv[i]!, boardSize);
      if (!m || m.kind !== 'move') continue;
      const d = toDisplay(m.x, m.y);
      moves.push({ x: d.x, y: d.y, player: i % 2 === 0 ? currentPlayer : opp, idx: i + 1 });
    }
    return moves;
  }, [boardSize, hoveredMove, pvOverlayEnabled, pvUpToMove, currentPlayer, toDisplay]);

  useEffect(() => {
    const canvas = pvCanvasRef.current;
    const container = boardSnapshotRef.current ?? containerRef.current;
    if (!canvas) return;
    const ctx = setupOverlayCanvas(canvas);
    if (!ctx) return;
    if (!pvOverlayEnabled || pvMoves.length === 0) {
      if (container) {
        container.dataset.pvRendered = String(Date.now());
        container.dataset.pvCount = '0';
      }
      return;
    }

    const blackImages = stoneImagesRef.current.black;
    const whiteImages = stoneImagesRef.current.white;
    const stoneRadius = cellSize * STONE_SIZE;
    const size = 2 * stoneRadius + 1;
    const fontSize = cellSize / 1.45;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `bold ${fontSize}px sans-serif`;

    for (const m of pvMoves) {
      const left = originX + m.x * cellSize - stoneRadius - 1;
      const top = originY + m.y * cellSize - stoneRadius;
      const imageList = m.player === 'black' ? blackImages : whiteImages;
      const img = imageList[0];
      if (img && img.complete && img.naturalWidth > 0) {
        ctx.drawImage(img, left, top, size, size);
      } else {
        ctx.beginPath();
        ctx.fillStyle = rgba(m.player === 'black' ? STONE_COLORS.black : STONE_COLORS.white);
        ctx.arc(left + size / 2, top + size / 2, stoneRadius, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.fillStyle = m.player === 'black' ? 'white' : 'black';
      ctx.fillText(String(m.idx), left + size / 2, top + size / 2);
    }
    if (container) {
      container.dataset.pvRendered = String(Date.now());
      container.dataset.pvCount = String(pvMoves.length);
    }
  }, [
    cellSize,
    pvOverlayEnabled,
    originX,
    originY,
    pvMoves,
    setupOverlayCanvas,
    stoneTextureVersion,
  ]);

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

  const passCircle = useMemo(() => {
    const m = lastMove;
    if (!m || m.x >= 0 || m.y >= 0) return null;
    const cx = originX + ((boardSize - 1) / 2) * cellSize;
    const cy = originY + ((boardSize - 1) / 2) * cellSize;
    const size = Math.min(boardWidth, boardHeight) * 0.227;
    return { cx, cy, size };
  }, [boardHeight, boardWidth, boardSize, cellSize, lastMove, originX, originY]);

  const pendingTapMarker = useMemo(() => {
    if (!pendingTap) return null;
    if (pendingTap.player !== currentPlayer) return null;
    if (board[pendingTap.y]?.[pendingTap.x]) return null;
    const d = toDisplay(pendingTap.x, pendingTap.y);
    const size = Math.max(22, Math.min(34, cellSize * 0.72));
    return {
      left: originX + d.x * cellSize + cellSize * 0.18,
      top: originY + d.y * cellSize - cellSize * 0.82,
      size,
    };
  }, [board, cellSize, currentPlayer, originX, originY, pendingTap, toDisplay]);

  const keyboardCursorMarker = useMemo(() => {
    if (!isKeyboardCursorActive || !cursorPt) return null;
    const d = toDisplay(cursorPt.x, cursorPt.y);
    const size = Math.max(16, cellSize * 0.7);
    return {
      left: originX + d.x * cellSize - size / 2,
      top: originY + d.y * cellSize - size / 2,
      size,
    };
  }, [cellSize, cursorPt, isKeyboardCursorActive, originX, originY, toDisplay]);
  const boardTouchAction = isEditMode || scoringMode || isSelectingRegionOfInterest ? 'none' : 'pan-x pan-y pinch-zoom';
  const boardQaString = useMemo(() => boardToQaString(board), [board]);
  const boardStoneCount = useMemo(() => countBoardStones(board), [board]);

  return (
    <div ref={containerRef} className="w-full h-full min-w-0 max-w-full overflow-hidden flex items-center justify-center">
      <div
        className={[
          'relative shadow-lg rounded-sm select-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ui-accent)]',
          isEditMode || scoringMode ? 'cursor-crosshair' : 'cursor-pointer',
        ].join(' ')}
        data-board-snapshot="true"
        data-board-theme={settings.boardTheme}
        data-board-size={boardSize}
        data-board-cell-size={cellSize}
        data-board-origin-x={originX}
        data-board-origin-y={originY}
        data-board-move-count={moveHistory.length}
        data-board-current-player={currentPlayer}
        data-board-stone-count={boardStoneCount}
        data-board-stones={boardQaString}
        ref={boardSnapshotRef}
        style={{
          width: boardWidth,
          height: boardHeight,
          backgroundColor: boardColor,
          backgroundImage: boardTexture ? `url('${boardTexture}')` : undefined,
          backgroundSize: boardTexture ? '100% 100%' : undefined,
          backgroundRepeat: boardTexture ? 'no-repeat' : undefined,
          overflow: 'hidden',
          touchAction: boardTouchAction,
        }}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onPointerLeave={handlePointerLeave}
        onFocus={handleBoardFocus}
        onBlur={handleBoardBlur}
        onKeyDown={handleBoardKeyDown}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchCancel}
        onWheel={handleWheel}
        tabIndex={0}
        aria-label="Go board"
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
            {Array.from({ length: boardSize }).map((_, i) => (
              <div
                key={`bottom-${i}`}
                className="absolute font-bold tracking-tight opacity-80"
                style={{
                  left: originX + i * cellSize,
                  top: originY + (boardSize - 1) * cellSize + coordOffset,
                  transform: 'translate(-50%, -50%)',
                  fontSize: cellSize > 20 ? cellSize / 1.5 : cellSize / 1.2,
                  color: labelColor,
                  textAlign: 'center',
                  zIndex: 4,
                }}
              >
                {getXCoordinateText(i)}
              </div>
            ))}
            {/* Left Labels (KaTrain draws y coords at the left edge) */}
            {Array.from({ length: boardSize }).map((_, i) => (
              <div
                key={`left-${i}`}
                className="absolute font-bold tracking-tight opacity-80"
                style={{
                  left: originX - coordOffset,
                  top: originY + i * cellSize,
                  transform: 'translate(-50%, -50%)',
                  fontSize: cellSize > 20 ? cellSize / 1.5 : cellSize / 1.2,
                  color: labelColor,
                  textAlign: 'center',
                  zIndex: 4,
                }}
              >
                {getYCoordinateText(i)}
              </div>
            ))}
          </>
        )}


        {/* Grid + Hoshi */}
        <canvas
          ref={gridCanvasRef}
          className="absolute pointer-events-none"
          style={{
            left: 0,
            top: 0,
            width: boardWidth,
            height: boardHeight,
            zIndex: 2,
          }}
        />

        {/* Ownership / Territory Overlay (KaTrain-style) */}
        {ownershipTexture && (
          <canvas
            ref={ownershipCanvasRef}
            className="absolute pointer-events-none"
            style={{
              left: originX - cellSize * 1.5,
              top: originY - cellSize * 1.5,
              width: cellSize * (boardSize + 2),
              height: cellSize * (boardSize + 2),
              zIndex: 3,
            }}
          />
        )}

        {/* Ghost Stones */}
        <canvas
          ref={ghostCanvasRef}
          className="absolute pointer-events-none"
          style={{
            left: 0,
            top: 0,
            width: boardWidth,
            height: boardHeight,
            zIndex: 5,
          }}
        />

        {pendingTapMarker && (
          <div
            className="absolute pointer-events-none grid place-items-center rounded-full border border-white/75 bg-emerald-500 text-white shadow-[0_8px_20px_rgba(0,0,0,0.35)]"
            data-tap-confirm="true"
            aria-hidden="true"
            style={{
              left: pendingTapMarker.left,
              top: pendingTapMarker.top,
              width: pendingTapMarker.size,
              height: pendingTapMarker.size,
              zIndex: 22,
            }}
          >
            <FaCheck size={Math.max(10, pendingTapMarker.size * 0.48)} aria-hidden="true" />
          </div>
        )}

        {keyboardCursorMarker && (
          <div
            className="absolute pointer-events-none rounded-full border-2 border-[var(--ui-accent)] shadow-[0_0_0_2px_rgba(0,0,0,0.35),0_0_18px_rgba(34,197,94,0.45)]"
            data-board-keyboard-cursor="true"
            aria-hidden="true"
            style={{
              left: keyboardCursorMarker.left,
              top: keyboardCursorMarker.top,
              width: keyboardCursorMarker.size,
              height: keyboardCursorMarker.size,
              zIndex: 23,
            }}
          />
        )}

        {/* Policy Overlay (KaTrain-style) */}
        <canvas
          ref={policyCanvasRef}
          className="absolute pointer-events-none"
          style={{
            left: 0,
            top: 0,
            width: boardWidth,
            height: boardHeight,
            zIndex: 16,
          }}
        />

        {/* Stones */}
        <canvas
          ref={stonesCanvasRef}
          className="absolute pointer-events-none"
          style={{
            left: 0,
            top: 0,
            width: boardWidth,
            height: boardHeight,
            zIndex: 8,
          }}
        />

        {/* SGF Markers and Labels */}
        <canvas
          ref={markupCanvasRef}
          className="absolute pointer-events-none"
          style={{
            left: 0,
            top: 0,
            width: boardWidth,
            height: boardHeight,
            zIndex: 15,
          }}
        />

        {/* Evaluation Dots (KaTrain-style) */}
        <canvas
          ref={evalCanvasRef}
          className="absolute pointer-events-none"
          style={{
            left: 0,
            top: 0,
            width: boardWidth,
            height: boardHeight,
            zIndex: 12,
          }}
        />

        {/* Last Move Marker (KaTrain-style) */}
        <canvas
          ref={lastMoveCanvasRef}
          className="absolute pointer-events-none"
          style={{
            left: 0,
            top: 0,
            width: boardWidth,
            height: boardHeight,
            zIndex: 13,
          }}
        />

        {/* PV Overlay (Hover) */}
        <canvas
          ref={pvCanvasRef}
          className="absolute pointer-events-none"
          style={{
            left: 0,
            top: 0,
            width: boardWidth,
            height: boardHeight,
            zIndex: 20,
          }}
        />

        {/* Children Overlay (Q) */}
        <canvas
          ref={ringsCanvasRef}
          className="absolute pointer-events-none"
          style={{
            left: 0,
            top: 0,
            width: boardWidth,
            height: boardHeight,
            zIndex: 14,
          }}
        />

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
        <canvas
          ref={hintsCanvasRef}
          className="absolute pointer-events-none"
          style={{
            left: 0,
            top: 0,
            width: boardWidth,
            height: boardHeight,
            zIndex: 16,
          }}
        />

        {/* Tooltip */}
        {hasAnalysisOverlay && hoveredMove && hoveredMove.x >= 0 && hoveredMove.y >= 0 && (
          (() => {
            const d = toDisplay(hoveredMove.x, hoveredMove.y);
            const anchorX = originX + d.x * cellSize;
            const anchorY = originY + d.y * cellSize;
            const tooltipPlacement = getBoardTooltipPlacement({
              anchorX,
              anchorY,
              boardWidth,
              boardHeight,
              cellSize,
            });
            return (
              <div
                className="absolute z-20 bg-[var(--ui-panel)] text-[var(--ui-text)] text-xs p-2 rounded-lg shadow-xl pointer-events-none border border-[var(--ui-border-strong)]"
                style={{
                  left: tooltipPlacement.left,
                  top: tooltipPlacement.top,
                  transform: tooltipPlacement.transform,
                  minWidth: tooltipPlacement.minWidth,
                  maxWidth: tooltipPlacement.maxWidth,
                }}
              >
                <div className="font-bold mb-1">Move: {formatBoardMoveLabel(hoveredMove, boardSize)}</div>
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
