import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { syncThemeColorMeta } from '../src/utils/themeColor';

/**
 * A stand-in for the two document pieces the helper touches. The suite runs in
 * node with no DOM, and the helper reads its styles through doc.defaultView
 * precisely so a caller can supply one.
 */
function fakeDocument(barColor: string, existing?: string) {
  const meta = existing === undefined ? null : { name: 'theme-color', content: existing };
  const created: Array<{ name: string; content: string }> = [];
  const appended: unknown[] = [];
  const doc = {
    documentElement: {},
    defaultView: {
      getComputedStyle: () => ({
        getPropertyValue: (prop: string) => (prop === '--ui-bar' ? barColor : ''),
      }),
    },
    querySelector: () => meta,
    createElement: () => {
      const el = { name: '', content: '' };
      created.push(el);
      return el;
    },
    head: { appendChild: (el: unknown) => appended.push(el) },
  };
  return { doc, meta, created, appended };
}

const run = (barColor: string, existing?: string) => {
  const parts = fakeDocument(barColor, existing);
  syncThemeColorMeta(parts.doc as unknown as Document);
  return parts;
};

describe('theme-color follows the chosen theme', () => {
  it('writes the current --ui-bar into the existing tag', () => {
    const { meta } = run('#141815', '#101827');
    expect(meta?.content).toBe('#141815');
  });

  it('trims what the cascade hands back', () => {
    const { meta } = run('  #f0f3f8  ', '#141815');
    expect(meta?.content).toBe('#f0f3f8');
  });

  it('leaves the shipped value alone before the stylesheet lands', () => {
    // An unresolved custom property reads as the empty string, and an empty
    // content attribute is worse than a stale one.
    const { meta } = run('', '#141815');
    expect(meta?.content).toBe('#141815');
  });

  it('adds the tag when a document has none', () => {
    const { created, appended } = run('#141815');
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({ name: 'theme-color', content: '#141815' });
    expect(appended).toEqual(created);
  });

  it('does nothing without a view to read styles from', () => {
    const doc = { documentElement: {}, defaultView: null } as unknown as Document;
    expect(() => syncThemeColorMeta(doc)).not.toThrow();
  });
});

describe('the shipped values match the default theme', () => {
  const css = readFileSync('src/index.css', 'utf8');
  const noir = css.slice(css.indexOf("  :root,\n  :root[data-ui-theme='noir'] {"));
  const bg = /--ui-bg:\s*(#[0-9a-f]+);/.exec(noir)?.[1];
  const bar = /--ui-bar:\s*(#[0-9a-f]+);/.exec(noir)?.[1];

  it('paints the pre-JS chrome and the splash in the default theme', () => {
    // Nothing reads these until the app boots, so they have to be right on
    // their own: #101827 belonged to no theme at all.
    const manifest = JSON.parse(readFileSync('public/manifest.webmanifest', 'utf8'));
    expect(bar).toBeTruthy();
    expect(readFileSync('index.html', 'utf8')).toContain(`<meta name="theme-color" content="${bar}" />`);
    expect(manifest.theme_color).toBe(bar);
    expect(manifest.background_color).toBe(bg);
  });
});

describe('the app keeps the tag in step', () => {
  const layout = readFileSync('src/components/Layout.tsx', 'utf8');

  it('syncs on a theme change and when the device scheme flips', () => {
    expect(layout).toContain("import { syncThemeColorMeta } from '../utils/themeColor';");
    const start = layout.indexOf('document.documentElement.dataset.uiTheme = getResolvedUiTheme(settings.uiTheme);');
    const effect = layout.slice(start, start + 900);
    expect(effect).toContain('syncThemeColorMeta();');
    // The 'system' listener re-resolves the theme, so it has to re-read too.
    const listener = effect.slice(effect.indexOf('return subscribeMediaQueryList('));
    expect(listener).toContain('syncThemeColorMeta();');
  });
});
