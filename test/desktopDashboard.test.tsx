import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { APP_ISSUE_REPORT_URL } from '../src/utils/appInfo';

describe('DesktopDashboard', () => {
  it('keeps the primary desktop shell wired to issue reporting', () => {
    const source = readFileSync('src/components/dashboard/DesktopDashboard.tsx', 'utf8');
    const icons = readFileSync('src/components/dashboard/icons.tsx', 'utf8');

    expect(source).toContain('APP_ISSUE_REPORT_URL');
    expect(source).toContain('data-dashboard-report-issue="true"');
    expect(source).toContain('aria-label="Report an issue on GitHub"');
    expect(source).toContain('rel="noopener noreferrer"');
    expect(source).toContain('<Icon name="bug" />');
    expect(icons).toContain('bug:');
    expect(APP_ISSUE_REPORT_URL).toBe('https://github.com/Sir-Teo/web-katrain/issues/new/choose');
  });

  it('puts the play-on toggle beside the review actions, with a visible pressed state', () => {
    const source = readFileSync('src/components/dashboard/DesktopDashboard.tsx', 'utf8');
    const css = readFileSync('src/components/dashboard/dashboard.css', 'utf8');

    expect(source).toContain('onPlayFromHere');
    expect(source).toContain('aria-pressed={!!engineOpponent}');
    // aria-pressed alone was true for a screen reader and invisible to
    // everyone else: .tbtn had no pressed style before this toggle existed.
    expect(source).toContain("`tbtn${engineOpponent ? ' on' : ''}`");
    expect(css).toContain('.wk-dashboard .tbtn.on');
  });

  it('tells the Swing chip what it is measuring against, and why not', () => {
    const source = readFileSync('src/components/dashboard/DesktopDashboard.tsx', 'utf8');
    const swing = readFileSync('src/utils/territorySwing.ts', 'utf8');

    // Turning a toggle on and seeing no change reads as broken, and each reason
    // wants something different from the reader: wait, play a move, or "that is
    // the answer". The reasons live with the resolver that decides between them.
    expect(source).toContain('resolveSwingBaseline(currentNode, settings.analysisSwingCompare');
    expect(source).toContain("if (baseline.kind === 'unavailable') return baseline.reason;");
    // And the chip names the baseline, so "13 toward Black" is never ambiguous
    // about what it is 13 more than.
    expect(source).toContain("baseline.kind === 'best' ? `vs ${baseline.label}` : 'vs the move before'");
    expect(swing).toContain("'needs this move and the one before it analysed'");
    expect(swing).toContain('play ${label} from the previous move to compare against it');
  });

  it('keeps the language switcher on the wide desktop dashboard header', () => {
    const source = readFileSync('src/components/dashboard/DesktopDashboard.tsx', 'utf8');
    const css = readFileSync('src/components/dashboard/dashboard.css', 'utf8');

    expect(source).toContain("import { LanguageSwitcher } from '../layout/LanguageSwitcher';");
    expect(source).toContain('className="dashboard-language-switcher"');
    expect(source).toContain('onLocaleChange={(appLocale) => updateSettings({ appLocale })}');
    expect(readFileSync('src/index.css', 'utf8')).toContain('@media (min-width: 1280px)');
    expect(css).toContain('.wk-dashboard .dashboard-language-switcher');
    expect(css).toContain('.wk-dashboard[data-layout="compact"] .dashboard-language-switcher');
  });

  it('moves keyboard focus into dashboard popovers and restores their trigger on Escape', () => {
    const source = readFileSync('src/components/dashboard/DesktopDashboard.tsx', 'utf8');

    expect(source).toContain("inputMode: e.detail === 0 ? 'keyboard' : 'pointer'");
    expect(source).toContain("document.querySelector<HTMLElement>('[data-dashboard-popover=\"true\"]')");
    expect(source).toContain('(firstControl ?? popover)?.focus({ preventScroll: true })');
    expect(source).toContain('popTriggerRef.current?.focus({ preventScroll: true })');
    expect(source).toContain('closePopWithFocus();');
    expect(source.match(/^\s+data-dashboard-popover="true"/gm) ?? []).toHaveLength(4);
    expect(source.match(/aria-modal="false"/g) ?? []).toHaveLength(4);
    for (const label of ['File actions', 'Help', 'Engine details', 'View options']) {
      expect(source).toContain(`aria-label="${label}"`);
    }
  });

  it('keeps the compact desktop navigation rail on one row', () => {
    const css = readFileSync('src/components/dashboard/dashboard.css', 'utf8');
    // 880px, not 699: measured, the rail needs 865px once these rules stop
    // applying, so the lower threshold wrapped every column in between.
    const compactNavBlock = css.match(/@container boardcol \(max-width: 880px\) \{[\s\S]*?\n\}\n\n\/\*/)?.[0] ?? '';

    expect(compactNavBlock).toContain('.wk-dashboard .navbtn-skip { display: none; }');
    expect(compactNavBlock).toContain('.wk-dashboard .move-counter .mc-label { display: none; }');
    expect(compactNavBlock).toContain('.wk-dashboard .pass-btn { padding: 0 10px; }');
    expect(compactNavBlock).toContain('.wk-dashboard .move-counter input { width: 32px; }');
    expect(compactNavBlock).toContain('.wk-dashboard .navbar { padding: 8px 8px 12px; }');
    expect(css).not.toContain('@container boardcol (max-width: 619px)');
  });

  it('uses a single-line metric rail across desktop layouts', () => {
    const source = readFileSync('src/components/dashboard/DesktopDashboard.tsx', 'utf8');
    const css = readFileSync('src/components/dashboard/dashboard.css', 'utf8');
    const metricBlock = css.match(/\.wk-dashboard \.cb-metric \{[\s\S]*?\n\}/)?.[0] ?? '';

    expect(metricBlock).toContain('display: grid;');
    expect(metricBlock).toContain('grid-template-columns: auto max-content minmax(0, 1fr);');
    expect(metricBlock).toContain('align-items: center;');
    expect(metricBlock).toContain('padding: 7px 10px;');
    expect(css).not.toContain('.wk-dashboard[data-layout="compact"] .cb-metric {');
    expect(source).not.toContain('<div className="sub">score lead</div>');
    expect(source).toContain("`${(bestMove.winRate * 100).toFixed(0)}% Black win · ${formatVisitCount(bestMove.visits)} visits`");
    expect(source).toContain("`${(bestMove.winRate * 100).toFixed(1)}% Black win rate · ${bestMove.visits} visits`");
    // Coach mode keeps the engine's numbers off the best-move tile.
    expect(source).toContain("isProDetail ? `${(bestMove.winRate * 100).toFixed(0)}% Black win");
    expect(css).toMatch(/\.wk-dashboard\[data-layout="compact"\] \.cb-metric \.sub \{\s*display: none;/);
  });

  it('merges first-run actions into the compact game strip', () => {
    const source = readFileSync('src/components/dashboard/DesktopDashboard.tsx', 'utf8');
    const css = readFileSync('src/components/dashboard/dashboard.css', 'utf8');

    expect(source).toContain("const showCompactStartStrip = showHero && layoutMode === 'compact' && gamestripOpen");
    expect(source).toContain('data-dashboard-compact-start="true"');
    expect(source).toContain("className={`gamestrip${showCompactStartStrip ? ' start-strip' : ''}`}");
    expect(source).toContain('{showHero && !showCompactStartStrip && (');
    expect(source.match(/\{renderStartActions\(\)\}/g) ?? []).toHaveLength(2);
    expect(css).toMatch(/\.wk-dashboard \.gamestrip\.start-strip \{[^}]*flex-wrap: nowrap;[^}]*padding: 4px 8px;/);
    expect(css).toMatch(/\.wk-dashboard \.compact-start \{[^}]*display: flex;[^}]*width: 100%;/);
  });

  it('reflects current-line boundaries in the desktop navigation rail', () => {
    const source = readFileSync('src/components/dashboard/DesktopDashboard.tsx', 'utf8');

    for (const control of ['navigateStart', 'jumpBack', 'navigateBack']) {
      expect(source).toMatch(new RegExp(`onClick=\\{${control}\\} disabled=\\{!canNavigateBack\\}`));
    }
    for (const control of ['navigateForward', 'jumpForward', 'navigateEnd']) {
      expect(source).toMatch(new RegExp(`onClick=\\{${control}\\} disabled=\\{!canNavigateForward\\}`));
    }
    expect(source).toMatch(/title=\{canNavigateBack \? 'Undo' : 'No move to undo'\}[\s\S]{0,80}disabled=\{!canNavigateBack\}/);
  });
});
