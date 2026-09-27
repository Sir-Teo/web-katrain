/**
 * Downloads a network file for the worker. A bare `fetch` + `arrayBuffer()`
 * had no way to stop: a model the user had already replaced kept downloading
 * (and then got parsed and uploaded to the GPU) ahead of the one they wanted,
 * a stalled connection hung the engine queue forever, and a mistyped URL
 * pointing at something huge was buffered in full before anything looked at it.
 */

/**
 * Largest file accepted. The biggest official KataGo nets are a little under
 * 300 MB gzipped, so this leaves room for an uncompressed or larger net while
 * still refusing something that is plainly not a model.
 */
export const MODEL_DOWNLOAD_MAX_BYTES = 768 * 1024 * 1024;

/** How long the download may go without receiving a single byte. */
export const MODEL_DOWNLOAD_STALL_TIMEOUT_MS = 45_000;

/** Extra attempts after a network failure or a stall; HTTP errors are not retried. */
export const MODEL_DOWNLOAD_RETRIES = 1;

/** The caller no longer wants this download, typically because a newer model replaced it. */
export class ModelDownloadCanceledError extends Error {
  readonly canceled = true;

  constructor(message = 'Model download canceled') {
    super(message);
    this.name = 'ModelDownloadCanceledError';
  }
}

export const isModelDownloadCanceledError = (err: unknown): err is ModelDownloadCanceledError =>
  err instanceof ModelDownloadCanceledError;

class ModelDownloadStalledError extends Error {
  constructor(label: string, timeoutMs: number) {
    super(`The ${label} download stalled (no data for ${Math.round(timeoutMs / 1000)}s)`);
    this.name = 'ModelDownloadStalledError';
  }
}

/** Errors that end the download for good: another attempt would fail the same way. */
class ModelDownloadFatalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ModelDownloadFatalError';
  }
}

export interface ModelDownloadOptions {
  /** Used in error messages: "model", "human model". */
  label?: string;
  signal?: AbortSignal;
  maxBytes?: number;
  stallTimeoutMs?: number;
  retries?: number;
  fetchImpl?: typeof fetch;
}

function formatMb(bytes: number): string {
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}

function tooLargeError(label: string, bytes: number, maxBytes: number): ModelDownloadFatalError {
  return new ModelDownloadFatalError(
    `The ${label} file is too large (${formatMb(bytes)}; the limit is ${formatMb(maxBytes)})`
  );
}

async function downloadOnce(url: string, options: Required<Omit<ModelDownloadOptions, 'signal'>> & { signal?: AbortSignal }): Promise<Uint8Array> {
  const { label, maxBytes, stallTimeoutMs, fetchImpl, signal } = options;
  const controller = new AbortController();
  let stalled = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const armStallTimer = () => {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      stalled = true;
      controller.abort();
    }, stallTimeoutMs);
  };
  const onCallerAbort = () => controller.abort();
  signal?.addEventListener('abort', onCallerAbort);

  try {
    armStallTimer();
    const res = await fetchImpl(url, { signal: controller.signal });
    if (!res.ok) throw new ModelDownloadFatalError(`Failed to fetch ${label}: ${res.status} ${res.statusText}`);

    const declared = Number(res.headers.get('content-length'));
    // A gzip-encoded response reports the compressed length, so this is only
    // a lower bound on what arrives; the running total below is authoritative.
    if (Number.isFinite(declared) && declared > maxBytes) throw tooLargeError(label, declared, maxBytes);

    const reader = res.body?.getReader();
    if (!reader) {
      const buf = new Uint8Array(await res.arrayBuffer());
      if (buf.byteLength > maxBytes) throw tooLargeError(label, buf.byteLength, maxBytes);
      return buf;
    }

    // fetch errors the body stream on abort, but cancelling the reader as well
    // does not depend on that; a cancelled read ends as `done`, which the
    // aborted check below turns back into a failure.
    const cancelReader = () => {
      reader.cancel().catch(() => {});
    };
    controller.signal.addEventListener('abort', cancelReader);
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
      while (true) {
        armStallTimer();
        const { done, value } = await reader.read();
        if (controller.signal.aborted) throw new Error('Model download aborted');
        if (done) break;
        if (!value || value.byteLength === 0) continue;
        total += value.byteLength;
        if (total > maxBytes) throw tooLargeError(label, total, maxBytes);
        chunks.push(value);
      }
    } catch (err) {
      cancelReader();
      throw err;
    } finally {
      controller.signal.removeEventListener('abort', cancelReader);
    }

    if (chunks.length === 1) return chunks[0]!;
    const out = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      out.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return out;
  } catch (err) {
    if (signal?.aborted) throw new ModelDownloadCanceledError(`The ${label} download was canceled`);
    if (stalled) throw new ModelDownloadStalledError(label, stallTimeoutMs);
    throw err;
  } finally {
    if (timer !== null) clearTimeout(timer);
    signal?.removeEventListener('abort', onCallerAbort);
  }
}

/**
 * Fetches `url` into memory, streaming so the size limit and stall timer apply
 * as bytes arrive. Aborting `signal` rejects with ModelDownloadCanceledError.
 */
export async function downloadModelBytes(url: string, options: ModelDownloadOptions = {}): Promise<Uint8Array> {
  const resolved = {
    label: options.label ?? 'model',
    maxBytes: options.maxBytes ?? MODEL_DOWNLOAD_MAX_BYTES,
    stallTimeoutMs: options.stallTimeoutMs ?? MODEL_DOWNLOAD_STALL_TIMEOUT_MS,
    retries: Math.max(0, options.retries ?? MODEL_DOWNLOAD_RETRIES),
    fetchImpl: options.fetchImpl ?? ((input, init) => fetch(input, init)),
    signal: options.signal,
  };

  for (let attempt = 0; ; attempt++) {
    if (resolved.signal?.aborted) throw new ModelDownloadCanceledError(`The ${resolved.label} download was canceled`);
    try {
      return await downloadOnce(url, resolved);
    } catch (err) {
      if (err instanceof ModelDownloadCanceledError) throw err;
      if (err instanceof ModelDownloadFatalError) throw new Error(err.message);
      // Anything else is the network: a refused connection, a reset mid-body,
      // or the stall timer. One more try rides out a blip.
      if (attempt >= resolved.retries) throw err;
    }
  }
}
