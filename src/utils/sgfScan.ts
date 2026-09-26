/**
 * Reading facts out of SGF text without parsing it.
 *
 * The tempting way to do this is a regex, and the tempting regex is wrong.
 * `/;[BW]\[/` requires a move to be the first property in its node, which SGF
 * does not promise and this app's own writer does not do — it emits `C` before
 * `B` for any move carrying a comment, so an annotated game read as having
 * almost no moves. Widening it to accept `]B[` only moves the mistake along: a
 * comment containing the escaped text `\]B[` would then count as a move.
 *
 * So this walks the text once, tracking whether it is inside a property value
 * and honouring the backslash escape. No allocation, no parse tree.
 *
 * It stops at the end of the first game tree, because that is the game every
 * other reader of the same text describes. An SGF file may hold a collection —
 * several complete `(;...)` trees one after another — and `readRootSgfProperties`,
 * `suggestLibraryItemNameFromSgf` and `parseSgf` all read the first of them. A
 * count that spanned the file put the others' moves on the first one's label:
 * a three-game collection whose games ran 3, 4 and 2 moves listed itself as
 * "Alice vs Bob · B+R · 9 moves", and opened at move 3. Variations stay
 * counted, because they are part of the game that opens; the next game in the
 * file is not.
 */
export interface SgfScan {
  /** Nodes carrying a one-letter `B` or `W` property, passes included. */
  moveCount: number;
  /** Index of the first move's node, or -1. Everything before it is the header. */
  firstMoveIndex: number;
}

const isLetter = (ch: string): boolean => (ch >= 'A' && ch <= 'Z') || (ch >= 'a' && ch <= 'z');
const isSpace = (ch: string): boolean => ch === ' ' || ch === '\n' || ch === '\r' || ch === '\t';

export function scanSgf(sgf: string): SgfScan {
  if (!sgf) return { moveCount: 0, firstMoveIndex: -1 };
  let moveCount = 0;
  let firstMoveIndex = -1;
  let inValue = false;
  // Where a property identifier may begin: after `;` and after a value closes.
  let atPropertyStart = false;
  let nodeStart = -1;
  // Depth of `(`, so the walk can stop when the first game tree closes.
  let depth = 0;
  let enteredTree = false;
  for (let i = 0; i < sgf.length; i += 1) {
    const ch = sgf[i]!;
    if (inValue) {
      if (ch === '\\') i += 1;
      else if (ch === ']') {
        inValue = false;
        atPropertyStart = true;
      }
      continue;
    }
    if (ch === ';') {
      atPropertyStart = true;
      nodeStart = i;
      continue;
    }
    if (ch === '[') {
      inValue = true;
      continue;
    }
    if (ch === '(' || ch === ')') {
      atPropertyStart = false;
      if (ch === '(') {
        depth += 1;
        enteredTree = true;
      } else {
        depth -= 1;
        if (enteredTree && depth <= 0) break;
      }
      continue;
    }
    if (isSpace(ch)) continue;
    // A move is a B or W property; BL and WL are the clock, not a move. Read
    // the identifier as the parser does -- FF[3] lowercase padding dropped
    // ("Black" is B), whitespace allowed before the value -- or the Library
    // counted `B [ee]` and `Black[dd]` as no move at all.
    if (atPropertyStart && isLetter(ch)) {
      let end = i;
      let ident = '';
      while (end < sgf.length && isLetter(sgf[end]!)) {
        const letter = sgf[end]!;
        if (letter >= 'A' && letter <= 'Z') ident += letter;
        end += 1;
      }
      let next = end;
      while (next < sgf.length && isSpace(sgf[next]!)) next += 1;
      if ((ident === 'B' || ident === 'W') && sgf[next] === '[') {
        moveCount += 1;
        if (firstMoveIndex < 0) firstMoveIndex = nodeStart >= 0 ? nodeStart : i;
      }
      i = end - 1;
    }
    atPropertyStart = false;
  }
  return { moveCount, firstMoveIndex };
}

/** How many moves the text records, passes included. */
export const countSgfMoves = (sgf: string): number => scanSgf(sgf).moveCount;

/**
 * The text before the first move, which is where the game's own properties are.
 * The whole string when it records no moves.
 */
export const sgfHeaderText = (sgf: string): string => {
  const { firstMoveIndex } = scanSgf(sgf);
  return firstMoveIndex >= 0 ? sgf.slice(0, firstMoveIndex) : sgf;
};

/**
 * How many complete game trees the text holds.
 *
 * An SGF file is a collection: `(;...)` repeated. Most hold one game and this
 * returns 1 for them. The app opens the first, so a file holding more is worth
 * saying out loud — the rest are kept and exported back, but nothing on screen
 * reaches them.
 */
export const countSgfGames = (sgf: string): number => {
  if (!sgf) return 0;
  let games = 0;
  let depth = 0;
  let inValue = false;
  for (let i = 0; i < sgf.length; i += 1) {
    const ch = sgf[i]!;
    if (inValue) {
      if (ch === '\\') i += 1;
      else if (ch === ']') inValue = false;
      continue;
    }
    if (ch === '[') inValue = true;
    else if (ch === '(') {
      if (depth === 0) games += 1;
      depth += 1;
    } else if (ch === ')' && depth > 0) depth -= 1;
  }
  return games;
};

/**
 * The games after the first, as they were written, or `''`.
 *
 * Editing a collection loads its first game, and saving writes that game back.
 * Everything after it is text the editor never held, so it has to be carried
 * across verbatim rather than re-serialized.
 */
export const sgfTrailingGames = (sgf: string): string => {
  if (!sgf) return '';
  let depth = 0;
  let inValue = false;
  let entered = false;
  for (let i = 0; i < sgf.length; i += 1) {
    const ch = sgf[i]!;
    if (inValue) {
      if (ch === '\\') i += 1;
      else if (ch === ']') inValue = false;
      continue;
    }
    if (ch === '[') inValue = true;
    else if (ch === '(') {
      depth += 1;
      entered = true;
    } else if (ch === ')') {
      depth -= 1;
      if (entered && depth <= 0) return sgf.slice(i + 1).trim();
    }
  }
  return '';
};
