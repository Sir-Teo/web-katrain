export type NoteInlineSegment =
  | { type: 'text'; text: string }
  | { type: 'strong'; text: string }
  | { type: 'code'; text: string }
  | { type: 'link'; text: string; href: string };

export type NoteTableAlignment = 'left' | 'center' | 'right';

export type NoteBlock =
  | { type: 'blank' }
  | { type: 'heading'; level: 1 | 2 | 3; text: string }
  | { type: 'quote'; text: string }
  | { type: 'code'; language: string | null; text: string }
  | { type: 'table'; headers: string[]; alignments: NoteTableAlignment[]; rows: string[][] }
  | { type: 'task'; text: string; checked: boolean }
  | { type: 'bullet'; text: string }
  | { type: 'ordered'; number: string; text: string }
  | { type: 'paragraph'; text: string };

const INLINE_TOKEN_RE = /(`[^`\n]+`|\*\*[^*\n]+\*\*|\[[^\]\n]+\]\(https?:\/\/[^)\s]+\)|https?:\/\/[^\s<]+)/g;
const TRAILING_URL_PUNCTUATION_RE = /[),.;:!?]$/;
const FENCED_CODE_RE = /^\s*```([\w-]+)?\s*$/;
const TABLE_SEPARATOR_RE = /^:?-+:?$/;
const ESCAPED_TABLE_PIPE = '\u0000';

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

export function parseNoteBlockLine(line: string): NoteBlock {
  const normalized = line.replace(/\r$/, '');
  if (!normalized.trim()) return { type: 'blank' };

  const heading = normalized.match(/^\s{0,3}(#{1,3})\s+(.+?)\s*#*\s*$/);
  if (heading) {
    return { type: 'heading', level: heading[1]!.length as 1 | 2 | 3, text: heading[2]!.trim() };
  }

  const quote = normalized.match(/^\s*>\s?(.*)$/);
  if (quote) return { type: 'quote', text: quote[1]!.trim() };

  const task = normalized.match(/^\s*[-*]\s+\[([ xX])\]\s+(.+)$/);
  if (task) return { type: 'task', checked: task[1]!.toLowerCase() === 'x', text: task[2]!.trim() };

  const ordered = normalized.match(/^\s*(\d+)[.)]\s+(.+)$/);
  if (ordered) return { type: 'ordered', number: ordered[1]!, text: ordered[2]!.trim() };

  const bullet = isNoteBulletLine(normalized);
  if (bullet) return { type: 'bullet', text: bullet.text };

  return { type: 'paragraph', text: normalized.trimEnd() };
}

function splitTableRow(line: string, minCells: number): string[] | null {
  const normalized = line.trim();
  if (!normalized.includes('|')) return null;
  const hidden = normalized.replace(/\\\|/g, ESCAPED_TABLE_PIPE);
  const inner = hidden.replace(/^\|/, '').replace(/\|$/, '');
  const cells = inner.split('|').map((cell) => cell.trim().replace(new RegExp(ESCAPED_TABLE_PIPE, 'g'), '|'));
  return cells.length >= minCells ? cells : null;
}

function parseTableAlignment(cell: string): NoteTableAlignment | null {
  const normalized = cell.trim();
  if (!TABLE_SEPARATOR_RE.test(normalized)) return null;
  if (normalized.startsWith(':') && normalized.endsWith(':')) return 'center';
  if (normalized.endsWith(':')) return 'right';
  return 'left';
}

function normalizeTableCells<T>(cells: T[], length: number, fill: T): T[] {
  if (cells.length === length) return cells;
  if (cells.length > length) return cells.slice(0, length);
  return [...cells, ...Array.from({ length: length - cells.length }, () => fill)];
}

function isTableParagraphLine(line: string): boolean {
  return parseNoteBlockLine(line).type === 'paragraph';
}

function parseTableAt(lines: string[], index: number): { block: NoteBlock; nextIndex: number } | null {
  const headerLine = lines[index] ?? '';
  if (!isTableParagraphLine(headerLine)) return null;
  const headers = splitTableRow(headerLine, 1);
  const separator = splitTableRow(lines[index + 1] ?? '', 1);
  if (!headers || !separator) return null;

  const alignments = separator.map(parseTableAlignment);
  if (alignments.some((alignment) => alignment === null)) return null;

  const width = Math.max(headers.length, 1);
  const rows: string[][] = [];
  let cursor = index + 2;
  while (cursor < lines.length) {
    const rowLine = lines[cursor] ?? '';
    if (!isTableParagraphLine(rowLine)) break;
    const row = splitTableRow(rowLine, 1);
    if (!row) break;
    rows.push(normalizeTableCells(row, width, ''));
    cursor += 1;
  }

  return {
    block: {
      type: 'table',
      headers: normalizeTableCells(headers, width, ''),
      alignments: normalizeTableCells(alignments as NoteTableAlignment[], width, 'left'),
      rows,
    },
    nextIndex: cursor,
  };
}

export function parseNoteBlocks(note: string): NoteBlock[] {
  const lines = note.replace(/\r\n?/g, '\n').split('\n');
  const blocks: NoteBlock[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    const fence = line.match(FENCED_CODE_RE);
    if (fence) {
      const codeLines: string[] = [];
      index += 1;
      while (index < lines.length && !FENCED_CODE_RE.test(lines[index] ?? '')) {
        codeLines.push(lines[index] ?? '');
        index += 1;
      }
      blocks.push({ type: 'code', language: fence[1] ?? null, text: codeLines.join('\n') });
      continue;
    }

    const table = parseTableAt(lines, index);
    if (table) {
      blocks.push(table.block);
      index = table.nextIndex - 1;
      continue;
    }

    blocks.push(parseNoteBlockLine(line));
  }

  return blocks;
}
