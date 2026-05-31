import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createObjectUrl,
  createObjectUrlOrThrow,
  downloadBlob,
  getObjectUrlApi,
  OBJECT_URL_UNAVAILABLE_MESSAGE,
  revokeObjectUrl,
} from '../src/utils/objectUrl';

const originalUrlDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'URL');
const originalDocumentDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');

function restoreUrl() {
  if (originalUrlDescriptor) {
    Object.defineProperty(globalThis, 'URL', originalUrlDescriptor);
  } else {
    Reflect.deleteProperty(globalThis, 'URL');
  }
}

function restoreDocument() {
  if (originalDocumentDescriptor) {
    Object.defineProperty(globalThis, 'document', originalDocumentDescriptor);
  } else {
    Reflect.deleteProperty(globalThis, 'document');
  }
}

describe('object URL helpers', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    restoreUrl();
    restoreDocument();
  });

  it('downloads blobs with cleanup when object URLs are available', () => {
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:download');
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const click = vi.fn();
    const removeChild = vi.fn();
    const link = { click, parentNode: { removeChild }, href: '', download: '' };
    const appendChild = vi.fn();
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: {
        body: { appendChild },
        createElement: vi.fn(() => link),
      },
    });

    expect(downloadBlob(new Blob(['sgf']), 'game.sgf')).toBe(true);

    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(link.href).toBe('blob:download');
    expect(link.download).toBe('game.sgf');
    expect(appendChild).toHaveBeenCalledWith(link);
    expect(click).toHaveBeenCalledTimes(1);
    expect(removeChild).toHaveBeenCalledWith(link);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:download');
  });

  it('returns null or false when object URL access is blocked', () => {
    Object.defineProperty(globalThis, 'URL', {
      configurable: true,
      get() {
        throw new Error('object urls blocked');
      },
    });

    expect(getObjectUrlApi()).toBeNull();
    expect(createObjectUrl(new Blob(['sgf']))).toBeNull();
    expect(downloadBlob(new Blob(['sgf']), 'game.sgf')).toBe(false);
    expect(() => revokeObjectUrl('blob:old')).not.toThrow();
  });

  it('throws a clear error for call sites that need a usable object URL', () => {
    vi.spyOn(URL, 'createObjectURL').mockImplementation(() => {
      throw new Error('blocked');
    });

    expect(() => createObjectUrlOrThrow(new Blob(['weights']))).toThrow(OBJECT_URL_UNAVAILABLE_MESSAGE);
  });
});
