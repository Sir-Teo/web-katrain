import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

const mobileHome = read('src/components/MobileHome.tsx');
const desktop = read('src/components/dashboard/DesktopDashboard.tsx');
const mobileTools = read('src/components/layout/TopControlBar.tsx');
const menuDrawer = read('src/components/layout/MenuDrawer.tsx');

/** The labels the mobile home prints on its action rows. */
const homeLabels = (): string[] => [
  ...mobileHome.matchAll(/\b(?:compactLabel|label)=(?:"([^"]*)"|\{[^}]*?'([^']*)'\s*:\s*'([^']*)'\})/g),
].flatMap((match) => [match[1], match[2], match[3]].filter(Boolean) as string[]);

describe('action labels read the same on every surface', () => {
  it('finds the mobile home labels it is checking', () => {
    expect(homeLabels().length).toBeGreaterThanOrEqual(12);
  });

  // The mobile home was the only surface writing its actions in Title Case, so
  // one phone showed "Game Report" on its home screen and "Game report" in its
  // own tools menu, and the desktop said "New game" for the button the phone
  // called "New Game".
  it.each([
    ['New game', desktop],
    ['Game library', desktop],
    ['Game report', mobileTools],
    ['Save copy to library', null],
  ])('writes %s the way the rest of the app does', (label, counterpart) => {
    expect(homeLabels()).toContain(label);
    if (counterpart) expect(counterpart).toContain(label);
  });

  it('leaves the acronyms and the names used verbatim elsewhere alone', () => {
    // "Copy SGF" and "Paste SGF / OGS" are spelled identically on every
    // surface; "Photo Board" is the dialog's own title and is what the tools
    // menu and drawer print too, so lowercasing it here alone would create the
    // split this test exists to prevent.
    for (const label of ['Copy SGF', 'Paste SGF / OGS', 'Photo Board', 'Settings']) {
      expect(homeLabels()).toContain(label);
    }
    expect(menuDrawer).toContain('Photo Board');
    expect(mobileTools).toContain('Photo Board');
  });

  it('leaves no Title Case action label on the mobile home', () => {
    // A second capitalised word that is not an acronym or a kept name.
    const kept = new Set(['Copy SGF', 'Paste SGF / OGS', 'Photo Board', 'Open SGF', 'Learn Go', 'Settings', 'Library', 'Report', 'Board', 'Continue']);
    const offenders = homeLabels()
      .filter((label) => !kept.has(label))
      .filter((label) => label.split(' ').slice(1).some((word) => /^[A-Z][a-z]/.test(word)));

    expect(offenders).toEqual([]);
  });
});
