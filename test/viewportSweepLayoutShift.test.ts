import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sweep = readFileSync('scripts/check-viewports.mjs', 'utf8');

/**
 * Every box can be the right size and in the right place by the time the
 * sweep's measurements run, and the page can still have thrown its content
 * around getting there -- which is what someone reaching for a control
 * actually experiences. Nothing else in the suite could see that.
 */
describe('the viewport sweep holds the page to a layout-shift budget', () => {
  it('observes shifts from before the app boots', () => {
    // buffered:true alone would miss entries dispatched before the observer
    // existed, so it goes in through addScriptToEvaluateOnNewDocument.
    expect(sweep).toContain("cdp.send('Page.addScriptToEvaluateOnNewDocument', {");
    expect(sweep).toContain("observe({ type: 'layout-shift', buffered: true })");
  });

  it('counts only what moves on its own', () => {
    // A shift within 500ms of a click is the page answering the click; the
    // sweep clicks through the whole app below.
    expect(sweep).toContain('if (entry.hadRecentInput) continue;');
  });

  it('measures the quiet window after the shell settles', () => {
    const reset = sweep.indexOf('window.__shifts = []; return true;');
    const ready = sweep.indexOf('await waitForShellReady(cdp);');
    expect(reset).toBeGreaterThan(ready);
    expect(ready).toBeGreaterThan(-1);
    // ...and closes it before anything is clicked.
    const read = sweep.indexOf('const layoutShift = await evaluate(cdp,');
    expect(read).toBeGreaterThan(reset);
    expect(sweep.slice(reset, read)).toContain('await sleep(700);');
  });

  it('applies the budget to every viewport, not just the desktop ones', () => {
    // It first landed inside the `if (result.desktop)` branch, where the five
    // mobile viewports never reached it.
    const at = sweep.indexOf('if (result.layoutShift && result.layoutShift.total > 0.05) {');
    expect(at).toBeGreaterThan(-1);
    const desktopBranch = sweep.indexOf('if (result.desktop) {');
    const desktopBranchEnd = sweep.indexOf('\n  }\n', desktopBranch);
    expect(at > desktopBranch && at < desktopBranchEnd).toBe(false);
  });

  it('names what moved when it fails', () => {
    // A bare number sends the next person hunting; the element and how far it
    // went is the whole lead. Confirmed against an injected 10px shift:
    // "layout shifts after the shell settled: 0.0118 (0.0118 div... y0->10)".
    expect(sweep).toContain('layout shifts after the shell settled: ${result.layoutShift.total.toFixed(4)}');
    expect(sweep).toContain('${result.layoutShift.worst.join(\'; \')}');
  });
});
