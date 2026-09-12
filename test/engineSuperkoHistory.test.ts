import { beforeEach, describe, expect, it } from 'vitest';
import type { BoardState, GameNode, Player } from '../src/types';
import { BLACK, WHITE, setBoardSize, playMove, type SimPosition } from '../src/engine/katago/fastBoard';
import { createSuperkoHistory, stonesRepetitionKey, SuperkoHistory } from '../src/engine/katago/superkoHistory';
import { fillInputsV7FastForPosition } from '../src/engine/katago/positionInputsV7';
import { situationalKey } from '../src/utils/superko';
import { repetitionHistoryForNode } from '../src/utils/treeSuperko';
import { tripleKoFixture } from './helpers/superkoFixture';

const stonesOf = (board: BoardState) => Uint8Array.from(board.flat().map(c => c === 'black' ? 1 : c === 'white' ? 2 : 0));
const wire = (history: Array<{board: BoardState; playerToMove: Player}>) => history.map(p => situationalKey(p.board, p.playerToMove));

describe('complete repetition context', () => {
  beforeEach(() => setBoardSize(9));

  it.each([9, 13, 19])('uses the same exact encoding for mutable search boards of size %s', size => {
    setBoardSize(size);
    const board: BoardState = Array.from({length:size}, (_, y) => Array.from({length:size}, (_, x) => [null, 'black', 'white'][(x + y) % 3] as Player | null));
    for (const player of ['black', 'white'] as const) {
      expect(stonesRepetitionKey(stonesOf(board), player === 'black' ? 1 : 2)).toBe(situationalKey(board, player));
    }
  });

  it('transports only the selected line and deduplicates annotation and pass positions', () => {
    const {history} = tripleKoFixture();
    const nodes: GameNode[] = [];
    for (const p of history) {
      const node: GameNode = {id:String(nodes.length), parent:nodes.at(-1) ?? null, children:[], move:null,
        gameState:{board:p.board, currentPlayer:p.playerToMove, moveHistory:[], capturedBlack:0, capturedWhite:0, komi:7}};
      node.parent?.children.push(node);
      nodes.push(node);
    }
    const leaf = nodes.at(-1)!;
    const annotation = {...leaf, id:'annotation', parent:leaf};
    const sibling = {...leaf, id:'sibling', parent:nodes[0]!};
    nodes[0]!.children.push(sibling);
    expect(repetitionHistoryForNode(annotation, 'aga')).toEqual(wire(history).sort());
    expect(repetitionHistoryForNode(sibling, 'tromp-taylor')).toEqual([wire(history)[0]!, wire(history).at(-1)!].sort());
    expect(repetitionHistoryForNode(annotation, 'chinese')).toBeUndefined();
  });

  it.each(['situational', 'positional'] as const)('tracks repetitions inside a playout, preserves passes, and resets %s history', ko => {
    const {history, moves} = tripleKoFixture();
    const current = history[4]!;
    const tracker = new SuperkoHistory(ko, wire(history.slice(0, 5)));
    const pos: SimPosition = {stones:stonesOf(current.board), koPoint:-1};
    const baseHash = [tracker.hash0, tracker.hash1];
    playMove(pos, 15, BLACK, []); // G8, the fifth move of the cycle
    expect(moves[4]).toMatchObject({x:6,y:1});
    tracker.push(pos.stones, WHITE);
    const after = pos.stones.slice();
    const koPoint = pos.koPoint;
    expect(tracker.bannedMoves(pos, WHITE, true)[55]).toBe(1);
    expect(pos).toEqual({stones:after, koPoint});
    playMove(pos, 81, WHITE, []);
    tracker.push(pos.stones, BLACK);
    playMove(pos, 81, BLACK, []);
    tracker.push(pos.stones, WHITE);
    expect(tracker.bannedMoves(pos, WHITE, true)[55]).toBe(1);
    tracker.reset();
    expect([tracker.hash0, tracker.hash1]).toEqual(baseHash);
  });

  it('distinguishes positional from situational repetition with the opposite side to move', () => {
    const {history} = tripleKoFixture();
    const current = history.at(-1)!;
    const previous = history[0]!;
    const pastWithOppositeTurn = [situationalKey(previous.board, 'white')];
    const pos = {stones:stonesOf(current.board), koPoint:-1};
    expect(new SuperkoHistory('situational', pastWithOppositeTurn).bannedMoves(pos, WHITE, false)[55]).toBe(0);
    expect(new SuperkoHistory('positional', pastWithOppositeTurn).bannedMoves(pos, WHITE, true)[55]).toBe(1);
  });

  it.each([BLACK, WHITE])('detects self-capture repetitions and restores the simulation for color %s', player => {
    const opponent = player === BLACK ? WHITE : BLACK;
    const stones = new Uint8Array(81);
    stones[0] = player;
    for (const p of [2, 9, 10]) stones[p] = opponent;
    const after = stones.slice(); after[0] = 0;
    const pos = {stones, koPoint:80};
    const before = stones.slice();
    const tracker = new SuperkoHistory('situational', [stonesRepetitionKey(after, opponent)]);
    expect(tracker.bannedMoves(pos, player, true)[1]).toBe(1);
    expect(tracker.bannedMoves(pos, player, false)[1]).toBe(0); // already illegal as suicide
    expect(pos).toEqual({stones:before, koPoint:80});
  });

  it('separates graph contexts, ignores duplicate history, and validates child reuse', () => {
    const {history} = tripleKoFixture();
    const full = wire(history);
    const tracker = new SuperkoHistory('situational', full.slice(0, -1));
    const next = new SuperkoHistory('situational', full);
    const reordered = new SuperkoHistory('situational', [...full].reverse().concat(full));
    const changed = new SuperkoHistory('situational', full.slice(1));
    expect([next.hash0, next.hash1]).toEqual([reordered.hash0, reordered.hash1]);
    expect([next.hash0, next.hash1]).not.toEqual([changed.hash0, changed.hash1]);
    expect(tracker.isContinuation(next, stonesOf(history.at(-1)!.board), WHITE)).toBe(true);
    expect(tracker.isContinuation(changed, stonesOf(history.at(-1)!.board), WHITE)).toBe(false);
  });

  it('keeps asymmetric history from being folded into symmetric root candidates', () => {
    const board: BoardState = Array.from({length:9}, () => Array(9).fill(null));
    const past = board.map(r => [...r]); past[0]![0] = 'black';
    const identity = Int16Array.from({length:81}, (_, p) => p);
    const reflected = Int16Array.from({length:81}, (_, p) => Math.floor(p / 9) * 9 + 8 - p % 9);
    const empty = createSuperkoHistory({board, currentPlayer:'black', rules:'aga'})!;
    const asymmetric = createSuperkoHistory({board, currentPlayer:'black', rules:'aga', repetitionHistory:[situationalKey(past, 'white')]})!;
    expect(empty.isSymmetryInvariant(reflected)).toBe(true);
    expect(asymmetric.isSymmetryInvariant(identity)).toBe(true);
    expect(asymmetric.isSymmetryInvariant(reflected)).toBe(false);
  });

  it.each(['aga', 'new-zealand', 'tromp-taylor', 'chinese'] as const)('places %s superko bans in standalone neural plane 6', rules => {
    const {history, moves} = tripleKoFixture();
    const current = history.at(-1)!;
    const spatial = new Float32Array(81 * 22);
    fillInputsV7FastForPosition({board:current.board, previousBoard:history[4]!.board, previousPreviousBoard:history[3]!.board,
      currentPlayer:current.playerToMove, moveHistory:moves, repetitionHistory:wire(history), rules, komi:7,
      conservativePassAndIsRoot:false, outSpatial:spatial, outGlobal:new Float32Array(19)});
    expect(spatial[55 * 22 + 6]).toBe(rules === 'chinese' ? 0 : 1);
    expect(spatial[16 * 22 + 6]).toBe(1); // H8 remains forbidden by simple ko
  });
});
