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
 * Picks the most useful importable string from shared data. A shared URL (e.g.
 * an Online-Go game link) wins over free text, which itself wins over a title.
 */
export const pickSharedImportText = (shared: SharedTargetData): string | null => {
  for (const candidate of [shared.url, shared.text, shared.title]) {
    const trimmed = candidate?.trim();
    if (trimmed) return trimmed;
  }
  return null;
};
