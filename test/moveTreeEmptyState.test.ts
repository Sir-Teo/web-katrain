import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('move tree empty state', () => {
  it('explains an empty tree and offers mobile callers a route back to the board', () => {
    const source = readFileSync('src/components/MoveTree.tsx', 'utf8');
    const rightPanelSource = readFileSync('src/components/layout/RightPanel.tsx', 'utf8');
    const css = readFileSync('src/index.css', 'utf8');

    expect(source).toContain('flatTree.length === 1');
    expect(source).toContain('data-move-tree-empty-state="true"');
    expect(source).toContain('Play first move');
    expect(source).not.toContain('Back to board');
    expect(source).toContain('Play on the board to start the game tree.');
    expect(source).toContain('onClick={() => onSelectNode(rootNode)}');
    expect(rightPanelSource).toContain('treeListNodes.length === 1');
    expect(rightPanelSource).toContain('className="move-tree-empty-state-action"');
    expect(rightPanelSource).toContain('Play first move');
    expect(rightPanelSource).toContain('onClick={onClose}');
    expect(css).toMatch(/\.move-tree-empty-state-action\s*\{[^}]*min-height: 2\.75rem;/);
    expect(css).toMatch(/\.move-tree-empty-state-content > svg\s*\{[^}]*display: none;/);
    expect(css).toMatch(/@media \(max-width: 1023px\)[\s\S]*\.move-tree-empty-state-content > svg\s*\{[^}]*display: block;/);
    expect(css).toMatch(/@media \(max-height: 520px\) and \(orientation: landscape\)[\s\S]*\.move-tree-empty-state-content > svg\s*\{[^}]*display: none;/);
  });
});
