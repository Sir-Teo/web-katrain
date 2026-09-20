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

  it('routes initial focus through the hook rather than a timer', () => {
    // The hook's `initialFocusRef` defers by an animation frame on purpose: a
    // menu closing behind the dialog restores focus to its own trigger, and a
    // `setTimeout(..., 0)` runs before that lands. PasteSgfModal had one, with
    // no cleanup either. The hook is in src/hooks, so its own rAF is not swept.
    const offenders = modalFiles.filter((file) =>
      /(setTimeout|requestAnimationFrame)\(\s*\(\)\s*=>\s*[\w.]*Ref\.current\??\.focus\(\)/.test(
        readFileSync(file, 'utf8'),
      ),
    );

    expect(
      offenders.map((file) => path.relative('.', file)),
      'these schedule their own initial focus; pass initialFocusRef to useInitialDialogFocus instead'
    ).toEqual([]);
  });
});

/**
 * `overlayBackStack` exists so an Android back press dismisses what is on top
 * instead of leaving the page — and closing the app outright when installed.
 * The only way into it is `useEscapeToClose`, so a dialog that handles Escape
 * itself silently opts out of the back gesture too.
 *
 * Four had, all for the same reason: they listen in the *capture* phase
 * deliberately, because Layout's scoring-mode and focus-mode Escape handlers do
 * not check `defaultPrevented`, so a bubble listener would close the dialog and
 * drop out of scoring with it. They now pair that key handling with
 * `useBackGestureToClose`. Two of them — the mobile tools sheet and the bottom
 * "More" sheet — exist only on touch, which is the one place back is the
 * expected way out.
 */
describe('modal dialogs answer the back gesture', () => {
  const modalFiles = sourceFiles(COMPONENTS).filter((file) =>
    readFileSync(file, 'utf8').includes('aria-modal="true"')
  );

  /**
   * The auto-save recovery prompt is the one dialog that deliberately has no
   * dismissal at all: `modalAccessibility.test.ts` pins it as a forced choice
   * and asserts it never imports the escape hook, because both of its buttons
   * change something. That leaves a real gap — a back press with it open still
   * leaves the app — but closing it means deciding what back should mean there,
   * which is a product call rather than a bug fix.
   */
  const FORCED_CHOICE = ['src/components/AutoSaveRecoveryModal.tsx'];

  it('every modal dialog registers with the overlay back stack', () => {
    const offenders = modalFiles
      .filter((file) => !FORCED_CHOICE.includes(path.relative('.', file)))
      .filter((file) => {
        const source = readFileSync(file, 'utf8');
        return !/useEscapeToClose|useBackGestureToClose/.test(source);
      });

    expect(
      offenders.map((file) => path.relative('.', file)),
      'these render aria-modal="true" but never reach overlayBackStack; a back press leaves the app'
    ).toEqual([]);
  });

  it('keeps that exception to the one dialog that is a forced choice', () => {
    // If the file is renamed or the prompt gains a dismissal, this stops
    // silently excusing something.
    for (const file of FORCED_CHOICE) {
      const source = readFileSync(file, 'utf8');
      expect(source, `${file} no longer exists or is no longer modal`).toContain('aria-modal="true"');
      expect(source, `${file} now has a dismissal; drop it from FORCED_CHOICE`)
        .not.toMatch(/useEscapeToClose|useBackGestureToClose/);
    }
  });

  it('keeps the back stack reachable from exactly one module', () => {
    // If a second caller appears, the sweep above stops proving anything.
    const callers = sourceFiles('src')
      .concat(
        readdirSync('src/hooks').map((name) => path.join('src/hooks', name)),
      )
      .filter((file) => file.endsWith('.ts') || file.endsWith('.tsx'))
      .filter((file) => !file.endsWith('overlayBackStack.ts'))
      .filter((file) => /\boverlayBackStack\s*\(/.test(readFileSync(file, 'utf8')));

    expect([...new Set(callers.map((file) => path.relative('.', file)))]).toEqual([
      'src/hooks/useEscapeToClose.ts',
    ]);
  });
});
