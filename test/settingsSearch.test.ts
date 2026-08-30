import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { SETTINGS_SEARCH_INDEX, searchAvailableSettings, searchSettings } from '../src/utils/settingsSearch';

/**
 * Re-derives the index from the modal's markup. The index exists because only
 * the active tab is mounted, so nothing at runtime can catch it going stale —
 * this test is the thing that does.
 */
function labelledControlsInModal(): Array<{ id: string; tab: string }> {
  const source = readFileSync(fileURLToPath(new URL('../src/components/SettingsModal.tsx', import.meta.url)), 'utf8');
  const found: Array<{ id: string; tab: string }> = [];
  let tab = '';
  for (const line of source.split('\n')) {
    const tabMatch = line.match(/activeTab === '(general|analysis|ai|shortcuts)'/);
    if (tabMatch) tab = tabMatch[1]!;
    // Not /<label htmlFor=/: the backend control writes id= first, so a regex
    // anchored to the first attribute skipped it and the index silently lost a
    // setting the modal really has.
    const labelMatch = line.match(/<label[^>]*htmlFor="(settings-[a-z0-9-]+)"/);
    if (labelMatch) found.push({ id: labelMatch[1]!, tab });
    const compositeMatch = line.match(/data-settings-search-id="(settings-[a-z0-9-]+)"/);
    if (compositeMatch) found.push({ id: compositeMatch[1]!, tab });
  }
  return found;
}

describe('settings search index', () => {
  it('covers every labelled control in the modal', () => {
    const indexed = new Set(SETTINGS_SEARCH_INDEX.map((entry) => entry.id));
    const missing = labelledControlsInModal()
      .map((control) => control.id)
      .filter((id) => !indexed.has(id));

    expect(missing).toEqual([]);
  });

  it('files every control under the tab it actually renders on', () => {
    const actualTab = new Map(labelledControlsInModal().map((control) => [control.id, control.tab]));
    const misfiled = SETTINGS_SEARCH_INDEX.filter((entry) => actualTab.get(entry.id) !== entry.tab);

    expect(misfiled).toEqual([]);
  });

  it('does not index a control the modal no longer has', () => {
    const present = new Set(labelledControlsInModal().map((control) => control.id));
    const stale = SETTINGS_SEARCH_INDEX.filter((entry) => !present.has(entry.id));

    expect(stale).toEqual([]);
  });
});

describe('settings search', () => {
  it('finds a setting by a word from its label', () => {
    expect(searchSettings('komi').length + searchSettings('handicap').length).toBeGreaterThan(0);
    expect(searchSettings('handicap')[0]?.id).toBe('settings-default-handicap');
  });

  it('is case and punctuation insensitive', () => {
    expect(searchSettings('BOARD SIZE')[0]?.id).toBe('settings-default-board-size');
    expect(searchSettings('board-size')[0]?.id).toBe('settings-default-board-size');
  });

  it('narrows as more terms are typed rather than widening', () => {
    const broad = searchSettings('show');
    const narrow = searchSettings('show coordinates');

    expect(broad.length).toBeGreaterThan(narrow.length);
    expect(narrow.every((entry) => /show/i.test(entry.label) && /coordinates/i.test(entry.label))).toBe(true);
  });

  it('ranks a label that starts with the query above one that merely contains it', () => {
    const results = searchSettings('sound');
    const soundEffects = results.findIndex((entry) => entry.id === 'settings-sound-enabled');
    const timerSound = results.findIndex((entry) => entry.id === 'settings-timer-sound');

    expect(soundEffects).toBeGreaterThanOrEqual(0);
    expect(timerSound).toBeGreaterThan(soundEffects);
  });

  it('returns nothing for an empty or blank query', () => {
    expect(searchSettings('')).toEqual([]);
    expect(searchSettings('   ')).toEqual([]);
  });

  it('caps how many results it offers', () => {
    expect(searchSettings('a', SETTINGS_SEARCH_INDEX, 3).length).toBeLessThanOrEqual(3);
  });

  it('only offers strategy-specific controls that are currently available', () => {
    expect(searchAvailableSettings('max pt lost', 'rank')).toEqual([]);
    expect(searchAvailableSettings('max pt lost', 'simple')[0]?.id).toBe('settings-ai-ownership-max-points-lost');
    expect(searchAvailableSettings('kyu rank', 'rank')[0]?.id).toBe('settings-ai-rank-kyu');
    expect(searchAvailableSettings('kyu rank', 'simple')).toEqual([]);
  });

  it('supports active-descendant keyboard navigation in the modal', () => {
    const source = readFileSync(fileURLToPath(new URL('../src/components/SettingsModal.tsx', import.meta.url)), 'utf8');

    expect(source).toContain("e.key === 'ArrowDown'");
    expect(source).toContain("e.key === 'ArrowUp'");
    expect(source).toContain('role="combobox"');
    expect(source).toContain('aria-autocomplete="list"');
    expect(source).toContain('aria-activedescendant={activeSettingsResult');
    expect(source).toContain('aria-selected={index === activeSettingsResult}');
    expect(source).toContain("if (event.pointerType !== 'touch') setActiveSettingsResult(index)");
  });
});
