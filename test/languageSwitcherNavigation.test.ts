import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  getNextLanguageOptionIndex,
  isLanguageSwitcherNavigationKey,
} from '../src/utils/languageSwitcherNavigation';

describe('language switcher keyboard navigation', () => {
  it('cycles through language options with arrow keys', () => {
    expect(getNextLanguageOptionIndex('ArrowDown', 0, 8)).toBe(1);
    expect(getNextLanguageOptionIndex('ArrowDown', 7, 8)).toBe(0);
    expect(getNextLanguageOptionIndex('ArrowUp', 0, 8)).toBe(7);
    expect(getNextLanguageOptionIndex('ArrowUp', 4, 8)).toBe(3);
  });

  it('jumps to list ends and handles invalid indexes defensively', () => {
    expect(getNextLanguageOptionIndex('Home', 5, 8)).toBe(0);
    expect(getNextLanguageOptionIndex('End', 0, 8)).toBe(7);
    expect(getNextLanguageOptionIndex('ArrowDown', -1, 8)).toBe(1);
    expect(getNextLanguageOptionIndex('ArrowUp', 99, 8)).toBe(7);
    expect(getNextLanguageOptionIndex('ArrowDown', 0, 0)).toBe(-1);
  });

  it('recognizes only supported listbox navigation keys', () => {
    expect(isLanguageSwitcherNavigationKey('ArrowDown')).toBe(true);
    expect(isLanguageSwitcherNavigationKey('Home')).toBe(true);
    expect(isLanguageSwitcherNavigationKey('Enter')).toBe(false);
    expect(isLanguageSwitcherNavigationKey('Escape')).toBe(false);
  });

  it('announces each language name in its own language', () => {
    const source = readFileSync('src/components/layout/LanguageSwitcher.tsx', 'utf8');

    const start = source.indexOf('data-language-option={locale.value}');
    const end = source.indexOf('</button>', start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    // Guard the slice: an empty string would pass nothing meaningfully.
    const option = source.slice(start, end);
    expect(option.length).toBeGreaterThan(200);

    // These options carry no aria-label, so their accessible name is the
    // visible text. Without a lang, a screen reader reads the native names
    // with the page language's phonetics.
    expect(option).toContain('<span lang={locale.htmlLang}');
    expect(option).toContain('{locale.nativeLabel}');
    expect(option).toContain('<span lang="en"');

    // The native name and the short code are both in the target language;
    // only the English name is English.
    const nativeSpan = option.slice(option.indexOf('{locale.nativeLabel}') - 120, option.indexOf('{locale.nativeLabel}'));
    expect(nativeSpan).toContain('lang={locale.htmlLang}');
  });
});
