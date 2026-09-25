import { beforeEach, describe, expect, it } from 'vitest';
import { useGameStore } from '../src/store/gameStore';
import { parseSgf } from '../src/utils/sgf';

const s = () => useGameStore.getState();

beforeEach(() => {
  s().resetGame();
  s().loadGame(parseSgf('(;GM[1]SZ[9];B[dd](;W[ee])(;W[cc]))'));
  s().navigateEnd();
  s().switchBranch(1);
});

describe('a pinned line after the tree is rearranged', () => {
  it('recalls the pinned move after its variation becomes the main line', () => {
    const pinned = s().currentNode;
    expect(pinned.move).toMatchObject({ x: 2, y: 2 });
    s().pinCurrentVariation();
    s().makeCurrentNodeMainBranch();
    s().navigateStart();

    s().recallVariation(s().pinnedVariations[0]!.id);
    expect(s().currentNode.id).toBe(pinned.id);
    expect(s().pinnedVariations[0]!.path).toEqual([0, 0]);
  });

  it('recalls it after an earlier sibling is deleted', () => {
    const pinned = s().currentNode;
    s().pinCurrentVariation();
    s().jumpToNode(s().rootNode.children[0]!.children[0]!);
    expect(s().currentNode.move).toMatchObject({ x: 4, y: 4 });
    s().deleteCurrentNode();

    s().recallVariation(s().pinnedVariations[0]!.id);
    expect(s().currentNode.id).toBe(pinned.id);
  });

  it('follows the node back through undo', () => {
    const pinned = s().currentNode;
    s().pinCurrentVariation();
    s().makeCurrentNodeMainBranch();
    s().undoEdit();
    s().navigateStart();

    s().recallVariation(s().pinnedVariations[0]!.id);
    expect(s().currentNode.move).toMatchObject({ x: 2, y: 2 });
    expect(s().currentNode.id).toBe(pinned.id);
    expect(s().pinnedVariations[0]!.path).toEqual([0, 1]);
  });
});
