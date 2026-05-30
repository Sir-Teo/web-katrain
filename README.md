# web-katrain

Browser-based KaTrain-style UI with in-browser KataGo analysis using TensorFlow.js (WebGPU by default, with WASM/CPU fallback and selectable in settings).

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

The default model is the recommended strong browser weight `kata1-b18c384nbt-s9996604416-d4316597426.bin.gz`
(about 96 MB). It is much stronger than the bundled tiny test model while avoiding the 259 MB b28 and 824 MB b40
networks that are less practical on mobile and many laptops.

Models can also live in `public/models/`. Settings lets you swap URLs or upload weights for the session.
Optional parity assets can be pulled from sibling checkouts:

- `../katrain-ref/` – KaTrain reference (Python/Kivy)
- `../KataGo/` – KataGo reference (C++)

`scripts/fetch-katago-small-model.mjs` keeps the small test model available for local builds.
Set `FETCH_KATRAIN_MODEL=1` if you also want to copy/download KaTrain’s heavier default model into `public/models/` for local testing.

## Performance

WebGPU is the preferred analysis backend. When WebGPU is active with random symmetry enabled, root analysis samples all 8 neural symmetries for a stronger, steadier root policy; WASM and CPU remain fallbacks.

For threaded WASM (XNNPACK), serve with COOP/COEP headers to enable `SharedArrayBuffer`:
`Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`.
Vite dev/preview already sends these headers.
The production build includes a `public/_headers` file for static hosts that honor it (Netlify/Cloudflare Pages); other hosts should set equivalent headers.
