import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');

const banner = readFileSync(new URL('../src/components/PwaInstallBanner.tsx', import.meta.url), 'utf8');

describe('the reserve follows the card, not the rule that hid it', () => {
  it('reserves nothing for a card with no box', () => {
    // Three rules in this file take the card out with display: none -- a toast
    // is up, the More Controls sheet is open, the first-run rail is showing --
    // and each left --pwa-banner-height at 12px, because the gap below the card
    // was being added to a measured height of zero.
    expect(banner).toContain('if (height <= 0) {');
    expect(banner).toContain("root.style.removeProperty('--pwa-banner-height');");
  });

  it('still reserves the card plus its gap when it is showing', () => {
    expect(banner).toContain("root.style.setProperty('--pwa-banner-height', `${Math.ceil(height + 12)}px`);");
  });

  it('has consumers that fall back to nothing when it is unset', () => {
    expect(css).toContain('var(--pwa-banner-height, 0px)');
  });
});

describe('the install promos yield on a screen with no height to spare', () => {
  it('steps aside below the height that makes this the desktop shell', () => {
    // The card is fixed, but the board reserves its height so it is never
    // covered -- which on a landscape phone is a 66px band out of 390px of
    // screen. Measured: the board is 203px with the card and 263px without.
    const start = css.indexOf('  @media (max-height: 499px) {\n    :root[data-pwa-banner=');
    expect(start).toBeGreaterThan(-1);
    const block = css.slice(start, css.indexOf('\n  }\n', css.indexOf('display: none;', start)));
    expect(block).toContain("  :root[data-pwa-banner='install'] .pwa-install-banner,");
    expect(block).toContain("  :root[data-pwa-banner='ios-install'] .pwa-install-banner {");
    expect(block).toContain('display: none;');
  });

  it('leaves the two that report something rather than ask for something', () => {
    // offline-ready and update-ready say what happened; only the promos yield.
    const start = css.indexOf('  @media (max-height: 499px) {\n    :root[data-pwa-banner=');
    const block = css.slice(start, css.indexOf('\n  }\n', css.indexOf('display: none;', start)));
    expect(block).not.toContain('offline-ready');
    expect(block).not.toContain('update-ready');
  });

  it('uses the same height bound as the rest of the shell rules', () => {
    expect(css).toContain('@media (max-width: 1023px), (max-height: 499px)');
  });
});

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
