import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearUploadedModelUrl,
  createUploadedModelUrl,
  formatUploadedModelSize,
  getModelFileNameFromUrl,
  getUploadedModelInfo,
  isKataGoModelWeightsFile,
  MAX_BROWSER_MODEL_UPLOAD_BYTES,
  resetModelUploadStateForTests,
  restorePersistedUploadedModelUrl,
  sanitizeModelDisplayName,
  savePersistedUploadedModel,
  validateModelUploadFile,
} from '../src/utils/modelUpload';

const originalIndexedDB = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB');
const originalUrlDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'URL');

function restoreIndexedDB() {
  if (originalIndexedDB) {
    Object.defineProperty(globalThis, 'indexedDB', originalIndexedDB);
  } else {
    Reflect.deleteProperty(globalThis, 'indexedDB');
  }
}

function restoreUrl() {
  if (originalUrlDescriptor) {
    Object.defineProperty(globalThis, 'URL', originalUrlDescriptor);
  } else {
    Reflect.deleteProperty(globalThis, 'URL');
  }
}

describe('model upload helpers', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    resetModelUploadStateForTests();
    restoreIndexedDB();
    restoreUrl();
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

  it('formats uploaded model sizes without hiding small files as 0 MB', () => {
    expect(formatUploadedModelSize(0)).toBe('Unknown size');
    expect(formatUploadedModelSize(13)).toBe('13 B');
    expect(formatUploadedModelSize(1536)).toBe('1.5 KB');
    expect(formatUploadedModelSize(11 * 1024)).toBe('11 KB');
    expect(formatUploadedModelSize(1.5 * 1024 * 1024)).toBe('1.5 MB');
    expect(formatUploadedModelSize(32 * 1024 * 1024)).toBe('32 MB');
  });

  it('revokes previous uploaded model URLs and remembers the manual fallback URL', () => {
    const createObjectUrl = vi.spyOn(URL, 'createObjectURL');
    createObjectUrl.mockReturnValueOnce('blob:first');
    createObjectUrl.mockReturnValueOnce('blob:second');
    const revokeObjectUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

    const first = createUploadedModelUrl(new Blob(['a']), '/models/katago-small.bin.gz');
    expect(first).toBe('blob:first');
    expect(getUploadedModelInfo()).toMatchObject({
      name: 'Uploaded weights',
      size: 1,
      type: 'application/octet-stream',
    });

    const second = createUploadedModelUrl(new Blob(['b']), first);
    expect(second).toBe('blob:second');
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:first');

    expect(clearUploadedModelUrl('/models/fallback.bin.gz')).toBe('/models/katago-small.bin.gz');
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:second');
    expect(getUploadedModelInfo()).toBeNull();
  });

  it('tracks uploaded file names for the engine settings summary', () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValueOnce('blob:file');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const file = new File(['weights'], 'kata1-test\u202efgs.bin.gz', { type: 'application/gzip' });

    expect(createUploadedModelUrl(file, '/models/katago-small.bin.gz')).toBe('blob:file');
    expect(getUploadedModelInfo()).toMatchObject({
      name: 'kata1-testfgs.bin.gz',
      size: 7,
      type: 'application/gzip',
    });
  });

  it('preserves the selected URL and metadata if a replacement URL cannot be created', async () => {
    const create = vi.spyOn(URL, 'createObjectURL');
    const revoke = vi.spyOn(URL, 'revokeObjectURL');
    const previous = createUploadedModelUrl(new File(['usable weights'], 'previous.bin.gz'), '/models/original.bin.gz');
    const info = getUploadedModelInfo();
    create.mockImplementationOnce(() => { throw new Error('Object URL allocation failed'); });

    expect(() => createUploadedModelUrl(new Blob(['new weights']), previous))
      .toThrow('Browser object URLs are unavailable');
    expect(revoke).not.toHaveBeenCalledWith(previous);
    expect(getUploadedModelInfo()).toEqual(info);
    expect(await (await fetch(previous)).text()).toBe('usable weights');
    expect(clearUploadedModelUrl('/models/fallback.bin.gz')).toBe('/models/original.bin.gz');
    expect(revoke).toHaveBeenCalledWith(previous);
  });

  it('sanitizes model names derived from uploads and URLs', () => {
    expect(sanitizeModelDisplayName('  kata\u202efgs.bin.gz  ')).toBe('katafgs.bin.gz');
    expect(sanitizeModelDisplayName('\u200b')).toBe('Uploaded weights');
    expect(getModelFileNameFromUrl('https://example.test/models/kata%20b18.bin.gz?download=1')).toBe('kata b18.bin.gz');
    expect(getModelFileNameFromUrl('/models/review%E2%80%AEfgs.bin.gz#hash')).toBe('reviewfgs.bin.gz');
    expect(getModelFileNameFromUrl('not a url')).toBe('not a url');
  });

  it('gracefully skips persistent upload storage when IndexedDB is unavailable', async () => {
    expect(await savePersistedUploadedModel(new Blob(['weights'], { type: 'application/gzip' }))).toBe(false);
    await expect(restorePersistedUploadedModelUrl('/models/katago-small.bin.gz')).resolves.toBeNull();
  });

  it('gracefully skips persistent upload storage when IndexedDB access throws', async () => {
    Object.defineProperty(globalThis, 'indexedDB', {
      configurable: true,
      get: () => {
        throw new Error('indexedDB blocked');
      },
    });

    expect(await savePersistedUploadedModel(new Blob(['weights'], { type: 'application/gzip' }))).toBe(false);
    await expect(restorePersistedUploadedModelUrl('/models/katago-small.bin.gz')).resolves.toBeNull();
  });

  it('throws a clear upload error when object URLs are unavailable', () => {
    Object.defineProperty(globalThis, 'URL', {
      configurable: true,
      get() {
        throw new Error('object urls blocked');
      },
    });

    expect(() => createUploadedModelUrl(new Blob(['weights']), '/models/katago-small.bin.gz')).toThrow(
      'Browser object URLs are unavailable'
    );
  });
});
