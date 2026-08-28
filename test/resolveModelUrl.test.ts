import { afterEach, describe, expect, it } from 'vitest';
import { resolveModelUrl } from '../src/utils/positionEval';

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');

function withLocation(href: string, origin: string) {
  Object.defineProperty(globalThis, 'window', {
    value: { location: { href, origin } },
    configurable: true,
    writable: true,
  });
}

afterEach(() => {
  if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
  else Reflect.deleteProperty(globalThis, 'window');
});

describe('resolving a model URL', () => {
  it('leaves an absolute URL alone', () => {
    withLocation('https://example.com/web-katrain/', 'https://example.com');
    for (const url of [
      'https://cdn.example.com/model.bin.gz',
      'http://cdn.example.com/model.bin.gz',
      'blob:https://example.com/abc-123',
      'data:application/octet-stream;base64,AAAA',
      'file:///models/model.bin.gz',
    ]) {
      expect(resolveModelUrl(url)).toBe(url);
    }
  });

  it('leaves a protocol-relative URL alone', () => {
    withLocation('https://example.com/web-katrain/', 'https://example.com');
    expect(resolveModelUrl('//cdn.example.com/model.bin.gz')).toBe('//cdn.example.com/model.bin.gz');
  });

  it('resolves a root-relative path against the origin', () => {
    withLocation('https://example.com/web-katrain/analyze', 'https://example.com');
    expect(resolveModelUrl('/models/katago.bin.gz')).toBe('https://example.com/models/katago.bin.gz');
  });

  it('resolves a bare path against the page, so a deployed base path survives', () => {
    // The reason this function exists: on Pages the app lives under a
    // sub-path, and a relative model URL must stay inside it.
    withLocation('https://sir-teo.github.io/web-katrain/', 'https://sir-teo.github.io');
    expect(resolveModelUrl('models/katago.bin.gz'))
      .toBe('https://sir-teo.github.io/web-katrain/models/katago.bin.gz');
  });

  it('trims surrounding whitespace before deciding', () => {
    withLocation('https://example.com/web-katrain/', 'https://example.com');
    expect(resolveModelUrl('  https://cdn.example.com/m.bin  ')).toBe('https://cdn.example.com/m.bin');
    expect(resolveModelUrl('   ')).toBe('');
  });

  it('is case-insensitive about the scheme', () => {
    withLocation('https://example.com/', 'https://example.com');
    expect(resolveModelUrl('HTTPS://cdn.example.com/m.bin')).toBe('HTTPS://cdn.example.com/m.bin');
    expect(resolveModelUrl('Blob:https://example.com/x')).toBe('Blob:https://example.com/x');
  });

  it('hands the value back untouched when there is no page to resolve against', () => {
    Reflect.deleteProperty(globalThis, 'window');
    expect(resolveModelUrl('models/katago.bin.gz')).toBe('models/katago.bin.gz');
    expect(resolveModelUrl('/models/katago.bin.gz')).toBe('/models/katago.bin.gz');
  });
});
