export function getClipboard(target?: Navigator | null): Clipboard | null {
  const source = target ?? (typeof navigator !== 'undefined' ? navigator : null);
  if (!source) return null;
  try {
    return source.clipboard ?? null;
  } catch {
    return null;
  }
}

export async function writeClipboardText(text: string, target?: Navigator | null): Promise<boolean> {
  const clipboard = getClipboard(target);
  if (typeof clipboard?.writeText !== 'function') return false;
  try {
    await clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export async function readClipboardText(target?: Navigator | null): Promise<string | null> {
  const clipboard = getClipboard(target);
  if (typeof clipboard?.readText !== 'function') return null;
  try {
    return await clipboard.readText();
  } catch {
    return null;
  }
}

type LegacyCopyDocument = Pick<Document, 'createElement' | 'execCommand'> & {
  body?: Pick<HTMLElement, 'appendChild' | 'removeChild'> | null;
};

function getLegacyCopyDocument(target?: LegacyCopyDocument | null): LegacyCopyDocument | null {
  const source = target ?? (typeof document !== 'undefined' ? document : null);
  if (!source) return null;
  try {
    if (typeof source.createElement !== 'function') return null;
    if (typeof source.execCommand !== 'function') return null;
    if (typeof source.body?.appendChild !== 'function') return null;
    if (typeof source.body.removeChild !== 'function') return null;
    return source;
  } catch {
    return null;
  }
}

export function writeClipboardTextLegacy(text: string, target?: LegacyCopyDocument | null): boolean {
  const source = getLegacyCopyDocument(target);
  if (!source?.body) return false;

  let textArea: HTMLTextAreaElement | null = null;
  try {
    textArea = source.createElement('textarea') as HTMLTextAreaElement;
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-9999px';
    textArea.style.top = '0';
    textArea.setAttribute('readonly', '');
    source.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    return source.execCommand('copy') !== false;
  } catch {
    return false;
  } finally {
    if (textArea) {
      try {
        source.body.removeChild(textArea);
      } catch {
        // Best effort cleanup for old browser fallbacks.
      }
    }
  }
}

export async function copyTextToClipboard(text: string, target?: Navigator | null, legacyTarget?: LegacyCopyDocument | null): Promise<boolean> {
  if (await writeClipboardText(text, target)) return true;
  return writeClipboardTextLegacy(text, legacyTarget);
}
