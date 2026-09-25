import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

describe('dialog focus return', () => {
  it('records the opener while the dialog first renders, before any autoFocus inside it', () => {
    // Read in the effect, the opener was the dialog's own autofocused Cancel,
    // so closing Resign or Unsaved changes dropped focus to <body>.
    const hook = read('src/hooks/useInitialDialogFocus.ts');
    expect(hook).toMatch(/const \[mountOpener\] = useState<Element \| null>\(\(\) =>\s*typeof document === 'undefined' \? null : document\.activeElement/);
    expect(hook).toContain('!ref.current?.contains(mountOpener)');
  });
});

describe('names and ARIA that assistive tech actually reads', () => {
  it('keeps slider attributes off the empty graph region', () => {
    expect(read('src/components/ScoreWinrateGraph.tsx')).toContain('aria-valuetext={hasGraphData ? (hoverTooltip || activeMoveLabel) : undefined}');
  });

  it('gives the phone save status real text instead of a label on a span', () => {
    const bar = read('src/components/layout/BottomControlBar.tsx');
    expect(bar).not.toMatch(/aria-label=\{mobileSaveStatus\.title\}/);
    expect(bar).toContain('<span className="sr-only">{mobileSaveStatus.title}</span>');
  });

  it('heads the More Controls sheet', () => {
    expect(read('src/components/layout/BottomControlBar.tsx')).toContain('<h2 id={moreSheetTitleId}');
  });

  it('names buttons starting with what they show (WCAG 2.5.3)', () => {
    expect(read('src/components/layout/LanguageSwitcher.tsx')).toContain('aria-label={`SGF · ${getAppLocaleShortLabel(activeLocale.value)}, document language:');
    const tenuki = read('src/components/TenukiRow.tsx');
    expect(tenuki).not.toContain('aria-label="Ask what playing elsewhere would cost"');
    expect(tenuki).toContain('aria-describedby={tenukiDescriptionId}');
  });
});

describe('dashboard toggles state their state once', () => {
  const dashboard = read('src/components/dashboard/DesktopDashboard.tsx');

  it('names the panel toggles for the panel and reports open/closed with aria-expanded', () => {
    for (const [name, flag] of [['Library', 'libraryOpen'], ['Game info', 'gamestripOpen'], ['Analysis', 'sidebarOpen'], ['Metrics', 'commandbarOpen']]) {
      expect(dashboard, name).toContain(`aria-label="${name}"`);
      expect(dashboard, name).toContain(`aria-expanded={${flag}}`);
      expect(dashboard, name).not.toContain(`aria-pressed={${flag}}`);
    }
  });
});

describe('desktop review progress', () => {
  it('is a progressbar with a coarse polite announcement', () => {
    const dashboard = read('src/components/dashboard/DesktopDashboard.tsx');
    expect(dashboard).toMatch(/className="progress-track"\s*role="progressbar"\s*aria-label="Game review"/);
    expect(dashboard).toContain('<div className="sr-only" role="status" aria-live="polite">');
    expect(dashboard).toContain("'Game review finished'");
  });
});

describe('the board for assistive tech', () => {
  it('is an application that announces the keyboard cursor point', () => {
    // Its cursor moved on screen only; nothing said which point it was on.
    const board = read('src/components/GoBoard.tsx');
    expect(board).toContain('role="application"');
    expect(board).toContain('aria-roledescription="Go board"');
    expect(board).toContain('aria-describedby={boardCursorStatusId}');
    expect(board).toContain("return `${point}, ${stone ? `${stone} stone` : 'empty'}`;");
  });
});
