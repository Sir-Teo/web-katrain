# Parity with the sibling apps

web-katrain is one of three apps built to the same shape — an engine in a worker, a
move tree, an eval graph, a review pass with accuracy, a saved-game library, a
GitHub Pages deploy — for a different game each:

- [web-katrain](https://github.com/Sir-Teo/web-katrain) — Go, KataGo in the browser
- [web-chess](https://github.com/Sir-Teo/web-chess) — chess, Stockfish in the browser
- [web-xiangqi](https://github.com/Sir-Teo/web-xiangqi) — xiangqi, Pikafish compiled to WASM

**Update the table below when a feature lands here.** That is the whole point of
the file. The three drift at the speed they are worked on, and nothing else in
these repos notices: the plan that proposed this file spent a night finding
things that were only visible by comparison — a deploy that ran no checks, a
search box none of the three bounded, a lesson learned in one file and left
unfixed in the file beside it. A table that is kept current turns those into
something a reader spots in a minute.

The deeper comparison, and what is worth moving next, lives in web-chess's
[`docs/cross-app-learning-plan.md`](https://github.com/Sir-Teo/web-chess/blob/main/docs/cross-app-learning-plan.md)
and [`docs/cross-app-second-pass.md`](https://github.com/Sir-Teo/web-chess/blob/main/docs/cross-app-second-pass.md).

## Where the three stand

Measured 2026-08-29.

| | web-katrain | web-chess | web-xiangqi |
| --- | --- | --- | --- |
| Domain | Go (KataGo) | Chess (Stockfish) | Xiangqi (Pikafish) |
| `src` files | 233 | 118 | 71 |
| Test cases | 1,417 | 410 | 338 |
| App state | Zustand store | `useState` in `App.tsx` | `useState` in `App.tsx` |
| Deploy runs the checks | yes | yes | yes |
| `npm run verify` | yes | yes | yes + engine smoke/parity |
| Hostile-input parser sweep | yes | yes | yes |
| Bounded search query | yes | yes | yes |
| Namespaced, versioned storage keys | yes | yes | yes |
| One device-tier sizing policy | threads only | capabilities + hash | full tier + live/review policy |
| Saved-game library | IndexedDB, folders, zip | IndexedDB, JSON backup | localStorage, flat |
| Auto-save + crash recovery | yes | yes | yes |
| Error boundary | component + lazy-modal | inline + lazy-dialog | component + lazy-panel |
| Command palette | yes | no | no |
| Board / UI themes | yes | no | no |
| Sound | yes | no | partial |
| Haptics | yes | no | no |
| Analysis queue with position cache | yes | no | no |
| Real service worker | yes (+ install banner) | yes — COI and offline in one worker | unregisters legacy SWs |
| Position / FEN editor | no | yes | no |
| Cloud eval, opening explorer, tablebase | no | yes | no |
| Browser (Playwright) tests | one viewport script | boot, review, layout at two sizes | layout + parity + review |
| Engine built from source | no | no | yes (emsdk) |

## What this repo is the reference for

**Product surface and app architecture.** Game state lives in a Zustand store
rather than in `App.tsx` — `App.tsx` here is 13 lines — and 22 test files drive
that store directly, which is why this repo can test app behaviour at all. Both
siblings hold their state in a ~5,000-line component and have no test that
drives it.

**The features neither sibling has yet:** command palette and shortcut
registry, board and UI themes, sound, haptics, a real service worker with an
install banner and update checks, the analysis queue with per-position caching,
study modes, and a full documentation set.

**A parser that scans instead of backtracking.** Both siblings shipped a
quadratic `\{[^}]*\}` comment scan; this repo's SGF reader is a hand-written
character scanner and was flat where they were quadratic. `importFuzz.test.ts`
now pins that rather than assuming it.

## What this repo is still missing

A position editor and the cloud-eval stack web-chess has (there is no Go
equivalent of the Lichess endpoints, so this may stay missing on purpose).
Device tiering here covers threads only — web-xiangqi's `analysisProfile` also
resolves a live-analysis budget and a review budget from the same profile.
