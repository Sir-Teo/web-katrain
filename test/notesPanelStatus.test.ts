import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('NotesPanel analysis status line', () => {
  it('says the engine is loading rather than claiming to analyze', () => {
    const source = readFileSync('src/components/NotesPanel.tsx', 'utf8');
    const start = source.indexOf('const analysisStatusText');
    const end = source.indexOf('}, [engineError, engineStatus, isAnalysisMode, touchOnly]);', start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const block = source.slice(start, end);

    // Turning analysis on before the engine is up used to say "Analyzing
    // move..." while a ~30MB model was still downloading and compiling. The
    // loading branch existed but returned the same string as the ready one.
    // ...and it said so in a third wording. The header pill's "Loading model"
    // and this line's "Loading engine..." were on screen together whenever
    // analysis was switched on cold. Both read the same constant now.
    expect(block).toContain('if (engineStatus === \'loading\') return `${ENGINE_LOADING_LABEL}\u2026`;');
    expect(source).toContain("import { ENGINE_LOADING_LABEL } from '../utils/engineStatusSummary';");
    const statusSummary = readFileSync('src/utils/engineStatusSummary.ts', 'utf8');
    expect(statusSummary).toContain("return { state: 'loading', label: ENGINE_LOADING_LABEL }");
    expect(readFileSync('src/components/Layout.tsx', 'utf8')).toContain('getEngineActivityPresentation({');
    expect(source).not.toContain("'Loading engine...'");
    // "(Tab to enable)" is an instruction a touch-only device cannot follow,
    // so the hint is dropped there and the state still named.
    expect(block).toContain("return touchOnly ? 'Analysis off' : 'Analysis off (Tab to enable)';");
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

describe('NotesPanel human policy line', () => {
  it('reports how often a player of the configured rank plays the move', () => {
    const source = readFileSync('src/components/NotesPanel.tsx', 'utf8');

    // KataGo's human network answers the question a reviewer actually has: was
    // this a normal move at my level, or an unusual one? The line only appears
    // when that network produced a policy for the parent position.
    expect(source).toContain('const parentHumanPolicy = parent?.analysis?.humanPolicy;');
    expect(source).toContain('if (!showProDetails || !move || !parentHumanPolicy) return null;');
    expect(source).toContain('text += `Human ${humanProfileLabel}${rankPart}:');
    expect(source).toContain('text += `Human pick: ${bestLabel}');
  });
});
