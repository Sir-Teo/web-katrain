import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ShortcutSettingsPanel } from '../src/components/ShortcutSettingsPanel';

describe('ShortcutSettingsPanel', () => {
  it('renders shortcut status filters and customization summary', () => {
    const html = renderToStaticMarkup(<ShortcutSettingsPanel />);

    expect(html).toContain('data-shortcut-filter="all"');
    expect(html).toContain('data-shortcut-filter="custom"');
    expect(html).toContain('data-shortcut-filter="disabled"');
    expect(html).toContain('data-shortcut-custom-summary="true"');
    expect(html).toContain('0 edited / 0 disabled');
  });

  it('marks default rows as reset no-ops but still recordable', () => {
    const html = renderToStaticMarkup(<ShortcutSettingsPanel />);

    expect(html).toContain('aria-label="Record shortcut for Previous move"');
    expect(html).toContain('title="Shortcut is already using the default"');
  });
});
