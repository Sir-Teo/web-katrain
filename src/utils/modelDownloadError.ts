/**
 * What to tell a reader when downloading model weights into the browser fails.
 *
 * The recommended b18 network is hosted on media.katagotraining.org, which
 * sends no `Access-Control-Allow-Origin` on any request — checked with a
 * cross-origin GET carrying an Origin header, and from this app in a browser,
 * where it comes back `TypeError: Failed to fetch`. So "Download & Load" cannot
 * succeed for it today, and the app is right to catch that and explain.
 *
 * What it explained was wrong, though: the message said to use "Download" and
 * then "Upload Weights", and there is no Download control in this dialog. Every
 * model row offers "Copy URL". A recovery instruction naming a button that is
 * not on screen sends the reader looking for something that does not exist.
 *
 * The attempt is still worth making rather than hiding the button: if the host
 * ever sends CORS headers, it starts working with no change here.
 */
export const MODEL_CORS_DOWNLOAD_HINT =
  'Download blocked by the browser (CORS). Use "Copy URL" to fetch it yourself, then "Upload Weights".';

export function describeModelDownloadError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? 'Download failed.');
  return message.toLowerCase().includes('failed to fetch') ? MODEL_CORS_DOWNLOAD_HINT : message;
}
