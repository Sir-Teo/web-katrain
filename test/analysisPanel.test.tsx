import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { AnalysisPanel, AnalysisQualityLegend } from '../src/components/AnalysisPanel';
import { defaultUiState } from '../src/components/layout/types';

const noop = () => undefined;

const baseProps = {
  analysisControls: defaultUiState().analysisControls.analyze,
  updateControls: noop,
  statusText: 'Ready',
  engineDot: 'bg-green-400',
  engineMeta: 'Ready · WebGPU',
  engineMetaTitle: 'Ready',
  engineStatus: 'ready' as const,
  engineError: null,
  engineBackend: 'webgpu',
  engineModelLabel: 'kata1-b18',
  requestedBackend: 'webgpu',
  modelUrl: '/models/kata1-b18.bin.gz',
  isGameAnalysisRunning: false,
  gameAnalysisType: null,
  gameAnalysisDone: 0,
  gameAnalysisTotal: 0,
  startQuickGameAnalysis: noop,
  startFastGameAnalysis: noop,
  stopGameAnalysis: noop,
  clearAnalysisCache: noop,
  analysisCacheSize: 0,
  onOpenGameAnalysis: noop,
  onOpenGameReport: noop,
  currentMoveNumber: 0,
  winRate: null,
  scoreLead: null,
  pointsLost: null,
};

describe('AnalysisPanel', () => {
  it('labels compact toolbar actions for keyboard and screen-reader users', () => {
    const html = renderToStaticMarkup(<AnalysisPanel {...baseProps} />);

    expect(html).toContain('aria-label="Run quick graph analysis"');
    expect(html).toContain('aria-label="Stop game analysis"');
    expect(html).toContain('aria-label="No cached analysis to clear"');
    // Overlay toggles take their accessible name from the visible chip text and
    // report state through aria-pressed, so the name never restates it.
    expect(html).toContain('title="Hide child move markers"');
    expect(html).toContain('title="Hide move evaluation dots"');
    expect(html).toContain('title="Hide top move hints"');
    expect(html).toContain('title="Show move heatmap"');
    expect(html).toContain('title="Hide territory ownership"');
    expect(html).not.toContain('aria-label="Hide child move markers"');
    expect(html).toContain('aria-label="Show analysis legend"');
    expect(html).toContain('aria-label="Open analysis options"');
    expect(html).toContain('aria-label="Open game report"');
    expect(html).toContain('data-analysis-panel-fast-review-state="ready"');
    expect(html).toContain('data-engine-reason="true"');
    expect(html).toContain('Browser GPU acceleration is active.');
    expect(html).toContain('>Heatmap</span>');
  });

  it('explains when top move hints are hidden by the heatmap overlay', () => {
    const html = renderToStaticMarkup(
      <AnalysisPanel
        {...baseProps}
        analysisControls={{
          ...baseProps.analysisControls,
          analysisShowPolicy: true,
        }}
      />,
    );

    expect(html).toContain('title="Move heatmap is showing; top move hints are hidden"');
    expect(html).toContain('title="Hide move heatmap"');
  });

  it('collapses redundant engine diagnostics and keeps depth presets on one compact row', () => {
    const html = renderToStaticMarkup(<AnalysisPanel {...baseProps} compact />);

    expect(html).toContain('aria-label="Show engine details"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('data-analysis-engine-details="true"');
    expect(html).not.toContain('>Backend</div>');
    expect(html).not.toContain('kata1-b18');
    expect(html).toContain('grid-cols-4');
    expect(html).toContain('min-h-11');
  });

  it('keeps cache and legend on the compact overlay row instead of their own band', () => {
    const html = renderToStaticMarkup(<AnalysisPanel {...baseProps} compact />);

    // Two icons had a full right-aligned row of a phone panel to themselves.
    expect(html).not.toContain('flex items-center justify-end gap-2');
    const controls = html.slice(html.indexOf('data-analysis-overlay-controls="true"'));
    expect(controls.indexOf('Territory')).toBeLessThan(controls.indexOf('Show analysis legend'));
  });

  it('holds the compact overlay controls in fixed columns across phone widths', () => {
    const html = renderToStaticMarkup(<AnalysisPanel {...baseProps} compact />);
    const css = readFileSync('src/index.css', 'utf8');

    // Wrapped by natural width the six controls rearranged with the handset:
    // 3+2 at 390px, 4+1 at 430 — Heatmap and Territory swapping rows between
    // one phone and the next — and 3+2+1 at 320, where the third row cost a
    // band of the panel. A fixed matrix is two rows at all four widths.
    expect(html).toContain('class="analysis-overlay-grid" data-analysis-overlay-controls="true"');
    expect(html).toContain('analysis-overlay-grid-tail');
    expect(html).not.toContain('class="flex flex-wrap items-center gap-1.5" data-analysis-overlay-controls="true"');

    const start = css.indexOf('.analysis-overlay-grid {');
    expect(start).toBeGreaterThan(-1);
    const block = css.slice(start, css.indexOf('}', start));
    expect(block).toContain('grid-template-columns: repeat(3, minmax(0, 1fr));');
    // "Top moves" is 105px of content in a 96px cell at 320px wide; the trimmed
    // side padding is what keeps it from being clipped there.
    expect(css).toMatch(/\.analysis-overlay-grid > \.panel-action-button \{[^}]*padding-inline: 4px;/);
    // And the pair sharing the sixth cell keeps its 44px targets: the cache
    // button's own padding had squeezed the legend button to 40px wide there.
    expect(css).toMatch(
      /\.analysis-overlay-grid-tail > \.panel-icon-button \{[^}]*flex: none;[^}]*padding-inline: 4px;/,
    );
  });

  it('leads the played-move detail with the points figure', () => {
    const source = readFileSync('src/components/AnalysisPanel.tsx', 'utf8');

    // The line truncates inside a quarter-width phone column, where
    // "Unranked · Lost 1.5" clipped to "UNRANKED…" and hid the only number
    // the reader came for.
    expect(source).toContain(
      '[displayedMoveQuality.valueLabel, displayedMoveQuality.rankLabel]'
    );
  });

  it('uses beginner-friendly heatmap wording in the overlay legend', () => {
    const html = renderToStaticMarkup(<AnalysisQualityLegend items={[]} />);

    expect(html).toContain('>Move prob.</span>');
    expect(html).toContain('>Likely moves</span>');
  });
});
