import { beforeEach, describe, expect, it } from 'vitest';
import { useGameStore } from '../src/store/gameStore';
import { parseSgf } from '../src/utils/sgf';
import type { BoardDrawing } from '../src/types';

const stroke = (): BoardDrawing => ({ kind: 'pen', points: [{ x: 2, y: 2 }, { x: 6, y: 5 }] });
const state = () => useGameStore.getState();

describe('freehand drawing history', () => {
  beforeEach(() => {
    state().resetGame();
    useGameStore.setState({ isAnalysisMode: false, isTeachMode: false });
  });

  it('preserves drawings when undoing and redoing an unrelated marker edit', () => {
    state().addNodeDrawing(stroke());
    state().setEditTool('marker-triangle');
    state().applyEditTool(8, 8);
    state().undoEdit();
    expect(state().currentNode.drawings).toEqual([stroke()]);
    expect(state().currentNode.properties?.TR).toBeUndefined();
    state().redoEdit();
    expect(state().currentNode.drawings).toEqual([stroke()]);
    expect(state().currentNode.properties?.TR).toEqual(['ii']);
  });

  it('makes each complete stroke and clearing the drawings undoable', () => {
    state().addNodeDrawing(stroke());
    state().undoEdit();
    expect(state().currentNode.drawings ?? []).toEqual([]);
    state().redoEdit();
    expect(state().currentNode.drawings).toEqual([stroke()]);
    state().clearNodeDrawings();
    expect(state().currentNode.drawings).toEqual([]);
    state().undoEdit();
    expect(state().currentNode.drawings).toEqual([stroke()]);
    state().redoEdit();
    expect(state().currentNode.drawings).toEqual([]);
  });

  it('does not record empty strokes or clearing an empty board', () => {
    state().addNodeDrawing({ kind: 'pen', points: [{ x: 1, y: 1 }] });
    state().clearNodeDrawings();
    expect(state().editUndoCount).toBe(0);
  });

  it('isolates saved strokes from mutable pointer input and subsequent snapshots', () => {
    const input = stroke();
    state().addNodeDrawing(input);
    input.points[0]!.x = 9;
    expect(state().currentNode.drawings).toEqual([stroke()]);
    state().setEditTool('marker-square');
    state().applyEditTool(8, 8);
    state().currentNode.drawings![0]!.points[0]!.y = 9;
    state().undoEdit();
    expect(state().currentNode.drawings).toEqual([stroke()]);
  });

  it('carries independent drawings when a study branch is copied and pasted', () => {
    state().loadGame(parseSgf('(;GM[1]SZ[9];B[dd](;W[ee];B[ff])(;W[cc]))'));
    state().navigateEnd();
    const source = state().currentNode;
    state().addNodeDrawing(stroke());
    state().copyCurrentBranch();
    source.drawings![0]!.points[0]!.x = 9;
    state().navigateBack();
    state().switchBranch(1);
    state().pasteCopiedBranch();
    expect(state().currentNode.drawings).toEqual([stroke()]);
    expect(state().currentNode.drawings).not.toBe(source.drawings);
    state().undoEdit();
    state().redoEdit();
    expect(state().currentNode.drawings).toEqual([stroke()]);
  });
});
