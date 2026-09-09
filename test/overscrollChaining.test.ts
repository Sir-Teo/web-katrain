import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync('src/index.css', 'utf8');

describe('the shell does not chain its overscroll to the browser', () => {
  it('stops pull-to-refresh and the back gesture at the app edge', () => {
    // The layout is a fixed 100%-height shell that scrolls only on the inside,
    // so an overscroll at its edge has nothing to do but leave the app: a
    // reload on Android Chrome, or a history navigation sideways -- either one
    // discarding a loaded game and a warmed-up model to restart a PWA that has
    // its own update prompt. The board reads horizontal drags itself, so
    // overshooting one used to navigate away.
    expect(css).toContain('  html,\n  body {\n    overscroll-behavior: none;\n  }');
  });

  it('leaves the inner scrollers their own containment', () => {
    // Panels and sheets already stop their own chaining; the root rule is the
    // outermost of those, not a replacement for them.
    expect(css.match(/overscroll-behavior: contain;/g)?.length ?? 0).toBeGreaterThan(4);
  });
});
