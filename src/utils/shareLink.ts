import pako from 'pako';

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
  const bytes = base64UrlToBytes(value);
  if (!bytes) return null;
  try {
    const sgf = pako.inflate(bytes, { to: 'string' });
    return sgf && sgf.includes('(;') ? sgf : null;
  } catch {
    return null;
  }
};

type ShareLocation = Pick<Location, 'origin' | 'pathname' | 'search'>;

/** Builds a shareable URL that embeds the SGF in the fragment. */
export const buildShareUrl = (sgf: string, location: ShareLocation): string =>
  `${location.origin}${location.pathname}${location.search}#${encodeSgfToFragment(sgf)}`;
