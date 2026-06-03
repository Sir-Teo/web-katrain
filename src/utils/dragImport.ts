import { getDirectGameImportText } from './pasteSgfInput';

type DragTransferLike = {
  files?: { length: number } | null;
  types?: Iterable<string> | ArrayLike<string> | null;
  getData?: (format: string) => string;
};

const TEXT_IMPORT_TYPES = ['text/uri-list', 'text/x-moz-url', 'text/plain'] as const;

const getTypes = (dataTransfer: DragTransferLike | null | undefined): string[] =>
  Array.from(dataTransfer?.types ?? []).map((type) => type.toLowerCase());

export const hasDraggedFiles = (dataTransfer: DragTransferLike | null | undefined): boolean =>
  (dataTransfer?.files?.length ?? 0) > 0 || getTypes(dataTransfer).includes('files');

export const hasPotentialGameImportDrag = (dataTransfer: DragTransferLike | null | undefined): boolean => {
  const types = getTypes(dataTransfer);
  return hasDraggedFiles(dataTransfer) || TEXT_IMPORT_TYPES.some((type) => types.includes(type));
};

const uriListEntries = (text: string): string[] => {
  const entries: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) entries.push(trimmed);
  }
  return entries;
};

const normalizeDroppedText = (format: string, text: string): string[] => {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (format === 'text/uri-list') return uriListEntries(trimmed);
  if (format === 'text/x-moz-url') return uriListEntries(trimmed).slice(0, 1);
  return [trimmed];
};

export const getDroppedSgfOrOgsText = (dataTransfer: DragTransferLike | null | undefined): string | null => {
  if (!dataTransfer?.getData) return null;
  for (const type of TEXT_IMPORT_TYPES) {
    let raw = '';
    try {
      raw = dataTransfer.getData(type);
    } catch {
      continue;
    }
    for (const candidate of normalizeDroppedText(type, raw)) {
      const importText = getDirectGameImportText(candidate);
      if (importText) return importText;
    }
  }
  return null;
};
