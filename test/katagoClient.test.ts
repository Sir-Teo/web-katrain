import { afterEach, describe, expect, it, vi } from 'vitest';
import { getKataGoEngineClient, resetKataGoEngineClientForTests } from '../src/engine/katago/client';
import { AnalysisQueue, AnalysisQueueSignal } from '../src/utils/analysisQueue';

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

const analyzeArgs = (): Parameters<ReturnType<typeof getKataGoEngineClient>['analyze']>[0] => ({
  modelUrl: '/models/katago-small.bin.gz', board: [[null]], currentPlayer: 'black', moveHistory: [], komi: 6.5,
});

describe('KataGo engine client', () => {
  afterEach(() => {
    restoreWorker();
  });

  it('preserves search history beyond the five neural feature moves', async () => {
    installFakeWorker();
    const client = getKataGoEngineClient();
    const worker = createdFakeWorkers[0]!;
    const moveHistory = Array.from({ length: 80 }, (_, i) => ({
      x: i % 2 === 0 ? (i / 2) % 9 : -1,
      y: i % 2 === 0 ? Math.floor(i / 18) : -1,
      player: i % 2 === 0 ? 'black' as const : 'white' as const,
    }));
    const pending = client.analyze({ ...analyzeArgs(), moveHistory });
    // The worker needs the true turn number and at least seven recent moves
    // for repeated-pass pruning; a neural input's five-move cap is insufficient.
    const sent = vi.mocked(worker.postMessage).mock.calls[0]![0];
    worker.onmessage?.({ data: { type: 'katago:analyze_result', id: 1, ok: true, analysis: { rootVisits: 8, moves: [] } } });
    await pending;
    expect(sent).toMatchObject({ type: 'katago:analyze', moveHistory });
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

  it('does not send an already-canceled analysis to the worker', async () => {
    installFakeWorker();
    const client = getKataGoEngineClient();
    const signal = new AnalysisQueueSignal();
    signal.abort('Stopped');
    await expect(client.analyze({ ...analyzeArgs(), signal })).rejects.toMatchObject({ canceled: true });
    expect(createdFakeWorkers[0]!.postMessage).not.toHaveBeenCalled();
  });

  it('cancels one request promptly and ignores its late progress and result', async () => {
    installFakeWorker();
    const client = getKataGoEngineClient();
    const worker = createdFakeWorkers[0]!;
    const signal = new AnalysisQueueSignal();
    const onProgress = vi.fn();
    const first = client.analyze({ ...analyzeArgs(), analysisGroup: 'interactive', signal, onProgress });
    signal.abort('Stopped');
    await expect(first).rejects.toMatchObject({ canceled: true });
    expect(worker.postMessage).toHaveBeenLastCalledWith({ type: 'katago:cancel', id: 1, analysisGroup: 'interactive' });

    const second = client.analyze(analyzeArgs());
    const analysis = { rootVisits: 16, moves: [] };
    worker.onmessage?.({ data: { type: 'katago:analyze_update', id: 1, ok: true, analysis } });
    worker.onmessage?.({ data: { type: 'katago:analyze_result', id: 1, ok: true, analysis } });
    expect(onProgress).not.toHaveBeenCalled();
    worker.onmessage?.({ data: { type: 'katago:analyze_result', id: 2, ok: true, analysis } });
    await expect(second).resolves.toEqual(analysis);
  });

  it('releases a stopped queue job without waiting for a worker acknowledgment', async () => {
    installFakeWorker();
    const client = getKataGoEngineClient();
    const worker = createdFakeWorkers[0]!;
    const queue = new AnalysisQueue();
    const run = (ctx: { signal: AnalysisQueueSignal }) => client.analyze({ ...analyzeArgs(), signal: ctx.signal });
    const first = queue.enqueue({ group: 'study', priority: 1, run });
    const second = queue.enqueue({ group: 'next', priority: 1, run });
    expect(worker.postMessage).toHaveBeenCalledTimes(1);
    queue.cancelGroup('study');
    await expect(first).rejects.toMatchObject({ canceled: true });
    await flushMicrotasks();
    expect(worker.postMessage).toHaveBeenNthCalledWith(2, { type: 'katago:cancel', id: 1, analysisGroup: 'background' });
    expect(worker.postMessage).toHaveBeenNthCalledWith(3, expect.objectContaining({ type: 'katago:analyze', id: 2 }));
    worker.onmessage?.({ data: { type: 'katago:analyze_result', id: 2, ok: false, canceled: true } });
    await expect(second).rejects.toMatchObject({ canceled: true });
  });

  it.each(['result', 'error', 'crash', 'dispose'] as const)('removes the abort listener after %s', async (ending) => {
    installFakeWorker();
    const client = getKataGoEngineClient();
    const worker = createdFakeWorkers[0]!;
    const unsubscribe = vi.fn();
    const signal = { aborted: false, addAbortListener: vi.fn(() => unsubscribe) };
    const pending = client.analyze({ ...analyzeArgs(), signal });
    const outcome = pending.catch(() => undefined);
    if (ending === 'result') {
      worker.onmessage?.({ data: { type: 'katago:analyze_result', id: 1, ok: true, analysis: { rootVisits: 16, moves: [] } } });
    } else if (ending === 'error') {
      worker.onmessage?.({ data: { type: 'katago:analyze_result', id: 1, ok: false, error: 'Search failed' } });
    } else if (ending === 'crash') {
      worker.onerror?.({ message: 'Worker died' });
    } else {
      client.dispose();
    }
    await outcome;
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it('settles cancellation even if posting its control message fails', async () => {
    installFakeWorker();
    const client = getKataGoEngineClient();
    const worker = createdFakeWorkers[0]!;
    const signal = new AnalysisQueueSignal();
    const pending = client.analyze({ ...analyzeArgs(), signal });
    vi.mocked(worker.postMessage).mockImplementationOnce(() => { throw new Error('Worker unavailable'); });
    expect(() => signal.abort('Stopped')).not.toThrow();
    await expect(pending).rejects.toThrow('Worker unavailable');
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
    await expect(client.init('/models/katago-small.bin.gz')).rejects.toThrow(/KataGo worker crashed: gone/);

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

  it('shares a single in-flight init across concurrent callers', async () => {
    installFakeWorker();
    const client = getKataGoEngineClient();
    const worker = createdFakeWorkers[0]!;

    const first = client.init('/models/katago-small.bin.gz');
    const second = client.init('/models/katago-small.bin.gz');
    expect(worker.postMessage).toHaveBeenCalledTimes(1);

    worker.onmessage?.({
      data: { type: 'katago:init_result', ok: true, backend: 'wasm', modelName: 'katago-small' },
    });

    await expect(first).resolves.toBeUndefined();
    await expect(second).resolves.toBeUndefined();

    // Once settled, a fresh init posts a new message instead of resolving instantly.
    const third = client.init('/models/katago-small.bin.gz');
    expect(worker.postMessage).toHaveBeenCalledTimes(2);
    worker.onmessage?.({
      data: { type: 'katago:init_result', ok: true, backend: 'wasm', modelName: 'katago-small' },
    });
    await expect(third).resolves.toBeUndefined();
  });

  it('still reports init failure to every concurrent caller', async () => {
    installFakeWorker();
    const client = getKataGoEngineClient();
    const worker = createdFakeWorkers[0]!;

    const first = client.init('/models/katago-small.bin.gz');
    const second = client.init('/models/katago-small.bin.gz');

    worker.onmessage?.({ data: { type: 'katago:init_result', ok: false, error: 'model missing' } });

    await expect(first).rejects.toThrow('model missing');
    await expect(second).rejects.toThrow('model missing');
  });
});
