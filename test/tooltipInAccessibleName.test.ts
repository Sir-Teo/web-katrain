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

const BUTTON = /<button\b[\s\S]*?(?:\/>|>[\s\S]*?<\/button>)/g;
const TITLE = /\btitle="([^"]*)"/;
const ARIA_LABEL = /\baria-label="([^"]*)"/;

const words = (value: string): string[] =>
  value.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(' ').filter(Boolean);

/** Does `name` contain every word of `label`, in order? */
const contains = (name: string[], label: string[]): boolean => {
  const rest = name[Symbol.iterator]();
  return label.every((word) => {
    for (const candidate of rest) if (candidate === word) return true;
    return false;
  });
};

type Button = { path: string; line: number; title: string; label: string };

const iconOnlyButtons = (): Button[] =>
  collectTsxFiles('src').flatMap((path) => {
    const source = readFileSync(path, 'utf8');
    return [...source.matchAll(BUTTON)].flatMap((match) => {
      const element = match[0];
      const title = TITLE.exec(element);
      const label = ARIA_LABEL.exec(element);
      if (!title || !label) return [];
      // Icon-only: nothing but elements and expressions between the tags, so
      // the tooltip is the only name a sighted user is given.
      const inner = element.slice(element.indexOf('>') + 1);
      const visible = inner.replace(/\{[^{}]*\}/g, '').replace(/<[^>]*>/g, '').replace('</button>', '').trim();
      if (visible) return [];
      return [{
        path,
        line: source.slice(0, match.index).split('\n').length,
        title: title[1]!,
        label: label[1]!,
      }];
    });
  });

describe('icon-only button names', () => {
  it('names each button with the tooltip it shows', () => {
    // The tooltip is the only label a sighted user can read on an icon-only
    // button, and it is what a voice-control user will say. When the
    // accessible name says something else the command matches nothing, and
    // the two descriptions of one button disagree in the process: "Re-analyze…"
    // was named "Open analysis options", and an X captioned "Return to board"
    // was named "Open board".
    const offenders = iconOnlyButtons()
      .filter(({ title, label }) => !contains(words(label), words(title)))
      .map(({ path, line, title, label }) => `${path}:${line} title="${title}" label="${label}"`);

    expect(offenders).toEqual([]);
  });

  it('finds the buttons it is meant to be checking', () => {
    // A guard on the guard: if the button regex stops matching, the assertion
    // above passes by checking nothing.
    expect(iconOnlyButtons().length).toBeGreaterThanOrEqual(20);
  });
});
