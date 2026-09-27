import { describe, expect, it } from 'vitest';
import {
  getEngineActivityPresentation,
  formatEngineBackendLabel,
  getEngineModelSource,
  getEngineStatusSummary,
} from '../src/utils/engineStatusSummary';

describe('getEngineActivityPresentation', () => {
  const ready = {
    status: 'ready' as const,
    error: null,
    isAiThinking: false,
    isGameAnalysisRunning: false,
    isContinuousAnalysis: false,
    isAnalysisMode: false,
    activeBackend: 'webgpu',
  };

  it('does not claim the engine is running when only analysis mode is visible', () => {
    expect(getEngineActivityPresentation({ ...ready, isAnalysisMode: true })).toEqual({
      state: 'ready',
      label: 'Analysis mode',
    });
  });

  it('prioritizes real engine activity and loading states', () => {
    expect(getEngineActivityPresentation({ ...ready, isContinuousAnalysis: true })).toEqual({
      state: 'running',
      label: 'Analyzing…',
    });
    expect(getEngineActivityPresentation({ ...ready, isAiThinking: true })).toEqual({
      state: 'running',
      label: 'AI thinking…',
    });
    expect(getEngineActivityPresentation({ ...ready, status: 'loading', isAiThinking: true })).toEqual({
      state: 'loading',
      label: 'Loading model',
    });
  });

  it('does not call the engine ready before the worker has loaded a model', () => {
    const cold = { ...ready, status: 'idle' as const, activeBackend: null };
    expect(getEngineActivityPresentation(cold)).toEqual({ state: 'configured', label: 'Model not loaded' });
    expect(getEngineActivityPresentation({ ...cold, isAnalysisMode: true })).toEqual({
      state: 'configured',
      label: 'Analysis mode',
    });
    // Loaded and between searches is ready.
    expect(getEngineActivityPresentation({ ...ready, status: 'idle' })).toEqual({
      state: 'ready',
      label: 'KataGo ready',
    });
  });
});

