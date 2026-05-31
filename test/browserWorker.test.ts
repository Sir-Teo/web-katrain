import { afterEach, describe, expect, it } from 'vitest';
import { getWorkerConstructor } from '../src/utils/browserWorker';

const originalWorker = Object.getOwnPropertyDescriptor(globalThis, 'Worker');

function restoreWorker() {
  if (originalWorker) {
    Object.defineProperty(globalThis, 'Worker', originalWorker);
  } else {
    Reflect.deleteProperty(globalThis, 'Worker');
  }
}

describe('browser worker helpers', () => {
  afterEach(() => {
    restoreWorker();
  });

  it('returns the Worker constructor when available', () => {
    class FakeWorker {}
    Object.defineProperty(globalThis, 'Worker', {
      configurable: true,
      value: FakeWorker,
    });

    expect(getWorkerConstructor()).toBe(FakeWorker);
  });

  it('treats missing or blocked Worker access as unavailable', () => {
    Reflect.deleteProperty(globalThis, 'Worker');
    expect(getWorkerConstructor()).toBeNull();

    Object.defineProperty(globalThis, 'Worker', {
      configurable: true,
      get() {
        throw new Error('worker blocked');
      },
    });
    expect(getWorkerConstructor()).toBeNull();
  });
});
