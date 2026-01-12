import { describe, expect, it } from 'vitest';
import { useGameStore } from '../src/store/gameStore';

describe('GameStore resign', () => {
  it('sets endState + root RE and stops AI', () => {
    const store = useGameStore.getState();
    store.resetGame();

    // Simulate an in-progress AI game without triggering engine calls.
    useGameStore.setState({ isAiPlaying: true, aiColor: 'black' });

    store.resign();

    const state = useGameStore.getState();
    expect(state.currentPlayer).toBe('black');
    expect(state.currentNode.endState).toBe('W+R');
    expect(state.rootNode.properties?.RE?.[0]).toBe('W+R');
    expect(state.isAiPlaying).toBe(false);
    expect(state.aiColor).toBe(null);
  });

  it('uses the opponent of currentPlayer as winner', () => {
    const store = useGameStore.getState();
    store.resetGame();

    store.playMove(3, 3);
    expect(useGameStore.getState().currentPlayer).toBe('white');

    store.resign();
    expect(useGameStore.getState().currentNode.endState).toBe('B+R');
    expect(useGameStore.getState().rootNode.properties?.RE?.[0]).toBe('B+R');
  });
});

