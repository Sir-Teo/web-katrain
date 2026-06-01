import type { GameRules } from '../types';

export type SgfRootProperties = Record<string, string[] | undefined>;

export type GameInfoDetail = {
  key: 'EV' | 'DT' | 'PC' | 'RE' | 'TM';
  label: string;
  value: string;
};

export type GameInfoLink = {
  href: string;
  sourceKey: GameInfoDetail['key'];
  sourceLabel: string;
};

const detailFieldLabels: Array<{ key: GameInfoDetail['key']; label: string }> = [
  { key: 'EV', label: 'Event' },
  { key: 'DT', label: 'Date' },
  { key: 'PC', label: 'Place' },
  { key: 'RE', label: 'Result' },
  { key: 'TM', label: 'Time' },
];

const HTTP_URL_RE = /https?:\/\/[^\s<>"']+/i;
const TRAILING_URL_PUNCTUATION_RE = /[\]),.;:!?]+$/;

export const readRootInfoValue = (rootProps: SgfRootProperties, key: string): string =>
  rootProps[key]?.[0]?.trim() ?? '';

export const formatGameInfoPlayer = (name: string, rank: string, fallback: string): string => {
  const displayName = name.trim() || fallback;
  const displayRank = rank.trim();
  return displayRank ? `${displayName} (${displayRank})` : displayName;
};

export const formatRulesLabel = (rules: GameRules): string => {
  switch (rules) {
    case 'chinese':
      return 'Chinese';
    case 'korean':
      return 'Korean';
    case 'japanese':
    default:
      return 'Japanese';
  }
};

export const formatKomiLabel = (komi: number): string =>
  Number.isFinite(komi) ? String(Number(komi.toFixed(2))) : '6.5';

export const getVisibleGameInfoDetails = (rootProps: SgfRootProperties): GameInfoDetail[] =>
  detailFieldLabels.flatMap(({ key, label }) => {
    const value = readRootInfoValue(rootProps, key);
    return value ? [{ key, label, value }] : [];
  });

export const getFirstGameInfoLink = (rootProps: SgfRootProperties): GameInfoLink | null => {
  for (const detail of getVisibleGameInfoDetails(rootProps)) {
    const match = detail.value.match(HTTP_URL_RE);
    const rawHref = match?.[0]?.replace(TRAILING_URL_PUNCTUATION_RE, '');
    if (!rawHref) continue;

    try {
      const parsed = new URL(rawHref);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') continue;
      return {
        href: parsed.href,
        sourceKey: detail.key,
        sourceLabel: detail.label,
      };
    } catch {
      // Ignore malformed metadata links and keep rendering the plain text value.
    }
  }

  return null;
};

export const hasGameInfoMetadata = (rootProps: SgfRootProperties): boolean =>
  Boolean(
    readRootInfoValue(rootProps, 'GN') ||
      readRootInfoValue(rootProps, 'PB') ||
      readRootInfoValue(rootProps, 'PW') ||
      readRootInfoValue(rootProps, 'BR') ||
      readRootInfoValue(rootProps, 'WR') ||
      Number.parseInt(readRootInfoValue(rootProps, 'HA'), 10) > 0 ||
      getVisibleGameInfoDetails(rootProps).length > 0
  );
