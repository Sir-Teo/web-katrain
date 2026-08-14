import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { KeyboardHelpModal } from '../src/components/KeyboardHelpModal';

describe('KeyboardHelpModal', () => {
  it('includes gamepad controls alongside keyboard shortcuts', () => {
    const html = renderToStaticMarkup(<KeyboardHelpModal onClose={() => undefined} />);

    expect(html).toContain('data-keyboard-help-gamepad="true"');
    expect(html).toContain('Gamepad');
    // The D-pad and both sticks share one row: getGamepadNavigationInput maps all
    // three to the same back/forward/branchPrev/branchNext commands.
    expect(html).toContain('D-pad / either stick');
    expect(html).not.toContain('Right stick');
    expect(html).toContain('Back/forward 10 moves');
    expect(html).toContain('Select / Start');
  });

  it('documents board and move-tree wheel navigation', () => {
    const html = renderToStaticMarkup(<KeyboardHelpModal onClose={() => undefined} />);

    expect(html).toContain('data-keyboard-help-pointer="true"');
    expect(html).toContain('Touch / Trackpad / Mouse');
    expect(html).toContain('Pinch');
    expect(html).toContain('Zoom the board on touch screens');
    expect(html).toContain('Previous/next move over the board or move tree');
    expect(html).toContain('Shift + wheel');
    expect(html).toContain('Previous/next mistake over the board or move tree');
  });
});
