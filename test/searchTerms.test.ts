import { describe, expect, it } from 'vitest';
import { MAX_SEARCH_QUERY_LENGTH, matchesSearchTerms, toSearchTerms } from '../src/utils/searchTerms';
import { filterProGames } from '../src/utils/proGames';
import { filterKeyboardReferenceItems } from '../src/utils/keyboardHelp';

describe('search terms', () => {
  it('splits on any run of whitespace and lowercases', () => {
    expect(toSearchTerms('  Lee   SEDOL 2005 ')).toEqual(['lee', 'sedol', '2005']);
  });

  it('is empty for a query with nothing in it', () => {
    expect(toSearchTerms('   ')).toEqual([]);
    expect(toSearchTerms(null)).toEqual([]);
  });

  it('requires every term, in any field and any order', () => {
    const haystack = 'lee sedol vs gu li 2005 tournament';
    expect(matchesSearchTerms(haystack, toSearchTerms('sedol 2005'))).toBe(true);
    expect(matchesSearchTerms(haystack, toSearchTerms('sedol 2003'))).toBe(false);
  });

  /**
   * The slip this guards against is a paste into the filter rather than the
   * importer. Every term has to match, so an unbounded query is terms x
   * haystack x items of work — 900ms against one haystack when measured in
   * web-xiangqi, and a frozen tab against a full library.
   */
  it('truncates a pasted record instead of scanning every term of it', () => {
    const pastedSgf = '(;GM[1]SZ[19]' + ';B[aa];W[bb]'.repeat(20_000) + ')';

    const started = performance.now();
    const terms = toSearchTerms(pastedSgf);
    const elapsed = performance.now() - started;

    expect(terms.join(' ').length).toBeLessThanOrEqual(MAX_SEARCH_QUERY_LENGTH);
    expect(elapsed, `took ${elapsed.toFixed(0)}ms`).toBeLessThan(50);
  });

  it('keeps every search box bounded, not just the tokeniser', () => {
    const pasted = 'x'.repeat(500_000);
    const games = [{ name: 'Lee Sedol vs Gu Li', black: 'Lee Sedol', white: 'Gu Li', date: '2005' }];
    const items = [{ control: 'ctrl+k', action: 'Open the command palette' }];

    const started = performance.now();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    filterProGames(games as any, pasted);
    filterKeyboardReferenceItems(items, pasted);
    const elapsed = performance.now() - started;

    expect(elapsed, `took ${elapsed.toFixed(0)}ms`).toBeLessThan(50);
  });
});
