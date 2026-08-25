import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Components that render on both desktop and mobile cannot name a gesture: on a
// phone "click" is wrong, and on a desktop "tap" is. Device-specific components
// (MobileHome, the mobile bars) say "Tap" and are right to — they only render
// there. These three are shared.
const SHARED_SURFACES = [
  'src/components/LessonsModal.tsx',
  'src/components/GoBoard.tsx',
  'src/components/EditToolbar.tsx',
];

const userCopy = (path: string) =>
  readFileSync(path, 'utf8')
    .split('\n')
    .filter((line) => !line.trim().startsWith('//') && !line.trim().startsWith('*'))
    .join('\n');

describe('gesture-neutral copy in shared components', () => {
  it.each(SHARED_SURFACES)('%s does not tell the user to click or tap', (path) => {
    const text = userCopy(path);

    // onClick / onDoubleClick and the like are handlers, not copy.
    expect(text).not.toMatch(/(?<!on|onDouble|onTriple|onRight)[Cc]lick (the|a|on) /);
    expect(text).not.toMatch(/[Tt]ap (the|a|to) /);
  });

  it('keeps the wording that replaced it', () => {
    const lessons = readFileSync('src/components/LessonsModal.tsx', 'utf8');

    expect(lessons).toContain('then play on the board when asked');
    expect(lessons).toContain('Choose a point on the board.');
  });
});

describe('device-specific components use their own device\'s word', () => {
  it('TopControlBar says tap, since it only renders in the mobile shell', () => {
    const layout = readFileSync('src/components/Layout.tsx', 'utf8');
    const bar = readFileSync('src/components/layout/TopControlBar.tsx', 'utf8');

    // It is rendered inside the {!isDesktop && ...} shell and the desktop
    // dashboard never imports it, so "Tap" is right and "click" was the outlier.
    expect(layout).toContain('<TopControlBar');
    expect(readFileSync('src/components/dashboard/DesktopDashboard.tsx', 'utf8')).not.toContain('TopControlBar');
    expect(bar).toContain('Region of interest active (tap to clear)');
    expect(bar).not.toContain('(click to clear)');
  });

  it('the library empty state names a control a phone actually has', () => {
    const library = readFileSync('src/components/LibraryPanel.tsx', 'utf8');

    // Dropping files in is desktop-only, so it cannot be the only route offered.
    expect(library).toContain('use the import button');
    expect(library).toContain('Import SGF, ZIP, or board image files');
  });
});
