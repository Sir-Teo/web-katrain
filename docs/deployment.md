# Deployment

Web KaTrain is a static Vite app. A production build emits `dist/`, which can be
served by GitHub Pages or any static host that can serve JavaScript, WASM,
compressed model files, and the service worker.

## Build

```sh
npm ci
npm run build
```

The build runs:

- TypeScript project build.
- Vite production build.
- Version metadata generation at `dist/version.json`.
- Copy/download prebuild hooks for TensorFlow.js WASM files and the small model.

Preview the result:

```sh
npm run preview
```

## Base Path

`vite.config.ts` computes the Vite base path in this order:

1. `VITE_BASE_URL`
2. `BASE_URL`
3. The GitHub repository name from `GITHUB_REPOSITORY`
4. `/`

The value is normalized to start and end with `/`. For a repository named
`web-katrain`, GitHub Pages builds use `/web-katrain/`.

Use an explicit base path when deploying somewhere unusual:

```sh
VITE_BASE_URL=/my/path/ npm run build
```

## GitHub Pages

The repository includes `.github/workflows/deploy-pages.yml`. On pushes to
`main` or manual dispatch, it:

1. Checks out the repository with LFS enabled.
2. Sets up Node 24 with npm caching.
3. Runs `npm ci`.
4. Runs `npm run audit`, `npm run lint`, `npm test`, and
   `npm run test:typecheck`. A failure in any of them stops the deploy.
5. Runs `npm run build`.
6. Uploads `dist/` as a Pages artifact.
7. Deploys through `actions/deploy-pages`.

The gates in step 4 are the same checks `npm run` offers locally, in the same
order web-chess uses, so a green local run means a green deploy. Note that
gating on `npm run audit` means a new advisory in a dependency can block a
release without any app code changing — if that happens, it is a real signal,
but it is not a build failure.

The current live URL is:

https://sir-teo.github.io/web-katrain/

## Headers

For best WASM performance, serve these headers:

```text
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

They enable `SharedArrayBuffer`, which TensorFlow.js WASM uses for threaded
execution.

The Vite dev and preview servers set the headers. The production build ships
`public/_headers`:

```text
/*
  Cross-Origin-Opener-Policy: same-origin
  Cross-Origin-Embedder-Policy: require-corp
```

Hosts such as Netlify and Cloudflare Pages can honor that file. GitHub Pages
does not support custom response headers, so WASM runs single-threaded there.
The app still works, and WebGPU is unaffected by this limitation.

## Service Worker and Offline Cache

The production app registers `sw.js` after page load. Development builds do not
register the service worker.

The service worker precaches:

- The app shell.
- The manifest and the PWA icons. Not the manifest screenshots: they are 504 kB
  shown by the browser, the OS or a crawler, never by the running app.
- The small default model.
- One TensorFlow.js WASM build, `tfjs-backend-wasm-simd.wasm`. TFJS chooses one
  of the three at runtime, and the other two cannot be chosen here: the threaded
  build needs cross-origin isolation, which GitHub Pages cannot provide, and the
  non-SIMD build is for browsers older than this app supports.
- The board and stone SVGs for the default Hikaru theme, plus the common board
  overlays. These are precached because the first image requests can precede
  service-worker control. The other themes are
  cached the first time they are used.

Navigation requests fall back to the cached app shell when offline. Board,
model, and other static media assets are cache-first. Other same-origin GET
requests use the network with a cached fallback; the runtime cache retains up
to 64 entries.

The page also reports loaded build assets, including imports that finish after
the service worker takes control. The shell retains up to 100 recent script
and style entries, protecting the current report and index assets. A startup
report is partial: unreported dialogs remain cached instead of being removed
before an offline page can request them. `npm run test:offline` analyzes once
online, then checks a cold offline reload, opens Frame as Tsumego and Paste
SGF, and requires fresh WASM analysis for a newly played move. HTTP caches are
disabled and the server refuses responses after cutoff. The final negative
control deletes app caches and requires navigation to fail. This verifies the
bundled model after online use in the deployed configuration without COOP/COEP.

## Updates

The build emits `version.json` with package version, git hash, commit date, and
build date. Production clients poll that file periodically and on window focus.
When a new git hash is detected, the app can show an update-ready banner.

The service worker also listens for `SKIP_WAITING`, allowing the UI to activate
a waiting worker and reload.

## Static Host Checklist

- Serve `index.html`, `404.html`, `manifest.webmanifest`, `sw.js`, model files,
  WASM files, and generated JS/CSS from the same origin.
- Preserve `.gz` model files as files; do not decompress or block them.
- Use the correct Vite base path for subdirectory deployments.
- Add COOP/COEP headers when the host supports them.
- Make sure `404.html` is deployed for SPA fallback on hosts that need it.
