# Ongoing repository audit

Started 2026-09-12 at `d868c00`. Work is on `codex/repo-audit-improvements`.
This is an ongoing audit, not a claim that every line or every workflow has
been validated. The starting `src/` tree contained about 84,500 lines. Keep
reproduced failures separate from candidates that still need investigation.

## Changes completed

| Commit / area | Problem and resulting behavior | Evidence |
| --- | --- | --- |
| `e98c9d5` | Undoing a marker could erase existing freehand strokes. Clearing drawings advertised Undo without recording history. Drawing creation, clearing, unrelated edits, and branch copies now preserve independent drawings. | Browser reproduction lost the only stroke before the fix. Real pointer drawing → Undo → Redo → Clear → Undo passed at 1440×900 and 390×844. Five regression tests. |
| `20d8832` | Every edit copied every node's complete move history. Snapshots now share immutable positions and copy mutable annotations and tree links iteratively. Collapsed branches also survive undo. | Marker-edit median on a synthetic 2,001-node line: 38.41 ms → 0.40 ms in Chrome. Deep-tree, setup/replay immutability, and collapsed-branch regressions pass. |
| `51bb3f5` | The default test network was presented as ordinary ready KataGo, without strength guidance in the review workflow. Review and engine details now identify it and link directly to the model setting. | Desktop, short desktop, and phone pointer checks verified the notice, visible focused model field, and removal after selecting stronger weights. The engine popover now scrolls within a 500 px-high viewport. |
| `ed18b51` | SGF export recursed once per node even though long sequences can be imported. Saving a 12,000-comment study threw `RangeError`. Export now uses explicit stacks and joins output once. | Chrome reproduction changed from stack overflow to successful export. A real pointer click on Save SGF downloaded all 12,000 comments (169,034 bytes). Round-trip tests preserve all comments, sibling order, and omission of empty branches. |
| `dbcdb55` | Undo could restore the previous model's cached evaluations. Undoing a rules change restored SGF `RU` but left the engine and legality rules unchanged. History now records analysis validity and rules. | Browser reproduction formerly restored a score of +12 from the old model; it now restores no stale analysis. Rule undo now restores Japanese in both settings and SGF. Four failing regressions turned green, including deep-tree analysis invalidation. |
| Library ZIP exports | Different folders with the same name merged on re-import. Slashes in names changed hierarchy, and reserved names could make games disappear. Exports now allocate distinct paths by folder ID, reserve directories before files, and traverse selected descendants using a parent index. | Five failing archive regressions turned green. Chrome preserved two same-named folders through export/import. Selecting 10,000 short games blocked synchronously for 201.13 ms before the fix and 28.81 ms after it; total ZIP generation measured 729.39 ms → 450.93 ms. |
| Beginner lessons | Lessons were hidden from the start screen, and correct answers displayed a success message without changing the diagram. Learn Go now opens lessons from desktop and phone start screens; correct answers place a stone and apply captures. Advancing to an exercise now focuses its board instead of losing focus when Next becomes disabled. | Real pointer capture exercises passed at 1440×900, 1024×500, 390×844, 320×568, and 568×320. The captured white stone disappears, the black stone appears, and the main game remains unchanged. Phone users return to Home after closing lessons. The viewport suite now checks solved lesson diagrams, step focus, and feedback contrast. |
| Deep branch editing | Copying, pasting, and rebuilding setup stones overflowed the call stack on a long study. A failed setup edit could leave the stored root changed while the displayed board stayed unchanged. All four recursive clipboard/replay walks now use explicit stacks and reuse immutable positions for comment nodes. | All three operations failed on a 12,000-comment Chrome fixture before the fix. They completed in about 1.7 ms, 3.8 ms, and 6.3 ms after it. Regression tests cover every comment, sibling order, legal-move pruning, parent links, and undo/redo. `test:study` now exercises the complete branch workflow. |
| First-analysis reload and browser QA | A cold development server discovered TensorFlow's worker dependencies only when analysis started, rebuilt shared chunks, and reloaded the app. The QA helper silently replayed the interrupted test in an empty document. Vite now prepares those dependencies at startup; browser navigation waits for the requested document and never replays interrupted actions. | An isolated cold cache reproduced the exact 768×1024 failure recorded in CI. Server logs identified all three TensorFlow dependencies, then a reload and a replayed probe before the new UI mounted. Nine helper regressions cover navigation ordering, failures, deadlines, and preserving exceptions. The viewport suite now uses an isolated profile and a fresh dependency cache on every run, and the CI step is enabled with failure screenshots. |
| Nested imports and problem solutions | Importing deeply nested SGF variations and showing a solution still used recursive traversal. Both overflowed at 12,000 nodes. Parsing now tracks variation endpoints explicitly, and solution search backtracks with an explicit stack. | Three failing regressions now pass, covering every nested sibling, a deep wrong branch before a correct one, and an unmarked main line. Real file input and Show solution passed at 1440×900 and 390×844 with a 192,942-byte nested study; the solution board changes while the main game stays at the start. The browser benchmark measured 5.38 ms for nested parsing and 0.67 ms for solution lookup. |
| Large file/ZIP imports | Each imported entry rebuilt and scanned the entire library for a name. Overlapping file reads also reserved names against stale state, producing duplicate names. Batches now reserve names with per-folder indexes against state at completion. Numeric suffixes remain unique beyond 9,999 collisions. | A real 10,000-game ZIP import at 1440×900 measured 2,947.74 ms → 498.15 ms; the longest observed main-thread task fell from 2,643 ms to 182 ms. Two overlapping file inputs formerly produced two `Race` entries; they now preserve both payloads as `Race` and `Race 2`. The 390×844 Library workflow passed the same count, uniqueness, and overlap checks. Five regression tests cover hierarchy, suffix gaps, concurrency ordering, and 12,000 same-named entries. |
| International SGF records | File and ZIP readers assumed UTF-8 and silently replaced legacy-encoded player names and notes. A shared byte decoder now honors BOMs and the first root's `CA`, with UTF-8 then Latin-1 for undeclared records. Library downloads also correct stale declarations on pasted Unicode. ZIP expansion accounting now uses actual bytes rather than JavaScript string length. | A valid Shift-JIS fixture formerly displayed `�{���V` instead of `本因坊` on desktop and phone. Native file inputs now preserve names, notes, and moves. Library import → actual ZIP download → file re-import preserved five records covering Japanese, Korean, Chinese, and Latin-1 at 1440×900 and 390×844. An unsupported encoding reports an error and leaves the current game intact. Fifteen tests cover four byte fixtures, export round-trips, BOMs, size preflight, malformed declarations, and a Shift-JIS trail byte that resembles an SGF escape. |
| OGS sync merge | Finishing an OGS sync replaced the library with the snapshot captured before downloading. Local imports and edits completed meanwhile could disappear. Sync now merges against the latest state, resolves the current destination folder, and reserves incoming names in one batch. | A real OGS dialog with mocked network responses reproduced a persisted local import disappearing when sync finished (10 entries instead of 11). The same workflow now retains both games. At 390×844, a local ZIP created the OGS destination while sync waited; completion reused that folder, preserved its local game, and expanded it. Three regressions cover late imports/edits, destination reuse and name collisions, and empty syncs. |
| Live analysis scheduling | CPU/WASM inference could resolve through an uninterrupted chain of microtasks, preventing the worker from receiving newer-position requests. Search now yields to incoming tasks every 50 ms between completed batches, preserving the clock across progress slices and leaving the tree resumable. | A production pointer move during 50,000-visit / 8-second searches took 32.05 s to show the new evaluation before the fix and 0.37 s afterward. At 6× renderer CPU throttling it took 0.53 s; the worker itself is not throttled by that setting. Two real CPU regressions cover short progress slices, cancellation, and subsequent tree reuse. `test:analysis` repeats the real WASM workflow with a 2.5 s budget. |

