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
| `npm run verify` | **The one to run before pushing.** typecheck → test:typecheck → lint → test → build, with npm's `&&` so the first failure stops it. Runs the code checks used in CI; `npm audit` and the browser viewport suite run separately. |
| `npm test` | Run all Vitest tests. Note this typechecks nothing — Vitest transpiles without checking, so a test can pass while failing to compile. With `CI` set, the 71 tests that run a real MCTS search are skipped: seconds locally, minutes on a shared runner. `ENGINE_TESTS=1 npm test` runs them regardless. |
| `npm run typecheck` | Type-check the app and node projects. It runs `tsc -b`, and it has to: the root `tsconfig.json` has `"files": []` and only references the two project configs, so a bare `tsc --noEmit` here type-checks nothing at all and exits 0. |
| `npm run test:typecheck` | Type-check the test project. |
| `npm run test:viewport` | Check 11 desktop/mobile sizes and study workflows in Chrome with a fresh Vite cache and browser profile. Runs in CI and separately from `verify`; about 3 minutes locally. |
| `npm run test:responsiveness` | Measure how fast the app answers a click: first board move, board-move median, warm dialog open, INP p98, worst long task. **~15s**. Needs a current `npm run build` — it measures `dist/` through `vite preview` and refuses to fall back to dev, where React's instrumentation changes the numbers by an order of magnitude. Not in `verify` or CI. |
| `npm run bench` | Time the MCTS search. `BENCH_OUT=f.json` records a run, `BENCH_BASELINE=f.json` prints the delta against it. Needs a model. |
| `npm run test:study` | Reproduce the large-study regressions in Chrome: five marker edits on a 2,001-node game, then export and reparse 12,000 study comments. Uses a temporary browser profile and the dev store; reports operation timings, not production INP. Not in `verify` or CI. |
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

Browser checks cover rendered layout, real interactions, and study operations.
The viewport suite runs in CI; responsiveness and study benchmarks run locally.
All three run separately from `verify`:

```sh
npm run test:viewport         # layout, breakpoints, board sizing, contrast
npm run build                 # test:responsiveness measures dist/, not dev
npm run test:responsiveness   # click-to-response budgets
npm run test:study            # deep branch correctness and operation timings
```

Reach for `test:viewport` after a layout, breakpoint or board-sizing change, and
for `test:responsiveness` after anything that runs during a click or an open —
a new `lazy()` dialog, work moved into an event handler, a heavier render. Both
regressions its budgets guard were real: dialogs that took ~317ms to open
whatever their size, and a first stone that cost 85-100ms because
`new AudioContext()` was built inside the click.

Both launch Chrome through the DevTools protocol. On macOS they default to
`/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`. Override with
`CHROME_PATH` (or `CHROME_BIN`):

```sh
CHROME_PATH=/path/to/chrome npm run test:viewport
```

Viewport screenshots go to `/tmp/web-katrain-viewport-check` unless
`VIEWPORT_SCREENSHOT_DIR` is set. CI uploads them on viewport failure. Each
viewport run prepares its own cold dependency cache under `node_modules`, so
first-use analysis must work without a development-server reload. Navigation
waits for the requested document; interrupted interaction expressions fail
instead of being silently replayed.

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
