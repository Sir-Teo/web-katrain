import type { GameNode } from '../types';

/**
 * How many moves have been inserted since insert mode opened.
 *
 * Walks up from the current node to the anchor rather than tracking a counter,
 * so undoing back past an inserted move is reflected without anything having to
 * remember it happened.
 */
export function countInsertedMoves(current: GameNode | null, anchorId: string | null): number {
  if (!current || !anchorId) return 0;
  let count = 0;
  let node: GameNode | null = current;
  while (node && node.id !== anchorId) {
    if (node.move) count += 1;
    node = node.parent ?? null;
  }
  // The anchor was not on this path -- the reader navigated out of the insert.
  return node ? count : 0;
}

export interface InsertProgress {
  /** Short enough for the chip in the top bar. */
  label: string;
  /** True when exiting now would leave the continuation behind. */
  warn: boolean;
  /** The whole story, for the chip's tooltip and its accessible name. */
  title: string;
}

/**
 * What the Insert chip should say while the reader is part-way through.
 *
 * Exiting insert mode copies the rest of the game onto the new branch, and each
 * copied move keeps its own colour, so an *odd* number of inserted moves puts
 * the continuation on the other side and none of it can follow. The store
 * reports that afterwards; this is the same fact offered while there is still
 * something the reader can do about it, which is one more move.
 */
export function describeInsertProgress(count: number): InsertProgress {
  const safe = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  if (safe === 0) {
    return {
      label: 'Insert',
      warn: false,
      title: 'Insert mode: play the moves to insert, then leave insert mode to '
        + 'copy the rest of the game after them.',
    };
  }
  const moves = `${safe} move${safe === 1 ? '' : 's'}`;
  if (safe % 2 === 1) {
    return {
      label: `Insert ${safe}`,
      warn: true,
      title: `Insert mode: ${moves} inserted. Leaving now puts the rest of the game `
        + 'on the other color, so none of it will follow. Insert one more to carry '
        + 'the continuation with you.',
    };
  }
  return {
    label: `Insert ${safe}`,
    warn: false,
    title: `Insert mode: ${moves} inserted. Leaving now copies the rest of the game `
      + 'after them.',
  };
}
