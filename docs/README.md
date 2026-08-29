# Web KaTrain Docs

This directory documents the browser app, the in-browser KataGo engine, and the
developer workflow.

## Start Here

- [Architecture](architecture.md): how React, Zustand, the move tree, storage,
  and the engine worker fit together.
- [Engine](engine.md): model loading, TensorFlow.js backends, feature
  extraction, search, analysis modes, and AI play strategies.
- [Development](development.md): setup, scripts, project layout, model assets,
  testing, and troubleshooting.
- [Deployment](deployment.md): static hosting, GitHub Pages, base paths,
  COOP/COEP headers, service worker caching, and update behavior.
- [Runtime diagrams](diagram.md): compact diagrams for the main app flow,
  analysis flow, and persistent storage.
- [Competitor analysis](competitor-analysis.md): what Kaya and Kifubara do,
  and which of it ports to a client-only app.
- [Parity](parity.md): the feature matrix for the three sibling apps, what this
  one is the reference for, and what it is still missing. Update it when a
  feature lands.

## Sibling Apps

This app has two siblings built on the same shape — an engine in a worker, a
move tree, a review pass, a saved-game library — for chess and xiangqi:

- [web-chess](https://github.com/Sir-Teo/web-chess) ·
  [architecture](https://github.com/Sir-Teo/web-chess/blob/main/docs/architecture.md)
- [web-xiangqi](https://github.com/Sir-Teo/web-xiangqi) ·
  [architecture](https://github.com/Sir-Teo/web-xiangqi/blob/main/docs/architecture.md)

The three are compared, and the work of moving good ideas between them tracked,
in [web-chess's cross-app learning plan](https://github.com/Sir-Teo/web-chess/blob/main/docs/cross-app-learning-plan.md).
This app is generally the reference of the three; where it is not, that plan
says so.

## Source Map

| Area | Main files |
| --- | --- |
| App shell | `src/App.tsx`, `src/main.tsx`, `src/components/Layout.tsx` |
| Global state | `src/store/gameStore.ts`, `src/types.ts` |
| Engine client and worker | `src/engine/katago/client.ts`, `src/engine/katago/worker.ts` |
| MCTS and board engine | `src/engine/katago/analyzeMcts.ts`, `src/engine/katago/fastBoard.ts` |
| Model parsing and inference | `src/engine/katago/loadModelV8.ts`, `src/engine/katago/modelV8.ts` |
| SGF, library, persistence | `src/utils/sgf.ts`, `src/utils/library.ts`, `src/utils/autoSave.ts` |
| PWA and deployment helpers | `src/utils/pwa.ts`, `public/sw.js`, `vite.config.ts` |
