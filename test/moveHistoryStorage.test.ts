import { beforeEach, describe, expect, it } from 'vitest';
import { useGameStore } from '../src/store/gameStore';
import { DEFAULT_BOARD_SIZE, type GameNode, type Move } from '../src/types';
import { hasStoredHistoryArray, materializedHistoryEntryCount, moveCountOf } from '../src/utils/moveHistory';

const state = () => useGameStore.getState();

/** A long legal game: 120 stones on distinct points, then alternating passes. */
const longGame = (length: number): Move[] => {
  const moves: Move[] = [];
  for (let i = 0; i < length; i++) {
    const player = i % 2 === 0 ? 'black' : 'white';
    if (i < 120) moves.push({ x: (i * 7) % DEFAULT_BOARD_SIZE, y: Math.floor(i / DEFAULT_BOARD_SIZE) * 3 % DEFAULT_BOARD_SIZE, player });
    else moves.push({ x: -1, y: -1, player });
  }
  return moves;
};

const mainLine = (root: GameNode): GameNode[] => {
  const nodes = [root];
  let cursor = root;
  while (cursor.children[0]) {
    cursor = cursor.children[0];
    nodes.push(cursor);
  }
  return nodes;
};

/** Move references kept alive by stored history arrays: one per node before, n² in total. */
const storedHistoryEntries = (root: GameNode): number => {
  let total = materializedHistoryEntryCount();
  for (const node of mainLine(root)) {
    if (hasStoredHistoryArray(node.gameState)) total += node.gameState.moveHistory.length;
  }
  return total;
};

const emptyBoard = () => Array.from({ length: DEFAULT_BOARD_SIZE }, () => Array(DEFAULT_BOARD_SIZE).fill(null));

describe('move history storage', () => {
  beforeEach(() => state().resetGame());

  it('stays linear in the length of a 4,000-move game', () => {
    const moves = longGame(4000);
    // Make sure the synthetic game really is legal all the way through.
    const unique = new Set(moves.slice(0, 120).map((m) => `${m.x},${m.y}`));
    expect(unique.size).toBe(120);

    state().loadGame({ moves, initialBoard: emptyBoard(), komi: 6.5 });
    const nodes = mainLine(state().rootNode);
    expect(nodes).toHaveLength(4001);

    // Stepping through the whole game, and handing each position's history to
    // an engine request, reads every node's history once.
    let checksum = 0;
    for (const node of nodes) checksum += node.gameState.moveHistory.length;
    expect(checksum).toBe((4000 * 4001) / 2);
    state().jumpToNode(nodes[4000]!);
    expect(state().moveHistory).toHaveLength(4000);
    expect(state().moveHistory[119]).toEqual(moves[119]);

    // Before: every node copied its full history (8,002,000 references).
    expect(storedHistoryEntries(state().rootNode)).toBeLessThan(20 * 4001);
  }, 30_000);

  it('builds the same history at every node as the moves that lead there', () => {
    const moves = longGame(300);
    state().loadGame({ moves, initialBoard: emptyBoard(), komi: 6.5 });
    const nodes = mainLine(state().rootNode);
    for (let i = 0; i < nodes.length; i++) {
      const history = nodes[i]!.gameState.moveHistory;
      expect(moveCountOf(nodes[i]!.gameState)).toBe(i);
      expect(history).toEqual(moves.slice(0, i));
    }
    // Asking again, after the cache has moved on, gives equal contents.
    expect(nodes[5]!.gameState.moveHistory).toEqual(moves.slice(0, 5));
  });

  it('keeps each line\'s history when branching, editing and changing komi', () => {
    state().playMove(3, 3);
    state().playMove(15, 15);
    state().playMove(3, 15);
    state().navigateBack();
    state().playMove(16, 3); // a second branch at move 3
    expect(state().moveHistory.map((m) => [m.x, m.y])).toEqual([[3, 3], [15, 15], [16, 3]]);
    state().setKomi(0.5);
    const [first] = state().rootNode.children;
    const [second] = first!.children;
    const [mainBranch, sideBranch] = second!.children;
    expect(mainBranch!.gameState.komi).toBe(0.5);
    expect(mainBranch!.gameState.moveHistory.map((m) => [m.x, m.y])).toEqual([[3, 3], [15, 15], [3, 15]]);
    expect(sideBranch!.gameState.moveHistory.map((m) => [m.x, m.y])).toEqual([[3, 3], [15, 15], [16, 3]]);
    expect(hasStoredHistoryArray(mainBranch!.gameState)).toBe(false);
    // A spread still yields a plain, complete position.
    const copy = { ...sideBranch!.gameState };
    expect(copy.moveHistory).toHaveLength(3);
    expect(JSON.parse(JSON.stringify(sideBranch!.gameState)).moveHistory).toHaveLength(3);
  });
});
