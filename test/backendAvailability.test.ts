import { describe, expect, it } from 'vitest';
import {
  detectWebGpuAvailability,
  isKataGoBackendAvailable,
} from '../src/utils/backendAvailability';

describe('backend availability', () => {
  it('detects browser WebGPU support without assuming server-side availability', () => {
    expect(detectWebGpuAvailability(null)).toBe('unknown');
    expect(detectWebGpuAvailability(undefined)).toBe('unknown');
    expect(detectWebGpuAvailability({ gpu: {} })).toBe('available');
    expect(detectWebGpuAvailability({ gpu: null })).toBe('unavailable');
  });

  it('only disables WebGPU after the browser explicitly reports it unavailable', () => {
    expect(isKataGoBackendAvailable('webgpu', 'available')).toBe(true);
    expect(isKataGoBackendAvailable('webgpu', 'unknown')).toBe(true);
    expect(isKataGoBackendAvailable('webgpu', 'unavailable')).toBe(false);
    expect(isKataGoBackendAvailable('wasm', 'unavailable')).toBe(true);
    expect(isKataGoBackendAvailable('cpu', 'unavailable')).toBe(true);
  });
});
