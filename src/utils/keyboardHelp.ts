import { normalizeSearchText, toSearchTerms } from './searchTerms';

export function filterKeyboardReferenceItems<T extends { control: string; action: string }>(
  items: readonly T[],
  query: string,
): T[] {
  const terms = toSearchTerms(query);
  if (terms.length === 0) return [...items];
  return items.filter((item) => {
    const haystack = normalizeSearchText(`${item.control} ${item.action}`);
    return terms.every((term) => haystack.includes(term));
  });
}
