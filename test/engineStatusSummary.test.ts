import { describe, expect, it } from 'vitest';
import {
  formatEngineBackendLabel,
  getEngineModelSource,
  getEngineStatusSummary,
} from '../src/utils/engineStatusSummary';

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
    expect(getEngineModelSource('https://example.com/model.bin.gz')).toBe('Remote');
    expect(getEngineModelSource('blob:https://app.local/model')).toBe('Uploaded');
    expect(getEngineModelSource('/Users/me/model.bin.gz')).toBe('Local');
  });

  it('builds a compact ready label and diagnostic title', () => {
    const summary = getEngineStatusSummary({
      status: 'ready',
      requestedBackend: 'webgpu',
      activeBackend: 'webgpu',
      modelLabel: 'kata1-b18',
      modelUrl: '/models/kata1-b18.bin.gz',
    });

    expect(summary.compactLabel).toBe('Ready · WebGPU · kata1-b18');
    expect(summary.title).toContain('State: Ready');
    expect(summary.title).toContain('Source: Bundled');
    expect(summary.dotClass).toBe('bg-green-400');
    expect(summary.tone).toBe('default');
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

    expect(summary.compactLabel).toBe('Error fallback · CPU (WASM) · Uploaded weights');
    expect(summary.isFallback).toBe(true);
    expect(summary.title).toContain('Requested: WebGPU');
    expect(summary.title).toContain('Error: WebGPU unavailable');
    expect(summary.dotClass).toBe('bg-red-500');
    expect(summary.tone).toBe('error');
  });
});
