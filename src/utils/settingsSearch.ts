import { type SettingsTabId } from './settingsTabs';
import type { GameSettings } from '../types';

export interface SettingsSearchEntry {
  /** DOM id of the control's label target, used to scroll and focus it. */
  id: string;
  tab: SettingsTabId;
  label: string;
}

/**
 * Every labelled control in the settings modal, with the tab it lives on.
 *
 * The modal only mounts the active tab's panel, so a search box cannot find a
 * control by walking the DOM — it has to know where things are before going
 * there. Generated from the modal's own `<label htmlFor="settings-…">` markup
 * and `data-settings-search-id` markers on composite controls;
 * `settingsSearch.test.ts` re-derives it from the source and fails if the two
 * drift apart, so a control added to the modal cannot quietly go unsearchable.
 */
export const SETTINGS_SEARCH_INDEX: readonly SettingsSearchEntry[] = [
  { id: 'settings-show-coordinates', tab: 'general', label: "Show Coordinates" },
  { id: 'settings-next-move-preview', tab: 'general', label: "Next Move Preview" },
  { id: 'settings-show-move-numbers', tab: 'general', label: "Show Move Numbers" },
  { id: 'settings-show-board-controls', tab: 'general', label: "Show Board Controls" },
  { id: 'settings-fuzzy-stone-placement', tab: 'general', label: "Fuzzy Stone Placement" },
  { id: 'settings-default-board-size', tab: 'general', label: "Default Board Size" },
  { id: 'settings-default-handicap', tab: 'general', label: "Default Handicap" },
  { id: 'settings-app-locale', tab: 'general', label: "Document language metadata" },
  { id: 'settings-ui-theme', tab: 'general', label: "UI Theme" },
  { id: 'settings-board-theme', tab: 'general', label: "Board Theme" },
  { id: 'settings-ui-density', tab: 'general', label: "UI Density" },
  { id: 'settings-sound-enabled', tab: 'general', label: "Sound Effects" },
  { id: 'settings-timer-sound', tab: 'general', label: "Timer Sound" },
  { id: 'settings-main-time', tab: 'general', label: "Main Time (min)" },
  { id: 'settings-byo-length', tab: 'general', label: "Byo Length (sec)" },
  { id: 'settings-byo-periods', tab: 'general', label: "Byo Periods" },
  { id: 'settings-minimal-use', tab: 'general', label: "Minimal Use (sec)" },
  { id: 'settings-gamepad-navigation', tab: 'general', label: "Gamepad Navigation" },
  { id: 'settings-touch-haptics', tab: 'general', label: "Touch Haptics" },
  { id: 'settings-load-sgf-rewind', tab: 'general', label: "Load SGF Rewind" },
  { id: 'settings-load-sgf-fast-analysis', tab: 'general', label: "Load SGF Fast Analysis" },
  { id: 'settings-pv-animation-time', tab: 'general', label: "PV Animation Time (sec)" },
  { id: 'settings-game-rules', tab: 'general', label: "Rules" },
  { id: 'settings-analysis-show-children', tab: 'analysis', label: "Show Children" },
  { id: 'settings-analysis-evaluation-dots', tab: 'analysis', label: "Evaluation Dots" },
  { id: 'settings-analysis-top-moves', tab: 'analysis', label: "Top Moves (Hints)" },
  { id: 'settings-analysis-policy', tab: 'analysis', label: "Move Heatmap" },
  { id: 'settings-analysis-ownership', tab: 'analysis', label: "Ownership (Territory)" },
  { id: 'settings-analysis-evaluation-theme', tab: 'analysis', label: "Evaluation Theme" },
  { id: 'settings-analysis-low-visits-threshold', tab: 'analysis', label: "Low Visits Threshold" },
  { id: 'settings-analysis-primary-label', tab: 'analysis', label: "Primary Label" },
  { id: 'settings-analysis-secondary-label', tab: 'analysis', label: "Secondary Label" },
  { id: 'settings-analysis-policy-heatmap', tab: 'analysis', label: "Heatmap Metric" },
  { id: 'settings-analysis-extra-precision', tab: 'analysis', label: "Extra Precision" },
  { id: 'settings-analysis-show-ai-dots', tab: 'analysis', label: "Show AI Dots" },
  { id: 'settings-analysis-save-sgf-marks', tab: 'analysis', label: "Save SGF marks (X / square)" },
  { id: 'settings-analysis-lock-ai-details', tab: 'analysis', label: "Lock AI details (Play mode)" },
  { id: 'settings-analysis-last-n-eval-dots', tab: 'analysis', label: "Show Last N Eval Dots" },
  { id: 'settings-analysis-mistake-threshold', tab: 'analysis', label: "Mistake Threshold (Points)" },
  { id: 'settings-ai-strategy', tab: 'ai', label: "Strategy" },
  { id: 'settings-ai-rank-kyu', tab: 'ai', label: "Kyu Rank" },
  { id: 'settings-ai-scoreloss-strength', tab: 'ai', label: "Strength (c)" },
  { id: 'settings-ai-jigo-target-score', tab: 'ai', label: "Target Score" },
  { id: 'settings-ai-ownership-max-points-lost', tab: 'ai', label: "Max Pt Lost" },
  { id: 'settings-ai-ownership-settled-weight', tab: 'ai', label: "Settled Wt" },
  { id: 'settings-ai-ownership-opponent-factor', tab: 'ai', label: "Opp Fac" },
  { id: 'settings-ai-ownership-min-visits', tab: 'ai', label: "Min Visits" },
  { id: 'settings-ai-ownership-attach-penalty', tab: 'ai', label: "Attach Pen" },
  { id: 'settings-ai-ownership-tenuki-penalty', tab: 'ai', label: "Tenuki Pen" },
  { id: 'settings-ai-policy-opening-moves', tab: 'ai', label: "Opening Moves" },
  { id: 'settings-ai-weighted-override', tab: 'ai', label: "Override" },
  { id: 'settings-ai-weighted-weaken', tab: 'ai', label: "Weaken" },
  { id: 'settings-ai-weighted-lower', tab: 'ai', label: "Lower" },
  { id: 'settings-ai-pick-override', tab: 'ai', label: "Override" },
  { id: 'settings-ai-pick-n', tab: 'ai', label: "Pick N" },
  { id: 'settings-ai-pick-frac', tab: 'ai', label: "Pick Frac" },
  { id: 'settings-ai-local-override', tab: 'ai', label: "Override" },
  { id: 'settings-ai-local-stddev', tab: 'ai', label: "Stddev" },
  { id: 'settings-ai-local-endgame', tab: 'ai', label: "Endgame" },
  { id: 'settings-ai-local-pick-n', tab: 'ai', label: "Pick N" },
  { id: 'settings-ai-local-pick-frac', tab: 'ai', label: "Pick Frac" },
  { id: 'settings-ai-tenuki-override', tab: 'ai', label: "Override" },
  { id: 'settings-ai-tenuki-stddev', tab: 'ai', label: "Stddev" },
  { id: 'settings-ai-tenuki-endgame', tab: 'ai', label: "Endgame" },
  { id: 'settings-ai-tenuki-pick-n', tab: 'ai', label: "Pick N" },
  { id: 'settings-ai-tenuki-pick-frac', tab: 'ai', label: "Pick Frac" },
  { id: 'settings-ai-edge-override', tab: 'ai', label: "Override" },
  { id: 'settings-ai-edge-threshold', tab: 'ai', label: "Threshold" },
  { id: 'settings-ai-edge-line-weight', tab: 'ai', label: "Line Wt" },
  { id: 'settings-ai-edge-pick-n', tab: 'ai', label: "Pick N" },
  { id: 'settings-ai-edge-pick-frac', tab: 'ai', label: "Pick Frac" },
  { id: 'settings-ai-edge-endgame', tab: 'ai', label: "Endgame" },
  { id: 'settings-human-sl-enabled', tab: 'ai', label: 'Show what a human would play' },
  { id: 'settings-human-sl-profile', tab: 'ai', label: 'Player profile' },
  { id: 'settings-human-sl-bot-style', tab: 'ai', label: 'Opponent plays' },
  { id: 'settings-human-sl-source', tab: 'ai', label: 'Policy overlay shows' },
  { id: 'settings-human-sl-url', tab: 'ai', label: 'Human model URL' },
  { id: 'settings-katago-root-policy-temperature', tab: 'ai', label: 'Root Policy Temperature' },
  { id: 'settings-katago-model-url', tab: 'ai', label: "Model URL" },
  { id: 'settings-katago-backend', tab: 'ai', label: "Backend" },
  { id: 'settings-katago-visits', tab: 'ai', label: "Visits" },
  { id: 'settings-katago-fast-review-depth', tab: 'ai', label: "Fast review depth" },
  { id: 'settings-katago-max-time', tab: 'ai', label: "Max Time (ms)" },
  { id: 'settings-katago-batch-size', tab: 'ai', label: "Batch Size" },
  { id: 'settings-katago-max-children', tab: 'ai', label: "Max Children" },
  { id: 'settings-katago-top-moves', tab: 'ai', label: "Top Moves" },
  { id: 'settings-katago-wide-root-noise', tab: 'ai', label: "Wide Root Noise" },
  { id: 'settings-katago-pv-len', tab: 'ai', label: "PV Len" },
  { id: 'settings-katago-ownership', tab: 'ai', label: "Ownership" },
  { id: 'settings-katago-reuse-tree', tab: 'ai', label: "Reuse Search Tree" },
  { id: 'settings-katago-randomize-symmetry', tab: 'ai', label: "Randomize Symmetry" },
  { id: 'settings-katago-conservative-pass', tab: 'ai', label: "Conservative Pass" },
  { id: 'settings-katago-fill-dame-before-pass', tab: 'ai', label: 'Fill Dame Before Pass' },
];

