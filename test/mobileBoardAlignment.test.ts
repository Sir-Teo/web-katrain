import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('mobile board alignment', () => {
  it('top-aligns the full-height board wrapper only in portrait mobile layouts', () => {
    const boardSource = readFileSync('src/components/GoBoard.tsx', 'utf8');

    expect(boardSource).toContain('className="go-board-container');
    expect(boardSource).toContain('data-board-container="true"');
    expect(boardSource).toContain('portrait:items-start');
    expect(boardSource).toContain('lg:portrait:items-center');
  });

  it('does not reserve an empty analysis-bar gap above the mobile board', () => {
    const layoutSource = readFileSync('src/components/Layout.tsx', 'utf8');

    expect(layoutSource).toContain('settings.showAnalysisBar && (!isMobile || showAnalysisCommandBar)');
  });
});
