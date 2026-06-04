import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { UnsavedChangesModal } from '../src/components/UnsavedChangesModal';

const noop = () => undefined;

describe('UnsavedChangesModal', () => {
  it('labels the safe cancel dialog and focuses Cancel by default', () => {
    const html = renderToStaticMarkup(<UnsavedChangesModal onChoice={noop} saveTarget="library" />);

    expect(html).toContain('aria-labelledby="unsaved-changes-title"');
    expect(html).toContain('aria-describedby="unsaved-changes-description"');
    expect(html).toContain('id="unsaved-changes-description"');
    expect(html).toContain('Save it to Library before replacing it?');
    expect(html).toContain('autofocus=""');
  });

  it('keeps backdrop clicks as cancel while preserving dialog clicks', () => {
    const source = readFileSync('src/components/UnsavedChangesModal.tsx', 'utf8');

    expect(source).toContain("onClick={() => onChoice('cancel')}");
    expect(source).toContain('onClick={(event) => event.stopPropagation()}');
  });
});
