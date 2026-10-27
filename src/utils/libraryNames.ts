export type LibraryNamePool = { names: Set<string>; nextSuffix: Map<string, number> };

/** Reserve a sibling name while retaining an SGF extension after the suffix. */
export const reserveLibraryName = (preferred: string, pool: LibraryNamePool): string => {
  const key = preferred.toLowerCase();
  if (!pool.names.has(key)) {
    pool.names.add(key);
    return preferred;
  }

  const dotSgf = key.endsWith('.sgf');
  const base = dotSgf ? preferred.slice(0, -4) : preferred;
  const suffix = dotSgf ? '.sgf' : '';
  for (let i = pool.nextSuffix.get(key) ?? 2; ; i++) {
    const candidate = `${base} ${i}${suffix}`;
    const candidateKey = candidate.toLowerCase();
    if (!pool.names.has(candidateKey)) {
      pool.names.add(candidateKey);
      pool.nextSuffix.set(key, i + 1);
      return candidate;
    }
  }
};
