import type { AppLocaleId } from '../types';

export type AppLocaleOption = {
  value: AppLocaleId;
  label: string;
  nativeLabel: string;
  htmlLang: string;
  shortLabel?: string; // Compact code shown in the switcher chip; defaults to value.toUpperCase().
};

export const APP_LOCALE_OPTIONS: AppLocaleOption[] = [
  { value: 'en', label: 'English', nativeLabel: 'English', htmlLang: 'en' },
  { value: 'zh', label: 'Chinese (Simplified)', nativeLabel: '简体中文', htmlLang: 'zh-Hans', shortLabel: '简' },
  { value: 'zh-TW', label: 'Chinese (Traditional)', nativeLabel: '繁體中文', htmlLang: 'zh-Hant', shortLabel: '繁' },
  { value: 'ko', label: 'Korean', nativeLabel: '한국어', htmlLang: 'ko' },
  { value: 'ja', label: 'Japanese', nativeLabel: '日本語', htmlLang: 'ja' },
  { value: 'fr', label: 'French', nativeLabel: 'Français', htmlLang: 'fr' },
  { value: 'de', label: 'German', nativeLabel: 'Deutsch', htmlLang: 'de' },
  { value: 'es', label: 'Spanish', nativeLabel: 'Español', htmlLang: 'es' },
  { value: 'it', label: 'Italian', nativeLabel: 'Italiano', htmlLang: 'it' },
  { value: 'uk', label: 'Ukrainian', nativeLabel: 'Українська', htmlLang: 'uk' },
  { value: 'ru', label: 'Russian', nativeLabel: 'Русский', htmlLang: 'ru' },
  { value: 'pt', label: 'Portuguese', nativeLabel: 'Português', htmlLang: 'pt' },
  { value: 'vi', label: 'Vietnamese', nativeLabel: 'Tiếng Việt', htmlLang: 'vi' },
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

/**
 * Locales the interface is actually translated into. Only English so far;
 * add a locale here when its translation ships.
 */
export const TRANSLATED_APP_LOCALES: ReadonlySet<AppLocaleId> = new Set<AppLocaleId>(['en']);

/**
 * The `lang` for the page: the language its text is really in.
 *
 * Choosing French set <html lang="fr"> over an interface that stayed in
 * English, so screen readers read English with French pronunciation, and
 * browsers offered to translate "from French" and picked French hyphenation
 * and spell-check. The choice is kept as a preference for when a translation
 * exists; until then the page stays marked as English.
 */
export function getDocumentHtmlLang(value: AppLocaleId): string {
  return TRANSLATED_APP_LOCALES.has(value) ? getAppLocaleHtmlLang(value) : 'en';
}

export function getAppLocaleShortLabel(value: AppLocaleId): string {
  const option = getAppLocaleOption(value);
  return option.shortLabel ?? option.value.toUpperCase();
}

function appLocaleFromLanguageTag(languageTag: unknown): AppLocaleId | null {
  if (typeof languageTag !== 'string') return null;
  const normalized = languageTag.trim().toLowerCase().replace('_', '-');
  if (!normalized) return null;
  // Traditional-Chinese tags (zh-TW / zh-HK / zh-Hant) resolve to the Traditional locale;
  // any other zh-* falls through to Simplified below.
  if (/^zh-(tw|hk|mo|hant)/.test(normalized)) return 'zh-TW';
  const [baseLanguage] = normalized.split('-');
  if (!baseLanguage) return null;
  return isAppLocaleId(baseLanguage) ? baseLanguage : null;
}

export function getPreferredAppLocaleId(languageTags?: readonly unknown[]): AppLocaleId {
  const candidates = languageTags ?? (
    typeof navigator === 'undefined'
      ? []
      : [...(navigator.languages ?? []), navigator.language]
  );

  for (const languageTag of candidates) {
    const locale = appLocaleFromLanguageTag(languageTag);
    if (locale) return locale;
  }

  return 'en';
}
