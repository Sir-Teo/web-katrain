import { describe, expect, it } from 'vitest';
import { DEFAULT_KATAGO_VISITS, normalizeStoredSettings, useGameStore } from '../src/store/gameStore';

describe('settings defaults', () => {
  it('defaults full-strength KataGo visits to 5000', () => {
    expect(DEFAULT_KATAGO_VISITS).toBe(5000);
    expect(useGameStore.getState().settings.katagoVisits).toBe(5000);
  });

  it('enables gamepad review navigation by default', () => {
    expect(useGameStore.getState().settings.gamepadNavigation).toBe(true);
  });

  it('enables touch haptics by default when the browser supports them', () => {
    expect(useGameStore.getState().settings.hapticFeedback).toBe(true);
  });

  it('enables fuzzy stone placement by default', () => {
    expect(useGameStore.getState().settings.fuzzyStonePlacement).toBe(true);
  });
});

describe('the old 500-visit default', () => {
  it('is read as the old default in settings saved before revisions', () => {
    expect(normalizeStoredSettings({ katagoVisits: 500 }, null)?.katagoVisits).toBe(5000);
  });

  it('is kept when chosen and saved since', () => {
    const settings = normalizeStoredSettings({ katagoVisits: 500, settingsRevision: 1 }, null);
    expect(settings?.katagoVisits).toBe(500);
    expect(settings && 'settingsRevision' in settings).toBe(false);
  });
});
