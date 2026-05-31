import { afterEach, describe, expect, it, vi } from 'vitest';
import { useGameStore } from '../src/store/gameStore';

describe('GameStore passTurn AI behavior', () => {
  afterEach(() => {
    vi.useRealTimers();
    useGameStore.getState().resetGame();
  });

  it('creates and reuses a pass child from the current position', () => {
    const store = useGameStore.getState();
    store.resetGame();

    const initialTreeVersion = useGameStore.getState().treeVersion;
    store.passTurn();

    const passNode = useGameStore.getState().currentNode;
    expect(passNode.move).toEqual({ x: -1, y: -1, player: 'black' });
    expect(passNode.parent?.children).toHaveLength(1);
    expect(useGameStore.getState().currentPlayer).toBe('white');
    expect(useGameStore.getState().treeVersion).toBe(initialTreeVersion + 1);

    useGameStore.getState().navigateBack();
    useGameStore.getState().passTurn();

    const afterReuse = useGameStore.getState();
    expect(afterReuse.currentNode.id).toBe(passNode.id);
    expect(afterReuse.currentNode.parent?.children).toHaveLength(1);
  });

  it('schedules an AI move after passing into AI turn', () => {
    vi.useFakeTimers();

    const store = useGameStore.getState();
    store.resetGame();

    const originalMakeAiMove = store.makeAiMove;
    const makeAiMoveSpy = vi.fn();
    useGameStore.setState({ makeAiMove: makeAiMoveSpy as unknown as typeof originalMakeAiMove });

    useGameStore.setState({ isAiPlaying: true, aiColor: 'white' });

    store.passTurn();
    expect(makeAiMoveSpy).not.toHaveBeenCalled();

    vi.advanceTimersByTime(499);
    expect(makeAiMoveSpy).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(makeAiMoveSpy).toHaveBeenCalledTimes(1);

    useGameStore.setState({ makeAiMove: originalMakeAiMove });
  });

  it('does not schedule an AI move after the second consecutive pass', () => {
    vi.useFakeTimers();

    const store = useGameStore.getState();
    store.resetGame();

    const originalMakeAiMove = store.makeAiMove;
    const makeAiMoveSpy = vi.fn();
    useGameStore.setState({ makeAiMove: makeAiMoveSpy as unknown as typeof originalMakeAiMove });

    useGameStore.setState({ isAiPlaying: true, aiColor: 'black' });

    store.passTurn(); // B pass -> W to play
    store.passTurn(); // W pass -> game ended, B to play (AI), but should not auto-move

    vi.runAllTimers();
    expect(makeAiMoveSpy).not.toHaveBeenCalled();

    useGameStore.setState({ makeAiMove: originalMakeAiMove });
  });
});
