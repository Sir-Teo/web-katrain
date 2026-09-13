import { describe, expect, it } from 'vitest';
import { createSerialTaskQueue } from '../src/utils/serialTaskQueue';

describe('serial asynchronous tasks', () => {
  it('holds the next read until the entire previous read/write finishes', async () => {
    const run = createSerialTaskQueue();
    let releaseRead!: () => void;
    let releaseWrite!: () => void;
    const read = new Promise<void>(resolve => { releaseRead = resolve; });
    const write = new Promise<void>(resolve => { releaseWrite = resolve; });
    const events: string[] = [];
    const first = run(async () => {
      events.push('first read');
      await read;
      events.push('first write');
      await write;
      return 1;
    });
    const second = run(() => { events.push('second read'); return 2; });
    await Promise.resolve();
    expect(events).toEqual(['first read']);
    releaseRead();
    await Promise.resolve();
    expect(events).toEqual(['first read', 'first write']);
    releaseWrite();
    expect(await Promise.all([first, second])).toEqual([1, 2]);
    expect(events).toEqual(['first read', 'first write', 'second read']);
  });

  it('reports rejected and throwing tasks without stranding later work', async () => {
    const run = createSerialTaskQueue();
    const rejected = run(() => Promise.reject(new Error('write rejected')));
    const thrown = run(() => { throw new Error('read failed'); });
    const recovered = run(() => 'saved');
    await expect(rejected).rejects.toThrow('write rejected');
    await expect(thrown).rejects.toThrow('read failed');
    await expect(recovered).resolves.toBe('saved');
  });
});
