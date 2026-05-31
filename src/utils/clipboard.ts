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
