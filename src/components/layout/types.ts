import { readLocalStorage, writeLocalStorage } from '../../utils/storage';

export type UiMode = 'play' | 'analyze';

export type AnalysisControlsState = {
  analysisShowChildren: boolean;
  analysisShowEval: boolean;
  analysisShowHints: boolean;
  analysisShowPolicy: boolean;
  analysisShowOwnership: boolean;
};

export type GraphOptions = { score: boolean; winrate: boolean };
export type StatsOptions = { score: boolean; winrate: boolean; points: boolean };
export type NotesOptions = { info: boolean; infoDetails: boolean; notes: boolean };

export type UiState = {
  mode: UiMode;
  shapeCoachEnabled: boolean;
  analysisControls: Record<UiMode, AnalysisControlsState>;
  panels: Record<
    UiMode,
    {
      treeOpen: boolean;
      infoOpen: boolean;
      analysisOpen: boolean;
      candidatesOpen: boolean;
      graphOpen: boolean;
      graph: GraphOptions;
      statsOpen: boolean;
      stats: StatsOptions;
      notesOpen: boolean;
      notes: NotesOptions;
    }
  >;
};

export const UI_STATE_KEY = 'web-katrain:ui_state:v1';
export const GHOST_ALPHA = 0.6;
export const STONE_SIZE = 0.505;

export function defaultUiState(): UiState {
  return {
    mode: 'play',
    shapeCoachEnabled: true,
    analysisControls: {
      play: {
        analysisShowChildren: true,
        analysisShowEval: false,
        analysisShowHints: false,
        analysisShowPolicy: false,
        analysisShowOwnership: false,
      },
      analyze: {
        analysisShowChildren: true,
        analysisShowEval: true,
        analysisShowHints: true,
        analysisShowPolicy: false,
        analysisShowOwnership: true,
      },
    },
    panels: {
      play: {
        treeOpen: true,
        infoOpen: true,
        analysisOpen: true,
        candidatesOpen: false,
        graphOpen: false,
        graph: { score: true, winrate: false },
        statsOpen: true,
        stats: { score: true, winrate: true, points: true },
        notesOpen: true,
        notes: { info: false, infoDetails: false, notes: true },
      },
      analyze: {
        treeOpen: true,
        infoOpen: true,
        analysisOpen: true,
        candidatesOpen: true,
        graphOpen: false,
        graph: { score: true, winrate: true },
        statsOpen: true,
        stats: { score: true, winrate: true, points: true },
        notesOpen: true,
        notes: { info: false, infoDetails: true, notes: true },
      },
    },
  };
}

export function loadUiState(): UiState {
  try {
    const raw = readLocalStorage(UI_STATE_KEY);
    if (!raw) return defaultUiState();
    const parsed = JSON.parse(raw) as Partial<UiState> | null;
    if (!parsed || typeof parsed !== 'object') return defaultUiState();

    const d = defaultUiState();
    const mode: UiMode = parsed.mode === 'analyze' ? 'analyze' : 'play';
    const shapeCoachEnabled =
      typeof parsed.shapeCoachEnabled === 'boolean' ? parsed.shapeCoachEnabled : d.shapeCoachEnabled;
    const analysisControls = {
      play: { ...d.analysisControls.play, ...(parsed.analysisControls?.play ?? {}) },
      analyze: { ...d.analysisControls.analyze, ...(parsed.analysisControls?.analyze ?? {}) },
    };

    const mergePanel = (m: UiMode): UiState['panels'][UiMode] => {
      const src = parsed.panels?.[m];
      const fallback = d.panels[m];
      return {
        treeOpen: typeof src?.treeOpen === 'boolean' ? src.treeOpen : fallback.treeOpen,
        infoOpen: typeof src?.infoOpen === 'boolean' ? src.infoOpen : fallback.infoOpen,
        analysisOpen: typeof src?.analysisOpen === 'boolean' ? src.analysisOpen : fallback.analysisOpen,
        candidatesOpen: typeof src?.candidatesOpen === 'boolean' ? src.candidatesOpen : fallback.candidatesOpen,
        graphOpen: typeof src?.graphOpen === 'boolean' ? src.graphOpen : fallback.graphOpen,
        graph: { ...fallback.graph, ...(src?.graph ?? {}) },
        statsOpen: typeof src?.statsOpen === 'boolean' ? src.statsOpen : fallback.statsOpen,
        stats: { ...fallback.stats, ...(src?.stats ?? {}) },
        notesOpen: typeof src?.notesOpen === 'boolean' ? src.notesOpen : fallback.notesOpen,
        notes: { ...fallback.notes, ...(src?.notes ?? {}) },
      };
    };

    const panels = {
      play: mergePanel('play'),
      analyze: mergePanel('analyze'),
    };
    return { mode, shapeCoachEnabled, analysisControls, panels };
  } catch {
    return defaultUiState();
  }
}

export function saveUiState(state: UiState): void {
  writeLocalStorage(UI_STATE_KEY, JSON.stringify(state));
}
