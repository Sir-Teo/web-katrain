import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('analysis-off coach card', () => {
  const source = () => readFileSync('src/components/dashboard/DesktopDashboard.tsx', 'utf8');

  it('does not claim the win-rate graph is paused', () => {
    // "Analyze game" in the graph's own empty state runs a review with live
    // analysis off and fills the chart, so the card sat directly above a
    // populated graph while saying that graph was paused.
    expect(source()).not.toContain('the win-rate graph are paused');
  });

  it('names what actually stops: per-move evaluation and board hints', () => {
    const text = source();

    expect(text).toContain('Live analysis is off');
    expect(text).toContain('Moves are not evaluated as you play them');
    // It used to add that a game review still charts the whole game, to correct
    // an earlier claim that the graph was paused. With no claim left about the
    // graph, that sentence only restated the CTA sitting directly above it.
    expect(text).not.toContain('A game review still charts the whole game');
  });

  it('puts the switch on the line that names the state', () => {
    // Title, then a paragraph, then a button on its own row cost 136px of a
    // 750px sidebar to say one thing; the head row brings it to 90px.
    expect(source()).toContain('<div className="cc-head">');

    const css = readFileSync('src/components/dashboard/dashboard.css', 'utf8');
    expect(css).toMatch(/\.wk-dashboard \.coach-card \.cc-head \{[^}]*justify-content: space-between;/);
  });

  it('keeps the graph empty state offering a review as its way out', () => {
    const graph = readFileSync('src/components/ScoreWinrateGraph.tsx', 'utf8');

    expect(graph).toContain('data-analysis-graph-empty-cta="true"');
    expect(graph).toContain('startFastGameAnalysis()');
  });
});
