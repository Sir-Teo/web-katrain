import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PhotoBoardModal } from '../src/components/PhotoBoardModal';
import type { BoardState } from '../src/types';

function boardWithStone(size: number, x: number, y: number, stone: 'black' | 'white'): BoardState {
  const board: BoardState = Array.from({ length: size }, () => Array.from({ length: size }, () => null));
  board[y]![x] = stone;
  return board;
}

describe('PhotoBoardModal', () => {
  it('renders current-board diff markers on the trace grid', () => {
    const html = renderToStaticMarkup(
      <PhotoBoardModal
        onClose={() => undefined}
        onImportSgf={() => undefined}
        defaultBoardSize={9}
        defaultKomi={6.5}
        currentBoard={boardWithStone(9, 0, 0, 'black')}
        currentPlayer="white"
      />,
    );

    expect(html).toContain('data-photo-board-delta-summary="true"');
    expect(html).toContain('data-photo-board-delta-toggle="true"');
    expect(html).toContain('Overlay on');
    expect(html).toContain('data-photo-board-delta-overlay="removed"');
    expect(html).toContain('data-photo-board-delta-marker="removed"');
    expect(html).toContain('data-photo-board-delta-player="black"');
    expect(html).toContain('data-photo-board-delta-list="true"');
    expect(html).toContain('data-photo-board-delta-list-item="removed"');
    expect(html).toContain('-B: 1');
    expect(html).toContain('-B A9');
  });

  it('names source controls and surfaces the selected photo source', () => {
    const source = readFileSync('src/components/PhotoBoardModal.tsx', 'utf8');

    expect(source).toContain('aria-label="Take board photo with camera"');
    expect(source).toContain('aria-label="Choose board photo file"');
    expect(source).toContain('data-photo-board-source-name="true"');
  });

  it('renders a clear empty state before a photo source is selected', () => {
    const html = renderToStaticMarkup(
      <PhotoBoardModal
        onClose={() => undefined}
        onImportSgf={() => undefined}
        defaultBoardSize={9}
        defaultKomi={6.5}
      />,
    );

    expect(html).toContain('data-photo-board-empty-source="true"');
    expect(html).toContain('No board photo selected');
  });
});
