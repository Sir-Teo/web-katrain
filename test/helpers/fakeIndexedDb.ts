// Minimal fake IndexedDB sufficient for src/utils/library.ts
export type FakeIdb = {
  factory: unknown;
  stores: Map<string, Map<string, unknown>>;
  failWrites: boolean;
  failReads: boolean;
};

export const createFakeIdb = (): FakeIdb => {
  const state: FakeIdb = { factory: null, stores: new Map(), failWrites: false, failReads: false };
  const later = (fn: () => void) => setTimeout(fn, 0);
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
      const objectStore = (n: string) => {
        const req = (fn: () => unknown) => {
          const r: Record<string, unknown> = {};
          later(() => {
            if (state.failReads) { r.error = new Error('read failed'); (r.onerror as () => void)?.(); return; }
            r.result = fn(); (r.onsuccess as () => void)?.();
          });
          return r;
        };
        return {
          getAll: () => req(() => [...state.stores.get(n)!.values()].map((v) => structuredClone(v))),
          clear: () => { ops.push(() => state.stores.get(n)!.clear()); },
          put: (v: { id?: string; key?: string }) => { const c = structuredClone(v); ops.push(() => state.stores.get(n)!.set((c.id ?? c.key)!, c)); },
        };
      };
      tx.objectStore = objectStore;
      later(() => later(() => {
        if (mode === 'readwrite' && state.failWrites) {
          tx.error = new Error('QuotaExceededError');
          (tx.onabort as () => void)?.();
          return;
        }
        for (const op of ops) op();
        (tx.oncomplete as () => void)?.();
      }));
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

export const mapStorage = () => {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, String(v)),
    removeItem: (k: string) => void map.delete(k),
  };
};
