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
      'en', 'zh', 'zh-TW', 'ko', 'ja', 'fr', 'de', 'es', 'it', 'uk', 'ru', 'pt', 'vi',
    ]);
    expect(getAppLocaleHtmlLang('zh')).toBe('zh-Hans');
    expect(getAppLocaleHtmlLang('zh-TW')).toBe('zh-Hant');
    expect(getAppLocaleHtmlLang('ja')).toBe('ja');
    expect(getAppLocaleShortLabel('de')).toBe('DE');
    expect(getAppLocaleOption('it').nativeLabel).toBe('Italiano');
    expect(getAppLocaleOption('pt').nativeLabel).toBe('Português');
    expect(getAppLocaleOption('vi').nativeLabel).toBe('Tiếng Việt');
  });

  it('validates persisted locale ids defensively', () => {
    expect(isAppLocaleId('en')).toBe(true);
    expect(isAppLocaleId('it')).toBe(true);
    expect(isAppLocaleId('pt')).toBe(true);
    expect(isAppLocaleId('nl')).toBe(false); // Dutch is not a supported locale
    expect(isAppLocaleId(null)).toBe(false);
    expect(getAppLocaleOption('en').nativeLabel).toBe('English');
  });

  it('chooses the first supported browser language before falling back to English', () => {
    expect(getPreferredAppLocaleId(['fr-CA', 'en-US'])).toBe('fr');
    // pt is supported now, so it wins ahead of the later zh-TW tag.
    expect(getPreferredAppLocaleId(['pt-BR', 'zh-TW'])).toBe('pt');
    expect(getPreferredAppLocaleId(['zh-CN'])).toBe('zh');
    // Traditional-Chinese browser tags resolve to the Traditional locale.
    expect(getPreferredAppLocaleId(['nl-NL', 'zh-TW'])).toBe('zh-TW'); // skips unsupported Dutch
    expect(getPreferredAppLocaleId(['de_DE'])).toBe('de');
    expect(getPreferredAppLocaleId(['', null, 'nl-NL'])).toBe('en'); // no supported lang → English
  });
});
