import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('EditToolbar accessibility', () => {
  it('gives icon-only edit actions explicit accessible names', () => {
    const source = readFileSync('src/components/EditToolbar.tsx', 'utf8');
    const actionLabels = [
      'openEditToolsLabel',
      'closeEditToolsLabel',
      'clearSetupStonesLabel',
      'passEditModeLabel',
      'moveVariationEarlierLabel',
      'moveVariationLaterLabel',
      'makeMainBranchLabel',
      'copyBranchLabel',
      'pasteBranchLabel',
      'deleteCurrentNodeLabel',
      'pruneOtherBranchesLabel',
      'undoEditLabel',
      'redoEditLabel',
      'clearNodeAnnotationsLabel',
    ];

    for (const label of actionLabels) {
      expect(source).toContain(`aria-label={${label}}`);
    }
  });

  it('names branch edit actions with the affected node count', () => {
    const source = readFileSync('src/components/EditToolbar.tsx', 'utf8');

    expect(source).toContain('countBranchNodes(currentNode)');
    expect(source).toContain('countBranchNodes(copiedBranch)');
    expect(source).toContain('`Copy current branch (${currentBranchNodeLabel})`');
    expect(source).toContain('`Paste copied branch (${copiedBranchNodeLabel})`');
    expect(source).toContain('`Delete current branch (${currentBranchNodeLabel})`');
    expect(source).not.toContain("const deleteCurrentNodeLabel = 'Delete current node'");
  });
});
