import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getEngineStatusSummary } from '../src/utils/engineStatusSummary';

const css = readFileSync('src/index.css', 'utf8');

/**
 * The engine pill shows one word, and truncating it -- "Load..." -- reads as
 * breakage rather than as density. `npm run test:viewport` measures the real
 * thing; these guard the shape of the fix, which is that the column holding
 * the word is a floor rather than a fixed width.
 */
describe('the engine status word fits its column', () => {
  it('has "Loading" as the longest word it must hold', () => {
    const state = (args: Parameters<typeof getEngineStatusSummary>[0]) =>
      getEngineStatusSummary(args).stateLabel;
    const words = [
      state({ status: 'loading', requestedBackend: 'webgpu' }),
      state({ status: 'ready', requestedBackend: 'webgpu' }),
      state({ status: 'idle', requestedBackend: 'webgpu' }),
      state({ status: 'error', error: 'boom', requestedBackend: 'webgpu' }),
    ];
    expect(words).toEqual(['Loading', 'Ready', 'Idle', 'Error']);
    expect([...words].sort((a, b) => b.length - a.length)[0]).toBe('Loading');
  });

  it('sizes the phone status column to that word instead of guessing a rem', () => {
    // Fixed at 4.75rem the track left 52px for a word needing 53.8px at 390px
    // and up -- every common phone width -- and 4rem left 44px for 49.3px at
    // 360px. A floor plus auto fits the word at whatever size the tier uses.
    expect(css).toContain(
      'grid-template-columns: minmax(4.75rem, auto) minmax(6rem, 1fr) minmax(6.5rem, 36vw);'
    );
    expect(css).toContain(
      'grid-template-columns: minmax(4rem, auto) minmax(6rem, 1fr) minmax(6.5rem, 36vw);'
    );
    // No fixed-width status track is left on either phone tier.
    expect(css).not.toContain('grid-template-columns: 4.75rem minmax(6rem, 1fr)');
    expect(css).not.toContain('grid-template-columns: 4rem minmax(6rem, 1fr)');
  });

  it('matches the shape the desktop rule already used', () => {
    expect(css).toContain(
      'grid-template-columns: minmax(7rem, auto) minmax(10rem, 1fr) minmax(10rem, auto);'
    );
  });

  it('still drops the backend detail before the state word on a phone', () => {
    // The word is the point of the pill; "· WebGPU" is not.
    const at = css.indexOf('.analysis-command-bar__status-detail {\n      display: none;\n    }');
    expect(at).toBeGreaterThan(-1);
    const enclosing = css.lastIndexOf('@media', at);
    expect(css.slice(enclosing, css.indexOf('{', enclosing))).toContain('max-width: 640px');
  });
});
