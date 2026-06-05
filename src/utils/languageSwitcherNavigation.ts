export type LanguageSwitcherNavigationKey = 'ArrowDown' | 'ArrowUp' | 'Home' | 'End';

export function isLanguageSwitcherNavigationKey(key: string): key is LanguageSwitcherNavigationKey {
  return key === 'ArrowDown' || key === 'ArrowUp' || key === 'Home' || key === 'End';
}

export function getNextLanguageOptionIndex(
  key: LanguageSwitcherNavigationKey,
  currentIndex: number,
  optionCount: number
): number {
  if (optionCount <= 0) return -1;

  const normalizedIndex = currentIndex >= 0 && currentIndex < optionCount ? currentIndex : 0;

  if (key === 'Home') return 0;
  if (key === 'End') return optionCount - 1;
  if (key === 'ArrowUp') return (normalizedIndex - 1 + optionCount) % optionCount;
  return (normalizedIndex + 1) % optionCount;
}
