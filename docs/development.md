# Development

## Requirements

- Node.js 24 or newer.
- npm.
- Chrome if you want to run the viewport smoke test.

Install dependencies once:

```sh
npm install
```

Start the app:

```sh
npm run dev
```

The Vite dev server sends the COOP/COEP headers required for threaded WASM.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start Vite. Runs `copy:tfjs-wasm` and `fetch:model` first. |
| `npm run verify` | **The one to run before pushing.** typecheck → test:typecheck → lint → test → build, with npm's `&&` so the first failure stops it. Mirrors CI, minus `npm audit` so it works offline. |
| `npm test` | Run all Vitest tests. Note this typechecks nothing — Vitest transpiles without checking, so a test can pass while failing to compile. With `CI` set, the 71 tests that run a real MCTS search are skipped: seconds locally, minutes on a shared runner. `ENGINE_TESTS=1 npm test` runs them regardless. |
| `npm run test:typecheck` | Type-check the test project. |
| `npm run test:viewport` | Build, serve, and smoke-test key desktop/mobile viewports in Chrome. **~54s**, drives a real browser. Not in `verify` or CI — reach for it after a layout, breakpoint or board-sizing change, where it is the only thing that would catch a regression. |
| `npm run lint` | Run ESLint. |
| `npm run build` | Run `tsc -b` and build Vite output into `dist/`. |
| `npm run preview` | Serve `dist/` locally with preview headers. |
| `npm run fetch:model` | Ensure `public/models/katago-small.bin.gz` exists. |
| `npm run copy:tfjs-wasm` | Copy TensorFlow.js WASM binaries into `public/tfjs/`. |
| `npm run audit` | Run `npm audit --audit-level=moderate`. |

## Project Layout

| Path | Contents |
| --- | --- |
| `src/components/` | React UI, modals, dashboard, board, panels, and layout controls. |
| `src/store/gameStore.ts` | Global game state and actions. |
| `src/engine/katago/` | Browser KataGo parser, TensorFlow.js model, worker, search, and board logic. |
| `src/utils/` | SGF, storage, library, analysis helpers, PWA, shortcuts, board themes, and UI utilities. |
| `src/data/` | Bundled SGF games. |
| `public/` | Static assets, PWA files, board themes, model files, and service worker. |
| `scripts/` | Model/WASM setup and viewport checks. |
| `test/` | Vitest unit and component tests. |
| `docs/` | Project documentation. |

## Model Assets

Normal dev and build commands keep two generated asset groups ready:

- `public/models/katago-small.bin.gz`: a small KataGo test model.
- `public/tfjs/*.wasm`: copied from `@tensorflow/tfjs-backend-wasm`.

These files are runtime assets, not application source. If they are missing,
rerun `npm run fetch:model` or `npm run copy:tfjs-wasm`.

To test with the stronger b18 browser model:

```sh
FETCH_KATRAIN_MODEL=1 npm run fetch:model
```

That command prefers a sibling `../katrain-ref/` checkout and falls back to
downloading from KataGo training media.

## Testing

Use focused tests while developing, then run the broader checks before handing
off larger changes:

```sh
npm test
npm run test:typecheck
npm run lint
npm run build
```

The viewport test launches Chrome through the DevTools protocol. On macOS it
defaults to `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`.
Override with:

```sh
CHROME_PATH=/path/to/chrome npm run test:viewport
```

Screenshots go to `/tmp/web-katrain-viewport-check` unless
`VIEWPORT_SCREENSHOT_DIR` is set.

## Local Storage During Development

Browser state can affect manual testing. Useful storage locations:

- Settings: versioned `web-katrain:settings:*` localStorage keys.
- Library: IndexedDB `web-katrain-library`, with a localStorage fallback.
- Uploaded model: IndexedDB `web-katrain-models`.
- Auto-save: web-katrain localStorage keys managed by `src/utils/autoSave.ts`.

Use the app UI when possible to clear analysis cache or uploaded model state.
For stubborn manual-test state, clear site data in browser devtools.

## Common Troubleshooting

**Model fetch fails**

Run `npm run fetch:model`, then restart Vite. If testing a custom URL, make sure
the server allows browser fetches from the app origin.

**WebGPU is unavailable**

The worker should fall back to WASM or CPU. You can also pin the backend in
Settings.

**Threaded WASM is unavailable**

Check that the page is served with COOP/COEP headers. Vite dev and preview are
already configured.

**Production app looks stale**

The production service worker caches aggressively for offline use. Use the
in-app update prompt when it appears, or clear site data during development.
