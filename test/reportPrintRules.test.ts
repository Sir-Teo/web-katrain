import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const report = readFileSync('src/components/GameReportModal.tsx', 'utf8');
const css = readFileSync('src/index.css', 'utf8');
const dashboardCss = readFileSync('src/components/dashboard/dashboard.css', 'utf8');

describe('the report print stylesheet reaches what it describes', () => {
  it('applies its keep-together rule to the rows that repeat', () => {
    // It had one occurrence in the file -- its own definition -- so a page
    // boundary could fall through a critical swing or a recovery, splitting a
    // move number from its numbers.
    const uses = report.match(/print-break-avoid/g) ?? [];
    expect(uses.length).toBeGreaterThan(1);
    expect(report).toContain(
      'className="print-break-avoid flex items-center justify-between gap-4 rounded border border-slate-300 px-3 py-2"'
    );
  });

  it('names a font that will actually render', () => {
    // This app ships no web font and loads none; a name that cannot resolve
    // described a fallback as though it were a choice. Asserted on the
    // declarations rather than the file, because the comment beside the fix
    // names the font it removed.
    const families = [...report.matchAll(/font-family:([^;]+);/g)].map((m) => m[1]!.trim());
    expect(families.length).toBeGreaterThan(0);
    for (const family of families) {
      expect(family, family).toMatch(/Times New Roman|serif|sans-serif|monospace|var\(--/);
      expect(family, family).not.toMatch(/Source Serif/);
    }
  });

  it('is still true that no web font is fetched', () => {
    // The reason the name above could never resolve, asserted where the print
    // rule can see it.
    for (const sheet of [css, dashboardCss, report]) {
      expect(sheet).not.toContain('fonts.googleapis.com');
      expect(sheet).not.toContain('fonts.gstatic.com');
      expect(sheet).not.toContain('@font-face');
    }
  });
});
