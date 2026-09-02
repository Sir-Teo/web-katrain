import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * `tf.setBackend` resolves `false` when a backend fails to initialise; it does
 * not throw. The worker awaited it bare, so a browser without a usable WebGPU
 * adapter sailed past the WebGPU branch as if it had succeeded and ended up on
 * TensorFlow.js's plain CPU backend -- roughly ten times slower than WASM --
 * with nothing recorded about why. Headless Chrome reproduced it exactly.
 */
describe('worker backend initialisation', () => {
  const source = readFileSync('src/engine/katago/worker.ts', 'utf8');

  it('treats a false setBackend result as a failure for every accelerated backend', () => {
    expect(source).toContain("if (!(await tf.setBackend('webgpu'))) throw new Error");
    expect(source).toContain("if (!(await tf.setBackend('wasm'))) throw new Error");
    expect(source).not.toMatch(/^\s*await tf\.setBackend\('(webgpu|wasm)'\);/m);
  });

  it('records why it fell back and posts the reason as a notice', () => {
    expect(source).toContain('WebGPU backend failed (');
    expect(source).toContain('WASM backend failed (');
    expect(source).toContain('Model warm-up failed on ');
    expect(source).toContain("post({ type: 'katago:notice', level: 'warn', message: backendNote });");
  });
});
