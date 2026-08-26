import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('programmatic scrolling honours reduced motion', () => {
  it('asks the media query instead of hard-coding smooth', () => {
    const helper = readFileSync('src/utils/mediaQuery.ts', 'utf8');
    const tree = readFileSync('src/components/MoveTree.tsx', 'utf8');
    const settings = readFileSync('src/components/SettingsModal.tsx', 'utf8');

    // The stylesheet's reduced-motion block zeroes CSS transitions and
    // animations, which never reaches a JS-driven scrollTo. The move tree
    // re-centres on every navigation, so a reader who asked for no motion got
    // a smooth scroll on every arrow key.
    expect(helper).toContain("const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';");
    expect(helper).toContain('export function preferredScrollBehavior(): ScrollBehavior {');
    expect(helper).toContain("return prefersReducedMotion() ? 'auto' : 'smooth';");

    for (const [name, source] of [['MoveTree', tree], ['SettingsModal', settings]] as const) {
      expect(source, name).toContain("import { preferredScrollBehavior } from '../utils/mediaQuery';");
      expect(source.match(/behavior: 'smooth'/g) ?? [], name).toHaveLength(0);
    }
    expect(tree).not.toContain("centerCurrentNode('smooth')");
  });
});
