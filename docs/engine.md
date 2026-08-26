# Engine

The engine is a browser-native KataGo-style pipeline built from TypeScript,
TensorFlow.js, and a dedicated Web Worker. It is not a wrapper around the KataGo
binary and does not require a backend server.

## Key Files

| File | Role |
| --- | --- |
| `src/engine/katago/client.ts` | Main-thread worker client and request bookkeeping. |
| `src/engine/katago/worker.ts` | Model loading, backend selection, feature extraction, request queue, and worker responses. |
| `src/engine/katago/loadModelV8.ts` | Parser for KataGo `.bin` model versions 8 through 16. |
| `src/engine/katago/modelV8.ts` | TensorFlow.js model graph construction and forward passes. |
| `src/engine/katago/featuresV7Fast.ts` | Fast feature tensor filling for KataGo v7-style inputs. |
| `src/engine/katago/fastBoard.ts` | Compact board representation, legal move checks, ko, captures, ladders, and board-size setup. |
| `src/engine/katago/analyzeMcts.ts` | PUCT/MCTS search, expansion, rollout evaluation, PVs, and ownership aggregation. |
| `src/engine/katago/evalV8.ts` | Post-processing of network value and score outputs. |
| `src/engine/katago/positionInputsV7.ts` | Board position to v7 input planes, including ko, ladder, and area features. |
| `src/engine/katago/backendFallback.ts` | TensorFlow.js backend preference and fallback helpers. |
| `src/engine/katago/humanSlProfile.ts` | Metadata rows for KataGo's human SL net (rank, era, time control). |

## Model Loading

The default model URL points to `models/katago-small.bin.gz`, resolved through
the app base path. `scripts/fetch-katago-small-model.mjs` downloads the tiny
test network when it is missing.

For stronger local analysis, Settings offers:

`kata1-b18c384nbt-s9996604416-d4316597426.bin.gz`

Developers can also run:

```sh
FETCH_KATRAIN_MODEL=1 npm run fetch:model
```

That copies the b18 model from `../katrain-ref/katrain/models/` when present, or
downloads it into `public/models/`.

At runtime, the worker:

1. Normalizes the requested backend.
2. Fetches the model URL or blob URL.
3. Decompresses gzip weights with `pako` when needed.
4. Parses the KataGo binary model.
5. Builds and warms the TensorFlow.js model.
6. Caches the loaded model until the model URL changes.

Supported model versions are 8 through 16. Models with unsupported meta encoder
versions or unsupported trunk block kinds fail fast with a visible engine error.

Uploaded models are accepted as `.bin`, `.gz`, or `.bin.gz` files and are capped
at 128 MB for browser practicality.

## Backends

The default backend preference is `webgpu`. If WebGPU is unavailable or warmup
fails, the worker can fall back to `wasm`, then `cpu`.

Threaded WASM depends on `SharedArrayBuffer`, which requires cross-origin
isolation headers:

