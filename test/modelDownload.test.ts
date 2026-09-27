import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  downloadModelBytes,
  isModelDownloadCanceledError,
  MODEL_DOWNLOAD_MAX_BYTES,
} from '../src/engine/katago/modelDownload';

/**
 * Model downloads used to be a bare fetch + arrayBuffer: no way to abort a net
 * the user had already replaced, no guard against a huge file, and a stalled
 * connection hung the worker's queue forever.
 */

type FetchCall = { url: string; signal: AbortSignal | undefined };

function streamOf(chunks: Uint8Array[], opts: { hangAfter?: boolean } = {}) {
  let pulls = 0;
  let index = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      pulls++;
      if (index < chunks.length) {
        controller.enqueue(chunks[index++]!);
        return;
      }
      if (opts.hangAfter) return new Promise<void>(() => {});
      controller.close();
    },
  });
  return { stream, pulls: () => pulls };
}

function fakeFetch(handler: (call: FetchCall, attempt: number) => Promise<Response> | Response) {
  const calls: FetchCall[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const call = { url: String(input), signal: init?.signal ?? undefined };
    calls.push(call);
    return handler(call, calls.length);
  }) as typeof fetch;
  return { fetchImpl, calls };
}

describe('model downloads', () => {
  it('streams the body into one buffer', async () => {
    const { stream } = streamOf([new Uint8Array([1, 2]), new Uint8Array([3]), new Uint8Array([4, 5, 6])]);
    const { fetchImpl, calls } = fakeFetch(() => new Response(stream));
    const bytes = await downloadModelBytes('https://example.test/net.bin.gz', { fetchImpl });
    expect(Array.from(bytes)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.signal).toBeDefined();
  });

  it('keeps the existing HTTP error message and does not retry it', async () => {
    const { fetchImpl, calls } = fakeFetch(() => new Response('nope', { status: 404, statusText: 'Not Found' }));
    await expect(downloadModelBytes('https://example.test/missing', { fetchImpl })).rejects.toThrow(
      'Failed to fetch model: 404 Not Found'
    );
    await expect(
      downloadModelBytes('https://example.test/missing', { fetchImpl, label: 'human model' })
    ).rejects.toThrow('Failed to fetch human model: 404 Not Found');
    expect(calls).toHaveLength(2);
  });

  it('refuses an oversized file from its Content-Length before reading the body', async () => {
    const { stream, pulls } = streamOf([new Uint8Array(10)]);
    const { fetchImpl } = fakeFetch(() => new Response(stream, { headers: { 'content-length': String(2048) } }));
    await expect(downloadModelBytes('https://example.test/huge', { fetchImpl, maxBytes: 1024 })).rejects.toThrow(
      /too large/
    );
    // The stream may prefetch a chunk, but nothing is drained into memory.
    expect(pulls()).toBeLessThanOrEqual(1);
  });

  it('stops reading once the streamed size passes the limit', async () => {
    const { stream, pulls } = streamOf(Array.from({ length: 10 }, () => new Uint8Array(400)));
    const { fetchImpl, calls } = fakeFetch(() => new Response(stream));
    await expect(downloadModelBytes('https://example.test/huge', { fetchImpl, maxBytes: 1000 })).rejects.toThrow(
      /too large/
    );
    expect(pulls()).toBeLessThan(10);
    expect(calls).toHaveLength(1);
  });

  it('has a generous default limit', () => {
    expect(MODEL_DOWNLOAD_MAX_BYTES).toBeGreaterThanOrEqual(300 * 1024 * 1024);
  });

  it('retries a network failure once', async () => {
    const { fetchImpl, calls } = fakeFetch((_call, attempt) => {
      if (attempt === 1) throw new TypeError('Failed to fetch');
      return new Response(new Uint8Array([7, 8]));
    });
    const bytes = await downloadModelBytes('https://example.test/net', { fetchImpl });
    expect(Array.from(bytes)).toEqual([7, 8]);
    expect(calls).toHaveLength(2);
  });

  it('gives up after the retry fails too', async () => {
    const { fetchImpl, calls } = fakeFetch(() => {
      throw new TypeError('Failed to fetch');
    });
    await expect(downloadModelBytes('https://example.test/net', { fetchImpl })).rejects.toThrow('Failed to fetch');
    expect(calls).toHaveLength(2);
  });

  it('times out a stalled body and retries it', async () => {
    const { fetchImpl, calls } = fakeFetch((call, attempt) => {
      if (attempt === 1) {
        const { stream } = streamOf([new Uint8Array([1])], { hangAfter: true });
        return new Response(stream);
      }
      expect(call.signal?.aborted).toBe(false);
      return new Response(new Uint8Array([9]));
    });
    const bytes = await downloadModelBytes('https://example.test/net', { fetchImpl, stallTimeoutMs: 30 });
    expect(Array.from(bytes)).toEqual([9]);
    expect(calls).toHaveLength(2);
    expect(calls[0]!.signal?.aborted).toBe(true);
  });

  it('reports a stall that outlasts the retry', async () => {
    const { fetchImpl } = fakeFetch(() => new Response(streamOf([], { hangAfter: true }).stream));
    await expect(
      downloadModelBytes('https://example.test/net', { fetchImpl, stallTimeoutMs: 20 })
    ).rejects.toThrow(/stalled/);
  });

  it('aborts the transfer when the caller cancels it, without retrying', async () => {
    const controller = new AbortController();
    const { fetchImpl, calls } = fakeFetch(() => {
      const { stream } = streamOf([new Uint8Array([1])], { hangAfter: true });
      setTimeout(() => controller.abort(), 5);
      return new Response(stream);
    });
    const err = await downloadModelBytes('https://example.test/net', {
      fetchImpl,
      signal: controller.signal,
    }).catch((e: unknown) => e);
    expect(isModelDownloadCanceledError(err)).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.signal?.aborted).toBe(true);
  });

  it('does not start when already canceled', async () => {
    const controller = new AbortController();
    controller.abort();
    const { fetchImpl, calls } = fakeFetch(() => new Response(new Uint8Array([1])));
    const err = await downloadModelBytes('https://example.test/net', { fetchImpl, signal: controller.signal }).catch(
      (e: unknown) => e
    );
    expect(isModelDownloadCanceledError(err)).toBe(true);
    expect(calls).toHaveLength(0);
  });
});

describe('worker model download wiring', () => {
  const source = fs.readFileSync('src/engine/katago/worker.ts', 'utf8');

  it('loads both networks through the bounded downloader', () => {
    expect(source).not.toMatch(/await fetch\(modelUrl\)/);
    expect(source).toContain("await fetchModelBytes('main', modelUrl)");
    expect(source).toContain("await fetchModelBytes('human', modelUrl)");
  });

  it('aborts a download as soon as a message names a different model', () => {
    const onmessage = source.slice(source.indexOf('self.onmessage'));
    const noteAt = onmessage.indexOf("noteRequestedModel('main', msg.modelUrl);");
    expect(noteAt).toBeGreaterThan(-1);
    // Noted on arrival, not when the serial queue reaches the message.
    expect(noteAt).toBeLessThan(onmessage.indexOf('queue = queue'));
    expect(source).toContain('if (active && active.url !== url) active.controller.abort();');
  });

  it('answers an analysis whose model was superseded as canceled', () => {
    expect(source).toContain('if (isModelDownloadCanceledError(err)) {');
  });
});
