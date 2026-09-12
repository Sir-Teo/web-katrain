import { beforeEach, describe, expect, it } from 'vitest';
import { useGameStore } from '../src/store/gameStore';
import { KATAGO_SMALL_MODEL_PATH } from '../src/engine/katago/modelDefaults';
import type { AnalysisResult, GameNode } from '../src/types';

const state = () => useGameStore.getState();
const evaluation = (): AnalysisResult => ({
  rootWinRate: 0.8, rootScoreLead: 12, rootVisits: 100, moves: [],
  territory: Array.from({ length: 19 }, () => Array(19).fill(0)),
});

describe('undo respects the analysis context', () => {
  beforeEach(() => {
    state().resetGame();
    state().updateSettings({ katagoModelUrl: KATAGO_SMALL_MODEL_PATH, gameRules: 'japanese', katagoVisits: 16 });
    useGameStore.setState({ isAnalysisMode: false, isTeachMode: false });
    state().rootNode.analysis = evaluation();
    state().rootNode.analysisVisitsRequested = 100;
    state().setEditTool('marker-triangle');
    state().applyEditTool(3, 3);
  });

  it('does not resurrect an old model evaluation after model selection changes', () => {
    const model = 'models/stronger.bin.gz';
    state().updateSettings({ katagoModelUrl: model });
    state().undoEdit();
    expect(state().settings.katagoModelUrl).toBe(model);
    expect(state().currentNode.analysis).toBeNull();
    expect(state().currentNode.analysisVisitsRequested).toBe(0);
    expect(state().analysisData).toBeNull();
    expect(state().analysisCacheSize).toBe(0);
    state().redoEdit();
    expect(state().currentNode.analysis).toBeNull();
    expect(state().currentNode.properties?.TR).toEqual(['dd']);
  });

  it('keeps explicitly cleared analysis out of undo snapshots', () => {
    state().clearAnalysisCache();
    state().undoEdit();
    expect(state().currentNode.analysis).toBeNull();
    expect(state().analysisCacheSize).toBe(0);
  });

  it('retains compatible analysis when only annotations are undone', () => {
    state().undoEdit();
    expect(state().analysisData?.rootScoreLead).toBe(12);
    expect(state().analysisCacheSize).toBe(1);
  });

  it('restores the actual rules along with SGF metadata, preserving other preferences', () => {
    state().updateSettings({ gameRules: 'aga' });
    state().updateSettings({ showCoordinates: false });
    state().undoEdit();
    expect(state().settings.gameRules).toBe('japanese');
    expect(state().rootNode.properties?.RU).toEqual(['Japanese']);
    expect(state().settings.showCoordinates).toBe(false);
    expect(state().analysisData).toBeNull();
    state().redoEdit();
    expect(state().settings.gameRules).toBe('aga');
    expect(state().rootNode.properties?.RU).toEqual(['AGA']);
  });

  it('invalidates analysis on a deep study tree without overflowing the stack', () => {
    const root = state().rootNode;
    let cursor = root;
    for (let i = 0; i < 12_000; i++) {
      const child: GameNode = {
        id: `study-${i}`, parent: cursor, children: [], move: null,
        gameState: root.gameState, analysis: root.analysis, analysisVisitsRequested: 100,
      };
      cursor.children.push(child);
      cursor = child;
    }
    state().updateSettings({ katagoVisits: 250 });
    expect(root.analysis).toBeNull();
    expect(cursor.analysis).toBeNull();
    expect(cursor.analysisVisitsRequested).toBe(0);
  });
});
