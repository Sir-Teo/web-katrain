import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { shallow } from 'zustand/shallow';
import { useGameStore } from '../store/gameStore';
import { BOARD_SIZE, type CandidateMove, type GameNode } from '../types';
import { parseGtpMove } from '../lib/gtp';
import { getKaTrainEvalColors } from '../utils/katrainTheme';
import { publicUrl } from '../utils/publicUrl';
import { getBoardTheme } from '../utils/boardThemes';

const KATRAN_EVAL_THRESHOLDS = [12, 6, 3, 1.5, 0.5, 0] as const;
const HOSHI_POINTS_19 = [
  [3, 3], [3, 9], [3, 15],
  [9, 3], [9, 9], [9, 15],
  [15, 3], [15, 9], [15, 15],
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
}

export const GoBoard: React.FC<GoBoardProps> = ({ hoveredMove, onHoverMove, pvUpToMove, uiMode, forcePvOverlay = false }) => {
  const {
    board,
    playMove,
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
    isAiPlaying,
    aiColor,
    treeVersion,
  } = useGameStore(
    (state) => ({
      board: state.board,
      playMove: state.playMove,
      moveHistory: state.moveHistory,
      analysisData: state.analysisData,
      isAnalysisMode: state.isAnalysisMode,
      currentPlayer: state.currentPlayer,
      settings: state.settings,
      currentNode: state.currentNode,
      boardRotation: state.boardRotation,
      regionOfInterest: state.regionOfInterest,
      isSelectingRegionOfInterest: state.isSelectingRegionOfInterest,
      setRegionOfInterest: state.setRegionOfInterest,
      isAiPlaying: state.isAiPlaying,
      aiColor: state.aiColor,
      treeVersion: state.treeVersion,
    }),
    shallow
  );
  const pvOverlayEnabled = isAnalysisMode || forcePvOverlay;

  const containerRef = useRef<HTMLDivElement>(null);
  const boardSnapshotRef = useRef<HTMLDivElement>(null);
  const gridCanvasRef = useRef<HTMLCanvasElement>(null);
  const ownershipCanvasRef = useRef<HTMLCanvasElement>(null);
  const ghostCanvasRef = useRef<HTMLCanvasElement>(null);
  const stonesCanvasRef = useRef<HTMLCanvasElement>(null);
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

  const childMoveRings = useMemo(() => {
    if (!isAnalysisMode || !settings.analysisShowChildren) return [];
    return currentNode.children
      .map((c) => c.move)
      .filter((m): m is NonNullable<typeof m> => !!m && m.x >= 0 && m.y >= 0);
  }, [currentNode, isAnalysisMode, settings.analysisShowChildren]);

  const bestHintMoveCoords = useMemo(() => {
    if (!isAnalysisMode || !settings.analysisShowHints || settings.analysisShowPolicy) return null;
    const best = analysisData?.moves.find((m) => m.order === 0 && m.x >= 0 && m.y >= 0);
    return best ? { x: best.x, y: best.y } : null;
  }, [analysisData, isAnalysisMode, settings.analysisShowHints, settings.analysisShowPolicy]);

  const analysisTerritory =
    analysisData && (analysisData.ownershipMode ?? 'root') !== 'none' ? analysisData.territory : null;
  const parentTerritory =
    currentNode.parent?.analysis && (currentNode.parent.analysis.ownershipMode ?? 'root') !== 'none'
      ? currentNode.parent.analysis.territory
      : null;
  const territory = analysisTerritory ?? parentTerritory ?? null;
  const shouldShowHints = isAnalysisMode && !!analysisData && settings.analysisShowHints && !settings.analysisShowPolicy;
  const hintMoveMap = useMemo(() => {
    if (!shouldShowHints || !analysisData) return null;
    const map = new Map<string, CandidateMove>();
    for (const move of analysisData.moves) {
      if (move.x < 0 || move.y < 0) continue;
      map.set(`${move.x},${move.y}`, move);
    }
    return map;
  }, [analysisData, shouldShowHints]);

  const [roiDrag, setRoiDrag] = useState<{ start: { x: number; y: number }; end: { x: number; y: number } } | null>(
    null
  );
  const [cursorPt, setCursorPt] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!shouldShowHints && hoveredMove) onHoverMove(null);
  }, [hoveredMove, onHoverMove, shouldShowHints]);

  useEffect(() => {
    const canvas = gridCanvasRef.current;
    if (!canvas) return;
    const ctx = setupOverlayCanvas(canvas);
    if (!ctx) return;

    const startX = originX;
    const startY = originY;
    const endX = originX + cellSize * (BOARD_SIZE - 1);
    const endY = originY + cellSize * (BOARD_SIZE - 1);
    ctx.lineWidth = 1;
    ctx.strokeStyle = lineColor;
    ctx.beginPath();
    for (let i = 0; i < BOARD_SIZE; i++) {
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
    for (const [hx, hy] of HOSHI_POINTS_19) {
      const d = toDisplay(hx, hy);
      const cx = originX + d.x * cellSize;
      const cy = originY + d.y * cellSize;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }, [cellSize, lineColor, originX, originY, setupOverlayCanvas, toDisplay]);

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

    for (let y = 0; y < BOARD_SIZE; y++) {
      for (let x = 0; x < BOARD_SIZE; x++) {
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
        const left = cx - radius + offsetX;
        const top = cy - radius + offsetY;

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
          ctx.arc(cx, cy, radius, 0, Math.PI * 2);
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
          const markLeft = cx - markSize / 2;
          const markTop = cy - markSize / 2;
          ctx.fillRect(markLeft, markTop, markSize, markSize);
          ctx.strokeRect(markLeft, markTop, markSize, markSize);
        }

        if (settings.showMoveNumbers && moveNumber != null) {
          ctx.fillStyle = 'rgba(217,173,102,0.8)';
          ctx.fillText(String(moveNumber), cx, cy);
        }
      }
    }
  }, [
    board,
    boardTheme,
    cellSize,
    isAnalysisMode,
    moveNumbers,
    originX,
    originY,
    settings.analysisShowOwnership,
    settings.showMoveNumbers,
    setupOverlayCanvas,
    stoneTextureVersion,
    territory,
    toDisplay,
  ]);

  useEffect(() => {
    const canvas = ghostCanvasRef.current;
    if (!canvas) return;
    const ctx = setupOverlayCanvas(canvas);
    if (!ctx) return;
    if (isSelectingRegionOfInterest) return;

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

    if (cursorPt && !board[cursorPt.y]?.[cursorPt.x]) {
      drawGhost(cursorPt.x, cursorPt.y, currentPlayer, 0.6);
    }

    if (pvOverlayEnabled && hoveredMove && (!hoveredMove.pv || hoveredMove.pv.length === 0)) {
      if (hoveredMove.x >= 0 && hoveredMove.y >= 0) {
        drawGhost(hoveredMove.x, hoveredMove.y, currentPlayer, 0.6);
      }
    }

    if (settings.showNextMovePreview) {
      const nextMove = currentNode.children[0]?.move;
      if (nextMove && nextMove.x >= 0 && nextMove.y >= 0 && !board[nextMove.y]?.[nextMove.x]) {
        drawGhost(nextMove.x, nextMove.y, nextMove.player, 0.35);
      }
    }
  }, [
    board,
    cellSize,
    cursorPt,
    currentPlayer,
    hoveredMove,
    isAnalysisMode,
    isSelectingRegionOfInterest,
    originX,
    originY,
    setupOverlayCanvas,
    stoneTextureVersion,
    toDisplay,
    boardTheme,
    currentNode,
    settings.showNextMovePreview,
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
    if (!isAnalysisMode || !settings.analysisShowChildren) return;
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
    isAnalysisMode,
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
    const { timerPaused: isTimerPaused, timerMainTimeUsedSeconds } = useGameStore.getState();
    if (uiMode === 'play' && !isAiTurn && !isTimerPaused && currentNode.children.length === 0) {
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
    const rect = e.currentTarget.getBoundingClientRect();
    const localX = e.clientX - rect.left;
    const localY = e.clientY - rect.top;
    const displayCol = Math.round((localX - originX) / cellSize);
    const displayRow = Math.round((localY - originY) / cellSize);
    let pt: { x: number; y: number } | null = null;
    if (displayCol >= 0 && displayCol < BOARD_SIZE && displayRow >= 0 && displayRow < BOARD_SIZE) {
      const internal = toInternal(displayCol, displayRow);
      if (internal.x >= 0 && internal.x < BOARD_SIZE && internal.y >= 0 && internal.y < BOARD_SIZE) {
        pt = internal;
      }
    }
    setCursorPt(pt);
    if (!isSelectingRegionOfInterest) {
      if (shouldShowHints && hintMoveMap && pt) {
        const move = hintMoveMap.get(`${pt.x},${pt.y}`) ?? null;
        if (move) {
          const isBest = move.order === 0;
          const lowVisitsThreshold = Math.max(1, settings.trainerLowVisits);
          const uncertain = move.visits < lowVisitsThreshold && !isBest && !childMoveCoords.has(`${move.x},${move.y}`);
          const scale = uncertain ? UNCERTAIN_HINT_SCALE : HINT_SCALE;
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

  const handlePointerLeave = () => {
    setCursorPt(null);
    if (hoveredMove) onHoverMove(null);
  };

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
    if (!isAnalysisMode || !settings.analysisShowPolicy) return;
    const policy = analysisData?.policy;
    if (!policy) return;

    let best = 0;
    for (let i = 0; i < BOARD_SIZE * BOARD_SIZE; i++) {
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

    for (let y = 0; y < BOARD_SIZE; y++) {
      for (let x = 0; x < BOARD_SIZE; x++) {
        const p = policy[y * BOARD_SIZE + x] ?? -1;
        if (p < 0) continue;
        const d = toDisplay(x, y);
        const polOrder = Math.max(0, 5 + Math.trunc(Math.log10(Math.max(1e-9, p - 1e-9))));
        const col = evalColors[Math.min(evalColors.length - 1, polOrder)]!;
        const showText = p > textLb;
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
          const labelRaw = `${(100 * p).toFixed(2)}`.slice(0, 4) + '%';
          ctx.fillStyle = 'black';
          ctx.fillText(labelRaw, cx, cy);
        }
      }
    }
  }, [
    analysisData,
    approxBoardColor,
    cellSize,
    evalColors,
    isAnalysisMode,
    originX,
    originY,
    settings.analysisShowPolicy,
    setupOverlayCanvas,
    toDisplay,
  ]);

  useEffect(() => {
    const canvas = hintsCanvasRef.current;
    if (!canvas) return;
    const ctx = setupOverlayCanvas(canvas);
    if (!ctx) return;
    if (!shouldShowHints || !analysisData) return;

    const moves = analysisData.moves.filter((m) => m.x >= 0 && m.y >= 0);
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
          const winRateLost = move.winRateLost ?? sign * (analysisData.rootWinRate - move.winRate);
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
    analysisData,
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
  ]);

  const pvMoves = useMemo(() => {
      const pv = hoveredMove?.pv;
      if (!pvOverlayEnabled || !pv || pv.length === 0) return [];

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
  }, [hoveredMove, pvOverlayEnabled, pvUpToMove, currentPlayer, toDisplay]);

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
    const cx = originX + ((BOARD_SIZE - 1) / 2) * cellSize;
    const cy = originY + ((BOARD_SIZE - 1) / 2) * cellSize;
    const size = Math.min(boardWidth, boardHeight) * 0.227;
    return { cx, cy, size };
  }, [boardHeight, boardWidth, cellSize, lastMove, originX, originY]);

  return (
    <div ref={containerRef} className="w-full h-full flex items-center justify-center">
      <div
        className="relative shadow-lg rounded-sm cursor-pointer select-none"
        data-board-snapshot="true"
        ref={boardSnapshotRef}
        style={{
            width: boardWidth,
            height: boardHeight,
            backgroundColor: boardColor,
            backgroundImage: boardTexture ? `url('${boardTexture}')` : undefined,
            backgroundSize: boardTexture ? '100% 100%' : undefined,
            backgroundRepeat: boardTexture ? 'no-repeat' : undefined,
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
                    zIndex: 4,
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
            width: cellSize * (BOARD_SIZE + 2),
            height: cellSize * (BOARD_SIZE + 2),
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
      {isAnalysisMode && hoveredMove && hoveredMove.x >= 0 && hoveredMove.y >= 0 && (
         (() => {
           const d = toDisplay(hoveredMove.x, hoveredMove.y);
           return (
         <div
             className="absolute z-20 bg-slate-900 text-white text-xs p-2 rounded shadow-lg pointer-events-none border border-slate-700/50"
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