Position sharing relies on the store's existing invariant: board edits, replay,
and komi changes replace `gameState` and its arrays. Do not mutate a stored
position in place. The new regression freezes positions during setup edits and
checks undo/redo across rebuilt descendants.

Drawings remain session-only and are not part of SGF export. The drawing fixes
do not change that storage contract.

## Validation and measurement

The baseline passed 2,384 tests, with one intentionally skipped benchmark. After
the analysis scheduling fix, `npm run verify` passed 2,446 tests, with the same skip,
plus app/test typechecks, lint, and the production build. `npm audit` reported
zero vulnerabilities in the lockfile dependency graph on 2026-09-12.

The initial installed Vitest was 4.1.8, below the lockfile's 4.1.11. Before the
deep branch editing commit, `npm ci` refreshed dependencies from the unchanged
lockfile. The full verification passed again on Vitest 4.1.11, and `npm ls`
reported no invalid top-level dependencies.

Every code commit was followed by the existing Chrome viewport suite. All 11
sizes passed: 1280×800, 1024×768, 1024×500, 768×1024, 390×844, 360×800,
320×568, 844×390, 568×320, 1280×460, and 1440×900. Screenshots were visually
inspected for desktop, phone drawing tools, the phone review notice, beginner
lessons, and deep branch editing. Deep copy/paste/setup/undo/redo also passed
through real pointer controls at 1440×900 and 390×844.

