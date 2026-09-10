import { describe, expect, it } from 'vitest';
import { readBoundedResponseText } from '../src/utils/ogsQueue';

/** A Response whose body streams `chunks` of `size` bytes. */
const streaming = (chunks: number, size: number): Response => {
  let sent = 0;
  return new Response(new ReadableStream<Uint8Array>({
    pull(controller) {
      if (sent >= chunks) {
        controller.close();
        return;
      }
      sent += 1;
      controller.enqueue(new TextEncoder().encode('a'.repeat(size)));
    },
  }));
};

describe('readBoundedResponseText', () => {
  it('returns a body that fits', async () => {
    await expect(readBoundedResponseText(new Response('(;GM[1])'), 1024)).resolves.toBe('(;GM[1])');
  });

  it('reads a streamed body whole when it stays under the limit', async () => {
    const text = await readBoundedResponseText(streaming(4, 1000), 1024 * 1024);

    expect(text).toHaveLength(4000);
  });

  it('refuses a body that runs past the limit', async () => {
    // fetch decompresses before this sees anything, so a small gzip body from
    // the other end is as much memory as it asks for. Everything this app
    // checks about an OGS response is checked after the read.
    await expect(readBoundedResponseText(streaming(100, 64 * 1024), 128 * 1024))
      .rejects.toThrow(/more data than this app will read/);
  });

  it('stops reading rather than draining the rest', async () => {
    let produced = 0;
    const response = new Response(new ReadableStream<Uint8Array>({
      pull(controller) {
        produced += 1;
        if (produced > 10_000) {
          controller.close();
          return;
        }
        controller.enqueue(new TextEncoder().encode('a'.repeat(64 * 1024)));
      },
    }));

    await expect(readBoundedResponseText(response, 128 * 1024)).rejects.toThrow();
    // A handful of chunks, not ten thousand: the reader is cancelled, so the
    // rest of the transfer never happens.
    expect(produced).toBeLessThan(50);
  });

  it('still handles a response with no body stream', async () => {
    const bodyless = { body: null, text: async () => 'x'.repeat(10) } as unknown as Response;

    await expect(readBoundedResponseText(bodyless, 5)).rejects.toThrow();
    await expect(readBoundedResponseText(bodyless, 100)).resolves.toBe('x'.repeat(10));
  });
});
