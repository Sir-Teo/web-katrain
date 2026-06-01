export type GraphKeyboardNavigationKey = 'ArrowLeft' | 'ArrowRight' | 'Home' | 'End' | 'Escape';

export function isGraphKeyboardNavigationKey(key: string): key is GraphKeyboardNavigationKey {
  return key === 'ArrowLeft' || key === 'ArrowRight' || key === 'Home' || key === 'End' || key === 'Escape';
}

export function nextGraphKeyboardIndex(args: {
  key: GraphKeyboardNavigationKey;
  currentIndex: number | null;
  highlightedIndex: number;
  count: number;
}): number | null {
  const { key, currentIndex, highlightedIndex, count } = args;
  if (key === 'Escape') return null;
  if (count <= 0) return null;

  const max = count - 1;
  const start = Math.min(Math.max(0, currentIndex ?? highlightedIndex), max);

  switch (key) {
    case 'ArrowLeft':
      return Math.max(0, start - 1);
    case 'ArrowRight':
      return Math.min(max, start + 1);
    case 'Home':
      return 0;
    case 'End':
      return max;
  }
}