The first viewport run after refreshing dependencies reproduced a failure at
768×1024. A cold-cache diagnostic traced it to a Vite worker dependency reload,
followed by the helper replaying the interrupted test before React mounted.
Warm-cache runs had hidden it. Fresh browser profiles also exposed a QA setup
error: the test ignored an existing install banner hidden by the start screen,
then expected an offline-ready event to replace that occupied slot. The setup
now dismisses an existing banner whether or not the start screen hides it.
Component probes also resolve the page's actual React runtime instead of
hardcoding a default Vite cache path. The complete cold-cache sweep now passes,
including score-quiz request ordering and real touch scrolling of static boards.

Production response checks after `dbcdb55` measured:

| Operation | Result | Existing budget |
| --- | ---: | ---: |
| First board move, synchronous handler | 3.91 ms | 25 ms |
| Median subsequent board move | 0.37 ms | 5 ms |
| Warm Settings dialog | 10.6 ms | 120 ms |
| Trusted-input event timing, p98 | 24 ms | 150 ms |
| Longest observed long task | 0 ms | 200 ms |

These are local Chrome measurements, not a claim about all devices. The large
study benchmark uses a synthetic pass-move line to isolate snapshot cost. Its
speedup does not measure neural inference, normal-game strength, or rendered
interaction latency. Run both kinds of check:

```sh
npm run verify
npm run test:viewport
npm run test:responsiveness
npm run test:analysis
npm run test:study
```

`test:study` starts its own dev server and isolated Chrome profile. It reports
five marker-edit samples for a 2,001-node game and checks that a 12,000-comment
export can be parsed back without lost or reordered comments. Its budgets are
25 ms for the median edit and 500 ms for export. A recorded run measured
0.390 ms and 13.10 ms respectively. Production response checks require a fresh
build; dev-store timings are deliberately reported separately.
It also copies and pastes a 12,000-comment branch, rebuilds both variations
after a setup edit, and checks that displayed and stored positions agree.
Nested SGF import and solution lookup are checked at the same depth, with
500 ms budgets per operation and assertions on the complete resulting paths.
The library naming probe adds 10,000 same-named imports to 10,000 existing
entries, checking every resulting name within a 500 ms budget. It measured
3.35 ms locally; this isolates naming and does not measure ZIP decoding,
persistence, rendering, or input latency. The real ZIP import above includes
file selection through the success toast and checks persisted content afterward.

## Research and implications

