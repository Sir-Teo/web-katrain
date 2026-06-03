import { describe, expect, it } from 'vitest';
import { summarizeAnalysisCoverage } from '../src/utils/analysisCoverage';
import {
  getFastMctsPanelButtonState,
  getFastReviewButtonState,
} from '../src/utils/fastReviewButtonState';
import type { GameNode } from '../src/types';

const analyzedNode = (): Pick<GameNode, 'analysis'> => ({
  analysis: {} as NonNullable<GameNode['analysis']>,
});

const unanalyzedNode = (): Pick<GameNode, 'analysis'> => ({
  analysis: null,
});

describe('fast review button state', () => {
  it('keeps the command-bar ready state customizable but actionable', () => {
    const state = getFastReviewButtonState({
      isGameAnalysisRunning: false,
      gameProgress: null,
      analysisCoverage: summarizeAnalysisCoverage([analyzedNode(), unanalyzedNode()]),
      readyLabel: 'Fast MCTS',
      readyTitle: 'Run a fast MCTS review of the current line',
    });

    expect(state).toEqual({
      state: 'ready',
      label: 'Fast MCTS',
      title: 'Run a fast MCTS review of the current line',
      disabled: false,
      ariaLabel: 'Run a fast MCTS review of the current line',
    });
  });

  it('marks the panel Fast MCTS action reviewed when the current line is complete', () => {
    const state = getFastMctsPanelButtonState({
      isGameAnalysisRunning: false,
      gameAnalysisType: null,
      gameAnalysisDone: 0,
      gameAnalysisTotal: 0,
      analysisCoverage: summarizeAnalysisCoverage([analyzedNode(), analyzedNode()]),
    });

    expect(state).toEqual({
      state: 'complete',
      label: 'Reviewed',
      title: 'Current line is fully analyzed (2/2). Use Re-analyze game for a deeper pass.',
      disabled: true,
      ariaLabel: 'Current line fully analyzed',
    });
  });

  it('turns the panel Fast MCTS action into stop while fast review is running', () => {
    const state = getFastMctsPanelButtonState({
      isGameAnalysisRunning: true,
      gameAnalysisType: 'fast',
      gameAnalysisDone: 3,
      gameAnalysisTotal: 8,
      analysisCoverage: summarizeAnalysisCoverage([unanalyzedNode(), unanalyzedNode()]),
    });

    expect(state).toEqual({
      state: 'running',
      label: 'Stop fast (3/8)',
      title: 'Stop fast MCTS review',
      disabled: false,
      ariaLabel: 'Stop fast MCTS review',
    });
  });

  it('blocks panel Fast MCTS while a different analysis job is active', () => {
    const state = getFastMctsPanelButtonState({
      isGameAnalysisRunning: true,
      gameAnalysisType: 'quick',
      gameAnalysisDone: 1,
      gameAnalysisTotal: 4,
      analysisCoverage: summarizeAnalysisCoverage([unanalyzedNode(), unanalyzedNode()]),
    });

    expect(state).toEqual({
      state: 'blocked',
      label: 'Fast MCTS',
      title: 'Stop quick analysis before starting Fast MCTS.',
      disabled: true,
      ariaLabel: 'Fast MCTS unavailable while quick analysis is running',
    });
  });
});
