export const MAX_SGF_IMPORT_BYTES = 5 * 1024 * 1024;
export const MAX_SGF_IMPORT_LABEL = '5 MB';

const TOO_LARGE_MESSAGE = `SGF files are limited to ${MAX_SGF_IMPORT_LABEL}.`;

/**
 * Counts UTF-8 bytes without allocating a second, encoded copy of the input.
 * The counter stops as soon as the configured ceiling is crossed, which keeps
 * a hostile paste from turning one oversized string into two oversized buffers.
 */
function exceedsUtf8ByteLimit(value: string, limit: number): boolean {
  let bytes = 0;
  for (let index = 0; index < value.length; index++) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit <= 0x7f) bytes += 1;
    else if (codeUnit <= 0x7ff) bytes += 2;
    else if (codeUnit >= 0xd800 && codeUnit <= 0xdbff && index + 1 < value.length) {
      const next = value.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4;
        index += 1;
      } else {
        bytes += 3;
      }
    } else {
      bytes += 3;
    }
    if (bytes > limit) return true;
  }
  return false;
}

/** Accepts a File.size for a zero-allocation preflight or the text itself. */
export function getSgfImportSizeError(input: number | string): string | null {
  const tooLarge = typeof input === 'number'
    ? Number.isFinite(input) && input > MAX_SGF_IMPORT_BYTES
    : input.length > MAX_SGF_IMPORT_BYTES || exceedsUtf8ByteLimit(input, MAX_SGF_IMPORT_BYTES);
  return tooLarge ? TOO_LARGE_MESSAGE : null;
}

export function assertSgfImportSize(input: number | string): void {
  const error = getSgfImportSizeError(input);
  if (error) throw new Error(error);
}
