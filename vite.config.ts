import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// https://vite.dev/config/
const repoName = process.env.GITHUB_REPOSITORY?.split('/')[1];
const inferredBase = repoName && !repoName.endsWith('.github.io') ? `/${repoName}/` : '/';
const rawBase = process.env.VITE_BASE_URL ?? process.env.BASE_URL ?? inferredBase;
const normalizedBase = rawBase.startsWith('/') ? rawBase : `/${rawBase}`;
const base = normalizedBase.endsWith('/') ? normalizedBase : `${normalizedBase}/`;

export default defineConfig({
  base,
  plugins: [react(), tailwindcss()],
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
          return 'vendor';
        },
      },
    },
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
