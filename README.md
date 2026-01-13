# web-katrain

Browser-based KaTrain-style UI with in-browser KataGo analysis using TensorFlow.js (WebGPU with WASM/CPU fallback).

## How it works

- React + Zustand manage game state, settings, and the move tree.
- A Web Worker runs KataGo-style evaluation/search on the current position.
- Weights load from `public/models/` or a URL/upload set in Settings.
- Analysis results feed the UI (policy, ownership, winrate/score graphs).

For detailed architecture diagrams and flow explanations, see [docs/diagram.md](docs/diagram.md).

## Development

- Install: `npm install`
- Run: `npm run dev`
- Test: `npm test`
- Lint: `npm run lint`
- Build: `npm run build` then `npm run preview`

## Models

Models live in `public/models/`. Settings lets you swap URLs or upload weights for the session.
Optional parity assets can be pulled from sibling checkouts:

- `../katrain-ref/` – KaTrain reference (Python/Kivy)
- `../KataGo/` – KataGo reference (C++)

Scripts like `scripts/fetch-katago-small-model.mjs` will copy KaTrain’s default model from `../katrain-ref/katrain/models/` when present.

## Performance

For threaded WASM (XNNPACK), serve with COOP/COEP headers to enable `SharedArrayBuffer`:
`Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`.
Vite dev/preview already sends these headers.
