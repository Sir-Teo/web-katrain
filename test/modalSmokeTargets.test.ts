import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sweep = readFileSync('scripts/check-viewports.mjs', 'utf8');
const css = readFileSync('src/index.css', 'utf8');

/**
 * The sweep's modal smoke list is what proves a dialog opens, carries a close
 * control and clears the touch floor. It held five of the app's dialogs, so
 * the rest of them had never been measured at any viewport. Adding two found
 * a 20px slider and eighteen 38px rows on the first run.
 */
describe('the sweep smoke-tests the dialogs behind the two commonest shortcuts', () => {
  it('opens the command palette and the re-analysis dialog', () => {
    for (const [name, selector, closeLabel] of [
      ['command palette', 'command-palette-title', 'Close command palette'],
      ['game re-analysis', 'game-analysis-title', 'Close game analysis'],
    ]) {
      expect(sweep, name).toContain(`name: '${name}',`);
      expect(sweep, name).toContain(`selector: '[aria-labelledby="${selector}"]',`);
      expect(sweep, name).toContain(`closeLabel: '${closeLabel}',`);
    }
  });

  it('opens each one the way a user does', () => {
    expect(sweep).toContain("dispatchShortcut('k', { ctrlKey: true });");
    expect(sweep).toContain("dispatchShortcut('F2');");
  });

  it('leaves out the one shortcut that would change the board', () => {
    // A smoke pass runs at eight viewports on a live game. New game asks a
    // question about the game on the board, so it stays out of this list.
    expect(sweep).not.toContain("name: 'new game',");
  });
});

describe('the targets those two dialogs put under a finger', () => {
  it('gives the analysis depth slider a box a pointer can hit', () => {
    // The track is 4px and the thumb 14px, both drawn by their own rules; the
    // input's own height is the whole hit area. 1.25rem was 20px, under the
    // 24px of WCAG 2.2 SC 2.5.8.
    const box = /\.analysis-command-bar__depth-slider \{[^}]*?height: ([\d.]+)rem;/s.exec(css);
    expect(box).not.toBeNull();
    expect(Number(box![1]) * 16).toBeGreaterThanOrEqual(24);
  });

  it('raises it to the touch floor where a finger drags it', () => {
    expect(css).toContain(
      '@media (hover: none) {\n    .analysis-command-bar__depth-slider {\n      height: 2.75rem;\n    }\n  }',
    );
  });

  it('floors the command palette rows at 44px on a touch screen', () => {
    // px-3 py-2 around one line of label measured 38px at 768x1024.
    expect(css).toContain(
      '@media (hover: none) {\n    [data-command-palette-item] {\n      min-height: 44px;\n    }\n  }',
    );
  });

  it('measures the rows this rule names', () => {
    // The floor keys off the attribute the palette writes on each row; if that
    // attribute moves, the rule stops matching and nothing else would say so.
    const modal = readFileSync('src/components/CommandPaletteModal.tsx', 'utf8');
    expect(modal).toContain('data-command-palette-item={command.id}');
  });
});
