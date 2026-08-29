import { describe, expect, it } from 'vitest';
import { MODEL_CORS_DOWNLOAD_HINT, describeModelDownloadError } from '../src/utils/modelDownloadError';

describe('model download errors', () => {
  it('explains a CORS block in terms of controls that exist', () => {
    expect(describeModelDownloadError(new TypeError('Failed to fetch'))).toBe(MODEL_CORS_DOWNLOAD_HINT);
    expect(describeModelDownloadError(new TypeError('failed to fetch'))).toBe(MODEL_CORS_DOWNLOAD_HINT);
  });

  /**
   * The dialog has "Copy URL" on every model row and "Upload Weights" above it.
   * It has no "Download" button, which is what the message used to name.
   */
  it('names only buttons the dialog actually has', () => {
    expect(MODEL_CORS_DOWNLOAD_HINT).toContain('Copy URL');
    expect(MODEL_CORS_DOWNLOAD_HINT).toContain('Upload Weights');
    expect(MODEL_CORS_DOWNLOAD_HINT).not.toMatch(/"Download"/);
  });

  it('passes any other failure through unchanged', () => {
    expect(describeModelDownloadError(new Error('Out of storage'))).toBe('Out of storage');
    expect(describeModelDownloadError('Network timed out')).toBe('Network timed out');
  });

  it('says something when there is nothing to say', () => {
    expect(describeModelDownloadError(null)).toBe('Download failed.');
    expect(describeModelDownloadError(undefined)).toBe('Download failed.');
  });
});
