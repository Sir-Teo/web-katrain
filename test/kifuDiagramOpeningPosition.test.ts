import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { useGameStore } from '../src/store/gameStore';
import { getCurrentLineNodes } from '../src/utils/branchNavigation';
import { buildKifuDiagrams } from '../src/utils/kifuDiagrams';

describe('a kifu diagram opens on the position before its first move', () => {
  it('keeps an earlier stone that a move in the range captures', () => {
    const s = useGameStore.getState();
    s.startNewGame({ komi: 6.5, rules: 'japanese', boardSize: 9, handicap: 0 });
    const seq: Array<[number, number]> = [
      [4, 4], [0, 0], [1, 0], [8, 8], [8, 0], [7, 8], [8, 1], [6, 8], [7, 0], [5, 8], // 1-10
      [0, 1], [4, 8], [2, 2], [3, 8], [2, 4], [2, 8], [6, 6], [1, 8], [6, 2], [0, 8], // 11-20
    ];
    for (const [x, y] of seq) useGameStore.getState().playMove(x, y);
    const st = useGameStore.getState();
    const line = getCurrentLineNodes(st.currentNode, st.activeBranchChildIds).filter((n) => n.move);
    expect(line.length).toBe(20);
    // sanity: move 11 captured W at (0,0)
    expect(line[10]!.gameState.board[0]![0]).toBeNull();

    const [fig1, fig2] = buildKifuDiagrams(line, 10);
    expect(fig1!.board[0]![0]).toBe('white'); // move 2 shown in figure 1
    // Figure 2 (moves 11-20) shows B11 at A8 (0,1) but not the stone it captured,
    // so the figure cannot be replayed: 11 appears to capture nothing.
    expect(fig2!.board[0]![0]).toBe('white');
  });
});

describe('Guess the Move', () => {
  it('ignores a click on a point that already holds a stone', () => {
    const source = readFileSync('src/components/GuessMoveModal.tsx', 'utf8');
    const handler = source.slice(source.indexOf('const handleGuess'), source.indexOf('const handleShowAnswer'));

    // Every point is a click target; a tap on a stone was graded and counted.
    expect(handler).toMatch(/if \(current\.board\[y\]\?\.\[x\]\) return;[\s\S]*scoreGuess/);
  });
});
