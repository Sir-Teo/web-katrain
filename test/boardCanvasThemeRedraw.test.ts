import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('board canvas theme redraw', () => {
  it('recreates the shared canvas setup when the resolved UI theme changes', () => {
    const boardSource = readFileSync('src/components/GoBoard.tsx', 'utf8');

    expect(boardSource).toContain('useResolvedUiTheme(settings.uiTheme)');
    expect(boardSource).toContain('new MutationObserver(repaintWhenClear)');
    expect(boardSource).toContain('document.querySelector(\'[role="dialog"]\')');
    expect(boardSource.match(/window\.requestAnimationFrame/g)).toHaveLength(2);
    expect(boardSource).toContain('[boardHeight, boardWidth, canvasThemeVersion]');
  });
});
