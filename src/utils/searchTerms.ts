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

/**
 * British spellings, rewritten to the American ones the app's copy uses.
 *
 * `copyDialect.test.ts` holds every user-facing string to one dialect on
 * purpose, which leaves a reader who spells the other way finding nothing:
 * measured against the live command palette, "analyse" returned 0 results
 * where "analyze" returned 3, and "colour" 0 where "color" returned 1.
 * Rewriting the query is what keeps the two in step -- and it belongs here
 * rather than in one search box, so the palette and the settings search cannot
 * drift into answering the same word differently.
 *
 * "analyses" is deliberately left alone: it is the same word in both dialects
 * as a noun, and the app says "cached analyses".
 */
const DIALECT_ALIASES: ReadonlyArray<readonly [RegExp, string]> = [
  // `e(?!s)` is what excludes "analyses".
  [/analys(e(?!s)|ed|ing|er)/g, 'analyz$1'],
  [/colour/g, 'color'],
  [/favourite/g, 'favorite'],
  [/behaviour/g, 'behavior'],
  [/centre/g, 'center'],
  [/grey/g, 'gray'],
  [/cancelled/g, 'canceled'],
  [/licence/g, 'license'],
  [/defence/g, 'defense'],
  [/(organi|customi|recogni)se/g, '$1ze'],
];

/** Applies the aliases above to already-lowercased text. */
export const applySearchDialect = (lowercased: string): string => {
  let out = lowercased;
  for (const [pattern, replacement] of DIALECT_ALIASES) out = out.replace(pattern, replacement);
  return out;
};

