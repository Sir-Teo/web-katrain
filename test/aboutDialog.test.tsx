import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AboutDialog } from '../src/components/AboutDialog';

describe('AboutDialog', () => {
  it('keeps external links touch-sized inside a scrollable short dialog', () => {
    const html = renderToStaticMarkup(<AboutDialog onClose={() => undefined} />);
    const css = readFileSync('src/index.css', 'utf8');

    expect(html).toContain('about-dialog-panel ui-panel relative flex max-h-[92dvh]');
    expect(html).toContain('about-dialog-header ui-bar');
    expect(html).toContain('about-dialog-body min-h-0 flex-1 space-y-4 overflow-y-auto');
    expect(html.match(/inline-flex min-h-11 min-w-0/g) ?? []).toHaveLength(3);
    expect(css).toMatch(/@media \(max-height: 520px\) and \(orientation: landscape\)[\s\S]*\.about-dialog-panel \.about-dialog-header,[\s\S]*padding: 8px !important;/);
  });
});
