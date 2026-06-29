import type { GameNode, Player } from '../types';

export type ProblemVerdict = 'correct' | 'wrong' | 'unknown';

const CORRECT_PATTERNS = /\b(correct|right answer|right\.|solution|success)\b|正解|正确|正確|정답|成功|성공/i;
const WRONG_PATTERNS = /\b(wrong|incorrect|fail(?:ure|ed)?|mistake)\b|失败|失敗|錯誤|错误|오답|실패|変化図|变化图/i;

const nodeText = (node: GameNode): string => {
  const parts: string[] = [];
  if (node.note) parts.push(node.note);
  const props = node.properties;
  if (props) {
    for (const key of ['C', 'N']) {
      const value = props[key];
      if (value) parts.push(value.join(' '));
    }
  }
  return parts.join(' ');
};

const hasGoodMarker = (node: GameNode): boolean => {
  const props = node.properties;
  if (!props) return false;
  return (props.GB?.some((v) => v !== '0') ?? false) || (props.GW?.some((v) => v !== '0') ?? false);
};

/**
 * Best-effort classification of a problem node using SGF good-position markers
 * (GB/GW) and comment keywords across several languages. Wrong markers win over
 * positive ones; absent any signal the verdict is `unknown`.
 */
export const classifyProblemNode = (node: GameNode): ProblemVerdict => {
  const text = nodeText(node);
  if (WRONG_PATTERNS.test(text)) return 'wrong';
  if (hasGoodMarker(node) || CORRECT_PATTERNS.test(text)) return 'correct';
  return 'unknown';
};

/** Returns the child of `node` whose move lands on (x, y), if any. */
export const findChildForMove = (node: GameNode, x: number, y: number): GameNode | null => {
  for (const child of node.children) {
    if (child.move && child.move.x === x && child.move.y === y) return child;
  }
  return null;
};

/** The player to move at a node (the solver's color at the problem start). */
export const problemSideToMove = (node: GameNode): Player => node.gameState.currentPlayer;

const boardHasStones = (node: GameNode): boolean =>
  node.gameState.board.some((row) => row.some((cell) => cell !== null));

/**
 * Splits a loaded tree into individual problem starts. A synthetic empty root
 * with several stone-bearing children is treated as a problem collection;
 * otherwise the whole tree is a single problem rooted at `root`.
 */
export const getProblemStarts = (root: GameNode): GameNode[] => {
  const looksLikeCollection =
    !root.move &&
    !boardHasStones(root) &&
    root.children.length > 1 &&
    root.children.every((child) => boardHasStones(child) || child.children.length > 0);
  return looksLikeCollection ? root.children : [root];
};

/**
 * Finds a path (including `start`) from a problem start to a leaf classified as
 * `correct`. Falls back to the main line when no leaf is explicitly marked.
 */
export const findSolutionPath = (start: GameNode): GameNode[] => {
  const path: GameNode[] = [];
  const dfs = (node: GameNode): boolean => {
    path.push(node);
    if (node.children.length === 0) {
      if (classifyProblemNode(node) === 'correct') return true;
      path.pop();
      return false;
    }
    for (const child of node.children) {
      if (dfs(child)) return true;
    }
    path.pop();
    return false;
  };
  if (dfs(start)) return path;

  const mainLine: GameNode[] = [];
  let node: GameNode | null = start;
  while (node) {
    mainLine.push(node);
    node = node.children[0] ?? null;
  }
  return mainLine;
};
