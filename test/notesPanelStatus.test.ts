import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('NotesPanel analysis status line', () => {
  it('says the engine is loading rather than claiming to analyze', () => {
    const source = readFileSync('src/components/NotesPanel.tsx', 'utf8');
    const start = source.indexOf('const analysisStatusText');
    const end = source.indexOf('}, [engineError, engineStatus, isAnalysisMode]);', start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const block = source.slice(start, end);

    // Turning analysis on before the engine is up used to say "Analyzing
    // move..." while a ~30MB model was still downloading and compiling. The
    // loading branch existed but returned the same string as the ready one.
    expect(block).toContain("if (engineStatus === 'loading') return 'Loading engine...';");
    expect(block).toContain("if (!isAnalysisMode) return 'Analysis off (Tab to enable)';");
    expect(block.match(/'Analyzing move\.\.\.'/g) ?? []).toHaveLength(1);
  });

  it('names the move even when there is no analysis to report on it', () => {
    const source = readFileSync('src/components/NotesPanel.tsx', 'utf8');

    // The move line is derived from the played move, not from the engine, but
    // it used to sit behind the analysis check — so with analysis off the block
    // showed only a status string, under a panel that already said as much.
    const moveLine = source.indexOf('const moveLine = `Move ${depth}:');
    const guard = source.indexOf('if (!currentNode.analysis) return `${moveLine}${analysisStatusText}`;');
    expect(moveLine).toBeGreaterThan(-1);
    expect(guard).toBeGreaterThan(moveLine);
    expect(source).toContain('let text = moveLine;');
  });
});
