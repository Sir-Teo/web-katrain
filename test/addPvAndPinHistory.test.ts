import { beforeEach, describe, expect, it } from 'vitest';
import { useGameStore } from '../src/store/gameStore';
import { parseSgf } from '../src/utils/sgf';

const s = () => useGameStore.getState();

describe('Add PV that adds nothing keeps redo', () => {
  beforeEach(() => { s().resetGame(); useGameStore.setState({ isAnalysisMode: false, notification: null }); });

  it('for an unplayable line', () => {
    s().loadGame(parseSgf('(;GM[1]SZ[9];B[dd];W[ee])'));
    s().navigateEnd();
    s().toggleBoardPointMarkup(0, 0);
    s().undoEdit();
    expect(s().editRedoCount).toBe(1);
    const nodesBefore = JSON.stringify(s().rootNode.children.map((c) => c.children.length));
    s().addPvVariation(['E5']); // E5 == ee, occupied: nothing added
    expect(JSON.stringify(s().rootNode.children.map((c) => c.children.length))).toBe(nodesBefore);
    expect(s().editRedoCount).toBe(1); // UI still offers redo
    s().redoEdit();
    // redo should bring the marker back
    expect(s().currentNode.properties?.MA).toEqual(['aa']);
  });

  it('for a line already in the tree', () => {
    s().loadGame(parseSgf('(;GM[1]SZ[9];B[dd];W[ee])'));
    s().navigateStart();
    s().toggleBoardPointMarkup(0, 0);
    s().undoEdit();
    expect(s().editRedoCount).toBe(1);
    s().addPvVariation(['D6']); // == existing B[dd]
    expect(s().rootNode.children.length).toBe(1);
    expect(s().editRedoCount).toBe(1);
  });
});



describe('pin identity', () => {
  beforeEach(() => { s().resetGame(); useGameStore.setState({ notification: null }); });
  it('can pin a different node that moved into a pinned node\'s old slot', () => {
    s().loadGame(parseSgf('(;GM[1]SZ[9];B[dd](;W[ee])(;W[ff]))'));
    const [e, f] = s().rootNode.children[0]!.children;
    s().jumpToNode(f!);                 // path [0,1] -> id pin_2_0-1
    s().pinCurrentVariation();
    s().shiftCurrentVariation('left');  // f -> [0,0], e -> [0,1] (pin repathed)
    s().jumpToNode(e!);                 // path [0,1] -> same id pin_2_0-1
    s().pinCurrentVariation();          // "This line is already pinned."
    expect(s().pinnedVariations.length).toBe(2); 
  });
});



describe('pin made after an edit, then undo', () => {
  beforeEach(() => { s().resetGame(); useGameStore.setState({ notification: null }); });
  it('keeps the game id pins are stored under', () => {
    s().loadGame(parseSgf('(;GM[1]SZ[9];B[dd](;W[ee])(;W[ff]))'));
    s().navigateEnd();
    s().toggleBoardPointMarkup(0, 0);  // some edit
    s().pinCurrentVariation();         // assigns root WKID, no history
    expect(s().rootNode.properties?.WKID?.[0]).toBeTruthy();
    s().undoEdit();                    // undo the marker only
    expect(s().pinnedVariations.length).toBe(1);           // pin still shown
    expect(s().rootNode.properties?.WKID?.[0]).toBeTruthy(); 
  });
});
