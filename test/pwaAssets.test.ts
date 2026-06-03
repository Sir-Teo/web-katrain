import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

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

    const sw = fs.readFileSync(path.join(publicDir, 'sw.js'), 'utf8');
    expect(sw).toContain('./pwa/icon-192.png');
    expect(sw).toContain('./pwa/icon-512.png');
    expect(sw).toContain('./pwa/apple-touch-icon.png');
    expect(sw).toContain('./pwa/screenshot-wide.png');
    expect(sw).toContain('./pwa/screenshot-mobile.png');
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

  it('does not ship starter-template public assets', () => {
    expect(fs.existsSync(path.join(publicDir, 'vite.svg'))).toBe(false);
  });
});
