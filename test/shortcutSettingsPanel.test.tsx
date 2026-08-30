import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ShortcutSettingsPanel } from '../src/components/ShortcutSettingsPanel';

describe('ShortcutSettingsPanel', () => {
  it('keeps the default mobile editor focused on search and commands', () => {
    const html = renderToStaticMarkup(<ShortcutSettingsPanel />);
    const source = readFileSync('src/components/ShortcutSettingsPanel.tsx', 'utf8');
    const css = readFileSync('src/index.css', 'utf8');

    expect(source).toContain('space-y-3 sm:space-y-4');
    expect(source).toContain('p-3 sm:p-4');
    expect(source).toContain('data-shortcut-filter={option.id}');
    expect(source).toContain('data-shortcut-custom-summary="true"');
    expect(html).not.toContain('0 edited / 0 disabled');
    expect(html).not.toContain('aria-label="Shortcut filter"');
    expect(html).not.toContain('data-shortcut-reset-all="true"');
    expect(css).toMatch(/\[data-shortcut-search='true'\]::-webkit-search-cancel-button\s*\{[\s\S]*?display:\s*none;/);
  });

  it('marks default rows as reset no-ops but still recordable', () => {
    const html = renderToStaticMarkup(<ShortcutSettingsPanel />);

    expect(html).toContain('aria-label="Record shortcut for Previous move"');
    expect(html).toContain('title="Shortcut is already using the default"');
  });
});
