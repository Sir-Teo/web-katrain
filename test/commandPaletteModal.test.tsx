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

  it('sets each command on one line so a screenful holds more of them', () => {
    const html = renderToStaticMarkup(
      <CommandPaletteModal
        onClose={() => undefined}
        commands={[
          { id: 'save-library', label: 'Save copy to library', category: 'File', shortcutId: 'save-library', run: () => undefined },
          { id: 'photo', label: 'Open photo board', category: 'File', run: () => undefined },
        ]}
      />,
    );
    const css = readFileSync('src/index.css', 'utf8');

    // The category used to sit on a second line under the label, which halved
    // how many commands fit. Beside the shortcut chip it costs no height, and
    // the chip's slot keeps its width so the categories stay in one column
    // whether or not a command has a shortcut.
    expect(html).toContain('command-palette-category');
    expect(html.match(/command-palette-shortcut-slot/g) ?? []).toHaveLength(2);
    expect(html).not.toContain('mt-0.5 block truncate text-xs ui-text-faint');
    expect(css).toMatch(/\.command-palette-shortcut-slot \{[^}]*min-width: 7rem;/);
    // Neither reading survives on the shell with no keyboard, where the label
    // is the whole row; both hide on the same rule the chip already used.
    expect(css).toMatch(
      /\.command-palette-shortcut,\s*\.command-palette-shortcut-slot,\s*\.command-palette-category,/,
    );
  });

  it('does not let a stationary launch pointer replace the initial selection', () => {
    const source = readFileSync('src/components/CommandPaletteModal.tsx', 'utf8');

    expect(source).not.toContain('onMouseEnter={() => setActiveIndex(index)}');
    expect(source).toContain('onPointerMove={(event) => {');
    expect(source).toContain("event.pointerType !== 'touch'");
  });

  it('uses one explicit clear action instead of a duplicate native search control', () => {
    const css = readFileSync('src/index.css', 'utf8');

    expect(css).toMatch(/\[data-command-palette-search='true'\]::-webkit-search-cancel-button\s*\{[^}]*display: none/);
  });

  it('explains and blocks commands that are unavailable in the current position', () => {
    const source = readFileSync('src/components/CommandPaletteModal.tsx', 'utf8');
    const html = renderToStaticMarkup(
      <CommandPaletteModal
        onClose={() => undefined}
        commands={[{
          id: 'previous-move',
          label: 'Previous move',
          category: 'Navigation',
          run: () => undefined,
          disabledReason: 'No previous move',
        }]}
      />,
    );

    expect(html).toContain('disabled=""');
    expect(html).toContain('title="No previous move"');
    expect(html).toContain('Unavailable: No previous move');
    expect(html).toContain('>No previous move</span>');
    expect(source).toContain('if (command.disabledReason) return;');
  });

  it('places unavailable commands after actionable commands until search narrows the list', () => {
    const html = renderToStaticMarkup(
      <CommandPaletteModal
        onClose={() => undefined}
        commands={[
          {
            id: 'previous-move',
            label: 'Previous move',
            category: 'Navigation',
            run: () => undefined,
            disabledReason: 'No previous move',
          },
          {
            id: 'settings',
            label: 'Open settings',
            category: 'Settings',
            run: () => undefined,
          },
        ]}
      />,
    );

    expect(html.indexOf('>Open settings</span>')).toBeLessThan(html.indexOf('>Previous move</span>'));
  });
});
