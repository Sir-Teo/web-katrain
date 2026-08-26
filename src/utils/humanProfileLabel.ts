/**
 * Turns a KataGo humanSLProfile id into something a player can read:
 * `rank_5k` -> "5 kyu", `preaz_1d` -> "1 dan (pre-AlphaGo style)",
 * `proyear_1950` -> "Pro, 1950".
 */
export function describeHumanProfile(profile: string): string {
  if (profile.startsWith('proyear_')) {
    const year = profile.slice('proyear_'.length);
    return `Pro, ${year}`;
  }
  const preAz = profile.startsWith('preaz_');
  if (!preAz && !profile.startsWith('rank_')) return profile;
  const rank = profile.slice(preAz ? 'preaz_'.length : 'rank_'.length);
  const parts = rank.split('_');
  const label = parts.map(readRank).join(' vs ');
  return preAz ? `${label} (pre-AlphaGo style)` : label;
}

function readRank(rank: string): string {
  const match = /^(\d+)([kd])$/.exec(rank);
  if (!match) return rank;
  return `${match[1]} ${match[2] === 'k' ? 'kyu' : 'dan'}`;
}
