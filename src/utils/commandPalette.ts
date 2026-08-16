import { readLocalStorage, writeLocalStorage } from './storage';

export const normalizeCommandQuery = (value: string): string =>
  value.trim().toLowerCase();

export const RECENT_COMMANDS_STORAGE_KEY = 'web-katrain:recent_commands:v1';
/**
 * Enough to cover the handful of commands anyone reaches for repeatedly,
 * without pushing the rest of the list below the fold on an empty query.
 */
export const MAX_RECENT_COMMANDS = 5;

export function readRecentCommandIds(): string[] {
  const stored = readLocalStorage(RECENT_COMMANDS_STORAGE_KEY);
  if (!stored) return [];
  try {
    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is string => typeof id === 'string').slice(0, MAX_RECENT_COMMANDS);
  } catch {
    return [];
  }
}

/** Most recent first, no duplicates, capped. */
export function addRecentCommandId(id: string, existing: readonly string[] = readRecentCommandIds()): string[] {
  return [id, ...existing.filter((entry) => entry !== id)].slice(0, MAX_RECENT_COMMANDS);
}

export function writeRecentCommandIds(ids: readonly string[]): void {
  writeLocalStorage(RECENT_COMMANDS_STORAGE_KEY, JSON.stringify(ids.slice(0, MAX_RECENT_COMMANDS)));
}

/**
 * Lift recently used commands to the front of the unfiltered list.
 *
 * Only for the empty query: once someone types, what they typed is a much
 * better signal than what they ran yesterday, and reordering by recency there
 * would fight the match scoring. Recent ids that no longer exist (a command
 * removed since) are skipped rather than dropped from storage, so a command
 * that is merely unavailable right now keeps its place in the history.
 */
export function orderCommandsByRecency<T extends { id: string }>(
  commands: readonly T[],
  recentIds: readonly string[]
): T[] {
  if (recentIds.length === 0) return [...commands];
  const byId = new Map(commands.map((command) => [command.id, command]));
  const recent = recentIds.flatMap((id) => {
    const command = byId.get(id);
    return command ? [command] : [];
  });
  const recentSet = new Set(recent.map((command) => command.id));
  return [...recent, ...commands.filter((command) => !recentSet.has(command.id))];
}

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
