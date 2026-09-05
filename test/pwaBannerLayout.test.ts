import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');

describe('desktop PWA banner layout', () => {
  it('moves clear of the open analysis panel using the panel width token', () => {
    expect(css).toContain(":root:has(.wk-dashboard[data-sidebar='open']) .pwa-install-banner");
    expect(css).toContain('right: calc(var(--sidebar-w) + max(12px, env(safe-area-inset-right)))');
  });

  it('yields to the mobile More Controls sheet, which it outranks by accident', () => {
    // The sheet is z-50 inside a zIndex: 20 ancestor, so its 50 is local and
    // this banner's root-level 45 paints over it. Measured before the fix:
    // Rotate board 98% covered, Resign and Play on from here 85%, all three
    // returning the banner from elementFromPoint.
    expect(css).toContain(":root:has([data-bottom-more-sheet='true']) .pwa-install-banner");
    const start = css.indexOf(":root:has([data-bottom-more-sheet='true']) .pwa-install-banner");
    expect(css.slice(start, css.indexOf('}', start))).toContain('display: none');
  });

  it('yields to the first-run start rail rather than climbing over the board', () => {
    /**
     * The card is fixed inside the board column, so it has only two places to
     * go on a first visit: on the start rail, or on the board. Raising it clear
     * of the rail put it over 14 intersections, N1 to T2, where a click reached
     * the card and did nothing.
     *
     * So it steps aside entirely while the rail is up -- the same treatment the
     * mobile sheet gets above -- and the rail-height reserve it used to stack on
     * is gone with it.
     */
    const selector = ":root[data-pwa-banner='install']:has([data-dashboard-hero='true']) .pwa-install-banner";
    expect(css).toContain(selector);
    expect(css).toContain(":root[data-pwa-banner='ios-install']:has([data-dashboard-hero='true'])");
    expect(css.slice(css.indexOf(selector), css.indexOf('}', css.indexOf(selector)))).toContain('display: none');
    // Only the promos step aside. `offline-ready` and `update-ready` report
    // that something happened and still show; the stage reserve keeps them off
    // the board.
    expect(css).not.toContain(":root:has([data-dashboard-hero='true']) .pwa-install-banner");
    expect(css).not.toContain('--desktop-start-rail-height');
  });

  it('reserves its own height at the foot of the board stage', () => {
    // Hiding it for the rail is only half: once the rail is dismissed the board
    // grows into the space and lands under the card again. The stage reserves
    // the height, the way it already reserves the command bar's.
    const dashboardCss = readFileSync(
      new URL('../src/components/dashboard/dashboard.css', import.meta.url),
      'utf8'
    );
    expect(dashboardCss).toContain(':root[data-pwa-banner] .wk-dashboard .board-stage');
    expect(dashboardCss).toContain('--pwa-stage-reserve: var(--pwa-banner-height, 0px)');
    // Both reserves have to add up, not replace each other.
    expect(dashboardCss).toContain(
      'padding-bottom: calc(var(--stage-pad) + var(--commandbar-reserve) + var(--pwa-stage-reserve));'
    );
  });

  it('yields to a notification on a phone, where the two share the bottom edge', () => {
    /**
     * On a phone the card, the toast, the board controls and the tab bar all
     * stack off the bottom edge, and the card's height pushes the toast up onto
     * the board. Measured at 390x844 with a game loaded: 19 of 361 intersections
     * came back from `elementFromPoint` as the toast, and dismissing the card by
     * hand took that to 0. Pre-existing -- the same 19 at the commit before
     * mobile notifications were last touched.
     */
    const start = css.indexOf(':root:has([data-notification="true"]) .pwa-install-banner');
    expect(start, 'the notification rule is gone').toBeGreaterThan(-1);
    expect(css.slice(start, css.indexOf('}', start))).toContain('display: none');

    // Scoped to the mobile shell: on a wider screen the card sits in the board
    // column's bottom corner and the toast in the top one, so hiding it there
    // would cost a promo for no gain.
    const before = css.slice(0, start);
    // The app's own mobile-shell query, not a phone-width guess: the shell runs
    // to 1023px, so a narrower scope leaves the collision on every tablet.
    const media = before.lastIndexOf('@media');
    expect(before.slice(media, media + 60)).toContain('max-width: 1023px');
  });
});
