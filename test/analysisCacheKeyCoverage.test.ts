import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const SOURCE = readFileSync('src/store/gameStore.ts', 'utf8');
const SETTING = /settings\.(katago[A-Za-z]+|humanSl[A-Za-z]+|aiStrategy)/g;

function settingsIn(text: string): Set<string> {
  return new Set([...text.matchAll(SETTING)].map((m) => m[1]!));
}

/** The settings whose change wipes the whole cache. */
function invalidationList(): Set<string> {
  const start = SOURCE.indexOf('const engineKeys: Array<keyof GameSettings> = [');
  const block = SOURCE.slice(start, SOURCE.indexOf('];', start));
  return new Set([...block.matchAll(/'([^']+)'/g)].map((m) => m[1]!));
}

/**
 * A cached analysis must never come back from a run under different settings.
 *
 * Two mechanisms keep that true and neither covers everything on its own:
 * `updateSettings` clears the entire cache when a setting on its `engineKeys`
 * list changes, and each call site names the rest in its own `analysisCacheKey`.
 * `aiStrategy` and `katagoReuseTree` are held only by the second.
 *
 * The failure is silent -- a setting added to the request and to neither list
 * returns a stale answer computed under the old value, with nothing to show for
 * it -- so this checks the invariant rather than any one list.
 */
describe('analysis cache keys cover what changes an answer', () => {
  const sentToEngine = new Set<string>();
  for (const call of SOURCE.matchAll(/getKataGoEngineClient\(\)\.analyze\(\{(.*?)\n\s*\}\)/gs)) {
    for (const setting of settingsIn(call[1]!)) sentToEngine.add(setting);
  }

  const keyed = new Set<string>();
  for (const key of SOURCE.matchAll(/analysisCacheKey\((.*?)\n\s*\),/gs)) {
    for (const setting of settingsIn(key[1]!)) keyed.add(setting);
  }

  it('finds the requests and the keys to compare', () => {
    // If either parse collapses, the check below passes on nothing.
    expect(sentToEngine.size, 'no analyze() requests parsed').toBeGreaterThanOrEqual(12);
    expect(keyed.size, 'no cache keys parsed').toBeGreaterThanOrEqual(8);
    expect(invalidationList().size, 'no engineKeys list parsed').toBeGreaterThanOrEqual(15);
  });

  it('leaves no setting held by neither the cache key nor the invalidation list', () => {
    const invalidated = invalidationList();
    const uncovered = [...sentToEngine]
      .filter((setting) => !invalidated.has(setting) && !keyed.has(setting))
      .sort();

    expect(
      uncovered,
      'these reach the engine but nothing invalidates or keys on them, so a cached ' +
        'analysis outlives a change to them: add each to engineKeys in updateSettings, ' +
        'or to the analysisCacheKey of every call site that sends it'
    ).toEqual([]);
  });
});
