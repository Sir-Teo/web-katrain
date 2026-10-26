// Library records are data, not app-shell assets. The service worker must keep
// this namespace when it removes obsolete application bundles.
export const LIBRARY_DATA_CACHE = 'web-katrain-library-data-v1';
const SNAPSHOT_KEY = 'https://web-katrain.invalid/library-fallback-snapshot';

const storage = (): CacheStorage | undefined =>
  typeof globalThis.caches === 'undefined' ? undefined : globalThis.caches;

const unsupported = (error: unknown): boolean => error instanceof Error
  && (error.name === 'SecurityError' || error.name === 'NotSupportedError');

/** undefined means the API is absent; null means it has no snapshot yet. */
export async function readFallbackCache(): Promise<string | null | undefined> {
  try {
    const caches = storage();
    if (!caches) return undefined;
    const response = await caches.match(SNAPSHOT_KEY, { cacheName: LIBRARY_DATA_CACHE });
    return response ? response.text() : null;
  } catch (error) {
    // Some private/embedded contexts expose the API but disable its use.
    if (unsupported(error)) return undefined;
    throw error;
  }
}

export async function writeFallbackCache(raw: string): Promise<void> {
  const caches = storage();
  if (!caches) throw new Error('Shared browser storage is unavailable.');
  const cache = await caches.open(LIBRARY_DATA_CACHE);
  await cache.put(SNAPSHOT_KEY, new Response(raw, { headers: { 'Content-Type': 'application/json' } }));
}

export async function clearFallbackCache(): Promise<void> {
  const caches = storage();
  if (!caches) throw new Error('Shared browser storage is unavailable.');
  await caches.delete(LIBRARY_DATA_CACHE);
}
