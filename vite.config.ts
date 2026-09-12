import path from 'node:path';
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import { configDefaults, defineConfig } from 'vitest/config';
import type { Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { createVersionMetadata } from './src/utils/versionMetadata';
import { DESKTOP_LAYOUT_MEDIA } from './src/utils/layoutBreakpoints';

// https://vite.dev/config/
const repoName = process.env.GITHUB_REPOSITORY?.split('/')[1];
const inferredBase = repoName && !repoName.endsWith('.github.io') ? `/${repoName}/` : '/';
const rawBase = process.env.VITE_BASE_URL ?? process.env.BASE_URL ?? inferredBase;
const normalizedBase = rawBase.startsWith('/') ? rawBase : `/${rawBase}`;
const base = normalizedBase.endsWith('/') ? normalizedBase : `${normalizedBase}/`;
const packageJson = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'package.json'), 'utf8')) as { version?: string };

const readGit = (command: string): string => {
  try {
    return execSync(command, { cwd: __dirname, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return '';
  }
};

const appVersion = packageJson.version ?? '0.0.0';
const appCommit = readGit('git rev-parse --short HEAD') || 'dev';
const appCommitDate = readGit('git log -1 --format=%cs') || '';
const versionMetadata = createVersionMetadata({
  version: appVersion,
  commit: appCommit,
  commitDate: appCommitDate,
  buildDate: new Date().toISOString(),
});
const serializedVersionMetadata = () => `${JSON.stringify(versionMetadata, null, 2)}\n`;

function versionMetadataPlugin(): Plugin {
  const serveVersionMetadata: Plugin['configureServer'] = (server) => {
    server.middlewares.use((req, res, next) => {
      const requestPath = req.url?.split('?')[0];
      if (requestPath !== '/version.json' && requestPath !== `${base}version.json`) {
        next();
        return;
      }

      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store, max-age=0');
      res.end(serializedVersionMetadata());
    });
  };

  return {
    name: 'web-katrain-version-metadata',
    configureServer: serveVersionMetadata,
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: serializedVersionMetadata(),
      });
    },
  };
}

/**
 * Starts the desktop shell downloading alongside the entry chunk.
 *
 * DesktopDashboard is lazy(), which is right -- a phone renders the classic
 * shell and never needs it -- but on a desktop load it is the shell, and a
 * dynamic import cannot be discovered until the entry has been downloaded,
 * parsed, and rendered far enough to reach it. Measured on the production
 * preview at 1280x800: main.js finished at 74ms, the dashboard chunk was not
 * requested until 94.8ms, and first contentful paint landed at 110ms -- a
 * second round trip that had no reason not to overlap the first. The same
 * trace on a phone shows no second chunk at all.
 *
 * The hint is added by an inline script rather than written straight into the
 * markup so that it stays conditional. A plain <link> in the head would make
 * every phone download a shell it will never render.
 *
 * The stylesheet is fetched as a preload rather than applied as a stylesheet:
 * inserting it here would put it ahead of the entry's CSS in the cascade,
 * which is not where it sits today.
 */
