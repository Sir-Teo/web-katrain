# Competitor Feature Analysis: Kifubara & Kaya

*Deep scan performed 2026-07-01 against [kifubara.app](https://kifubara.app) and
[kayago.app](https://kayago.app), including Kaya's open-source codebase
([github.com/kaya-go/kaya](https://github.com/kaya-go/kaya), AGPL-3.0) and a string-level
scan of Kaya's deployed production JS bundle. Kifubara is closed-source (solo developer,
freemium), so it was scanned via its public pages (/, /about, /faq, /games, /play,
/arena, /app, /katrain, and a live pro-game analysis page).*

## TL;DR

- **Kaya** is our closest analog: a free, open-source, client-side Go app (React 19 + TS,
  KataGo via ONNX Runtime, Tauri desktop). We already match or exceed most of it. The real
  gaps: **working i18n**, **pattern/joseki recognition**, **native desktop builds**, and a
  **trained-model board scanner with a calibration UI**.
- **Kifubara** is a server-backed service; its headline features (141K-game pro database,
  accounts + cloud sync, auto-sync from OGS/Fox/Pandanet/KGS, cloud KataGo, native scanner
  apps, multiplayer arena) fundamentally require a backend we deliberately don't have. But
  several ideas port cleanly to client-only: **auto-tagging games**, **persona bots**,
  **mistake-jump UX**, and **client-side OGS library sync by username**.

---

## Competitor snapshots

### Kaya (kayago.app) — open source, AGPL-3.0

Free, open-source Go app. React 19 + TypeScript 5 + Rsbuild, Bun monorepo (14 packages),
Tauri v2 (Rust) desktop apps for Windows/macOS/Linux, PWA web app. KataGo inference via
ONNX Runtime with selectable backends (Native GPU/CPU, PyTorch GPU on desktop; WebGPU,
WebNN, WASM in browser). Board recognition from photos via its own trained "Moku" model
(RT-DETR + classical CV). 9×9/13×13/19×19, visual game tree with minimap, SGF
import/export incl. OGS URL, library with folders + ZIP, six board themes, 8 fully
translated languages, customizable shortcuts, gamepad support, performance report,
problem mode, Monte Carlo score estimation, pattern matching with Sensei's Library links.

### Kifubara (kifubara.app) — closed source, freemium (Deep plan $9/mo)

Server-backed study platform by a solo developer. Pro game database (141K+ games, every
game pre-analyzed by KataGo), play vs 32 rank-calibrated persona bots (18k–6d), upload or
auto-sync your games from OGS/Fox/Pandanet/KGS for server-side review, "Cloud KataGo"
(WebSocket KataGo Analysis Engine protocol) usable from KaTrain/Sabaki, free native
iOS/Android board-scanner app (on-device, ~2s/scan), experimental "Hot Potato" collaborative
multiplayer arena, accounts with favorites/saved variations/library sync, shareable
analysis pages, printable PDFs.

---

## Features they have that we don't

### From Kaya (all client-side — directly actionable)

| # | Feature | Details | Effort/notes |
|---|---------|---------|--------------|
| 1 | **Real i18n** | Kaya ships full UI translations in EN/ZH/KO/JA/FR/DE/ES/IT (i18next; confirmed in the bundle: French/German/Spanish/Italian string tables). **We advertise the same 8 languages but our `locales.ts` only sets `<html lang>` — every UI string is hardcoded English.** | Our biggest truth-in-advertising gap. Add a message-lookup layer and extract strings. |
| 2 | **Pattern / joseki / shape recognition** | Recognizes named openings (Low/High Chinese, Sanrensei, Kobayashi, Orthodox…), approaches, enclosures, and shapes (Tiger's Mouth, Bamboo Joint, Empty Triangle, Table Shape…) as they appear on the board, each linked to its Sensei's Library page. Ships as a JSON pattern DB with anchor-point matching; toggleable. Kaya's single most-praised feature on the OGS forums. | Pure client-side; the matching algorithm is simple anchor/vertex comparison. High study value. |
| 3 | **Native desktop apps + auto-update** | Tauri v2 builds for Windows/macOS/Linux with an in-app updater ("Check for Updates…", skip version, remind later) and native ONNX/PyTorch GPU inference. | Strategic choice. Tauri wrap of our PWA is cheap; native inference is not. |
| 4 | **ONNX Runtime multi-backend inference** | Backend picker: Native GPU/CPU (desktop), WebGPU, **WebNN (Chrome ML API)**, WASM; auto-selects best per device; FP16/FP32 model guidance; batch-size setting; model quality tiers ("Full Quality / Balanced / Smallest download") + custom model upload. | We use TensorFlow.js (WebGPU→WASM→CPU) and support custom KataGo weights. WebNN and a user-facing backend/quality picker are the gaps. |
| 5 | **Trained-model board scanner + calibration UI** | Moku v3 (RT-DETR) detection with: draggable corner alignment, per-stone calibration ("click intersections to correct misdetections"), sensitivity slider, custom `.onnx` detection model upload, "show differences with current board", and import as new SGF **or** apply onto the current board / add as a move. | Our `photoBoardRecognition.ts` is classical-heuristic with no correction UI. The calibration UX alone would materially improve our scan accuracy. |
| 6 | **Markdown comments** | Node comments support markdown, Ctrl/Cmd+S save, comment text-size controls. | Small; our notes are plain text. |
| 7 | **Game-tree minimap & layout toggle** | Tree minimap, vertical/horizontal tree layout switch, "center on current position", click-to-set branch ID. | Small–medium polish on our `MoveTree`. |
| 8 | **Problem-mode spoiler guard** | In problem mode, opens at the starting position instead of the last move "so tsumego solutions stay hidden until you play them". | Tiny; our `problemMode.ts` should do the same if it doesn't. |
| 9 | **In-app About/version/update surface** | About dialog with build date/commit, "Report an Issue" GitHub link, in-app bug report. | Tiny. |

Parity notes (things Kaya has that we already match): library folders + ZIP import/export,
customizable keyboard shortcuts, gamepad support, sounds, PWA/offline, six board themes +
dark mode, ownership heatmap + top moves + win-rate/score graphs, full-game analysis with
per-phase performance report (accuracy, best-move %, key mistakes), Monte Carlo dead-stone
estimation, OGS URL import, drag-and-drop SGF, edit/setup mode with markers, auto-save.
We also read/write Kaya's `KA` SGF analysis blobs already (`kayaSgfAnalysis.ts`).

### From Kifubara (server-backed — feasible subsets flagged)

| # | Feature | Details | Client-only feasibility |
|---|---------|---------|------------------------|
| 1 | **Pro game database** | 141K+ pro games, every move pre-analyzed; filters by tags ("Perfect play", "Epic comeback", "Ko battle", "Rollercoaster", "Missed win", "Marathon"…), rank (9p/7p+/5p+), year range, time window; list/grid; "Surprise me" random game. We bundle 7 games. | Partial: bundle a larger curated corpus or fetch-on-demand from public SGF archives; analysis stays local. |
| 2 | **Accounts + cloud sync** | Sign in (email link / Google); favorites, saved variations, cross-device library sync. | Requires a backend. Our zip backup/restore is the local answer. |
| 3 | **Auto-sync from game servers** | Pulls your games automatically from **OGS, Fox, Pandanet (IGS), KGS**. We only import single OGS games by URL. | **OGS is feasible client-side**: the public REST API lists a player's games by username — a "sync my OGS games into the library" button needs no backend. Fox/KGS/IGS do. |
| 4 | **Cloud KataGo service** | Hosted KataGo Analysis Engine over WebSocket (`wss://…/ws/katago/<token>`), up to 2500 visits/position, marketed to KaTrain/Sabaki users ($9/mo Deep plan). | Flip side is feasible: a **"remote engine" option letting users point web-katrain at any KataGo Analysis-protocol WebSocket** (their own server, or Kifubara's) — strong-analysis escape hatch for weak devices. |
| 5 | **Native mobile scanner apps** | Free iOS/Android app: on-device recognition (~2s), works on physical boards & screens, KataGo territory count, SGF export, no account needed. | Our web photo/camera scan covers part of this; a better model (see Kaya #5) narrows the rest. |
| 6 | **Multiplayer "Hot Potato" arena** | Collaborative async games; KataGo grades each move (points lost), potato rewards, four tiers (Sprout→Canopy), leaderboard. | Requires a backend by nature. |
| 7 | **32 persona bots** | Named gemstone bots 18k–6d with personalities and style tags ("classical · safe · territorial"), handicap 0–9, "you play Black", save finished games to library. | Fully feasible: skin our 13 AI strategies + calibrated-rank ladder as named personas. Cheap, high perceived value. |
| 8 | **Auto-tagged games** | Games automatically labeled from analysis: "Epic comeback", "Rollercoaster", "Missed win", "Marathon", "Ko battle", "Perfect play"… | Fully feasible client-side from our existing full-game analysis (win-rate swings, point-loss profile, game length, ko detection). Great for the library. |
| 9 | **Analysis-page niceties** | Mistake list grouped by player (B/W/All) with move#/coord/loss; **⇧←/→ jump-between-mistakes shortcut**; candidate-count toggle (5/10/15/All); "cyan halo" standout moves; dead-group red overlay; per-phase accuracy chips; **printable PDF** of the analyzed game; server-side shareable link. | Mostly feasible: we have mistake navigation & phase accuracy in the report modal — surfacing them as board-level shortcuts/toggles + a print-friendly full-report page would close this. Server share links need a backend (our URL-fragment share caps ~8 KB). |
| 10 | **Mid-game quizzes/lessons** | Score-estimate quizzes and lessons appear *during* bot games. | Feasible: we have `ScoreQuizModal` and lessons — wire them into play-vs-AI as optional interruptions. |

---

## Features we have that neither competitor has

For perspective — we are ahead in several areas: KaTrain-style teach mode with undo
prompts, 13 AI play strategies, region-of-interest analysis, extra/equalize/sweep/
alternative analysis commands, guess-the-pro-move quiz, video→SGF (beta), command
palette, board rotate/flip, byo-yomi clocks, share-by-URL, haptics, KaTrain `KT` **and**
Kaya `KA` SGF analysis interop, and a fully in-browser TS/TFJS KataGo engine (no install,
no server, private by construction).

## Suggested priorities

Items marked ✅ were implemented on this branch after a full source scan of the Kaya
repository (mirrored file-by-file; its `boardmatcher` turned out to be adapted from the
MIT-licensed `@sabaki/boardmatcher`, which is what we ported — Kaya itself is AGPL and
was used for behavioral reference only).

1. ✅ **Pattern/joseki/shape recognition with Sensei's Library links** (Kaya #2) — shipped:
   ten named fuseki openings, the 3-3 invasion, and thirteen classic shapes now surface
   through the move-insight status bar (`src/utils/boardPatterns.ts`,
   `src/data/boardPatternLibrary.ts`).
2. ✅ **OGS library sync by username** (Kifubara #3, client-side subset) — shipped: library
   toolbar → cloud button syncs recent finished games into an "OGS - username" folder with
   dedup by game id (`src/utils/ogsSync.ts`, `src/components/OgsSyncModal.tsx`).
3. ✅ **Auto-tagging analyzed games** (Kifubara #8) — shipped: Epic comeback / Missed win /
   Rollercoaster / Close game / Marathon / Perfect play chips in the game report header
   (`src/utils/gameTags.ts`).
4. ✅ **Markdown notes & problem spoiler guard** (Kaya #6/#8) — verified already at parity:
   `notePreview.ts` renders markdown notes, and `loadSgfRewind` (default on) opens SGFs at
   the start position with problem-collection detection.
5. **Real i18n** (Kaya #1) — still the biggest gap; we advertise 8 languages but only the
   language picker is localized. Kaya's reference: flat i18next namespace, ~680 keys,
   en.json first, 8 locale files kept in parity.
6. **Board-scan calibration UI** (Kaya #5) — corner drag + click-to-correct; consider an
   ONNX detection model later (Kaya's Moku is RT-DETR at 640×640 with corner classes).
7. **Persona bots + mid-game score quizzes** (Kifubara #7/#10) — packaging, not new tech.
8. **Remote-engine (KataGo WebSocket) option** (Kifubara #4) — strong analysis on weak devices.
9. Longer-term/strategic: Tauri desktop builds with auto-update; larger pro-game corpus;
   tree minimap (Kaya: reactflow + worker layout, main line straight, variations offset
   per depth).
