import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { SettingsModal } from '../src/components/SettingsModal';

describe('SettingsModal', () => {
  it('uses theme-aware tab classes instead of hard-coded dark colors', () => {
    const html = renderToStaticMarkup(<SettingsModal onClose={() => undefined} />);

    expect(html).toContain('settings-modal');
    expect(html).toContain('settings-tabs');
    expect(html).toContain('settings-tab-active');
    expect(html).not.toContain('border-blue-500');
    expect(html).not.toContain('text-white border-b-2');
  });
});
