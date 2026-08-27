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

  it('draws the setup stones so each one carries on either theme', () => {
    const source = readFileSync('src/components/EditToolbar.tsx', 'utf8');
    const css = readFileSync('src/index.css', 'utf8');

    // The white tool was FaRegCircle painted `text-white`: a white ring on a
    // #f8fafc button, 1.05:1, which reads as a disabled control — and it shared
    // that glyph with the circle marker. `text-black` had the mirror problem on
    // the dark themes. Whichever stone matches the panel loses its fill either
    // way, so the rim is what has to carry, and it is drawn in the theme's own
    // text tone. Measured off rendered pixels, the weaker of the two stones goes
    // 1.05:1 -> 3.65:1 on light and 1.22:1 -> 4.65:1 on noir.
    expect(source).toContain('<span className="edit-tool-stone black" aria-hidden="true" />');
    expect(source).toContain('<span className="edit-tool-stone white" aria-hidden="true" />');
    expect(source).not.toContain("'text-white'");
    expect(source).not.toContain("'text-black'");

    const start = css.indexOf('.edit-tool-stone {');
    expect(start).toBeGreaterThan(-1);
    const block = css.slice(start, css.indexOf('}', start));
    expect(block).toContain('border: 1.5px solid var(--ui-text);');
    // Without this the translucent-free rim would still sit over the stone's own
    // gradient rather than over the panel it has to contrast with.
    expect(block).toContain('background-clip: padding-box;');
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
