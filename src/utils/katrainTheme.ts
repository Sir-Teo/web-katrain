export const KATRAIN_EVAL_COLORS_BY_THEME = {
  'theme:normal': [
    [0.447, 0.129, 0.42, 1],
    [0.8, 0, 0, 1],
    [0.9, 0.4, 0.1, 1],
    [0.95, 0.95, 0, 1],
    [0.67, 0.9, 0.18, 1],
    [0.117, 0.588, 0, 1],
  ],
  'theme:red-green-colourblind': [
    [1, 0, 1, 1],
    [1, 0, 0, 1],
    [1, 0.5, 0, 1],
    [1, 1, 0, 1],
    [0, 1, 1, 1],
    [0, 0, 1, 1],
  ],
} as const;

export type KaTrainEvalTheme = keyof typeof KATRAIN_EVAL_COLORS_BY_THEME;

export const DEFAULT_KATRAIN_EVAL_THEME: KaTrainEvalTheme = 'theme:normal';

export function resolveKaTrainEvalTheme(theme: unknown): KaTrainEvalTheme {
  if (typeof theme === 'string' && theme in KATRAIN_EVAL_COLORS_BY_THEME) return theme as KaTrainEvalTheme;
  return DEFAULT_KATRAIN_EVAL_THEME;
}

export function getKaTrainEvalColors(theme: unknown) {
  return KATRAIN_EVAL_COLORS_BY_THEME[resolveKaTrainEvalTheme(theme)];
}

