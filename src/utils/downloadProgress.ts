export type DownloadProgressUpdate = {
  receivedBytes: number;
  totalBytes: number | null;
  percent: number | null;
};

export type DownloadProgressHandler = (update: DownloadProgressUpdate) => void;

const getContentLength = (headers: Headers): number | null => {
  const raw = headers.get('content-length');
  if (!raw) return null;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const getProgressPercent = (receivedBytes: number, totalBytes: number | null): number | null => {
  if (!totalBytes) return null;
  return Math.min(100, Math.max(0, Math.round((receivedBytes / totalBytes) * 100)));
};

export async function responseBlobWithProgress(
  response: Response,
  onProgress?: DownloadProgressHandler
): Promise<Blob> {
  const totalBytes = getContentLength(response.headers);
  const type = response.headers.get('content-type') ?? '';

  if (!response.body) {
    const blob = await response.blob();
    onProgress?.({
      receivedBytes: blob.size,
      totalBytes,
      percent: getProgressPercent(blob.size, totalBytes),
    });
    return blob;
  }

  const reader = response.body.getReader();
  const chunks: BlobPart[] = [];
  let receivedBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    receivedBytes += value.byteLength;
    onProgress?.({
      receivedBytes,
      totalBytes,
      percent: getProgressPercent(receivedBytes, totalBytes),
    });
  }

  return new Blob(chunks, { type });
}

export async function fetchBlobWithProgress(
  url: string,
  onProgress?: DownloadProgressHandler,
  signal?: AbortSignal
): Promise<Blob> {
  signal?.throwIfAborted();
  const response = await fetch(url, { signal });
  signal?.throwIfAborted();
  if (!response.ok) {
    throw new Error(`Download failed (${response.status})`);
  }
  const blob = await responseBlobWithProgress(response, onProgress);
  signal?.throwIfAborted();
  return blob;
}
