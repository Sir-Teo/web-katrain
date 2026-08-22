import { extractOgsGameId } from './ogs';

export interface SharedTargetData {
  title?: string;
  text?: string;
  url?: string;
}

const SHARE_PARAM_KEYS = ['title', 'text', 'url'] as const;

/**
 * Parses Web Share Target (GET) parameters from a location search string.
 * Returns null when none of the recognised params are present.
 */
export const readSharedFromQuery = (search: string | null | undefined): SharedTargetData | null => {
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(search ?? '');
  } catch {
    return null;
  }
  const data: SharedTargetData = {};
  let found = false;
  for (const key of SHARE_PARAM_KEYS) {
    const value = params.get(key);
    if (value != null && value !== '') {
      data[key] = value;
      found = true;
    }
  }
  return found ? data : null;
};

/**
 * Picks the most useful importable string from shared data. Supported Online-Go
 * URLs win, but an unrelated source-page URL must not hide SGF shared as text.
 */
export const pickSharedImportText = (shared: SharedTargetData): string | null => {
  const url = shared.url?.trim();
  if (url && extractOgsGameId(url)) return url;

  for (const candidate of [shared.text, url, shared.title]) {
    const trimmed = candidate?.trim();
    if (trimmed) return trimmed;
  }
  return null;
};
