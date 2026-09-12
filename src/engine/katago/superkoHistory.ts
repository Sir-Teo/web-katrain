import type { BoardState, GameRules, Player } from '../../types';
import { isSuicideLegal, rulesOf, type KoRule } from '../../utils/goRules';
import { situationalKey } from '../../utils/superko';
import {
  BLACK, EMPTY, BOARD_AREA, BOARD_SIZE, NEIGHBOR_STARTS, NEIGHBOR_COUNTS, NEIGHBOR_LIST,
  computeLibertyMap, opponentOf, playMove, undoMove, type SimPosition, type StoneColor,
} from './fastBoard';

/** Same exact base-3 encoding as positionalKey, for mutable search boards. */
export function stonesRepetitionKey(stones: Uint8Array, player: StoneColor): string {
  let key = `${player === BLACK ? 'b' : 'w'}|${BOARD_SIZE}:`;
  for (let p = 0; p < BOARD_AREA; p += 3) {
    key += String.fromCharCode(65 + stones[p]! * 9 + (stones[p + 1] ?? 0) * 3 + (stones[p + 2] ?? 0));
  }
  return key;
}

function hashKey(key: string): [number, number] {
  let h0 = 0x811c9dc5;
  let h1 = 0x9e3779b9;
  for (let i = 0; i < key.length; i++) {
    const c = key.charCodeAt(i);
    h0 = Math.imul(h0 ^ c, 0x01000193);
    h1 = Math.imul(h1 ^ c, 0x85ebca6b);
  }
  return [h0, h1];
}

/** Full game history plus the current playout. Exact strings decide legality;
 * the unordered set fingerprint only separates graph-search contexts. */
export class SuperkoHistory {
  readonly ko: Exclude<KoRule, 'simple'>;
  private readonly base: Set<string>;
  private readonly path = new Set<string>();
  private readonly baseOccupied = new Uint8Array(BOARD_AREA);
  private readonly occupied = new Uint8Array(BOARD_AREA);
  private readonly baseHash: [number, number] = [0, 0];
  hash0 = 0;
  hash1 = 0;

  constructor(ko: Exclude<KoRule, 'simple'>, history: readonly string[]) {
    this.ko = ko;
    this.base = new Set(history.map(key => this.normalize(key)));
    for (const key of this.base) {
      const [h0, h1] = hashKey(key);
      this.baseHash[0] ^= h0;
      this.baseHash[1] ^= h1;
      const boardKey = ko === 'situational' ? key.slice(2) : key;
      const prefix = `${BOARD_SIZE}:`;
      if (!boardKey.startsWith(prefix) || boardKey.length !== prefix.length + Math.ceil(BOARD_AREA / 3)) {
        throw new Error('Repetition history has the wrong board size');
      }
      for (let p = 0; p < BOARD_AREA; p++) {
        const value = boardKey.charCodeAt(prefix.length + Math.floor(p / 3)) - 65;
        if (value < 0 || value > 26) throw new Error('Invalid repetition history encoding');
        if (Math.floor(value / 3 ** (2 - p % 3)) % 3 !== 0) this.baseOccupied[p] = 1;
      }
    }
    this.reset();
  }

  private normalize(key: string): string {
    if (!/^[bw]\|/.test(key)) throw new Error('Repetition history is missing its player');
    return this.ko === 'situational' ? key : key.slice(2);
  }

  reset(): void {
    this.path.clear();
    this.occupied.set(this.baseOccupied);
    [this.hash0, this.hash1] = this.baseHash;
  }

  withPosition(stones: Uint8Array, player: StoneColor): SuperkoHistory {
    const history = [...this.base].map(key => this.ko === 'situational' ? key : `b|${key}`);
    history.push(stonesRepetitionKey(stones, player));
    return new SuperkoHistory(this.ko, history);
  }

