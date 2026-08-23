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

  it('does not reserve an empty analysis-bar gap above the mobile board', () => {
    const layoutSource = readFileSync('src/components/Layout.tsx', 'utf8');

    expect(layoutSource).toContain('settings.showAnalysisBar && (!isMobile || showAnalysisCommandBar)');
  });
});
