import type { GameNode, Player } from '../types';

export type MoveTreeLayoutItem = {
  id: string;
  parentId: string | null;
  label: string;
  player: Player | null;
  isRoot: boolean;
  autoUndo: boolean;
};

export type MoveTreeLayoutNode = MoveTreeLayoutItem & {
  gridX: number;
  gridY: number;
  x: number;
  y: number;
};

export type MoveTreeLayoutEdge = {
  id: string;
  fromId: string;
  toId: string;
  points: string;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
};

export type MoveTreeLayout = {
  nodes: MoveTreeLayoutNode[];
  edges: MoveTreeLayoutEdge[];
  width: number;
  height: number;
  radius: number;
  xStep: number;
  yStep: number;
  margin: number;
};

export type MoveTreeLayoutDirection = 'horizontal' | 'vertical';

export type MoveTreeViewport = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type MoveTreeMinimapRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type MoveTreeMinimapTransform = {
  scale: number;
  renderedWidth: number;
  renderedHeight: number;
  offsetX: number;
  offsetY: number;
};

export const MOVE_TREE_LAYOUT_WORKER_THRESHOLD = 240;

const NODE_RADIUS = 6;
const X_STEP = 22;
const Y_STEP = 18;
const MARGIN = 12;

export function moveTreeNodeLabel(node: GameNode): string {
  const move = node.move;
  if (!move) return 'Root';
  if (move.x < 0 || move.y < 0) return 'Pass';
  const boardSize = node.gameState.board.length;
  const col = String.fromCharCode(65 + (move.x >= 8 ? move.x + 1 : move.x));
  const row = boardSize - move.y;
  return `${col}${row}`;
}

export function flattenMoveTree(root: GameNode): MoveTreeLayoutItem[] {
  const items: MoveTreeLayoutItem[] = [];
  const stack: GameNode[] = [root];

  while (stack.length > 0) {
    const node = stack.pop()!;
    const move = node.move;
    items.push({
      id: node.id,
      parentId: node.parent?.id ?? null,
      label: moveTreeNodeLabel(node),
      player: move?.player ?? null,
      isRoot: !move,
      autoUndo: node.autoUndo === true,
    });

    for (let i = node.children.length - 1; i >= 0; i--) {
      stack.push(node.children[i]!);
    }
  }

  return items;
}

export function computeMoveTreeLayout(
  items: MoveTreeLayoutItem[],
  direction: MoveTreeLayoutDirection = 'horizontal'
): MoveTreeLayout {
  const grid = new Map<string, { x: number; y: number }>();
  const nextY = new Map<number, number>();
  const getNextY = (x: number) => nextY.get(x) ?? 0;
  const nodes: MoveTreeLayoutNode[] = [];
  let maxX = 0;
  let maxY = 0;

  for (const item of items) {
    let gridX = 0;
    let gridY = 0;

    if (item.parentId) {
      const parentPos = grid.get(item.parentId);
      if (!parentPos) continue;
      gridX = parentPos.x + 1;
      gridY = Math.max(getNextY(gridX), parentPos.y);
      nextY.set(gridX, gridY + 1);
      nextY.set(gridX - 1, Math.max(nextY.get(gridX) ?? 0, getNextY(gridX - 1)));
    }

    grid.set(item.id, { x: gridX, y: gridY });
    maxX = Math.max(maxX, gridX);
    maxY = Math.max(maxY, gridY);
    nodes.push({
      ...item,
      gridX,
      gridY,
      x: MARGIN + (direction === 'horizontal' ? gridX * X_STEP : gridY * Y_STEP) + NODE_RADIUS,
      y: MARGIN + (direction === 'horizontal' ? gridY * Y_STEP : gridX * X_STEP) + NODE_RADIUS,
    });
  }

  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const edges: MoveTreeLayoutEdge[] = [];
  for (const node of nodes) {
    if (!node.parentId) continue;
    const parent = nodeById.get(node.parentId);
    if (!parent) continue;
    const minX = Math.min(parent.x, node.x);
    const maxXEdge = Math.max(parent.x, node.x);
    const minY = Math.min(parent.y, node.y);
    const maxYEdge = Math.max(parent.y, node.y);
    edges.push({
      id: `${parent.id}->${node.id}`,
      fromId: parent.id,
      toId: node.id,
      points:
        direction === 'horizontal'
          ? `${parent.x},${parent.y} ${parent.x},${node.y} ${node.x},${node.y}`
          : `${parent.x},${parent.y} ${node.x},${parent.y} ${node.x},${node.y}`,
      minX,
      maxX: maxXEdge,
      minY,
      maxY: maxYEdge,
    });
  }

  return {
    nodes,
    edges,
    width: MARGIN * 2 + (direction === 'horizontal' ? maxX * X_STEP : maxY * Y_STEP) + NODE_RADIUS * 2 + 8,
    height: MARGIN * 2 + (direction === 'horizontal' ? maxY * Y_STEP : maxX * X_STEP) + NODE_RADIUS * 2 + 8,
    radius: NODE_RADIUS,
    xStep: direction === 'horizontal' ? X_STEP : Y_STEP,
    yStep: direction === 'horizontal' ? Y_STEP : X_STEP,
    margin: MARGIN,
  };
}

