import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeIdb, mapStorage } from './helpers/fakeIndexedDb';

const selectedKey = 'web-katrain:uploaded_model_selected:v1';
let idb: ReturnType<typeof createFakeIdb>;
let storage: ReturnType<typeof mapStorage>;

beforeEach(() => {
  vi.resetModules();
  idb = createFakeIdb();
  storage = mapStorage();
  vi.stubGlobal('indexedDB', idb.factory);
  vi.stubGlobal('localStorage', storage);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function holdNextOpen() {
  const held: Array<() => void> = [];
  const factory = idb.factory as IDBFactory;
  const open = factory.open.bind(factory);
  vi.spyOn(factory, 'open').mockImplementationOnce((...args) => {
    const request = open(...args);
    let success: ((this: IDBOpenDBRequest, event: Event) => unknown) | null = null;
    Object.defineProperty(request, 'onsuccess', {
      set(fn: typeof success) { success = fn; },
      get() { return () => held.push(() => success?.call(request, new Event('success'))); },
    });
    return request;
  });
  return held;
}

const weights = (name: string) => new File([`weights ${name}`], `${name}.bin.gz`);

describe('model storage ordering', () => {
  it('keeps newer weights and metadata when an earlier save finishes late', async () => {
    const model = await import('../src/utils/modelUpload');
    const held = holdNextOpen();
    const a = weights('A');
    const aUrl = model.createUploadedModelUrl(a, '/models/manual.bin.gz');
    const aSave = model.savePersistedUploadedModel(a);
    await vi.waitFor(() => expect(held).toHaveLength(1));
    const b = weights('B');
    const bUrl = model.createUploadedModelUrl(b, aUrl);
    const bSave = model.savePersistedUploadedModel(b);
    expect(storage.getItem(selectedKey)).toBeNull();
    expect(model.getUploadedModelInfo()?.persistence).toBe('saving');
    held.splice(0).forEach(release => release());
    expect(await aSave).toBe(false);
    expect(await bSave).toBe(true);
    expect(await (await model.loadPersistedUploadedModel())?.blob.text()).toBe('weights B');
    expect(model.getUploadedModelInfo()?.name).toBe('B.bin.gz');
    expect(model.getUploadedModelInfo()?.persistence).toBe('saved');
    expect(await (await fetch(bUrl)).text()).toBe('weights B');
    model.clearUploadedModelUrl('/models/manual.bin.gz');
    await model.deletePersistedUploadedModel();
  });

  it('does not resurrect a cleared upload when a pending save completes', async () => {
    const model = await import('../src/utils/modelUpload');
    const held = holdNextOpen();
    const a = weights('A');
    model.createUploadedModelUrl(a, '/models/manual.bin.gz');
    const pending = model.savePersistedUploadedModel(a);
    await vi.waitFor(() => expect(held).toHaveLength(1));
    expect(model.clearUploadedModelUrl('/models/fallback.bin.gz')).toBe('/models/manual.bin.gz');
    held.splice(0).forEach(release => release());
    expect(await pending).toBe(false);
    await vi.waitFor(() => expect(idb.stores.get('uploaded-models')?.size).toBe(0));
    expect(storage.getItem(selectedKey)).toBeNull();
    expect(model.getUploadedModelInfo()).toBeNull();
    expect(await model.restorePersistedUploadedModelUrl('/models/manual.bin.gz')).toBeNull();
  });

  it('saves a new upload after a queued deletion without deleting the new file', async () => {
    const model = await import('../src/utils/modelUpload');
    const a = weights('A');
    model.createUploadedModelUrl(a, '/models/manual.bin.gz');
    expect(await model.savePersistedUploadedModel(a)).toBe(true);
    const held = holdNextOpen();
    const deletion = model.deletePersistedUploadedModel();
    await vi.waitFor(() => expect(held).toHaveLength(1));
    const b = weights('B');
    model.createUploadedModelUrl(b, '/models/manual.bin.gz');
    const saving = model.savePersistedUploadedModel(b);
    held.splice(0).forEach(release => release());
    await deletion;
    expect(await saving).toBe(true);
    expect(await (await model.loadPersistedUploadedModel())?.blob.text()).toBe('weights B');
    expect(storage.getItem(selectedKey)).toBe('true');
    model.clearUploadedModelUrl('/models/manual.bin.gz');
    await model.deletePersistedUploadedModel();
  });

  it('discards an old restore after the player selects new weights', async () => {
    const model = await import('../src/utils/modelUpload');
    const a = weights('A');
    const aUrl = model.createUploadedModelUrl(a, '/models/manual.bin.gz');
    await model.savePersistedUploadedModel(a);
    const held = holdNextOpen();
    const restoring = model.restorePersistedUploadedModelUrl(aUrl);
    await vi.waitFor(() => expect(held).toHaveLength(1));
    const b = weights('B');
    const bUrl = model.createUploadedModelUrl(b, aUrl);
    await model.savePersistedUploadedModel(b);
    held.splice(0).forEach(release => release());
    expect(await restoring).toBeNull();
    expect(await (await fetch(bUrl)).text()).toBe('weights B');
    expect(model.getUploadedModelInfo()?.name).toBe('B.bin.gz');
    model.clearUploadedModelUrl('/models/manual.bin.gz');
    await model.deletePersistedUploadedModel();
  });

  it('retries after a failed write without restoring older weights', async () => {
    const model = await import('../src/utils/modelUpload');
    const a = weights('A');
    model.createUploadedModelUrl(a, '/models/manual.bin.gz');
    idb.failWrites = true;
    expect(await model.savePersistedUploadedModel(a)).toBe(false);
    expect(model.getUploadedModelInfo()?.persistence).toBe('session');
    expect(storage.getItem(selectedKey)).toBeNull();
    expect(await model.loadPersistedUploadedModel()).toBeNull();
    idb.failWrites = false;
    expect(await model.savePersistedUploadedModel(a)).toBe(true);
    expect(await (await model.loadPersistedUploadedModel())?.blob.text()).toBe('weights A');
    model.clearUploadedModelUrl('/models/manual.bin.gz');
    await model.deletePersistedUploadedModel();
  });

  it('notifies status subscribers when a save finishes outside the Settings component', async () => {
    const model = await import('../src/utils/modelUpload');
    const states: Array<string | null> = [];
    const unsubscribe = model.subscribeUploadedModelInfo(() => states.push(model.getUploadedModelInfo()?.persistence ?? null));
    const file = weights('A');
    model.createUploadedModelUrl(file, '/models/manual.bin.gz');
    await model.savePersistedUploadedModel(file);
    expect(states).toEqual(['session', 'saving', 'saved']);
    expect(model.getUploadedModelInfo()).toBe(model.getUploadedModelInfo());
    unsubscribe();
    model.clearUploadedModelUrl('/models/manual.bin.gz');
    await model.deletePersistedUploadedModel();
    expect(states).toEqual(['session', 'saving', 'saved']);
  });
});
