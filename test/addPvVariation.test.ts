import { afterEach, describe, expect, it } from 'vitest';
import { useGameStore } from '../src/store/gameStore';
import { getMoveTreeCollapseTarget } from '../src/utils/moveTreeCollapse';

const findInTree = (nodeId: string) => {
  const stack = [useGameStore.getState().rootNode];
  while (stack.length > 0) {
    const next = stack.pop()!;
    if (next.id === nodeId) return next;
    for (const child of next.children) stack.push(child);
  }
  return null;
};

describe('addPvVariation', () => {
  afterEach(() => {
    useGameStore.getState().resetGame();
  });

  it('plays the variation onto the tree without moving the current node', () => {
    const store = useGameStore.getState();
    store.resetGame();
    const before = useGameStore.getState().currentNode;

    store.addPvVariation(['Q16', 'D4', 'Q4']);

    const after = useGameStore.getState();
    expect(after.currentNode.id).toBe(before.id);
    expect(after.currentNode.children).toHaveLength(1);

    const first = after.currentNode.children[0]!;
    expect(first.move).toMatchObject({ x: 15, y: 3, player: 'black' });
    const second = first.children[0]!;
    expect(second.move).toMatchObject({ x: 3, y: 15, player: 'white' });
    expect(second.children[0]!.move).toMatchObject({ x: 15, y: 15, player: 'black' });
    expect(after.notification?.message).toContain('Added 3 moves');
  });

  it('stops at the move you scrolled to', () => {
    const store = useGameStore.getState();
    store.resetGame();

    store.addPvVariation(['Q16', 'D4', 'Q4', 'D16'], 2);

    const root = useGameStore.getState().currentNode;
    const first = root.children[0]!;
    expect(first.children).toHaveLength(1);
    expect(first.children[0]!.children).toHaveLength(0);
  });

  it('extends the existing line instead of forking a duplicate', () => {
    const store = useGameStore.getState();
    store.resetGame();

    store.addPvVariation(['Q16', 'D4']);
    store.addPvVariation(['Q16', 'D4', 'Q4']);

    const root = useGameStore.getState().currentNode;
    expect(root.children).toHaveLength(1);
    const first = root.children[0]!;
    expect(first.children).toHaveLength(1);
    expect(first.children[0]!.children).toHaveLength(1);
  });

  it('reports when nothing new was added', () => {
    const store = useGameStore.getState();
    store.resetGame();

    store.addPvVariation(['Q16', 'D4']);
    store.addPvVariation(['Q16', 'D4']);

    expect(useGameStore.getState().notification?.message).toContain('already in the tree');
  });

  it('leaves the tree alone for an empty or unplayable variation', () => {
    const store = useGameStore.getState();
    store.resetGame();
    const treeVersion = useGameStore.getState().treeVersion;

    store.addPvVariation([]);
    expect(useGameStore.getState().currentNode.children).toHaveLength(0);
    expect(useGameStore.getState().treeVersion).toBe(treeVersion);

    store.addPvVariation(['ZZ99']);
    expect(useGameStore.getState().currentNode.children).toHaveLength(0);
    expect(useGameStore.getState().notification?.type).toBe('error');
  });

  it('points the active branch at the variation so Forward walks into it', () => {
    const store = useGameStore.getState();
    store.resetGame();
    store.playMove(15, 3); // Q16, so the variation becomes a second branch
    useGameStore.getState().navigateBack();

    useGameStore.getState().addPvVariation(['D4', 'Q16']);
    useGameStore.getState().navigateForward();

    expect(useGameStore.getState().currentNode.move).toMatchObject({ x: 3, y: 15 });
  });

  it('produces a branch that the collapse action can fold away', () => {
    const store = useGameStore.getState();
    store.resetGame();
    store.addPvVariation(['Q16', 'D4', 'Q4']);

    const root = useGameStore.getState().currentNode;
    const head = root.children[0]!;
    expect(findInTree(head.id)).toBe(head);
    expect(getMoveTreeCollapseTarget(head.children[0]!.children[0]!)).toBe(head);
  });
});
