import type { UiThemeId } from '../types';

export const UI_THEME_OPTIONS: Array<{ value: UiThemeId; label: string; description: string }> = [
  {
    value: 'noir',
    label: 'Noir',
    description: 'Deep slate with emerald accents.',
  },
  {
    value: 'kaya',
    label: 'Kaya',
    description: 'Warm wood tones with amber accents.',
  },
  {
    value: 'studio',
    label: 'Studio',
    description: 'Cool graphite with sky accents.',
  },
];
