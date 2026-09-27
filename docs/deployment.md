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

The repository includes `.github/workflows/deploy-pages.yml`. It publishes only
a commit that CI (`.github/workflows/ci.yml`) has passed, browser suites
included:

1. A push to `main` runs CI: audit, `npm run verify`, the engine smoke tests,
   and the viewport and interaction checks.
2. A successful CI run from that push starts the deploy for the same commit
   (`head_sha`). A run for a commit `main` has already moved past is skipped;
   the newer commit's own CI run deploys it.
3. A manual dispatch looks up CI's result for the commit it would publish and
   stops if there is no passing run.
4. The deploy checks the commit out with LFS enabled, runs `npm ci` and
   `npm run build`, uploads `dist/` as a Pages artifact, and deploys through
   `actions/deploy-pages`.

The build is repeated in the deploy only because its checkout carries the LFS
model and CI's does not; every other gate already ran in CI on that commit.
Gating on `npm run audit` means a new advisory in a dependency can block a
release without any app code changing — if that happens, it is a real signal,
but it is not a build failure.

The suites that drive a real engine search are skipped in CI apart from the
smoke subset; `.github/workflows/engine-tests.yml` runs all of them weekly and
on demand (`npm run test:engine` locally).

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
- The board and stone images the *default* theme draws. The other themes are
  cached the first time they are used.

Everything left out stays cache-first at runtime, so anything actually used is
kept offline after the first time it loads.

Navigation requests fall back to the cached app shell when offline. Static
assets are cache-first. Other same-origin GET requests are cached at runtime.

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