/** Human-readable tab names, for labelling a result with where it will take you. */
export const SETTINGS_TAB_LABELS: Record<SettingsTabId, string> = {
  general: 'General',
  analysis: 'Analysis',
  ai: 'AI',
  shortcuts: 'Shortcuts',
};

const STRATEGY_SPECIFIC_SETTING_GROUPS: ReadonlyArray<readonly [string, readonly GameSettings['aiStrategy'][]]> = [
  ['settings-ai-rank-', ['rank']],
  ['settings-ai-scoreloss-', ['scoreloss']],
  ['settings-ai-jigo-', ['jigo']],
  ['settings-ai-ownership-', ['simple', 'settle']],
  ['settings-ai-policy-', ['policy']],
  ['settings-ai-weighted-', ['weighted']],
  ['settings-ai-pick-', ['pick']],
  ['settings-ai-local-', ['local']],
  ['settings-ai-tenuki-', ['tenuki']],
  ['settings-ai-edge-', ['influence', 'territory']],
];

/** Keep search results actionable without silently changing the selected AI strategy. */
export function isSettingAvailable(entry: SettingsSearchEntry, aiStrategy: GameSettings['aiStrategy']): boolean {
  const group = STRATEGY_SPECIFIC_SETTING_GROUPS.find(([prefix]) => entry.id.startsWith(prefix));
  return !group || group[1].includes(aiStrategy);
}

