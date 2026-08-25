/**
 * A single-page host answers an unknown path with index.html and a 200, so a
 * mistyped model URL arrives as markup rather than as a fetch failure. Without
 * this check the HTML reaches the weight parser and surfaces as something like
 * "Invalid int token: html>", which says nothing about what to fix.
 */
export function looksLikeMarkup(data: Uint8Array): boolean {
  const SKIPPABLE = new Set([
    0x20, 0x09, 0x0a, 0x0d, // leading whitespace
    0xef, 0xbb, 0xbf, // UTF-8 BOM
  ]);
  for (let i = 0; i < Math.min(data.length, 64); i += 1) {
    const byte = data[i]!;
    if (SKIPPABLE.has(byte)) continue;
    return byte === 0x3c; // '<'
  }
  return false;
}

export function modelResponseError(modelUrl: string): Error {
  return new Error(
    `The model URL returned a web page, not a model file: ${modelUrl}. `
      + 'Check the model path in Settings, or pick one of the official downloads.'
  );
}
