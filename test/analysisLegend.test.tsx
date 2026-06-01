import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { AnalysisQualityLegend } from '../src/components/AnalysisPanel';

describe('AnalysisQualityLegend', () => {
  it('combines move quality buckets with overlay color legends', () => {
    const html = renderToStaticMarkup(
      <AnalysisQualityLegend
        items={[
          { label: 'Blunder', range: '12+ pt', color: 'rgb(255, 0, 0)' },
          { label: 'Best', range: '0-0.5 pt', color: 'rgb(0, 255, 0)' },
        ]}
      />
    );

    expect(html).toContain('data-analysis-quality-legend="true"');
    expect(html).toContain('Move quality');
    expect(html).toContain('Blunder');
    expect(html).toContain('Best');
    expect(html).toContain('data-analysis-overlay-legend="true"');
    expect(html).toContain('data-analysis-overlay-legend-item="top-moves"');
    expect(html).toContain('data-analysis-overlay-legend-item="policy"');
    expect(html).toContain('data-analysis-overlay-legend-item="territory"');
  });
});
