import { assertSgfImportSize } from './sgfImportLimits';

type CharsetProperty = { value: string; start: number; end: number };

// Read the first game's actual root property, never a CA-looking fragment in
// a comment, label, or variation. Offsets let us change only the declaration.
function rootCharset(text: string): CharsetProperty | null {
  let i = text.indexOf('(');
  if (i < 0) return null;
  const skipSpace = () => { while (i < text.length && /\s/.test(text[i]!)) i++; };
  i++;
  skipSpace();
  if (text[i++] !== ';') return null;
  skipSpace();
  while (i < text.length && /[A-Za-z]/.test(text[i]!)) {
    const keyStart = i;
    while (i < text.length && /[A-Za-z]/.test(text[i]!)) i++;
    const key = text.slice(keyStart, i).replace(/[a-z]/g, '');
    skipSpace();
    while (text[i] === '[') {
      const start = ++i;
      while (i < text.length && text[i] !== ']') {
        if (text[i] === '\\') i++;
        i++;
      }
      if (key === 'CA' && text[i] === ']') {
        const value = text.slice(start, i)
          .replace(/\\(?:\r\n|\r|\n)/g, '')
          .replace(/\\([\s\S])/g, '$1').trim();
        return { value, start, end: i };
      }
      if (text[i] === ']') i++;
      skipSpace();
    }
    skipSpace();
  }
  return null;
}

// The Encoding Standard maps Latin-1 labels to Windows-1252. SGF specifies
// ISO-8859-1, so preserve its C1 code points instead of silently remapping them.
function latin1(bytes: Uint8Array): string {
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += 16_384) {
    parts.push(String.fromCharCode(...bytes.subarray(i, i + 16_384)));
  }
  return parts.join('');
}

function decoderFor(label: string): { encoding: string; decode: (bytes: Uint8Array) => string } {
  if (/^(?:iso[-_]?8859[-_]?1(?::1987)?|latin[-_]?1|l1|iso-ir-100|cp819|ibm819|csisolatin1)$/i.test(label)) {
    return { encoding: 'iso-8859-1', decode: latin1 };
  }
  try {
    const decoder = new TextDecoder(label, { fatal: true });
    return { encoding: decoder.encoding, decode: (bytes) => decoder.decode(bytes) };
  } catch {
    throw new Error(`Unsupported SGF character encoding "${label.slice(0, 80)}". Convert the file to UTF-8 and try again.`);
  }
}

function decodeDeclared(bytes: Uint8Array, label: string): string {
  const decoder = decoderFor(label);
  try {
    return decoder.decode(bytes);
  } catch {
    throw new Error(`The SGF contains invalid ${label.slice(0, 80)} text. Check its character encoding or convert it to UTF-8.`);
  }
}

/** Align a Unicode SGF string's declaration with Blob/JSZip's UTF-8 output. */
export function normalizeSgfUtf8(text: string): string {
  const declaration = rootCharset(text);
  if (declaration) {
    return `${text.slice(0, declaration.start)}UTF-8${text.slice(declaration.end)}`;
  }
  // ASCII needs no declaration. Non-ASCII strings will be saved as UTF-8 by
  // Blob/JSZip; keeping a legacy or absent declaration would corrupt a re-open.
  if (/\P{ASCII}/u.test(text)) {
    return text.replace(/\(\s*;/, (root) => `${root}CA[UTF-8]`);
  }
  return text;
}

/** Decode file bytes before SGF parsing; stored and downloaded text is UTF-8. */
export function decodeSgfBytes(bytes: Uint8Array): string {
  assertSgfImportSize(bytes.byteLength);
  const bomEncoding = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? 'utf-8'
    : bytes[0] === 0xff && bytes[1] === 0xfe ? 'utf-16le'
      : bytes[0] === 0xfe && bytes[1] === 0xff ? 'utf-16be' : null;
  if (bomEncoding) return normalizeSgfUtf8(decodeDeclared(bytes, bomEncoding));

  let utf8: string | undefined;
  try { utf8 = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { /* inspect CA below */ }
  if (utf8 !== undefined) {
    const declaration = rootCharset(utf8);
    return normalizeSgfUtf8(declaration ? decodeDeclared(bytes, declaration.value) : utf8);
  }

  const raw = latin1(bytes);
  const declaration = rootCharset(raw);
  const candidates = new Set<string>(declaration ? [declaration.value] : []);
  // Shift-JIS/Big5/GBK can contain a trail byte equal to '\\' or ']'. A raw
  // scan can therefore miss a later CA. Treat byte matches only as candidates:
  // accept one only after decoding and verifying the actual root property.
  for (const match of raw.matchAll(/(?:^|[^A-Za-z])C[a-z]*A[a-z]*\s*\[([A-Za-z0-9_ :.-]{1,80})\]/g)) {
    candidates.add(match[1]!.trim());
  }
  const tried = new Set<string>();
  for (const label of candidates) {
    try {
      const decoder = decoderFor(label);
      if (tried.has(decoder.encoding)) continue;
      tried.add(decoder.encoding);
      const decoded = decoder.decode(bytes);
      const actual = rootCharset(decoded);
      if (actual && decoderFor(actual.value).encoding === decoder.encoding) return normalizeSgfUtf8(decoded);
    } catch { /* report the actual declaration below if none can decode it */ }
  }
  if (declaration) return normalizeSgfUtf8(decodeDeclared(bytes, declaration.value));
  // Keep accepting modern UTF-8 records without CA (above). When those bytes
  // are not valid UTF-8, use the SGF specification's Latin-1 default.
  return normalizeSgfUtf8(raw);
}

export async function readSgfFile(file: Blob): Promise<string> {
  assertSgfImportSize(file.size);
  return decodeSgfBytes(new Uint8Array(await file.arrayBuffer()));
}