function preloadDesktopShellPlugin(): Plugin {
  const shellModule = 'src/components/dashboard/DesktopDashboard.tsx';
  return {
    name: 'web-katrain-preload-desktop-shell',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        if (!ctx.bundle) return html;
        // Only the real entry. 404.html is a redirect stub that replaces the
        // location from an inline script, so a hint there starts a fetch the
        // navigation immediately abandons.
        if (!/(^|\/)index\.html$/.test(ctx.filename.replace(/\\/g, '/'))) return html;
        const chunks = Object.values(ctx.bundle).filter(
          (item): item is Extract<typeof item, { type: 'chunk' }> => item.type === 'chunk',
        );
        const shell = chunks.find((chunk) =>
          chunk.facadeModuleId?.replace(/\\/g, '/').endsWith(shellModule),
        );
        if (!shell) {
          // Silently losing the preload would cost a round trip that nothing
          // measures, so a move or a rename should stop the build instead.
          throw new Error(
            `preloadDesktopShellPlugin: no chunk for ${shellModule}. `
            + 'If the desktop shell moved, point shellModule at its new path.',
          );
        }
        // Whatever the shell statically imports is needed in the same wave, so
        // hint that too -- this is the set Vite's own runtime preloader would
        // ask for once the dynamic import finally ran. Minus anything already
        // in the markup with a link of its own: the shell's static imports are
        // mostly the shared vendor chunks, so without that filter most of what
        // this emits is a duplicate of a hint the entry already carries.
        const isAlreadyHinted = (fileName: string) => html.includes(fileName);
        const scripts = [shell.fileName, ...shell.imports].filter((file) => !isAlreadyHinted(file));
        const styles = [...(shell.viteMetadata?.importedCss ?? [])].filter(
          (file) => !isAlreadyHinted(file),
        );
        if (scripts.length === 0 && styles.length === 0) return html;
        const asset = (fileName: string) => JSON.stringify(base + fileName);
        const inline = [
          '(function(){try{',
          `if(!window.matchMedia||!matchMedia(${JSON.stringify(DESKTOP_LAYOUT_MEDIA)}).matches)return;`,
          // crossorigin on both, because everything Vite emits carries it --
          // its own modulepreload links in this markup, and the stylesheet
          // link its runtime inserts for a dynamic chunk's CSS. A preload only
          // satisfies a later request when the CORS mode matches, so dropping
          // it on the stylesheet hint makes the file download twice. Measured:
          // two resource-timing entries for the dashboard CSS, one preload
          // that nothing used.
          'var add=function(rel,href,as){var l=document.createElement("link");',
          'l.rel=rel;l.href=href;if(as)l.as=as;l.crossOrigin="";document.head.appendChild(l);};',
          ...scripts.map((file) => `add("modulepreload",${asset(file)});`),
          ...styles.map((file) => `add("preload",${asset(file)},"style");`),
          '}catch(e){}})();',
        ].join('');
        return {
          html,
          tags: [{ tag: 'script', children: inline, injectTo: 'head' }],
        };
      },
    },
  };
}

export default defineConfig({
  base,
  plugins: [react(), tailwindcss(), versionMetadataPlugin(), preloadDesktopShellPlugin()],
  // These imports live behind the analysis worker, outside the initial HTML
  // scan. Discovering them on the first Analyze click rebuilt shared chunks
  // and reloaded the page, interrupting the game and the cold-cache browser QA.
  optimizeDeps: {
    include: ['@tensorflow/tfjs', '@tensorflow/tfjs-backend-webgpu', '@tensorflow/tfjs-backend-wasm'],
  },
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
    __APP_COMMIT__: JSON.stringify(appCommit),
    __APP_COMMIT_DATE__: JSON.stringify(appCommitDate),
  },
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
        notFound: path.resolve(__dirname, '404.html'),
      },
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (
            id.includes('/react/') ||
            id.includes('/react-dom/') ||
            id.includes('/scheduler/') ||
            id.includes('/use-sync-external-store/') ||
            id.includes('/zustand/')
          ) {
            return 'react-vendor';
          }
          if (id.includes('/react-icons/')) return 'icons';
          if (id.includes('/@tensorflow/')) return 'tfjs';
          if (id.includes('/jszip/')) return 'jszip';
          return 'vendor';
        },
      },
    },
  },
  test: {
    exclude: [...configDefaults.exclude, '**/.external/**'],
  },
  resolve: {
    alias: {
      'use-sync-external-store/shim/with-selector.js': path.resolve(
        __dirname,
        'src/shims/useSyncExternalStoreWithSelector.ts'
      ),
    },
  },
  server: {
    // Honor the PORT env var (e.g. when launched by preview tooling); fall back to Vite's default otherwise.
    port: process.env.PORT ? Number(process.env.PORT) : undefined,
    headers: {
      // Required for SharedArrayBuffer (enables threaded WASM backend when available).
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  preview: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
});
