import { afterEach, describe, expect, it, vi } from 'vitest';
import { getKataGoEngineClient, resetKataGoEngineClientForTests } from '../src/engine/katago/client';

const originalWorker = Object.getOwnPropertyDescriptor(globalThis, 'Worker');

function restoreWorker() {
  resetKataGoEngineClientForTests();
  if (originalWorker) {
    Object.defineProperty(globalThis, 'Worker', originalWorker);
  } else {
    Reflect.deleteProperty(globalThis, 'Worker');
  }
}

describe('KataGo engine client', () => {
  afterEach(() => {
    restoreWorker();
  });

  it('reports a clear error when browser workers are unavailable', () => {
    Object.defineProperty(globalThis, 'Worker', {
      configurable: true,
      get() {
        throw new Error('worker blocked');
      },
    });

    expect(() => getKataGoEngineClient()).toThrow(/Browser Worker API is unavailable/);
  });

  it('does not wedge init state when worker postMessage fails', async () => {
    class BlockedMessageWorker {
      onmessage: ((event: MessageEvent) => void) | null = null;
      postMessage = vi.fn(() => {
        throw new Error('postMessage blocked');
      });
      terminate = vi.fn();
    }

    Object.defineProperty(globalThis, 'Worker', {
      configurable: true,
      value: BlockedMessageWorker,
    });

    const client = getKataGoEngineClient();
    await expect(client.init('/models/katago-small.bin.gz')).rejects.toThrow(
      /KataGo worker message failed: postMessage blocked/
    );
    await expect(client.init('/models/katago-small.bin.gz')).rejects.toThrow(
      /KataGo worker message failed: postMessage blocked/
    );
  });
});
