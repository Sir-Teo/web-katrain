import { describe, expect, it } from 'vitest';
import { createEmptyBoard } from '../src/utils/boardSize';
import { generateSgfFromTree, parseSgf } from '../src/utils/sgf';
import type { GameNode } from '../src/types';

function rootNode(): GameNode {
  return {
    id: 'root', parent: null, children: [], move: null,
    gameState: {
      board: createEmptyBoard(9), currentPlayer: 'black', moveHistory: [],
      komi: 6.5, capturedBlack: 0, capturedWhite: 0,
    },
  };
}

let nextNodeId = 0;
function addChild(parent: GameNode, note?: string): GameNode {
  const child: GameNode = {
    id: `study-${nextNodeId++}`, parent, children: [], move: null,
    gameState: parent.gameState, note,
  };
  parent.children.push(child);
  return child;
}

describe('SGF export of large study trees', () => {
  it('saves and reopens every comment in a 12,000-node sequence', () => {
    const root = rootNode();
    let current = root;
    for (let i = 0; i < 12_000; i++) current = addChild(current, `Study ${i}`);
    const output = generateSgfFromTree(root);
    let parsed = parseSgf(output).tree!;
    for (let i = 0; i < 12_000; i++) {
      expect(parsed.children).toHaveLength(1);
      parsed = parsed.children[0]!;
      expect(parsed.props.C).toEqual([`Study ${i}`]);
    }
    expect(parsed.children).toEqual([]);
  });

  it('keeps sibling order and omits empty subtrees without changing variation grouping', () => {
    const root = rootNode();
    const trunk = addChild(root, 'Trunk');
    addChild(trunk); // entirely empty: it must not become an SGF variation
    const transparent = addChild(trunk);
    addChild(transparent, 'First variation');
    addChild(transparent); // one nonempty child: it must remain a sequence
    addChild(trunk, 'Second variation');
    const output = generateSgfFromTree(root);
    expect(output).toContain(';C[Trunk](;C[First variation])(;C[Second variation])');
    const parsed = parseSgf(output).tree!.children[0]!;
    expect(parsed.children.map((child) => child.props.C?.[0])).toEqual(['First variation', 'Second variation']);
  });
});
