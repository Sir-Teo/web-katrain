import { readLocalStorage, writeLocalStorage } from './storage';

export const SETTINGS_ACTIVE_TAB_STORAGE_KEY = 'settingsModalActiveTab';
export const SETTINGS_TAB_IDS = ['general', 'analysis', 'ai', 'shortcuts'] as const;

export type SettingsTabId = (typeof SETTINGS_TAB_IDS)[number];

export function isSettingsTabId(value: string | null): value is SettingsTabId {
  return SETTINGS_TAB_IDS.some((id) => id === value);
}

export function readSettingsActiveTab(fallback: SettingsTabId = 'general'): SettingsTabId {
  const stored = readLocalStorage(SETTINGS_ACTIVE_TAB_STORAGE_KEY);
  return isSettingsTabId(stored) ? stored : fallback;
}

export function saveSettingsActiveTab(tab: SettingsTabId): void {
  writeLocalStorage(SETTINGS_ACTIVE_TAB_STORAGE_KEY, tab);
}
