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
});
