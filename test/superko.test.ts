import { describe, expect, it } from 'vitest';
import {
  positionalKey,
  situationalKey,
  superkoKey,
  superkoRejectionMessage,
  violatesSuperko,
  type SuperkoPosition,
} from '../src/utils/superko';
import { useGameStore } from '../src/store/gameStore';
import type { BoardState, Player } from '../src/types';

const board = (rows: string[]): BoardState =>
  rows.map((row) => [...row].map((c) => (c === 'b' ? 'black' : c === 'w' ? 'white' : null) as Player | null));

const EMPTY3 = board(['...', '...', '...']);
const ONE_BLACK = board(['b..', '...', '...']);

describe('position keys', () => {
  it('ignores the side to move for positional, keeps it for situational', () => {
    expect(positionalKey(ONE_BLACK)).toBe('3:JAA');
    expect(situationalKey(ONE_BLACK, 'white')).toBe('w|3:JAA');
    expect(situationalKey(ONE_BLACK, 'black')).not.toBe(situationalKey(ONE_BLACK, 'white'));
  });

  it('picks the key the ko rule calls for', () => {
    const position: SuperkoPosition = { board: ONE_BLACK, playerToMove: 'white' };
    expect(superkoKey('positional', position)).toBe(positionalKey(ONE_BLACK));
    expect(superkoKey('situational', position)).toBe(situationalKey(ONE_BLACK, 'white'));
  });

  it('distinguishes every possible 3×3 board without hash collisions', () => {
    const keys = new Set<string>();
    const cells = [null, 'black', 'white'] as const;
    for (let layout = 0; layout < 3 ** 9; layout++) {
      let value = layout;
      const position = Array.from({ length: 3 }, () => Array.from({ length: 3 }, () => {
        const stone = cells[value % 3]!;
        value = Math.floor(value / 3);
        return stone;
      }));
      keys.add(positionalKey(position));
    }
    expect(keys.size).toBe(3 ** 9);
  });

  it.each([9, 13, 19])('preserves the final intersection on a size-%s board', size => {
    const position: BoardState = Array.from({ length: size }, () => Array(size).fill(null));
    const empty = positionalKey(position);
    position[size - 1]![size - 1] = 'black';
    const black = positionalKey(position);
    position[size - 1]![size - 1] = 'white';
    const white = positionalKey(position);
    expect(new Set([empty, black, white]).size).toBe(3);
    expect(empty.startsWith(`${size}:`)).toBe(true);
    expect(empty.length).toBe(String(size).length + 1 + Math.ceil(size * size / 3));
    expect(positionalKey(position.map(row => [...row]))).toBe(white);
  });
});

describe('violatesSuperko', () => {
  it('never fires under simple ko', () => {
    expect(
      violatesSuperko({
        ko: 'simple',
        next: { board: EMPTY3, playerToMove: 'black' },
        history: [{ board: EMPTY3, playerToMove: 'black' }],
      })
    ).toBe(false);
  });

  it('catches a repeated position under positional superko', () => {
    expect(
      violatesSuperko({
        ko: 'positional',
        next: { board: EMPTY3, playerToMove: 'black' },
        // Same layout, other player to move: still banned positionally.
        history: [{ board: EMPTY3, playerToMove: 'white' }],
      })
    ).toBe(true);
  });

  it('only catches same-player repeats under situational superko', () => {
    const history = [{ board: EMPTY3, playerToMove: 'white' as Player }];
    expect(violatesSuperko({ ko: 'situational', next: { board: EMPTY3, playerToMove: 'black' }, history })).toBe(
      false
    );
    expect(violatesSuperko({ ko: 'situational', next: { board: EMPTY3, playerToMove: 'white' }, history })).toBe(
      true
    );
  });

  it('allows a position that has not occurred', () => {
    expect(
      violatesSuperko({
        ko: 'positional',
        next: { board: ONE_BLACK, playerToMove: 'white' },
        history: [{ board: EMPTY3, playerToMove: 'black' }],
      })
    ).toBe(false);
  });

  it('names the rule that refused the move', () => {
    expect(superkoRejectionMessage('positional')).toContain('Positional superko');
    expect(superkoRejectionMessage('situational')).toContain('same player to move');
  });
});

describe('the store enforces the ruleset when playing', () => {
  it('allows multi-stone suicide only where the rules do', () => {
    const store = useGameStore.getState();

    const setup = (rules: 'japanese' | 'new-zealand') => {
      store.resetGame();
      useGameStore.getState().updateSettings({ gameRules: rules });
      // White encloses the two points (1,1) and (2,1):
      //   w w w .
      //   w . . w
      //   w w w .
      const stones: Array<{ x: number; y: number; player: Player }> = [
        { x: 0, y: 0, player: 'white' },
        { x: 1, y: 0, player: 'white' },
        { x: 2, y: 0, player: 'white' },
        { x: 0, y: 1, player: 'white' },
        { x: 3, y: 1, player: 'white' },
        { x: 0, y: 2, player: 'white' },
        { x: 1, y: 2, player: 'white' },
        { x: 2, y: 2, player: 'white' },
      ];
      useGameStore.getState().applySetupStones(stones);
      // Black takes one of the two points; White answers far away.
      useGameStore.getState().playMove(1, 1);
      useGameStore.getState().playMove(18, 18);
      return useGameStore.getState();
    };

    // Under Japanese rules the self-atari fill is refused.
    let state = setup('japanese');
    const before = state.currentNode.id;
    useGameStore.getState().playMove(2, 1);
    expect(useGameStore.getState().currentNode.id).toBe(before);

    // Under New Zealand rules the same move is legal, and the group it kills
    // comes off the board as White's prisoners.
    state = setup('new-zealand');
    const beforeNz = state.currentNode.id;
    const prisonersBefore = useGameStore.getState().capturedBlack;
    useGameStore.getState().playMove(2, 1);
    const after = useGameStore.getState();
    expect(after.currentNode.id).not.toBe(beforeNz);
    expect(after.board[1]![1]).toBeNull();
    expect(after.board[1]![2]).toBeNull();
    expect(after.capturedBlack).toBe(prisonersBefore + 2);

    useGameStore.getState().updateSettings({ gameRules: 'japanese' });
    useGameStore.getState().resetGame();
  });
});
