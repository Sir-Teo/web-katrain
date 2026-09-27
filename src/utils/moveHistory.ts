import type { GameState, Move } from '../types';

/**
 * Move histories without a full copy per node.
 *
 * Every position used to store its own complete `moveHistory` array, so a
 * 4,000-move game kept about eight million move references alive (n²/2).
 * A position built here instead records only its parent's history and the
 * one move it adds; `gameState.moveHistory` is an accessor that assembles the
 * full array when someone reads it. The few most recently read arrays are
 * kept, so the current node, the engine's request and a redraw share one
 * array, but a pass over the whole game no longer leaves a copy at each node.
 *
 * Readers that only need the move count should use `moveCountOf`, which
 * never builds the array.
 */

type HistoryLink = {
  /** The parent's history: another link, or a plain array (the root's). */
  readonly parent: HistoryLink | readonly Move[];
  readonly move: Move;
  readonly length: number;
};

const links = new WeakMap<object, HistoryLink>();

/** Recently assembled histories, most recent last. */
const MATERIALIZED_CACHE_LIMIT = 16;
const materialized = new Map<HistoryLink, Move[]>();

const remember = (link: HistoryLink, history: Move[]): Move[] => {
  materialized.delete(link);
  materialized.set(link, history);
  while (materialized.size > MATERIALIZED_CACHE_LIMIT) {
    const oldest = materialized.keys().next().value;
    if (oldest === undefined) break;
    materialized.delete(oldest);
  }
  return history;
};

const materialize = (link: HistoryLink): Move[] => {
  const hit = materialized.get(link);
  if (hit) return remember(link, hit);
  // Walk up to the nearest ancestor whose full history is at hand (a recent
  // array or the root's), then append this line's moves in order.
  const tail: Move[] = [];
  let prefix: readonly Move[] = [];
  let cursor: HistoryLink = link;
  for (;;) {
    tail.push(cursor.move);
    const parent = cursor.parent;
    if (Array.isArray(parent)) {
      prefix = parent;
      break;
    }
    const parentLink = parent as HistoryLink;
    const cached = materialized.get(parentLink);
    if (cached) {
      prefix = cached;
      break;
    }
    cursor = parentLink;
  }
  const history = prefix.slice();
  for (let i = tail.length - 1; i >= 0; i--) history.push(tail[i]!);
  return remember(link, history);
};

const attachHistory = (target: Record<string, unknown>, link: HistoryLink): GameState => {
  Object.defineProperty(target, 'moveHistory', {
    enumerable: true,
    configurable: true,
    get() {
      return materialize(link);
    },
    set(this: Record<string, unknown>, value: Move[]) {
      // An explicit assignment replaces the lazy history with a plain array.
      links.delete(this);
      Object.defineProperty(this, 'moveHistory', { value, writable: true, enumerable: true, configurable: true });
    },
  });
  links.set(target, link);
  return target as unknown as GameState;
};

/** Number of moves played to reach this position, without assembling the history. */
export const moveCountOf = (state: GameState): number => links.get(state)?.length ?? state.moveHistory.length;

/** A position reached by playing `move` from `parent`; `fields` are everything but the history. */
export const gameStateAfterMove = (
  parent: GameState,
  move: Move,
  fields: Omit<GameState, 'moveHistory'>
): GameState => {
  const parentLink = links.get(parent);
  const link: HistoryLink = {
    parent: parentLink ?? parent.moveHistory,
    move,
    length: (parentLink?.length ?? parent.moveHistory.length) + 1,
  };
  return attachHistory({ ...fields }, link);
};

/**
 * `{ ...state, ...patch }` for a position that keeps its history. A plain
 * spread would read (and so assemble) the history and store the copy.
 */
export const withGameState = (
  state: GameState,
  patch: Partial<Omit<GameState, 'moveHistory'>>
): GameState => {
  const link = links.get(state);
  if (!link) return { ...state, ...patch };
  const next: Record<string, unknown> = {};
  for (const key of Object.keys(state)) {
    if (key !== 'moveHistory') next[key] = (state as unknown as Record<string, unknown>)[key];
  }
  Object.assign(next, patch);
  return attachHistory(next, link);
};

/** Test hook: how many move references assembled histories are holding. */
export const materializedHistoryEntryCount = (): number => {
  let total = 0;
  for (const history of materialized.values()) total += history.length;
  return total;
};

/** Whether this position stores its own history array rather than a link. */
export const hasStoredHistoryArray = (state: GameState): boolean => {
  const descriptor = Object.getOwnPropertyDescriptor(state, 'moveHistory');
  return !!descriptor && 'value' in descriptor;
};
