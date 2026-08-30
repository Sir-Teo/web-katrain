import path from 'node:path';
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import { configDefaults, defineConfig } from 'vitest/config';
import type { Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { createVersionMetadata } from './src/utils/versionMetadata';

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

export default defineConfig({
  base,
  plugins: [react(), tailwindcss(), versionMetadataPlugin()],
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
