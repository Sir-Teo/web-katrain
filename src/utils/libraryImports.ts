import { prependLibraryImports, updateStoredLibrary, type LibraryItem } from './library';

const listeners = new Set<(items: LibraryItem[]) => void>();

export const subscribeLibraryImports = (listener: (items: LibraryItem[]) => void): (() => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

/** Finish imports independently of the panel that started reading the files. */
export const persistLibraryImports = async (imported: readonly LibraryItem[]): Promise<LibraryItem[]> => {
  if (!imported.length) return [];
  const saved = await updateStoredLibrary((current) => {
    const items = prependLibraryImports(current, imported);
    return { items, result: { items, imported: items.slice(0, imported.length) } };
  });
  for (const listener of listeners) listener(saved.items);
  return saved.imported;
};
