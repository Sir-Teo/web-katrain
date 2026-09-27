import { formatBoardMoveLabel } from '../lib/gtp';
import type { GameNode, Player } from '../types';

export type ProblemVerdict = 'correct' | 'wrong' | 'unknown';

// Verdict words, read two ways. A comment that *opens* with one is the
// convention problem files use to grade a move ("RIGHT", "Correct!", "Wrong --
// black dies"), and that opening word settles it whatever the rest says:
// "Correct! The other move is a mistake" used to read as wrong because any
// wrong word anywhere won. Anywhere else, the words are prose, weighed with
// their negations: "This is not the correct solution" used to read as correct.

// `right[.!]` needs the punctuation so "right side" stays out; a word boundary
// after a period needs a word character next, so it is not `\bright\.\b`.
const LEADING_CORRECT = /^(?:(?:correct|right answer|success(?:ful)?|solution|solved)\b|right[.!]|正解|正确|正確|정답|成功|성공)/i;
// goproblems.com marks its solutions C[RIGHT], often with more text after it
// and no period. Upper case only, so "Right side is weak" says nothing.
const LEADING_GOPROBLEMS_RIGHT = /^RIGHT(?=$|[\s.!,:;])/;
const LEADING_WRONG = /^(?:(?:wrong|incorrect|fail(?:s|ed|ure)?|mistake|refuted)\b|失败|失敗|錯誤|错误|오답|실패)/i;

// Prose positives. "solution" is not one: "Black dies. The solution is B2"
// on a refuted move is not a verdict of correct.
const PROSE_CORRECT = /\b(?:correct|right answer|success)\b|\bright\.|正解|正确|正確|정답|成功|성공/gi;
const PROSE_GOPROBLEMS_RIGHT = /(?:^|\s)RIGHT(?=$|[\s.!,:;])/g;
const PROSE_WRONG = /\b(?:wrong|incorrect|fail(?:s|ed|ure)?|mistake)\b|失败|失敗|錯誤|错误|오답|실패|変化図|变化图/gi;

