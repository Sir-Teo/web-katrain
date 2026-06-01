export const normalizeCommandQuery = (value: string): string =>
  value.trim().toLowerCase();

const compactCommandQuery = (value: string): string =>
  normalizeCommandQuery(value).replace(/[^a-z0-9]/g, '');

export type CommandPaletteSearchParts = {
  label: string;
  category?: string;
  id?: string;
  shortcut?: string;
  keywords?: string[];
};

const weightedSearchParts = (parts: CommandPaletteSearchParts): Array<{ value: string; weight: number }> => [
  { value: parts.label, weight: 0 },
  { value: parts.shortcut ?? '', weight: 8 },
  { value: parts.id ?? '', weight: 16 },
  { value: parts.category ?? '', weight: 28 },
  ...(parts.keywords ?? []).map((keyword) => ({ value: keyword, weight: 40 })),
];

export const commandMatchesQuery = (parts: Array<string | undefined>, query: string): boolean => {
  const normalizedQuery = normalizeCommandQuery(query);
  if (!normalizedQuery) return true;

  const haystack = parts
    .filter((part): part is string => typeof part === 'string' && part.length > 0)
    .join(' ')
    .toLowerCase();

  return normalizedQuery
    .split(/\s+/)
    .filter(Boolean)
    .every((token) => haystack.includes(token));
};

export function scoreCommandMatch(parts: CommandPaletteSearchParts, query: string): number | null {
  const normalizedQuery = normalizeCommandQuery(query);
  if (!normalizedQuery) return 0;

  const fields = weightedSearchParts(parts)
    .map((part) => ({ ...part, value: normalizeCommandQuery(part.value) }))
    .filter((part) => part.value.length > 0);
  const haystack = fields.map((field) => field.value).join(' ');
  const tokens = normalizedQuery.split(/\s+/).filter(Boolean);
  const compactQuery = compactCommandQuery(normalizedQuery);

  if (!tokens.every((token) => haystack.includes(token))) return null;

  let phraseScore = Number.POSITIVE_INFINITY;
  for (const field of fields) {
    const compactField = compactCommandQuery(field.value);
    if (field.value === normalizedQuery) {
      phraseScore = Math.min(phraseScore, field.weight);
    } else if (compactQuery && compactField === compactQuery) {
      phraseScore = Math.min(phraseScore, field.weight + 1);
    } else if (field.value.startsWith(normalizedQuery)) {
      phraseScore = Math.min(phraseScore, field.weight + 4);
    } else if (compactQuery && compactField.startsWith(compactQuery)) {
      phraseScore = Math.min(phraseScore, field.weight + 5);
    } else if (field.value.includes(normalizedQuery)) {
      phraseScore = Math.min(phraseScore, field.weight + 10);
    }
  }

  const tokenScore = tokens.reduce((sum, token) => {
    let best = 80;
    for (const field of fields) {
      const index = field.value.indexOf(token);
      if (index < 0) continue;
      best = Math.min(best, field.weight + Math.min(index, 20));
    }
    return sum + best;
  }, 0);

  return Math.min(phraseScore, 100 + tokenScore);
}
