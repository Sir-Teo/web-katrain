import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('move tree centring', () => {
  it('marks a move centred only once it could be', () => {
    // A large tree keeps its old worker layout on screen while the next is
    // computed. A move revealed from a folded branch is not in the old one, so
    // centring could not happen yet -- and marking it done anyway meant the
    // new layout never scrolled to it.
    const source = readFileSync('src/components/MoveTree.tsx', 'utf8');
    expect(source).toContain('const centerCurrentNode = useCallback((behavior: ScrollBehavior = preferredScrollBehavior()): boolean => {');
    expect(source).toMatch(/if \(!centerCurrentNode\([^)]*\)[^)]*\)\) return;\n\s*centeredRef\.current = \{ nodeId: currentNode\.id/);
  });
});
