import { normalizeSearchText } from './searchTerms';

export type LibraryRowKind = 'file' | 'folder';

export type LibraryRowKeyAction = 'activate' | 'expand' | 'collapse' | 'context-menu' | 'none';

export interface LibraryRowKeyArgs {
  key: string;
  shiftKey?: boolean;
  kind: LibraryRowKind;
  isExpanded?: boolean;
  hasChildren?: boolean;
  allowChildren?: boolean;
}

export function getLibraryRowKeyAction(args: LibraryRowKeyArgs): LibraryRowKeyAction {
  if (args.key === 'ContextMenu' || (args.shiftKey && args.key === 'F10')) return 'context-menu';
  if (args.key === 'Enter' || args.key === ' ') return 'activate';
  if (args.kind !== 'folder') return 'none';

  if (args.key === 'ArrowRight') {
    if (args.allowChildren === false || !args.hasChildren) return 'activate';
    return args.isExpanded ? 'none' : 'expand';
  }

  if (args.key === 'ArrowLeft') {
    if (args.allowChildren === false || !args.hasChildren) return 'none';
    return args.isExpanded ? 'collapse' : 'none';
  }

  return 'none';
}

export interface LibraryMenuNavigationArgs {
  key: string;
  currentIndex: number;
  itemCount: number;
}

export function getLibraryMenuNavigationIndex(args: LibraryMenuNavigationArgs): number | null {
  if (args.itemCount <= 0) return null;

  switch (args.key) {
    case 'ArrowDown':
      return args.currentIndex < 0 ? 0 : (args.currentIndex + 1) % args.itemCount;
    case 'ArrowUp':
      return args.currentIndex < 0
        ? args.itemCount - 1
        : (args.currentIndex - 1 + args.itemCount) % args.itemCount;
    case 'Home':
      return 0;
    case 'End':
      return args.itemCount - 1;
    default:
      return null;
  }
}

export function isLibraryMenuCloseKey(key: string): boolean {
  return key === 'Escape';
}

/** Match visible row names without activating, selecting, or loading a game. */
export function getLibraryTypeaheadMatch(args: {
  key: string;
  query: string;
  names: readonly string[];
  currentIndex: number;
}): { query: string; index: number | null } | null {
  if (Array.from(args.key).length !== 1 || !args.key.trim()) return null;
  const key = normalizeSearchText(args.key);
  const previous = normalizeSearchText(args.query);
  const cycling = previous === key;
  const query = cycling ? key : previous + key;
  const start = Math.max(0, args.currentIndex + (previous && !cycling ? 0 : 1));
  for (let offset = 0; offset < args.names.length; offset++) {
    const index = (start + offset + args.names.length) % args.names.length;
    if (normalizeSearchText(args.names[index]!.trimStart()).startsWith(query)) {
      return { query, index };
    }
  }
  return { query, index: null };
}
