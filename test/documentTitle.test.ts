import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { APP_NAME, buildDocumentTitle } from '../src/utils/documentTitle';

describe('the tab says which game it holds', () => {
  it('falls back to the app name on an untouched board', () => {
    expect(buildDocumentTitle({})).toBe(APP_NAME);
    // "Black vs White" is what every empty board would read as, and says less
    // than the app's own name does.
    expect(buildDocumentTitle({ blackName: '', whiteName: '  ' })).toBe(APP_NAME);
  });

  it('prefers the open file to the players', () => {
    expect(buildDocumentTitle({ fileName: 'Teaching Game', blackName: 'Shusaku' }))
      .toBe('Teaching Game — Web KaTrain');
  });

  it('names a game by its players when no file is open', () => {
    expect(buildDocumentTitle({ blackName: 'Shusaku', whiteName: 'Gennan' }))
      .toBe('Shusaku vs Gennan — Web KaTrain');
  });

  it('fills in the missing side rather than dropping it', () => {
    expect(buildDocumentTitle({ blackName: 'Shusaku' })).toBe('Shusaku vs White — Web KaTrain');
    expect(buildDocumentTitle({ whiteName: 'Gennan' })).toBe('Black vs Gennan — Web KaTrain');
  });

  it('marks unsaved work the way an editor does', () => {
    expect(buildDocumentTitle({ fileName: 'Teaching Game', dirty: true }))
      .toBe('• Teaching Game — Web KaTrain');
    // Nothing to be dirty about when there is nothing to name.
    expect(buildDocumentTitle({ dirty: true })).toBe(APP_NAME);
  });

  it('flattens what an SGF can put in a name field', () => {
    expect(buildDocumentTitle({ fileName: '  Two\n\tLines  ' })).toBe('Two Lines — Web KaTrain');
  });

  it('elides a name long enough to push the app name out of the title', () => {
    const title = buildDocumentTitle({ fileName: 'x'.repeat(200) });
    expect(title.endsWith(`… — ${APP_NAME}`)).toBe(true);
    expect(title.length).toBeLessThan(80);
  });
});

describe('the app keeps the tab in step', () => {
  const layout = readFileSync('src/components/Layout.tsx', 'utf8');

  it('retitles on the file, the players and the dirty flag', () => {
    expect(layout).toContain("import { buildDocumentTitle } from '../utils/documentTitle';");
    expect(layout).toContain('document.title = buildDocumentTitle({');
    expect(layout).toContain(
      '  }, [currentGameDirty, titleBlackName, titleFileName, titleWhiteName]);'
    );
    // getRootProp is rebuilt every render; depending on it would re-run this
    // effect on all of them.
    expect(layout).toContain('  const titleBlackName = getRootProp(\'PB\');');
  });
});
