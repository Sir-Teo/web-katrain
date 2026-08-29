/**
 * Free-text matching for the search boxes: the library filter, the pro-game
 * list, the keyboard reference, the command palette.
 *
 * Every whitespace-separated term has to appear somewhere in the text, rather
 * than the whole query having to appear as one run of characters. Matching the
 * phrase means a query spanning two fields — a player and a year, say — finds
 * nothing, because those fields never end up adjacent.
 *
 * A search box reads text the app did not write, and the obvious slip is a
 * paste into the wrong field — a record into the filter instead of the
 * importer. Every term has to match, so the work is terms x haystack x items:
 * a 380KB paste is 60,000 terms scanned against every entry in the list, which
 * measured 900ms against a single haystack in web-xiangqi and freezes the tab
 * for a full library. Nothing narrows a search past a handful of terms anyway.
 *
 * Truncating rather than rejecting keeps a real query working and makes a
 * pasted record return nothing, immediately, which is what it should do.
 */
export const MAX_SEARCH_QUERY_LENGTH = 200;

export const toSearchTerms = (query: string | null | undefined): string[] =>
  String(query ?? '')
    .slice(0, MAX_SEARCH_QUERY_LENGTH)
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);

export const matchesSearchTerms = (haystack: string, terms: string[]): boolean =>
  terms.every((term) => haystack.includes(term));
