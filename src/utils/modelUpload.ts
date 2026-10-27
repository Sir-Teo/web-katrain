import { getIndexedDB, readLocalStorage, removeLocalStorage, writeLocalStorage } from './storage';
import { stripUnsafeFilenameControls } from './filename';
import { createObjectUrlOrThrow, revokeObjectUrl } from './objectUrl';
import { createCrossContextTaskQueue } from './crossContextTaskQueue';

export const MAX_BROWSER_MODEL_UPLOAD_BYTES = 128 * 1024 * 1024;
export const MAX_BROWSER_MODEL_UPLOAD_LABEL = '128 MB';

export const MODEL_UPLOAD_ACCEPT = [
  '.bin',
  '.bin.gz',
  '.gz',
  'application/gzip',
  'application/octet-stream',
].join(',');

const DB_NAME = 'web-katrain-models';
const DB_VERSION = 1;
const MODEL_STORE = 'uploaded-models';
const CURRENT_MODEL_KEY = 'current';
const UPLOADED_MODEL_SELECTED_KEY = 'web-katrain:uploaded_model_selected:v1';
const runModelStorageTask = createCrossContextTaskQueue(DB_NAME);
let modelStorageRevision = 0;

type ModelFileLike = {
  name?: string;
  size?: number;
  type?: string;
};

type ModelFileInfo = {
  name: string;
  size: number;
  type: string;
  updatedAt: number;
};

export type UploadedModelInfo = ModelFileInfo & {
  persistence: 'saving' | 'saved' | 'session';
};

export type PersistedUploadedModel = ModelFileInfo & { blob: Blob };

let uploadedModelUrl: string | null = null;
let uploadedModelInfo: UploadedModelInfo | null = null;
let lastManualModelUrl: string | null = null;
const modelInfoListeners = new Set<() => void>();

const updateUploadedModelInfo = (info: UploadedModelInfo | null): void => {
  if (uploadedModelInfo === info) return;
  uploadedModelInfo = info;
  for (const listener of modelInfoListeners) listener();
};

export const subscribeUploadedModelInfo = (listener: () => void): (() => void) => {
  modelInfoListeners.add(listener);
  return () => { modelInfoListeners.delete(listener); };
};

export const sanitizeModelDisplayName = (
  name: string | null | undefined,
  fallback = 'Uploaded weights'
): string => {
  const cleaned = stripUnsafeFilenameControls(name ?? '').replace(/\s+/g, ' ').trim();
  return cleaned || fallback;
};

export const getModelFileNameFromUrl = (url: string, fallback = 'downloaded-model.bin.gz'): string => {
  const decode = (value: string): string => {
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  };

  try {
    const parsed = new URL(url, 'https://web-katrain.invalid');
    const rawName = parsed.pathname.split('/').filter(Boolean).pop();
    return sanitizeModelDisplayName(rawName ? decode(rawName) : '', fallback);
  } catch {
    const cleanUrl = url.split('#')[0]?.split('?')[0] ?? url;
    const rawName = cleanUrl.split('/').pop() ?? '';
    return sanitizeModelDisplayName(decode(rawName), fallback);
  }
};

export type RestoredUploadedModel = {
  url: string;
  name: string;
  size: number;
  type: string;
  updatedAt: number;
};

export const isUploadedModelUrl = (url: string): boolean => url.startsWith('blob:');

export const isKataGoModelWeightsFile = (file: ModelFileLike): boolean => {
  const name = (file.name ?? '').toLowerCase();
  return name.endsWith('.bin') || name.endsWith('.bin.gz') || name.endsWith('.gz');
};

export const modelUploadTooLargeMessage = (size: number): string =>
  `This model is too large for the browser engine (${(size / (1024 * 1024)).toFixed(0)} MB). ` +
  `Use the Strong b18 browser weights or another compressed model under ${MAX_BROWSER_MODEL_UPLOAD_LABEL}.`;

export const formatUploadedModelSize = (size: number): string => {
  if (!Number.isFinite(size) || size <= 0) return 'Unknown size';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) {
    const kb = size / 1024;
    return `${kb >= 10 ? kb.toFixed(0) : kb.toFixed(1)} KB`;
  }
  const mb = size / (1024 * 1024);
  return `${mb >= 10 ? mb.toFixed(0) : mb.toFixed(1)} MB`;
};

const modelInfoFromBlob = (file: Blob & ModelFileLike): ModelFileInfo => ({
  name: sanitizeModelDisplayName(file.name),
  size: typeof file.size === 'number' && Number.isFinite(file.size) ? file.size : 0,
  type: file.type || 'application/octet-stream',
  updatedAt: Date.now(),
});

export const getUploadedModelInfo = (): UploadedModelInfo | null => uploadedModelInfo;

export const validateModelUploadFile = (file: ModelFileLike): string | null => {
  if (!isKataGoModelWeightsFile(file)) {
    return 'Use a KataGo .bin.gz weights file.';
  }
  const size = typeof file.size === 'number' && Number.isFinite(file.size) ? file.size : 0;
  if (size > MAX_BROWSER_MODEL_UPLOAD_BYTES) return modelUploadTooLargeMessage(size);
  return null;
};

export const revokeUploadedModelUrl = (): void => {
  modelStorageRevision++;
  revokeObjectUrl(uploadedModelUrl);
  uploadedModelUrl = null;
  updateUploadedModelInfo(null);
};

export const syncUploadedModelUrl = (currentModelUrl: string): void => {
  if (!isUploadedModelUrl(currentModelUrl)) {
    lastManualModelUrl = currentModelUrl;
  }
  if (uploadedModelUrl && currentModelUrl !== uploadedModelUrl) {
    revokeUploadedModelUrl();
    void deletePersistedUploadedModel();
  }
};

