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

type ModelFileLike = {
  name?: string;
  size?: number;
  type?: string;
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
  return lastManualModelUrl ?? fallbackModelUrl;
};

export const resetModelUploadStateForTests = (): void => {
  uploadedModelUrl = null;
  lastManualModelUrl = null;
};
