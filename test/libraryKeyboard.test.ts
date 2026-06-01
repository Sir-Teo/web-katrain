import { describe, expect, it } from 'vitest';
import {
  getLibraryMenuNavigationIndex,
  getLibraryRowKeyAction,
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
