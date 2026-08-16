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

/** WCAG relative luminance of an #rrggbb colour. */
function relativeLuminance(hex: string): number {
  const value = hex.replace('#', '');
  const channels = [0, 2, 4]
    .map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
}

function contrastRatio(a: string, b: string): number {
  const [lighter, darker] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (lighter! + 0.05) / (darker! + 0.05);
}

describe('board coordinate legibility', () => {
  // Coordinates were once unreadable in 7 of 9 themes because each theme's
  // coordColor alpha was multiplied a second time by an opacity-80 class,
  // bottoming out at 1.8:1 on the wood. Keep every theme above WCAG AA.
  it('keeps every theme’s coordinates at 4.5:1 against its board', () => {
    for (const option of BOARD_THEME_OPTIONS) {
      const theme = getBoardTheme(option.value);
      const coordColor = theme.coordColor;
      if (!coordColor) continue;
      const ratio = contrastRatio(theme.board.backgroundColor, coordColor);
      expect(ratio, `${theme.name} coordinates on board (${ratio.toFixed(2)}:1)`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('does not dim the coordinate colour a second time in the board markup', () => {
    const source = fs.readFileSync(
      path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'components', 'GoBoard.tsx'),
      'utf8'
    );
    expect(source).not.toContain('font-bold tracking-tight opacity-80');
  });
});
