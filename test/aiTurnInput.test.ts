import { afterEach, describe, expect, it, vi } from 'vitest';
import { useGameStore } from '../src/store/gameStore';
import { getPlayerUndoSteps } from '../src/utils/playerUndo';

const withAiSpy = () => {
  const original = useGameStore.getState().makeAiMove;
  const spy = vi.fn();
  useGameStore.setState({ makeAiMove: spy as unknown as typeof original });
  return { spy, restore: () => useGameStore.setState({ makeAiMove: original }) };
};

describe('player input on the AI turn', () => {
  afterEach(() => {
    vi.useRealTimers();
    useGameStore.getState().resetGame();
  });

  it('does not record a second Pass as the AI’s pass while it thinks', () => {
    vi.useFakeTimers();
    useGameStore.getState().resetGame();
    const { spy, restore } = withAiSpy();
    useGameStore.setState({ isAiPlaying: true, aiColor: 'white' });

    useGameStore.getState().passTurn();
    const afterFirst = useGameStore.getState().currentNode;
    useGameStore.getState().passTurn();

    const state = useGameStore.getState();
    expect(state.currentNode.id).toBe(afterFirst.id);
    expect(state.currentPlayer).toBe('white');
    expect(state.notification?.message).toMatch(/AI is to move/);
    vi.advanceTimersByTime(500);
    expect(spy).toHaveBeenCalledTimes(1);
    restore();
  });

  it('does not place a stone in the AI’s colour, and wakes an idle AI', () => {
    vi.useFakeTimers();
    useGameStore.getState().resetGame();
    const { spy, restore } = withAiSpy();
    // The AI to move at the end of the line with nothing scheduled -- as after
    // stepping forward onto its turn.
    useGameStore.setState({ isAiPlaying: true, aiColor: 'black', isAiThinking: false });

    useGameStore.getState().playMove(3, 3);

    expect(useGameStore.getState().currentNode.parent).toBeNull();
    vi.runAllTimers();
    expect(spy).toHaveBeenCalledTimes(1);
    restore();
  });

  it('still lets the player try a variation at an earlier AI-to-move position', () => {
    useGameStore.getState().resetGame();
    useGameStore.getState().playMove(3, 3);
    useGameStore.getState().playMove(15, 15);
    useGameStore.getState().navigateBack();
    useGameStore.setState({ isAiPlaying: true, aiColor: 'white' });

    useGameStore.getState().playMove(15, 3);

    expect(useGameStore.getState().currentNode.move).toEqual({ x: 15, y: 3, player: 'white' });
  });

  it('lets the player resume play after the game ended on two passes', () => {
    useGameStore.getState().resetGame();
    useGameStore.getState().passTurn();
    useGameStore.getState().passTurn();
    useGameStore.setState({ isAiPlaying: true, aiColor: 'black' });

    useGameStore.getState().playMove(3, 3);

    expect(useGameStore.getState().currentNode.move).toEqual({ x: 3, y: 3, player: 'black' });
  });
});

describe('getPlayerUndoSteps', () => {
  afterEach(() => useGameStore.getState().resetGame());

  it('takes back the AI reply and the player’s move together', () => {
    useGameStore.getState().resetGame();
    useGameStore.getState().playMove(3, 3);
    useGameStore.getState().playMove(15, 15);
    const state = { ...useGameStore.getState(), isAiPlaying: true, aiColor: 'white' as const };
    expect(getPlayerUndoSteps(state)).toBe(2);
  });

  it('declines when the AI’s reply was the first move, instead of stalling at the root', () => {
    useGameStore.getState().resetGame();
    useGameStore.getState().playMove(3, 3);
    const state = { ...useGameStore.getState(), isAiPlaying: true, aiColor: 'black' as const };
    expect(getPlayerUndoSteps(state)).toBe(0);
  });

  it('steps once outside an AI game and does nothing at the root', () => {
    useGameStore.getState().resetGame();
    expect(getPlayerUndoSteps(useGameStore.getState())).toBe(0);
    useGameStore.getState().playMove(3, 3);
    expect(getPlayerUndoSteps(useGameStore.getState())).toBe(1);
  });
});
