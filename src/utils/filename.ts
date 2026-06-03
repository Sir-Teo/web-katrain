const UNSAFE_FILENAME_FORMAT_RE = /[\u00ad\u061c\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/g;

export function stripUnsafeFilenameControls(value: string): string {
  return Array.from(value.replace(UNSAFE_FILENAME_FORMAT_RE, ''))
    .filter((char) => {
      const code = char.charCodeAt(0);
      return code >= 32 && code !== 127 && !(code >= 0x80 && code <= 0x9f);
    })
    .join('');
}
