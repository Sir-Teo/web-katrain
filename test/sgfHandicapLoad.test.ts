import { afterEach, describe, expect, it } from 'vitest';
import { useGameStore } from '../src/store/gameStore';
import { parseSgf } from '../src/utils/sgf';
import { countRootHandicapStones } from '../src/utils/handicapAi';

const load = (sgf: string) => {
  useGameStore.getState().loadGame(parseSgf(sgf));
  return useGameStore.getState();
};

const mainLineLength = () => {
  let node = useGameStore.getState().rootNode;
  let moves = 0;
  while (node.children[0]) {
    node = node.children[0];
    moves += 1;
  }
  return moves;
};

const stones = (board: ReturnType<typeof useGameStore.getState>['board'], color: 'black' | 'white') =>
  board.flat().filter((stone) => stone === color).length;

describe('loading handicap records', () => {
  afterEach(() => useGameStore.getState().resetGame());

  it('places no stone for HA[1], so a first move on Q16 loads', () => {
    const state = load('(;GM[1]FF[4]SZ[19]HA[1]KM[0.5];B[pd];W[dd];B[pp])');
    expect(stones(state.rootNode.gameState.board, 'black')).toBe(0);
    expect(state.rootNode.gameState.currentPlayer).toBe('black');
    expect(state.rootNode.properties?.PL).toBeUndefined();
    expect(state.rootNode.properties?.AB).toBeUndefined();
    expect(mainLineLength()).toBe(3);
  });

  it('does not place handicap stones twice when the first node places them', () => {
    const state = load('(;GM[1]SZ[19]HA[2];AB[dd][pp];W[pd];B[dp])');
    expect(stones(state.rootNode.gameState.board, 'black')).toBe(0);
    expect(mainLineLength()).toBe(3);
    let node = state.rootNode;
    while (node.children[0]) node = node.children[0];
    expect(stones(node.gameState.board, 'black')).toBe(3);
    expect(stones(node.gameState.board, 'white')).toBe(1);
  });

  it('still places declared handicap stones the file leaves out', () => {
    const state = load('(;GM[1]SZ[19]HA[2];W[qd])');
    expect(stones(state.rootNode.gameState.board, 'black')).toBe(2);
    expect(state.rootNode.properties?.PL).toEqual(['W']);
    expect(mainLineLength()).toBe(1);
  });

  it('gives HA[1] no handicap compensation in the manual count', () => {
    const state = load('(;GM[1]SZ[19]HA[1]RU[Chinese]KM[0.5];B[pd])');
    expect(countRootHandicapStones(state.rootNode)).toBe(0);
  });
});
