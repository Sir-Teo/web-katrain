import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

describe('Frame as tsumego dialog', () => {
  const source = read('src/components/TsumegoFrameModal.tsx');

  it('lets the wall distance be retyped, clamping only when it is used', () => {
    // Clamping each keystroke made Backspace "1" and a following 3 "13" -> 8.
    expect(source).toContain('value={marginDraft}');
    expect(source).toContain('onChange={(e) => setMarginDraft(e.target.value)}');
    expect(source).toContain('onBlur={commitMargin}');
    expect(source).toContain('onApply({ margin: commitMargin(), koAllowed })');
  });

  it('moves focus into the dialog when it opens', () => {
    // Nothing inside takes focus itself; with the container skipped too,
    // focus stayed behind the scrim and Tab walked the page header.
    expect(source).toContain('useInitialDialogFocus<HTMLDivElement>(true, { returnFocus })');
    expect(source).not.toContain('focusContainer: false');
  });
});

describe('Pro games dialog', () => {
  it('leaves focus in the autofocused search field', () => {
    const source = read('src/components/ProGamesModal.tsx');

    expect(source).toContain('autoFocus');
    expect(source).toContain('useInitialDialogFocus<HTMLDivElement>(true, { focusContainer: false })');
  });
});

describe('Edit toolbar branch actions', () => {
  const source = read('src/components/EditToolbar.tsx');

  it('recounts the branch when the tree changes under the same node', () => {
    expect(source).toMatch(/currentBranchNodeCount = React\.useMemo\([\s\S]*?\[canEditBranch, currentNode, treeVersion\]/);
  });

  it('offers Copy only on a move, which is all the store will copy', () => {
    expect(source).toContain('const canCopyBranch = canEditBranch && Boolean(currentNode.move);');
    expect(source).toMatch(/onClick=\{copyCurrentBranch\}\s*disabled=\{!canCopyBranch\}/);
  });
});
