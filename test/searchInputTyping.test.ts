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

// `<input ... />` up to the self-closing slash. Stopping at the first `>`
// instead would cut every tag at its first arrow function, which is most of
// them -- `onChange={(e) => ...}` is a `>` inside the tag.
const INPUT_TAG = /<input\b[\s\S]*?\/>/g;

const searchInputs = (): { path: string; tag: string }[] =>
  collectTsxFiles('src/components').flatMap((path) => {
    const source = readFileSync(path, 'utf8');
    return (source.match(INPUT_TAG) ?? [])
      .filter((tag) => tag.includes('type="search"'))
      .map((tag) => ({ path, tag }));
  });

describe('search field typing behaviour', () => {
  it('finds the app\'s search inputs', () => {
    // A guard on the guard: if the tag shape drifts and the match set empties,
    // every assertion below would pass by matching nothing.
    expect(searchInputs().length).toBeGreaterThanOrEqual(6);
  });

  // A phone capitalises the first letter of a field and autocorrects the rest
  // unless told not to. In a search box that turns a correctly typed query into
  // one that matches nothing, and the user cannot see why.
  it.each([
    ['autoCapitalize="none"', 'autoCapitalize'],
    ['autoCorrect="off"', 'autoCorrect'],
    ['spellCheck={false}', 'spellCheck'],
    ['autoComplete="off"', 'autoComplete'],
  ])('sets %s on every search input', (attribute) => {
    const offenders = searchInputs()
      .filter(({ tag }) => !tag.includes(attribute))
      .map(({ path }) => path);

    expect(offenders).toEqual([]);
  });
});
