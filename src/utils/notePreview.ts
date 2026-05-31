export type NoteInlineSegment =
  | { type: 'text'; text: string }
  | { type: 'strong'; text: string }
  | { type: 'code'; text: string }
  | { type: 'link'; text: string; href: string };

const INLINE_TOKEN_RE = /(`[^`\n]+`|\*\*[^*\n]+\*\*|\[[^\]\n]+\]\(https?:\/\/[^)\s]+\)|https?:\/\/[^\s<]+)/g;
const TRAILING_URL_PUNCTUATION_RE = /[),.;:!?]$/;

function pushText(segments: NoteInlineSegment[], text: string): void {
  if (!text) return;
  const previous = segments[segments.length - 1];
  if (previous?.type === 'text') previous.text += text;
  else segments.push({ type: 'text', text });
}

function splitPlainUrl(url: string): { href: string; trailing: string } {
  let href = url;
  let trailing = '';
  while (TRAILING_URL_PUNCTUATION_RE.test(href)) {
    trailing = href.slice(-1) + trailing;
    href = href.slice(0, -1);
  }
  return { href, trailing };
}

export function parseNoteInlinePreview(line: string): NoteInlineSegment[] {
  const segments: NoteInlineSegment[] = [];
  let cursor = 0;

  for (const match of line.matchAll(INLINE_TOKEN_RE)) {
    const token = match[0];
    const index = match.index ?? 0;
    pushText(segments, line.slice(cursor, index));

    const markdownLink = token.match(/^\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)$/);
    if (markdownLink) {
      segments.push({ type: 'link', text: markdownLink[1]!, href: markdownLink[2]! });
    } else if (token.startsWith('http://') || token.startsWith('https://')) {
      const { href, trailing } = splitPlainUrl(token);
      if (href) segments.push({ type: 'link', text: href, href });
      pushText(segments, trailing);
    } else if (token.startsWith('`') && token.endsWith('`')) {
      segments.push({ type: 'code', text: token.slice(1, -1) });
    } else if (token.startsWith('**') && token.endsWith('**')) {
      segments.push({ type: 'strong', text: token.slice(2, -2) });
    } else {
      pushText(segments, token);
    }

    cursor = index + token.length;
  }

  pushText(segments, line.slice(cursor));
  return segments;
}

export function isNoteBulletLine(line: string): { text: string } | null {
  const match = line.match(/^\s*[-*]\s+(.+)$/);
  return match ? { text: match[1]! } : null;
}
