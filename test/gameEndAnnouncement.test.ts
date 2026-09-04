import { beforeEach, describe, expect, it } from 'vitest';
import { useGameStore } from '../src/store/gameStore';
import { analysisQueue } from '../src/utils/analysisQueue';

/**
 * Two passes end a Go game, and the only sign of it was a small "Game ended"
 * chip in the game strip. That assumes the reader already knows the rule and
 * knows that someone now has to count -- which is exactly what a beginner does
 * not know, and they are the ones most likely to be playing to the end here.
 */
describe('game end announcement', () => {
  beforeEach(() => {
    analysisQueue.cancelWhere(() => true, 'test reset');
    analysisQueue.clearCache();
    useGameStore.getState().resetGame();
    useGameStore.getState().startNewGame({ boardSize: 9, komi: 7, rules: 'japanese', handicap: 0 });
    useGameStore.setState({ notification: null });
  });

  it('says nothing after a single pass', () => {
    useGameStore.getState().passTurn();
    expect(useGameStore.getState().notification).toBeNull();
  });

  it('names the control that counts once both players have passed', () => {
    useGameStore.getState().passTurn();
    useGameStore.getState().passTurn();

    const notification = useGameStore.getState().notification;
    expect(notification?.type).toBe('info');
    expect(notification?.message).toContain('Both players passed');
    // Naming "Score" matters more than saying the game is over: the board still
    // accepts moves afterwards, so "over" alone leaves nothing to do next.
    expect(notification?.message).toContain('Score');
  });

  it('announces again when the player passes back into the finished position', () => {
    useGameStore.getState().passTurn();
    useGameStore.getState().passTurn();
    useGameStore.setState({ notification: null });

    // Navigating back and passing again takes the other branch of `passTurn`,
    // the one that re-enters an existing child rather than building a node.
    useGameStore.getState().navigateBack();
    useGameStore.getState().passTurn();

    expect(useGameStore.getState().notification?.message).toContain('Both players passed');
  });

  it('still announces when a move separates the two passes from the start', () => {
    useGameStore.getState().playMove(2, 2);
    useGameStore.getState().playMove(6, 6);
    useGameStore.getState().passTurn();
    expect(useGameStore.getState().notification).toBeNull();
    useGameStore.getState().passTurn();
    expect(useGameStore.getState().notification?.message).toContain('Both players passed');
  });
});
