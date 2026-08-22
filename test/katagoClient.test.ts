import { afterEach, describe, expect, it, vi } from 'vitest';
import { getKataGoEngineClient, resetKataGoEngineClientForTests } from '../src/engine/katago/client';

const originalWorker = Object.getOwnPropertyDescriptor(globalThis, 'Worker');

type FakeWorkerInstance = {
  onmessage: ((event: { data: unknown }) => void) | null;
  onerror: ((event: { error?: unknown; message?: string }) => void) | null;
  onmessageerror: ((event: unknown) => void) | null;
  postMessage: (data: unknown) => void;
  terminate: () => void;
};

const createdFakeWorkers: FakeWorkerInstance[] = [];

class FakeWorker {
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: ((event: { error?: unknown; message?: string }) => void) | null = null;
  onmessageerror: ((event: unknown) => void) | null = null;
  postMessage = vi.fn();
  terminate = vi.fn();

  constructor() {
    createdFakeWorkers.push(this);
  }
}

function installFakeWorker() {
  createdFakeWorkers.length = 0;
  Object.defineProperty(globalThis, 'Worker', {
    configurable: true,
    value: FakeWorker,
  });
}

function flushMicrotasks() {
  return new Promise<void>((resolve) => setTimeout(resolve, 0));
}

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

  it('rejects in-flight requests when the worker crashes instead of hanging forever', async () => {
    installFakeWorker();
    const client = getKataGoEngineClient();

    const first = client.analyze({
      modelUrl: '/models/katago-small.bin.gz',
      board: [[null]],
      currentPlayer: 'black',
      moveHistory: [],
      komi: 6.5,
    });
    const second = client.evaluate({
      modelUrl: '/models/katago-small.bin.gz',
      board: [[null]],
      currentPlayer: 'black',
      moveHistory: [],
      komi: 6.5,
    });
    await flushMicrotasks();
    expect(createdFakeWorkers).toHaveLength(1);

    createdFakeWorkers[0]!.onerror?.({ message: 'script load failed' });

    await expect(first).rejects.toThrow(/KataGo worker crashed: script load failed/);
    await expect(second).rejects.toThrow(/KataGo worker crashed: script load failed/);
  });

  it('fails fast on requests made after a crash until the worker responds again', async () => {
    installFakeWorker();
    const client = getKataGoEngineClient();

    const inFlight = client.analyze({
      modelUrl: '/models/katago-small.bin.gz',
      board: [[null]],
      currentPlayer: 'black',
      moveHistory: [],
      komi: 6.5,
    });
    await flushMicrotasks();
    createdFakeWorkers[0]!.onerror?.({ message: 'gone' });
    await expect(inFlight).rejects.toThrow(/KataGo worker crashed: gone/);

    await expect(
      client.analyze({
        modelUrl: '/models/katago-small.bin.gz',
        board: [[null]],
        currentPlayer: 'black',
        moveHistory: [],
        komi: 6.5,
      })
    ).rejects.toThrow(/KataGo worker crashed: gone/);

    // A live message from the worker proves it recovered: new requests are
    // posted again instead of failing with the stale crash error.
    createdFakeWorkers[0]!.onmessage?.({
      data: { type: 'katago:init_result', ok: true, backend: 'wasm', modelName: 'katago-small' },
    });

    const afterRecovery = client.analyze({
      modelUrl: '/models/katago-small.bin.gz',
      board: [[null]],
      currentPlayer: 'black',
      moveHistory: [],
      komi: 6.5,
    });
    const outcome = await Promise.race([
      afterRecovery.then(
        () => 'resolved' as const,
        () => 'rejected' as const
      ),
      flushMicrotasks().then(() => 'still-pending' as const),
    ]);
    expect(outcome).toBe('still-pending');
    expect(createdFakeWorkers[0]!.postMessage).toHaveBeenCalledTimes(2);
  });

  it('rejects pending requests when disposed', async () => {
    installFakeWorker();
    const client = getKataGoEngineClient();

    const pending = client.analyze({
      modelUrl: '/models/katago-small.bin.gz',
      board: [[null]],
      currentPlayer: 'black',
      moveHistory: [],
      komi: 6.5,
    });
    await flushMicrotasks();

    client.dispose();

    await expect(pending).rejects.toThrow(/KataGo engine client was disposed/);
    expect(createdFakeWorkers[0]!.terminate).toHaveBeenCalled();
  });
});
