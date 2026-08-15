export type PreloadedGame = {
  name: string;
  sgf: string;
  source: string;
};

/**
 * Auto-discover every SGF under `./sgf/**`. Dropping a public-domain game pack
 * into that folder grows the pro-game database with no code changes, so the
 * library scales from a handful of curated games to a large corpus.
 *
 * `?raw` yields the file text; `eager` inlines it at build time so the games
 * ship in the bundle (and are cached by the service worker for offline use).
 */
const sgfModules = import.meta.glob('./sgf/**/*.sgf', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

/** Curated display names + sources for the originally bundled games. */
const CURATED: Record<string, { name: string; source: string }> = {
  '__go4go_20030423_Lee-Sedol_Hong-Jansik': {
    name: 'Lee Sedol vs Hong Jansik - 3rd Korean KAT Cup (2003-04-23)',
    source: 'go4go.com',
  },
  '__go4go_20050219_Choi-Cheolhan_Lee-Changho': {
    name: 'Choi Cheolhan vs Lee Changho - 48th Korean Kuksu, title match #3 (2005-02-19)',
    source: 'go4go.com',
  },
  '__go4go_20050427_Cho-Chikun_O-Rissei': {
    name: 'Cho Chikun vs O Rissei - 43rd Japanese Judan, title match #5 (2005-04-27)',
    source: 'go4go.com',
  },
  '__go4go_20051019_Gu-Li_Lee-Sedol': {
    name: 'Gu Li vs Lee Sedol - 10th LG Cup, semi-final (2005-10-19)',
    source: 'go4go.com',
  },
  '__go4go_20051210_Lee-Sedol_Gu-Li': {
    name: 'Lee Sedol vs Gu Li - 7th Chinese League A, round 20 (2005-12-10)',
    source: 'go4go.com',
  },
  '__go4go_20051216_Choi-Cheolhan_Luo-Xihe': {
    name: 'Choi Cheolhan vs Luo Xihe - 10th Samsung Cup, semi-final 3 (2005-12-16)',
    source: 'go4go.com',
  },
  '__go4go_20150920_Shin-Jinseo_Kang-Yootaek': {
    name: 'Shin Jinseo vs Kang Yootaek - 2015 Korean League (2015-09-20)',
    source: 'go4go.com',
  },
};

const readProp = (sgf: string, key: string): string | undefined => {
  const match = sgf.match(new RegExp(`(?:^|[;\\s])${key}\\[([^\\]]*)\\]`));
  return match ? match[1]!.trim() || undefined : undefined;
};

/** Build a human label from SGF headers when no curated name exists. */
const deriveName = (sgf: string, basename: string): string => {
  const black = readProp(sgf, 'PB');
  const white = readProp(sgf, 'PW');
  if (black && white) {
    const event = readProp(sgf, 'EV');
    const date = readProp(sgf, 'DT');
    const suffix = [event, date].filter(Boolean).join(', ');
    return suffix ? `${black} vs ${white} - ${suffix}` : `${black} vs ${white}`;
  }
  return basename.replace(/^__/, '').replace(/[_-]+/g, ' ').trim();
};

export const PRELOADED_GAMES: PreloadedGame[] = Object.entries(sgfModules)
  .map(([path, sgf]) => {
    const basename = path.split('/').pop()!.replace(/\.sgf$/i, '');
    const curated = CURATED[basename];
    return {
      name: curated?.name ?? deriveName(sgf, basename),
      source: curated?.source ?? readProp(sgf, 'SO') ?? 'public domain',
      sgf,
    };
  })
  .sort((a, b) => a.name.localeCompare(b.name));
