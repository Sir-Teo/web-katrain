import { fetchOgsResource, readBoundedResponseText } from './ogsQueue';
import { MAX_SGF_IMPORT_BYTES } from './sgfImportLimits';
import { sgfFromBoardTextDiagram } from './boardTextDiagram';

const OGS_HOSTS = new Set(['online-go.com', 'www.online-go.com']);
const OGS_TEXT_URL_RE =
  /(?:https?:\/\/)?(?:www\.)?online-go\.com\/game\/[^\s<>"'`()[\]{}]+/gi;
const TRAILING_SENTENCE_PUNCTUATION_RE = /[.,;:!?]+$/;

const toOgsUrlCandidate = (text: string): URL | null => {
  const trimmed = text.trim();
  if (!trimmed || /\s/.test(trimmed)) return null;
  try {
    return new URL(trimmed);
  } catch {
    if (/^(?:www\.)?online-go\.com(?::\d+)?\//i.test(trimmed)) {
      return new URL(`https://${trimmed}`);
    }
    return null;
  }
};

const extractOgsGameIdFromCandidate = (candidate: URL | null): string | null => {
  if (!candidate) return null;
  if (candidate.protocol !== 'http:' && candidate.protocol !== 'https:') return null;
  if (!OGS_HOSTS.has(candidate.hostname.toLowerCase())) return null;

  const [section, gameId] = candidate.pathname.split('/').filter(Boolean);
  if (section === 'game' && gameId && /^\d+$/.test(gameId)) return gameId;
  return null;
};

const hasStandaloneOgsTextPrefix = (text: string, index: number): boolean => {
  if (index === 0) return true;
  return /[\s([{"'<]/.test(text[index - 1] ?? '');
};

const extractOgsTextCandidateGameId = (text: string): string | null => {
  for (const match of text.matchAll(OGS_TEXT_URL_RE)) {
    const raw = match[0];
    const index = match.index ?? 0;
    if (!hasStandaloneOgsTextPrefix(text, index)) continue;

    const direct = extractOgsGameIdFromCandidate(toOgsUrlCandidate(raw));
    if (direct) return direct;

    const stripped = raw.replace(TRAILING_SENTENCE_PUNCTUATION_RE, '');
    if (stripped !== raw) {
      const strippedGameId = extractOgsGameIdFromCandidate(toOgsUrlCandidate(stripped));
      if (strippedGameId) return strippedGameId;
    }
  }

  return null;
};

export const extractOgsGameId = (url: string): string | null => {
  try {
    const direct = extractOgsGameIdFromCandidate(toOgsUrlCandidate(url));
    if (direct) return direct;
    return extractOgsTextCandidateGameId(url);
  } catch {
    return null;
  }
};

export const isOgsUrl = (text: string): boolean => extractOgsGameId(text) !== null;

export const downloadOgsSgf = async (
  gameId: string,
  options: { isCancelled?: () => boolean } = {}
): Promise<string> => {
  const apiUrl = `https://online-go.com/api/v1/games/${gameId}/sgf`;
  const response = await fetchOgsResource(apiUrl, { method: 'GET' }, options);
  if (!response.ok) {
    throw new Error(`Failed to download OGS game ${gameId}: ${response.statusText}`);
  }
  const sgf = await readBoundedResponseText(response, MAX_SGF_IMPORT_BYTES);
  if (!sgf || sgf.trim().length === 0) {
    throw new Error(`Empty SGF content received from OGS game ${gameId}`);
  }
  return sgf;
};

export const loadSgfOrOgs = async (
  content: string
): Promise<{ sgf: string; source: 'direct' | 'ogs' | 'diagram'; gameId?: string }> => {
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
  // Last, because it is the only branch that guesses. Anything that is really
  // SGF or an OGS link has already been claimed above, so this only ever sees
  // text that would otherwise have failed to parse.
  const diagram = sgfFromBoardTextDiagram(trimmed);
  if (diagram) return { sgf: diagram, source: 'diagram' };
  return { sgf: trimmed, source: 'direct' };
};
