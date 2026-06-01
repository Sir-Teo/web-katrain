import { readLocalStorage, writeLocalStorage } from './storage';

export const SETTINGS_ACTIVE_TAB_STORAGE_KEY = 'settingsModalActiveTab';
export const SETTINGS_TAB_IDS = ['general', 'analysis', 'ai', 'shortcuts'] as const;

export type SettingsTabId = (typeof SETTINGS_TAB_IDS)[number];

export function isSettingsTabId(value: string | null): value is SettingsTabId {
  return SETTINGS_TAB_IDS.some((id) => id === value);
}

export function getNextSettingsTabId(current: SettingsTabId, key: string): SettingsTabId | null {
  const index = SETTINGS_TAB_IDS.indexOf(current);
  if (index < 0) return null;

  switch (key) {
    case 'ArrowRight':
      return SETTINGS_TAB_IDS[(index + 1) % SETTINGS_TAB_IDS.length]!;
    case 'ArrowLeft':
      return SETTINGS_TAB_IDS[(index - 1 + SETTINGS_TAB_IDS.length) % SETTINGS_TAB_IDS.length]!;
    case 'Home':
      return SETTINGS_TAB_IDS[0]!;
    case 'End':
      return SETTINGS_TAB_IDS[SETTINGS_TAB_IDS.length - 1]!;
    default:
      return null;
  }
}

export function readSettingsActiveTab(fallback: SettingsTabId = 'general'): SettingsTabId {
  const stored = readLocalStorage(SETTINGS_ACTIVE_TAB_STORAGE_KEY);
  return isSettingsTabId(stored) ? stored : fallback;
}

export function saveSettingsActiveTab(tab: SettingsTabId): void {
  writeLocalStorage(SETTINGS_ACTIVE_TAB_STORAGE_KEY, tab);
}
