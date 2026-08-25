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
