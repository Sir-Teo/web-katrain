import { describe, expect, it } from 'vitest';
import { createEmptyBoard } from '../src/utils/boardSize';
import { formatBoardTextDiagram, parseBoardTextDiagram, sgfFromBoardTextDiagram } from '../src/utils/boardTextDiagram';

const emptyRow = '. . . . . . . . .';

describe('pasting a text diagram', () => {
  it('reads a full-board Sensei diagram drawn with + corners', () => {
    const rows = Array.from({ length: 9 }, (_, y) => `$$ | ${y === 0 ? '. . X . . . . . .' : emptyRow} |`);
    const text = ['$$B', '$$ +-------------------+', ...rows, '$$ +-------------------+'].join('\n');

    const board = parseBoardTextDiagram(text);
    expect(board).not.toBeNull();
    expect(board!.length).toBe(9);
    expect(board![0]![2]).toBe('black');
  });

  it('reads a white stone written as 0 at the edge of a row', () => {
    const text = ['0 . . . . . . . .', '. . X . . . . . .', ...Array(7).fill(emptyRow), ''].join('\n');

    const board = parseBoardTextDiagram(text);
    expect(board?.[0]?.[0]).toBe('white');
    expect(board?.[1]?.[2]).toBe('black');
  });

  it('still ignores real row numbers on either side', () => {
    const rows = Array.from({ length: 9 }, (_, y) => `${9 - y} ${y === 8 ? 'X . . . . . . . 0' : emptyRow} ${9 - y}`);
    const board = parseBoardTextDiagram(rows.join('\n'));
    expect(board?.[8]?.[0]).toBe('black');
    expect(board?.[8]?.[8]).toBe('white');
  });

  it('keeps the side to move when the app pastes its own diagram back', () => {
    const board = createEmptyBoard(9);
    board[2]![2] = 'black';
    const text = formatBoardTextDiagram({ board, toPlay: 'white' });

    expect(sgfFromBoardTextDiagram(text)).toContain('PL[W]');
  });

  it("reads Sensei's $$W header as White to move", () => {
    const rows = Array.from({ length: 9 }, (_, y) => `$$ | ${y === 0 ? 'X . . . . . . . .' : emptyRow} |`);
    expect(sgfFromBoardTextDiagram(['$$W', ...rows].join('\n'))).toContain('PL[W]');
    expect(sgfFromBoardTextDiagram(rows.join('\n'))).not.toContain('PL[');
  });
});
