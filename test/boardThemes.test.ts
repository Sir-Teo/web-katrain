import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { BOARD_THEME_OPTIONS, getBoardTheme, resolveBoardThemeAsset, type ThemeStoneConfig } from '../src/utils/boardThemes';

const publicDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');

function localPublicPath(url: string | undefined): string | null {
  if (!url) return null;
  const match = url.match(/\/(katrain|themes)\/.+$/);
  return match ? match[0].slice(1) : null;
}

function expectPublicAsset(url: string | undefined): void {
  const localPath = localPublicPath(url);
  if (!localPath) return;
  expect(fs.existsSync(path.join(publicDir, localPath)), `${localPath} exists`).toBe(true);
}

function expectStoneAssets(stone: ThemeStoneConfig): void {
  expectPublicAsset(stone.image);
  for (const variation of stone.imageVariations ?? []) expectPublicAsset(variation);
}

describe('board theme assets', () => {
  it('advertised board themes resolve to shipped public assets', () => {
    for (const option of BOARD_THEME_OPTIONS) {
      const theme = getBoardTheme(option.value);
      expectPublicAsset(theme.board.texture);
      expectStoneAssets(theme.stones.black);
      expectStoneAssets(theme.stones.white);
    }
  });

  it('keeps theme assets bundled and predictable', () => {
    expect(resolveBoardThemeAsset('baduktv', 'stone-black.png')).toBe('/themes/baduktv/stone-black.png');
    expect(resolveBoardThemeAsset('baduktv', './stone-white.png')).toBe('/themes/baduktv/stone-white.png');
    expect(resolveBoardThemeAsset('baduktv', 'katrain/board.png')).toBe('/katrain/board.png');
    expect(resolveBoardThemeAsset('baduktv', '/themes/baduktv/board.png')).toBe('/themes/baduktv/board.png');

    expect(resolveBoardThemeAsset('baduktv', 'https://example.com/stone.png')).toBeUndefined();
    expect(resolveBoardThemeAsset('baduktv', '//example.com/stone.png')).toBeUndefined();
    expect(resolveBoardThemeAsset('baduktv', 'data:image/png;base64,abc')).toBeUndefined();
    expect(resolveBoardThemeAsset('baduktv', '../other-theme/board.png')).toBeUndefined();
    expect(resolveBoardThemeAsset('baduktv', '%2e%2e/other-theme/board.png')).toBeUndefined();
    expect(resolveBoardThemeAsset('baduktv', 'stone%2f..%2fsecret.png')).toBeUndefined();
    expect(resolveBoardThemeAsset('baduktv', 'assets\\board.png')).toBeUndefined();
    expect(resolveBoardThemeAsset('baduktv', '/robots.txt')).toBeUndefined();
    expect(resolveBoardThemeAsset('baduktv', 'stone-black.png?cache=1')).toBeUndefined();
    expect(resolveBoardThemeAsset('baduktv', 'stone-black.png#preview')).toBeUndefined();
  });
});
