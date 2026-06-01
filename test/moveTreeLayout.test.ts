import { describe, expect, it } from 'vitest';
import {
  computeMoveTreeLayout,
  getMoveTreeMinimapKeyboardScroll,
  getMoveTreeMinimapViewportRect,
  getMoveTreeMinimapTransform,
  getVisibleMoveTreeItems,
  shouldShowMoveTreeMinimap,
  type MoveTreeLayoutItem,
} from '../src/utils/moveTreeLayout';

const item = (id: string, parentId: string | null, player: 'black' | 'white' | null = null): MoveTreeLayoutItem => ({
  id,
  parentId,
  label: id,
  player,
  isRoot: parentId === null,
  autoUndo: false,
});

describe('move tree layout', () => {
  it('lays out mainline and branches with stable parent-before-child positions', () => {
    const items = [
      item('root', null),
      item('a', 'root', 'black'),
      item('b', 'a', 'white'),
      item('branch', 'a', 'white'),
      item('branch-child', 'branch', 'black'),
    ];
    const layout = computeMoveTreeLayout(items);

    const root = layout.nodes.find((node) => node.id === 'root');
    const a = layout.nodes.find((node) => node.id === 'a');
    const b = layout.nodes.find((node) => node.id === 'b');
    const branch = layout.nodes.find((node) => node.id === 'branch');

    expect(root?.gridX).toBe(0);
    expect(a?.gridX).toBe(1);
    expect(b?.gridX).toBe(2);
    expect(branch?.gridX).toBe(2);
    expect(branch?.gridY).toBeGreaterThanOrEqual(b?.gridY ?? 0);
    expect(layout.edges.map((edge) => edge.id)).toContain('a->branch');
    expect(layout.width).toBeGreaterThan(0);
    expect(layout.height).toBeGreaterThan(0);

    const vertical = computeMoveTreeLayout(items, 'vertical');
    const verticalRoot = vertical.nodes.find((node) => node.id === 'root');
    const verticalA = vertical.nodes.find((node) => node.id === 'a');
    const verticalB = vertical.nodes.find((node) => node.id === 'b');
    const verticalBranch = vertical.nodes.find((node) => node.id === 'branch');

    expect(verticalA?.x).toBe(verticalRoot?.x);
    expect(verticalA?.y).toBeGreaterThan(verticalRoot?.y ?? 0);
    expect(verticalBranch?.x).toBeGreaterThan(verticalB?.x ?? 0);
    expect(vertical.height).toBeGreaterThan(vertical.width);
    expect(vertical.edges.find((edge) => edge.id === 'a->branch')?.points).toBe(
      `${verticalA?.x},${verticalA?.y} ${verticalBranch?.x},${verticalA?.y} ${verticalBranch?.x},${verticalBranch?.y}`
    );
  });

  it('filters nodes and elbow edges to the visible viewport with overscan', () => {
    const items: MoveTreeLayoutItem[] = [item('root', null)];
    for (let i = 1; i <= 80; i++) {
      items.push(item(`m${i}`, i === 1 ? 'root' : `m${i - 1}`, i % 2 === 0 ? 'white' : 'black'));
    }

    const layout = computeMoveTreeLayout(items);
    const visible = getVisibleMoveTreeItems(layout, { left: 0, top: 0, width: 120, height: 80 }, 0);

    expect(visible.nodes.length).toBeLessThan(layout.nodes.length);
    expect(visible.nodes.some((node) => node.id === 'root')).toBe(true);
    expect(visible.edges.length).toBeLessThan(layout.edges.length);
  });

  it('maps the scrolled viewport onto a bounded minimap rect', () => {
    expect(getMoveTreeMinimapTransform({ width: 1000, height: 250 }, { width: 200, height: 100 })).toEqual({
      scale: 0.2,
      renderedWidth: 200,
      renderedHeight: 50,
      offsetX: 0,
      offsetY: 25,
    });

    const rect = getMoveTreeMinimapViewportRect(
      { width: 1000, height: 500 },
      { left: 250, top: 125, width: 500, height: 250 },
      { width: 200, height: 100 }
    );

    expect(rect).toEqual({ x: 50, y: 25, width: 100, height: 50 });

    const clamped = getMoveTreeMinimapViewportRect(
      { width: 1000, height: 500 },
      { left: 900, top: 450, width: 500, height: 250 },
      { width: 200, height: 100 }
    );

    expect(clamped.x + clamped.width).toBeLessThanOrEqual(200);
    expect(clamped.y + clamped.height).toBeLessThanOrEqual(100);
  });

  it('only shows the minimap for scrollable trees with enough viewport room', () => {
    const minimap = { width: 156, height: 88 };

    expect(shouldShowMoveTreeMinimap({ width: 60, height: 44 }, { left: 0, top: 0, width: 280, height: 44 }, minimap)).toBe(false);
    expect(shouldShowMoveTreeMinimap({ width: 1000, height: 500 }, { left: 0, top: 0, width: 280, height: 44 }, minimap)).toBe(false);
    expect(shouldShowMoveTreeMinimap({ width: 1000, height: 500 }, { left: 0, top: 0, width: 280, height: 180 }, minimap)).toBe(true);
  });

  it('maps minimap keyboard panning to clamped scroll positions', () => {
    const layout = { width: 1000, height: 500 };
    const viewport = { left: 250, top: 100, width: 200, height: 100 };

    expect(getMoveTreeMinimapKeyboardScroll(layout, viewport, 'ArrowRight')).toEqual({ left: 394, top: 100 });
    expect(getMoveTreeMinimapKeyboardScroll(layout, viewport, 'ArrowLeft')).toEqual({ left: 106, top: 100 });
    expect(getMoveTreeMinimapKeyboardScroll(layout, viewport, 'ArrowDown')).toEqual({ left: 250, top: 172 });
    expect(getMoveTreeMinimapKeyboardScroll(layout, viewport, 'ArrowUp')).toEqual({ left: 250, top: 28 });
    expect(getMoveTreeMinimapKeyboardScroll(layout, viewport, 'Home')).toEqual({ left: 0, top: 0 });
    expect(getMoveTreeMinimapKeyboardScroll(layout, viewport, 'End')).toEqual({ left: 800, top: 400 });
    expect(getMoveTreeMinimapKeyboardScroll(layout, { left: 760, top: 390, width: 200, height: 100 }, 'ArrowRight')).toEqual({ left: 800, top: 390 });
    expect(getMoveTreeMinimapKeyboardScroll(layout, viewport, 'Enter')).toBeNull();
  });
});