const NEGATION_WORD = /^(?:not|no|never|nor|neither|hardly|without|nothing|none|cannot|isnt|arent|wasnt|dont|doesnt)$|n['’]t$/i;
const CJK_NEGATION_BEFORE = /[不非未没沒]$/;
const KOREAN_NEGATION_AFTER = /^\s*(?:이|가)?\s*아(?:니|닙|님)/;

/**
 * Whether the keyword at `index` is negated: a negating word among the four
 * before it in the same clause ("not the correct", "isn't right."), a CJK
 * negating prefix (不正解), or Korean's trailing 아니 (정답이 아닙니다).
 */
const isNegated = (text: string, index: number, length: number): boolean => {
  const before = text.slice(Math.max(0, index - 60), index);
  if (CJK_NEGATION_BEFORE.test(before)) return true;
  if (KOREAN_NEGATION_AFTER.test(text.slice(index + length, index + length + 8))) return true;
  const clause = before.split(/[.!?;:,—。！？、，]/).pop() ?? '';
  const words = clause.trim().split(/\s+/).filter(Boolean).slice(-4);
  return words.some((word) => NEGATION_WORD.test(word.replace(/[^\p{L}'’]/gu, '')));
};

/** Counts matches of `pattern` in `text`, split by whether they are negated. */
const countHits = (text: string, pattern: RegExp): { plain: number; negated: number } => {
  let plain = 0;
  let negated = 0;
  for (const match of text.matchAll(pattern)) {
    // The goproblems pattern consumes the space before RIGHT.
    const offset = match[0].length - match[0].trimStart().length;
    const index = (match.index ?? 0) + offset;
    if (isNegated(text, index, match[0].length - offset)) negated++;
    else plain++;
  }
  return { plain, negated };
};

const stripLeading = (text: string): string => text.replace(/^[\s"'“‘([{*_~\-–—>#]+/u, '');

/** The verdict a comment opens with, if it opens with one. */
const leadingVerdict = (text: string): ProblemVerdict => {
  const head = stripLeading(text);
  if (LEADING_WRONG.test(head)) return 'wrong';
  const correct = LEADING_CORRECT.exec(head) ?? LEADING_GOPROBLEMS_RIGHT.exec(head);
  // 정답이 아닙니다 opens with 정답 and negates it after; leave that to prose.
  if (correct && !isNegated(head, 0, correct[0].length)) return 'correct';
  return 'unknown';
};

/**
 * The verdict of free prose, conservatively. A plain wrong word still wins;
 * a negated positive ("not correct", 不正解) is a wrong verdict, never a
 * correct one; a positive counts only when nothing negates or contradicts it.
 * A negated wrong word ("not a mistake") says nothing either way.
 */
const proseVerdict = (text: string): ProblemVerdict => {
  const wrong = countHits(text, PROSE_WRONG);
  if (wrong.plain > 0) return 'wrong';
  const correct = countHits(text, PROSE_CORRECT);
  const right = countHits(text, PROSE_GOPROBLEMS_RIGHT);
  const positives = correct.plain + right.plain;
  const negatedPositives = correct.negated + right.negated;
  if (negatedPositives > 0) return positives > 0 ? 'unknown' : 'wrong';
  return positives > 0 ? 'correct' : 'unknown';
};

const nodeTexts = (node: GameNode): string[] => {
  const parts: string[] = [];
  const props = node.properties;
  // The node name first: a problem editor's "Correct"/"Wrong" label.
  for (const key of ['N', 'C']) {
    const value = props?.[key];
    if (value) parts.push(value.join(' '));
  }
  if (node.note) parts.push(node.note);
  return parts.filter((part) => part.trim() !== '');
};

const markerSet = (values: string[] | undefined): boolean => values?.some((v) => v !== '0') ?? false;

/**
 * The SGF move annotation on a move the solver made: BM (bad move) and DO
 * (doubtful) are wrong, TE (tesuji) is correct; IT (interesting) is no
 * verdict. On the opponent's reply the same marks describe the opponent's
 * play, so they are left to the other signals rather than guessed at.
 */
const moveAnnotationVerdict = (node: GameNode, solver?: Player): ProblemVerdict => {
  const props = node.properties;
  if (!props) return 'unknown';
  if (solver && node.move && node.move.player !== solver) return 'unknown';
  if (markerSet(props.BM) || markerSet(props.DO)) return 'wrong';
  if (markerSet(props.TE)) return 'correct';
  return 'unknown';
};

/**
 * Classification of a problem node, strongest signal first:
 *
 * 1. SGF move annotations on the solver's move (TE / BM / DO).
 * 2. A verdict the comment or node name opens with ("RIGHT", "Correct",
 *    "Wrong", 正解 ...). The first part that opens with one decides.
 * 3. Prose keywords across several languages, negation-aware: wrong words
 *    win, negated positives are wrong, never correct.
 * 4. Good-position markers GB / GW, relative to the solver.
 *
 * Absent any signal the verdict is `unknown`.
 *
 * GB is good for Black and GW good for White, so with the solver's colour a
 * marker for the other side is a failure: counting either as success told a
 * Black solver "Correct" at a variation marked good for White.
 */
export const classifyProblemNode = (node: GameNode, solver?: Player): ProblemVerdict => {
  const annotated = moveAnnotationVerdict(node, solver);
  if (annotated !== 'unknown') return annotated;

  const texts = nodeTexts(node);
  for (const text of texts) {
    const leading = leadingVerdict(text);
    if (leading !== 'unknown') return leading;
  }
  const prose = proseVerdict(texts.join(' \n '));
  if (prose !== 'unknown') return prose;

  const goodForBlack = markerSet(node.properties?.GB);
  const goodForWhite = markerSet(node.properties?.GW);
  if (!solver) return goodForBlack || goodForWhite ? 'correct' : 'unknown';
  const goodForSolver = solver === 'black' ? goodForBlack : goodForWhite;
  const goodForOpponent = solver === 'black' ? goodForWhite : goodForBlack;
  if (goodForSolver) return 'correct';
  if (goodForOpponent) return 'wrong';
  return 'unknown';
};

/** True for a recorded pass (SGF `B[]`, `W[]` or `B[tt]` on small boards). */
export const isProblemPass = (move: GameNode['move']): boolean => !!move && (move.x < 0 || move.y < 0);

/**
 * Returns the child of `node` that passes, if the problem records one. Some
 * problems -- seki, or waiting for the opponent to fill a liberty -- are
 * solved by passing, and clicking the board could never reach that line.
 */
export const findPassChild = (node: GameNode): GameNode | null =>
  node.children.find((child) => isProblemPass(child.move)) ?? null;

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

/** The comment a problem node carries: the loaded `C`, or its raw property. */
export const problemNodeComment = (node: GameNode): string =>
  (node.note?.trim() || node.properties?.C?.join(' ').trim() || '');

export interface SolutionStep {
  /** 0 is the problem position; 1..total are the moves of the line. */
  step: number;
  total: number;
  /** "Black C3", "White passes", or null at the problem position. */
  moveLabel: string | null;
  comment: string;
}

/**
 * What to show at one step of a solution line, so "Show solution" can walk
 * through it move by move -- with the comments problem authors write on each
 * move -- instead of jumping to the final position.
 */
export const describeSolutionStep = (path: GameNode[], step: number): SolutionStep => {
  const total = Math.max(0, path.length - 1);
  const index = Math.max(0, Math.min(step, total));
  const node = path[index];
  const move = index > 0 ? node?.move : null;
  let moveLabel: string | null = null;
  if (move) {
    const side = move.player === 'black' ? 'Black' : 'White';
    moveLabel = isProblemPass(move)
      ? `${side} passes`
      : `${side} ${formatBoardMoveLabel(move, node!.gameState.board.length)}`;
  }
  return { step: index, total, moveLabel, comment: node ? problemNodeComment(node) : '' };
};
