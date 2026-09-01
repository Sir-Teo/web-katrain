# Web KaTrain

Web KaTrain is a browser-based Go study app inspired by
[KaTrain](https://github.com/sanderland/katrain). It runs KataGo-style neural
network evaluation locally in the browser with TensorFlow.js, keeps the search
work off the main thread in a Web Worker, and can be installed as an offline
PWA. There is no analysis server to run.

**Live app:** https://sir-teo.github.io/web-katrain/

## Highlights

**Analyze games**

- Top-move hints, principal variations, ownership, policy, win rate, and score
  lead.
- Quick, fast, and full-game analysis passes with per-position caching.
- KaTrain-style move quality, phase summaries, and game reports.
- "Play elsewhere?" prices the point: the engine evaluates the position again
  after a pass, so you can see what the move here is worth and where the
  opponent would go if you ignored it.
- Time graph from the clock recorded in the SGF (`BL`/`WL`/`OB`/`OW`), for games
  imported from OGS, KGS, Fox or Tygem.
- Drill your mistakes: the board goes back to the position before each one with
  the answer hidden -- hints, policy, best-move readout and all -- and grades
  the move you play against what the engine wanted. From the game report, the
  command palette, or Study & Practice.

**Study and play**

- Play against browser KataGo with KaTrain-style AI strategies: `default`,
  `rank`, `scoreloss`, `policy`, `weighted`, `pick`, `local`, `tenuki`,
  `territory`, `influence`, `jigo`, `simple`, and `settle`.
- Teach mode, byo-yomi clocks, resign/pass handling, manual scoring, and 9x9,
  13x13, or 19x19 boards.
- Branching move trees with notes, setup stones, markup, and SGF-compatible
  export.
- Study tools: interactive fundamentals lessons, a score-estimation quiz, a
  "climb the ranks" tournament ladder against calibrated bots, and a
  searchable pro game library. Open any of them from the menu's Study &
  Practice section or the command palette.

**Load and save**

- Import SGF files by picker, paste, drag and drop, or Online-Go game URL.
- Import board positions from a photo or live camera capture.
- Store games in an IndexedDB library with folders, bundled famous games, and
  zip backup/restore.
- Auto-save the current session and recover after a crash or reload.

**Use it anywhere**

- Responsive desktop and mobile layouts.
- Board themes, UI themes, keyboard shortcuts, command palette, gamepad
  navigation, sound, and haptics.
- Document language metadata for 13 languages, which tags the page and the SGF
  you export. The interface itself is English only.
- Offline app shell, default model, TensorFlow.js WASM files, and board assets
  are cached by the production service worker.

## Quick Start

Use Node.js 24 or newer for the closest match to CI.

```sh
npm install
npm run dev
```

The first dev or production build may take a moment. The `predev` and
`prebuild` hooks copy TensorFlow.js WASM files into `public/tfjs/` and ensure
the small KataGo test model exists at `public/models/katago-small.bin.gz`.

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the Vite dev server with COOP/COEP headers. |
| `npm run verify` | **Run before pushing.** typecheck → test:typecheck → lint → tests → build, chained so the first failure stops it. Mirrors CI, minus `npm audit` so it works offline. |
| `npm test` | Run the Vitest suite. Typechecks nothing on its own — Vitest transpiles without checking, so a test can pass while failing to compile. |
| `npm run test:typecheck` | Type-check the tests. Needed separately: `tsc -b` builds the app and node projects, and neither includes `test/`. |
| `npm run test:viewport` | Chrome viewport smoke test. ~54s, drives a real browser; not in `verify` or CI. Run it after a layout, breakpoint or board-sizing change. |
| `npm run bench` | Time the MCTS search. `BENCH_OUT=f.json` records a run, `BENCH_BASELINE=f.json` prints the delta against it. Needs a model. |
| `npm run lint` | Run ESLint. |
| `npm run build` | Type-check and build the production app. |
| `npm run preview` | Serve the production build locally with preview headers. |

## Models and Performance

The bundled model is a tiny KataGo test network, about 3.6 MB compressed, so the
app can boot quickly on ordinary laptops and phones. It is useful for smoke
testing and casual UI work, not strong analysis.

For real analysis, Settings offers the recommended browser-practical b18
network:

`kata1-b18c384nbt-s9996604416-d4316597426.bin.gz` (~96 MB)

You can also enter a KataGo model URL or upload `.bin`, `.gz`, or `.bin.gz`
weights for the session. The parser supports KataGo model versions 8 through
16. Uploaded browser models are capped at 128 MB.

The engine prefers TensorFlow.js WebGPU, then falls back to WASM, then CPU.
Threaded WASM needs `SharedArrayBuffer`, which browsers only expose when the
page is cross-origin isolated:

```text
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

Vite dev and preview send these headers. The production build includes
`public/_headers` for hosts that honor it. GitHub Pages still works without
custom headers, but WASM runs single-threaded there; WebGPU is unaffected.

## Documentation

- [Documentation index](docs/README.md)
- [Architecture](docs/architecture.md)
- [Engine](docs/engine.md)
- [Development](docs/development.md)
- [Deployment](docs/deployment.md)
- [Runtime diagrams](docs/diagram.md)

## Related Apps

Two sibling apps share this one's shape — an engine in a worker, a move tree, a
review pass, a saved-game library — for chess and xiangqi:

- [web-chess](https://github.com/Sir-Teo/web-chess) — chess, Stockfish in the browser
- [web-xiangqi](https://github.com/Sir-Teo/web-xiangqi) — xiangqi, Pikafish compiled to WASM

[`docs/parity.md`](docs/parity.md) is the feature matrix for the three, kept
current as things land here.

[web-chess's cross-app learning plan](https://github.com/Sir-Teo/web-chess/blob/main/docs/cross-app-learning-plan.md)
compares the three and tracks what is worth moving between them. This app is
generally the reference of the three; where it is not, that plan says so.

## License

[MIT](LICENSE)
