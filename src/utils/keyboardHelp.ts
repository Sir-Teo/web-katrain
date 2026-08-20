export function filterKeyboardReferenceItems<T extends { control: string; action: string }>(
  items: readonly T[],
  query: string,
): T[] {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [...items];
  return items.filter((item) => {
    const haystack = `${item.control} ${item.action}`.toLowerCase();
    return terms.every((term) => haystack.includes(term));
  });
}
