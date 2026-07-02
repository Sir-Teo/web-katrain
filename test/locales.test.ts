import { describe, expect, it } from 'vitest';
import {
  APP_LOCALE_OPTIONS,
  getAppLocaleHtmlLang,
  getAppLocaleOption,
  getAppLocaleShortLabel,
  getPreferredAppLocaleId,
  isAppLocaleId,
} from '../src/utils/locales';

describe('app locales', () => {
  it('matches Kaya locale coverage with browser language metadata', () => {
    expect(APP_LOCALE_OPTIONS.map((locale) => locale.value)).toEqual([
      'en', 'zh', 'zh-TW', 'ko', 'ja', 'fr', 'de', 'es', 'it', 'uk', 'ru',
    ]);
    expect(getAppLocaleHtmlLang('zh')).toBe('zh-Hans');
    expect(getAppLocaleHtmlLang('zh-TW')).toBe('zh-Hant');
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

  it('chooses the first supported browser language before falling back to English', () => {
    expect(getPreferredAppLocaleId(['fr-CA', 'en-US'])).toBe('fr');
    // Traditional-Chinese browser tags now resolve to the Traditional locale.
    expect(getPreferredAppLocaleId(['pt-BR', 'zh-TW'])).toBe('zh-TW');
    expect(getPreferredAppLocaleId(['zh-CN'])).toBe('zh');
    expect(getPreferredAppLocaleId(['de_DE'])).toBe('de');
    expect(getPreferredAppLocaleId(['', null, 'pt-BR'])).toBe('en');
  });
});