describe('engine status summary', () => {
  it('formats common backend names for humans', () => {
    expect(formatEngineBackendLabel('webgpu')).toBe('WebGPU');
    expect(formatEngineBackendLabel('wasm')).toBe('CPU (WASM)');
    expect(formatEngineBackendLabel('native-cpu')).toBe('Native CPU');
    expect(formatEngineBackendLabel(null)).toBe('Not loaded');
  });

  it('detects model source labels', () => {
    expect(getEngineModelSource('/models/kata-small.bin.gz')).toBe('Bundled');
    expect(getEngineModelSource('models/kata-small.bin.gz')).toBe('Bundled');
    expect(getEngineModelSource('/web-katrain/models/katago-small.bin.gz')).toBe('Bundled');
    expect(getEngineModelSource('/web-katrain/models/katago-small.bin.gz?t=1')).toBe('Bundled');
    expect(getEngineModelSource('https://example.com/model.bin.gz')).toBe('Remote');
    expect(getEngineModelSource('https://example.com/web-katrain/models/katago-small.bin.gz')).toBe('Remote');
    expect(getEngineModelSource('blob:https://app.local/model')).toBe('Uploaded');
    expect(getEngineModelSource('/Users/me/model.bin.gz')).toBe('Local');
    expect(getEngineModelSource('/Users/me/models/katago-small.bin.gz')).toBe('Local');
  });

  it('builds a compact ready label and diagnostic title', () => {
    const summary = getEngineStatusSummary({
      status: 'ready',
      requestedBackend: 'webgpu',
      activeBackend: 'webgpu',
      modelLabel: 'kata1-b18',
      modelUrl: '/models/kata1-b18.bin.gz',
    });

    expect(summary.compactLabel).toBe('Ready · WebGPU');
    expect(summary.title).toContain('State: Ready');
    expect(summary.title).toContain('Source: Bundled');
    expect(summary.title).toContain('Reason: Browser GPU acceleration is active.');
    expect(summary.reasonLabel).toBe('Browser GPU acceleration is active.');
    expect(summary.dotClass).toBe('bg-green-400');
    expect(summary.tone).toBe('default');
  });

  it('shows a loaded but idle backend as ready', () => {
    const summary = getEngineStatusSummary({
      status: 'idle',
      requestedBackend: 'webgpu',
      activeBackend: 'webgpu',
      modelLabel: 'kata1-b18',
      modelUrl: '/models/kata1-b18.bin.gz',
    });

    expect(summary.compactLabel).toBe('Ready · WebGPU');
    expect(summary.title).toContain('State: Ready');
    expect(summary.title).toContain('Activity: Idle');
    expect(summary.dotClass).toBe('bg-green-400');
  });

  it('shows a configured model as configured, not ready, until the worker reports a backend', () => {
    const summary = getEngineStatusSummary({
      status: 'idle',
      requestedBackend: 'webgpu',
      modelLabel: 'kata1-b18',
      modelUrl: '/models/kata1-b18.bin.gz',
    });

    expect(summary.stateLabel).toBe('Configured');
    expect(summary.compactLabel).toBe('Configured · WebGPU requested');
    expect(summary.title).toContain('State: Configured');
    expect(summary.title).not.toContain('Activity: Idle');
    // The requested backend is not presented as the one running.
    expect(summary.activeBackendLabel).toBe('Not loaded');
    expect(summary.title).toContain('Backend: Not loaded');
    expect(summary.title).toContain('Requested: WebGPU');
    expect(summary.isFallback).toBe(false);
    expect(summary.reasonLabel).toBe('The model loads on WebGPU when analysis first runs.');
    expect(summary.dotClass).toBe('bg-slate-500');
  });

  it('names the requested backend, not an active one, while the first load runs', () => {
    const summary = getEngineStatusSummary({
      status: 'loading',
      requestedBackend: 'webgpu',
      modelLabel: 'kata1-b18',
    });

    expect(summary.stateLabel).toBe('Loading');
    expect(summary.compactLabel).toBe('Loading · WebGPU requested');
    expect(summary.activeBackendLabel).toBe('Not loaded');
    expect(summary.reasonLabel).toBe('Loading WebGPU analysis.');
    expect(summary.dotClass).toBe('bg-yellow-400');
  });

  it('reports a failed first load as an error on the requested backend', () => {
    const summary = getEngineStatusSummary({
      status: 'error',
      error: 'Failed to fetch model: 404 Not Found',
      requestedBackend: 'wasm',
      modelLabel: 'kata1-b18',
    });

    expect(summary.stateLabel).toBe('Error');
    expect(summary.compactLabel).toBe('Error · CPU (WASM) requested');
    expect(summary.isFallback).toBe(false);
    expect(summary.reasonLabel).toBe('CPU (WASM) failed to start.');
    expect(summary.dotClass).toBe('bg-red-500');
  });

  it('keeps an idle engine without a loaded backend or model distinct from ready', () => {
    const summary = getEngineStatusSummary({
      status: 'idle',
      requestedBackend: 'webgpu',
    });

    expect(summary.compactLabel).toBe('Idle · WebGPU requested');
    expect(summary.title).toContain('State: Idle');
    expect(summary.title).not.toContain('Activity: Idle');
    expect(summary.reasonLabel).toBe('Analysis engine will start when analysis runs.');
    expect(summary.dotClass).toBe('bg-slate-500');
  });

  it('keeps fallback and error states visible at the same time', () => {
    const summary = getEngineStatusSummary({
      status: 'error',
      error: 'WebGPU unavailable',
      requestedBackend: 'webgpu',
      activeBackend: 'wasm',
      modelLabel: 'Uploaded weights',
      modelUrl: 'blob:https://app.local/model',
    });

    expect(summary.compactLabel).toBe('Error fallback · CPU (WASM)');
    expect(summary.isFallback).toBe(true);
    expect(summary.title).toContain('Requested: WebGPU');
    expect(summary.reasonLabel).toBe('WebGPU failed; CPU (WASM) is the active fallback.');
    expect(summary.title).toContain('Error: WebGPU unavailable');
    expect(summary.dotClass).toBe('bg-red-500');
    expect(summary.tone).toBe('error');
  });

  it('says why the engine fell back when the worker recorded a reason', () => {
    const summary = getEngineStatusSummary({
      status: 'ready',
      requestedBackend: 'webgpu',
      activeBackend: 'wasm',
      backendNote: "WebGPU backend failed (tf.setBackend('webgpu') returned false); trying WASM",
      modelLabel: 'Bundled model',
      modelUrl: 'models/katago-small.bin.gz',
    });

    expect(summary.isFallback).toBe(true);
    expect(summary.reasonLabel).toBe(
      "WebGPU backend failed (tf.setBackend('webgpu') returned false); trying WASM."
    );
    expect(summary.title).toContain('Reason: WebGPU backend failed');
  });

  it('keeps the generic fallback wording when no reason was recorded', () => {
    const summary = getEngineStatusSummary({
      status: 'ready',
      requestedBackend: 'webgpu',
      activeBackend: 'wasm',
      backendNote: null,
    });

    expect(summary.reasonLabel).toBe('WebGPU was requested; CPU (WASM) is running.');
  });
});
