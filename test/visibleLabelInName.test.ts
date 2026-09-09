import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const collectTsxFiles = (dir: string): string[] => {
  const files: string[] = [];

  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) files.push(...collectTsxFiles(path));
    else if (path.endsWith('.tsx')) files.push(path);
  }

  return files;
};

/**
 * Index of the `>` closing the opening tag that starts at `start`.
 *
 * Quote- and brace-aware, because stopping at the first `>` cuts every tag at
 * its first arrow function or `size={12}` -- which turned attribute source into
 * "visible text" and buried the two real findings in 44 false ones.
 */
const openingTagEnd = (source: string, start: number): number => {
  let depth = 0;
  let quote: string | null = null;

  for (let i = start; i < source.length; i += 1) {
    const char = source[i]!;
    if (quote) {
      if (char === quote && source[i - 1] !== '\\') quote = null;
    } else if (char === '"' || char === "'" || char === '`') quote = char;
    else if (char === '{') depth += 1;
    else if (char === '}') depth -= 1;
    else if (char === '>' && depth === 0) return i;
  }

  return -1;
};

/**
 * Static text runs inside the element: child tags and {expressions} removed.
 *
 * Each removal leaves a sentinel and the runs are split on it, so a label keeps
 * its words together. Replacing them with a space instead would split "Board
 * from photo" into three one-word segments, and the check below passes when any
 * segment matches -- so "Board" alone would satisfy the name "Photo Board" and
 * the mismatch would go unreported.
 */
const SEGMENT_BREAK = '\u0000'; // Written as an escape: a raw NUL byte in the
                                // file makes it read as binary to grep.

const textSegments = (content: string): string[] =>
  content
    .replace(/<[^>]*>/g, SEGMENT_BREAK)
    .replace(/\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g, SEGMENT_BREAK)
    .split(SEGMENT_BREAK)
    .map((segment) => segment.split(/\s+/).filter(Boolean).join(' '))
    .filter((segment) => segment.length >= 3);

const words = (value: string): string[] =>
  value.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(' ').filter(Boolean);

/**
 * Does the accessible name carry the visible label, in order?
 *
 * A visible word matches a name word it is a prefix of, which is what lets a
 * button read "Rotate L" and be named "Rotate traced board left": the name is
 * expanding an abbreviation the button had no room to print, not renaming it.
 */
const carriesLabel = (name: string[], label: string[]): boolean => {
  const rest = name[Symbol.iterator]();
  return label.every((word) => {
    for (const candidate of rest) if (candidate.startsWith(word)) return true;
    return false;
  });
};

type Finding = { path: string; line: number; shows: string[]; named: string };

const buttonsWithVisibleText = (): Finding[] =>
  collectTsxFiles('src').flatMap((path) => {
    const source = readFileSync(path, 'utf8');
    const findings: Finding[] = [];

    for (const match of source.matchAll(/<button\b/g)) {
      const start = match.index!;
      const tagEnd = openingTagEnd(source, start);
      if (tagEnd < 0) continue;
      const close = source.indexOf('</button>', tagEnd);
      if (close < 0) continue;

      const label = /\baria-label="([^"]*)"/.exec(source.slice(start, tagEnd + 1));
      if (!label) continue;

      const shows = textSegments(source.slice(tagEnd + 1, close));
      if (shows.length === 0) continue;

      findings.push({ path, line: source.slice(0, start).split('\n').length, shows, named: label[1]! });
    }

    return findings;
  });

describe('buttons that show their own label', () => {
  it('names each button with the text printed on it', () => {
    // aria-label replaces the button's text outright, so a name that says
    // something else leaves the on-screen words matching nothing -- a menu item
    // reading "Board from photo" answered to "Photo Board", and one reading
    // "Analyze" answered to "Open analysis options".
    const offenders = buttonsWithVisibleText()
      // A responsive button prints a full and a compact label and shows one of
      // them, so any single segment carrying the name is enough.
      .filter(({ shows, named }) => !shows.some((segment) => carriesLabel(words(named), words(segment))))
      .map(({ path, line, shows, named }) => `${path}:${line} shows=${JSON.stringify(shows)} named="${named}"`);

    expect(offenders).toEqual([]);
  });

  it('finds the buttons it is meant to be checking', () => {
    // The scanner above is the part most likely to break silently; without
    // this, a regression in it reads as a clean run.
    expect(buttonsWithVisibleText().length).toBeGreaterThanOrEqual(30);
  });

  it('keeps a multi-word label in one piece', () => {
    // The subtle half. Split on a space rather than a sentinel and this returns
    // ["Board", "from", "photo"]; "Board" alone then satisfies the name "Photo
    // Board" and the check reports nothing.
    expect(textSegments('<Icon size={14} /><span className="mi-label">Board from photo</span>'))
      .toEqual(['Board from photo']);

    // Two alternative labels stay two segments, which is what lets the check
    // accept whichever one is on screen.
    expect(textSegments('<span>Show answer</span><span>Answer</span>'))
      .toEqual(['Show answer', 'Answer']);
  });

  it('still allows a name that expands an abbreviation', () => {
    // "Rotate L" named "Rotate traced board left" is the intended shape: six
    // photo-board controls print an abbreviation and spell it out for a reader.
    expect(carriesLabel(words('Rotate traced board left'), words('Rotate L'))).toBe(true);
    expect(carriesLabel(words('Flip traced board horizontally'), words('Flip H'))).toBe(true);
    // But not one that simply says something else.
    expect(carriesLabel(words('Photo Board'), words('Board from photo'))).toBe(false);
    expect(carriesLabel(words('Open analysis options'), words('Analyze'))).toBe(false);
  });
});
