import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearUploadedModelUrl,
  createUploadedModelUrl,
  isKataGoModelWeightsFile,
  MAX_BROWSER_MODEL_UPLOAD_BYTES,
  resetModelUploadStateForTests,
  restorePersistedUploadedModelUrl,
  savePersistedUploadedModel,
  validateModelUploadFile,
} from '../src/utils/modelUpload';

describe('model upload helpers', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    resetModelUploadStateForTests();
  });

  it('recognizes KataGo weight file names', () => {
    expect(isKataGoModelWeightsFile({ name: 'kata1-b18.bin.gz' })).toBe(true);
    expect(isKataGoModelWeightsFile({ name: 'model.bin' })).toBe(true);
    expect(isKataGoModelWeightsFile({ name: 'model.gz' })).toBe(true);
    expect(isKataGoModelWeightsFile({ name: 'game.sgf' })).toBe(false);
    expect(isKataGoModelWeightsFile({ name: 'board.png' })).toBe(false);
  });

  it('validates browser upload size before creating object URLs', () => {
    expect(validateModelUploadFile({ name: 'game.sgf', size: 12 })).toBe('Use a KataGo .bin.gz weights file.');
    expect(validateModelUploadFile({ name: 'kata1.bin.gz', size: MAX_BROWSER_MODEL_UPLOAD_BYTES })).toBeNull();
    expect(validateModelUploadFile({ name: 'kata1.bin.gz', size: MAX_BROWSER_MODEL_UPLOAD_BYTES + 1 })).toContain(
      'too large for the browser engine'
    );
  });

  it('revokes previous uploaded model URLs and remembers the manual fallback URL', () => {
    const createObjectUrl = vi.spyOn(URL, 'createObjectURL');
    createObjectUrl.mockReturnValueOnce('blob:first');
    createObjectUrl.mockReturnValueOnce('blob:second');
    const revokeObjectUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

    const first = createUploadedModelUrl(new Blob(['a']), '/models/katago-small.bin.gz');
    expect(first).toBe('blob:first');

    const second = createUploadedModelUrl(new Blob(['b']), first);
    expect(second).toBe('blob:second');
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:first');

    expect(clearUploadedModelUrl('/models/fallback.bin.gz')).toBe('/models/katago-small.bin.gz');
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:second');
  });

  it('gracefully skips persistent upload storage when IndexedDB is unavailable', async () => {
    expect(await savePersistedUploadedModel(new Blob(['weights'], { type: 'application/gzip' }))).toBe(false);
    await expect(restorePersistedUploadedModelUrl('/models/katago-small.bin.gz')).resolves.toBeNull();
  });
});
