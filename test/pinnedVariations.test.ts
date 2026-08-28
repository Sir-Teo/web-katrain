import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { GameNode } from '../src/types';
import {
  PINNED_VARIATIONS_STORAGE_KEY,
  PIN_GAME_ID_PROP,
  type PinnedVariation,
  ensurePinGameId,
  getNodePath,
  getPinGameId,
  readStoredPinnedVariations,
  resolveNodePath,
  restorePinnedVariations,
  writeStoredPinnedVariations,
} from '../src/utils/pinnedVariations';

const originalLocalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');

function stubLocalStorage() {
  const entries = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    value: {
      getItem: (key: string) => entries.get(key) ?? null,
      setItem: (key: string, value: string) => { entries.set(key, String(value)); },
      removeItem: (key: string) => { entries.delete(key); },
    },
    configurable: true,
    writable: true,
  });
  return entries;
}

/** A bare tree: only the fields pinnedVariations reads. */
function node(children: GameNode[] = []): GameNode {
  const created = { parent: null, children, properties: undefined } as unknown as GameNode;
  for (const child of children) (child as { parent: GameNode | null }).parent = created;
  return created;
}

function pin(overrides: Partial<PinnedVariation> = {}): PinnedVariation {
  return { id: 'p1', label: 'Ladder', path: [0], moveNumber: 4, createdAt: 1, ...overrides };
}

let entries: Map<string, string>;

beforeEach(() => { entries = stubLocalStorage(); });

afterEach(() => {
  if (originalLocalStorage) Object.defineProperty(globalThis, 'localStorage', originalLocalStorage);
  else Reflect.deleteProperty(globalThis, 'localStorage');
});

describe('addressing a node by its path', () => {
  it('gives the root an empty path', () => {
    expect(getNodePath(node())).toEqual([]);
  });

  it('records the child index taken at each step', () => {
    const deep = node();
    const branchA = node();
    const branchB = node();
    const leaf = node();
    (branchB as { children: GameNode[] }).children = [leaf];
    (leaf as { parent: GameNode | null }).parent = branchB;
    (deep as { children: GameNode[] }).children = [branchA, branchB];
    (branchA as { parent: GameNode | null }).parent = deep;
    (branchB as { parent: GameNode | null }).parent = deep;

    expect(getNodePath(branchA)).toEqual([0]);
    expect(getNodePath(branchB)).toEqual([1]);
    expect(getNodePath(leaf)).toEqual([1, 0]);
  });

  it('round-trips a path back to the node it came from', () => {
    const leaf = node();
    const branch = node([leaf]);
    const root = node([node(), branch]);
    expect(resolveNodePath(root, getNodePath(leaf))).toBe(leaf);
  });

  it('returns null for a path the tree no longer has', () => {
    const root = node([node()]);
    expect(resolveNodePath(root, [5])).toBeNull();
    expect(resolveNodePath(root, [0, 0])).toBeNull();
  });

  it('resolves the empty path to the root itself', () => {
    const root = node([node()]);
    expect(resolveNodePath(root, [])).toBe(root);
  });
});

describe('the pin id that travels with the game', () => {
  it('has none until one is assigned', () => {
    expect(getPinGameId(node())).toBeNull();
  });

  it('assigns one and keeps it thereafter', () => {
    const root = node();
    const id = ensurePinGameId(root, () => 'wk-fixed');
    expect(id).toBe('wk-fixed');
    expect(getPinGameId(root)).toBe('wk-fixed');
    expect(root.properties?.[PIN_GAME_ID_PROP]).toEqual(['wk-fixed']);
    expect(ensurePinGameId(root, () => 'wk-other')).toBe('wk-fixed');
  });
});

describe('storing pins', () => {
  it('round-trips a pin set for a game', () => {
    writeStoredPinnedVariations('g1', [pin()]);
    expect(readStoredPinnedVariations('g1')).toEqual([pin()]);
  });

  it('keeps games apart', () => {
    writeStoredPinnedVariations('g1', [pin({ id: 'a' })]);
    writeStoredPinnedVariations('g2', [pin({ id: 'b' })]);
    expect(readStoredPinnedVariations('g1')[0].id).toBe('a');
    expect(readStoredPinnedVariations('g2')[0].id).toBe('b');
  });

  it('removes the entry when the last pin goes', () => {
    writeStoredPinnedVariations('g1', [pin()]);
    writeStoredPinnedVariations('g1', []);
    expect(readStoredPinnedVariations('g1')).toEqual([]);
    expect(entries.get(PINNED_VARIATIONS_STORAGE_KEY)).not.toContain('g1');
  });

  it('has nothing to say without a game id', () => {
    expect(readStoredPinnedVariations(null)).toEqual([]);
    expect(() => writeStoredPinnedVariations(null, [pin()])).not.toThrow();
  });

  it('drops stored pins that are no longer well formed', () => {
    entries.set(PINNED_VARIATIONS_STORAGE_KEY, JSON.stringify({
      g1: {
        updatedAt: 1,
        pins: [
          pin({ id: 'good' }),
          { id: 'nopath', label: 'x', moveNumber: 1 },
          { id: 'badpath', label: 'x', path: [-1], moveNumber: 1 },
          { id: 'fractional', label: 'x', path: [1.5], moveNumber: 1 },
          null,
        ],
      },
    }));
    expect(readStoredPinnedVariations('g1').map(p => p.id)).toEqual(['good']);
  });

  it('reads corrupted storage as empty rather than throwing', () => {
    entries.set(PINNED_VARIATIONS_STORAGE_KEY, '{not json');
    expect(readStoredPinnedVariations('g1')).toEqual([]);
    entries.set(PINNED_VARIATIONS_STORAGE_KEY, JSON.stringify(['an array']));
    expect(readStoredPinnedVariations('g1')).toEqual([]);
  });

  it('evicts the least recently touched games past the cap', () => {
    for (let index = 0; index < 105; index += 1) {
      writeStoredPinnedVariations(`g${index}`, [pin()], index);
    }
    const stored = JSON.parse(entries.get(PINNED_VARIATIONS_STORAGE_KEY) as string);
    expect(Object.keys(stored)).toHaveLength(100);
    // The newest survive; the oldest are gone.
    expect(stored.g104).toBeTruthy();
    expect(stored.g0).toBeUndefined();
  });

  it('keeps the game it was just asked to store', () => {
    for (let index = 0; index < 105; index += 1) {
      writeStoredPinnedVariations(`g${index}`, [pin()], index);
    }
    expect(readStoredPinnedVariations('g104')).toHaveLength(1);
  });
});

describe('restoring pins onto a tree', () => {
  it('keeps only the pins whose path still resolves', () => {
    const root = node([node()]);
    ensurePinGameId(root, () => 'wk-1');
    writeStoredPinnedVariations('wk-1', [
      pin({ id: 'lives', path: [0] }),
      pin({ id: 'gone', path: [3] }),
    ]);
    expect(restorePinnedVariations(root).map(p => p.id)).toEqual(['lives']);
  });

  it('has nothing to restore for a game that was never pinned', () => {
    expect(restorePinnedVariations(node())).toEqual([]);
  });
});
