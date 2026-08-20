import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { KeyboardHelpModal } from '../src/components/KeyboardHelpModal';
import { filterKeyboardReferenceItems } from '../src/utils/keyboardHelp';

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

  it('filters pointer and gamepad references with the shortcut query', () => {
    const references = [
      { control: 'Pinch', action: 'Zoom the board on touch screens' },
      { control: 'Wheel', action: 'Previous/next move over the board' },
    ];

    expect(filterKeyboardReferenceItems(references, 'wheel move')).toEqual([references[1]]);
    expect(filterKeyboardReferenceItems(references, 'save')).toEqual([]);
  });

  it('uses one explicit clear action for shortcut search', () => {
    const css = readFileSync('src/index.css', 'utf8');

    expect(css).toMatch(/\[data-keyboard-help-search='true'\]::-webkit-search-cancel-button\s*\{[^}]*display: none/);
  });

  it('keeps the narrow-screen customize action compact and accessible', () => {
    const html = renderToStaticMarkup(
      <KeyboardHelpModal onClose={() => undefined} onOpenShortcutSettings={() => undefined} />,
    );
    const css = readFileSync('src/index.css', 'utf8');

    expect(html).toContain('data-keyboard-help-customize="true"');
    expect(html).toContain('aria-label="Customize keyboard shortcuts"');
    expect(html).toContain('keyboard-help-customize-label');
    expect(html).toContain('keyboard-help-title');
    expect(css).toMatch(/@media \(max-width: 360px\)[\s\S]*\[data-keyboard-help-customize='true'\][\s\S]*width: 44px/);
    expect(css).toMatch(/@media \(max-width: 360px\)[\s\S]*\.keyboard-help-customize-label[\s\S]*display: none/);
    expect(css).toMatch(/@media \(max-width: 360px\)[\s\S]*\.keyboard-help-title[\s\S]*font-size: 1rem/);
  });
});
