import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('Enter in the command palette', () => {
  it('runs the highlighted command only from the search field', () => {
    // Caught at the dialog, Enter on the focused Close button ran the first
    // command (Quick new game), and on Clear ran the command being filtered.
    const source = readFileSync('src/components/CommandPaletteModal.tsx', 'utf8');
    expect(source).toContain('const fromSearch = event.target === inputRef.current || event.target === event.currentTarget;');
    expect(source).toContain("if (event.key === 'Enter' && activeCommand && fromSearch) {");
  });
});
