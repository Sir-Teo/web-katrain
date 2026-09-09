import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sweep = readFileSync('scripts/check-viewports.mjs', 'utf8');

/**
 * The contrast audit reads whatever is in the DOM when it runs, and it ran
 * once per viewport with nothing open -- after the smoke list had opened and
 * closed every dialog it knows. So the app's dialogs, which is where a
 * hard-coded colour is most likely to hide, were the one part of the UI whose
 * text had never been measured against any of the four themes.
 */
describe('the sweep measures dialog text, not just the shell', () => {
  it('lets the contrast audit be pointed at a subtree', () => {
    expect(sweep).toContain('const auditContrast = (skipSelector, scope) => {');
    expect(sweep).toContain("for (const el of (scope || document).querySelectorAll('*')) {");
    // Undefined scope has to keep meaning the whole document, or the existing
    // per-viewport pass silently stops checking anything.
    expect(sweep).toContain('contrastFailures: auditContrastAllThemes(),');
  });

  it('threads that subtree through all four themes', () => {
    expect(sweep).toContain('const auditContrastAllThemes = (scope) => {');
    expect(sweep).toContain('auditContrast(undefined, scope)');
    expect(sweep).toContain('auditContrast(jsThemed, scope)');
  });

  it('audits each dialog while it is still open', () => {
    // Ordering is the whole point: after closeDialog there is nothing left to
    // measure, which is how this gap arose in the first place.
    const audit = sweep.indexOf('modalContrastFailures.push(...auditContrastAllThemes(dialog)');
    const close = sweep.indexOf('if (!(await closeDialog(dialog, closeLabel)))');
    expect(audit).toBeGreaterThan(-1);
    expect(close).toBeGreaterThan(audit);
  });

  it('spends the theme swaps on one shell of each kind', () => {
    // Four themes apiece, each forcing a full-page recalc, is too much to run
    // at all eight viewports; contrast does not depend on the shell, but which
    // dialogs and which of their labels exist does.
    expect(sweep).toContain('const auditsModalContrast = ${(viewport.width === 1280 && viewport.height === 800)');
    expect(sweep).toContain('|| (viewport.width === 768 && viewport.height === 1024)};');
    expect(sweep).toContain('if (auditsModalContrast) {');
  });

  it('reports what it finds', () => {
    expect(sweep).toContain('modalContrastFailures,');
    expect(sweep).toContain('dialog text contrast failure(s): ');
  });
});
