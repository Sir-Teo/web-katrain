import { beforeEach, describe, expect, it } from 'vitest';
import { useGameStore } from '../src/store/gameStore';
import { parseSgf, generateSgfFromTree } from '../src/utils/sgf';

const s = () => useGameStore.getState();

describe('Undo edit after playing on', () => {
  beforeEach(() => {
    s().resetGame();
    useGameStore.setState({ isAnalysisMode: false, isTeachMode: false, isAiPlaying: false, notification: null });
  });

  it('never takes away moves played since the edit', () => {
    s().loadGame(parseSgf('(;GM[1]SZ[9];B[dd];W[ee])'));
    s().navigateEnd();
    s().toggleBoardPointMarkup(0, 0); // the only edit: an X marker on move 2
    s().playMove(2, 2);               // keep playing the game
    s().playMove(6, 6);
    // The snapshot from before the moves is gone rather than restorable.
    s().undoEdit();
    s().toggleBoardPointMarkup(1, 1); // any new edit clears redo
    const sgf = generateSgfFromTree(s().rootNode);
    expect(sgf).toContain('B[cc]');   
    expect(sgf).toContain('W[gg]');
  });

  it('undoes a note as an edit of its own, before the marker', () => {
    s().loadGame(parseSgf('(;GM[1]SZ[9];B[dd];W[ee])'));
    s().navigateEnd();
    s().toggleBoardPointMarkup(0, 0);
    s().navigateBack();
    s().setCurrentNodeNote('important note');
    s().undoEdit();
    expect(s().rootNode.children[0]!.note ?? '').toBe('');
    expect(s().rootNode.children[0]!.children[0]!.properties?.MA).toEqual(['aa']);
    s().redoEdit();
    expect(s().rootNode.children[0]!.note).toBe('important note');
  });
});
