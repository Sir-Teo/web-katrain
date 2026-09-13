import type { LibraryItem } from './library';

export type LibraryChanges = {
  added: LibraryItem[];
  removed: string[];
  updated: Array<{ id: string; patch: Partial<LibraryItem> }>;
};
export type LibraryEditBatch = { revision: number; changes: LibraryChanges };

/** Describe the user's edits, excluding fields unchanged in their UI snapshot. */
export const getLibraryChanges = (before: LibraryItem[], after: LibraryItem[]): LibraryChanges => {
  const previous = new Map(before.map(item => [item.id, item]));
  const remaining = new Set(after.map(item => item.id));
  const changes: LibraryChanges = { added: [], removed: [], updated: [] };
  for (const item of before) if (!remaining.has(item.id)) changes.removed.push(item.id);
  for (const item of after) {
    const prior = previous.get(item.id);
    if (!prior) { changes.added.push(item); continue; }
    if (prior === item) continue;
    const oldFields = prior as unknown as Record<string, unknown>;
    const newFields = item as unknown as Record<string, unknown>;
    const keys = new Set([...Object.keys(oldFields), ...Object.keys(newFields)]);
    const patch = Object.fromEntries([...keys]
      .filter(key => !Object.is(oldFields[key], newFields[key]))
      .map(key => [key, newFields[key]])) as Partial<LibraryItem>;
    if (Object.keys(patch).length) changes.updated.push({ id: item.id, patch });
  }
  return changes;
};

/** Apply edited fields to the latest collection without replacing unrelated data. */
export const applyLibraryChanges = (items: LibraryItem[], changes: LibraryChanges): LibraryItem[] => {
  const removed = new Set(changes.removed);
  const patches = new Map(changes.updated.map(update => [update.id, update.patch]));
  const existing = new Set(items.map(item => item.id));
  return [
    ...changes.added.filter(item => !existing.has(item.id)),
    ...items.filter(item => !removed.has(item.id)).map(item => {
      const patch = patches.get(item.id);
      return patch ? { ...item, ...patch } as LibraryItem : item;
    }),
  ];
};
