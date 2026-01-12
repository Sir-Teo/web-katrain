# web-katrain

Browser-based KaTrain clone (UI + workflows) with in-browser KataGo-style analysis (TensorFlow.js WebGPU/WASM fallback).

## Upstream references (side-by-side)

This project expects sibling checkouts for parity work and assets:

- `../katrain-ref/` – KaTrain reference codebase (Python/Kivy).
- `../KataGo/` – KataGo reference codebase (C++).

Scripts like `scripts/fetch-katago-small-model.mjs` will copy KaTrain’s default model from `../katrain-ref/katrain/models/` when available.

## Development

- Install: `npm install`
- Run: `npm run dev`
- Test: `npm test`
- Lint: `npm run lint`
- Build: `npm run build` then `npm run preview`

## Models

Models live under `public/models/`. The default model URL is configurable in-app via Settings.

## Performance

- For fastest WASM fallback (threaded XNNPACK), serve with COOP/COEP headers to enable `SharedArrayBuffer`:
  - `Cross-Origin-Opener-Policy: same-origin`
  - `Cross-Origin-Embedder-Policy: require-corp`
  Vite dev/preview are configured to send these headers by default.
