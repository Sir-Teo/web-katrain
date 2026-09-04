import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { BOARD_THEME_OPTIONS, getBoardTheme } from '../src/utils/boardThemes';
import type { BoardThemeId } from '../src/types';
import { useGameStore } from '../src/store/gameStore';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = path.join(rootDir, 'public');

function readPngSize(relativePath: string): { width: number; height: number } {
  const buffer = fs.readFileSync(path.join(publicDir, relativePath));
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

describe('PWA assets', () => {
  it('ships PNG install icons for manifest and iOS home-screen installs', () => {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(publicDir, 'manifest.webmanifest'), 'utf8')
    ) as {
      id?: string;
      icons?: Array<{ src?: string; sizes?: string; type?: string; purpose?: string }>;
      screenshots?: Array<{ src?: string; sizes?: string; type?: string; form_factor?: string; label?: string }>;
      shortcuts?: Array<{ icons?: Array<{ src?: string; sizes?: string; type?: string }> }>;
    };

    expect(manifest.id).toBe('.');
    expect(manifest.icons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          src: 'pwa/icon-192.png',
          sizes: '192x192',
          type: 'image/png',
          purpose: 'any maskable',
        }),
        expect.objectContaining({
          src: 'pwa/icon-512.png',
          sizes: '512x512',
          type: 'image/png',
          purpose: 'any maskable',
        }),
      ])
    );
    expect(manifest.shortcuts?.[0]?.icons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ src: 'pwa/icon-192.png', sizes: '192x192', type: 'image/png' }),
      ])
    );
    expect(manifest.screenshots).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          src: 'pwa/screenshot-wide.png',
          sizes: '1280x800',
          type: 'image/png',
          form_factor: 'wide',
        }),
        expect.objectContaining({
          src: 'pwa/screenshot-mobile.png',
          sizes: '390x844',
          type: 'image/png',
          form_factor: 'narrow',
        }),
      ])
    );

    expect(readPngSize('pwa/icon-192.png')).toEqual({ width: 192, height: 192 });
    expect(readPngSize('pwa/icon-512.png')).toEqual({ width: 512, height: 512 });
    expect(readPngSize('pwa/apple-touch-icon.png')).toEqual({ width: 180, height: 180 });
    expect(readPngSize('pwa/screenshot-wide.png')).toEqual({ width: 1280, height: 800 });
    expect(readPngSize('pwa/screenshot-mobile.png')).toEqual({ width: 390, height: 844 });

    const indexHtml = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
    expect(indexHtml).toContain('pwa/apple-touch-icon.png');
    expect(indexHtml).toContain('property="og:image" content="%BASE_URL%pwa/screenshot-wide.png"');
    expect(indexHtml).toContain('name="twitter:card" content="summary_large_image"');

    // The install icons are precached; the screenshots deliberately are not.
    // See "precaches what offline needs" below for why, and for the guard that
    // keeps them out.
    const sw = fs.readFileSync(path.join(publicDir, 'sw.js'), 'utf8');
    expect(sw).toContain('./pwa/icon-192.png');
    expect(sw).toContain('./pwa/icon-512.png');
    expect(sw).toContain('./pwa/apple-touch-icon.png');
  });

  it('precaches what offline needs and not the install dialog\u2019s decoration', () => {
    const sw = fs.readFileSync(path.join(publicDir, 'sw.js'), 'utf8');
    const precache = sw.slice(sw.indexOf('const PRECACHE_URLS'), sw.indexOf('];', sw.indexOf('const PRECACHE_URLS')));

    // The engine and its runtime are the offline promise; measured live, the
    // shell cache holds the model and all three wasm variants.
    expect(precache).toContain('./models/katago-small.bin.gz');
    expect(precache.match(/\.wasm'/g) ?? []).toHaveLength(3);

    /**
     * The manifest's screenshots are 504KB of the install dialog's preview and
     * of index.html's social card -- shown by the browser, the OS or a crawler,
     * never by the running app. Precaching them cost every first visit 8% of a
     * 6.4MB install for something offline never needs.
     */
    expect(precache).not.toContain('screenshot-wide');
    expect(precache).not.toContain('screenshot-mobile');
    // Still cache-first if something ever does ask for them.
    expect(sw).toMatch(/isCacheFirstAsset[\s\S]{0,200}png/);
    // And still declared, so the install dialog can show them.
    const manifest = JSON.parse(fs.readFileSync(path.join(publicDir, 'manifest.webmanifest'), 'utf8'));
    expect(manifest.screenshots.map((s: { src: string }) => s.src)).toContain('pwa/screenshot-wide.png');
  });

  it('never caches failed navigations as the offline shell', () => {
    const sw = fs.readFileSync(path.join(publicDir, 'sw.js'), 'utf8');
    const navigateStart = sw.indexOf("request.mode === 'navigate'");
    const assetStart = sw.indexOf('isCacheFirstAsset(url)');
    expect(navigateStart).toBeGreaterThan(-1);
    expect(assetStart).toBeGreaterThan(navigateStart);
    // The navigate handler must check the response before overwriting './',
    // or a transient 404/500 permanently poisons offline navigation.
    //
    // The check is asserted by intent rather than by its exact text. It used to
    // read `if (response.ok)` and now reads `isStorableResponse(response)`,
    // which is stricter: `.ok` is also true for 206 Partial Content, and
    // `cache.put` throws on those. Pinning the old spelling failed on a change
    // that made the guard better.
    const navigateHandler = sw.slice(navigateStart, assetStart);
    expect(navigateHandler).toContain("cache.put('./'");
    const guard = navigateHandler.indexOf('isStorableResponse(response)');
    expect(guard, 'the navigate handler has no success guard').toBeGreaterThan(-1);
    expect(guard).toBeLessThan(navigateHandler.indexOf("cache.put('./'"));
  });

  it('never caches a partial response', () => {
    const sw = fs.readFileSync(path.join(publicDir, 'sw.js'), 'utf8');
    // `response.ok` is true for 206 Partial Content and `cache.put()` throws on
    // those — verified in a browser. Browsers issue Range requests for exactly
    // the assets this app is largest in: a ~96MB network and megabyte TFJS wasm
    // files. Every cache write must go through the stricter check.
    expect(sw).toContain('const isStorableResponse = (response) => response.status === 200;');
    const writes = sw.match(/if \(response\.ok\)/g) ?? [];
    expect(writes, 'a cache write still gates on response.ok').toEqual([]);
  });

  it('does not retain cache-busted update checks or unlimited old bundles', () => {
    const sw = fs.readFileSync(path.join(publicDir, 'sw.js'), 'utf8');
    const runtimeStart = sw.indexOf('caches.open(RUNTIME_CACHE)');
    const runtimeHandler = sw.slice(runtimeStart);

    // `version.json?t=...` is fetched with `cache: no-store` every five
    // minutes. Ignoring that request mode creates a fresh permanent entry on
    // every check because the timestamp is deliberately unique.
    expect(sw).toContain("const isCacheableRequest = (request) => request.cache !== 'no-store';");
    expect(runtimeHandler).toContain('isCacheableRequest(request)');

    // Hashed JS/CSS names change on each deploy. Bound the runtime cache so
    // several releases cannot grow into an unbounded origin-storage leak.
    expect(sw).toContain('const MAX_RUNTIME_CACHE_ENTRIES = 64;');
    expect(sw).toContain('keys.slice(0, excess)');
    expect(runtimeHandler).toContain('putRuntimeResponse(cache, request, response.clone())');
  });

  it('publishes crawl metadata for the public web deployment', () => {
    const robots = fs.readFileSync(path.join(publicDir, 'robots.txt'), 'utf8');
    const sitemap = fs.readFileSync(path.join(publicDir, 'sitemap.xml'), 'utf8');

    expect(robots).toContain('User-agent: *');
    expect(robots).toContain('Allow: /');
    expect(robots).toContain('Sitemap: https://sir-teo.github.io/web-katrain/sitemap.xml');

    expect(sitemap).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect(sitemap).toContain('<loc>https://sir-teo.github.io/web-katrain/</loc>');
    expect(sitemap).toContain('<lastmod>2026-06-03</lastmod>');
    expect(sitemap).toContain('<changefreq>weekly</changefreq>');
  });

  it('precaches the board every visit draws, not the themes most visits never pick', () => {
    const sw = fs.readFileSync(path.join(publicDir, 'sw.js'), 'utf8');
    const precache = sw.slice(sw.indexOf('const PRECACHE_URLS'), sw.indexOf('];', sw.indexOf('const PRECACHE_URLS')));

    /**
     * 660KB of `katrain/` images were precached, of which 484KB belonged to
     * board themes that are not the default: `board.png` is bamboo's texture
     * and the two stone images are bamboo's, flat's and dark's. Every first
     * visit paid for all three regardless of which board it then drew.
     *
     * Derived from the theme table rather than listed, so changing the default
     * theme or retexturing one moves this guard with it.
     */
    const defaultTheme = useGameStore.getState().settings.boardTheme;
    // `getBoardTheme` hands back resolved URLs, so match the tail rather than
    // the raw `katrain/...` the theme table is written with.
    const katrainAssets = (id: BoardThemeId) => {
      const theme = getBoardTheme(id);
      return [theme.board.texture, theme.stones.black.image, theme.stones.white.image]
        .map((asset) => /(katrain\/[\w.-]+)$/.exec(asset ?? '')?.[1])
        .filter((asset): asset is string => asset !== undefined);
    };

    const usedByDefault = new Set(katrainAssets(defaultTheme));
    const onlyOtherThemes = [
      ...new Set(BOARD_THEME_OPTIONS.flatMap((option) => katrainAssets(option.value))),
    ].filter((asset) => !usedByDefault.has(asset));

    // The premise: the default board reaches for none of them.
    expect(usedByDefault.size).toBe(0);
    expect(onlyOtherThemes.length).toBeGreaterThanOrEqual(3);
    for (const asset of onlyOtherThemes) expect(precache).not.toContain(asset);

    // What GoBoard draws under every theme stays precached -- this is the half
    // of the trade that makes the offline board work at all.
    const goBoard = fs.readFileSync(path.join(rootDir, 'src/components/GoBoard.tsx'), 'utf8');
    const alwaysDrawn = [...goBoard.matchAll(/publicUrl\('(katrain\/[\w.-]+)'\)/g)].map((match) => match[1]!);
    expect(alwaysDrawn.length).toBeGreaterThanOrEqual(3);
    for (const asset of alwaysDrawn) expect(precache).toContain(asset);

    // And the dropped ones stay cache-first, so picking one of those themes
    // once is enough to have it offline afterwards.
    expect(sw).toContain("url.pathname.includes('/katrain/')");
  });

  it('does not keep starter-template assets', () => {
    expect(fs.existsSync(path.join(publicDir, 'vite.svg'))).toBe(false);
    expect(fs.existsSync(path.join(rootDir, 'src/assets/react.svg'))).toBe(false);
  });
});
