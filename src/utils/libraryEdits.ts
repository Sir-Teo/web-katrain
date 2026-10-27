import type { LibraryItem } from './library';
import { reserveLibraryName, type LibraryNamePool } from './libraryNames';

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
  const retained = items.filter(item => !removed.has(item.id)).map(item => {
    const patch = patches.get(item.id);
    return patch ? { ...item, ...patch } as LibraryItem : item;
  });
  const renamed = new Set(changes.updated
    .filter(({ patch }) => typeof patch.name === 'string' || Object.hasOwn(patch, 'parentId'))
    .map(({ id }) => id));
  const incoming = changes.added.filter(item => !existing.has(item.id));
  if (!renamed.size && !incoming.length) return retained;
  const pools = new Map<string | null, LibraryNamePool>();
  const poolFor = (item: LibraryItem): LibraryNamePool => {
    const parent = item.parentId ?? null;
    let pool = pools.get(parent);
    if (!pool) {
      pool = { names: new Set(), nextSuffix: new Map() };
      pools.set(parent, pool);
    }
    return pool;
  };
  // Keep unrelated rows intact, including duplicate names from older backups.
  for (const item of retained) if (!renamed.has(item.id)) poolFor(item).names.add(item.name.toLowerCase());
  const nameItem = (item: LibraryItem): LibraryItem => {
    const name = reserveLibraryName(item.name, poolFor(item));
    return name === item.name ? item : { ...item, name };
  };
  const named = retained.map(item => renamed.has(item.id) ? nameItem(item) : item);
  // This runs inside the storage lock as well as during UI rebasing, so a
  // dialog's old snapshot cannot overwrite a sibling name saved by another tab.
  const added = incoming.map(nameItem);
  return [...added, ...named];
};
