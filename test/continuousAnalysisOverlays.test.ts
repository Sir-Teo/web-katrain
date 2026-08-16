import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useGameStore } from '../src/store/gameStore';

const overlayKeys = [
  'analysisShowChildren',
  'analysisShowEval',
  'analysisShowHints',
  'analysisShowPolicy',
  'analysisShowOwnership',
] as const;

const setOverlays = (values: Partial<Record<(typeof overlayKeys)[number], boolean>>) => {
  useGameStore.setState((state) => ({
    settings: { ...state.settings, ...values },
  }));
};

const readOverlays = () => {
  const { settings } = useGameStore.getState();
  return Object.fromEntries(overlayKeys.map((key) => [key, settings[key]]));
};

describe('turning on continuous analysis', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useGameStore.setState({ isContinuousAnalysis: false, isAnalysisMode: false, notification: null });
  });

  afterEach(() => {
    useGameStore.setState({ isContinuousAnalysis: false, isAnalysisMode: false, notification: null });
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('keeps the overlay setup the user already chose', () => {
    setOverlays({
      analysisShowChildren: true,
      analysisShowEval: true,
      analysisShowHints: false,
      analysisShowPolicy: false,
      analysisShowOwnership: true,
    });

    useGameStore.getState().toggleContinuousAnalysis(true);

    expect(readOverlays()).toEqual({
      analysisShowChildren: true,
      analysisShowEval: true,
      analysisShowHints: false,
      analysisShowPolicy: false,
      analysisShowOwnership: true,
    });
  });

  it('falls back to top move hints when no overlay would be drawn', () => {
    setOverlays({
      analysisShowChildren: false,
      analysisShowEval: false,
      analysisShowHints: false,
      analysisShowPolicy: false,
      analysisShowOwnership: false,
    });

    useGameStore.getState().toggleContinuousAnalysis(true);

    expect(readOverlays()).toEqual({
      analysisShowChildren: false,
      analysisShowEval: false,
      analysisShowHints: true,
      analysisShowPolicy: false,
      analysisShowOwnership: false,
    });
  });

  it('turns analysis mode on so the overlays it enables can draw', () => {
    useGameStore.getState().toggleContinuousAnalysis(true);

    expect(useGameStore.getState().isAnalysisMode).toBe(true);
    expect(useGameStore.getState().isContinuousAnalysis).toBe(true);
  });
});
