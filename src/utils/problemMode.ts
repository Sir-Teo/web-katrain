import type { GameNode, Player } from '../types';

export type ProblemVerdict = 'correct' | 'wrong' | 'unknown';

// `right\.` sits outside the group because the group's trailing `\b` killed
// it: a word boundary after `.` needs a word character *next*, so "Right." at
// the end of a comment -- the one place anyone writes it -- never matched,
// while "right.Next" did. The period is still required, so "right side" stays
// out.
const CORRECT_PATTERNS = /\b(?:correct|right answer|solution|success)\b|\bright\.|正解|正确|正確|정답|成功|성공/i;
// goproblems.com marks its solutions C[RIGHT], often with more text after it
// and no period, so the pattern above never matched them. Upper case only, so
// "right side" in a comment still says nothing.
const GOPROBLEMS_RIGHT = /(?:^|\s)RIGHT(?=$|[\s.!,:;])/;
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

const markerSet = (values: string[] | undefined): boolean => values?.some((v) => v !== '0') ?? false;

/**
 * Best-effort classification of a problem node using SGF good-position markers
 * (GB/GW) and comment keywords across several languages. Wrong markers win over
 * positive ones; absent any signal the verdict is `unknown`.
 *
 * GB is good for Black and GW good for White, so with the solver's colour a
 * marker for the other side is a failure: counting either as success told a
 * Black solver "Correct" at a variation marked good for White.
 */
export const classifyProblemNode = (node: GameNode, solver?: Player): ProblemVerdict => {
  const text = nodeText(node);
  if (WRONG_PATTERNS.test(text)) return 'wrong';
  if (CORRECT_PATTERNS.test(text) || GOPROBLEMS_RIGHT.test(text)) return 'correct';
  const goodForBlack = markerSet(node.properties?.GB);
  const goodForWhite = markerSet(node.properties?.GW);
  if (!solver) return goodForBlack || goodForWhite ? 'correct' : 'unknown';
  const goodForSolver = solver === 'black' ? goodForBlack : goodForWhite;
  const goodForOpponent = solver === 'black' ? goodForWhite : goodForBlack;
  if (goodForSolver) return 'correct';
  if (goodForOpponent) return 'wrong';
  return 'unknown';
};

/** Returns the child of `node` whose move lands on (x, y), if any. */
export const findChildForMove = (node: GameNode, x: number, y: number): GameNode | null => {
  for (const child of node.children) {
    if (child.move && child.move.x === x && child.move.y === y) return child;
  }
  return null;
};

/**
 * The player to move at a node (the solver's color at the problem start).
 *
 * `PL` says so outright. Without it, the problem's own first move does: a
 * collection child inherits the root's side, so a White-to-play problem after
 * a Black one was posed as "Black to play" and its correct white answer graded
 * as failing.
 */
export const problemSideToMove = (node: GameNode): Player => {
  if (node.properties?.PL?.length) return node.gameState.currentPlayer;
  const firstMove = node.children.find((child) => child.move)?.move;
  return firstMove?.player ?? node.gameState.currentPlayer;
};

const boardHasStones = (node: GameNode): boolean =>
  node.gameState.board.some((row) => row.some((cell) => cell !== null));

const MAX_VERDICT_SCAN_NODES = 4000;

/** True when any node in the subtree carries an explicit correct/wrong verdict. */
const subtreeHasVerdict = (start: GameNode): boolean => {
  const stack: GameNode[] = [start];
  let visited = 0;
  while (stack.length > 0 && visited < MAX_VERDICT_SCAN_NODES) {
    const node = stack.pop()!;
    visited++;
    if (node !== start && classifyProblemNode(node) !== 'unknown') return true;
    for (const child of node.children) stack.push(child);
  }
  return false;
};

/**
 * Whether a node can be practised as a problem at all. Problems either open
 * from a set-up position (the tsumego case) or record correct/wrong verdicts
 * that the modal can grade against. An ordinary game — empty board, no
 * verdicts — is a game record, not a problem, and offering its opening as one
 * just shows the solver a blank board.
 */
export const isProblemStart = (node: GameNode): boolean =>
  node.children.length > 0 && (boardHasStones(node) || subtreeHasVerdict(node));

/**
 * Splits a loaded tree into individual problem starts. A synthetic empty root
 * with several stone-bearing children is treated as a problem collection;
 * otherwise the whole tree is a single problem rooted at `root`. Starts that
 * are not practisable as problems are dropped so the modal can explain itself
 * instead of posing an empty board.
 */
export const getProblemStarts = (root: GameNode): GameNode[] => {
  // Collection entries are set-up nodes. Counting any child with a stone let
  // a game that branches at move 1 -- the move's own stone counted -- be posed
  // as "Problem 1/2, White to play" at move 1 of an ordinary game.
  const looksLikeCollection =
    !root.move &&
    !boardHasStones(root) &&
    root.children.length > 1 &&
    root.children.every((child) => !child.move && (boardHasStones(child) || child.children.length > 0));
  // A handicap game's stones are not a problem's set-up.
  const handicap = Number.parseInt(root.properties?.HA?.[0] ?? '', 10);
  if (!looksLikeCollection && handicap >= 2 && !subtreeHasVerdict(root)) return [];
  const starts = looksLikeCollection ? root.children : [root];
  return starts.map(skipLeadingSetupNodes).filter(isProblemStart);
};

/**
 * Many editors write a problem's stones in a node after the root. Posed from
 * the root, that was an empty board, and every answer was "not part of this
 * problem" because the root's only child has no move to match.
 */
const skipLeadingSetupNodes = (start: GameNode): GameNode => {
  let node = start;
  while (node.children.length === 1 && !node.children[0]!.move) node = node.children[0]!;
  return node;
};

/**
 * Finds a path (including `start`) to the first node classified `correct`,
 * never passing through one classified `wrong`. Falls back to the main line,
 * steering around refuted moves, when nothing is explicitly marked.
 *
 * Solving settles on the first node with a verdict, so this does too: looking
 * only for a correct *leaf* missed "Correct" written on the key move, and the
 * fallback then showed the first child even when it was the line marked Wrong.
 */
export const findSolutionPath = (start: GameNode, solver?: Player): GameNode[] => {
  const stack = [{ node: start, nextChild: 0 }];
  while (stack.length > 0) {
    const frame = stack[stack.length - 1]!;
    if (frame.nextChild < frame.node.children.length) {
      const child = frame.node.children[frame.nextChild++]!;
      const verdict = classifyProblemNode(child, solver);
      if (verdict === 'correct') return [...stack.map(({ node }) => node), child];
      if (verdict !== 'wrong') stack.push({ node: child, nextChild: 0 });
    } else {
      stack.pop();
    }
  }

  const mainLine: GameNode[] = [];
  let node: GameNode | null = start;
  while (node) {
    mainLine.push(node);
    node = node.children.find((child) => classifyProblemNode(child, solver) !== 'wrong') ?? null;
  }
  return mainLine;
};
