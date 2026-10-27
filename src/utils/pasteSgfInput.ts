import { extractOgsGameId } from './ogs';
import { decodeSgfFromShareUrl, hasSgfFragment } from './shareLink';
import { parseBoardTextDiagram } from './boardTextDiagram';

export type PasteSgfSubmitResult = 'loaded' | 'cancelled' | 'failed';

export type PasteSgfInputKind = 'diagram' | 'empty' | 'ogs' | 'sgf' | 'share' | 'text' | 'url';

export type PasteSgfInputInfo = {
  kind: PasteSgfInputKind;
  gameId?: string;
  helper: string;
  submitStatus: string;
  errorStatus: string;
};

const looksLikeUrl = (text: string): boolean => {
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) return true;
  return /^(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:\/|\?|#|$)/i.test(text);
};

export const getDirectGameImportText = (text: string | null | undefined): string | null => {
  const trimmed = text?.trim() ?? '';
  if (!trimmed) return null;
  if (trimmed.startsWith('(') || extractOgsGameId(trimmed)) return trimmed;
  // The app's own share link, dropped or pasted onto the page: only the Paste
  // dialog read it, so a drop said "Drop SGF text or an Online-Go game URL".
  return decodeSgfFromShareUrl(trimmed);
};

export const getPasteSgfInputInfo = (text: string): PasteSgfInputInfo => {
  const trimmed = text.trim();
  if (!trimmed) {
    return {
      kind: 'empty',
      helper: 'Paste raw SGF text or an Online-Go game URL. OGS links are downloaded as SGF before loading.',
      submitStatus: 'Opening SGF...',
      errorStatus: 'Paste raw SGF text or an Online-Go game URL.',
    };
  }

  if (trimmed.startsWith('(')) {
    return {
      kind: 'sgf',
      helper: 'Detected SGF content. It will import directly from this text.',
      submitStatus: 'Opening pasted SGF...',
      errorStatus: 'Could not parse this SGF. Check that it starts with (; and contains a complete game tree.',
    };
  }

  // Recognize the envelope without inflating or parsing a game on each edit.
  // Damaged links still need share-specific recovery guidance on submission.
  const hashAt = trimmed.indexOf('#');
  if (/^https?:\/\/\S+$/i.test(trimmed) && hashAt >= 0 && hasSgfFragment(trimmed.slice(hashAt))) {
    return {
      kind: 'share',
      helper: 'Detected a Web KaTrain share link. The embedded game will open directly.',
      submitStatus: 'Opening shared game...',
      errorStatus: 'Could not read this shared game. Copy the complete share link again, or ask for an SGF file.',
    };
  }

  const gameId = extractOgsGameId(trimmed) ?? undefined;
  if (gameId) {
    return {
      kind: 'ogs',
      gameId,
      helper: `Detected OGS game ${gameId}. It will download the public SGF from Online-Go.`,
      submitStatus: `Downloading OGS game ${gameId}...`,
      errorStatus: `Could not download or parse OGS game ${gameId}. Check that the game is public and the URL looks like online-go.com/game/12345.`,
    };
  }

  const diagram = parseBoardTextDiagram(trimmed);
  if (diagram) {
    return {
      kind: 'diagram',
      helper: `Detected a ${diagram.length}\u00d7${diagram.length} board diagram. The stones will load as a position to study.`,
      submitStatus: 'Opening pasted position...',
      errorStatus: 'Could not read this board diagram. Rows must all be the same length, one row per line.',
    };
  }

  if (looksLikeUrl(trimmed)) {
    return {
      kind: 'url',
      helper: 'This looks like a URL. Only Online-Go game links are downloaded; paste raw SGF for other sites.',
      submitStatus: 'Opening SGF text...',
      errorStatus: 'Could not parse this as SGF. Paste raw SGF text or an Online-Go game URL.',
    };
  }

  return {
    kind: 'text',
    helper: 'This will be parsed as SGF text. SGF usually starts with (;GM[1].',
    submitStatus: 'Opening SGF text...',
    errorStatus: 'Could not parse this as SGF. Paste raw SGF text or an Online-Go game URL.',
  };
};
