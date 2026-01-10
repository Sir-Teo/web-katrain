import React, { useEffect, useMemo, useRef } from 'react';
import { useGameStore } from '../store/gameStore';
import { BOARD_SIZE, type GameNode } from '../types';

type NodePos = { x: number; y: number };

function moveToLabel(node: GameNode): string {
  const move = node.move;
  if (!move) return 'Root';
  if (move.x < 0 || move.y < 0) return 'Pass';
  const col = String.fromCharCode(65 + (move.x >= 8 ? move.x + 1 : move.x));
  const row = BOARD_SIZE - move.y;
  return `${col}${row}`;
}

function layoutMoveTree(root: GameNode): Map<GameNode, NodePos> {
  const movePos = new Map<GameNode, NodePos>();
  movePos.set(root, { x: 0, y: 0 });

  const stack: GameNode[] = [...root.children].reverse();
  const nextY = new Map<number, number>();
  const getNextY = (x: number) => nextY.get(x) ?? 0;

  while (stack.length > 0) {
    const node = stack.pop()!;
    const parent = node.parent;
    if (!parent) continue;
    const parentPos = movePos.get(parent);
    if (!parentPos) continue;

    const x = parentPos.x + 1;
    const y = Math.max(getNextY(x), parentPos.y);
    nextY.set(x, y + 1);
    nextY.set(x - 1, Math.max(nextY.get(x) ?? 0, getNextY(x - 1)));
    movePos.set(node, { x, y });

    for (let i = node.children.length - 1; i >= 0; i--) {
      stack.push(node.children[i]!);
    }
  }

  return movePos;
}

export const MoveTree: React.FC = () => {
  const { rootNode, currentNode, jumpToNode, treeVersion } = useGameStore();
  const containerRef = useRef<HTMLDivElement>(null);

  const layout = useMemo(() => {
    void treeVersion;
    const positions = layoutMoveTree(rootNode);
    let maxX = 0;
    let maxY = 0;
    for (const pos of positions.values()) {
      if (pos.x > maxX) maxX = pos.x;
      if (pos.y > maxY) maxY = pos.y;
    }

    const r = 6;
    const xStep = 22;
    const yStep = 18;
    const margin = 12;

    const width = margin * 2 + maxX * xStep + r * 2 + 8;
    const height = margin * 2 + maxY * yStep + r * 2 + 8;

    const toPx = (pos: NodePos) => ({
      x: margin + pos.x * xStep + r,
      y: margin + pos.y * yStep + r,
    });

    return { positions, width, height, r, toPx };
  }, [rootNode, treeVersion]);

  useEffect(() => {
    const container = containerRef.current;
    const pos = layout.positions.get(currentNode);
    if (!container || !pos) return;

    const p = layout.toPx(pos);
    const targetLeft = Math.max(0, p.x - container.clientWidth * 0.5);
    const targetTop = Math.max(0, p.y - container.clientHeight * 0.5);
    container.scrollTo({ left: targetLeft, top: targetTop, behavior: 'smooth' });
  }, [currentNode, layout]);

  const lines = useMemo(() => {
    const out: Array<{ key: string; points: string }> = [];
    for (const [node, pos] of layout.positions.entries()) {
      const parent = node.parent;
      if (!parent) continue;
      const parentPos = layout.positions.get(parent);
      if (!parentPos) continue;
      const a = layout.toPx(parentPos);
      const b = layout.toPx(pos);
      out.push({
        key: `${parent.id}->${node.id}`,
        points: `${a.x},${a.y} ${a.x},${b.y} ${b.x},${b.y}`,
      });
    }
    return out;
  }, [layout]);

  const nodes = useMemo(() => {
    const out: Array<{ node: GameNode; x: number; y: number }> = [];
    for (const [node, pos] of layout.positions.entries()) {
      const p = layout.toPx(pos);
      out.push({ node, x: p.x, y: p.y });
    }
    out.sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x));
    return out;
  }, [layout]);

  return (
    <div ref={containerRef} className="w-full h-full overflow-auto bg-gray-900">
      <svg width={layout.width} height={layout.height} viewBox={`0 0 ${layout.width} ${layout.height}`}>
        {lines.map((l) => (
          <polyline
            key={l.key}
            points={l.points}
            fill="none"
            stroke="#9CA3AF"
            strokeWidth="1"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}

        {nodes.map(({ node, x, y }) => {
          const isCurrent = node.id === currentNode.id;
          const isAutoUndone = node.autoUndo === true;
          const move = node.move;
          const isRoot = !move;
          const isBlack = move?.player === 'black';
          const fill = isRoot ? 'none' : isBlack ? '#0B0B0B' : '#F9FAFB';
          const stroke = isRoot ? '#9CA3AF' : isBlack ? '#F9FAFB' : '#0B0B0B';

          return (
            <g key={node.id} style={{ cursor: isRoot ? 'default' : 'pointer' }}>
              {isAutoUndone && (
                <circle cx={x} cy={y} r={layout.r + 4} fill="none" stroke="#EF4444" strokeWidth="2" />
              )}
              {isCurrent && (
                <circle cx={x} cy={y} r={layout.r + 7} fill="none" stroke="#FACC15" strokeWidth="2" />
              )}
              <circle
                cx={x}
                cy={y}
                r={layout.r}
                fill={fill}
                stroke={stroke}
                strokeWidth="1"
                onClick={() => {
                  if (!isRoot) jumpToNode(node);
                }}
              >
                <title>{moveToLabel(node)}</title>
              </circle>
            </g>
          );
        })}
      </svg>
    </div>
  );
};
