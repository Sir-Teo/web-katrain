import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CommandPaletteModal } from '../src/components/CommandPaletteModal';

describe('CommandPaletteModal', () => {
  it('prioritizes command names on narrow screens without losing shortcut context', () => {
    const html = renderToStaticMarkup(
      <CommandPaletteModal
        onClose={() => undefined}
        commands={[{
          id: 'save-library',
          label: 'Save copy to library',
          category: 'File',
          shortcutId: 'save-library',
          run: () => undefined,
        }]}
      />,
    );
    const css = readFileSync('src/index.css', 'utf8');

    expect(html).toContain('aria-label="Save copy to library, File, Ctrl+Shift+S"');
    expect(html).toContain('command-palette-shortcut');
    expect(html).toContain('aria-hidden="true"');
    expect(css).toMatch(/@media \(max-width: 360px\)[\s\S]*\.command-palette-shortcut[\s\S]*display: none/);
  });

  it('does not let a stationary launch pointer replace the initial selection', () => {
    const source = readFileSync('src/components/CommandPaletteModal.tsx', 'utf8');

    expect(source).not.toContain('onMouseEnter={() => setActiveIndex(index)}');
    expect(source).toContain('onPointerMove={(event) => {');
    expect(source).toContain("event.pointerType !== 'touch'");
  });
});
