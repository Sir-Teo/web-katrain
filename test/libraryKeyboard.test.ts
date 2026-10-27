import { describe, expect, it } from 'vitest';
import {
  getLibraryMenuNavigationIndex,
  getLibraryRowKeyAction,
  getLibraryTypeaheadMatch,
  isLibraryMenuCloseKey,
} from '../src/utils/libraryKeyboard';

describe('library row keyboard actions', () => {
  it('activates file and folder rows with enter or space', () => {
    expect(getLibraryRowKeyAction({ key: 'Enter', kind: 'file' })).toBe('activate');
    expect(getLibraryRowKeyAction({ key: ' ', kind: 'folder' })).toBe('activate');
  });

  it('opens row context menus with keyboard conventions', () => {
    expect(getLibraryRowKeyAction({ key: 'ContextMenu', kind: 'file' })).toBe('context-menu');
    expect(getLibraryRowKeyAction({ key: 'F10', shiftKey: true, kind: 'folder' })).toBe('context-menu');
    expect(getLibraryRowKeyAction({ key: 'F10', kind: 'folder' })).toBe('none');
  });

  it('expands and collapses folders with arrow keys', () => {
    expect(getLibraryRowKeyAction({
      key: 'ArrowRight',
      kind: 'folder',
      hasChildren: true,
      isExpanded: false,
    })).toBe('expand');
    expect(getLibraryRowKeyAction({
      key: 'ArrowLeft',
      kind: 'folder',
      hasChildren: true,
      isExpanded: true,
    })).toBe('collapse');
  });

  it('activates leaf folders on right arrow', () => {
    expect(getLibraryRowKeyAction({
      key: 'ArrowRight',
      kind: 'folder',
      hasChildren: false,
      isExpanded: false,
    })).toBe('activate');
    expect(getLibraryRowKeyAction({
      key: 'ArrowRight',
      kind: 'folder',
      allowChildren: false,
      hasChildren: true,
      isExpanded: false,
    })).toBe('activate');
  });
});

describe('library row name navigation', () => {
  const names = ['Alpha studies', 'Alpine game', 'Beta game', 'Another game'];
  const match = (key: string, query = '', currentIndex = 0, rows = names) =>
    getLibraryTypeaheadMatch({ key, query, currentIndex, names: rows });

  it('jumps to the next matching name and wraps through repeated letters', () => {
    expect(match('a')).toEqual({ query: 'a', index: 1 });
    expect(match('a', 'a', 1)).toEqual({ query: 'a', index: 3 });
    expect(match('a', 'a', 3)).toEqual({ query: 'a', index: 0 });
  });

  it('extends a prefix from the current match instead of skipping it', () => {
    expect(match('l', 'a', 1)).toEqual({ query: 'al', index: 1 });
    expect(match('h', 'alp', 1)).toEqual({ query: 'alph', index: 0 });
  });

  it('uses case-insensitive names and normalized Unicode', () => {
    expect(match('B')).toEqual({ query: 'b', index: 2 });
    expect(match('é', '', 0, ['Elsewhere', 'E\u0301tude'])).toEqual({ query: 'e', index: 1 });
    expect(match('e', '', 0, ['Elsewhere', 'Éloïse'])).toEqual({ query: 'e', index: 1 });
    expect(match('囲', '', 0, ['Alpha', '囲碁研究'])).toEqual({ query: '囲', index: 1 });
    expect(match('か', '', 0, ['Alpha', 'がく'])).toEqual({ query: 'か', index: null });
  });

  it('can match punctuation and ignore leading whitespace in a label', () => {
    expect(match('#', '', 0, ['Alpha', '  #12 review'])).toEqual({ query: '#', index: 1 });
  });

  it('retains an unmatched prefix without moving to an unrelated row', () => {
    expect(match('z')).toEqual({ query: 'z', index: null });
    expect(match('b', 'z')).toEqual({ query: 'zb', index: null });
  });

  it('handles single-row and empty lists', () => {
    expect(match('a', '', 0, ['Alpha'])).toEqual({ query: 'a', index: 0 });
    expect(match('a', '', -1, [])).toEqual({ query: 'a', index: null });
    expect(match('a', '', -1)).toEqual({ query: 'a', index: 0 });
  });

  it('can reach the final match in a large visible tree without changing labels', () => {
    const rows = Object.freeze([...Array.from({ length: 12000 }, (_, index) => `Study ${index}`), 'Final review']);
    expect(getLibraryTypeaheadMatch({ key: 'f', query: '', currentIndex: 0, names: rows }))
      .toEqual({ query: 'f', index: 12000 });
  });

  it.each([' ', 'Enter', 'ArrowDown', 'Tab', 'Dead', 'Process'])('leaves %s to its existing action', key => {
    expect(match(key)).toBeNull();
  });
});

describe('library context menu keyboard actions', () => {
  it('moves through menu items with wrapping arrow navigation', () => {
    expect(getLibraryMenuNavigationIndex({ key: 'ArrowDown', currentIndex: -1, itemCount: 4 })).toBe(0);
    expect(getLibraryMenuNavigationIndex({ key: 'ArrowDown', currentIndex: 3, itemCount: 4 })).toBe(0);
    expect(getLibraryMenuNavigationIndex({ key: 'ArrowUp', currentIndex: -1, itemCount: 4 })).toBe(3);
    expect(getLibraryMenuNavigationIndex({ key: 'ArrowUp', currentIndex: 0, itemCount: 4 })).toBe(3);
  });

  it('jumps to the first or last menu item with home and end', () => {
    expect(getLibraryMenuNavigationIndex({ key: 'Home', currentIndex: 2, itemCount: 5 })).toBe(0);
    expect(getLibraryMenuNavigationIndex({ key: 'End', currentIndex: 2, itemCount: 5 })).toBe(4);
  });

  it('ignores non-navigation keys and empty menus', () => {
    expect(getLibraryMenuNavigationIndex({ key: 'Tab', currentIndex: 0, itemCount: 4 })).toBeNull();
    expect(getLibraryMenuNavigationIndex({ key: 'ArrowDown', currentIndex: 0, itemCount: 0 })).toBeNull();
  });

  it('closes context menus with escape only', () => {
    expect(isLibraryMenuCloseKey('Escape')).toBe(true);
    expect(isLibraryMenuCloseKey('ArrowDown')).toBe(false);
  });
});
