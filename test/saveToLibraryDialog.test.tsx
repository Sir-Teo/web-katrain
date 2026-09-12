import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SaveToLibraryDialog } from '../src/components/SaveToLibraryDialog';

describe('SaveToLibraryDialog', () => {
  it('uses explicit labels for the name and folder controls', () => {
    const html = renderToStaticMarkup(
      <SaveToLibraryDialog
        open
        initialName="Game 1"
        initialFolderId="study"
        folderOptions={[{ id: 'study', name: 'Study Games', depth: 0 }]}
        onClose={() => undefined}
        onSave={() => true}
      />
    );

    expect(html).toContain('for="save-to-library-name"');
    expect(html).toContain('id="save-to-library-name"');
    expect(html).toContain('for="save-to-library-folder"');
    expect(html).toContain('id="save-to-library-folder"');
    expect(html).toMatch(/for="save-to-library-folder"[^>]*>Save to folder<\/label><select/);
    expect(html).toContain('aria-label="Close save to Library"');
    expect(html).toContain('min-h-11');
    expect(html).toContain('>Save copy</span>');
    expect(html).toContain('ui-bar flex flex-wrap justify-end gap-2 border-t');
  });


  it('keeps deeply nested destination names readable without allocating indentation for every ancestor', () => {
    const html = renderToStaticMarkup(
      <SaveToLibraryDialog
        open initialName="Study" initialFolderId="deep"
        folderOptions={[
          { id: 'shallow', name: 'Opening', depth: 2 },
          { id: 'deep', name: 'Final study folder', depth: 11999 },
        ]}
        onClose={() => undefined} onSave={() => true}
      />
    );
    const shallow = html.match(/<option value="shallow"[^>]*>([^<]*)<\/option>/)?.[1];
    const deep = html.match(/<option value="deep"[^>]*>([^<]*)<\/option>/)?.[1];
    expect(shallow).toBe('-- -- Opening');
    expect(deep).toContain('Final study folder');
    expect(deep?.length).toBeLessThan(100);
    expect(deep).toContain('12000');
  });

  it('wraps its footer instead of pushing buttons off-screen', () => {
    const source = readFileSync('src/components/SaveToLibraryDialog.tsx', 'utf8');

    // justify-end with nowrap overflows the START edge, so at 200% text Cancel
    // sat at x=-32 — partly outside the viewport and unreachable.
    expect(source).toContain('flex flex-wrap justify-end gap-2');
  });
});
