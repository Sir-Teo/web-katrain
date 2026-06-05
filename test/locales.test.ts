import { describe, expect, it } from 'vitest';
import { APP_LOCALE_OPTIONS, getAppLocaleHtmlLang, getAppLocaleOption, getAppLocaleShortLabel, isAppLocaleId } from '../src/utils/locales';

describe('app locales', () => {
  it('matches Kaya locale coverage with browser language metadata', () => {
    expect(APP_LOCALE_OPTIONS.map((locale) => locale.value)).toEqual(['en', 'zh', 'ko', 'ja', 'fr', 'de', 'es', 'it']);
    expect(getAppLocaleHtmlLang('zh')).toBe('zh-Hans');
    expect(getAppLocaleHtmlLang('ja')).toBe('ja');
    expect(getAppLocaleShortLabel('de')).toBe('DE');
    expect(getAppLocaleOption('es').languageLabel).toBe('Idioma');
    expect(getAppLocaleOption('it').selectLanguageLabel).toBe('Seleziona lingua');
  });

  it('validates persisted locale ids defensively', () => {
    expect(isAppLocaleId('en')).toBe(true);
    expect(isAppLocaleId('it')).toBe(true);
    expect(isAppLocaleId('pt')).toBe(false);
    expect(isAppLocaleId(null)).toBe(false);
    expect(getAppLocaleOption('en').nativeLabel).toBe('English');
  });
});
