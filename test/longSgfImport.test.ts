import { describe, it, expect } from 'vitest';
import { useGameStore } from '../src/store/gameStore';
import { parseSgf, type ParsedSgf } from '../src/utils/sgf';

/**
 * A record is a chain one node deep per move, so every pass that recursed over
 * the tree spent a stack frame per node and threw `RangeError: Maximum call
 * stack size exceeded` somewhere around 7,000 — surfaced to the reader as
 * "Invalid SGF import", which blames the file for a limit of ours. Three walks
 * had that shape: two in the parser (`validateMoveCoordinates`,
 * `expandPointListPropertiesInTree`) and one in the store's importer. Fixing
 * fewer than all three only moves where it lands, so this covers the chain.
 *
 * 20,000 nodes is far past any real game. A commented node per ply is the way
 * to build a chain that long without needing 20,000 legal points on a 19x19
 * board: the recursion depth was never about the moves, only about the nodes.
 */
const LONG_CHAIN_NODES = 20_000;

function buildLongNodeChain(nodeCount: number): string {
    const nodes: string[] = [];
    for (let i = 0; i < nodeCount; i++) nodes.push(`;C[n${i}]`);
    return `(;GM[1]FF[4]SZ[19]${nodes.join('')})`;
}

function treeDepth(tree: ParsedSgf['tree']): number {
    let depth = 0;
    let node = tree;
    while (node && node.children.length > 0) {
        node = node.children[0]!;
        depth++;
    }
    return depth;
}

describe('long SGF import', () => {
    it('parses a record far longer than any real game', () => {
        const parsed = parseSgf(buildLongNodeChain(LONG_CHAIN_NODES));
        expect(treeDepth(parsed.tree)).toBeGreaterThan(15_000);
    });

    it('builds the move tree for one without overflowing the stack', () => {
        const store = useGameStore.getState();
        store.resetGame();

        const parsed = parseSgf(buildLongNodeChain(LONG_CHAIN_NODES));
        expect(() => store.loadGame(parsed)).not.toThrow();

        let depth = 0;
        let node = useGameStore.getState().rootNode;
        while (node.children.length > 0) {
            node = node.children[0]!;
            depth++;
        }
        expect(depth).toBeGreaterThan(15_000);
    });
});
