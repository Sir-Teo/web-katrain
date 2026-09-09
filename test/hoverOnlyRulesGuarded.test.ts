import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sheets = {
  'src/index.css': readFileSync('src/index.css', 'utf8'),
  'src/components/dashboard/dashboard.css': readFileSync('src/components/dashboard/dashboard.css', 'utf8'),
};
const css = sheets['src/index.css'];

interface Rule {
  selector: string;
  /** The at-rule preludes enclosing it, outermost first. */
  context: string[];
  line: number;
  /** file:line, for a failure message that says which stylesheet. */
  where: string;
}

const stripComments = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, ' ');
const squash = (text: string) => stripComments(text).replace(/\s+/g, ' ').trim();

/**
 * Every style rule in the file with the at-rules that enclose it. Written here
 * rather than imported so the test does not share a bug with the thing it
 * checks; a stylesheet is brace-nested and comment-bearing, and nothing else.
 */
function parseRules(source: string): Rule[] {
  const out: Rule[] = [];
  const open: Array<{ prelude: string; kind: 'at' | 'rule' }> = [];
  let preludeStart = 0;
  for (let i = 0; i < source.length; i += 1) {
    if (source[i] === '/' && source[i + 1] === '*') {
      const end = source.indexOf('*/', i + 2);
      i = (end === -1 ? source.length : end + 1);
      continue;
    }
    const c = source[i];
    if (c === '{') {
      const prelude = source.slice(preludeStart, i);
      const kind = stripComments(prelude).trimStart().startsWith('@') ? 'at' : 'rule';
      if (kind === 'rule') {
        out.push({
          selector: squash(prelude),
          context: open.filter((b) => b.kind === 'at').map((b) => squash(b.prelude)),
          line: source.slice(0, i).split('\n').length,
          where: '',
        });
      }
      open.push({ prelude, kind });
      preludeStart = i + 1;
    } else if (c === '}') {
      open.pop();
      preludeStart = i + 1;
    } else if (c === ';' && (open.length === 0 || open[open.length - 1]!.kind === 'at')) {
      preludeStart = i + 1;
    }
  }
  return out;
}

const rules = Object.entries(sheets).flatMap(([file, source]) =>
  parseRules(source).map((rule) => ({ ...rule, where: `${file}:${rule.line}` })));
const selectorParts = (rule: Rule) => rule.selector.split(',').map((p) => p.trim()).filter(Boolean);
describe('hover styling is for pointers that hover', () => {
  it('parses the stylesheet it is checking', () => {
    expect(rules.length).toBeGreaterThan(500);
    expect(rules.some((r) => r.selector === 'body')).toBe(true);
    // Both stylesheets, not just the big one: the dashboard is the desktop
    // shell, which a tablet reaches with a finger at 1024x500 and up.
    expect(rules.some((r) => r.where.startsWith('src/components/dashboard/'))).toBe(true);
  });

  it('guards every hover selector in the file', () => {
    // A touch tap in Chrome puts :hover on what it hit and every ancestor, and
    // leaves it there until the next tap somewhere else -- measured on
    // .panel-section-header, which stayed in its hover fill after a tap so a
    // collapsed section read as a selected one.
    const unguarded = rules
      .filter((r) => selectorParts(r).some((p) => p.includes(':hover')))
      .filter((r) => !r.selector.includes('scrollbar'))
      .filter((r) => !r.context.some((c) => c.replace(/\s/g, '') === '@media(hover:hover)'))
      .map((r) => `${r.selector} (${r.where})`);
    expect(unguarded, `unguarded hover rules:\n${unguarded.join('\n')}`).toEqual([]);
  });

  it('kept the keyboard half of the rules it split out of the guard', () => {
    // Splitting is what makes the blanket guard above safe: a rule that listed
    // :hover next to :focus-visible or a state class would otherwise have taken
    // the focus ring away from a tablet with a keyboard.
    const guarded = rules.filter((r) =>
      r.context.some((c) => c.replace(/\s/g, '') === '@media(hover:hover)'));
    // Nothing inside the guard may mention anything but hover...
    for (const rule of guarded) {
      for (const part of selectorParts(rule)) {
        expect(part, `${rule.selector} (${rule.where})`).toContain(':hover');
        expect(part, `${rule.selector} (${rule.where})`).not.toContain(':focus');
      }
    }
    // ...and the halves that were split off are still in the file.
    for (const selector of [
      ".settings-modal .settings-search-result[aria-selected='true']",
      '.move-tree-control-button.active',
      '.candidate-list-head .cl-detail-toggle.is-on',
      '.candidate-row:focus-visible',
      '.library-tree-node:focus-within .library-tree-node-actions',
    ]) {
      expect(css, selector).toContain(selector);
    }
  });

  it('leaves a scrollbar thumb unguarded, since no finger reaches one', () => {
    const thumbs = rules.filter((r) => r.selector.includes('scrollbar') && r.selector.includes(':hover'));
    expect(thumbs.length).toBeGreaterThan(0);
    for (const rule of thumbs) {
      expect(
        rule.context.some((c) => c.replace(/\s/g, '') === '@media(hover:hover)'),
        `${rule.selector} (${rule.where})`
      ).toBe(false);
    }
  });

});
