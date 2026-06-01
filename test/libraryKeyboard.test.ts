import { describe, expect, it } from 'vitest';
import { getLibraryRowKeyAction } from '../src/utils/libraryKeyboard';

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
