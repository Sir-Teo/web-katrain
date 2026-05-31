export const OBJECT_URL_UNAVAILABLE_MESSAGE = 'Browser object URLs are unavailable in this environment.';

type ObjectUrlApi = {
  createObjectURL: (blob: Blob | MediaSource) => string;
  revokeObjectURL?: (url: string) => void;
};

export const getObjectUrlApi = (): ObjectUrlApi | null => {
  try {
    if (typeof URL === 'undefined') return null;
    const createObjectURL = URL.createObjectURL;
    if (typeof createObjectURL !== 'function') return null;
    const revokeObjectURL = typeof URL.revokeObjectURL === 'function' ? URL.revokeObjectURL : undefined;
    return {
      createObjectURL: createObjectURL.bind(URL),
      revokeObjectURL: revokeObjectURL?.bind(URL),
    };
  } catch {
    return null;
  }
};

export const createObjectUrl = (blob: Blob | MediaSource): string | null => {
  const api = getObjectUrlApi();
  if (!api) return null;
  try {
    return api.createObjectURL(blob);
  } catch {
    return null;
  }
};

export const createObjectUrlOrThrow = (blob: Blob | MediaSource): string => {
  const url = createObjectUrl(blob);
  if (!url) throw new Error(OBJECT_URL_UNAVAILABLE_MESSAGE);
  return url;
};

export const revokeObjectUrl = (url: string | null | undefined): void => {
  if (!url) return;
  const api = getObjectUrlApi();
  if (!api?.revokeObjectURL) return;
  try {
    api.revokeObjectURL(url);
  } catch {
    // Revocation is best effort; callers should not fail on cleanup.
  }
};

export const downloadBlob = (blob: Blob, filename: string): boolean => {
  const url = createObjectUrl(blob);
  if (!url) return false;
  let link: HTMLAnchorElement | null = null;

  try {
    if (typeof document === 'undefined') return false;
    link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body?.appendChild(link);
    link.click();
    return true;
  } catch {
    return false;
  } finally {
    link?.parentNode?.removeChild(link);
    revokeObjectUrl(url);
  }
};
