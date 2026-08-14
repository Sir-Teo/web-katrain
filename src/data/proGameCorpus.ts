import type { PreloadedGame } from './preloadedGames';

/**
 * Large public-domain pro-game corpus powering the Pro Game Database browser.
 *
 * These are classic historical game records (Edo-period and 19th-century
 * Japanese games from the Shusaku and Dosaku collections) that are in the
 * public domain. They live in a dedicated folder — separate from
 * `preloadedGames` — because, unlike the small curated set, they must NOT be
 * auto-seeded into the user's IndexedDB library. This module is only pulled
 * into the lazily-loaded Pro Game Database chunk, so it never affects startup.
 *
 * To grow the database, drop more `.sgf` files anywhere under `./pro-sgf/`.
 * No code changes are required.
 */
const modules = import.meta.glob('./pro-sgf/**/*.sgf', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const readProp = (sgf: string, key: string): string | undefined => {
  const match = sgf.match(new RegExp(`(?:^|[;\\s])${key}\\[([^\\]]*)\\]`));
  return match ? match[1]!.trim() || undefined : undefined;
};

const deriveName = (sgf: string, basename: string): string => {
  const black = readProp(sgf, 'PB');
  const white = readProp(sgf, 'PW');
  if (black && white) {
    const date = readProp(sgf, 'DT');
    const event = readProp(sgf, 'EV');
    const suffix = [event, date].filter(Boolean).join(', ');
    return suffix ? `${black} vs ${white} - ${suffix}` : `${black} vs ${white}`;
  }
  return basename.replace(/[_-]+/g, ' ').trim();
};

export const PRO_GAME_CORPUS: PreloadedGame[] = Object.entries(modules)
  .map(([path, sgf]) => {
    const basename = path.split('/').pop()!.replace(/\.sgf$/i, '');
    return {
      name: deriveName(sgf, basename),
      source: readProp(sgf, 'SO') ?? 'public domain',
      sgf,
    };
  })
  .sort((a, b) => a.name.localeCompare(b.name));
