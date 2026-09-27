import type { LibraryItem } from './library';

/**
 * The Library tree as the flat list of rows it renders.
 *
 * Each folder row used to render its own children, and each child folder its
 * own, so an expanded chain N folders deep was N nested calls and N nested
 * elements. Paging bounds how many children one folder shows, not how deep a
 * chain goes, and a backup can hold any depth. Walking with an explicit stack
 * and rendering the rows as siblings keeps both the call depth and the DOM
 * depth flat, whatever the tree.
 */
export type LibraryTreeRow =
  | { kind: 'item'; key: string; item: LibraryItem; depth: number }
  /** "Show more" for a list cut at its page: `listKey` is the folder id, '' for the top level. */
  | { kind: 'more'; key: string; listKey: string; total: number; depth: number }
  /** An expanded folder whose contents are deeper than the tree shows inline. */
  | { kind: 'too-deep'; key: string; folder: LibraryItem; depth: number };

/** Levels shown inline below the top. Deeper contents get a row saying so instead. */
export const LIBRARY_TREE_MAX_DEPTH = 32;

/** Levels of indentation drawn. Deeper rows share the last and name their level. */
export const LIBRARY_TREE_INDENT_LEVELS = 12;

export const libraryTreeIndent = (depth: number): number =>
  12 + Math.min(Math.max(depth, 0), LIBRARY_TREE_INDENT_LEVELS) * 16;

type Frame = { list: readonly LibraryItem[]; index: number; end: number; depth: number; listKey: string };

export const flattenLibraryTreeRows = ({
  roots,
  childrenOf,
  isExpanded,
  limitFor,
  maxDepth = LIBRARY_TREE_MAX_DEPTH,
}: {
  roots: readonly LibraryItem[];
  childrenOf: (folderId: string) => readonly LibraryItem[];
  isExpanded: (folderId: string) => boolean;
  limitFor: (listKey: string) => number;
  maxDepth?: number;
}): LibraryTreeRow[] => {
  const rows: LibraryTreeRow[] = [];
  // A corrupt parent cycle must not repeat rows forever.
  const visited = new Set<string>();
  const frameFor = (list: readonly LibraryItem[], depth: number, listKey: string): Frame => ({
    list,
    index: 0,
    end: Math.min(list.length, limitFor(listKey)),
    depth,
    listKey,
  });
  const stack: Frame[] = [frameFor(roots, 0, '')];
  while (stack.length > 0) {
    const frame = stack[stack.length - 1]!;
    if (frame.index >= frame.end) {
      stack.pop();
      if (frame.list.length > frame.end) {
        rows.push({ kind: 'more', key: `more:${frame.listKey}`, listKey: frame.listKey, total: frame.list.length, depth: frame.depth });
      }
      continue;
    }
    const item = frame.list[frame.index++]!;
    if (visited.has(item.id)) continue;
    visited.add(item.id);
    rows.push({ kind: 'item', key: item.id, item, depth: frame.depth });
    if (item.type !== 'folder' || !isExpanded(item.id)) continue;
    const children = childrenOf(item.id);
    if (children.length === 0) continue;
    if (frame.depth + 1 > maxDepth) {
      rows.push({ kind: 'too-deep', key: `deep:${item.id}`, folder: item, depth: frame.depth + 1 });
      continue;
    }
    stack.push(frameFor(children, frame.depth + 1, item.id));
  }
  return rows;
};
