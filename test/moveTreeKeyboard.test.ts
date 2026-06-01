import { describe, expect, it } from 'vitest';
import {
  getMoveTreeKeyboardTarget,
  isMoveTreeKeyboardNavigationKey,
  type MoveTreeKeyboardNode,
} from '../src/utils/moveTreeKeyboard';

interface TestNode extends MoveTreeKeyboardNode<TestNode> {
  id: string;
}

function node(id: string): TestNode {
  return { id, parent: null, children: [] };
}

function append(parent: TestNode, child: TestNode): TestNode {
  child.parent = parent;
  parent.children.push(child);
  return child;
}

function fixture() {
  const root = node('root');
  const a = append(root, node('a'));
  const b = append(root, node('b'));
  const a1 = append(a, node('a1'));
  append(a1, node('a2'));
  return { root, a, b, a1, a2: a1.children[0]! };
}

describe('move tree keyboard helpers', () => {
  it('recognizes tree navigation keys only', () => {
    expect(isMoveTreeKeyboardNavigationKey('ArrowLeft')).toBe(true);
    expect(isMoveTreeKeyboardNavigationKey('End')).toBe(true);
    expect(isMoveTreeKeyboardNavigationKey('Enter')).toBe(false);
    expect(isMoveTreeKeyboardNavigationKey('a')).toBe(false);
  });

  it('maps horizontal arrows to parent, child, and sibling nodes', () => {
    const { root, a, b, a1 } = fixture();

    expect(getMoveTreeKeyboardTarget({ node: a, root, direction: 'horizontal', key: 'ArrowLeft' })).toBe(root);
    expect(getMoveTreeKeyboardTarget({ node: a, root, direction: 'horizontal', key: 'ArrowRight' })).toBe(a1);
    expect(getMoveTreeKeyboardTarget({ node: b, root, direction: 'horizontal', key: 'ArrowUp' })).toBe(a);
    expect(getMoveTreeKeyboardTarget({ node: a, root, direction: 'horizontal', key: 'ArrowDown' })).toBe(b);
  });

  it('maps vertical arrows to parent, child, and sibling nodes', () => {
    const { root, a, b, a1 } = fixture();

    expect(getMoveTreeKeyboardTarget({ node: a, root, direction: 'vertical', key: 'ArrowUp' })).toBe(root);
    expect(getMoveTreeKeyboardTarget({ node: a, root, direction: 'vertical', key: 'ArrowDown' })).toBe(a1);
    expect(getMoveTreeKeyboardTarget({ node: b, root, direction: 'vertical', key: 'ArrowLeft' })).toBe(a);
    expect(getMoveTreeKeyboardTarget({ node: a, root, direction: 'vertical', key: 'ArrowRight' })).toBe(b);
  });

  it('handles Home and End along the focused branch', () => {
    const { root, a, a1, a2 } = fixture();

    expect(getMoveTreeKeyboardTarget({ node: a1, root, direction: 'horizontal', key: 'Home' })).toBe(root);
    expect(getMoveTreeKeyboardTarget({ node: a, root, direction: 'horizontal', key: 'End' })).toBe(a2);
    expect(getMoveTreeKeyboardTarget({ node: a2, root, direction: 'horizontal', key: 'End' })).toBeNull();
    expect(getMoveTreeKeyboardTarget({ node: root, root, direction: 'horizontal', key: 'Home' })).toBeNull();
  });
});
