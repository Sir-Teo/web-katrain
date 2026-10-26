import type { LibraryItem } from './library';

export type LibraryTreeRow =
  | { kind: 'item'; item: LibraryItem; depth: number; position: number; total: number }
  | { kind: 'more'; parentId: string | null; total: number; depth: number };

/** Visible depth-first rows, with each folder's paging control after its children. */
export function getVisibleLibraryTreeRows(
  children: ReadonlyMap<string | null, readonly LibraryItem[]>,
  expanded: ReadonlySet<string>,
  limitFor: (key: string) => number,
): LibraryTreeRow[] {
  const pending: LibraryTreeRow[] = [];
  const rows: LibraryTreeRow[] = [];
  const seen = new Set<string>();
  const appendChildren = (parentId: string | null, depth: number) => {
    const siblings = children.get(parentId) ?? [];
    const count = Math.min(siblings.length, limitFor(parentId ?? ''));
    if (count < siblings.length) pending.push({ kind: 'more', parentId, total: siblings.length, depth });
    for (let index = count - 1; index >= 0; index--) {
      pending.push({ kind: 'item', item: siblings[index]!, depth, position: index + 1, total: siblings.length });
    }
  };
  appendChildren(null, 0);
  while (pending.length) {
    const row = pending.pop()!;
    if (row.kind === 'item') {
      if (seen.has(row.item.id)) continue;
      seen.add(row.item.id);
      rows.push(row);
      if (row.item.type === 'folder' && expanded.has(row.item.id)) {
        appendChildren(row.item.id, row.depth + 1);
      }
    } else rows.push(row);
  }
  return rows;
}

/** Keep row controls reachable even in very deeply nested study archives. */
export const libraryTreeIndent = (depth: number): number => 12 + Math.min(depth, 4) * 16;
