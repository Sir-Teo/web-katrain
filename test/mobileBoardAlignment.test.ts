import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('mobile board alignment', () => {
  it('centers the board within its full-height wrapper at every breakpoint', () => {
    const boardSource = readFileSync('src/components/GoBoard.tsx', 'utf8');

    expect(boardSource).toContain('className="go-board-container');
    expect(boardSource).toContain('data-board-container="true"');
    expect(boardSource).toContain('flex items-center justify-center');
    expect(boardSource).not.toContain('portrait:items-start');
  });

  it('leaves the canvas alignment alone and places the board with padding', () => {
    const layoutSource = readFileSync('src/components/Layout.tsx', 'utf8');
    const start = layoutSource.indexOf("'mobile-board-canvas flex-1");
    const canvas = layoutSource.slice(start, layoutSource.indexOf('<GoBoard', start));
    // Guard the slice itself: an empty string would satisfy every negative
    // assertion below without checking anything.
    expect(start).toBeGreaterThan(-1);
    expect(canvas).toContain('mobile-board-canvas--edit');

    // The shell takes the canvas's content box exactly, so align-items has no
    // free space to distribute: measured in board, edit and scoring portrait,
    // flex-start and center put the board on the same pixel. Shrinking the box
    // is what lifts the board clear of the edit and scoring strips.
    // Assert on the class strings only — the comment above them names the class
    // it removed, and matching that would fail for the wrong reason.
    const classNames = canvas
      .split('\n')
      .filter((line) => !line.trim().startsWith('//'))
      .join('\n');
    expect(classNames).not.toContain('portrait:items-start');
    expect(classNames).toContain('portrait:pb-44');
    expect(classNames).toContain('portrait:pb-52');
    expect(classNames).toContain('portrait:py-6');
  });

  it('does not reserve an empty analysis-bar gap above the mobile board', () => {
    const layoutSource = readFileSync('src/components/Layout.tsx', 'utf8');

    expect(layoutSource).toContain('settings.showAnalysisBar && (!isMobile || showAnalysisCommandBar)');
  });
});