export function getVisibleMoveTreeItems(
  layout: MoveTreeLayout,
  viewport: MoveTreeViewport,
  overscan = 96
): { nodes: MoveTreeLayoutNode[]; edges: MoveTreeLayoutEdge[] } {
  const left = Math.max(0, viewport.left - overscan);
  const top = Math.max(0, viewport.top - overscan);
  const right = viewport.left + viewport.width + overscan;
  const bottom = viewport.top + viewport.height + overscan;

  const nodes = layout.nodes.filter((node) => {
    const r = layout.radius + 8;
    return node.x + r >= left && node.x - r <= right && node.y + r >= top && node.y - r <= bottom;
  });

  const edges = layout.edges.filter(
    (edge) => edge.maxX >= left && edge.minX <= right && edge.maxY >= top && edge.minY <= bottom
  );

  return { nodes, edges };
}

export function getMoveTreeMinimapViewportRect(
  layout: Pick<MoveTreeLayout, 'width' | 'height'>,
  viewport: MoveTreeViewport,
  minimap: { width: number; height: number }
): MoveTreeMinimapRect {
  const { scale, renderedWidth, renderedHeight, offsetX, offsetY } = getMoveTreeMinimapTransform(layout, minimap);
  const rectWidth = Math.min(renderedWidth, Math.max(6, viewport.width * scale));
  const rectHeight = Math.min(renderedHeight, Math.max(6, viewport.height * scale));
  const maxX = offsetX + renderedWidth - rectWidth;
  const maxY = offsetY + renderedHeight - rectHeight;

  return {
    x: Math.min(maxX, Math.max(offsetX, offsetX + viewport.left * scale)),
    y: Math.min(maxY, Math.max(offsetY, offsetY + viewport.top * scale)),
    width: rectWidth,
    height: rectHeight,
  };
}

export function getMoveTreeMinimapTransform(
  layout: Pick<MoveTreeLayout, 'width' | 'height'>,
  minimap: { width: number; height: number }
): MoveTreeMinimapTransform {
  const scale = Math.min(minimap.width / Math.max(layout.width, 1), minimap.height / Math.max(layout.height, 1));
  const renderedWidth = Math.max(1, layout.width * scale);
  const renderedHeight = Math.max(1, layout.height * scale);
  const offsetX = Math.max(0, (minimap.width - renderedWidth) / 2);
  const offsetY = Math.max(0, (minimap.height - renderedHeight) / 2);

  return { scale, renderedWidth, renderedHeight, offsetX, offsetY };
}

export function getMoveTreeMinimapKeyboardScroll(
  layout: Pick<MoveTreeLayout, 'width' | 'height'>,
  viewport: MoveTreeViewport,
  key: string,
  panRatio = 0.72
): { left: number; top: number } | null {
  const maxLeft = Math.max(0, layout.width - viewport.width);
  const maxTop = Math.max(0, layout.height - viewport.height);
  const xStep = Math.max(48, viewport.width * panRatio);
  const yStep = Math.max(48, viewport.height * panRatio);
  const clampLeft = (left: number) => Math.max(0, Math.min(maxLeft, left));
  const clampTop = (top: number) => Math.max(0, Math.min(maxTop, top));

  if (key === 'ArrowLeft') return { left: clampLeft(viewport.left - xStep), top: clampTop(viewport.top) };
  if (key === 'ArrowRight') return { left: clampLeft(viewport.left + xStep), top: clampTop(viewport.top) };
  if (key === 'ArrowUp') return { left: clampLeft(viewport.left), top: clampTop(viewport.top - yStep) };
  if (key === 'ArrowDown') return { left: clampLeft(viewport.left), top: clampTop(viewport.top + yStep) };
  if (key === 'Home') return { left: 0, top: 0 };
  if (key === 'End') return { left: maxLeft, top: maxTop };

  return null;
}

export function shouldShowMoveTreeMinimap(
  layout: Pick<MoveTreeLayout, 'width' | 'height'>,
  viewport: MoveTreeViewport,
  minimap: { width: number; height: number },
  padding = 24
): boolean {
  const needsMap = layout.width > viewport.width + 2 || layout.height > viewport.height + 2;
  const hasRoom = viewport.width >= minimap.width + padding && viewport.height >= minimap.height + padding;

  return needsMap && hasRoom;
}
