import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const bar = () => readFileSync('src/components/layout/TopControlBar.tsx', 'utf8');

const toolsSheet = () => {
  const text = bar();
  const start = text.indexOf("data-mobile-tools-section=\"game\"");
  expect(start).toBeGreaterThan(-1);
  const sheet = text.slice(start, text.indexOf('desktopViewMenu', start));
  expect(sheet.length).toBeGreaterThan(500);
  return sheet;
};

describe('mobile analysis actions', () => {
  it('offers a stop, which selfplay to end had no touch route to', () => {
    // analyzeExtra('stop') halts running analysis and selfplay alike. Its only
    // caller was the analysis menu, which is guarded by !isMobile inside a
    // component that renders only on mobile — so it never appears.
    expect(toolsSheet()).toContain("analyzeExtra('stop')");
    expect(toolsSheet()).toContain('Stop analysis');
  });

  it('offers reset analysis, the other action with no touch route', () => {
    expect(toolsSheet()).toContain('resetCurrentAnalysis()');
    expect(toolsSheet()).toContain('Reset analysis');
  });

  it('keeps selfplay next to the control that stops it', () => {
    const sheet = toolsSheet();

    expect(sheet.indexOf('Selfplay to end')).toBeLessThan(sheet.indexOf('Stop analysis'));
  });
});

describe('the analysis popover it replaced', () => {
  it('is gone, along with the state that only drove it', () => {
    const text = bar();

    // It was guarded by !isMobile inside a component that renders only on
    // mobile, so it never appeared on any viewport. Everything it uniquely
    // held — stop, reset, clear cache — now lives in the tools sheet.
    expect(text).not.toContain('closeAnalysisMenuWithFocus');
    expect(text).not.toContain('actionsMenuButtonRef');
    expect(text).not.toContain('title="Analysis actions"');
    expect(text).not.toContain('data-top-actions-menu');
  });

  it('offers clearing the cache, which had no touch route either', () => {
    expect(toolsSheet()).toContain('clearAnalysisCache()');
    expect(toolsSheet()).toContain('Clear cache');
  });
});
