import { describe, expect, it } from 'vitest';
import { useGameStore } from '../src/store/gameStore';
import { generateSgfFromTree, parseSgf } from '../src/utils/sgf';

function leafLines(sgf: string): string[] {
  const tree = parseSgf(sgf).tree!;
  const lines: string[] = [];
  const pending: Array<{ node: typeof tree; path: string }> = [{ node: tree, path: '' }];
  while (pending.length > 0) {
    const { node, path } = pending.pop()!;
    const move = node.props.B?.[0] ?? node.props.W?.[0];
    const next = move ? `${path}${move}` : path;
    if (node.children.length === 0) lines.push(next);
    for (const child of node.children) pending.push({ node: child, path: next });
  }
  return lines.sort();
}

function saveAfterClearingMarker(sgf: string, pathToMarked: number[]): string {
  const store = useGameStore.getState();
  store.resetGame();
  store.loadGame(parseSgf(sgf));
  let marked = useGameStore.getState().rootNode;
  for (const index of pathToMarked) marked = marked.children[index]!;
  useGameStore.getState().jumpToNode(marked);
  // Removing its only marker leaves the node with nothing to write.
  useGameStore.getState().toggleBoardPointMarkup(0, 0);
  return generateSgfFromTree(useGameStore.getState().rootNode);
}

describe('an emptied node that holds variations', () => {
  it('saves to a file that opens again below a move', () => {
    const saved = saveAfterClearingMarker('(;GM[1]FF[4]SZ[9];B[ee](;MA[aa](;W[ab])(;W[bb]))(;W[cc]))', [0, 0]);
    expect(saved).not.toContain('((');
    expect(leafLines(saved)).toEqual(['eeab', 'eebb', 'eecc']);
  });

  it('saves to a file that opens again', () => {
    const store = useGameStore.getState();
    store.resetGame();
    store.loadGame(parseSgf('(;GM[1]FF[4]SZ[9](;MA[ee](;B[aa])(;B[bb]))(;B[cc]))'));
    const marked = useGameStore.getState().rootNode.children[0]!;
    useGameStore.getState().jumpToNode(marked);
    // Removing its only marker leaves the node with nothing to write.
    useGameStore.getState().toggleBoardPointMarkup(4, 4);

    const saved = generateSgfFromTree(useGameStore.getState().rootNode);
    expect(saved).not.toContain('((');
    const reopened = parseSgf(saved);
    const lines: string[] = [];
    const walk = (node: NonNullable<typeof reopened.tree>, path: string) => {
      const move = node.props.B?.[0] ?? node.props.W?.[0];
      const next = move ? `${path}${move}` : path;
      if (node.children.length === 0) lines.push(next);
      for (const child of node.children) walk(child, next);
    };
    walk(reopened.tree!, '');
    expect(lines.sort()).toEqual(['aa', 'bb', 'cc']);
  });
});
