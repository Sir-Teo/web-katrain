import { prependLibraryImports, updateStoredLibrary, type LibraryFile, type LibraryFolder, type LibraryItem } from './library';
import { mergeOgsLibraryImports } from './libraryOgsImport';

const listeners = new Set<(items: LibraryItem[]) => void>();
const activityListeners = new Set<() => void>();
let pendingSources = 0;

const preventPendingImportUnload = (event: BeforeUnloadEvent): void => {
  event.preventDefault();
  event.returnValue = '';
};

export const getLibraryImportCount = (): number => pendingSources;
export const subscribeLibraryImportActivity = (listener: () => void): (() => void) => {
  activityListeners.add(listener);
  return () => { activityListeners.delete(listener); };
};

/** Keep read/network work visible and protected even while Library is closed. */
export const beginLibraryImport = (sourceCount: number): (() => void) => {
  const count = Number.isFinite(sourceCount) ? Math.max(0, Math.floor(sourceCount)) : 0;
  if (!count) return () => {};
  if (pendingSources === 0 && typeof window !== 'undefined') {
    window.addEventListener('beforeunload', preventPendingImportUnload);
  }
  pendingSources += count;
  for (const listener of activityListeners) listener();
  let finished = false;
  return () => {
    if (finished) return;
    finished = true;
    pendingSources -= count;
    if (pendingSources === 0 && typeof window !== 'undefined') {
      window.removeEventListener('beforeunload', preventPendingImportUnload);
    }
    for (const listener of activityListeners) listener();
  };
};

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

/** Resolve the OGS destination against storage and publish only committed games. */
export const persistOgsLibraryImports = async (folder: LibraryFolder, files: LibraryFile[]): Promise<LibraryFile[]> => {
  if (!files.length) return [];
  const importedIds = new Set(files.map(file => file.id));
  const saved = await updateStoredLibrary((current) => {
    const items = mergeOgsLibraryImports(current, folder, files);
    const imported = items.filter((item): item is LibraryFile => item.type === 'file' && importedIds.has(item.id));
    return { items, result: { items, imported } };
  });
  for (const listener of listeners) listener(saved.items);
  return saved.imported;
};