  isSymmetryInvariant(map: ArrayLike<number>): boolean {
    const transformed = new Uint8Array(BOARD_AREA);
    for (const key of this.base) {
      const boardKey = this.ko === 'situational' ? key.slice(2) : key;
      const offset = boardKey.indexOf(':') + 1;
      for (let p = 0; p < BOARD_AREA; p++) {
        const packed = boardKey.charCodeAt(offset + Math.floor(p / 3)) - 65;
        transformed[map[p]!] = Math.floor(packed / 3 ** (2 - p % 3)) % 3;
      }
      const player = this.ko === 'situational' && key[0] === 'w' ? 2 : 1;
      if (!this.base.has(this.normalize(stonesRepetitionKey(transformed, player)))) return false;
    }
    return true;
  }

  push(stones: Uint8Array, playerToMove: StoneColor): void {
    const key = this.normalize(stonesRepetitionKey(stones, playerToMove));
    if (!this.base.has(key) && !this.path.has(key)) {
      this.path.add(key);
      const [h0, h1] = hashKey(key);
      this.hash0 ^= h0;
      this.hash1 ^= h1;
    }
    for (let p = 0; p < BOARD_AREA; p++) if (stones[p] !== EMPTY) this.occupied[p] = 1;
  }

  /** Re-rooting can preserve children only when the new request describes the
   * same history set as the old root followed by that one legal move. */
  isContinuation(history: SuperkoHistory, stones: Uint8Array, player: StoneColor): boolean {
    if (this.ko !== history.ko) return false;
    const expected = new Set(this.base);
    expected.add(this.normalize(stonesRepetitionKey(stones, player)));
    return expected.size === history.base.size && [...expected].every(key => history.base.has(key));
  }

  bannedMoves(pos: SimPosition, player: StoneColor, suicideLegal: boolean, libertyMap?: Uint8Array): Uint8Array {
    const banned = new Uint8Array(BOARD_AREA);
    const libs = libertyMap ?? computeLibertyMap(pos.stones);
    const captures: number[] = [];
    const opponent = opponentOf(player);
    for (let p = 0; p < BOARD_AREA; p++) {
      if (pos.stones[p] !== EMPTY || p === pos.koPoint) continue;
      let gainsLiberty = false;
      let joinsFriend = false;
      for (let i = 0; i < NEIGHBOR_COUNTS[p]!; i++) {
        const n = NEIGHBOR_LIST[NEIGHBOR_STARTS[p]! + i]!;
        const color = pos.stones[n];
        if (color === EMPTY || (color === opponent && libs[n] === 1) || (color === player && libs[n]! > 1)) gainsLiberty = true;
        if (color === player) joinsFriend = true;
      }
      const selfCapture = !gainsLiberty;
      if (selfCapture && !(suicideLegal && joinsFriend)) continue;
      // KataGo's cheap exclusion: a new stone at a never-occupied point cannot
      // recreate any earlier board. Self-capture still needs the exact check.
      if (!this.occupied[p] && !selfCapture) continue;
      const undo = playMove(pos, p, player, captures, suicideLegal);
      try {
        const key = this.normalize(stonesRepetitionKey(pos.stones, opponent));
        if (this.base.has(key) || this.path.has(key)) banned[p] = 1;
      } finally {
        undoMove(pos, p, player, undo, captures);
      }
    }
    return banned;
  }
}

export function createSuperkoHistory(args: {
  board: BoardState;
  currentPlayer: Player;
  rules: GameRules;
  repetitionHistory?: readonly string[];
}): SuperkoHistory | null {
  const ko = rulesOf(args.rules).ko;
  if (ko === 'simple') return null;
  // Direct API callers can start at an arbitrary setup board. Its current
  // position always counts, even when no pre-root history was supplied.
  return new SuperkoHistory(ko, [...(args.repetitionHistory ?? []), situationalKey(args.board, args.currentPlayer)]);
}

export function positionSuperkoBans(args: Parameters<typeof createSuperkoHistory>[0], pos: SimPosition, libs?: Uint8Array): Uint8Array | undefined {
  return createSuperkoHistory(args)?.bannedMoves(pos, args.currentPlayer === 'black' ? 1 : 2, isSuicideLegal(args.rules), libs);
}
