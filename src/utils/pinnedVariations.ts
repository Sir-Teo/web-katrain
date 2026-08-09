import type { GameNode } from '../types';
import { readLocalStorage, writeLocalStorage } from './storage';

// A pinned variation records a stable route from the root to a node so it can be
// recalled later. GameNode.id is random per load, so we store the child-index
// path (deterministic for a given tree) plus a cached label/move number.
export interface PinnedVariation {
  id: string;
  label: string;
  path: number[]; // child index at each step from root to the node
  moveNumber: number;
  createdAt: number;
}

/** Child-index path from the root down to `node` (root itself => []). */
export function getNodePath(node: GameNode): number[] {
  const path: number[] = [];
  let current: GameNode | null = node;
  while (current && current.parent) {
    const idx = current.parent.children.indexOf(current);
    path.push(idx < 0 ? 0 : idx);
    current = current.parent;
  }
  return path.reverse();
}

/** Resolve a child-index path back to a node within `root`, or null if it no longer exists. */
export function resolveNodePath(root: GameNode, path: number[]): GameNode | null {
  let current: GameNode = root;
  for (const idx of path) {
    const next = current.children[idx];
    if (!next) return null;
    current = next;
  }
  return current;
}

// Pins persist across reloads keyed by a private root property (WKID) that
// travels inside the SGF itself, so auto-save, library saves, and re-imported
// files all map back to the same pin set without content hashing.
export const PIN_GAME_ID_PROP = 'WKID';
export const PINNED_VARIATIONS_STORAGE_KEY = 'web-katrain:pinned_variations:v1';
const MAX_STORED_PIN_GAMES = 100;

type StoredPinEntry = { pins: PinnedVariation[]; updatedAt: number };
type StoredPinMap = Record<string, StoredPinEntry>;

/** The game's pin id, or null if none was assigned yet. */
export function getPinGameId(root: GameNode): string | null {
  const value = root.properties?.[PIN_GAME_ID_PROP]?.[0];
  return typeof value === 'string' && value.trim() ? value : null;
}

/** Get the game's pin id, assigning a fresh one on the root node if missing. */
export function ensurePinGameId(root: GameNode, generateId: () => string = defaultPinGameId): string {
  const existing = getPinGameId(root);
  if (existing) return existing;
  const id = generateId();
  root.properties = { ...(root.properties ?? {}), [PIN_GAME_ID_PROP]: [id] };
  return id;
}

function defaultPinGameId(): string {
  const cryptoObj = typeof globalThis.crypto !== 'undefined' ? globalThis.crypto : null;
  if (cryptoObj?.randomUUID) return `wk-${cryptoObj.randomUUID()}`;
  return `wk-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function isValidStoredPin(value: unknown): value is PinnedVariation {
  if (!value || typeof value !== 'object') return false;
  const pin = value as Partial<PinnedVariation>;
  return (
    typeof pin.id === 'string' &&
    typeof pin.label === 'string' &&
    Array.isArray(pin.path) &&
    pin.path.every((idx) => Number.isInteger(idx) && idx >= 0) &&
    typeof pin.moveNumber === 'number'
  );
}

function readStoredPinMap(): StoredPinMap {
  const raw = readLocalStorage(PINNED_VARIATIONS_STORAGE_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: StoredPinMap = {};
    for (const [gameId, entry] of Object.entries(parsed as Record<string, unknown>)) {
      if (!entry || typeof entry !== 'object') continue;
      const { pins, updatedAt } = entry as Partial<StoredPinEntry>;
      if (!Array.isArray(pins)) continue;
      const validPins = pins.filter(isValidStoredPin);
      if (validPins.length === 0) continue;
      out[gameId] = {
        pins: validPins,
        updatedAt: typeof updatedAt === 'number' && Number.isFinite(updatedAt) ? updatedAt : 0,
      };
    }
    return out;
  } catch {
    return {};
  }
}

/** Pins stored for a game id (unvalidated against any tree). */
export function readStoredPinnedVariations(gameId: string | null): PinnedVariation[] {
  if (!gameId) return [];
  return readStoredPinMap()[gameId]?.pins ?? [];
}

/** Persist the pin set for a game id; an empty set removes the entry. */
export function writeStoredPinnedVariations(gameId: string | null, pins: PinnedVariation[], updatedAt = Date.now()): void {
  if (!gameId) return;
  const map = readStoredPinMap();
  if (pins.length === 0) {
    if (!map[gameId]) return;
    delete map[gameId];
  } else {
    map[gameId] = { pins, updatedAt };
  }
  const entries = Object.entries(map);
  if (entries.length > MAX_STORED_PIN_GAMES) {
    entries.sort((a, b) => b[1].updatedAt - a[1].updatedAt);
    entries.length = MAX_STORED_PIN_GAMES;
  }
  writeLocalStorage(PINNED_VARIATIONS_STORAGE_KEY, JSON.stringify(Object.fromEntries(entries)));
}

/** Stored pins for a game, kept only if their path still resolves within `root`. */
export function restorePinnedVariations(root: GameNode): PinnedVariation[] {
  const gameId = getPinGameId(root);
  if (!gameId) return [];
  return readStoredPinnedVariations(gameId).filter((pin) => resolveNodePath(root, pin.path) !== null);
}
