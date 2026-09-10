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

/**
 * Resigning wrote `RE`; counting did not. So the ordinary way to finish a Go
 * game -- play it out, pass twice, count -- was the one whose result vanished:
 * the panel showed W+7.0 and the exported SGF carried no result at all.
 */
describe('recording a counted result', () => {
  beforeEach(() => {
    analysisQueue.cancelWhere(() => true, 'test reset');
    analysisQueue.clearCache();
    useGameStore.getState().resetGame();
    useGameStore.getState().startNewGame({ boardSize: 9, komi: 7, rules: 'japanese', handicap: 0 });
    useGameStore.setState({ notification: null });
  });

  it('writes the result onto the node and the root once both players have passed', () => {
    useGameStore.getState().playMove(2, 2);
    useGameStore.getState().passTurn();
    useGameStore.getState().passTurn();
    useGameStore.getState().recordCountedResult('W+7.0');

    expect(useGameStore.getState().currentNode.endState).toBe('W+7.0');
    expect(useGameStore.getState().rootNode.properties?.RE?.[0]).toBe('W+7.0');
  });

  it('says whether it recorded, so only a real result is announced', () => {
    // Resigning announces its result and counting did not, which made the
    // ordinary way to end a game the silent one. The panel also estimates
    // mid-game, so the caller has to be able to tell the two apart before it
    // puts a result on screen.
    useGameStore.getState().playMove(2, 2);
    expect(useGameStore.getState().recordCountedResult('B+3.0'), 'mid-game estimate').toBe(false);

    useGameStore.getState().passTurn();
    useGameStore.getState().passTurn();
    expect(useGameStore.getState().recordCountedResult('W+7.0'), 'both passed').toBe(true);
    expect(useGameStore.getState().recordCountedResult('B+99.0'), 'already carries a result').toBe(false);
  });

  it('ignores a mid-game estimate, which is not a result', () => {
    useGameStore.getState().playMove(2, 2);
    useGameStore.getState().recordCountedResult('B+3.0');

    // A fresh node carries null here, not undefined.
    expect(useGameStore.getState().currentNode.endState ?? null).toBeNull();
    expect(useGameStore.getState().rootNode.properties?.RE?.[0]).toBeUndefined();
  });

  it('does not overwrite a result the game already carries', () => {
    // A loaded game's RE is what the players agreed; a count here is only this
    // app's arithmetic, and it must not quietly replace the record.
    useGameStore.getState().playMove(2, 2);
    useGameStore.getState().passTurn();
    useGameStore.getState().passTurn();
    useGameStore.getState().recordCountedResult('W+7.0');
    useGameStore.getState().recordCountedResult('B+99.0');

    expect(useGameStore.getState().currentNode.endState).toBe('W+7.0');
    expect(useGameStore.getState().rootNode.properties?.RE?.[0]).toBe('W+7.0');
  });

  it('leaves resignation alone, which already recorded itself', () => {
    useGameStore.getState().playMove(2, 2);
    useGameStore.getState().resign('black');
    expect(useGameStore.getState().currentNode.endState).toBe('W+R');
    expect(useGameStore.getState().rootNode.properties?.RE?.[0]).toBe('W+R');
  });
});
