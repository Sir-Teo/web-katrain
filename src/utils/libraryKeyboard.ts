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
