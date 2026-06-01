import { extractOgsGameId } from './ogs';

export type PasteSgfSubmitResult = 'loaded' | 'cancelled' | 'failed';

export type PasteSgfInputKind = 'empty' | 'ogs' | 'sgf' | 'text' | 'url';

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

  if (trimmed.startsWith('(')) {
    return {
      kind: 'sgf',
      helper: 'Detected SGF content. It will import directly from this text.',
      submitStatus: 'Opening pasted SGF...',
      errorStatus: 'Could not parse this SGF. Check that it starts with (; and contains a complete game tree.',
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
