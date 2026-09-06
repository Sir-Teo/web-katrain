import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const COMPONENTS = 'src/components';

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return entry.name.endsWith('.tsx') ? [full] : [];
  });
}

/**
 * `aria-modal="true"` tells assistive tech the rest of the page is inert. It does
 * not make it inert: Tab still walks into the background, and closing the dialog
 * drops focus onto <body> so the next Tab restarts from the top of the document.
 *
 * Measured in the browser on the library's rename and delete dialogs before this
 * guard existed: the Tab wrap never fired, and focus after close read "BODY".
 * Both now land back on the button that opened the dialog.
 *
 * `useInitialDialogFocus` does all three parts. Four mobile surfaces predate it
 * and hand-roll the same wrap against their own container refs, which is why a
 * literal 'Tab' keydown handler counts too.
 */
describe('modal dialogs manage focus', () => {
  const modalFiles = sourceFiles(COMPONENTS).filter((file) =>
    readFileSync(file, 'utf8').includes('aria-modal="true"')
  );

  it('finds the modal dialogs to check', () => {
    // If this collapses, the sweep below is silently passing on nothing.
    expect(modalFiles.length).toBeGreaterThanOrEqual(20);
  });

  it('every modal dialog traps Tab and restores focus', () => {
    const offenders = modalFiles.filter((file) => {
      const source = readFileSync(file, 'utf8');
      const usesHook = source.includes('useInitialDialogFocus');
      // Four mobile surfaces predate the hook and wrap Tab against their own refs.
      const handRolled = /key !== 'Tab'|key === 'Tab'/.test(source);
      return !usesHook && !handRolled;
    });

    expect(
      offenders.map((file) => path.relative('.', file)),
      'these render aria-modal="true" but never trap Tab; add useInitialDialogFocus'
    ).toEqual([]);
  });
});
