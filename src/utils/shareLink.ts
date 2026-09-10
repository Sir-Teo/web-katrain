import pako from 'pako';
import { parseSgf } from './sgf';
import { MAX_SGF_IMPORT_BYTES } from './sgfImportLimits';

const FRAGMENT_KEY = 'sgf';

/**
 * Conservative cap for the generated share URL. Most browsers handle far more,
 * but some servers/clients truncate beyond ~8k characters, so we warn past this.
 */
export const MAX_SHARE_URL_LENGTH = 8000;

const bytesToBase64Url = (bytes: Uint8Array): string => {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const base64UrlToBytes = (value: string): Uint8Array | null => {
  try {
    const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
};

/** Compresses an SGF string into a URL fragment (`sgf=<base64url>`). */
export const encodeSgfToFragment = (sgf: string): string =>
  `${FRAGMENT_KEY}=${bytesToBase64Url(pako.deflate(sgf))}`;

/**
 * How much compressed fragment to even look at. A share URL this app produces
 * is capped at MAX_SHARE_URL_LENGTH and warned about past that; this is a
 * ceiling on what someone else's link may hand us, not a limit on ours.
 */
const MAX_FRAGMENT_BYTES = 256 * 1024;

/** Inflate in input-sized bites, stopping the moment the output goes too far.
 *
 * `pako.inflate` in one call is unbounded on the output side, and the input is
 * a URL fragment from whoever sent the link. Measured before this existed: a
 * 271,803-character fragment — nothing a browser would refuse to carry —
 * inflated to 200MB and 391MB of heap in 228ms, and the app did that while
 * starting up, before deciding the result was not an SGF. A phone would not
 * have survived a larger one.
 *
 * The limit is the one `parseSgf` applies anyway, so nothing that would have
 * loaded stops loading. Feeding the input in small pieces bounds the overshoot:
 * pako cannot be stopped part-way through a push, so the last bite is the most
 * that can be produced after the ceiling is crossed.
 */
const INFLATE_INPUT_BITE = 4096;

const inflateBounded = (bytes: Uint8Array, limit: number): string | null => {
  const inflate = new pako.Inflate({ to: 'string' });
  const parts: string[] = [];
  let total = 0;
  let overflowed = false;
  inflate.onData = (chunk: unknown) => {
    if (overflowed) return;
    const text = String(chunk);
    total += text.length;
    if (total > limit) {
      overflowed = true;
      return;
    }
    parts.push(text);
  };
  for (let offset = 0; offset < bytes.length && !overflowed; offset += INFLATE_INPUT_BITE) {
    const end = offset + INFLATE_INPUT_BITE;
    inflate.push(bytes.subarray(offset, end), end >= bytes.length);
    if (inflate.err) return null;
  }
  if (overflowed || inflate.err) return null;
  return parts.join('');
};

/** Decodes an SGF string from a URL fragment, or null when absent/invalid. */
export const decodeSgfFromFragment = (fragment: string | null | undefined): string | null => {
  if (!fragment) return null;
  const clean = fragment.replace(/^#/, '');
  let value: string | null = null;
  try {
    value = new URLSearchParams(clean).get(FRAGMENT_KEY);
  } catch {
    value = null;
  }
  if (!value) return null;
  if (value.length > MAX_FRAGMENT_BYTES) return null;
  const bytes = base64UrlToBytes(value);
  if (!bytes) return null;
  try {
    const sgf = inflateBounded(bytes, MAX_SGF_IMPORT_BYTES);
    if (!sgf) return null;
    parseSgf(sgf);
    return sgf;
  } catch {
    return null;
  }
};

type ShareLocation = Pick<Location, 'origin' | 'pathname' | 'search'>;

/** Builds a shareable URL that embeds the SGF in the fragment. */
export const buildShareUrl = (sgf: string, location: ShareLocation): string =>
  `${location.origin}${location.pathname}${location.search}#${encodeSgfToFragment(sgf)}`;
