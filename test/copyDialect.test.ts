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

/** Comments are prose for us, not for the reader, and may say what they like. */
const stripComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const STRING_LITERAL = /'([^'\\\n]{4,})'|"([^"\\\n]{4,})"|`([^`\\]{4,})`/g;

// Only literals containing a space: a lone identifier is a key or a class name,
// never a sentence someone reads.
const prose = (source: string): { text: string; index: number }[] =>
  [...stripComments(source).matchAll(STRING_LITERAL)]
    .map((match) => ({ text: (match[1] ?? match[2] ?? match[3])!, index: match.index! }))
    .filter(({ text }) => text.includes(' '));

const BRITISH = [
  'analysed', 'analysing', 'colour', 'colours', 'coloured', 'grey', 'cancelled',
  'behaviour', 'centre', 'favourite', 'recognise', 'customise', 'organise',
  'licence', 'defence',
];

const sources = collectSourceFiles('src').map((path) => ({ path, source: readFileSync(path, 'utf8') }));

describe('user-facing copy keeps one dialect', () => {
  it('spells its prose the way the rest of the app does', () => {
    // Measured before the fix: "analyzed" appeared in 22 strings and
    // "analysed" in 4; "Import canceled." shipped alongside "OGS request
    // cancelled."; "Swap traced stone colors" alongside a lesson about "one
    // colour". Nothing was wrong with either spelling -- only with using both.
    const offenders = sources.flatMap(({ path, source }) =>
      prose(source).flatMap(({ text, index }) =>
        BRITISH.filter((word) => new RegExp(`\\b${word}\\b`, 'i').test(text)).map(
          (word) => `${path}:${stripComments(source).slice(0, index).split('\n').length} ${word} in "${text.slice(0, 60)}"`,
        ),
      ),
    );

    expect(offenders).toEqual([]);
  });

  it('counts the things it is talking about', () => {
    // One string in the app wrote "Moved 3 item(s); skipped 1 invalid move(s)."
    // while the line directly below it wrote "Moved 3 selected items." — the
    // same action, reported two ways, and the only "(s)" anywhere. It also used
    // "move" as a noun for a drag in an app where a move is a stone.
    const offenders = sources.flatMap(({ path, source }) =>
      prose(source)
        .filter(({ text }) => /\b[a-z]+\(s\)/i.test(text))
        .map(({ text, index }) =>
          `${path}:${stripComments(source).slice(0, index).split('\n').length} "${text.slice(0, 60)}"`),
    );

    expect(offenders, 'write the plural out: `${n} item${n === 1 ? \'\' : \'s\'}`').toEqual([]);
  });

  it('reads enough prose to be checking anything', () => {
    // Without this the assertion above passes on a literal matcher that broke.
    const total = sources.reduce((count, { source }) => count + prose(source).length, 0);

    expect(total).toBeGreaterThanOrEqual(500);
  });

  it('leaves the stored trainer theme value spelled as KaTrain stores it', () => {
    // This one is a persisted setting shared with KaTrain, not copy. Only the
    // option's visible text was Americanised; renaming the value would drop
    // the saved preference of anyone already using it.
    const settings = readFileSync('src/components/SettingsModal.tsx', 'utf8');

    expect(settings).toContain('<option value="theme:red-green-colourblind">Red/Green colorblind</option>');
    expect(readFileSync('src/types.ts', 'utf8')).toContain("'theme:red-green-colourblind'");
    expect(readFileSync('src/utils/katrainTheme.ts', 'utf8')).toContain("'theme:red-green-colourblind'");
  });
});
