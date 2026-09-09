import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sweep = readFileSync('scripts/check-viewports.mjs', 'utf8');
const help = readFileSync('src/components/KeyboardHelpModal.tsx', 'utf8');

/**
 * An element can paint outside its own container without widening the
 * document, so documentOverflow stays 0 and nothing notices. That is how the
 * keyboard help's "Middle-click a candidate" chip -- shrink-0 and 189px wide,
 * in a 234px row at 320px -- hung 48px outside its row and 5px off the screen
 * while every existing check passed: the page did not overflow, the text was
 * not clipped by its own box, and the target was far over 44px.
 */
describe('the help rows can wrap when a chip does not fit', () => {
  it('wraps both lists, not just the one that broke', () => {
    // The pointer and gamepad lists are the same row markup. Only the pointer
    // list has a phrase long enough to overflow today.
    expect(help.match(/className="flex flex-wrap items-center justify-between gap-3 rounded-md/g) ?? [])
      .toHaveLength(2);
    expect(help).not.toContain('className="flex items-center justify-between gap-3 rounded-md');
  });

  it('keeps the chip itself unsqueezable', () => {
    // Wrapping is the release valve precisely so shrink-0 can stay: a key name
    // squeezed narrower than its text is worse than one on its own line.
    expect(help).toContain('<kbd className="shrink-0 rounded bg-[var(--ui-panel)]');
  });

  it('still has a phrase long enough to need it', () => {
    expect(help).toContain("control: 'Middle-click a candidate'");
  });
});

describe('the sweep looks for dialog content painting off-screen', () => {
  it('audits every dialog it opens', () => {
    expect(sweep).toContain('const auditDialogSpill = (scope) => {');
    expect(sweep).toContain('modalSpillFailures.push(...auditDialogSpill(dialog)');
    expect(sweep).toContain('dialog element(s) painting off-screen: ');
  });

  it('measures against the viewport on both edges', () => {
    expect(sweep).toContain('Math.round(Math.max(r.right - window.innerWidth, -r.left))');
  });

  it('names the innermost element, not its ancestors', () => {
    // Every ancestor of a spilling element spills too; only the innermost one
    // names the thing to fix.
    expect(sweep).toContain('if (Array.from(el.children).some((child) => {');
  });

  it('carries no scrollable-ancestor exemption', () => {
    // Both ways of writing one are wrong, and both let the real bug through:
    // overflow-x computes to auto whenever the other axis is not visible, and
    // scrollWidth > clientWidth is true of the overflowing element itself.
    const start = sweep.indexOf('const auditDialogSpill = (scope) => {');
    const body = sweep.slice(start, sweep.indexOf('\n        };', start));
    expect(body).toContain('There is deliberately no "but an ancestor scrolls sideways"');
    expect(body).not.toMatch(/scrollable\s*=\s*true/);
  });

  it('skips what is off-screen on purpose', () => {
    expect(sweep).toContain("if (el.classList.contains('sr-only')) continue;");
  });

  it('exempts a deliberate sideways scroller by name, not by rule', () => {
    // The pro-games featured rail is flex-nowrap with overflow-x-auto under lg,
    // so its chips run past the edge on purpose. That is a named exemption of
    // one region -- not a general "an ancestor scrolls" rule, which is the
    // thing that let the real bug through.
    const start = sweep.indexOf('const auditDialogSpill = (scope) => {');
    const body = sweep.slice(start, sweep.indexOf('\n        };', start));
    expect(body).toContain("const sidewaysScrollers = '.pro-games-featured';");
    expect(body).toContain('if (el.closest(sidewaysScrollers)) continue;');
    // Named regions only: no computed-overflow test may creep back in.
    expect(body).not.toContain('overflowX');
  });
});
