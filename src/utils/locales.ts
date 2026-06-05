import type { AppLocaleId } from '../types';

export type AppLocaleOption = {
  value: AppLocaleId;
  label: string;
  nativeLabel: string;
  htmlLang: string;
};

export const APP_LOCALE_OPTIONS: AppLocaleOption[] = [
  { value: 'en', label: 'English', nativeLabel: 'English', htmlLang: 'en' },
  { value: 'zh', label: 'Chinese', nativeLabel: '中文', htmlLang: 'zh-Hans' },
  { value: 'ko', label: 'Korean', nativeLabel: '한국어', htmlLang: 'ko' },
  { value: 'ja', label: 'Japanese', nativeLabel: '日本語', htmlLang: 'ja' },
  { value: 'fr', label: 'French', nativeLabel: 'Français', htmlLang: 'fr' },
  { value: 'de', label: 'German', nativeLabel: 'Deutsch', htmlLang: 'de' },
  { value: 'es', label: 'Spanish', nativeLabel: 'Español', htmlLang: 'es' },
  { value: 'it', label: 'Italian', nativeLabel: 'Italiano', htmlLang: 'it' },
];

const APP_LOCALE_IDS = new Set<AppLocaleId>(APP_LOCALE_OPTIONS.map((locale) => locale.value));

export function isAppLocaleId(value: unknown): value is AppLocaleId {
  return typeof value === 'string' && APP_LOCALE_IDS.has(value as AppLocaleId);
}

export function getAppLocaleOption(value: AppLocaleId): AppLocaleOption {
  return APP_LOCALE_OPTIONS.find((locale) => locale.value === value) ?? APP_LOCALE_OPTIONS[0]!;
}

export function getAppLocaleHtmlLang(value: AppLocaleId): string {
  return getAppLocaleOption(value).htmlLang;
}

export function getAppLocaleShortLabel(value: AppLocaleId): string {
  return getAppLocaleOption(value).value.toUpperCase();
}
