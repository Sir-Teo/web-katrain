import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { AnalysisCommandBar } from '../src/components/AnalysisCommandBar';
import { defaultUiState } from '../src/components/layout/types';

const noop = () => undefined;
const baseProps = {
  mode: 'analyze' as const,
  isAnalysisMode: true,
  statusText: 'Analysis mode on (Tab toggles)',
  engineDot: 'bg-green-400',
  engineStatus: 'ready' as const,
  engineError: null,
  engineBackend: 'webgpu',
  engineModelLabel: 'kata1-b18',
  requestedBackend: 'webgpu',
  modelUrl: '/models/kata1-b18.bin.gz',
  winRate: null,
  scoreLead: null,
  pointsLost: null,
  analysisControls: defaultUiState().analysisControls.analyze,
  updateControls: noop,
  toggleAnalysisMode: noop,
  isGameAnalysisRunning: false,
  gameAnalysisType: null,
  gameAnalysisDone: 0,
  gameAnalysisTotal: 0,
  startFastGameAnalysis: noop,
  stopGameAnalysis: noop,
  onOpenGameReport: noop,
};

describe('AnalysisCommandBar', () => {
  it('surfaces a compact engine status pill with backend and model context', () => {
    const html = renderToStaticMarkup(<AnalysisCommandBar {...baseProps} />);

    expect(html).toContain('data-analysis-engine-status="ready"');
    expect(html).toContain('Engine status: Ready · WebGPU · kata1-b18');
    expect(html).toContain('analysis-command-bar__status--ready');
    expect(html).toContain('Ready · WebGPU · kata1-b18');
    expect(html).toContain('Source: Bundled');
  });

  it('keeps fallback and error states visible in the status pill', () => {
    const html = renderToStaticMarkup(
      <AnalysisCommandBar
        {...baseProps}
        engineStatus="error"
        engineError="WebGPU unavailable"
        engineBackend="wasm"
      />,
    );

    expect(html).toContain('data-analysis-engine-status="error"');
    expect(html).toContain('analysis-command-bar__status--error');
    expect(html).toContain('analysis-command-bar__status--fallback');
    expect(html).toContain('Error fallback · CPU (WASM) · kata1-b18');
    expect(html).toContain('Copy engine error details');
  });
});
