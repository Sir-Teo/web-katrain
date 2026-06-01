import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { AnalysisCacheClearConfirmModal } from '../src/components/AnalysisCacheClearConfirmModal';

const noop = () => undefined;

describe('AnalysisCacheClearConfirmModal', () => {
  it('explains the cache clear risk and labels the dialog actions', () => {
    const html = renderToStaticMarkup(
      <AnalysisCacheClearConfirmModal count={2} onCancel={noop} onConfirm={noop} />
    );

    expect(html).toContain('data-analysis-cache-clear-confirm="true"');
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('aria-labelledby="analysis-cache-clear-title"');
    expect(html).toContain('aria-describedby="analysis-cache-clear-description"');
    expect(html).toContain('This removes 2 cached analyses from the current game');
    expect(html).toContain('Moves and notes stay unchanged');
    expect(html).toContain('restored SGF analysis will not be exported again');
    expect(html).toContain('aria-label="Cancel clear analysis cache"');
    expect(html).toContain('Clear 2 cached analyses');
  });
});
