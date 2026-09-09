import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const SHEETS = ['src/index.css', 'src/components/dashboard/dashboard.css'] as const;

const sheets = SHEETS.map((path) => ({ path, css: readFileSync(path, 'utf8') }));

/** Classes the app actually switches off, i.e. ones that style `:disabled`. */
const disabledClasses = (css: string): string[] =>
  [...new Set([...css.matchAll(/\.([a-z0-9_-]+):disabled/g)].map((m) => m[1]!))].sort();

describe('hover rules on controls that can be disabled', () => {
  it('guards every hover rule whose class has a disabled state', () => {
    const offenders = sheets.flatMap(({ path, css }) =>
      disabledClasses(css).flatMap((cls) =>
        [...css.matchAll(new RegExp(`\\.${cls}(?:\\.[a-z-]+)?:hover(?!:where\\(:not\\(:disabled\\)\\))`, 'g'))]
          .map((m) => `${path}:${css.slice(0, m.index).split('\n').length} ${m[0]}`),
      ),
    );

    // The PWA install buttons are the exception the loop still allows: their
    // :disabled rule sets `filter: none`, undoing the only thing their hover
    // rule sets, and it is written after it at equal specificity.
    expect(offenders.filter((o) => !o.includes('pwa-install'))).toEqual([]);
  });

  it('never guards with a bare :not(:disabled)', () => {
    // `:not()` takes its argument's specificity, so `.x:hover:not(:disabled)`
    // outweighs the `.x.active` and `.x.danger` rules written below it.
    // Measured in Chromium against the built stylesheet: hovering an active
    // analysis-command-bar toggle, an active manual-score method tab, or a
    // danger panel-action button turned all three from their accent or danger
    // colour to plain --ui-text. `:where()` contributes no specificity, so
    // source order decides again and the modifiers win.
    const offenders = sheets
      .filter(({ css }) => /:hover:not\(:disabled\)/.test(css))
      .map(({ path }) => path);

    expect(offenders).toEqual([]);
  });

  it('finds the guards it is meant to be watching', () => {
    // Without this the two assertions above pass on a stylesheet where the
    // pattern stopped occurring, including one a bad regex cannot see.
    const guards = sheets.reduce(
      (total, { css }) => total + (css.match(/:hover:where\(:not\(:disabled\)\)/g) ?? []).length,
      0,
    );

    expect(guards).toBeGreaterThanOrEqual(15);
  });
});
