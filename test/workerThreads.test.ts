import { describe, expect, it } from 'vitest';
import {
  CORES_RESERVED_FOR_UI,
  MAX_SEARCH_THREADS,
  detectSearchThreadCount,
  resolveSearchThreadCount,
} from '../src/utils/workerThreads';

describe('search thread budget', () => {
  it('leaves cores for the thread that paints the board', () => {
    expect(resolveSearchThreadCount({ hardwareConcurrency: 6, deviceMemoryGB: 16 })).toBe(4);
    expect(resolveSearchThreadCount({ hardwareConcurrency: 4, deviceMemoryGB: 16 })).toBe(2);
  });

  it('is unchanged on the desktops the old cap already covered', () => {
    // Anything with MAX + reserved cores or more was pinned at the cap before
    // and still is, so this costs nothing where the search had room anyway.
    for (const cores of [10, 12, 16, 18, 32]) {
      expect(resolveSearchThreadCount({ hardwareConcurrency: cores, deviceMemoryGB: 32 }))
        .toBe(MAX_SEARCH_THREADS);
    }
  });

  it('never returns less than one, however small the machine', () => {
    for (const cores of [undefined, 0, 1, 2, CORES_RESERVED_FOR_UI]) {
      expect(resolveSearchThreadCount({ hardwareConcurrency: cores })).toBeGreaterThanOrEqual(1);
    }
  });

  it('holds back on a machine short of memory', () => {
    // Eight cores and 2GB is a phone, not a workstation.
    expect(resolveSearchThreadCount({ hardwareConcurrency: 8, deviceMemoryGB: 2 })).toBe(2);
    expect(resolveSearchThreadCount({ hardwareConcurrency: 16, deviceMemoryGB: 2 })).toBe(2);
  });

  it('only trusts deviceMemory below 4GB, where browsers agree', () => {
    // The spec describes clamping the reported value, and browsers disagree
    // about the top of the range; 8 and 32 must land in the same place.
    const eight = resolveSearchThreadCount({ hardwareConcurrency: 16, deviceMemoryGB: 8 });
    const thirtyTwo = resolveSearchThreadCount({ hardwareConcurrency: 16, deviceMemoryGB: 32 });
    expect(eight).toBe(thirtyTwo);
  });

  it('treats an absent or nonsense memory reading as unknown, not as low', () => {
    const unknown = resolveSearchThreadCount({ hardwareConcurrency: 16 });
    expect(unknown).toBe(MAX_SEARCH_THREADS);
    expect(resolveSearchThreadCount({ hardwareConcurrency: 16, deviceMemoryGB: NaN })).toBe(unknown);
    expect(resolveSearchThreadCount({ hardwareConcurrency: 16, deviceMemoryGB: 0 })).toBe(unknown);
  });

  it('reads the signals a worker has', () => {
    expect(detectSearchThreadCount({ navigator: { hardwareConcurrency: 12, deviceMemory: 16 } })).toBe(8);
    expect(detectSearchThreadCount({ navigator: { hardwareConcurrency: 8, deviceMemory: 2 } })).toBe(2);
    expect(detectSearchThreadCount({})).toBe(1);
  });
});
