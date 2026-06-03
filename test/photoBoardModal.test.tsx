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
    expect(html).toContain('data-photo-board-delta-legend="true"');
    expect(html).toContain('Photo board diff legend');
    expect(html).toContain('Added in trace');
    expect(html).toContain('Missing from trace');
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

    expect(source).toContain("'Take board photo with camera'");
    expect(source).toContain("'No camera detected for board photo'");
    expect(source).toContain('aria-label="Choose board photo file"');
    expect(source).toContain('data-photo-board-source-name="true"');
  });

  it('marks the camera source unavailable when no camera is detected', () => {
    const source = readFileSync('src/components/PhotoBoardModal.tsx', 'utf8');

    expect(source).toContain('detectCameraAvailability');
    expect(source).toContain('data-photo-board-camera-state={cameraAvailability}');
    expect(source).toContain('disabled={cameraUnavailable}');
    expect(source).toContain('data-photo-board-camera-unavailable="true"');
    expect(source).toContain('No camera detected.');
  });

  it('resets hidden photo inputs so the same image can be selected again', () => {
    const source = readFileSync('src/components/PhotoBoardModal.tsx', 'utf8');

    expect(source).toContain('handlePhotoInputChange');
    expect(source).toContain("event.currentTarget.value = ''");
    expect(source).toContain('onChange={handlePhotoInputChange}');
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

  it('explains unavailable footer actions before stones are traced', () => {
    const html = renderToStaticMarkup(
      <PhotoBoardModal
        onClose={() => undefined}
        onImportSgf={() => undefined}
        defaultBoardSize={9}
        defaultKomi={6.5}
      />,
    );

    expect(html).toContain('data-photo-board-clear="true"');
    expect(html).toContain('title="No traced stones to clear"');
    expect(html).toContain('data-photo-board-import="true"');
    expect(html).toContain('title="Trace at least one stone to import a board position"');
  });

  it('advertises keyboard shortcuts for trace tools', () => {
    const html = renderToStaticMarkup(
      <PhotoBoardModal
        onClose={() => undefined}
        onImportSgf={() => undefined}
        defaultBoardSize={9}
        defaultKomi={6.5}
      />,
    );

    expect(html).toContain('title="Trace black stones (1, B)"');
    expect(html).toContain('aria-keyshortcuts="1 B"');
    expect(html).toContain('title="Trace white stones (2, W)"');
    expect(html).toContain('aria-keyshortcuts="2 W"');
    expect(html).toContain('title="Erase traced stones (3, E)"');
    expect(html).toContain('aria-keyshortcuts="3 E"');
  });

  it('keeps keyboard trace-tool changes available for the next paint', () => {
    const source = readFileSync('src/components/PhotoBoardModal.tsx', 'utf8');

    expect(source).toContain('toolRef.current = nextTool');
    expect(source).toContain('getPhotoBoardTracePaintValue(stones[index] ?? null, toolRef.current)');
    expect(source).toContain('activeElement.blur()');
  });
});
