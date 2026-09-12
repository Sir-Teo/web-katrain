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

Position sharing relies on the store's existing invariant: board edits, replay,
and komi changes replace `gameState` and its arrays. Do not mutate a stored
position in place. The new regression freezes positions during setup edits and
checks undo/redo across rebuilt descendants.

Drawings remain session-only and are not part of SGF export. The drawing fixes
do not change that storage contract.

## Validation and measurement

The baseline passed 2,384 tests, with one intentionally skipped benchmark. After
the library ZIP follow-up, `npm run verify` passed 2,405 tests, with the same skip,
plus app/test typechecks, lint, and the production build. `npm audit` reported
zero vulnerabilities in the lockfile dependency graph on 2026-09-12.

Every code commit was followed by the existing Chrome viewport suite. All 11
sizes passed: 1280×800, 1024×768, 1024×500, 768×1024, 390×844, 360×800,
320×568, 844×390, 568×320, 1280×460, and 1440×900. Screenshots were visually
inspected for desktop, phone drawing tools, and the phone review notice.

Production response checks after the last code commit measured:

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
npm run test:study
```

`test:study` starts its own dev server and isolated Chrome profile. It reports
five marker-edit samples for a 2,001-node game and checks that a 12,000-comment
export can be parsed back without lost or reordered comments. Its budgets are
25 ms for the median edit and 500 ms for export. A recorded run measured
0.390 ms and 13.10 ms respectively. Production response checks require a fresh
build; dev-store timings are deliberately reported separately.

## Research and implications

| Primary reference | What matters here | Next implication |
| --- | --- | --- |
| [KaTrain](https://github.com/sanderland/katrain#analysis) | Teaching, mistake-focused review, alternative-move analysis, and play/analyze separation are established workflows. Its documentation bases teaching feedback on full-strength engine analysis. | Preserve the existing Coach/Pro distinction, make strength and analysis confidence understandable, and validate search behavior before claiming professional equivalence. |
| [Sabaki](https://github.com/SabakiHQ/Sabaki#features) | SGF collections, GIB/NGF import, variation copying, undo/redo, comment search, and a fast game tree support serious editing. | Reliability of annotations and large trees comes before adding more analysis controls. GIB/NGF import is a useful interoperability gap. |
| [Lizzie](https://github.com/featurecat/lizzie) | Continuous analysis, full-game review, and configurable native-engine execution are central to its workflow. | Measure navigation and board responsiveness during real analysis, not just with an idle engine. |
| [KataGo analysis protocol](https://github.com/lightvector/KataGo/blob/master/docs/Analysis_Engine.md) | Native analysis supports asynchronous requests and multiple positions, with cross-position batching for capable GPUs. | An optional native-engine connection is a promising professional throughput path. This is an architectural inference, not a measured speedup for this repository. |

## Highest-priority remaining work

| Priority | Finding or opportunity | Evidence and next step |
| --- | --- | --- |
| High | Browser checks are disabled in CI. | `.github/workflows/ci.yml` contains a commented-out viewport step and records unresolved Linux input failures. Reproduce with an isolated browser profile and per-scenario diagnostics, then enable a dependable subset before the full sweep. Local green results do not close this gap. |
| High | More tree operations still depend on recursion. | A TypeScript syntax scan identified branch clipboard copy/count/paste and descendant replay in `gameStore.ts`, solution-path search in `problemMode.ts`, and nested-variation parsing in `sgf.ts`. Reproduce each with realistic collections and deep fixtures; preserve pruning and sibling ordering when replacing traversal. These are candidates, not all independently reproduced failures. |
| High | Professional engine validation needs broader evidence. | The bundled model comes from KataGo's test fixtures. Existing golden/invariant tests are useful but do not prove b18 search equivalence across all supported rules and endgames. Add reference positions for stronger weights, ko/superko, seki, pass handling, and handicap compensation. |
| High | Analysis provenance is not carried comprehensively through imported records and reports. | `AnalysisResult` exposes evaluation data without model/search identity. The undo revision fix prevents one stale-data path, but imported external analysis can still have unknown provenance. Design explicit origin, model, and settings metadata before presenting mixed-source comparisons as equivalent. |
| Medium | Continue profiling large-library operations. | ZIP selection and folder-path construction now use indexes and cached paths, with a measured improvement on a 10k-game fixture. Compression still takes most of total export time. `library.ts` folder-option traversal remains recursive; inspect copying, moving, filtering, and rendering next. |
| Medium | Initial bundle size and slower-device behavior need targeted profiling. | The current production entry is about 715 kB uncompressed / 209 kB gzip. Idle dialog warming and worker inference already help. Measure cold network loading and CPU-throttled interaction before choosing further split points; do not infer gains from line counts alone. |
| Medium | Browser coverage is Chrome-only in this audit. | Touch capability and viewport sizes were emulated, but WebKit/Firefox, physical phone behavior, and browser-specific WebGPU/WASM fallbacks were not validated. Prioritize load/import/review/scoring and dialog keyboard behavior across engines. |

## Feature order for beginners and experienced players

1. **Beginner entry points:** make the existing fundamentals lessons and a
   guided 9×9 first game easy to reach from the start screen. Keep Coach as the
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
