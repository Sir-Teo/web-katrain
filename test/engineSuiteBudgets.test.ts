import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ENGINE_MAX_TIME_MS } from '../src/engine/katago/limits';
import { skipIfSearchWasCutShort } from './helpers/engineHarness';

const graph = readFileSync('test/engineGraphSearch.test.ts', 'utf8');
const golden = readFileSync('test/engineSearchGoldenTuned.test.ts', 'utf8');

const constant = (source: string, name: string): number => {
  const match = new RegExp(`const ${name} = ([\\w_]+|[\\d_]+);`).exec(source);
  expect(match, name).not.toBeNull();
  const raw = match![1]!;
  return raw === 'ENGINE_MAX_TIME_MS' ? ENGINE_MAX_TIME_MS : Number(raw.replace(/_/g, ''));
};

/**
 * A search that may spend its whole wall-clock budget cannot be given a test
 * timeout equal to that budget: loading the net, building the board and making
 * the assertions all have to fit too. Both suites had the same number for both
 * -- 180000 and 180000, 300000 and 300000 -- so on a box slow enough to use the
 * budget, one reported a bare vitest timeout and the other reported an
 * assertion only because its deadline happened to fire first. Neither says
 * anything about the search. Measured here, the graph search returned at
 * 181228ms against its old 180000ms timeout: it lost by 1.2s of setup.
 */
describe('engine suites leave room to report', () => {
  it.each([
    ['graph search', graph],
    ['golden tuned', golden],
  ])('%s gives the test more time than it gives the search', (_name, source) => {
    const budget = constant(source, 'SEARCH_BUDGET_MS');
    const timeout = constant(source, 'TEST_TIMEOUT_MS');
    expect(timeout).toBeGreaterThan(budget);
    // Enough for the model load and the assertions, not a token pixel.
    expect(timeout - budget).toBeGreaterThanOrEqual(60_000);
  });

  it.each([
    ['graph search', graph],
    ['golden tuned', golden],
  ])('%s uses the named constants rather than repeating the numbers', (_name, source) => {
    expect(source).toContain('maxTimeMs: SEARCH_BUDGET_MS');
    expect(source).toContain('}, TEST_TIMEOUT_MS);');
  });

  it('never lets a search budget exceed the engine cap that truncates it', () => {
    // A budget above the cap would be silently clamped, so the timeout would be
    // sized against a number the search can never spend.
    for (const [name, source] of [['graph search', graph], ['golden tuned', golden]] as const) {
      expect(constant(source, 'SEARCH_BUDGET_MS'), name).toBeLessThanOrEqual(ENGINE_MAX_TIME_MS);
    }
  });
});

describe('the short-search skip', () => {
  const fake = () => {
    const calls: Array<{ condition: boolean; note?: string }> = [];
    return { calls, skip: (condition: boolean, note?: string) => { calls.push({ condition, note }); } };
  };

  it('skips when the search did not reach its budget, and says by how much', () => {
    const ctx = fake();
    skipIfSearchWasCutShort(ctx, 484, 800, 180_000);
    expect(ctx.calls[0]!.condition).toBe(true);
    expect(ctx.calls[0]!.note).toBe('search reached 484 of 800 visits inside 180000ms');
  });

  it('does not skip when the search got what it asked for', () => {
    const ctx = fake();
    skipIfSearchWasCutShort(ctx, 800, 800, 180_000);
    expect(ctx.calls[0]!.condition).toBe(false);
  });

  it('does not skip a search that overshot', () => {
    // Batched playouts can land a visit or two past the budget.
    const ctx = fake();
    skipIfSearchWasCutShort(ctx, 803, 800, 180_000);
    expect(ctx.calls[0]!.condition).toBe(false);
  });
});
