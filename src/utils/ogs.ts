const OGS_HOSTS = new Set(['online-go.com', 'www.online-go.com']);

const toOgsUrlCandidate = (text: string): URL | null => {
  const trimmed = text.trim();
  if (!trimmed || /\s/.test(trimmed)) return null;
  try {
    return new URL(trimmed);
  } catch {
    if (/^(?:www\.)?online-go\.com\//i.test(trimmed)) {
      return new URL(`https://${trimmed}`);
    }
    return null;
  }
};

export const extractOgsGameId = (url: string): string | null => {
  try {
    const candidate = toOgsUrlCandidate(url);
    if (!candidate || !OGS_HOSTS.has(candidate.hostname.toLowerCase())) return null;
    const [section, gameId] = candidate.pathname.split('/').filter(Boolean);
    if (section !== 'game' || !gameId || !/^\d+$/.test(gameId)) return null;
    return gameId;
  } catch {
    return null;
  }
};

export const isOgsUrl = (text: string): boolean => extractOgsGameId(text) !== null;

export const downloadOgsSgf = async (gameId: string): Promise<string> => {
  const apiUrl = `https://online-go.com/api/v1/games/${gameId}/sgf`;
  const response = await fetch(apiUrl, { method: 'GET' });
  if (!response.ok) {
    throw new Error(`Failed to download OGS game ${gameId}: ${response.statusText}`);
  }
  const sgf = await response.text();
  if (!sgf || sgf.trim().length === 0) {
    throw new Error(`Empty SGF content received from OGS game ${gameId}`);
  }
  return sgf;
};

export const loadSgfOrOgs = async (
  content: string
): Promise<{ sgf: string; source: 'direct' | 'ogs'; gameId?: string }> => {
  const trimmed = content.trim();
  if (!trimmed) return { sgf: '', source: 'direct' };
  if (trimmed.startsWith('(')) {
    return { sgf: trimmed, source: 'direct' };
  }
  const gameId = extractOgsGameId(trimmed);
  if (gameId) {
    const sgf = await downloadOgsSgf(gameId);
    return { sgf, source: 'ogs', gameId };
  }
  return { sgf: trimmed, source: 'direct' };
};