| Primary reference | What matters here | Next implication |
| --- | --- | --- |
| [KaTrain](https://github.com/sanderland/katrain#analysis) | Teaching, mistake-focused review, alternative-move analysis, and play/analyze separation are established workflows. Its documentation bases teaching feedback on full-strength engine analysis. | Preserve the existing Coach/Pro distinction, make strength and analysis confidence understandable, and validate search behavior before claiming professional equivalence. |
| [Sabaki](https://github.com/SabakiHQ/Sabaki#features) | SGF collections, GIB/NGF import, variation copying, undo/redo, comment search, and a fast game tree support serious editing. | Reliability of annotations and large trees comes before adding more analysis controls. GIB/NGF import is a useful interoperability gap. |
| [SGF charset specification](https://www.red-bean.com/sgf/properties.html#CA), [PySGF file reader used by KaTrain](https://github.com/sanderland/pysgf/blob/main/pysgf/parser.py), and [browser Encoding Standard](https://encoding.spec.whatwg.org/) | SGF declares text encoding with `CA` and defaults to Latin-1. PySGF reads that declaration before parsing. Browsers provide decoders for the common East Asian formats. | The reproduced corruption is fixed at the byte boundary with native decoders. Undeclared UTF-8 remains compatible; undeclared East Asian encodings need explicit conversion. Multi-game and mixed-charset collections require a separate import design. |
| [Lizzie](https://github.com/featurecat/lizzie) | Continuous analysis, full-game review, and configurable native-engine execution are central to its workflow. | Measure navigation and board responsiveness during real analysis, not just with an idle engine. |
| [KataGo analysis protocol](https://github.com/lightvector/KataGo/blob/master/docs/Analysis_Engine.md) | Native analysis supports asynchronous requests and multiple positions, with cross-position batching for capable GPUs. | An optional native-engine connection is a promising professional throughput path. This is an architectural inference, not a measured speedup for this repository. |

## Highest-priority remaining work

| Priority | Finding or opportunity | Evidence and next step |
| --- | --- | --- |
| High | Confirm the restored browser gate on Linux CI. | The formerly recorded first-mobile failure now reproduces locally with a cold cache and has a traced cause and fix. The full viewport gate is enabled with failure screenshots. These local commits have not been pushed, so a GitHub-hosted run of the fix remains unverified. |
| High | Continue auditing large-tree operations. | Snapshotting, export, clipboard/replay, nested SGF parsing, and solution search are now iterative after reproduced failures. Inspect broad trees, library folder recursion, redundant position copies during import, and responsiveness during analysis next. |
| High | Professional engine validation needs broader evidence. | The bundled model comes from KataGo's test fixtures. Existing golden/invariant tests are useful but do not prove b18 search equivalence across all supported rules and endgames. Add reference positions for stronger weights, ko/superko, seki, pass handling, and handicap compensation. |
| High | Analysis provenance is not carried comprehensively through imported records and reports. | `AnalysisResult` exposes evaluation data without model/search identity. The undo revision fix prevents one stale-data path, but imported external analysis can still have unknown provenance. Design explicit origin, model, and settings metadata before presenting mixed-source comparisons as equivalent. |
| Medium | Continue profiling large-library operations. | ZIP export preparation and batch import naming now use indexes, with measured gains on 10k-game fixtures. OGS sync now merges against current state; dropped-text imports and naming dialogs still use separate paths. Compression still takes most of total export time. `library.ts` folder-option traversal remains recursive; inspect copying, moving, filtering, and rendering next. |
| Medium | Initial bundle size and slower-device behavior need targeted profiling. | The current production entry is about 715 kB uncompressed / 209 kB gzip. Idle dialog warming and worker inference already help. Measure cold network loading and CPU-throttled interaction before choosing further split points; do not infer gains from line counts alone. |
| Medium | Browser coverage is Chrome-only in this audit. | Touch capability and viewport sizes were emulated, but WebKit/Firefox, physical phone behavior, and browser-specific WebGPU/WASM fallbacks were not validated. Prioritize load/import/review/scoring and dialog keyboard behavior across engines. |

## Feature order for beginners and experienced players

1. **Guided first game:** Learn Go now exposes the existing fundamentals lessons
   on both start screens. Next add a guided 9×9 first game. Keep Coach as the
   plain-language path and let players reveal technical detail when useful.
2. **Professional import compatibility:** add GIB/NGF through the existing
   import pipeline with metadata, handicap, coordinate, and encoding fixtures.
3. **Reliable study archives:** harden deep branch editing, add meaningful
   large-library measurements, and keep saved/exported content recoverable.
4. **Analysis provenance and comparison:** show which model/settings produced
   an evaluation and make any comparison between unlike analyses explicit.
5. **Optional native analysis:** retain the browser-only quick start while
   offering a documented connection to native KataGo for demanding review.
   Assess transport, cancellation, progress, and setup cost before implementation.

## Audit coverage so far

The first pass mapped the repository, read architecture/engine/development and
deployment material, traced edit history and SGF serialization in detail,
inspected the analysis queue and worker boundary, checked model selection and
both UI shells, scanned recursive functions across TypeScript sources, and read
the library/persistence paths relevant to the next investigations. Full existing
tests and repeated browser sweeps supplied broader regression coverage.

Detailed line-by-line review of the full neural graph/search implementation,
all import formats and storage failure modes, every study modal, and every
accessibility path remains ongoing. Continue in small commits and run browser
QA after each commit; record reproductions and measured gains here.
