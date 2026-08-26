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
});
