import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { AnalysisPanel, AnalysisQualityLegend } from '../src/components/AnalysisPanel';
import { defaultUiState } from '../src/components/layout/types';

const noop = () => undefined;

const baseProps = {
  mode: 'analyze' as const,
  modePanels: defaultUiState().panels.analyze,
  analysisControls: defaultUiState().analysisControls.analyze,
  updatePanels: noop,
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
    expect(html).toContain('aria-label="Open analysis options"');
    expect(html).toContain('aria-label="Open game report"');
    expect(html).toContain('data-analysis-panel-fast-review-state="ready"');
    expect(html).toContain('>Heatmap</span>');
  });

  it('uses beginner-friendly heatmap wording in the overlay legend', () => {
    const html = renderToStaticMarkup(<AnalysisQualityLegend items={[]} />);

    expect(html).toContain('>Move prob.</span>');
    expect(html).toContain('>Likely moves</span>');
  });
});
