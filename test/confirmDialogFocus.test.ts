import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// The confirm dialogs are the highest-stakes modals in the app — discard the
// game, resign, clear the analysis cache. They all carried role="dialog" and
// aria-modal, which tells assistive tech the rest of the page is inert but does
// nothing about Tab: focus walked straight out onto controls behind the scrim.
const CONFIRM_DIALOGS = [
  'src/components/ResignConfirmModal.tsx',
  'src/components/AnalysisCacheClearConfirmModal.tsx',
  'src/components/UnsavedChangesModal.tsx',
  'src/components/AutoSaveRecoveryModal.tsx',
];

describe('confirm dialogs', () => {
  it.each(CONFIRM_DIALOGS)('keeps Tab inside %s', (path) => {
    const source = readFileSync(path, 'utf8');

    expect(source).toContain("from '../hooks/useInitialDialogFocus'");
    expect(source).toContain('useInitialDialogFocus<HTMLDivElement>(');
    // The hook needs both to work: the ref to scope the Tab wrap, and
    // tabIndex={-1} so the container itself can take the opening focus.
    expect(source).toMatch(/ref=\{dialogRef\}\s*\n\s*tabIndex=\{-1\}\s*\n\s*role="dialog"/);
  });

  it.each([
    'src/components/ResignConfirmModal.tsx',
    'src/components/AnalysisCacheClearConfirmModal.tsx',
    'src/components/UnsavedChangesModal.tsx',
    'src/components/AutoSaveRecoveryModal.tsx',
  ])('lets the explicitly safe autoFocus action receive focus in %s', (path) => {
    const source = readFileSync(path, 'utf8');

    expect(source).toContain('{ focusContainer: false }');
    expect(source).toContain('autoFocus');
  });
});
