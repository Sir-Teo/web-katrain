import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ScoreWinrateGraph } from '../src/components/ScoreWinrateGraph';

describe('ScoreWinrateGraph empty state', () => {
  it('uses an informational region until graph data exists', () => {
    const html = renderToStaticMarkup(<ScoreWinrateGraph showScore showWinrate />);
    const source = readFileSync('src/components/ScoreWinrateGraph.tsx', 'utf8');

    expect(html).toContain('data-analysis-graph-has-data="false"');
    expect(html).toContain('role="region"');
    expect(html).not.toContain('aria-disabled="true"');
    expect(html).not.toContain('aria-valuemin=');
    expect(html).toContain('tabindex="-1"');
    expect(html).toContain('cursor-default');
    expect(html).not.toContain('cursor-crosshair');
    expect(html).toContain('Play a move or open an SGF to chart win rate and score');
    expect(source).toContain('if (!hasGraphData || !svgRef.current) return');
    expect(source).toContain('if (!hasGraphData) return');
    expect(source).toContain('tabIndex={hasGraphData ? 0 : -1}');
  });
});
