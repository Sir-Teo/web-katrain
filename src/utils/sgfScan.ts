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
 */
export interface SgfScan {
  /** Nodes carrying a one-letter `B` or `W` property, passes included. */
  moveCount: number;
  /** Index of the first move's node, or -1. Everything before it is the header. */
  firstMoveIndex: number;
}

export function scanSgf(sgf: string): SgfScan {
  if (!sgf) return { moveCount: 0, firstMoveIndex: -1 };
  let moveCount = 0;
  let firstMoveIndex = -1;
  let inValue = false;
  // Where a property identifier may begin: after `;` and after a value closes.
  let atPropertyStart = false;
  let nodeStart = -1;
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
      continue;
    }
    if (ch === ' ' || ch === '\n' || ch === '\r' || ch === '\t') continue;
    // A move is a one-letter B or W; BL and WL are the clock, not a move.
    if (atPropertyStart && (ch === 'B' || ch === 'W') && sgf[i + 1] === '[') {
      moveCount += 1;
      if (firstMoveIndex < 0) firstMoveIndex = nodeStart >= 0 ? nodeStart : i;
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
