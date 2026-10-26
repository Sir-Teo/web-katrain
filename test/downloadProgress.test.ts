import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchBlobWithProgress, responseBlobWithProgress } from '../src/utils/downloadProgress';

const encoder = new TextEncoder();

function responseFromChunks(chunks: string[], headers?: HeadersInit): Response {
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
        controller.close();
      },
    }),
    { headers }
  );
}

describe('download progress helpers', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('reports byte counts and percentages while reading a response stream', async () => {
    const progress: Array<{ receivedBytes: number; totalBytes: number | null; percent: number | null }> = [];
    const response = responseFromChunks(['abc', 'defg'], {
      'content-length': '7',
      'content-type': 'application/x-go-sgf',
    });

    const blob = await responseBlobWithProgress(response, (update) => progress.push(update));

    expect(await blob.text()).toBe('abcdefg');
    expect(blob.type).toBe('application/x-go-sgf');
    expect(progress).toEqual([
      { receivedBytes: 3, totalBytes: 7, percent: 43 },
      { receivedBytes: 7, totalBytes: 7, percent: 100 },
    ]);
  });

  it('keeps progress indeterminate when content length is unknown', async () => {
    const progress: Array<{ receivedBytes: number; totalBytes: number | null; percent: number | null }> = [];
    const response = responseFromChunks(['abc', 'def']);

    const blob = await responseBlobWithProgress(response, (update) => progress.push(update));

    expect(await blob.text()).toBe('abcdef');
    expect(progress).toEqual([
      { receivedBytes: 3, totalBytes: null, percent: null },
      { receivedBytes: 6, totalBytes: null, percent: null },
    ]);
  });

  it('throws a clear error for failed fetches', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 503 })));

    await expect(fetchBlobWithProgress('/model.bin.gz')).rejects.toThrow('Download failed (503)');
  });

  it('passes cancellation to fetch and refuses an already cancelled download', async () => {
    const fetchMock = vi.fn(async () => new Response('weights'));
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();
    const blob = await fetchBlobWithProgress('/model.bin.gz', undefined, controller.signal);
    expect(await blob.text()).toBe('weights');
    expect(fetchMock).toHaveBeenCalledWith('/model.bin.gz', { signal: controller.signal });
    controller.abort();
    await expect(fetchBlobWithProgress('/model.bin.gz', undefined, controller.signal))
      .rejects.toMatchObject({ name: 'AbortError' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rejects a late response even if the fetch implementation ignores cancellation', async () => {
    let finish!: (response: Response) => void;
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(resolve => { finish = resolve; })));
    const controller = new AbortController();
    const download = fetchBlobWithProgress('/model.bin.gz', undefined, controller.signal);
    controller.abort();
    finish(new Response('late weights'));
    await expect(download).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('rejects cancellation during body streaming instead of returning partial weights', async () => {
    let stream!: ReadableStreamDefaultController<Uint8Array>;
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new ReadableStream<Uint8Array>({
      start(controller) { stream = controller; },
    }))));
    const controller = new AbortController();
    const progressed = vi.fn(() => { controller.abort(); stream.close(); });
    const download = fetchBlobWithProgress('/model.bin.gz', progressed, controller.signal);
    stream.enqueue(encoder.encode('partial weights'));
    await expect(download).rejects.toMatchObject({ name: 'AbortError' });
    expect(progressed).toHaveBeenCalledTimes(1);
  });
});
