import { describe, expect, it, vi } from 'vitest';
import { createCrossContextTaskQueue } from '../src/utils/crossContextTaskQueue';
import { createSerialTaskQueue } from '../src/utils/serialTaskQueue';

const sharedLocks = () => {
  const run = createSerialTaskQueue();
  return { request: vi.fn((_name: string, callback: () => unknown) => run(callback)) } as unknown as LockManager;
};

describe('cross-context task ordering', () => {
  it('keeps another context out until the complete read/write operation finishes', async () => {
    const locks = sharedLocks();
    const a = createCrossContextTaskQueue('library', () => locks);
    const b = createCrossContextTaskQueue('library', () => locks);
    let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    const events: string[] = [];
    const first = a(async () => { events.push('A read'); await held; events.push('A write'); return 1; });
    const otherContext = b(() => { events.push('B read/write'); return 2; });
    const nextLocal = a(() => { events.push('A next'); return 3; });
    await vi.waitFor(() => expect(events).toEqual(['A read']));
    release();
    expect(await Promise.all([first, otherContext, nextLocal])).toEqual([1, 2, 3]);
    expect(events).toEqual(['A read', 'A write', 'B read/write', 'A next']);
  });

  it('does not repeat a failed task, and releases both queues for later work', async () => {
    const locks = sharedLocks();
    const a = createCrossContextTaskQueue('library', () => locks);
    const b = createCrossContextTaskQueue('library', () => locks);
    const error = new Error('Storage rejected the write');
    const write = vi.fn(() => { throw error; });
    await expect(a(write)).rejects.toBe(error);
    expect(write).toHaveBeenCalledOnce();
    await expect(b(() => 'next tab')).resolves.toBe('next tab');
    await expect(a(() => 'same tab')).resolves.toBe('same tab');
  });

  it.each(['missing', 'getter denied', 'request denied'] as const)('retains local ordering when Web Locks are %s', async mode => {
    const getLocks = () => {
      if (mode === 'getter denied') throw new DOMException('Blocked', 'SecurityError');
      if (mode === 'missing') return null;
      return { request: () => Promise.reject(new DOMException('Blocked', 'SecurityError')) } as unknown as LockManager;
    };
    const run = createCrossContextTaskQueue('library', getLocks);
    const events: number[] = [];
    let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    const first = run(async () => { events.push(1); await held; events.push(2); });
    const next = run(() => { events.push(3); });
    await vi.waitFor(() => expect(events).toEqual([1]));
    release();await Promise.all([first, next]);
    expect(events).toEqual([1, 2, 3]);
  });
});
