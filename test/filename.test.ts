import { describe, expect, it } from 'vitest';
import { stripUnsafeFilenameControls } from '../src/utils/filename';

describe('filename helpers', () => {
  it('removes controls and bidi formatting characters from names', () => {
    expect(stripUnsafeFilenameControls('Alpha\u0000Beta\u007fGamma')).toBe('AlphaBetaGamma');
    expect(stripUnsafeFilenameControls('review\u202efgs')).toBe('reviewfgs');
    expect(stripUnsafeFilenameControls('\ufeffzero\u200bwidth\u2066name')).toBe('zerowidthname');
  });
});
