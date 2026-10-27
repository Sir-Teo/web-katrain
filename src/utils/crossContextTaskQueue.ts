import { createSerialTaskQueue } from './serialTaskQueue';

type TaskLocks = Pick<LockManager, 'request'>;

const browserLocks = (): TaskLocks | null => {
  if (typeof window === 'undefined') return null;
  return window.navigator?.locks ?? null;
};

/** Keep local request order and hold a shared browser lock for each whole task. */
export const createCrossContextTaskQueue = (
  name: string,
  getLocks: () => TaskLocks | null = browserLocks,
) => {
  const runLocal = createSerialTaskQueue();
  return <T>(task: () => T | Promise<T>): Promise<T> => runLocal(async () => {
    let locks: TaskLocks | null;
    try { locks = getLocks(); } catch { locks = null; }
    if (!locks?.request) return task();
    let started = false;
    try {
      return await locks.request(name, () => {
        started = true;
        return task();
      });
    } catch (error) {
      // Unsupported/blocked Web Locks retain local queue behavior. A task
      // failure must propagate without repeating its writes.
      if (started) throw error;
      return task();
    }
  });
};
