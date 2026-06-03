import type { AnalysisCoverageSummary } from './analysisCoverage';

type GameProgressButtonSummary = {
  buttonLabel?: string;
  title?: string;
} | null;

export interface FastReviewButtonState {
  state: 'ready' | 'running' | 'complete';
  label: string;
  title: string;
  disabled: boolean;
  ariaLabel: string;
}

export function getFastReviewButtonState({
  isGameAnalysisRunning,
  gameProgress,
  analysisCoverage,
  readyLabel = 'Fast review',
  readyTitle = 'Run a fast MCTS review of the game',
}: {
  isGameAnalysisRunning: boolean;
  gameProgress: GameProgressButtonSummary;
  analysisCoverage: AnalysisCoverageSummary;
  readyLabel?: string;
  readyTitle?: string;
}): FastReviewButtonState {
  if (isGameAnalysisRunning) {
    const title = gameProgress?.title ?? 'Stop game analysis';
    return {
      state: 'running',
      label: `Stop ${gameProgress?.buttonLabel ?? ''}`.trim() || 'Stop',
      title,
      disabled: false,
      ariaLabel: title.toLowerCase().startsWith('stop ') ? title : 'Stop game analysis',
    };
  }

  if (analysisCoverage.total > 1 && analysisCoverage.tone === 'complete') {
    return {
      state: 'complete',
      label: 'Reviewed',
      title: `Current line is fully analyzed (${analysisCoverage.valueLabel}). Use Re-analyze game for a deeper pass.`,
      disabled: true,
      ariaLabel: 'Current line fully analyzed',
    };
  }

  return {
    state: 'ready',
    label: readyLabel,
    title: readyTitle,
    disabled: false,
    ariaLabel: readyTitle,
  };
}

export type FastMctsPanelButtonState = Omit<FastReviewButtonState, 'state'> & {
  state: FastReviewButtonState['state'] | 'blocked';
};

export function getFastMctsPanelButtonState({
  isGameAnalysisRunning,
  gameAnalysisType,
  gameAnalysisDone,
  gameAnalysisTotal,
  analysisCoverage,
}: {
  isGameAnalysisRunning: boolean;
  gameAnalysisType: string | null;
  gameAnalysisDone: number;
  gameAnalysisTotal: number;
  analysisCoverage: AnalysisCoverageSummary;
}): FastMctsPanelButtonState {
  const isFastReviewRunning = isGameAnalysisRunning && gameAnalysisType === 'fast';
  if (isGameAnalysisRunning && !isFastReviewRunning) {
    return {
      state: 'blocked',
      label: 'Fast MCTS',
      title: `Stop ${gameAnalysisType ?? 'current'} analysis before starting Fast MCTS.`,
      disabled: true,
      ariaLabel: `Fast MCTS unavailable while ${gameAnalysisType ?? 'current'} analysis is running`,
    };
  }

  return getFastReviewButtonState({
    isGameAnalysisRunning: isFastReviewRunning,
    gameProgress: {
      buttonLabel: gameAnalysisTotal > 0 ? `fast (${gameAnalysisDone}/${gameAnalysisTotal})` : 'fast',
      title: 'Stop fast MCTS review',
    },
    analysisCoverage,
    readyLabel: 'Fast MCTS',
    readyTitle: 'Run a fast MCTS review of the current line',
  });
}
