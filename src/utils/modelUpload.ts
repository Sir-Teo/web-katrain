export const MAX_BROWSER_MODEL_UPLOAD_BYTES = 128 * 1024 * 1024;
export const MAX_BROWSER_MODEL_UPLOAD_LABEL = '128 MB';

export const MODEL_UPLOAD_ACCEPT = [
  '.bin',
  '.bin.gz',
  '.gz',
  'application/gzip',
  'application/octet-stream',
].join(',');

let uploadedModelUrl: string | null = null;
let lastManualModelUrl: string | null = null;

const DB_NAME = 'web-katrain-models';
const DB_VERSION = 1;
const MODEL_STORE = 'uploaded-models';
const CURRENT_MODEL_KEY = 'current';
const UPLOADED_MODEL_SELECTED_KEY = 'web-katrain:uploaded_model_selected:v1';

type ModelFileLike = {
  name?: string;
  size?: number;
  type?: string;
};

export type PersistedUploadedModel = {
  blob: Blob;
  name: string;
  size: number;
  type: string;
  updatedAt: number;
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

export const validateModelUploadFile = (file: ModelFileLike): string | null => {
  if (!isKataGoModelWeightsFile(file)) {
    return 'Use a KataGo .bin.gz weights file.';
  }
  const size = typeof file.size === 'number' && Number.isFinite(file.size) ? file.size : 0;
  if (size > MAX_BROWSER_MODEL_UPLOAD_BYTES) return modelUploadTooLargeMessage(size);
  return null;
};

export const revokeUploadedModelUrl = (): void => {
  if (!uploadedModelUrl || typeof URL === 'undefined' || typeof URL.revokeObjectURL !== 'function') {
    uploadedModelUrl = null;
    return;
  }
  URL.revokeObjectURL(uploadedModelUrl);
  uploadedModelUrl = null;
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
  if (!isUploadedModelUrl(currentModelUrl)) {
    lastManualModelUrl = currentModelUrl;
  }
  revokeUploadedModelUrl();
  const objectUrl = URL.createObjectURL(blob);
  uploadedModelUrl = objectUrl;
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
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is unavailable'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
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
  if (typeof localStorage === 'undefined') return;
  try {
    if (selected) localStorage.setItem(UPLOADED_MODEL_SELECTED_KEY, 'true');
    else localStorage.removeItem(UPLOADED_MODEL_SELECTED_KEY);
  } catch {
    // Ignore storage errors.
  }
};

const isPersistedUploadedModelSelected = (): boolean => {
  if (typeof localStorage === 'undefined') return false;
  try {
    return localStorage.getItem(UPLOADED_MODEL_SELECTED_KEY) === 'true';
  } catch {
    return false;
  }
};

export const savePersistedUploadedModel = async (file: Blob & ModelFileLike): Promise<boolean> => {
  if (typeof indexedDB === 'undefined') return false;
  const model: PersistedUploadedModel = {
    blob: file,
    name: file.name?.trim() || 'Uploaded weights',
    size: typeof file.size === 'number' && Number.isFinite(file.size) ? file.size : 0,
    type: file.type || 'application/octet-stream',
    updatedAt: Date.now(),
  };

  let db: IDBDatabase | null = null;
  try {
    db = await openUploadedModelDb();
    const tx = db.transaction(MODEL_STORE, 'readwrite');
    tx.objectStore(MODEL_STORE).put(model, CURRENT_MODEL_KEY);
    await transactionDone(tx);
    setUploadedModelSelected(true);
    return true;
  } catch {
    setUploadedModelSelected(false);
    return false;
  } finally {
    db?.close();
  }
};

export const loadPersistedUploadedModel = async (): Promise<PersistedUploadedModel | null> => {
  if (!isPersistedUploadedModelSelected()) return null;
  if (typeof indexedDB === 'undefined') return null;

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
  const model = await loadPersistedUploadedModel();
  if (!model) return null;
  if (!isUploadedModelUrl(currentModelUrl)) {
    lastManualModelUrl = currentModelUrl;
  }
  revokeUploadedModelUrl();
  const url = URL.createObjectURL(model.blob);
  uploadedModelUrl = url;
  return {
    url,
    name: model.name,
    size: model.size,
    type: model.type,
    updatedAt: model.updatedAt,
  };
};

export const deletePersistedUploadedModel = async (): Promise<void> => {
  setUploadedModelSelected(false);
  if (typeof indexedDB === 'undefined') return;

  let db: IDBDatabase | null = null;
  try {
    db = await openUploadedModelDb();
    const tx = db.transaction(MODEL_STORE, 'readwrite');
    tx.objectStore(MODEL_STORE).delete(CURRENT_MODEL_KEY);
    await transactionDone(tx);
  } catch {
    // Ignore unavailable or blocked IndexedDB.
  } finally {
    db?.close();
  }
};

export const resetModelUploadStateForTests = (): void => {
  uploadedModelUrl = null;
  lastManualModelUrl = null;
  setUploadedModelSelected(false);
};
