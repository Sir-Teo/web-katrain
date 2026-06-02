import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { AnalysisStatsActions } from '../src/components/AnalysisPanel';

const noop = () => undefined;

describe('AnalysisStatsActions', () => {
  it('surfaces report and analysis actions', () => {
    const html = renderToStaticMarkup(
      <AnalysisStatsActions
        onOpenGameAnalysis={noop}
        onOpenGameReport={noop}
      />
    );

    expect(html).toContain('data-analysis-stats-actions="true"');
    expect(html).toContain('Open game report');
    expect(html).toContain('Open analysis options');
  });

  it('does not duplicate the cache count (surfaced by the clear-cache control instead)', () => {
    const html = renderToStaticMarkup(
      <AnalysisStatsActions
        onOpenGameAnalysis={noop}
        onOpenGameReport={noop}
      />
    );

    expect(html).not.toContain('cached');
  });
});
