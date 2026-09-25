import { describe, expect, it } from 'vitest';
import { useGameStore } from '../src/store/gameStore';
import { parseSgf } from '../src/utils/sgf';
import { moveTreeNodeLabel, moveTreeStructureKey } from '../src/utils/moveTreeLayout';

describe('the move tree key', () => {
  it('changes when a setup node gains stones, so its label is redrawn', () => {
    const s = useGameStore.getState();
    s.resetGame();
    s.loadGame(parseSgf('(;GM[1]FF[4]SZ[9];AB[aa];W[cc])'));
    useGameStore.getState().jumpToNode(useGameStore.getState().rootNode.children[0]!);
    const before = moveTreeStructureKey(useGameStore.getState().rootNode);

    useGameStore.getState().setEditTool('setup-black');
    useGameStore.getState().applyEditTool(4, 4);
    useGameStore.getState().applyEditTool(5, 5);
    const root = useGameStore.getState().rootNode;

    expect(moveTreeNodeLabel(root.children[0]!)).toBe('Setup 3');
    expect(moveTreeStructureKey(root)).not.toBe(before);
  });
});
