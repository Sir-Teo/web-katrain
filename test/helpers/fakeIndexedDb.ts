// Minimal fake IndexedDB sufficient for src/utils/library.ts
export type FakeIdbCounts = {
  getAll: number;
  get: number;
  put: number;
  delete: number;
  clear: number;
  commits: number;
  aborts: number;
};

export type FakeIdb = {
  factory: unknown;
  stores: Map<string, Map<string, unknown>>;
  failWrites: boolean;
  failReads: boolean;
  /** Operations requested so far, for tests that care how much was rewritten. */
  counts: FakeIdbCounts;
};

const emptyCounts = (): FakeIdbCounts => ({ getAll: 0, get: 0, put: 0, delete: 0, clear: 0, commits: 0, aborts: 0 });

export const createFakeIdb = (): FakeIdb => {
  const state: FakeIdb = { factory: null, stores: new Map(), failWrites: false, failReads: false, counts: emptyCounts() };
  const later = (fn: () => void) => setTimeout(fn, 0);
  // Every transaction here spans the same stores, so like a real database the
  // fake runs them one at a time: a read-modify-write cannot interleave with
  // another tab's. Writes land together when the transaction commits, after
  // its last request, as a real one auto-commits.
  let queue: Promise<void> = Promise.resolve();
  const makeDb = () => ({
    objectStoreNames: { contains: (n: string) => state.stores.has(n) },
    createObjectStore: (n: string) => {
      state.stores.set(n, new Map());
      return { createIndex: () => undefined };
    },
    close: () => undefined,
    transaction: (names: string | string[], mode: string) => {
      const ops: Array<() => void> = [];
      const tx: Record<string, unknown> = { error: null };
      let pending = 0;
      let finished = false;
      let aborted = false;
      let release: () => void = () => undefined;
      const previous = queue;
      queue = new Promise<void>((resolve) => { release = resolve; });
      const started = previous.then(() => new Promise<void>((resolve) => later(resolve)));
      const finish = () => {
        if (finished) return;
        finished = true;
        if (aborted || (mode === 'readwrite' && state.failWrites)) {
          if (!aborted) tx.error = new Error('QuotaExceededError');
          state.counts.aborts++;
          (tx.onabort as () => void)?.();
        } else {
          for (const op of ops) op();
          state.counts.commits++;
          (tx.oncomplete as () => void)?.();
        }
        release();
      };
      const settleLater = () => later(() => { if (pending === 0) finish(); });
      void started.then(settleLater);
      const objectStore = (n: string) => {
        const req = (fn: () => unknown) => {
          const r: Record<string, unknown> = {};
          pending++;
          void started.then(() => later(() => {
            pending--;
            if (finished || aborted) { settleLater(); return; }
            if (state.failReads) {
              r.error = new Error('read failed');
              (r.onerror as () => void)?.();
            } else {
              r.result = fn();
              (r.onsuccess as () => void)?.();
            }
            settleLater();
          }));
          return r;
        };
        const store = () => state.stores.get(n)!;
        return {
          getAll: () => {
            state.counts.getAll++;
            return req(() => [...store().values()].map((v) => structuredClone(v)));
          },
          get: (key: string) => {
            state.counts.get++;
            return req(() => {
              const value = store().get(key);
              return value === undefined ? undefined : structuredClone(value);
            });
          },
          clear: () => {
            state.counts.clear++;
            ops.push(() => store().clear());
          },
          put: (v: { id?: string; key?: string }) => {
            state.counts.put++;
            const c = structuredClone(v);
            ops.push(() => store().set((c.id ?? c.key)!, c));
          },
          delete: (key: string) => {
            state.counts.delete++;
            ops.push(() => store().delete(key));
          },
        };
      };
      tx.objectStore = objectStore;
      tx.abort = () => {
        if (finished) return;
        aborted = true;
        tx.error = new Error('AbortError');
        later(finish);
      };
      void names;
      return tx;
    },
  });
  state.factory = {
    open: () => {
      const r: Record<string, unknown> = {};
      later(() => {
        const db = makeDb();
        r.result = db;
        if (!state.stores.has('items')) (r.onupgradeneeded as () => void)?.();
        (r.onsuccess as () => void)?.();
      });
      return r;
    },
  };
  return state;
};

/** Resets the operation counters, so a test can measure one step on its own. */
export const resetFakeIdbCounts = (idb: FakeIdb): void => {
  idb.counts = emptyCounts();
};

export const mapStorage = () => {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, String(v)),
    removeItem: (k: string) => void map.delete(k),
  };
};

/**
 * The Web Locks API as two tabs of one browser share it: each request waits
 * for the previous holder of the same name to finish.
 */
export const createFakeLocks = () => {
  const tails = new Map<string, Promise<unknown>>();
  let granted = 0;
  return {
    get granted() { return granted; },
    request: <T>(name: string, optionsOrCallback: unknown, maybeCallback?: (lock: unknown) => Promise<T>) => {
      const callback = (typeof optionsOrCallback === 'function' ? optionsOrCallback : maybeCallback) as (lock: unknown) => Promise<T>;
      const previous = tails.get(name) ?? Promise.resolve();
      const run = previous.then(() => {
        granted++;
        return callback({ name, mode: 'exclusive' });
      });
      tails.set(name, run.catch(() => undefined));
      return run;
    },
  };
};
