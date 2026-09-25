import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('board theme previews', () => {
  it('draw the lines over a texture that covers the swatch', () => {
    // Stretched to 100% 100%, Hikaru's square SVG board sat as a pale square in
    // the middle of the preview, and Bamboo's texture hid its lines.
    const source = readFileSync('src/components/SettingsModal.tsx', 'utf8');
    expect(source).toContain("const backgroundSize = `20% 20%, 20% 20%${texture ? ', cover' : ''}`;");
    expect(source).not.toContain("'100% 100%, ' : ''}20% 20%");
  });
});
