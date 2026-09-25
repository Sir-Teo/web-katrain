import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

describe('dialog focus return', () => {
  it('records the opener while the dialog first renders, before any autoFocus inside it', () => {
    // Read in the effect, the opener was the dialog's own autofocused Cancel,
    // so closing Resign or Unsaved changes dropped focus to <body>.
    const hook = read('src/hooks/useInitialDialogFocus.ts');
    expect(hook).toMatch(/const \[mountOpener\] = useState<Element \| null>\(\(\) =>\s*typeof document === 'undefined' \? null : document\.activeElement/);
    expect(hook).toContain('!ref.current?.contains(mountOpener)');
  });
});
