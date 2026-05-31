import { describe, expect, it } from 'vitest';
import {
  ANALYSIS_VISIT_PRESETS,
  clampAnalysisVisits,
  mergeVisitPresets,
  visitPresetLabel,
} from '../src/utils/visitPresets';

describe('visit preset utilities', () => {
  it('clamps analysis visits to the browser engine range', () => {
    expect(clampAnalysisVisits(1)).toBe(16);
    expect(clampAnalysisVisits(999999)).toBe(50000);
    expect(clampAnalysisVisits(250.9)).toBe(250);
  });

  it('merges the current custom value into sorted presets', () => {
    expect(mergeVisitPresets(ANALYSIS_VISIT_PRESETS, 750)).toEqual([16, 250, 750, 1000, 5000]);
    expect(mergeVisitPresets(ANALYSIS_VISIT_PRESETS, 5000)).toEqual([16, 250, 1000, 5000]);
  });

  it('labels default and depth bands', () => {
    expect(visitPresetLabel(5000, 5000)).toBe('Default');
    expect(visitPresetLabel(16, 5000)).toBe('Fast');
    expect(visitPresetLabel(250, 5000)).toBe('Balanced');
    expect(visitPresetLabel(1000, 5000)).toBe('Deep');
  });
});
