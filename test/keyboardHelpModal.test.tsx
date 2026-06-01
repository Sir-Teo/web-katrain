import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { KeyboardHelpModal } from '../src/components/KeyboardHelpModal';

describe('KeyboardHelpModal', () => {
  it('includes gamepad controls alongside keyboard shortcuts', () => {
    const html = renderToStaticMarkup(<KeyboardHelpModal onClose={() => undefined} />);

    expect(html).toContain('data-keyboard-help-gamepad="true"');
    expect(html).toContain('Gamepad');
    expect(html).toContain('D-pad / left stick');
    expect(html).toContain('Right stick');
    expect(html).toContain('Back/forward 10 moves');
    expect(html).toContain('Select / Start');
  });
});