export const createUploadedModelUrl = (blob: Blob, currentModelUrl: string): string => {
  // Keep the selected weights usable if allocating their replacement fails.
  const objectUrl = createObjectUrlOrThrow(blob);
  if (!isUploadedModelUrl(currentModelUrl)) {
    lastManualModelUrl = currentModelUrl;
  }
  revokeUploadedModelUrl();
  uploadedModelUrl = objectUrl;
  updateUploadedModelInfo({ ...modelInfoFromBlob(blob), persistence: 'session' });
  setUploadedModelSelected(false);
  return objectUrl;
};

export const clearUploadedModelUrl = (fallbackModelUrl: string): string => {
  revokeUploadedModelUrl();
  void deletePersistedUploadedModel();
  return lastManualModelUrl ?? fallbackModelUrl;
};

const requestToPromise = <T>(request: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });

const transactionDone = (tx: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
  });

const openUploadedModelDb = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const indexedDb = getIndexedDB();
    if (!indexedDb) {
      reject(new Error('IndexedDB is unavailable'));
      return;
    }
    const request = indexedDb.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(MODEL_STORE)) {
        db.createObjectStore(MODEL_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Failed to open IndexedDB'));
  });

const setUploadedModelSelected = (selected: boolean): void => {
  if (selected) writeLocalStorage(UPLOADED_MODEL_SELECTED_KEY, 'true');
  else removeLocalStorage(UPLOADED_MODEL_SELECTED_KEY);
};

const isPersistedUploadedModelSelected = (): boolean => {
  return readLocalStorage(UPLOADED_MODEL_SELECTED_KEY) === 'true';
};

export const savePersistedUploadedModel = async (file: Blob & ModelFileLike): Promise<boolean> => {
  const revision = ++modelStorageRevision;
  // Until these exact weights finish saving, reload must not restore an older
  // file left in the shared slot. A newer selection can invalidate this task.
  setUploadedModelSelected(false);
  const info = modelInfoFromBlob(file);
  updateUploadedModelInfo({ ...info, persistence: 'saving' });
  const model: PersistedUploadedModel = {
    blob: file,
    ...info,
  };

  return runModelStorageTask(async () => {
    let db: IDBDatabase | null = null;
    try {
      if (revision !== modelStorageRevision) return false;
      if (!getIndexedDB()) {
        updateUploadedModelInfo({ ...info, persistence: 'session' });
        return false;
      }
      db = await openUploadedModelDb();
      if (revision !== modelStorageRevision) return false;
      const tx = db.transaction(MODEL_STORE, 'readwrite');
      tx.objectStore(MODEL_STORE).put(model, CURRENT_MODEL_KEY);
      await transactionDone(tx);
      if (revision !== modelStorageRevision) return false;
      setUploadedModelSelected(true);
      updateUploadedModelInfo({ ...info, persistence: 'saved' });
      return true;
    } catch {
      if (revision === modelStorageRevision) {
        setUploadedModelSelected(false);
        updateUploadedModelInfo({ ...info, persistence: 'session' });
      }
      return false;
    } finally {
      db?.close();
    }
  });
};

export const loadPersistedUploadedModel = async (): Promise<PersistedUploadedModel | null> => {
  if (!isPersistedUploadedModelSelected()) return null;
  if (!getIndexedDB()) return null;

  let db: IDBDatabase | null = null;
  try {
    db = await openUploadedModelDb();
    const tx = db.transaction(MODEL_STORE, 'readonly');
    const model = await requestToPromise<PersistedUploadedModel | undefined>(
      tx.objectStore(MODEL_STORE).get(CURRENT_MODEL_KEY)
    );
    if (!model?.blob) {
      setUploadedModelSelected(false);
      return null;
    }
    return model;
  } catch {
    return null;
  } finally {
    db?.close();
  }
};

export const restorePersistedUploadedModelUrl = async (currentModelUrl: string): Promise<RestoredUploadedModel | null> => {
  const revision = modelStorageRevision;
  const model = await loadPersistedUploadedModel();
  if (!model || revision !== modelStorageRevision) return null;
  let url: string;
  try {
    url = createObjectUrlOrThrow(model.blob);
  } catch {
    return null;
  }
  if (!isUploadedModelUrl(currentModelUrl)) {
    lastManualModelUrl = currentModelUrl;
  }
  revokeUploadedModelUrl();
  uploadedModelUrl = url;
  updateUploadedModelInfo({
    name: model.name,
    size: model.size,
    type: model.type,
    updatedAt: model.updatedAt,
    persistence: 'saved',
  });
  return {
    url,
    name: model.name,
    size: model.size,
    type: model.type,
    updatedAt: model.updatedAt,
  };
};

export const deletePersistedUploadedModel = async (): Promise<void> => {
  const revision = ++modelStorageRevision;
  setUploadedModelSelected(false);
  updateUploadedModelInfo(null);
  return runModelStorageTask(async () => {
    let db: IDBDatabase | null = null;
    try {
      if (revision !== modelStorageRevision || !getIndexedDB()) return;
      db = await openUploadedModelDb();
      if (revision !== modelStorageRevision) return;
      const tx = db.transaction(MODEL_STORE, 'readwrite');
      tx.objectStore(MODEL_STORE).delete(CURRENT_MODEL_KEY);
      await transactionDone(tx);
    } catch {
      // Ignore unavailable or blocked IndexedDB.
    } finally {
      db?.close();
    }
  });
};

export const resetModelUploadStateForTests = (): void => {
  modelStorageRevision++;
  uploadedModelUrl = null;
  updateUploadedModelInfo(null);
  lastManualModelUrl = null;
  setUploadedModelSelected(false);
};