```text
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

The app still runs without those headers; it just cannot use threaded WASM.

## Feature Extraction

The worker converts the current `BoardState` plus previous boards, recent moves,
komi, rules, and conservative-pass setting into KataGo v7-style tensors:

- Spatial input: 22 channels over the active board.
- Global input: 19 values.
- Recent history: up to the last five moves.
- Ko and previous-ko features.
- Liberty maps and ladder features.
- Area features for Chinese rules.

This work is optimized with reusable typed-array scratch buffers so repeated
analysis does not allocate heavily.

## MCTS Analysis

`MctsSearch` combines neural network policy/value outputs with PUCT-style tree
search. A normal analysis request can control:

- Visits and maximum time.
- Batch size.
- Maximum child moves.
- Top-K candidate count.
- Principal variation length.
- Region of interest.
- Root noise.
- Random symmetry sampling.
- Tree reuse.
- Ownership mode: `none`, `root`, or `tree`.

The returned payload includes root win rate, root score lead, score self-play,
score standard deviation, visits, policy, ownership, ownership standard
deviation, and candidate moves with visits, priors, point loss, win-rate loss,
score, PV, per-move PV visits, LCB, and optional move ownership.

Root values are stored from Black's perspective.

### What the search does, and where it comes from

The search follows KataGo's own behaviour rather than a generic PUCT loop. The
ported pieces, with the C++ they mirror:

- Node statistics are rebuilt from a node's children after every playout
  (`recomputeNodeStats`), so noise pruning and sibling downweighting apply at
  every node rather than only in the final report.
- Move ranking uses play selection values with LCB, not raw visit counts
  (`getPlaySelectionValues`, `getSelfUtilityLCBAndRadius`), and the principal
  variation follows the same values at every depth.
- Root symmetry pruning searches one copy of each symmetrically equivalent move
  and puts the copies back into the output with `isSymmetryOf`
  (`markDuplicateMoveLocs`).
- The root ending bonus and the four-passes pruning keep the endgame tidy
  (`getEndingWhiteScoreBonus`, `isAllowedRootMove`).
- Subtree value bias corrects a node's own evaluation using what the search has
  learned about positions with the same local pattern (`SubtreeValueBiasTable`).
- Uncertainty weighting gives a visit less weight when the network says its own
  judgement is still moving (`computeWeightFromNNOutput`). Only networks from
  model version 10 on predict this; older ones, including the bundled small
  network, weight every visit equally.

## Human-like Moves

KataGo 1.15 added a second network trained on human games, which predicts the
move a player of a given rank would make rather than the best move. Settings can
point at it (`b18c384nbt-humanv0.bin.gz`); the analysis itself always comes from
the main network, and the human network only adds a `humanPolicy` to the payload,
which the policy overlay can draw instead of the engine's own policy.

Profiles follow KataGo's `humanSLProfile` names: `rank_20k` through `rank_9d`,
`preaz_*` for pre-AlphaGo style, and `proyear_1800` through `proyear_2023`. The
official download does not send CORS headers, so Settings also accepts a local
path under `public/models/` or a file loaded from disk for the session.

The report and the move info panel use the same numbers the other way round: how
often a player of the configured rank plays the move that was actually played, so
a review can say whether a move was a normal choice at that level or an unusual
one, rather than only how many points it cost.

The same network drives the `human` AI strategy: instead of playing the engine's
move, the bot samples from the human policy at full temperature, which is what
KataGo recommends for imitating a rank rather than beating it. Passing is left to
the engine, because the game records the network learned from often omit passes.
The moves that policy likes are also given a couple of visits in every analysis,
so the report can say what the move a player of that rank would choose costs.

### Finished games

Two passes end the game. Under area scoring the result is then a matter of
counting, so the search scores such a node exactly instead of asking the network
about a filled board, which is off-distribution and unreliable. Territory rules
need the dead stones agreed first — what KataGo's encore is for — so under those
the network keeps judging the position as before.

### Restricting the search

`avoidMoves` (KataGo's own name for it) removes moves from the root's options
without touching the policy the overlay draws. The command palette's "Analyze
without the top move" uses it to answer what the rest of the board is worth when
one move dominates the reading. A region of interest restricts the root the same
way, and the two compose.

## Analysis Modes

The store uses the engine in several ways:

- Interactive analysis: current-position search for the board UI.
- Continuous analysis: automatically refreshes as the current node changes.
- Quick game analysis: value-only batch evaluation for a fast whole-line scan.
- Fast game analysis: low-visit MCTS over the current line.
- Full game analysis: requested-visit MCTS over selected nodes or mistakes.
- AI move selection: runs analysis and chooses a move through the configured
  KaTrain-style strategy.
- Self-play to end: repeats AI move selection until the game is complete.

The main-thread `analysisQueue` handles cancellation, staleness, priority, and
cache reuse before requests reach the worker.

## AI Strategies

The strategy list mirrors KaTrain concepts: `default`, `rank`, `scoreloss`,
`policy`, `weighted`, `pick`, `local`, `tenuki`, `territory`, `influence`,
`jigo`, `simple`, and `settle`.

Most strategies choose among candidate moves using visits, policy, score loss,
or shape/territory heuristics. `simple` and `settle` need per-move ownership,
so they request slower analysis with move ownership enabled.

## Verifying Evaluation Accuracy

The engine is a from-scratch reimplementation, so "is it strong?" and "is it
telling the truth?" are separate questions. Two test files answer the second.

`test/engineGolden.test.ts` pins the raw network against KataGo itself. KataGo's
repository records the output of its own binary running
`g170-b6c96-s175395328-d26788732` -- the model this repo ships -- on a 5x5
position, in `cpp/tests/results/runNNOnTinyBoardTest.txt` (white to play,
Tromp-Taylor, komi 7.5, default symmetry 3). The test rebuilds that position,
runs it through the shipped parser, graph, input planes, and post-processing,
and compares win rate, score mean, score mean squared, lead, the full policy,
and the full ownership map. Everything matches to within a permille, so a
failure means one of those layers changed meaning.

`test/engineAccuracy.test.ts` checks properties that must hold regardless of
what the network says:

- **Colour-swap antisymmetry.** Swapping every stone, swapping who is to move,
  and negating komi produces a bit-identical input tensor, because the net only
  sees "me" and "them". Any asymmetry in the reported black-perspective numbers
  is a sign-convention bug. This is checked exactly, not approximately.
- **Komi direction and magnitude.** Raising komi must lower black's score lead
  and win rate, and a point of komi must be worth roughly a point of lead.
- **Ownership against score.** Under area scoring the ownership map sums to
  black's area minus white's, so the sum minus the reported score should recover
  komi. This ties the two heads together and catches a transposed board.
- **Rotation independence.** The net is only approximately equivariant, so this
  bounds the noise rather than asserting equality; a spread far beyond that
  bound means an indexing bug in the planes or the ownership readout.
- **Reproducibility.** The same position analysed twice must give the same
  territory estimate, or the ownership overlay flickers and a user cannot tell a
  real change from noise. See root symmetry handling below.
- **Frame consistency in search.** Per-move win rate and score lead must sit in
  the same black-perspective frame as the root, and `pointsLost` must be
  measured from the mover's point of view for both colours.

Both files skip themselves when `public/models/katago-small.bin.gz` is absent,
so `npm test` still works before `npm run fetch:model`.

### Root Symmetry

Leaf evaluations inside the search use randomized symmetries, which decorrelates
their errors and is what KataGo does. The root is different: it is evaluated
once and its numbers are what the user reads. Randomizing it there adds noise
without averaging anything away, so the root always uses a fixed symmetry, and
averages several of them when the backend is fast enough
(`rootSymmetrySamplesForBackend`). On the shipped 6x96 network a single view can
be off by as much as 0.25 of ownership on a point compared to another view of
the same position.
