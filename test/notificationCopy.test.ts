import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const collectSourceFiles = (dir: string): string[] => {
  const files: string[] = [];

  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) files.push(...collectSourceFiles(path));
    else if (/\.tsx?$/.test(path) && !path.endsWith('.test.ts')) files.push(path);
  }

  return files;
};

/**
 * Index of the quote closing the literal that opens at `start`.
 *
 * Template literals nest: `Pasted ${n} of ${c} nodes -- ${d === 1 ? '1 move is'
 * : `${d} moves are`} not legal here.` contains a second backtick literal
 * inside an interpolation. Stopping at the next backtick cuts that message in
 * half and reports it as missing the full stop it plainly has.
 */
const literalEnd = (source: string, start: number): number => {
  const stack: string[] = [source[start]!];

  for (let i = start + 1; i < source.length; i += 1) {
    const char = source[i]!;
    if (char === '\\') { i += 1; continue; }
    const top = stack[stack.length - 1]!;

    if (top === "'" || top === '"') {
      if (char === top) stack.pop();
    } else if (top === '`') {
      if (char === '`') stack.pop();
      else if (char === '$' && source[i + 1] === '{') { stack.push('{'); i += 1; }
    } else if (char === '}') stack.pop();
    else if (char === '`' || char === "'" || char === '"' || char === '{') stack.push(char);

    if (stack.length === 0) return i;
  }

  return -1;
};

// The two ways a notification's text is written: passed to toast(), or set as
// the `message` of a queued notification.
const MESSAGE_OPENERS = [/toast\(\s*(['`])/g, /message:\s*(['`])/g];

type Message = { where: string; text: string };

const messages = (): Message[] =>
  collectSourceFiles('src').flatMap((path) => {
    const source = readFileSync(path, 'utf8');
    return MESSAGE_OPENERS.flatMap((pattern) =>
      [...source.matchAll(pattern)].flatMap((match) => {
        const open = match.index! + match[0].length - 1;
        const end = literalEnd(source, open);
        if (end < 0) return [];
        return [{
          where: `${path}:${source.slice(0, open).split('\n').length}`,
          text: source.slice(open + 1, end),
        }];
      }),
    );
  });

/**
 * A message ending in an interpolation carries whatever punctuation the value
 * brings -- "Analysis error: ${msg}" would read "...timed out.." if this file
 * insisted on a full stop. Only messages whose last characters are literal are
 * this check's business.
 */
const endsInValue = (text: string): boolean => /\$\{[^{}]*\}$/.test(text.trim());

describe('notification copy', () => {
  it('finds the messages it is checking', () => {
    expect(messages().length).toBeGreaterThanOrEqual(120);
  });

  it('ends every message it can see the end of', () => {
    // 141 of 145 already ended in a full stop. The exceptions were the five
    // extra-analysis readouts and a teaching-undo line in gameStore, plus "Set
    // as main branch" -- while Layout wrote the same shape the other way,
    // "Board theme: Kaya." and "Live analysis depth: 500 visits (Balanced)."
    // Two files, each consistent with itself, disagreeing with each other.
    const offenders = messages()
      .filter(({ text }) => text.trim())
      .filter(({ text }) => !endsInValue(text))
      .filter(({ text }) => !/[.!?]$/.test(text.trim()))
      .map(({ where, text }) => `${where} "${text.slice(0, 60)}"`);

    expect(offenders).toEqual([]);
  });

  it('reads a message past a template nested inside it', () => {
    // The subtle half, and the reason this scanner replaced a regex: stopping
    // at the next backtick cuts the paste message at its inner literal and
    // reports it as unpunctuated when it ends "not legal here."
    const pasted = messages().find(({ text }) => text.startsWith('Pasted ${nodes}'));

    expect(pasted?.text).toContain('moves are');
    expect(pasted?.text.trim().endsWith('not legal here.')).toBe(true);
  });

  it('leaves a message that ends in a value alone', () => {
    // Present so the rule above is not quietly widened into doubling the full
    // stop on an error string that already has one.
    const valued = messages().filter(({ text }) => endsInValue(text));

    expect(valued.length).toBeGreaterThanOrEqual(2);
    expect(valued.map(({ text }) => text)).toContain('Analysis error: ${msg}');
  });

  it('starts each message with a capital and single-spaces it', () => {
    const offenders = messages()
      .filter(({ text }) => text.trim())
      .filter(({ text }) => /^[a-z]/.test(text) || / {2}/.test(text.replace(/\n\s*/g, ' ')))
      .map(({ where, text }) => `${where} "${text.slice(0, 60)}"`);

    expect(offenders).toEqual([]);
  });
});