const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * Settings matching `query`, best first.
 *
 * Ranking is deliberately blunt — a label that starts with what was typed comes
 * before one that merely contains it — because the list is short and a settings
 * search is a lookup, not a discovery tool. Every term must appear, so "board
 * size" narrows rather than widening to everything about boards.
 */
export function searchSettings(
  query: string,
  index: readonly SettingsSearchEntry[] = SETTINGS_SEARCH_INDEX,
  limit = 8
): SettingsSearchEntry[] {
  const terms = normalize(query).split(' ').filter(Boolean);
  if (terms.length === 0) return [];

  const scored: Array<{ entry: SettingsSearchEntry; score: number }> = [];
  for (const entry of index) {
    const haystack = normalize(`${entry.label} ${SETTINGS_TAB_LABELS[entry.tab]}`);
    if (!terms.every((term) => haystack.includes(term))) continue;
    const label = normalize(entry.label);
    const first = terms[0]!;
    const score = label.startsWith(first) ? 0 : label.includes(` ${first}`) ? 1 : 2;
    scored.push({ entry, score });
  }

  return scored
    .sort((a, b) => a.score - b.score || a.entry.label.localeCompare(b.entry.label))
    .slice(0, limit)
    .map((item) => item.entry);
}

export function searchAvailableSettings(
  query: string,
  aiStrategy: GameSettings['aiStrategy'],
  index: readonly SettingsSearchEntry[] = SETTINGS_SEARCH_INDEX,
  limit = 8
): SettingsSearchEntry[] {
  return searchSettings(query, index.filter((entry) => isSettingAvailable(entry, aiStrategy)), limit);
}
