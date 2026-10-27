import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as ts from 'typescript';

const collectSourceFiles = (dir: string): string[] => {
  const files: string[] = [];

  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) files.push(...collectSourceFiles(path));
    else if (/\.tsx?$/.test(path) && !path.endsWith('.test.ts')) files.push(path);
  }

  return files;
};

// Only literals containing a space: a lone identifier is a key or a class name,
// never a sentence someone reads.
const prose = (source: string, path = 'source.tsx'): { text: string; index: number }[] => {
  // A regex lost quote boundaries around short literals and interpolated
  // templates, then reported return 'cancelled' as user-facing prose.
  const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
  const result: { text: string; index: number }[] = [];
  const visit = (node: ts.Node) => {
    const text = ts.isStringLiteralLike(node) ? node.text : ts.isTemplateExpression(node)
      ? node.head.text + node.templateSpans.map((span) => span.literal.text).join('') : null;
    if (text?.includes(' ')) result.push({ text, index: node.getStart(file) });
    ts.forEachChild(node, visit);
  };
  visit(file);
  return result;
};

const BRITISH = [
  'analysed', 'analysing', 'colour', 'colours', 'coloured', 'grey', 'cancelled',
  'behaviour', 'centre', 'favourite', 'recognise', 'customise', 'organise',
  'licence', 'defence',
];

const sources = collectSourceFiles('src').map((path) => {
  const source = readFileSync(path, 'utf8');
  return { path, source, literals: prose(source, path) };
});

describe('user-facing copy keeps one dialect', () => {
  it('spells its prose the way the rest of the app does', () => {
    // Measured before the fix: "analyzed" appeared in 22 strings and
    // "analysed" in 4; "Import canceled." shipped alongside "OGS request
    // cancelled."; "Swap traced stone colors" alongside a lesson about "one
    // colour". Nothing was wrong with either spelling -- only with using both.
    const offenders = sources.flatMap(({ path, source, literals }) =>
      literals.flatMap(({ text, index }) =>
        BRITISH.filter((word) => new RegExp(`\\b${word}\\b`, 'i').test(text)).map(
          (word) => `${path}:${source.slice(0, index).split('\n').length} ${word} in "${text.slice(0, 60)}"`,
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
    const offenders = sources.flatMap(({ path, source, literals }) =>
      literals
        .filter(({ text }) => /\b[a-z]+\(s\)/i.test(text))
        .map(({ text, index }) =>
          `${path}:${source.slice(0, index).split('\n').length} "${text.slice(0, 60)}"`),
    );

    expect(offenders, 'write the plural out: `${n} item${n === 1 ? \'\' : \'s\'}`').toEqual([]);
  });

  it('reads enough prose to be checking anything', () => {
    // Without this the assertion above passes on a literal matcher that broke.
    const total = sources.reduce((count, { literals }) => count + literals.length, 0);

    expect(total).toBeGreaterThanOrEqual(500);
  });

  it('reads template prose without mistaking adjacent code for a sentence', () => {
    const source = "const message = `Loaded ${name}.`; if (gone) return 'cancelled'; // grey colour";
    expect(prose(source).map(({ text }) => text)).toEqual(['Loaded .']);
    expect(prose("const message = `Your favourite ${name}.`;").map(({ text }) => text))
      .toEqual(['Your favourite .']);
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
