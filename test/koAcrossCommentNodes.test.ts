import { beforeEach, describe, expect, it } from 'vitest';
import { useGameStore } from '../src/store/gameStore';
import { parseSgf } from '../src/utils/sgf';

const s = () => useGameStore.getState();

beforeEach(() => {
  s().resetGame();
});

// Black takes the ko at F5 (fe), capturing White's E5 (ee).
const KO = '(;GM[1]FF[4]SZ[9]AB[ed][de][ef]AW[fd][ge][ff][ee];B[fe]';

describe('simple ko', () => {
  it('forbids the immediate recapture', () => {
    s().loadGame(parseSgf(`${KO})`));
    s().navigateEnd();
    const before = s().currentNode;
    s().playMove(4, 4);
    expect(s().currentNode).toBe(before);
  });

  it('still forbids it with a comment between the capture and the reply', () => {
    s().loadGame(parseSgf(`${KO};C[Black took the ko])`));
    s().navigateEnd();
    const before = s().currentNode;
    s().playMove(4, 4);
    expect(s().currentNode).toBe(before);
    expect(s().board[4]![5]).toBe('black');
  });

  it('does not treat a board that setup changed as a ko', () => {
    s().loadGame(parseSgf('(;GM[1]FF[4]SZ[9]RU[Japanese];B[ee];W[cc];B[gg];W[cg];AE[gg])'));
    s().navigateEnd();
    s().playMove(6, 6);
    expect(s().currentNode.move).toMatchObject({ x: 6, y: 6, player: 'black' });
  });
});

describe('the history the engine is given', () => {
  it('skips a comment node, so the ko point can still be found', async () => {
    const { engineHistoryBoards } = await import('../src/utils/positionHistory');
    s().loadGame(parseSgf(`${KO};C[Black took the ko])`));
    s().navigateEnd();
    const comment = s().currentNode;
    const capture = comment.parent!;

    const history = engineHistoryBoards(comment);
    expect(history.previousBoard).toBe(capture.parent!.gameState.board);
    expect(history.previousBoard).toEqual(engineHistoryBoards(capture).previousBoard);
    expect(history.previousBoard![4]![4]).toBe('white');
  });

  it('gives no history after setup that changed the board', async () => {
    const { engineHistoryBoards } = await import('../src/utils/positionHistory');
    s().loadGame(parseSgf('(;GM[1]FF[4]SZ[9];B[ee];W[cc];AE[ee])'));
    s().navigateEnd();
    expect(engineHistoryBoards(s().currentNode)).toEqual({ previousBoard: undefined, previousPreviousBoard: undefined });
  });
});
