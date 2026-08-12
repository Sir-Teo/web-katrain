import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { AnalysisCommandBar } from '../src/components/AnalysisCommandBar';
import { defaultUiState } from '../src/components/layout/types';
import { summarizeAnalysisCoverage } from '../src/utils/analysisCoverage';
import { getFastReviewButtonState } from '../src/utils/fastReviewButtonState';
import type { AnalysisResult } from '../src/types';

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

const analysis = (): AnalysisResult => ({
  rootWinRate: 0.5,
  rootScoreLead: 0,
  rootScoreSelfplay: 0,
  rootScoreStdev: 1,
  rootVisits: 16,
  moves: [],
  territory: Array.from({ length: 19 }, () => Array.from({ length: 19 }, () => 0)),
  ownershipMode: 'none',
});

describe('AnalysisCommandBar', () => {
  it('surfaces a compact engine status pill with backend and model context', () => {
    const html = renderToStaticMarkup(<AnalysisCommandBar {...baseProps} />);

    expect(html).toContain('data-analysis-engine-status="ready"');
    expect(html).toContain('Engine status: Ready · WebGPU');
    expect(html).toContain('analysis-command-bar__status--ready');
    expect(html).toContain('analysis-command-bar__status--header-duplicate');
    expect(html).toContain('analysis-command-bar__status-state');
    expect(html).toContain('analysis-command-bar__status-detail');
    expect(html).toContain('Ready · WebGPU');
    expect(html).toContain('Source: Bundled');
    expect(html).toContain('data-analysis-live-depth="true"');
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toMatch(/aria-controls="[^"]+"/);
    expect(html).toContain('aria-label="Turn live analysis off"');
    expect(html).toContain('aria-label="Run a fast review of the game"');
    expect(html).toContain('aria-label="Hide top move hints"');
    expect(html).toContain('aria-label="Cycle top move hint label. Current: Delta"');
    expect(html).toContain('aria-label="Show move heatmap"');
    expect(html).toContain('aria-label="Cycle move heatmap metric. Current: Prob."');
    expect(html).toContain('aria-label="Hide territory ownership"');
    expect(html).toContain('aria-label="Open the full game report"');
    expect(html).toContain('data-analysis-metrics-overflow="none"');
    expect(html).toContain('data-analysis-actions-overflow="none"');
  });

  it('uses adaptive scroll-edge affordances for narrow action rows', () => {
    const source = readFileSync('src/components/AnalysisCommandBar.tsx', 'utf8');
    const styles = readFileSync('src/index.css', 'utf8');

    expect(source).toContain("actionScrollEdges.overflow ? 'is-scrollable' : ''");
    expect(source).toContain("!actionScrollEdges.atStart ? 'has-overflow-left' : ''");
    expect(source).toContain("!actionScrollEdges.atEnd ? 'has-overflow-right' : ''");
    expect(source).toContain("!metricScrollEdges.atEnd ? 'has-overflow-right' : ''");
    expect(source).toContain('data-analysis-metrics-overflow={horizontalOverflowLabel(metricScrollEdges)}');
    expect(source).toContain('[currentNode, currentNode.analysis]');
    expect(styles).toContain('.analysis-command-bar__actions.has-overflow-left.has-overflow-right');
    expect(styles).toContain('.analysis-command-bar__metrics.has-overflow-left.has-overflow-right');
    expect(styles).toContain('overscroll-behavior-x: contain;');
    expect(styles).toContain('scroll-snap-type: x proximity;');
    expect(styles).toContain('grid-template-columns: 4.75rem minmax(6rem, 1fr) minmax(6.5rem, 36vw);');
    expect(styles).toContain('.analysis-command-bar__status-detail');
    expect(styles).toContain('.analysis-command-bar:has(.analysis-command-bar__status-copy)');
  });

  it('uses shorter primary metric labels on phones without changing desktop copy', () => {
    const html = renderToStaticMarkup(<AnalysisCommandBar {...baseProps} />);
    const styles = readFileSync('src/index.css', 'utf8');

    expect(html).toContain('analysis-command-bar__label-full">Black win');
    expect(html).toContain('analysis-command-bar__label-compact">B win');
    expect(html).toContain('analysis-command-bar__label-full">Score lead');
    expect(html).toContain('analysis-command-bar__label-compact">Score');
    expect(html).toContain('analysis-command-bar__label-full">Move quality');
    expect(html).toContain('analysis-command-bar__label-compact">Quality');
    expect(html).toContain('analysis-command-bar__label-full">Fast review');
    expect(html).toContain('analysis-command-bar__label-compact">Review');
    expect(styles).toContain('.analysis-command-bar__metric:nth-child(-n + 2)');
    expect(styles).toContain('flex: 0 0 3.5rem;');
  });

  it('reclaims the duplicate ready-status column on phones while preserving errors', () => {
    const styles = readFileSync('src/index.css', 'utf8');

    expect(styles).toContain('.analysis-command-bar:has(> .analysis-command-bar__status--header-duplicate)');
    expect(styles).toContain('grid-template-columns: minmax(0, 1fr) minmax(9.5rem, 46vw);');
    expect(styles).toContain('.analysis-command-bar-slot .analysis-command-bar__status--header-duplicate');
    expect(styles).toContain('display: none;');
    expect(styles).not.toContain('.analysis-command-bar-slot .analysis-command-bar__status--error {\n      display: none;');
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
    expect(html).not.toContain('analysis-command-bar__status--header-duplicate');
    expect(html).toContain('Error fallback · CPU (WASM)');
    expect(html).toContain('Copy engine error details');
  });

  it('marks fast review complete once the current line is fully analyzed', () => {
    const state = getFastReviewButtonState({
      isGameAnalysisRunning: false,
      gameProgress: null,
      analysisCoverage: summarizeAnalysisCoverage([{ analysis: analysis() }, { analysis: analysis() }]),
    });

    expect(state).toEqual({
      state: 'complete',
      label: 'Reviewed',
      title: 'Current line is fully analyzed (2/2). Use Re-analyze game for a deeper pass.',
      disabled: true,
      ariaLabel: 'Current line fully analyzed',
    });
  });

  it('keeps fast review as an actionable stop button while review is running', () => {
    const state = getFastReviewButtonState({
      isGameAnalysisRunning: true,
      gameProgress: {
        buttonLabel: '4/10',
        title: 'Analyzing 4 of 10 moves',
      },
      analysisCoverage: summarizeAnalysisCoverage([{ analysis: analysis() }, { analysis: null }]),
    });

    expect(state).toEqual({
      state: 'running',
      label: 'Stop 4/10',
      title: 'Analyzing 4 of 10 moves',
      disabled: false,
      ariaLabel: 'Stop game analysis',
    });
  });
});
