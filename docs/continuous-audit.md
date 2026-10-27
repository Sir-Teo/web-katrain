# Repository audit findings

Started 2026-09-12 at `d868c00` on `codex/repo-audit-improvements`; merged into `main`.
The initial audit was wrapped up at the user’s request; a new improvement pass
is ongoing. It does not claim that
every line or every workflow has been validated. The starting `src/` tree contained about 84,500 lines. Keep
reproduced failures separate from candidates that still need investigation.

## Latest verification

- The SGF/OGS paste editor now accepts Ctrl+Enter and ⌘+Enter through its
  existing cancellable submit action, with a visible hint and accessible
  shortcut metadata. Ordinary Enter still inserts a newline; empty input,
  composition confirmation and repeated pending requests are ignored.
  Four native screen-size flows pass, including a failed OGS download,
  preserved editor focus, correction and successful SGF import. Evidence is
  under `katrain-paste-submit-keyboard-native-BnJf4E`; app TypeScript, targeted
  lint and 24 related cases pass. The production build passes (Vite phase
  15.0 s), and the four flows also pass against that bundle under
  `katrain-paste-submit-production-FmC20V`. An initial combined diagnostic failed a
  selector expression, and its corrected run then failed an older held-read
  precondition at 1,690 ms before the shortcut cases. Both logs remain under
  `/tmp/katrain-paste-submit-native*.log`; the older clipboard fixture is
  unchanged. The focused shortcut checks do not replace that failed run.

- Lesson feedback now scrolls only its own pane when a short screen would hide
  the hint or answer explanation behind the footer. The 320×568 baseline hid
  44–64 px of feedback; the corrected pane moves 51–71 px while preserving
  board focus and the page position. All 16 native wrong/correct answers with
  pointer and keyboard pass at 1440×900, 390×844, 320×568 and 568×320, including
  answer gating and reset on reopening. The other three sizes do not scroll
  unnecessarily. Baseline screenshots remain under
  `katrain-lesson-feedback-5S3tcT`; passing assertions/screenshots are under
  `katrain-lesson-feedback-native-JbC8EB`. App TypeScript, targeted lint and
  25 related cases pass. The production build passes (Vite phase 15.5 s), and
  the same 16 native cases pass against that build under
  `katrain-lesson-feedback-production-rOc96T`. This is focused validation,
  not a complete sweep.

- The next integrated browser sweep at `dbff8cc` also failed a timing
  precondition: a held clipboard read completed at 1,211 ms while choosing a
  Library game at 320 px, beyond the unchanged 1,000 ms fixture limit and
  1,200 ms read timeout. All 11 layouts and earlier Library/scoring/import
  suites passed; new-game and later suites did not run. Evidence remains under
  `/workspace/.katrain-audit-artifacts/katrain-batch-seventy-eight-viewports`.
  Diagnostic-only phase timings and root history now accompany this fixture.
  Its isolated 18 cases pass at 1440/390/320 px, with read completions at
  18–253 ms, under `katrain-clipboard-selection-diagnostic-WZIyJE`. That focused
  pass does not replace the failed integrated run or establish its cause.

- Full unit verification at `f39d2c8` passes 503 files and 3,450 cases, with
  78 existing engine skips. The build passes (Vite phase 12.9 s), and this
  standard responsiveness sample meets all five unchanged limits at
  7.8/1.2/100/72/87 ms. Its complete browser sweep is a failed run: the 390 px
  variation-copy fixture took 1,277 ms to complete a newer SGF copy through
  palette opening/search, exceeding its unchanged 1,000 ms overlap precondition
  and 1,200 ms clipboard timeout. The SGF success toast was visible,
  but that sample cannot establish the intended overlap. All 11 layouts,
  55 new-game cases, Lessons, notification-copy ordering, model-copy feedback,
  cross-tab storage, 1,500 folders, image/text and engine-error copy cases passed
  before it; later suites did not finish. The failure and screenshot are retained.
  The fixture now uses the app's native Ctrl+C action with clean default bindings
  and cleared text selection, and records per-case timings. All 15 focused
  cases pass, with the newer SGF action taking 135–172 ms and no budget change.
  The application code is unchanged by this fixture repair.

- Complete verification at `c63635a` passes all 503 unit files and 3,450 cases,
  with the existing 78 engine cases skipped in CI. The build passes (Vite
  phase 11.3 s). This standard responsiveness sample meets all five unchanged
  limits: first move 8.6 ms, median 1.2 ms, Settings 85.6 ms, input latency
  48 ms and longest task 69 ms. Earlier latency failures remain unresolved;
  this sample does not establish their cause or a performance fix.
  The complete integrated browser sweep passes all 11 layouts and every native
  suite, with no competing test jobs. It includes cross-tab lesson progress,
  four practice-board sizes, 28 engine-copy cases, 15 variation-copy/action
  cases with alternate pointers, 18 model-URL copy/lifetime/closure cases,
  two-tab Library naming/storage, image/text ordering, frozen PNG exports,
  1,500 nested folders and final read/import recovery. Evidence is retained
  under `/workspace/.katrain-audit-artifacts/katrain-batch-seventy-six-viewports`.

- Full unit verification at `b0ce399` retains one failure: a static candidate
  control check expected the literal `min-height: 1.5rem` declaration after
  the touch-size change used `var(--candidate-action-size, 1.5rem)` instead.
  The remaining 502 files and 3,449 cases pass, with 78 existing engine skips.
  The assertion now checks the unchanged 24 px fallback in its variable form;
  native geometry already confirms 44 px phone/coarse-pointer actions.
  The 42 related cases and targeted lint pass after this repair. The original
  failed full run remains recorded; the subsequent complete run above passes.

- Verification at `00d911f`, including cross-tab lesson progress, passes all
  503 unit files and 3,450 cases, with the existing 78 engine cases skipped
  in CI. App/test TypeScript, full lint and 22 related cases pass. The build
  passes (Vite phase 13.9 s). A focused browser pass keeps the unchanged base
  checks for all 11 layouts, including each modal's lesson-completion fixture,
  then runs the four practice-board sizes and three native two-tab progress
  cases with visible updates and both reloads. All pass, with no competing
  jobs. This is a focused layout/lesson pass; the latest complete sweep of
  every native suite remains `b7a92c3` below. Evidence is retained under
  `/workspace/.katrain-audit-artifacts/katrain-batch-seventy-three-layouts`.

- Verification at `b7a92c3`, including report-aware engine-error copy feedback
  and focused mobile actions clearing their toast, passes all 503 unit files
  and 3,445 cases, with the existing 78 engine cases skipped in CI.
  App/test TypeScript, full lint and 74 related cases pass. The production
  build passes (Vite phase 13.1 s). This standard responsiveness sample meets
  all five unchanged limits: first move 8.0 ms, median 1.2 ms, Settings 86.7 ms,
  input latency 48 ms and longest task 67 ms. Earlier latency failures remain
  unresolved; this sample does not establish their cause or a performance fix.
  The complete integrated browser sweep passes all 11 layouts and every native
  suite, with no competing test jobs. This includes the four Lessons practice
  sizes, 28 engine-copy cases with touch/keyboard retry and preserved focus,
  fast navigation, two-tab naming, image/text ordering, real clipboard reads,
  PNG geometry/coordinates, import ownership, 1,500 nested folders, cross-tab
  storage and final read/import recovery. Evidence is retained under
  `/workspace/.katrain-audit-artifacts/katrain-batch-seventy-two-viewports`.

- Verification at `59bd883`, including the Lessons practice-board shortcut,
  passes all 503 unit files and 3,445 cases, with 78 engine cases skipped in
  CI. App/test TypeScript, targeted lint and 38 related cases pass. The build
  passes (Vite phase 15.3 s). Native practice flows pass all four selected
  desktop/phone/landscape sizes; the production build also opens an empty
  9×9 board and focuses it at 1440×900, 320×568 and 568×320 without runtime
  exceptions. The first production probe sent Ctrl+K immediately after board
  mount and failed to open the phone palette; waiting two rendered frames
  before that first input repairs the fixture, without changing app code or
  deadlines. The original failure and screenshot are retained. The latest
  complete integrated sweep remains `811e40f`, before this shortcut.

- Full verification at `811e40f` passes 503 unit files and 3,445 cases, with
  78 engine cases skipped in CI. App/test TypeScript, full lint and the
  18 native fast-navigation cases pass. The production build passes (Vite
  phase 15.3 s). Standard responsiveness passes first move, median, Settings
  and longest task at 19.6/1.6/84.1/101 ms, but fails input latency at
  248 ms versus 150 ms; its slowest interaction is To start. One final
  publication per fast jump is confirmed, but an overall latency improvement
  is not established. Large-study checks pass, including 12,000-comment
  import/export and Library operations. Real production analysis passes on
  desktop and phone: Stop reaches the worker at 237/230 ms, explicit Stop
  at 267 ms, and current-position evaluation renders at 1,084 ms within
  2,500 ms. Old work cancels at 297 ms. No engine speedup is claimed.
  The complete integrated browser sweep passes on the frozen commit, with
  no competing test jobs: all 11 layouts and every native suite, including
  the 18 fast-navigation cases, 18 two-tab naming cases, 15 mixed image/text
  copy cases, latest-copy feedback, PNG geometry/coordinates, import ownership,
  cross-tab storage, 1,500 expanded folders and final read/import recovery.
  This precedes the optional Lessons practice-board action under development.

- Full unit verification at `449d389` passes 502 files and 3,439 cases, with
  78 engine cases skipped in CI. This run uses one worker and keeps the
  existing timeouts; the earlier two-worker failure is retained below.
  App/test TypeScript, full lint and all 18 native two-tab naming cases pass.
  The production build passes (Vite phase 13.4 s). Standard responsiveness
  passes first move, median, Settings and longest task at
  11.0/1.1/100.3/149 ms, but input latency reaches 216 ms against the unchanged
  150 ms limit on Back 10. This is a failed timing run; the much larger prior
  Settings stall also remains unresolved. The integrated browser sweep on
  frozen `449d389` fails a held clipboard-command fixture: its read completes
  at 1,641 ms, after the unchanged 1,200 ms operation deadline. Another native
  browser check overlapped this portion, so contention is a possible influence;
  timed sweeps must run without competing checks. All 11 layout sizes, completed
  Library save/retry/overlap cases, manual scoring, header/tooltips and pasted
  draft/focus checks precede this failure. Later suites, including the new
  two-tab naming gate, did not run in this sweep; their focused results above
  do not make this an integrated pass.

- Verification at `96e0e08` passes 3,433 cases but retains one full-suite
  failure: the New Zealand engine-history case exceeds its unchanged 5 s
  timeout at 5.175 s. One isolated diagnostic passes all 30 cases in that
  file, with the affected case taking 265 ms; this does not replace the
  failed full run. The production build passes (Vite phase 21.9 s).
  Standard production responsiveness passes first move and median at
  20.6/4.2 ms, but fails Settings, input latency and longest task at
  9,691.9/1,104/9,828 ms. This much larger stall remains unresolved and
  the limits are unchanged. The integrated browser sweep captures all
  11 viewport sizes and passes preview touch scrolling and Library tags,
  then an environment restart interrupts it during empty-Library cases.
  No completion status was written; this is an incomplete run.

- The complete browser sweep at `3138e33` passes all 11 sizes and every native
  suite, including the 24 trusted Copy SGF actions with real clipboard reads
  and six successful legacy copies. The PNG size/rotation matrix, import
  ordering, storage and final recovery suites pass as well. This precedes
  the shared image/text preparation guard under verification.

- Full unit verification at `3138e33`, including stale text-copy fallback
  protection, passes 501 files and 3,431 cases with 78 engine cases skipped
  in CI. App/test TypeScript, targeted lint and all 12 native fallback-order
  cases pass. The production build passes in 15.0 s. Standard responsiveness
  again exceeds the unchanged Settings limit at 131.2 ms versus 120 ms; the
  other four checks pass. This is retained with the earlier 132.6 ms sample
  and rejected layout experiment. No performance fix or budget change is
  claimed. The complete integrated browser sweep passes as recorded above.

- The complete browser sweep at `cc1adee` passes all 11 sizes and every native
  suite. Frozen PNGs and coordinates pass all 9/13/19 boards at desktop and
  phone widths, all rotations and hidden coordinates; the 54 file/acquisition
  cases, trusted paste, storage, OGS and final recovery suites also pass.
  This sweep precedes the text-copy fallback race fix under verification.

- Full unit verification at `cc1adee`, including frozen PNG positions and
  displayed coordinates, passes 501 files and 3,428 cases with 78 engine
  cases skipped in CI. App/test TypeScript and full lint pass. The production
  build passes in 15.9 s; standard responsiveness passes at
  6.3/1.3/110.9/56/88 ms for first move, median, Settings, input latency and
  longest task. The earlier failed Settings samples remain recorded below.
  Offline shell/dialogs and fresh WASM analysis pass, including preservation
  of Library caches on activation and the cache-deletion negative control.
  Report printing passes desktop/phone with all ten mistake cards and the
  24-move correction in 12 pages. Study performance passes, including
  22.1 ms folder copy and 98.4 ms nested import. Live analysis passes:
  desktop/phone AI Stop 143/168 ms, explicit Stop 326 ms, old-request
  cancellation 303 ms, fresh response 679 ms and rendered evaluation 708 ms.
  No engine code changed; these are verification results, not proven speedups.
  The complete integrated browser sweep passes as recorded above.

- Full unit verification at `41b7a1f`, including the board-snapshot freeze,
  passes 501 files and 3,427 cases with 78 engine cases skipped in CI. The
  coordinate-export follow-up below has separate focused/native coverage.

- The complete browser sweep at `204b4c7` passes all 11 sizes and every
  native suite, including all 54 file/acquisition cases, 24 trusted paste
  events, both cross-tab storage modes and queued fallback reloads. Deep
  folders, OGS, Copy SGF and final import/read recovery pass. The pending
  board-image snapshot change is outside this completed sweep.

- Full unit verification at `204b4c7`, including file-handle acquisition
  ownership, passes 501 files and 3,425 cases with 78 engine cases skipped in
  CI. App/test TypeScript and targeted lint pass; all 54 expanded native file
  cases pass. The production build passes in 15.6 s. Its standard production
  responsiveness run passes at 6.2/1.1/107.7/72/82 ms for first move, median,
  Settings, input latency and longest task. No performance code changed; the
  earlier timing failures remain recorded.
- A predefined six-run, fresh-profile Settings comparison at `204b4c7`
  rejects deferring offscreen sections with `content-visibility`. Baseline
  opening times are 66.1/386.2/89.8 ms; the CSS control records
  97.6/125.2/115.3 ms. Baseline median 89.8 ms is faster than the control's
  115.3 ms. The slow baseline also records a 326 ms long task. Retain every
  result, including both failed arms; no CSS change or budget increase is
  applied. Intermittent Settings latency remains unresolved.

- The complete browser sweep at `9a1febd` passes all 11 sizes and every
  native suite, including all 36 local-file cases, 24 trusted paste events,
  both cross-tab storage modes and queued fallback saves with reload. Deep
  folders, OGS actions, Copy SGF and final import/read recovery pass as well.
  This result precedes the file-handle acquisition extension under verification.

- Full unit verification at `9a1febd`, including the local-file ownership
  extension, passes 501 files and 3,425 cases with 78 engine cases skipped in
  CI. App/test TypeScript and targeted lint pass. All 36 new native file cases
  and the existing pasted-import browser suites pass. The production build
  passes in 13.7 s. Its uninstrumented responsiveness run passes first move,
  median, input latency and longest task at 7.6/1.7/64/91 ms, but Settings
  takes 132.6 ms against the unchanged 120 ms limit. A CPU-profile/trace
  diagnostic adds substantial profiler-start overhead; a lighter timeline
  records 113.2 ms with no loading fallback and about 52 ms of style/layout
  work. No performance code changed; retain the uninstrumented failure as
  unresolved rather than replacing it with the instrumented passing result.
  The complete integrated browser sweep passes as recorded above.

- The complete browser sweep at `8fa9aad` passes all 11 viewport sizes and
  every native interaction suite, including both cross-tab storage modes,
  queued fallback saves with reload, all 24 trusted paste events, OGS actions,
  1,500 expanded folders, Library name navigation and import/read recovery.
  This sweep includes the coherent fallback fix and precedes the local-file
  ownership extension currently under verification.

- Full unit verification at `2943bb8` passes 501 files and 3,425 cases,
  with 78 engine cases skipped in CI. App/test TypeScript and lint pass.
  The production build passes in 16.2 s. Production responsiveness passes at
  10.6/1.4/99.6/64/74 ms for first move, median, Settings, input latency and
  longest task. The real offline check passes: activation preserves both
  seeded Library data namespaces while removing an obsolete app cache, then
  shell, board, dialogs and fresh WASM analysis work without network access.
  Its negative control still fails navigation after cache deletion. The
  completed browser result is recorded above.

- The fallback cross-tab failure is now reproduced as durable data loss:
  a predefined 12-run Chrome series queued two saves behind a held Web Lock,
  awaited both acknowledgements, closed Chrome and reopened the same profile.
  Four runs retained only the second game. The second renderer could read its
  stale localStorage cache after acquiring the lock; the first game's storage
  event arrived after the second write. Yielding one event-loop turn still lost
  a game in three of 12 runs. These failed controls are retained.
- Fallback saves now retain a shared Cache Storage snapshot, with both writes
  completed inside the existing Library lock. The same restart-verified series
  retains both games in all 12 runs, including six with CPU pressure. The normal
  native cross-tab gate also queues both writers and verifies a page reload.
  Unsupported Cache Storage keeps the legacy fallback behavior; this does not
  establish cross-browser storage consistency. Service-worker activation keeps
  Library data caches when replacing app-shell caches.
- The storage change passes 49 focused cases and the wider 43-file, 329-case
  Library set. Native empty-state, failed-save/update, initial Retry and both
  cross-tab storage modes pass. Cache write failures preserve the previous
  acknowledged records; corrupt cache snapshots reject rather than inventing
  an empty Library. App/test TypeScript and lint pass; the full unit result
  is recorded above.

- Full unit verification at `9e479f3` passed 499 files and 3,405 cases,
  with 78 engine cases skipped. App/test TypeScript and lint pass, and the
  production build passed in 16.8 s. Production responsiveness passed at
  7.8/1.2/90.7/56/72 ms for first move, median, Settings, input latency and
  longest task. A later run with the same build and updated browser teardown
  passed at 7.0/1.3/96.6/56/68 ms; this is not a performance-code change.
- The `9e479f3` full browser sweep exited 1 in the fallback cross-tab case:
  after Tab A’s completed save, Tab B read `[]` instead of `[Tab A]`. The
  preceding IndexedDB cross-tab case passed with both records in both raw
  snapshots. All 11 layouts and completed native checks through loading
  dialogs passed, including every new command/direct-paste/selection case.
  The fallback assertion preceded raw-state logging, so this sample does
  not distinguish delayed visibility from a lost write. Retain it alongside
  the earlier intermittent cross-tab failure and the later restart-verified
  reproduction above; this remains a failed full sweep.

- Full unit verification at `b6c5f00` passed all 498 files and 3,396 cases,
  with 78 engine cases skipped in CI. This includes Library name navigation
  and clipboard-command identity checks; it precedes the shared text-import
  extension described below.

- The full unit run at `9a187fb` passed 497 files and 3,382 cases, with
  78 engine cases skipped, and caught one disabled-hover styling assertion
  on the new Read Clipboard state. Guarding its hover variant fixes that
  detail; both affected files subsequently pass all 11 cases. The original
  failed full-run log is retained. App/test TypeScript and lint passed before
  this class-only repair. Production build at `f2a1be7` passed in 15.1 s.
- The complete browser sweep at `f2a1be7` passed all 11 viewport sizes and
  every native interaction suite, including the new clipboard-ordering
  regression, OGS checks after the deep ZIP fixture, both cross-tab storage
  modes with recorded snapshots, 1,500 expanded folders, paged row metadata,
  Copy SGF, recovery, focus and import retries. Earlier failed and incomplete
  sweeps remain documented below.
- Production responsiveness at `f2a1be7` passed the unchanged limits: first
  move 10.4 ms, median 1.4 ms, Settings 100.9 ms, input latency 112 ms and
  longest task 83 ms.

- Production responsiveness at `c627209` recorded first move 9.3 ms, median
  2.0 ms and warm Settings 112.9 ms within budget, but input latency 160 ms
  and longest task 209 ms exceeded the unchanged 150/200 ms limits. The slowest
  interaction was Back 10. A CPU-profiled follow-up measured 4.7/1.1/63.8/48/54 ms
  for those five metrics and did not reproduce the failure. No performance code
  changed; retain the uninstrumented failure and profile rather than claiming
  a production performance fix or an uninstrumented passing gate.
- Full verification at `5ed38ed` with two test workers: app/test TypeScript,
  lint, 498 test files and 3,383 tests passed; 78 engine cases are skipped in
  CI. Production build passed. An earlier four-worker run at `ed010b9` had seven timing
  failures; the four affected files passed all 38 cases in isolation before
  the full one-worker run. Timing limits were unchanged.
- Production responsiveness at `5ed38ed` passed the unchanged limits: first move
  8.5 ms, median 1.3 ms, Settings 65.2 ms, input latency 56 ms and longest task
  66 ms. This is a new-build result; retain the earlier `c627209` failed sample
  rather than attributing its variance to a proven performance fix.
- The complete 11-size browser sweep passed at `3ed2511` without other heavy
  checks running. Every native interaction suite passed, including durable
  imports, OGS storage/deduplication, recovery during search, keyboard Retry,
  focus preservation, report guide containment and all existing save races.
- The sweep at `9bfb3dc` ended without a final result after Game Info checks.
  All 11 layouts and the completed import/tag/backup, save-race, scoring and
  tooltip checks passed, but this is an incomplete run. No application failure
  or OOM was recorded; the runner and development server were no longer running.
  Preserve its screenshots/log and establish completion in a subsequent run.
- The sweep at `f00ea17` reached cross-tab Library checks and exited 1: after
  both save promises completed, the final read contained Tab A without Tab B.
  Earlier layouts, save races, scoring, recovery, dialog, notification and lazy
  loading checks passed. An isolated diagnostic preserved both games in both
  storage modes; the full-sweep failure remains unresolved. The helper now logs
  each tab's raw storage and browser lock state alongside the first read.
  A predefined 20-run isolated series and an eight-run series with the sweep's
  desktop Chrome launch settings both preserved both games in both storage
  modes. These controls did not reproduce the failure and are not a storage fix.
- The sweep at `6e033d0` passed cross-tab checks with both stored games in each
  tab, then exited on an outdated OGS menu assertion: Copy SGF now precedes
  Open on OGS where the check expected Download SGF. The assertion now checks
  the actual neighboring item. Follow-up runs exposed and fixed real menu
  timing bugs described below. All 20 remaining native suites subsequently
  passed together against the updated Library, including the new sibling
  metadata checks. This follow-up is recorded separately from a complete sweep.
- The sweep at `01c1af7` passed all 11 sizes and the completed native
  checks through OGS cancellation, including both cross-tab storage modes.
  It exited when the OGS save helper picked a normal game inside the earlier
  ZIP fixture’s collapsed 180-folder hierarchy and tried to click its hidden
  row. The helper now reveals its target through Search. A focused run of
  the ZIP fixture followed by all OGS save cases passed at 1440, 390 and
  320 pixels, including IndexedDB and fallback storage, retries and reload.
  This fixture repair and focused pass do not constitute a complete sweep.
- The later sweep at `2262300` stopped during the 390-pixel Save Copy setup:
  its opening touch stayed a preview and no stone was placed. The unchanged
  isolated scenario passed, including delayed persistence, newer recovery and
  reload. Retain the failed screenshot and timing sample. The helper now waits
  for the visible tap-confirm marker before its confirmation tap and records
  board, focus, dialog and storage state on failure; no gameplay code changed.
- The sweep at `85db473` passed that phone Save Copy scenario, then recorded
  a 15-second navigation timeout in the 320-pixel overlapping-save setup.
  Diagnostics show a new document with an empty app root. Other CPU-heavy
  verification ran concurrently. Its unchanged isolated scenario and the
  complete idle sweep at `3ed2511` passed with the same deadlines. No gameplay
  code changed for this navigation timing outlier.
- Production responsiveness at `2567b0a` passed: first move 11.8 ms, median
  1.5 ms, warm Settings 111.3 ms, p98 input latency 64 ms and longest task 96 ms.
  Before the Settings filter change, `d8ae640` recorded 240 ms input latency;
  diagnostics also reproduced slow Settings focus/layout. A same-build CSS
  override removing its backdrop filters passed at 109.4/72/91 ms for Settings,
  input latency and longest task before the source change was made. The earlier
  build and startup-removal controls still had failures; preventing scroll on
  focus did not improve the result and was not applied. Retain those samples.
  All limits remain unchanged, and failures now include interaction targets,
  input/processing delays and long-task timings.
- Study checks at `948582f` passed all unchanged limits, including 41.5 ms
  folder copy (50 ms limit), 14.2 ms import naming and 49.0 ms nested SGF import.
  Offline checks at `2567b0a` booted the cached app, opened dialogs and completed
  fresh WASM analysis with 25 visits and a visible result, with no dependency
  responses over the network. Deleting the caches prevented navigation.
- Live analysis at `2567b0a` passed: desktop/phone AI Stop 490.3/266.2 ms,
  explicit Stop 337.6 ms, old-request cancellation 924.3 ms, fresh response
  1,576.2 ms and rendered evaluation 1,616.3 ms. Unsaved-game Cancel/Leave/Restore,
  restart and no delayed retry also passed. No engine code changed.
- Earlier production checks at `15ff520`: first move 11.7 ms, median 1.0 ms, warm Settings
  89.5 ms, p98 input latency 56 ms and longest task 72 ms passed their budgets.
  Offline checks completed fresh WASM analysis with 25 visits, a visible win-rate
  result, no dependency responses over the network and a cache-deletion control.
- The first live-analysis run recorded an AI Stop terminal response at 1,610.5 ms
  against the unchanged 1,000 ms limit. An isolated rerun passed: desktop Stop
  210.5 ms, phone Stop 73.0 ms, explicit Stop 81.2 ms, fresh response 957.2 ms and
  rendered evaluation 988.0 ms. No engine code changed; retain the slower sample
  as an unresolved timing outlier, rather than claiming a production fix.

## Changes completed

- **New games open a playable board from every workspace:** setup left desktop
  focus on the page body, while setup and quick starts from mobile Library
  left the new board hidden. Both successful paths now reveal Board on mobile
  and give it keyboard focus after the dialog closes. Desktop panel choices
  are retained; generated-position setup reveals Board without taking focus
  for play. A separate probe found Home disappearing on setup Cancel, so Home
  is restored when its setup or unsaved-game choice is cancelled. Another
  native regression found setup from scoring left scoring active and blocked
  Enter from placing a stone; setup now clears that mode as quick start does.
  All 55 native cases pass in both development and the production build at
  1440×900, 390×844, 320×568 and 568×320: 34 successful routes verify visibility,
  focus and an immediate keyboard move; 21 cancellations retain workspace and
  game. The four Lessons-practice flows also pass. App/test TypeScript, full
  lint, 56 related cases and the build pass (Vite phase 20.3 s). The original
  focus, hidden-board, Home-cancel and scoring failures retain JSON/screenshots.

- **Notification-copy feedback respects newer clipboard actions:** a native
  regression copied error details, opened Settings and copied a model URL,
  then completed the held error copy. The clipboard held the model URL but
  the error's button incorrectly said "Notification copied". Notification
  copy now checks shared clipboard request ownership alongside its existing
  notification-specific counter. All 18 native cases pass at 1440/390/320 px:
  old success/rejection/timeout after a newer URL copy, changed notification,
  a newer notification copy and actual denial followed by native retry.
  Actual clipboard contents and legacy counts are checked. App/test TypeScript,
  full lint, 56 related cases and the build pass (Vite phase 15.3 s). The
  original failed acknowledgement and its screenshot/JSON remain recorded.

- **Denied model-URL copies explain what happened:** failed modern and legacy
  copies previously left the model row unchanged. The affected row now shows
  a persistent inline explanation linked to Copy URL through `aria-describedby`
  and a stable live-status region. Retry clears the error; stale completions
  cannot show it for a newer request. A four-corner hit test also found the
  new explanation clipped below the desktop pane. Settings now scrolls only
  its content pane enough to reveal the message, preserving button focus.
  All 24 native cases pass at 1440/390/320 px and 568×320, checking visible
  feedback, focus, retry cleanup, ordering, expiry and closure. Portrait and
  landscape screenshots were reviewed. App/test TypeScript, full lint, 65
  related cases and the build pass (Vite phase 14.6 s). The original silent
  failure and clipped-message probes remain recorded with screenshots/JSON.

- **Model-URL feedback follows the latest copy and its lifetime:** a native
  regression held URL A's completion, copied URL B, then completed A. The
  clipboard held B but "Copied" moved to A's row. Model-URL feedback now
  checks shared request ownership. A second native regression copied the same
  URL twice one second apart; the first reset cleared the second acknowledgement
  after 1.1 s. A new success now replaces the earlier reset timer, retaining
  the existing two-second duration. Closing Settings clears the timer and
  prevents pending completions from scheduling feedback after unmount.
  All 18 native cases pass at 1440/390/320 px: late success/rejection/timeout,
  repeat-copy lifetime and eventual expiry, current denial/retry and closing
  while pending. Real clipboard contents and legacy counts are checked, with
  only the intentionally denied current copy using fallback. App/test TypeScript,
  full lint and 65 related cases pass. Both original failures, JSON evidence
  and the URL-ordering screenshots are retained.

- **Variation actions name their context for screen readers:** the browser's
  accessibility tree previously exposed just "Copy" and "Keep in tree".
  Their names now identify the variation's starting move and the tree action's
  purpose, while the compact visible labels remain. Native accessibility-tree
  inspection confirms both contextual button names and the existing disclosure
  control. Targeted lint and the production build pass (Vite phase 11.3 s).
  A follow-up correction retains the visible "Keep in tree" words at the start
  of that accessible name for voice-control matching; native accessibility-tree
  inspection confirms "Keep in tree: variation starting at E5".

- **Variation actions are easier to tap:** native measurements found Copy
  at 41×24 px and Keep in tree at 94×24 px on phones. Their controls now
  have a 44 px minimum width/height in mobile panels and on coarse-pointer
  devices. Fine-pointer desktop sizing stays compact. All 15 native cases
  pass at 1440/390/320 px, including copy ordering, failed-copy retry and
  actually keeping the three-move variation without changing the current
  board. Alternate pointer checks verify narrow mouse layouts and desktop
  touch input too. The failing size assertion, before/after geometry and
  screenshots are retained; the 320 px result was visually reviewed. Script
  lint and the production build pass (Vite phase 13.3 s).

- **Variation-copy feedback respects the latest copy action:** a native
  regression held one variation write, completed a second, then rejected the
  first. The clipboard correctly held the variation, but its success toast
  was replaced by the old failure. The candidate list now checks the shared
  clipboard request identity before publishing feedback. Its retry updates
  share an operation identity so a successful retry replaces that failure.
  All 12 native cases pass across 1440/390/320 px: rejection, timeout, a newer
  SGF copy and genuine failure followed by native retry. Actual clipboard
  contents and legacy attempt counts are checked; only the deliberately denied
  current copy uses legacy fallback. App/test TypeScript, full lint and 42
  related cases pass. The first phone fixture omitted the normally collapsed
  Candidates section; opening it through its existing control repairs the
  fixture without changing deadlines. That failed probe is retained.

- **Lessons retain progress from other open tabs:** a two-tab native regression
  reached Capture's exercise in one tab, then finished Atari in the other.
  The second save replaced the entire record and deleted the reached exercise.
  Progress now records bounded, immutable reached-step/completion milestones;
  concurrent or stale snapshots cannot erase another tab's milestones.
  Existing v1 records are read and carried forward, and reached progress clamps
  if a lesson is shortened. Open lesson lists merge peer updates on storage
  events and window focus, retaining local completion and later steps.
  Five regression cases cover stale reads, independent lessons, completion,
  migration, content changes and no-op merges. App/test TypeScript, full lint
  and 22 related cases pass. Native two-tab flows pass at 1440/390/320 px,
  including visible updates and both reloads; the four practice-board sizes
  also pass together with these flows. The initial diagnostic fixture missed
  a resource-timing entry; increasing its recording buffer (as in other native
  checks) exposed the actual failed persistence assertion. Both failures and
  screenshots are retained. Integrated lesson fixtures now clear milestone
  records along with legacy progress and check persisted completion directly.

- **Mobile feedback leaves its focused action reachable:** at 320×568,
  a failed engine-error copy displayed a toast over the Review copy button.
  Mobile-panel notifications now reveal an overlapping focused button by
  scrolling an eligible panel just enough to clear it, when there is room.
  This preserves focus and excludes document scrolling and toast actions.
  The captured Review case moves 37 px and becomes tappable; its original
  failure screenshot and geometry are retained. All 28 native engine-copy
  cases pass at 390/320 px across the board bar and Review panel, now including
  actual touch retry as well as keyboard retry. Focus, hit testing, unchanged
  page position and real clipboard contents are checked. App/test TypeScript,
  full lint and 74 related cases pass.

- **Engine-copy feedback follows the report being displayed:** a native
  regression copied error A, displayed error B, then completed A's held write;
  B incorrectly read "Engine error details copied" while the clipboard held A.
  Both error controls now share a report-aware copy hook, with current-request
  and mounted-report checks. Its copied state records the acknowledged report
  directly, including backend/model metadata. A second regression found that
  a successful retry left its earlier failure toast visible; copy updates now
  share an operation identity so that success replaces that failure.
  All 24 native cases pass across the board bar and Review panel at 390/320 px,
  covering report/model changes, newer copies, rejection/timeout, genuine
  current failure, keyboard retry and leaving/clearing the view. Actual legacy
  attempts are checked: only the deliberately denied current copy uses that
  route. App TypeScript, full lint and 51 related tests pass. Initial unused
  import and effect-reset lint failures are retained; the final state is derived
  from the acknowledged report. The compact touch-retry probe also captured
  a failure toast covering the Review copy icon; keyboard retry works and the
  overlap is addressed separately above, with before/after evidence retained.

- **Lessons lead into a small practice board:** the lesson list now offers an
  always-visible action to open an empty 9×9 board and practice both colors.
  It uses the normal unsaved-game choice: Cancel returns to Lessons, Discard
  retains the stored original, and Save persists the edited Library game
  before replacement. The board receives keyboard focus, and lesson progress
  stays on the device. The existing quick-new-game path now accepts explicit
  board-size/handicap overrides for this action. App/test TypeScript, targeted
  lint and 38 related tests pass. Native flows pass at 1440×900, 390×844,
  320×568 and 568×320, verifying clean opening, cancellation, discard, Save,
  both colors, progress, focus and a visible 44 px action. Phone and landscape
  screenshots were reviewed. This is a practice shortcut; guided play remains
  follow-up work.

- **Fast navigation publishes one final position:** a trusted desktop Back 10
  click previously published ten positions; the regression captured all ten
  while still reaching the expected move. The store now traverses the chosen
  branch before publishing, and toolbar, keyboard, palette and controller
  shortcuts share that action. Comment/setup nodes still count as navigation
  steps; selected branches, position fields and boundaries are preserved.
  Insert-mode take-back retains its existing temporary-node deletion behavior.
  All 43 related tests pass, including six new regressions and 40 randomized
  navigation/editing seeds. All 18 native desktop/phone cases reach the right
  move with one publication for both directions through buttons, shortcuts
  and palette commands. App/test TypeScript and full lint pass. Early probe failures used
  the wrong SGF loader, a malformed selector expression, then a phone title
  selector where the control exposes an accessible name; those diagnostics
  are retained. Production latency improvements have not yet been measured.

- **Older Library copies no longer replace newer success messages:** a native
  browser regression showed that the clipboard correctly held the newer
  game's SGF, but an older rejected copy replaced its success toast with
  "Could not copy SGF." Library copy feedback now checks the same shared
  request as the clipboard write. All 12 native rejection/timeout cases pass
  across desktop and phone widths, using 24 trusted Copy SGF actions and six
  real legacy copies; both clipboard contents and the latest toast persist.
  App TypeScript, targeted lint and all 16 clipboard unit cases pass.

- **Pending Library names are checked when they are saved:** three regressions
  reproduced conflicting names when another tab saved a game or folder after
  a naming dialog opened, including a rename after the peer moved the game.
  Dialogs now use their latest mounted snapshot; edit merging reserves names
  against the current collection inside the storage lock, sharing the existing
  case-insensitive and SGF-extension naming rules. Only added, renamed or moved
  rows receive naming checks; metadata edits preserve existing names. Save
  acknowledgements update the loaded game's title to its resolved name.
  The related 44 tests pass, including independent panel saves and stable
  acknowledged retries. All 18 native two-tab cases pass across desktop,
  390 px and 320 px in IndexedDB and fallback storage, with peer metadata,
  loaded titles and reload persistence verified. The native fixture's first
  attempt blocked on background-tab touch input; a second reached the phone
  Board after loading a game and then looked for a Library control. Both
  incomplete/failed diagnostics are retained. Explicit tab focus and returning
  to Library repair the fixture; no deadlines changed.

Work resumed on 2026-10-25 with another UI and reliability pass:

- **Prepared image copies respect newer clipboard actions:** a PNG waiting
  for its texture could overwrite text or a PNG copied more recently; an
  older text fallback could also overwrite a newer image. Three regressions
  reproduce those contents changing back to the older payload. Clipboard
  writes now share a request across preparation, modern writing and legacy
  fallback. Obsolete prepared images skip the write, and board-copy callbacks
  ignore stale feedback. All 58 focused cases, app/test TypeScript and
  targeted lint pass. Native desktop/phone checks pass 15 mixed-format cases
  using real text reads and decoded PNG pixel hashes; the previous 12 text
  fallback cases also pass with six genuine legacy copies. The first native
  run was interrupted by an environment restart after its desktop cases;
  a later phone fixture needed the control's ARIA label instead of a title.
  Both incomplete/failed samples remain retained alongside the passing run.
- **Late text-copy failures preserve newer clipboard content:** an older
  modern write could reject or time out after a newer copy completed, then
  overwrite it through the legacy textarea fallback. Both cases reproduce
  as actual clipboard contents changing from newer back to older in the
  regression. Only the latest text-copy request may now enter that fallback;
  ordinary current-request fallback still works. All 41 focused clipboard
  and notification cases, app/test TypeScript and targeted lint pass.
  Native checks pass four denial/timeout × newer-modern/newer-legacy cases
  at 1440/390/320: 24 trusted Library Copy SGF actions preserve the real
  native clipboard, including six genuine legacy copies. Stored games and
  the board remain unchanged, and test clipboard contents are cleared.
- **PNG exports include displayed coordinates:** coordinate labels were HTML
  above the canvas layers and disappeared from exports. A native pixel check
  found no coordinate ink for all 18 visible labels on a 9×9 board. Snapshots
  now paint the displayed labels, font and color into their frozen foreground,
  using the UI's actual axis text so rotations stay consistent. Native checks
  pass every 9/13/19 board at 1440/390/320 pixels, all four rotations and the
  coordinates-off setting, while retaining exact pending-export pixels after
  navigation and resize. Compact 19×19 normal/rotated PNGs were reviewed.
  The pixel harness uses measured glyph bounds because J extends outside its
  HTML advance box; its unchanged color tolerance remains two channel levels.
  All 23 focused board/export cases, app/test TypeScript and targeted lint
  pass; the initial missing-label unit and native failures remain retained.
- **Board PNGs freeze the selected position:** snapshot capture awaited a
  texture before copying the live board canvases. A delayed texture success
  or failure reproduced capturing a later move and changed geometry instead
  of the chosen position. Layers and geometry are now copied synchronously;
  texture and fallback color paint underneath the frozen foreground. Both
  delayed-load regressions pass, along with all 15 related cases, app/test
  TypeScript and targeted lint. Native checks at 1440/390/320 preserve exact
  chosen PNG bytes after navigating to another move and resizing; fresh
  exports reflect the later position. Stable output differs from the old
  composition by at most two 8-bit channel levels from alpha rounding.
  Chosen/later phone PNGs were visually reviewed. The first native reference
  fixture tried to draw an empty canvas that the app already skips; fixing
  that fixture yields the passing result without changing product behavior.
- **OS file acquisition respects later choices:** the launch consumer also
  awaited `handle.getFile()` before import ownership began. Holding that
  acquisition reproduced the same later-selected 19×19 game being replaced
  by its older 13×13 file. The launch handler now owns the request before
  acquisition, rejects stale handles before reading bytes, ignores stale
  acquisition failures and stops the remaining batch after cancellation.
  Successful two-file batches still open in order. The original reproduction
  now preserves the exact selected root and never reads the stale file.
  All 54 expanded native cases pass at 1440/390/320 pixels, including the
  prior 36 file cases and acquisition ordering, canceled batches and retry.
  The launch checks invoke the registered OS consumer; actual OS integration
  on installed desktop/mobile apps remains outside this Chrome harness.
  All 90 focused cases, app TypeScript and targeted lint pass.
- **File imports respect later game choices:** a trusted file-picker
  reproduction held a 13×13 file read, selected a 19×19 Library game, then
  released the older read; the file replaced the selected game. Picker,
  dropped-file and launch-file imports now begin the shared text-import
  request before reading game bytes, check ownership/game identity after
  reading and confirmation, and ignore stale failures. The original probe
  now preserves the selected game. All 36 native cases pass at
  1440/390/320 pixels: each file path preserves later Library selections,
  suppresses old failures and permits retry; newer files and paste/file
  ordering retain the exact chosen game. Picker, drop and paste events are
  trusted browser events; launch cases invoke the registered launch-queue
  consumer. The separate acquisition follow-up is described above. All 77
  focused cases, app TypeScript and targeted lint pass.
  Existing clipboard command/draft/cancellation/Library-selection browser
  suites also pass together against the extension.
- **Fallback saves survive renderer storage caches:** two acknowledged saves
  could lose the first game after acquiring consecutive Web Locks because
  Chrome had not updated the second renderer's synchronous localStorage
  cache. A shared Cache Storage snapshot now completes inside the same
  Library lock, with failure rollback and recovery into IndexedDB. The
  restart-verified comparison and complete browser pass are recorded above.
  Service-worker activation preserves the Library data namespace while
  removing obsolete application caches.
- **Bounded graceful browser cleanup:** a controlled Chrome shutdown left
  six zombie children after SIGTERM and two after `Browser.close`. The shared
  check helper now requests browser closure before bounded SIGTERM/SIGKILL
  fallbacks, closes transports/pipes, and releases process listeners. Seven
  lifecycle cases cover failed startup, normal exit, a lost protocol reply,
  both fallback signals and a process that never acknowledges exit. All 37
  related cases and targeted lint pass. A real activated page with a
  before-unload handler closed in 96 ms without a process signal, and the
  production responsiveness check completed successfully through the new
  teardown. The probe still leaves two residual children; this reduces the
  observed leak rather than eliminating every orphan in this environment.
- **Shared text-import ownership:** a trusted browser Ctrl+V event bypassed
  the clipboard-command guard and reproduced the same 19×19 → 13×13 late
  replacement after selecting a Library game. Direct paste, clipboard
  commands and the paste dialog now share one request owner, starting before
  clipboard reads. New requests cancel older reads/downloads; game identity
  is checked before replacement, modal cancellation propagates, and old
  cleanup cannot clear a newer request. Nine unit cases verify ownership,
  cancellation reasons and listener cleanup. Native checks pass eight trusted
  paste events per width at 1440/390/320, including both mixed entry-point
  orders, two queued OGS downloads, Library selection and fresh Retry. The
  test clears its clipboard fixture and resets test-browser permissions.
  Existing command/draft/cancellation/selection suites pass together; all 62
  related unit cases, app/test TypeScript and lint pass. A first phone run
  stopped in backup setup: old identical rows allowed the helper to advance
  before the replacement dialog appeared. Both affected helpers now wait for
  the file input’s processing reset and a committed frame before inspecting
  confirmation. The failed log/screenshot remains retained; no product code
  changed for that fixture issue.
- **A selected game survives earlier clipboard work:** a held clipboard OGS
  download reproduced replacing a subsequently chosen 19×19 Library game
  with its older 13×13 result. Text imports now retain their starting
  game identity and ignore reads, downloads and failures after a different
  game loads. The import checks identity both before and after replacement
  confirmation; its own committed load is excluded from that waiting guard.
  Native checks restore two actual Library records, alternate selection,
  and preserve the exact root/name/board at 1440/390/320 pixels across late
  text, empty results, denied reads, OGS responses and OGS failures. A fresh
  clipboard import still succeeds afterward. Existing command-ordering,
  draft-preservation and all five cancellation paths pass together. The 53
  related unit cases, app/test TypeScript and lint pass. File and image
  import entry points remain separate audit work.
- **Newest clipboard command wins:** two overlapping Paste SGF commands
  reproduced an older 268 ms clipboard read replacing the newer loaded
  9×9 game with a 13×13 game. A new command now cancels its predecessor,
  checks cancellation after reading, and passes its signal through OGS
  loading. Cleanup only clears the controller owned by that request.
  Native 1280/390/320 checks pass late successes/rejections, three overlapping
  reads, canceled OGS signals, responses that ignore abort, stale failures,
  current denial opening the fallback editor, retained drafts and fresh Retry.
  Existing clipboard-draft and five import-cancellation paths also pass.
  All 53 cases in seven related unit files, app/test TypeScript and lint pass.
  The new browser check joins future full sweeps. This change coordinates
  overlapping clipboard commands and is extended to the shared text-import
  paths above. File and image entry points remain separate.
  Its production build passed in 16.8 s.
- **Jump to Library names:** typing the start of a name now focuses a
  matching visible row; repeating a letter cycles through matches and wraps.
  Longer prefixes retain the current match when appropriate. Matching shares
  Search’s Latin-accent handling while preserving marks in other scripts.
  A pause, row action, pointer input or leaving the tree resets the prefix.
  Collapsed and filtered-out rows remain excluded; typing does not select,
  load a game or open a folder. Existing Enter/Space, arrow, menu and nested
  control behavior remains available. Native checks at 1440/390/320 pixels
  pass prefix/cycle, Unicode, expiry, boundary-arrow reset, visible children,
  filtering, focus departure and unchanged board/selection; synthetic
  composition and unbound modified keys remain unclaimed. The existing
  desktop/phone row-control suite also passes after the change. All 60 cases
  in four related unit files, app/test TypeScript and lint pass. The new
  browser check is included in future full sweeps; the complete `f2a1be7`
  sweep above preceded this feature. Its production build passed in 19.2 s.
- **Pasted drafts survive delayed clipboard reads:** a native reproduction
  replaced newly typed SGF with an older clipboard result after a 19 ms held
  read. A revision guard now ignores results superseded by edits, a newer
  read, import, dismissal or switching to Photo Board. Stale denial/empty
  results cannot replace newer feedback. Read Clipboard is disabled while
  import is pending. The new regular browser check passes with native mouse
  and touch input at 1280/390/320 pixels: typed drafts, out-of-order successes
  and failures, ordinary empty/denied reads, import feedback and dismissal.
  Existing pending-import focus, Tab containment, all five cancellation paths,
  retry and OGS username composition also pass. The three related unit files
  pass all 31 cases. A first fixture reused identical text (no change event),
  and another resolved after the clipboard timeout; both fixture issues were
  corrected without changing the 1200 ms clipboard deadline. An early phone
  shortcut setup timed out; setup now waits two frames after the board mounts.
  Earlier failed logs remain retained. Both TypeScript checks and lint pass.
- **Stable Library menus:** Escape from a menu opener reproduced closing the
  whole Library. Menu Escape now runs before workspace shortcuts and yields to
  open dialogs. A held-frame regression also showed autofocus resetting a
  chosen Rename item to New folder; a pointer diagnostic caught Duplicate
  activating instead of Copy SGF with no clipboard call. Menus now take focus
  during layout, before the next input event, preserve an existing choice and
  avoid scrolling. Breadcrumb scroll events no longer dismiss a menu anchored
  elsewhere; scrolling the list or an anchor ancestor still dismisses it.
  Desktop/phone checks cover immediate focus, choices across held frames,
  opener Escape, unrelated/menu scrolling and composition. Three predefined
  Copy SGF repetitions passed across 1440/390/320 widths, then all 20 remaining
  native suites passed together. Earlier failing samples remain retained.
  The 82 focused keyboard, accessibility, clipboard and notification cases,
  both TypeScript checks and lint pass.
- **Complete paged-tree positions:** Library rows now expose their position
  and full sibling count through `aria-posinset` and `aria-setsize`, preserving
  their existing depth. Hidden pages count toward the total, including flat
  search results. The traversal regression verifies independent folder counts;
  native desktop/phone root, folder and search paging checks verify every newly
  revealed position, focus and visibility. Deep-folder checks retain all 1,500
  folders at three widths without changing the board or saved records.
- **Free handicap placement:** a record with `HA[2];B[pd];B[dp]` acquired
  two invented setup stones before replay. The import regression failed;
  authored placement now loads without extra stones or an invented White turn,
  including a move in the SGF root and isolated White passes. Analysis also
  omitted compensation when the initial board was empty: 16 Chinese/AGA
  workflow cases reproduced it. Requests now carry starting move history into
  the count, following the pinned native `computeNumHandicapStones` logic;
  manual counting uses the same calculation. Japanese and other zero-bonus
  rules skip unnecessary counting. Eight workflows across three rulesets,
  native prefix fixtures, loader/rules tests and both real-model compensation
  checks pass (89 cases). App/test TypeScript and lint pass. Native scoring at
  1280/390/320 verifies all existing rules plus Chinese/AGA free placement;
  downloaded SGFs preserve every authored move and pass without setup stones.
  Another 76 import, export round-trip, startup-rules and tree-invariant cases pass.
- **Paste import focus:** starting a held OGS import reproduced focus on `body`
  after Open became disabled. The pending dialog now retains focus and its Tab
  handler; an unsuccessful import returns to the text editor unless the user
  chose another control. Native checks cover Tab/Shift+Tab, every dismissal,
  late responses, successful retry, failed-download focus and an unchanged
  board. A new QA assertion requiring no history marker after reload was removed:
  `overlayBackStack` deliberately leaves markers restored by another document,
  to avoid navigating away. The diagnostic remains in the native report; no
  navigation code changed. The same 67 focused cases, both TypeScript checks
  and lint pass.
- **Copy a saved record:** single-game Library menus now offer Copy SGF without
  loading the record onto the board. The action keeps complete collections and
  uses the same UTF-8 declaration handling as Download SGF. It supports the
  existing modern/legacy clipboard paths, explains denied access, and replaces
  a resolved copy error after retry. Native 1440/390/320 checks use controlled
  clipboard outcomes and pointer/Enter input; they preserve every game/comment,
  restore focus, leave board/storage unchanged and omit the action from folders
  and bulk menus. The focused clipboard/encoding/notification/dialog suites
  passed all 67 cases; app/test TypeScript and lint also pass.
- **Keyboard focus during OGS sync:** a real pending download left focus on
  `body` when the active Sync control became disabled, outside the dialog's Tab
  handler. Pending work now focuses the dialog when focus is lost. Failure
  restores the username field and success offers Done, while preserving any
  other control chosen during the wait. Native 1440/390/320 checks cover these
  transitions, Tab/Shift+Tab containment and durable storage/retry flows. Existing
  desktop/phone Cancel, Close, Escape and Back checks also pass across lookup,
  pagination and download, including late responses and a successful retry.
  Thirty-three focused dialog/sync cases, app TypeScript and lint pass.
- **Expanded deep Libraries:** a 1,500-folder expanded chain reproduced an
  app-wide stack overflow. Visible rows now use iterative depth-first traversal,
  preserving each folder's paging control and complete accessibility depth.
  Visual indentation is bounded so names and controls remain reachable. A
  12,000-folder traversal regression and 27 existing cases pass. Native checks
  at 1280, 390 and 320 pixels verify every row, native parent/child and Home/End
  navigation, collapse/reexpand, row menus, the unchanged board and persisted
  records after reload. The first 390-pixel menu sample timed out after the list
  scrolled; a diagnostic pass succeeded without an additional menu change.
  Retain that failed sample rather than claiming its cause is established.
  Existing desktop/phone keyboard and paging workflows are also checked.
- **Validate backups before replacement:** unrelated JSON objects previously
  became empty folders, invalid entries disappeared silently, and foreign or
  newer-version backups could replace the Library. Restore now rejects those
  files before offering replacement and displays the reason. Normalization
  still repairs supported legacy records, and intentionally empty backups
  remain supported. Nine new regressions and 57 existing cases pass. Native
  desktop/phone checks reject all four invalid backup fixtures without changing
  any stored game, then verify Cancel, normal deletion and empty-backup restore
  across IndexedDB and localStorage, including reload. TypeScript and lint pass.
- **OGS URL import identity:** dropped OGS URLs now retain the source ID even
  when the SGF supplies a descriptive name. Previously a rename/backup round
  trip made a later sync download the same game again. A regression reproduced
  that extra download and now passes with the existing identity/sync suites
  (29 cases). Native desktop/phone checks confirm the source link, persisted ID
  after reload, delayed completion after closing Library and storage recovery.
  App/test TypeScript and lint pass.
- **Open a study's OGS source:** synced games now offer “Open on OGS” in their
  row menu, using the retained ID after rename. The link opens a new tab with
  `noopener noreferrer`, announces that behavior and supports pointer, Enter
  and Space activation within normal menu navigation. Native checks at 1440,
  390 and 320 pixels intercept navigation, verify the exact source URL and
  safety attributes, preserve the game and current location, restore trigger
  focus and omit the action from ordinary files/folders. Existing persistence,
  rename/search, retry and reload checks still pass; app/test TypeScript and
  lint pass.
- **Settings rendering:** profiling found expensive focus/layout work while
  opening Settings. Its full-screen and footer backdrop filters were removed;
  the dimmed board and opaque dialog remain. A controlled CSS override and the
  actual rebuilt source both passed the original responsiveness limits.
  Existing desktop/phone keyboard, composition, backend/theme selection and
  focus checks passed. Production screenshots were reviewed at 1440 and 390
  pixels: both fit with zero overflow, focus inside, and no backdrop filters.
- **OGS identity through rename and recovery:** renaming a synced study made
  the next sync download it again and add another record. Files now retain a
  validated source game ID independently of their display name. Older marked
  filenames migrate on read; rename, SGF edits, JSON backup/restore and Library
  duplication retain the ID, and search can still find it. Already renamed
  records whose IDs were previously lost cannot be inferred from their names.
  A successful retry also replaces its resolved save-error toast, using a
  canonical player/game-batch operation ID; unrelated error batches remain
  distinct. The stale error had covered the phone row despite successful
  persistence. Broader storage/edit/backup cases and targeted identity/notification
  cases pass, along with app/test TypeScript and lint. Native desktop/phone
  checks now rename through the real menu, search by ID, skip the SGF download
  on resync, preserve record count and annotations, clear the resolved error,
  and retain the existing delayed-save, close/reopen and reload proofs.
- **Visible startup:** an entry-script delay left only an empty app root.
  The HTML now supplies a loading status before application code runs, with
  system light/dark colors and reduced-motion support. With JavaScript
  disabled it instead explains how to enable the app. Manual Chrome checks
  held the actual entry request on desktop/phone, inspected the status in the
  accessibility tree, confirmed zero overflow and reduced animation, then
  released the script and reached the board. The JavaScript-disabled check
  showed the instruction and hid the loading status; screenshots were reviewed.
- **OGS deduplication at commit:** a held sync downloaded a game after another
  import had already stored it. The old completion path stored a second copy
  and reported it as added. Commit now checks current game IDs across all
  folders and within the batch, retaining existing annotations and creating no
  empty destination when everything is skipped. The modal counts actual
  committed additions and includes concurrent arrivals in its skipped count.
  Thirty-three focused cases, app/test TypeScript and lint pass; native
  desktop/phone cases preserve another folder's SGF, favorite and tags,
  report the game as already present and retain it through reload.
- **Recovery remains usable during search:** after an initial read failure,
  entering a search replaced the storage error and Retry with “No matches”.
  Loading and errors now take precedence over search results, and storage
  failures are announced as alerts. Retry previously left focus on the page
  body after both success and failure. It now restores a useful row/action or
  the error button, while preserving a search field deliberately selected
  during I/O. Native desktop/phone checks cover filtered/unfiltered empty
  libraries, original SGF, repeated failure, Enter retry, delayed loading,
  retained query and chosen focus. Existing phone save/initialization retries,
  app/test TypeScript and lint pass.
- **OGS sync acknowledges durable saves:** rejected IndexedDB/localStorage
  writes left the modal saying “Added 1 game” and the success toast saying
  “Synced”, while no imported game existed in storage. Sync now awaits its
  shared queued commit, reports storage errors and allows a clean retry.
  During persistence it says “Saving games to library” and offers Close;
  closing the dialog or Library preserves the pending save and its progress.
  The current OGS folder is resolved at commit time and reopened panels receive
  only committed data. Thirty focused cases, app/test TypeScript and lint pass.
  Native desktop/phone checks cover failed writes, one-copy retry, delayed
  saving, Close/Back, closing both panels and reload; existing lookup,
  pagination and download cancellation checks still pass.
- **Retry after a rejected initial read:** with an established IndexedDB
  library and no fallback, the read failed before publishing a snapshot.
  “Retry saving library” then did nothing, even after storage recovered.
  That state now offers “Retry loading library” and starts a new read;
  failures after a valid snapshot retain their save retry. Native checks
  cover repeated rejected reads, restored original SGF, and an intentionally
  empty library on desktop/phone. Existing initialization-save retries still
  pass at 1280, 390 and 320 pixels; 29 focused storage/import cases pass.
- **Import progress and navigation protection:** Library now announces the
  number of pending source files or dropped items, including after reopening
  the panel. Its tree reports busy until reading and persistence finish.
  A temporary before-unload guard protects pending imports and clears on
  success or failure. Native desktop/phone checks dismiss a real navigation
  warning, complete the held import, then navigate without a warning; failed
  storage also clears the progress state. Twelve focused import cases,
  app/test TypeScript and lint pass.
- **Durable imports after closing Library:** a held file read completed after
  the panel unmounted, showed “Imported”, and stored no game. File and dropped
  text/OGS imports now commit through the shared storage queue, reserve names
  against current records and publish only after saving. A reopened panel
  receives the result while retaining its pending edits. Successful committed
  data also clears an initial storage error when no local edits remain. Native
  desktop/phone checks cover closed/reopened panels, an in-flight rename,
  failed storage and same-file retry without duplicates, held OGS responses,
  initial-storage recovery, original SGF and destination preservation, and reload.
  Thirty-seven focused cases pass, including five new service cases; app/test
  TypeScript and lint pass.
- **Report guide keyboard and Back:** Tab escaped the guide to New Game
  behind it. The guide now owns a shared focus trap and Escape/Back lifecycle,
  with explicit return to Guide. Composition Escape stays with the input
  method. Backdrop dismissal runs on click so the browser’s mouse-down focus
  action cannot override restoration. Native desktop/phone checks cover Tab,
  Shift+Tab, background shortcuts, composition, button/backdrop/Escape return,
  Back closing guide before report and unchanged game state. The old source
  test now checks labels rather than claiming that manual focus alone traps
  Tab. Fifty report/modal/focus cases, TypeScript and lint pass. Real PDFs still
  have 12 pages, 10 mistakes and all 24 correction moves on desktop and phone.
- **Move-tree composition:** composition ArrowRight on a tree node advanced
  the loaded game from the root to move 1. Nodes and the minimap now ignore
  composition, legacy key-code 229 and Ctrl/Alt/Meta chords. Native desktop/phone
  checks mount the actual component on a 120-move game, retain game/scroll/focus
  during ignored keys, and verify ordinary node navigation, focus return,
  minimap arrows/Home/End and centering. Twelve existing tree/layout cases,
  TypeScript and lint pass.
- **Library page continuity:** keyboard Show more left the first new row
  offscreen and unfocused; on the final page its button disappeared. The
  action now records the next item and focuses it after those rows mount.
  Native desktop/phone checks reveal every page at Root, within a folder and
  in search, using keyboard and pointer activation, and verify focus, visible
  rows, final-page behavior and an unchanged game. Seventeen keyboard/focus
  cases, TypeScript and lint pass.
- **Library parent/child navigation:** Right enters the first shown child of
  an expanded folder; Left returns to the visible parent, with existing
  expand/collapse actions taking precedence. Root and flat search rows stay
  focused when no parent/child exists. The screen-reader hint describes these
  controls. Native desktop/phone checks cover expansion, first-child/parent
  focus, collapse and flat search behavior alongside the existing row flows.
  Seventeen keyboard/focus cases, TypeScript and lint pass.
- **Backend keyboard endpoints:** Home/End now select and focus the first/last
  available engine backend, matching the theme and tab selectors. Unavailable
  choices are skipped. Native desktop/phone checks retain ignored-key guards,
  verify the selected endpoints and restore ordinary arrow navigation.
  Twenty-five Settings/backend cases, TypeScript and lint pass.
- **Settings choice composition:** composition ArrowDown changed the selected
  engine backend from WASM to CPU. Backend/theme radio groups and Settings tabs
  now ignore composition, legacy key-code 229 and Ctrl/Alt/Meta chords. Native
  desktop/phone checks retain complete preferences and focus during ignored
  keys, then verify ordinary backend arrows, theme Home/End/wrap, tab navigation
  and dismissal. Twenty-nine Settings/theme/backend cases, TypeScript and lint
  pass.
- **Repeat file imports:** choosing the same Library file twice produced only
  one native change event. The chooser now resets immediately after capturing
  a file snapshot, before awaiting initial storage or reading the batch. Native
  desktop/phone checks choose the same path twice, hold a later two-file read
  while the chooser is empty, and verify unique names and every file after
  reload. Seventeen import/focus cases, TypeScript and lint pass.
- **About dialog name:** Chrome announced only “Web KaTrain” because
  `aria-labelledby` took precedence over the intended “About Web KaTrain”
  label. The referenced heading now includes the accessible About prefix.
  Native desktop/phone checks read the actual accessibility name, open About
  from the palette by keyboard, close by button/Escape and restore the original
  board/control. The existing accessibility test now reads the rendered
  referenced heading instead of checking a redundant label; all 15 About/modal
  cases and lint pass.
- **Linear repeated-property imports:** a full verification run exceeded the
  unchanged 5-second import fuzz budget at 8.8 seconds for 20,000 repeated
  setup properties. Both SGF readers used `concat` on every occurrence,
  recopying the growing property list. They now append to their own arrays
  without spreading function arguments. Chrome’s 20,000-property example
  changed from 273 to 23 ms for full parsing and 566 to 14 ms for root reading.
  Ninety parser/fuzz cases pass, including ordered comments/setup stones,
  variation isolation and a 160,000-value group. The full study gate also passes
  with all budgets unchanged. The subsequent full verification passed all
  3,309 tests, app/test TypeScript, lint and the production build.
- **Library row browsing:** Up/Down and Home/End now move focus through
  mounted games/folders without loading them, stopping at either end and
  skipping collapsed descendants and nonmatching search results. Rows expose
  their depth; the tree has a screen-reader keyboard hint. Native desktop/phone
  checks exercise these paths, verify flat search depth, read the real Chrome
  accessibility description, and retain existing controls, menu focus and
  composition behavior. Seventeen keyboard/focus cases, TypeScript and lint
  pass.
- **Bounded diagram rejection:** the broad verification run recorded a
  1,334 ms outlier against the unchanged combined parser fuzz budget. A browser
  profile also showed the diagram reader scanning all 20,000 diagram-like rows
  before rejecting them. It now stops when the non-border extent exceeds the
  largest supported board, while retaining outer dash borders and full 19×19
  positions. Fifty-one diagram/fuzz cases pass, including oversized input,
  largest-board corners and generous border padding. The subsequent full
  verification passed both fuzz suites and all 3,309 tests.
- **Imports after destination deletion:** a held native file read completed
  after its target folder was deleted. Storage rerooted the orphan, but its
  name had been reserved in the deleted folder, producing two identically named
  Root games. Completed imports now resolve existing/batch folders before
  reserving sibling names. Native desktop/phone checks hold the real read,
  delete its folder, then verify a unique Root name, intact existing SGF and
  visibility after reload. Forty-nine focused cases pass, including deleted
  destinations, file IDs, moved folders and nested archive preservation.
- **Save destinations and header-menu Escape:** composition Escape closed both
  Save Copy and panel Save while their destination picker was focused, losing
  the name draft. Both now use the same composition guard as their name inputs.
  The Library header menu also ignored composition and let ordinary Escape
  reach Layout first, closing the entire Library and leaving focus on the page.
  Its own key handler now consumes ordinary Escape, restores More, and leaves
  composition Escape/arrows alone. Native desktop/phone checks preserve names
  and destinations in both dialogs, retain menu choices during composition,
  navigate with real arrows and verify ordinary dismissal/focus return.
- **Library context-menu focus:** Escape removed the focused menu item and
  left focus on the page. Menus now retain their row/More opener and restore it
  before dismissal or running an action, so Rename can also return there.
  Composition Escape leaves the menu open. Native desktop/phone checks verify
  folder/file More openers, Rename cancellation and Shift+F10 row return; the
  existing keyboard/focus cases, TypeScript and lint pass.
- **Library nested keyboard controls:** Enter on a folder’s More button opened
  its folder instead of its menu. Row key handlers now act only when the row
  itself owns the event; nested native buttons keep Enter/Space activation.
  Composition, legacy key-code 229 and Ctrl/Alt/Meta chords cannot activate rows.
  Native desktop/phone checks operate Select, More and expansion with both
  keys, verify that the board/path stay unchanged, and retain direct row loading
  and Shift+F10 menus. Fourteen existing keyboard/focus cases and lint pass.
- **Stable Recent ordering:** equal-time games appeared in backup order before
  reload and IndexedDB key order afterward. A controlled archive changed
  “1, 2, 10” to “10, 2, 1”. Recent sorting now breaks timestamp ties with natural
  names and then stable IDs, shared by folder rows, search results and Recent
  cards. Truly newer changes still come first. Native desktop/phone checks
  restore the controlled archive, reload it, search it and verify Name/Move
  sorting too; collection extraction now also checks its visible order after
  reload. Sixty-three focused library cases pass, including two new Recent-card
  cases for shuffled/key order and matching titles across folders. The study
  benchmark measured 10,000 equal-time records in 42.2 ms (250 ms budget).
  That run exceeded the separate unchanged 50 ms deep-folder-copy budget at
  52.6 ms. A subsequent isolated full study run passed all unchanged budgets,
  with Recent sorting at 35.7 ms and deep-folder copy at 28.6 ms.
- **Visible command selection and reliable filtering:** arrowing down a long
  palette list selected a row at y=1456 while its visible list ended at y=760;
  `aria-activedescendant` did not scroll it. Selection and query changes now
  bring the active result into view without moving focus from search. The
  browser check also reproduced a filter race: after moving down 25 rows, a
  shorter result set selected its last match because separate reset/clamp
  effects overwrote each other. Query and selection now update together.
  Native desktop/phone checks verify deep selection visibility, first-match
  selection after filtering, search focus, Tab routes and dialog handoffs.
- **Command palette Tab order:** its unfiltered results added 99 enabled Tab
  stops even though the search combobox already selects them with arrows and
  Enter. Result options now stay out of the Tab order. Native desktop/phone
  checks retain input focus while arrowing, cycle directly through Search,
  Clear and Close with Tab/Shift+Tab, activate Clear with Enter without running
  a command, and still run a selected command from search. The existing dialog
  handoff checks continue to restore the original control after closing.
- **Command-to-dialog focus:** closing Settings after opening it from the
  command palette lost the board/control where the user started. The next
  dialog captured a temporary palette input or item that then disappeared.
  Commands now restore the connected original opener before closing the
  palette and running. Native desktop/phone checks open Settings, lessons and
  keyboard help from both the board and a persistent header control, use
  pointer and keyboard activation, close by button/Escape, and verify return
  to the exact original element. Direct palette dismissal still restores it.
  Forty-four focused command-palette and dialog cases pass.
- **Problem Practice keyboard flow:** a correct keyboard answer left focus
  on a board that no longer accepted answers. Success now focuses the next
  problem when available; a failed line or final problem focuses Retry.
  Advancing, retrying and a completed opponent reply return to the interactive
  board. Retry creates a fresh keyboard cursor. Native desktop/phone checks
  import two recorded problems, solve by keyboard, follow the real opponent
  reply, retry the last problem, show its solution, try a wrong variation and
  verify the loaded game's position never changes. Thirty-six focused problem,
  study rendering, board and dialog tests pass.
- **Finishing note edits:** Escape from the note editor left focus on the
  page body; the next Tab could toggle analysis instead of navigating controls.
  Explicit Save/Cancel now restore focus after the replacement UI mounts: Edit
  for a saved note, or its Add a note prompt when empty. Passive draft flushes
  and node changes do not request this focus. Native desktop/phone cases cover
  Enter saves, Escape cancellation, pointer Save/Cancel, clearing a note,
  immediate re-entry and Tab/Shift+Tab. The complete note recovery/browser
  checks still pass for reload, pagehide, Save Copy, clipboard/share, tab/resize
  retention and trusted replacement.
- **Accessible empty states:** rendered checks found that the empty note's
  visible “Add a note” prompt was replaced by a different accessible label,
  hiding its instructions. Its button name now comes from the visible text.
  Its custom Enter/Space handler also ignores composition and Safari key 229;
  a browser reproduction previously opened the editor and consumed the key.
  Loading, empty and no-match Library views now use a group rather than an
  ARIA tree without tree items; loading is marked busy. Native desktop/phone
  checks inspect Chrome's actual accessible note name, keyboard activation,
  loading, no matches and restored trees. Four IndexedDB/fallback cases also
  retain the correct empty semantics after delete, import, backup restore and
  reload. Twenty-nine focused existing accessibility/editor tests pass.
- **Proven offline inference:** the offline gate previously checked engine
  analysis only online. It now requires a successful fresh-position worker
  result and rendered win rate after the offline reload. A fresh Chrome
  profile and disabled HTTP caches remove disk-cache shortcuts; page and SW
  targets are offline, and the server refuses every response after cutoff.
  New inference workers attach before execution and have HTTP caching disabled
  (Chrome does not support direct offline emulation for these targets). Only
  browser SW-update probes may attempt the server, where they receive 503.
  After the positive checks, deleting app caches must make navigation fail.
  The production gate passed with 25 fresh visits, zero dependency responses
  from the network, cached dialogs and a passing negative control. This covers
  the bundled WASM model after one online analysis, without COOP/COEP headers.
- **Repeatable Guess the Move practice:** revealing an answer removed its
  focused button and left keyboard focus on the page body. Reveal/guess now
  focuses Next, and advancing returns to the board with a fresh cursor. Results
  are announced as a polite live status. After the final answer, Start again
  restarts the selected player filter and clears the score. Native desktop and
  phone checks import a real three-move SGF, reveal and advance by keyboard,
  grade an exact guess, restart with reset score/cursor, repeat a one-move
  filtered drill and verify that the actual game position stays unchanged.
  Forty-one focused guess, rendering, dialog, board and AI-cancellation cases pass.
- **Recovery/AI browser fixture:** the analysis gate first recorded a 1.9 s
  AI Stop outlier. Its next run exposed a separate fixture bug: after recovery,
  Tab was dispatched from the focused desktop Analyze button, where it
  correctly navigated controls instead of leaving analysis mode. The following
  phone AI request was repeatedly preempted by that unintended analysis.
  Cleanup now sends the shortcut from the page, verifies analysis mode is off,
  and each AI case checks its own layout before starting. Diagnostics retain
  cancellation dispatch times, batch size and search budget. The corrected
  gate passed unchanged latency limits: AI Stop 110 ms desktop / 40 ms phone,
  explicit analysis Stop 178 ms, obsolete-position cancellation 271 ms, and
  fresh-position display 652 ms. Both layouts also pass no-retry, fresh move,
  Leave/Cancel, recovery and restored-rules checks. No engine algorithm or
  timing threshold changed.
- **Settings opening layout:** production timing runs missed the 120 ms
  dialog budget (130 ms on one run); a fresh run passed it at 110 ms but missed
  first-move and long-task budgets. Profiling identified the initial tab's
  `scrollTop = 0` layout effect as a forced-layout path even though a fresh
  scroller already starts at zero. That write now runs only when the tab
  changes. The next production gate passed all unchanged budgets: first move
  4.75 ms, median 0.96 ms, warm Settings 83.6 ms, INP p98 48 ms and longest
  task 73 ms. Native desktop/phone shortcut checks now first scroll General,
  Engine and General again and require each next tab to start at the top.
  Forty-eight focused settings/focus cases and the production build pass.
- **Photo trace keyboard navigation:** a 19×19 trace exposed 361 Tab stops.
  It now has one entry point, starting at the centre, with arrow navigation,
  edge wrapping, row Home/End, and Control Home/End for board corners. Enter
  and Space still apply the selected tool. Pointer selection updates the Tab
  entry; a point outside a smaller board falls back to its centre. The group
  describes its keyboard controls for assistive technology. Tool shortcuts
  and alignment arrows ignore composition and browser modifier chords. Native
  desktop/phone checks cover navigation, activation, Tab exit/re-entry, pointer
  selection, all board sizes, and retained size-editor focus. The recognition
  race checks still cover trusted taps, retries, source changes and failed
  selections; alignment comparisons now wait for visible image geometry after
  a phone tab switch, rather than snapshotting hidden zero-size corners.
- **Board input-method keys:** composition Enter placed a real stone on the
  main board and submitted an answer on the shared study board. Yielding from
  the main board also exposed the global AI-move shortcut, which still matched
  composition keys. Both boards now ignore composition (including Safari's
  final key-code 229); shortcut matching uses the same input-method guard as
  recording. Modified study-board keys remain available to browser/app
  shortcuts. The raw scoring/focus Escape handlers also retain their mode
  during composition. Native desktop and phone checks verify unchanged stones,
  answers and cursors, no composition-triggered dialogs/modes, retained focus
  and scoring, and ordinary Enter/Space/arrows/Escape afterward. Existing
  shortcut cases now check matching as well as recording; 70 focused tests pass.
- **Reach every game in a collection:** a Library collection's actions menu
  now offers Split collection. It creates a numbered sibling folder, preserves
  each raw game's comments, variations, setup stones and passes, and keeps the
  original record intact. New files inherit favourites and independent tag
  arrays; sibling-name collisions receive a suffix. Search and filters clear
  so the expanded destination is visible, with focus returned to search.
  Incomplete collections and non-Go games add nothing; extraction is capped at
  10,000 games. Eighteen focused cases and native desktop/phone checks cover
  exact content, metadata, names, loading game two, reload and rejected input.
  Creating 10,000 two-move games measured 181 ms in Chrome, excluding UI and
  persistence. The browser check also reproduced an existing menu bug:
  scrolling its 417-pixel contents inside a 298-pixel viewport closed it.
  Menu scrolling now stays open; surrounding scroll still dismisses it.
- **Library action focus:** dismissing OGS Sync left keyboard focus on the page
  body because its opener was a menu item that no longer existed. Header-menu
  actions now focus the persistent More control before opening a dialog or
  picker. The shared focus hook can then return to that control. Native
  desktop and phone sync checks verify focus after Cancel, Close, Escape,
  Back, and successful Done, alongside request cancellation and exact imports.
- **Cancel the entire OGS sync:** cancelling a held player lookup closed the
  dialog but did not abort its request. Its late response remembered the
  username and started fetching game-list pages after dismissal. Sync now
  passes an AbortSignal through lookup, pagination, and SGF downloads, and
  invalidates the current request synchronously on Cancel/Close/Escape/Back.
  Late results cannot change preferences, enqueue more work, report stale
  progress/errors, or import games. The existing cancellation callback API
  also rejects an in-flight SGF completed after cancellation. Six unit cases
  cover each pipeline phase and late bodies; native desktop and phone cases
  cancel held lookup/page/SGF responses and verify no further requests or
  library additions, then successfully retry and persist the expected SGF.
- **Custom bot settings:** changing Sprout's advanced rank from 18k to 4k
  left its 18k preset card highlighted. Manual strategy-setting changes now
  clear the preset selection; choosing a preset applies its configuration
  without clearing itself. Changing only the AI's colour preserves the chosen
  bot. Native desktop and phone checks type a custom rank, retain editor focus,
  verify the old highlight clears, select another preset through trusted input,
  and confirm cancelling still preserves the actual game.
- **Keyboard bot selection:** all 12 bot cards were separate Tab stops and the
  radio group ignored arrow keys. The group now has one Tab stop at the chosen
  bot (or the first card), supports wrapping arrow navigation and Home/End,
  and moves focus with selection. Tab exits the group; Shift+Tab returns to
  the chosen card. Composition and browser modifier chords leave selection
  alone. Native desktop and phone checks exercise every navigation key, both
  wrap directions, pointer selection, focus re-entry, and cancelling the draft
  setup without changing the actual game. SSR checks retain one Tab stop for
  both an unselected roster and a selected expanded card.
- **Score quiz input:** blank and negative margins silently became zero or a
  positive guess, and input-method Enter (including Safari key-code 229)
  started an evaluation. The quiz now requires a finite margin of zero or more,
  explains invalid input beside the field, and leaves composition keys alone.
  Ordinary Enter still submits a valid guess; an explicit zero is accepted
  and a level score is graded correctly. The real-dialog engine-client check
  covers invalid values, composition, zero-point grading, duplicate submission,
  random-position changes, stale success/error replies, and close/reopen on
  desktop and a 320-pixel phone viewport.
- **Shortcut editor focus:** Cancel and Reset Defaults left focus on the page
  body when their inline confirmation disappeared. Cancel now returns to Reset
  All; confirming returns to search. Conflicts are announced, scrolled into
  view, and focus their safe Cancel action. Cancel and Replace return to the
  edited command, while disabling or resetting a command restores its Record
  control. If a filter removes that row, focus falls back to search. Escape
  dismisses the inline question before Settings, while composition Escape
  leaves it alone. Native desktop and phone checks exercise actual recording,
  both Cancel paths, Replace, reset, immediate typing, and resetting the only
  matching edited row while another customization keeps the filter active.
- **Offline dialog retention:** the production offline gate reproduced missing
  Tsumego Frame and Paste SGF bundles after one online visit. Their imports
  could finish after the initial service-worker report; reporting each completed
  bundle exposed a second bug, where the next boot's partial first-paint report
  pruned previously cached dialogs before they were requested. Resource
  observation now reports late imports, cache reports run in order, and shell
  cleanup retains up to 100 recent script/style entries while protecting the
  reported and entry bundles. Unit cases cover late handoff, blocked observer
  APIs, overlapping reports, partial startup reports, and a 120-bundle backlog.
  The strengthened production gate resolves the real recovery prompt, boots
  with both page and worker offline, and opens both affected dialogs with zero
  failed requests. Engine analysis remains verified online by this gate.
- **Photo trace consistency:** holding recognition while switching from 19×19
  to 9×9 let the old result restore 361 trace points under a 9×9 selector.
  Recognition now validates its request before changing the grid, status, or
  busy indicator. New photos, size/alignment/sensitivity changes, manual edits,
  Clear, transforms, and current-board setup invalidate older results. A late
  request cannot clear a newer retry's busy state. Unsupported replacement
  formats and preview URL failures retain the previous photo and corners.
  Native desktop and phone checks hold actual image load callbacks, exercise
  size/manual/retry/clear/sensitivity/source/alignment changes, and verify both
  failed-selection paths preserve the source. Phone checks use the visible
  Menu import action; the old smoke fixture clicked a hidden Tools duplicate.
- **Photo trace taps:** a trusted phone tap placed a stone on pointerdown, then
  its delayed click toggled the stone away after the zero-delay suppression
  timer expired. The pointer's click now remains suppressed until it arrives;
  keyboard and assistive clicks still activate normally. Native tap and real
  Enter/character-event checks verify a single tap paints once and keyboard
  activation can remove and replace that stone on both viewport types.
- **Truthful model storage status:** a held upload displayed “saved” before
  IndexedDB accepted it, and failed persistence kept the same claim. Uploaded
  weights now expose live saving, saved, and session-only states. Settings
  subscribes to that state so saves begun through the main file loader also
  update an open dialog without changing the selected URL. The compact status
  shows a saved timestamp only after success and announces changes accessibly.
  Subscriber checks and native desktop/phone tests cover a held write, confirmed
  save, and rejected persistence with still-readable session weights. Phone
  screenshots verify both pending and failure status within the model card.
- **Model save ordering:** holding an older upload's database open let a newer
  upload save first, then overwrote its stored bytes and metadata when the old
  request finished. The selected URL read B while reload would restore A.
  Model writes and deletions now use one ordered queue with a shared browser
  lock, and selection revisions invalidate stale writes, restores, and UI
  acknowledgements. A new upload stops advertising the previous file as the
  selected persisted weights until its own save completes. Unit cases cover
  newer uploads, clearing during save, save after deletion, stale restoration,
  and failed-write retry. Real desktop and phone file-input checks hold
  IndexedDB, choose a second file or Clear Upload, then reload to verify the
  newer weights or cleared selection survives with matching metadata.
- **Cancel model downloads:** pending Download & Load now offers Cancel and
  aborts on Settings dismissal or a different model selection. Cancel restores
  focus to the enabled download control. Request identity and AbortSignal
  checks reject late responses, preserve a newer retry, and suppress stale
  progress or errors. Once the bytes arrive, a distinct Saving state prevents
  offering cancellation after the model has already been selected. The idle
  label says “Saves in browser” rather than claiming every optional network is
  already saved. Unit cases cover signal forwarding, pre-cancellation, late
  non-cooperating fetches, and cancellation while streaming. Native checks on
  desktop and phone exercise Cancel, retry, Escape dismissal, changing weights,
  late responses, and successful download persistence; screenshots verify the
  progress and Cancel controls fit the narrow card.
- **Failed model replacement:** starting Download & Load revoked the selected
  browser upload before fetching its replacement. A 503 left the old URL in
  Settings but made it unreadable and cleared its metadata. Download now keeps
  the old weights until a replacement is ready. Upload and persisted-model
  restore also allocate their new object URL before releasing the previous
  one. Native desktop and phone checks cover HTTP and CORS failures, failed
  upload and restore URL allocation, unchanged stored bytes and metadata, and
  successful replacement with persistence and old-URL cleanup. The fixture
  verifies browser file handling, not the validity or strength of model weights.
- **Shortcut recording and input methods:** composition Enter and Escape
  consumed recording, while an IME Process key was persisted as a shortcut.
  The recorder now lets composition finish and keeps waiting for a real chord;
  Process, Dead, Unidentified, and Compose keys are not bindings. Shared key
  utilities cover browser and React events, including Safari key-code 229.
  Native desktop and phone checks verify ignored events leave both overrides
  and recording intact, then record a real Ctrl+Shift+F9 chord and cancel a new
  recording with ordinary Escape while keeping Settings open.
- **ZIP path limits:** a supported hierarchy of 180 folders, each with a
  96-character Unicode name, produced a ZIP reporting one game while reopening
  the archive yielded zero games. ZIP filename and extra-field lengths are
  16-bit values; JSZip silently overflowed those fields. Export now validates
  UTF-8 path lengths, including directory slashes and Unicode path fields,
  before generation. Library, folder, and selection exports explain the limit
  and recommend a JSON backup. Boundary tests round-trip valid ASCII and
  Unicode names and reject the first invalid lengths. Native desktop and phone
  checks verify that all three controls offer no corrupt download, while the
  JSON backup retains all 180 folders and the exact SGF.
- **Lesson progress:** the lesson list now shows completion and resumes an
  unfinished lesson at its furthest reached step. Completed lessons replay
  from the beginning. Returning to the list focuses and reveals the selected
  card. A progress strip and a direct All lessons control clarify navigation;
  the four-card list fits a 568×320 landscape screen. Unit checks cover stored
  data validation, blocked storage, completion, and reviewing earlier steps.
  Browser checks exercise resume, mandatory answers, completion, and focus;
  a separate pointer pass verified completion after reload.
- **Save before replacement:** a pointer move made while a library save was
  delayed reproduced a third move remaining unsaved while New Game still
  opened. Replacement now checks that the original game is still current and
  that Save left no newer changes. The reproduced workflow now keeps the
  third move and its recovery copy, and explains why replacement stopped.
- **Text composition:** an Enter key with `isComposing: true` on Save Copy
  submitted a game, and composition Escape dismissed the command palette.
  Input-method keys now leave text fields and search controls in charge of
  composition, including Safari's final key-code-229 event. The shared dialog
  Escape handler also respects composition. Browser checks verify these keys
  neither save nor close the relevant dialogs.
- **Bulk library copying:** copying 5,000 selected games took 6,166 ms in a
  real Chrome utility probe. The action now indexes the library and reserves
  copy names once, shares a subtree copier with single-item duplication, and
  assembles the resulting list once. The same probe measured 52 ms afterward.
  Tests cover 10,000 copies, case-insensitive per-folder name collisions,
  independent metadata, and cyclic ancestors. `test:study` now includes a
  10,000-game copy with a 500 ms operation budget (176 ms in the recorded run).
  Real desktop and phone Duplicate selected controls produced 10,000 stored
  games with every original, SGF, favorite, and tag intact. Those dev UI passes
  took 711 ms and 433 ms to paint respectively; storage and rendering still
  add work beyond the utility timing.
- **Hover details clear the variation:** [issue #17](https://github.com/Sir-Teo/web-katrain/issues/17)
  remained reproducible: a 240×234 px statistics card covered the variation
  despite empty space beside a 1440×900 board. Hover cards now render in the
  surrounding board stage and choose a nearby side margin when it fits. Their
  measured height keeps the normal placement for cards that cannot fit there,
  and clamps that fallback vertically. Browser checks cover both margins,
  compact and short desktop layouts, all statistics/PV text, and resizing.
  The same positioning is shared by played-stone details.
- **Report PDF pagination:** [issue #18](https://github.com/Sir-Teo/web-katrain/issues/18)
  reproduced as 24 pages for a report containing ten mistake diagrams. The
  large board and its 24-move correction were stacked, spilling each mistake
  onto a second page; hidden app chrome also occupied print-layout space.
  Correction pages now place the board and sequence side by side on one
  landscape sheet. The screen header and hidden app layout leave the print
  flow, and page margins no longer accumulate between sheets. Board images
  include row/column coordinates and the report explains both move markers.
  The same fixture now produces 12 pages (two summary pages and ten complete
  correction pages). `test:report` exports actual PDFs from desktop and phone
  layouts and checks both page counts and every diagram/24-move sequence.
- **Default board offline:** the production offline check booted without its
  Hikaru texture and both stone SVGs. First-paint requests preceded service
  worker control, and the precache still listed only the old common overlays.
  The three default-theme SVGs are now precached. A shared default-theme
  constant lets the install test check the real theme's complete image list.
  The production check now also verifies the initially used theme images
  before cutting the network. It caches 45 entries instead of 42 and boots
  with no failed request when both page and service worker are offline;
  analysis is still verified online by that harness.
- **Folder paths on phones:** opening six nested collections with ordinary
  descriptive names made the breadcrumb trail 284 px tall at 390×844 and
  pushed the saved game behind the bottom navigation. The trail now scrolls
  horizontally, identifies the current folder for assistive technology, and
  brings it into view. The same path is 44 px tall and the list begins 340 px
  higher. Trusted touch and Tab checks retain all ancestors, parent navigation,
  and the root control. Parent lookups also reuse the existing item index
  instead of scanning the collection once per ancestor.
- **Accurate SGF size notices:** importing a supported game with `SZ[5]`
  inside its comment incorrectly announced an unsupported board. The notice
  now shares a root-property reader with library metadata, so comments, child
  nodes, and later games cannot supply its board size. Whitespace, old FF[3]
  identifiers, escaped brackets, and line continuations follow the parser's
  rules. The same reader also joins continued player names before displaying
  and searching library metadata. Unit cases and actual file-input imports
  cover supported, unsupported, continued, and collection headers.
- **Cancel pending imports:** closing Paste SGF during a delayed OGS download
  still let the response replace the board afterward (19×19 became 9×9 in the
  browser reproduction). The dialog now aborts its request on dismissal or
  switching to Photo Board. Downloads reject late canceled responses and the
  final replacement checks cancellation again after any save confirmation.
  Browser coverage verifies Close, Escape, Cancel, mobile Back, Photo Board,
  and a fresh successful retry. The OGS username field also ignores Enter
  used to confirm text composition; ordinary Enter still starts a sync.
- **Game Info cancel/commit:** pressing Escape after typing a different komi
  or handicap committed that draft through the synchronous blur handler.
  Typing 25 then Escape changed komi from 6.5 to 25; typing 4 then Escape
  added four handicap stones. The blur handler now recognizes cancellation
  before reading its prior draft. Komi also shares New Game's parser, so a
  blank, invalid, or out-of-range draft restores the existing value instead of
  clearing komi to zero. Trusted browser input covers Enter, Tab, Escape,
  composition, real zero/negative values, and unchanged undo history/stones
  when an edit is canceled.
- **Search recovery:** a filtered library now identifies its actual scope as
  All folders instead of displaying the active folder as though search were
  limited to it. Empty results explain active filters and offer Clear search
  and filters. A touch check at 390×844 combined text, favorites, and a tag,
  then verified that the 44 px reset control clears all three, restores the
  same nested folder, and returns focus to search.
- **Metadata before replacement:** a trusted drop while Black's name was
  being edited loaded the new game, then the old field's blur overwrote the
  imported player. Replacement now finishes the focused Game Info edit before
  checking for unsaved work, so it belongs to the original game's Save/Discard
  decision. It finishes it again after a save, covering metadata typed during
  a delayed IndexedDB operation. Browser checks cover player/komi/handicap
  drafts, Cancel, Discard, imported values after blur, and the newer player
  remaining in the game and recovery while replacement is blocked after Save.
- **Folder-only ZIP exports:** the ZIP utility preserved empty folders, but
  all three UI export paths rejected an archive with no SGFs. Folder counts
  now distinguish an empty library from a useful folder structure. Library,
  selection, and single-folder controls download that structure and describe
  it accurately. Real phone controls produced archives containing three
  folders, a selected two-folder hierarchy, and a single empty folder; unit
  round trips preserve names and parent relationships.
- **Numeric text composition:** composition Enter in Move number jumped from
  move 3 to move 1 and blurred the field on both desktop and phone. The live
  visits editor also blurred on composition Enter and closed on composition
  Escape. Numeric move/branch/depth handlers now use the existing composition
  guard, including the phone sheet's capture handler and Safari's final
  key-code-229 event. Trusted browser edits verify unchanged position/depth
  and retained focus during composition, followed by ordinary Enter committing
  and ordinary Escape dismissing the relevant controls.
- **Accessible field/count details:** Game Info now labels each rank with its
  player color. The library result/selection count exposes a polite, atomic
  status region and uses the singular item when appropriate. Chrome's actual
  accessibility tree reports Black rank, White rank, and the count's live/
  atomic properties; the existing field and toolbar checks also pass.
- **Identifiable printed kifu:** hiding the screen controls also removed all
  player and game context from the printed diagrams. Each printed page now
  repeats a compact player/rank header and the available event/title, date,
  size, rules, komi, and result. The preview layout stays compact. An actual
  296-move PDF retains six pages, with the names and details present on every
  page; its rendered first page was also inspected.
- **Pro-game header identity:** automatic pack labels still used a broad
  property regex, allowing comment examples or later games to provide a
  player's name or source. Pack descriptions now share the root-property
  reader and decode old identifiers, whitespace, and continuations correctly.
  Curated titles remain authoritative, and filenames matching inherited
  object keys cannot be mistaken for curated records. The reproduced header
  failures and all six pro-game suites pass.
- **Focused metadata on reload/hide:** a native reload while a player name
  was being typed left without warning or recovery. Navigation checks now
  finish the active metadata edit before testing for unsaved changes, and
  pagehide/hidden-page writes do the same. Recovery tracks the written tree
  version, so an earlier debounce cannot suppress a later focused draft.
  Browser checks cancel and accept the native reload, restore the typed
  player, then verify synchronous komi/handicap snapshots after the previous
  auto-save debounce has already run.
- **Paper diagrams and clear coordinates:** kifu previews/exports use white
  boards, solid stones, and outlined white stones instead of a page-filling
  wood surface. The 296-move PDF remains six pages and shrank from 632,167
  bytes to about 460 KB. Inspecting its final diagram also exposed coordinate
  labels touching edge stones: actual SVG bounds counted 9 and 10 overlaps on
  the last two pages. Static-board coordinates now use more of their existing
  outer margin, producing zero overlaps on all six diagrams. The existing
  touch-scroll probe now occupies every edge and checks coordinate clipping/
  overlap in wood and paper styles at 320×568 and 568×320.
- **Matching pro-game detail chips:** the catalog detail reader also treated
  text before the first move as metadata, including comments and intervening
  non-move nodes. It now reads only the root, using the same parser as pack
  titles. Reproduced cases verify escaped/old-style properties, correct result
  and ranks in search, absent root fields, and an uncurated game named
  constructor receiving no inherited editorial function. All seven related
  suites pass.
- **Accurate pro-game final positions:** the preview replayed only a flat move
  list, losing setup/clear nodes and retaining legal New Zealand self-captures.
  It now walks the first variation's nodes, applies AB/AW/AE edits (including
  ranges and pass-node edits), and removes legal multi-stone self-captures
  according to the record's rules. Reproduced setup/pass/suicide cases pass,
  and real preview SVGs match the boards opened by Load & study for both an
  edited position and a New Zealand record.
- **Search names as typed:** Latin accent variants now match across library,
  pro-game, command, Settings, and keyboard-reference searches without changing
  stored/displayed names. Native phone input finds Jōseki/Éloïse from joseki/
  eloise, while Japanese voiced marks and Korean text remain distinct.
  Library query terms are computed once for the list. Phones mount 30 rows
  per batch, desktops 100; Show more and Select all still cover the complete
  result set. A 5,000-game touch fixture verifies 60 mounted rows after Show
  more and all 5,000 selected, then a new query starting at scrollTop 0 rather
  than the former 156 px offset. A frame-based dev probe measured 138/70/82 ms
  for three phone queries; these are not production INP measurements.
  `test:study` adds a 100 ms budget for 5,000-game accent matching (18 ms in the
  recorded run). The related 106 unit cases and both type checks pass.
- **Reachable nested save confirmation:** loading a pro game over an unsaved
  game put Save/Discard behind the pro-game browser at the same stacking
  level. Pointer hit testing found the game picker above the confirmation,
  and Escape closed the picker while leaving the question open. The
  confirmation now sits above workflow dialogs and claims Escape in capture,
  preserving the underlying picker on Cancel. Native desktop/phone checks
  cover every button's reachability, Escape and footer Cancel, focus return,
  composition Escape, mobile Back, and Discard loading the full chosen game.
- **Clear pro-game searches:** an explicit clear control restores the catalog
  and returns focus to search. It meets the 44 px phone touch target, replaces
  the browser-dependent search decoration, and announces the filtered count.
  Input uses the existing 200-character search limit; long unmatched words
  wrap within the empty state. Native checks pass at 1440×900, 320×568, and
  568×320, including list restoration, focus, and horizontal overflow.
- **Keep typing after clearing a search:** the command palette and keyboard
  reference dropped focus to the page body when their clear button disappeared.
  Both now focus their search input explicitly. Native desktop/phone checks
  reproduce the original focus loss and verify immediate typing after clearing.
- **Fast numeric library sorting:** each name comparison repeated locale setup,
  costing 681 ms to sort 10,000 names and 741 ms to build 10,000 sibling folder
  destinations in Chrome. A shared numeric collator retains the same ordering
  and measured 56 ms / 79 ms in the corresponding probes. Regression cases
  compare numbers, leading zeros, case, accents, and non-Latin scripts with
  the prior comparator. Native phone Name sorting and Show more preserve
  Games 1–60 from a shuffled 5,000-game library. The study benchmark now gives
  both wide-folder ordering and numeric sorting a 250 ms operation budget.
- **Keep unfinished notes when leaving or saving:** a native reload silently
  dropped an open note without warning or recovery. Pending note editors now
  contribute their live value to reload/pagehide checks, guarded replacement,
  SGF downloads, and Library saves. Their node identity prevents an old draft
  from overwriting an imported game. Native desktop/phone checks cover canceled
  and accepted reloads, Restore, later pagehide snapshots, ordinary Escape,
  persisted Save Copy, and trusted-drop Cancel/Discard. Unchanged editors stay
  clean. The desktop dashboard also now receives edit-note requests: C and
  the palette open the comment section, and C leaves focus mode to reveal the
  editor. On phone, avoiding a redundant editor reset prevents development
  effect replay from canceling a first-mount edit request.
- **Keep notes across phone tabs and shell changes:** switching from Info to
  Board and back replaced a typed draft with its older saved text. The editor
  now preserves its own node's live textarea before unmounting. Native checks
  cover tab switching, cancel-before-switch, phone/desktop resizing, the text
  shown in both arriving editors, and a later pagehide write.
- **Safari note composition:** a final composition Enter with key code 229
  saved and closed the note editor even though the input method still owned
  the key. Notes now share the common composition guard. Unit and native
  desktop/phone checks cover Enter, Escape, and command-save keys with both
  composition signals, while ordinary save/cancel behavior still passes.
- **Copy the current note draft:** Copy SGF and share links still serialized
  the older saved comment. Both now finish pending edits before exporting;
  the copy shortcut calls the same handler. Native desktop/phone checks
  capture the clipboard writer, verify palette and keyboard SGF copies, and
  decode the copied share link to inspect its actual comment.
- **Library and shortcut-settings search focus:** these remaining clear buttons
  also dropped focus to the page body. Both now return it to search. Their
  phone padding previously cleared only the smaller desktop icons; native
  measured bounds now show four pixels between the text area and each clear
  control at both desktop and phone sizes, and immediate typing works.
- **Patched development dependencies:** the audit reported two moderate
  findings through Vitest's mocker and a high-severity finding in Zod used by
  the hooks linter. Vitest/mocker are now 4.1.12 and transitive Zod is 4.6.7,
  within the existing major-version ranges. The installed tree matches the
  lockfile, `npm audit` reports zero findings, and full verification passes
  3,235 tests plus both type checks, lint, and the production build.
- **Cache-clear keyboard containment:** its capture handler stopped every
  key before the dialog's Tab trap could run. Native Tab walked from Clear
  into the board and background toolbar. Only Escape is claimed now; both
  Tab directions stay within all three controls. Cancel and Clear return focus
  to the engine button instead of the page body. The regular viewport suite
  includes native focus cycling, composition Escape, blocked background Pass,
  canceled clears preserving analysis, and a confirmed clear retaining notes.
- **Keep pending Save Copy modal:** disabling every control during an IndexedDB
  save moved focus to the page body; Tab reached New Game and the file toolbar
  behind the overlay. The pending dialog now takes focus synchronously. Native
  desktop/phone checks hold real storage opens, cycle Tab in both directions,
  attempt Escape and background New Game, then release storage and verify that
  the named copy persisted successfully.
- **Notification timer ownership:** dismissing a hovered toast left the global
  timer held, so a later status never expired. Conversely, leaving with the
  pointer released a toast still being used from the keyboard. Toasts now hold
  while either hover or focus remains and release the hold on removal or
  replacement. Native desktop/phone checks verify later messages expire, mixed
  hover/focus interactions stay visible, and timers resume after both leave.
  All 43 notification cases and app type checking pass.
- **Copy feedback belongs to its message:** completing a delayed copy after
  dismissing an error marked the next error “copied,” although only the earlier
  details had been copied. Copy completions now require the current request and
  message. Native desktop/phone checks complete an old request after promotion,
  verify the new error stays uncopied, then copy its actual details normally.
- **No background input while a dialog loads:** holding the Lessons module
  request exposed a pass being played behind the Opening scrim. The loading
  state now blocks app keys, focus traversal/button activation, and paste while
  retaining existing Escape cancellation and browser shortcuts. A browser
  regression pauses the actual module, attempts those inputs, releases it, and
  verifies normal keyboard behavior returns after the dialog closes.
- **Cross-tab library saves:** a held IndexedDB write in one tab erased a game
  another tab had successfully added. Whole library operations now share a Web
  Lock when supported, alongside the local request queue. The second tab waits
  and then edits the newer collection. The fallback had a separate cache issue:
  it overwrote another tab's game and resurrected cleared samples. Cached
  fallback data now follows changes to the stored snapshot while retaining
  known data if storage cannot be read. Real two-tab checks cover both backends;
  regressions also cover denied locks, failed tasks, external clears, and an old
  tab attempting to resurrect an outage copy already reconciled elsewhere.
  Save-failure, delayed-save/replacement, overlapping saves, and initialization
  retry probes pass. Retry verification now checks either accepted store: a
  queued read can already have reconciled the fallback into IndexedDB.
- **Load the record actually saved:** choosing Save before reopening the
  current library file persisted two moves, then opened the cached one-move
  record. Loads now reread the file after the unsaved-game choice and return
  its current name/folder to the caller. Unchanged SGF avoids a second parse.
  Recent entries now pass their record ID, fixing a remembered move two
  reopening at move zero. Native checks cover both cases, externally changed
  records/names, deleted targets, and a newer move made during a held lookup
  remaining on the board and in recovery instead of being replaced.
- **Keep library size warnings visible:** the host's unsupported-board notice
  was immediately replaced by the caller's Loaded toast. The load result now
  carries its notice with the refreshed file, and Library/Recent append it to
  one message. Browser checks open a stored 25×25 record through both entry
  points and require the visible 19×19 coercion notice. The source-based path
  assertion now checks the refreshed SGF variable used by the loader.

The viewport gate also mistook the full landscape viewport for the width
available to its controls. At 568×320, tabs take 304px from that row; its
save badge is intentionally hidden to preserve navigation and the turn stone.
The assertion now measures the control strip before requiring the badge.
Recovery-dialog fixtures are installed in the arriving document so the departing
page's recovery flush cannot erase them. Failed-save checks accept a guarded
read failure before fallback writes, while still requiring visible failure,
unchanged stored games, retained recovery, and a successful retry.
The manual-scoring browser fixture also retained the old W+84 expectation after
the established region-based group-tax fix. Lifting all Black stones joins
White through its territory, so its tax is two points and its score is W+86,
as already asserted in the manual-score unit suite. The corrected browser check
passes all offered rules, handicap conventions, dead marks, and SGF results at
1280×800, 390×844, and 320×568.
The copy-dialect test now reads actual TypeScript string/template literals;
its former regex could lose quote boundaries and treat a cancellation return
value as prose. It still checks the same vocabulary and plural conventions.

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
| Stop reaches the worker | Stop aborted queue signals but no search caller forwarded them to the engine, leaving canceled work consuming CPU and blocking the queue. All six search callers now pass their signals. The client settles locally, suppresses late replies, and sends a request-specific cancellation that the worker handles before its work queue. | A real Escape key during deep WASM analysis formerly left the worker searching another 7.72 s, with 28 progress updates. The production check now stops it in 20 ms, restarts successfully, and follows a new move. At 390×844, a trusted touch on the Tools sheet’s Stop button canceled the worker in 74 ms with no later progress updates. Eight client/queue regressions cover pre-cancellation, late replies, queue release, listener cleanup, and failed control-message delivery. |
| Stop cancels deferred requests | A move schedules analysis 500 ms later, before the work enters the queue. Stop canceled active work but that pending callback could start it again. Deferred analysis callbacks are now tracked and cleared by Stop and Clear analysis cache. | The production browser reproduced a new request after Escape immediately following a move. The same workflow now produces none. The durable browser check plays a second move and stops before its 500 ms callback, then verifies no restart. Five store regressions cover new and existing moves, passes, setup edits, clearing analysis, and a subsequent explicit restart. |
| First-search readiness | Live progress previously left the store in “Loading model” until the first search finished, hiding the active backend. Valid progress now publishes readiness and engine metadata immediately. | The production browser now shows “Analyzing…” and “CPU (WASM)” beside the first live evaluation, before an 8-second search finishes. Three regressions verify early readiness without claiming requested-depth completion and suppress late progress after Stop or a model change. The browser analysis check now asserts this header state. |
| GIB/NGF conversion foundation | Added conversion to Unicode SGF with player names/ranks, results, dates, komi, Tygem handicap placement, and NGF passes. Invalid moves are rejected instead of silently removed. Byte decoding supports UTF-8/BOMs and explicit Korean, Chinese, Japanese, and Western encodings. | 35 tests cover format and byte fixtures. Chrome converted the 232-move GIB and 189-move NGF fixtures from PySGF with the expected players and complete move counts; synthetic Korean/Japanese records rendered the correct setup, side to move, and zero komi. The following integration change exposes these converters through the normal import controls. |
| GIB/NGF import workflows | File opening, app drops, the PWA launch handler, library file imports, and ZIP imports now share the format-aware decoder. Settings search exposes an encoding preference for records without a declaration. Open controls use “game,” and imported library names shed the original extension before UTF-8 SGF export. | Full verification passed with 2,512 tests. Real Chrome file selection, drag-and-drop, Settings search, and library import → ZIP download → re-import passed at 1440×900, 390×844, and 320×568. Six Korean/Japanese/Chinese/SGF records retained content and names; malformed GIB input left the current game intact. The PWA consumer was exercised with a delivered File, without claiming OS association installation. Fifteen new regressions cover mixed archives, export round-trips, encoding overrides, and stored preferences. |
| Partial archive failures and mobile notifications | ZIP imports now count rejected games and report the first filename and reason, including encoding recovery guidance. The expansion limit stops further decompression while still accounting for remaining games. Mixed loose-file failures also retain their counts. On mobile, Library/Tree/Review notifications now sit outside the hidden, inert board. | A real four-game ZIP previously reported only “Imported 1 file.” It now reports three skipped games and the first decoding error. At 390×844 the notification previously collapsed outside the viewport inside the inert board; the report and Dismiss are now reachable at 390×844 and 320×568. The regular viewport suite now imports a ZIP with rejected games, verifies the saved valid record, and clicks Copy and Dismiss on desktop and both phone sizes. Nine regressions cover rejected formats, metadata exclusion, expansion-budget accounting, misleading size declarations, complete failure counts, and bounded error details. |
| On-demand AI keyboard action | Enter used the automatic-opponent guard, so it did nothing outside an AI game even though the AI move button worked. The shortcut now requests one move for the current side, matching the button. | In Chrome with body focus, Enter produced zero worker requests before the fix. The same trusted key now runs real WASM analysis and places exactly one move. Forty-nine shortcut/target regressions, typecheck, and focused lint passed. |
| AI move cancellation and ownership | Stop now cancels active, queued, and delayed AI moves, and invalidates their retry callbacks. Replacement requests remove obsolete work for either color. Late failures and results cannot move a different or edited position, and old requests cannot clear a newer thinking indicator. | Escape previously left the AI thinking and played a move roughly 3.7 seconds later. Real production WASM searches now cancel in about 63 ms on desktop and 75 ms through phone touch controls, with no delayed move or retry. Fresh moves complete afterward. Eighteen store regressions cover Stop, replacement, pending replies, model-change/preemption recovery, cache clearing, resignation, and position edits. `test:analysis` now repeats Enter, phone Tools, Stop, and restart while resizing the same game from 1280×800 to 390×844. |
| Search self-capture rules | The board allowed multi-stone self-capture under New Zealand and Tromp–Taylor, but search excluded the move and threw when replaying it to determine ko. Search now applies the selected rule at the root, inside variations, and when reusing a child. Undo restores captured friendly stones without leaving the newly played stone behind. | Eight failing regressions reproduced the disagreement and replay exception. Fourteen checks now cover both colors, single-stone rejection, undo stacks, root policy, previous-position replay, deeper search, and child reuse. Real SGF file input → analysis → pointer/two-tap self-capture → fresh analysis → AI reply passed at 1280×800 and 390×844 for both allowing rules; Japanese still rejected the move. The former “Illegal suicide move” engine error no longer occurs in these workflows. |
| Neural area features follow self-capture rules | Standalone inputs, single-position evaluation, and batched search all computed territory features with self-capture disabled. They now use the selected rule. A KataGo reference board differs at seven points under New Zealand and Tromp–Taylor; Chinese inputs retain the previous result. | Ten regressions failed before the fix. Seventeen checks compare recorded KataGo maps, both players' feature channels, and actual tensors entering the bundled network at the root and a child. All six native SGF import → real WASM analysis workflows passed at 1280×800 and 390×844, with browser input maps inspected independently. This establishes feature propagation, not a measured strength improvement or full endgame parity. |
| Search history and endgame pruning | The client sent only five moves to search, hiding four-opponent-pass sequences and the real turn number. Separately, search computed safe territory with self-capture forbidden under every ruleset. Search requests now retain their full move history, and root pruning uses the selected rule when creating or reusing a search. Pure neural evaluations retain their five-move feature limit. | Seven failing regressions exposed history loss and wrong pruning, including child reuse. Twelve added checks cover transport, reference safe area, both colors, three versus four passes, and child reuse. Six Chrome SGF import → region drag → WASM analysis workflows passed at 1280×800 and 390×844. The worker now receives all eight moves: Chinese skips the settled region, while New Zealand and Tromp–Taylor explore it. A native-worker transfer benchmark measured median main-thread posting of about 0.1 ms for 400 moves and 0.6 ms for 10,000 moves (40 samples, 0.1 ms timer resolution); this measures transport, not complete search time. |
| Exact terminal evaluation for area rules | Only Chinese search counted a position after the second pass. AGA, New Zealand, Tromp–Taylor, and Ancient Chinese continued neural evaluation beyond the end of the game. All five area rules now count terminal positions, including rule-dependent area and independent-life group tax. Ownership remains per-point, and handicap compensation stays in the caller's adjusted komi. | Eight failing regressions showed wrong scores and ten network calls instead of one. Twenty-six new checks cover both colors, draws, ownership, self-capture-sensitive reference scores, tax, first-pass continuation, child reuse, and rejection of territory rules by the area-only counter. Ten real Chrome import → region selection → pass-analysis workflows passed at 1280×800 and 390×844. The settled test position now evaluates to B+14 (ordinary area) or B+16 (group tax), with zero score uncertainty. This does not establish full seki, superko, model-version, or territory-encore parity. |
| Manual scoring and saved results | The panel omitted rules and handicap inputs, used Japanese scoring for every game, and saved the wrong winner after two passes. The count now follows the game's rules and handicap, updates when root metadata changes, and exposes the same signed point contributions in Details. Area rules show living stones, applicable group tax, and White's handicap bonus. The desktop Details popover now opens above the bottom toolbar instead of outside the viewport. | Ten original desktop/phone workflows recorded W+9 instead of B+14/B+16. Twelve added unit checks validate contributions for seven rules, tax, dead marks, and handicap. Thirty native import → Score → Done → SGF download workflows pass at 1280×800, 390×844, and 320×568, including Japanese/Korean controls, two handicap rules, preserved official results, and dead-mark clearing. The browser gate also changes rules and handicap while scoring remains open, checks reachable breakdown rows, and reparses the actual completed download. |
| Game Info rule picker | The editor displayed Japanese for imported AGA, New Zealand, Tromp–Taylor, and Ancient Chinese games because it listed only three rules. It now uses the shared seven-rule list and explains the selected rule through visible help and an accessible description. | Twelve real import → Review → Edit workflows reproduced the wrong displayed selection at desktop and two phone widths; all twelve now show the imported rule. The regular scoring gate checks all seven editor selections, accessible help, and the control’s change handler through to SGF metadata, scoring, and completed downloads. Select changes use the DOM value/change path because CDP keys did not operate the macOS native popup; imports, navigation, scoring actions, and downloads use browser input. |
| UI superko history checks | Every candidate rebuilt text for every ancestor board, including repeated annotation positions. Checks now pack three intersections per character and weakly cache only immutable stored boards. Candidate simulations stay uncached, and traversal follows current parent links and side-to-move metadata. | On synthetic 400-position histories in Chrome, checking 361 candidates measured 359.13 ms → 2.25 ms for shared boards and 421.57 ms → 1.55 ms for distinct boards. These isolate repetition checks, not total AI latency. The study gate now enforces a 50 ms budget. Ten added regressions cover exhaustive 3×3 encodings, supported board sizes, both colors in a three-ko cycle, changed branches/positions, mutable candidates, 12,000 shared annotation boards, and setup replay/undo/redo. The engine's separate history gap is addressed in the next change. |
| Engine superko and history-aware reuse | Analysis explored three-ko repetitions that the board rejected. Every search/evaluation caller now sends exact full-line repetition keys separately from neural move history. Root and deep expansions exclude repeats, neural plane 6 receives the bans, and cache/re-root/graph/symmetry handling retains the relevant history. Passes remain legal and preserve superko history. | Six failing model regressions became green, with Chinese controls unchanged. Thirty-seven added checks cover both colors, deeper search and actual tensors, self-capture, pass persistence, history transport through eight workflows, cache identity, symmetry and child reuse. Eight native desktop/phone SGF → region drag → WASM analysis → attempted-move workflows pass. Six browser reuse probes keep board/position IDs fixed while changing history and observe B3 policy −1 → legal → −1. A generated 400-move 19×19 game measured 1.44 ms to build history, 0.08 ms to compute bans, and 0.035 ms main-thread posting (medians); its encoded history is 51,730 JSON bytes. These measurements isolate history overhead, not search strength or total analysis throughput. |
| Endgame move-selection adjustments | AGA, New Zealand, Tromp–Taylor, and Ancient Chinese incorrectly received the territory-scoring pass and cleanup-capture penalties. The connection exemption also computed safe area with self-capture forbidden. Adjustments now use the selected scoring and self-capture rules. | Fourteen failing regressions exposed the two errors. Twenty-four added checks cover seven rules, both colors, cleanup captures, a recorded KataGo safe-area fixture, and the actual bonus used during root creation and child reuse. Fourteen native desktop/phone SGF → WASM analysis → Stop → second-pass workflows pass. A read-only browser helper probe using returned root ownership records the incorrect one-third-point pass adjustment becoming zero for the four affected area rules; Japanese/Korean retain it. This validates the adjustment and workflow, not a measured strength gain. |
| Long desktop notifications | The game-over message expanded the dashboard’s implicit grid column, clipping the header and analysis sidebar without creating a document scrollbar. The shell now explicitly allows its column to shrink inside the window. | Native SGF import → End → Pass reproduced 268 px of overflow at 1024×768 and 161 px at 1280×800. Applying/removing the grid constraint in the browser removed/restored the failure. The regular viewport gate now checks three desktop widths before, during and after the real notification, including actual panel bounds, reachable header controls, a stable board, full message text and its live region. The three targeted workflows pass. |
| Unsaved-game navigation QA | Reload checks left the native unsaved-changes confirmation unanswered, pausing navigation and renderer evaluation. The browser helper now dismisses unexpected dialogs, accepts beforeunload only when a caller explicitly permits leaving its fixture, and bounds navigation setup with the same deadline. | Native traces reproduced the pause with the engine idle and with real WASM analysis. Answering the confirmation completed navigation in both cases. Seven failing helper regressions now pass, including default preservation, explicit acceptance, unrelated dialogs, failed responses, and stalled setup. The production analysis gate checks Cancel → Leave → Restore at desktop and phone sizes after real AI moves, verifies the same document survives Cancel, compares the saved SGF across navigation, and restores every stone, the move number and the next player. This resolves the previously recorded reload investigation; it was not evidence of an engine deadlock. |
| Startup rules survive recovery | The initial game played with the saved rules preference but always wrote Japanese into its SGF root. Exporting or recovering that game silently switched every other preset to Japanese. Startup metadata now uses the loaded preference. | Six failing regressions reproduced the mismatch and rule change, with Japanese as a passing control. All seven now pass through actual settings loading, a move, SGF export and reload. Fourteen native desktop/phone startup → Pass → Cancel → Leave → Restore → WASM analysis workflows retain the original rules, metadata, komi, turn and move. The production recovery gate now checks the saved RU property and every resumed worker request's rules, in addition to the position. |
| Duplicate interactive analysis requests | The layout effect, toggle/move timers, and continuous-search loop preempted one another while analyzing the same position. Automatic triggers now await compatible work already in progress, with one progress/completion handler. Explicit restarts and changed search contexts still replace it; canceled or stale queued work cannot be reused. | Three native trials per size reproduced three requests and two premature cancellations on desktop, and two requests and one cancellation on phone. The same six workflows now start one request each, retain live hints, and stop without retrying. Fourteen regressions cover gradual deepening, progress, completion, queued/active cancellation, replacement settlement, failures, explicit budget/report changes, positions, rules, regions, and ownership. Cold first-progress timings varied substantially (419–865 ms before, 467–847 ms after), so these samples establish fewer redundant requests, not a consistent latency improvement. The production gate now rejects duplicate startup requests and premature cancellation after recovery. |
| Pass-history and ladder inputs | Conservative passing erased Japanese/Korean first-pass history as though normal play were the final scoring phase. Repeated-pass boundaries were omitted, three friendly-passing area presets were missing, and ladder planes could use more history than move planes. A shared history calculation now selects move/pass features, the phase-end signal, and previous ladder positions consistently. | Nineteen initially failing tests exposed the differences. Thirty new tests cover 132 expected history states recorded in the pinned native KataGo output, both komi signs, conservative/passing-hack modes, all seven presets, and actual root/child network tensors. Additional conservative-passing and winning/losing Tromp–Taylor checks pass. Fourteen native desktop/phone SGF → first-pass analysis → repeated passes → resumed-play analysis workflows completed with real WASM; read-only input probes also checked each phase boundary. Screenshots and board bounds remained within both viewports. This covers ordinary consecutive-pass endings with encore disabled; repeated-position endings, phase resets after irregular turns, territory encore, and model-specific history modes remain outside this correction. |
| Saved metadata survives duplication | Duplicating a game rebuilt it from its SGF and discarded tags, favorite status, and saved metadata that was not in the record. Copies now preserve the complete file record, assign fresh identity/timestamps, and copy mutable tag/metadata containers so the original remains independent. Unchanged SGF no longer needs reparsing during duplication. | Two failing regressions became green; three added tests cover direct copying, nested/bulk copying, independent edits, backup round trips, and absent optional fields. Native desktop/phone Star → Edit tags → Duplicate reproduced the loss before the change. Six direct/folder/bulk workflows now retain classification, metadata, SGF, relationships and IDs through IndexedDB reload; changing/un-starring a copy preserves its original. Screenshots and document bounds pass at 1280×800 and 390×844. No end-to-end performance gain is claimed for this metadata correction. |
| Clearing library tags | The shared name/tag dialog rejected empty input, making the final tag impossible to remove. Tag editing now explicitly accepts an empty or whitespace-only list; name-based actions still require text. | A new native browser regression reproduced the disabled Save button at 1280×800, 390×844 and 320×568 before the fix. All three now pass import → star/tag → duplicate → cancel clearing → save an empty list → clear via Enter → reload. It verifies source/copy independence, search results and tag-filter options, preserved metadata/favorites, and disabled blank Rename/New Folder/Save actions. This workflow now runs in the regular viewport gate, with per-size screenshots and recorded dialog bounds. |
| Deep library folder pickers | Restoring a 12,000-folder chain overflowed recursive folder-option traversal and replaced the whole app with its error screen. Both save dialogs also generated indentation proportional to the full depth. Traversal is now iterative, retaining sorted depth-first order, exact depths, and existing orphan/cycle handling. Deep labels keep the full name and level with bounded indentation. | Two failing regressions exposed stack overflow and a single 36,015-character destination label; three added checks cover the deep backup, ordering/identity through disconnected cycles, and rendered destination text. Native backup restore reproduced the app-wide crash on desktop and phone. Restore → both save dialogs → save into the deepest folder → reload now retains every folder and the original tagged/starred game at 1280×800, 390×844 and 320×568. Folder selection uses DOM value/change; opening and saving use native mouse/touch/keyboard input. Final 12,000-option browser samples had 1.7–2.2 ms medians; both dialogs opened in 143–190 ms. All labels together contain 324,868 characters, with a 28-character maximum in this fixture. The broader study gate measured 4.90 ms for traversal. These are local Chrome measurements, not physical-phone or end-to-end throughput guarantees. The study performance gate now checks complete deep-folder traversal and bounded label size. |
| Large-library copy and deletion | Folder duplication and descendant counting repeatedly scanned the full library; bulk deletion repeated that work for every selected game. These paths now index children once and visit each affected record once. Overlapping selections count and delete descendants only once. | Six data regressions cover a reverse-ordered 6,000-item hierarchy, every copied parent link and record, overlapping selections, unrelated additions, missing IDs, and cyclic descendant traversal. In the same isolated Chrome helper fixture, copy fell from 155.33 ms to 6.39 ms and deletion from 144.16 ms to 1.21 ms. Native desktop/phone workflows preserved all copied metadata, canceled without changes, deleted the intended records, kept the board unchanged, updated the loaded-game association correctly, and retained expected contents after reload. For these local samples, deep-folder confirmation fell from 242–420 ms to 32–35 ms, and deleting 10,000 selected games from 615–706 ms to 6–38 ms. Folder copy still took 233–252 ms through its DOM update, with 255–261 ms long tasks; one phone bulk-confirmation sample also took 170 ms. These are local browser timings, not physical-device or INP guarantees. The study gate now checks complete nested copy, overlapping selection/counting, and nested/bulk deletion with a 50 ms synchronous budget per operation. |
| Empty-library persistence | An empty IndexedDB library was treated as a first visit, and fallback storage did not finish sample initialization on its first save. Deleting everything could therefore restore all eight bundled entries. Both loading paths now use the sample-version check, and successful writes record initialization only after the data is saved. | Native delete → reload reproduced all eight entries returning on desktop with IndexedDB and on desktop/phone with local storage; the phone IndexedDB check also failed to retain the empty saved state. The same four workflows now pass first-visit samples → Cancel → delete all → reload → import one game → restore an empty backup → reload, reading storage directly to avoid loader side effects. Seven unit regressions cover initial reads without saves, stable saved IDs, full and partial deletion, empty backups, older sample-version updates, and rejected writes. These native desktop/phone checks now run in the regular viewport suite. The change preserves the existing versioned sample-update policy. |
| Library Save/Update recovery | The panel marked the game clean, cleared recovery data, associated new records, and showed success before its asynchronous save completed. It also refreshed recent games before persistence, allowing that read to activate the failed-IndexedDB-load guard during a rejected write. Save acknowledgements and recent-game notifications now follow successful persistence. A pending save only clears recovery when its exact SGF still matches the current game; storage errors offer Retry. The panel now uses the existing stable, current-state SGF getter. | Injected IndexedDB/local-storage write failures reproduced success messages and lost recovery data for Save and Update at 1280×800 and 390×844. The new browser regression covers both actions at those sizes plus 320×568: rejected writes leave stored records and recovery intact, Retry persists the exact game before clearing recovery, and a second rejected update survives reload and restores the full board. Two additional desktop cases delay real storage opens while another native move occurs, then verify the old snapshot is saved and the newer recovery copy remains. All eight scenarios now run in the standard viewport suite. These checks target the library panel; other save entry points and broader storage failover remain separate audit work. |
| Main-menu and keyboard save completion | The shared completion callback replaced the clean-game baseline and cleared recovery even when an asynchronous save contained an older SGF. It now requires that supplied snapshot to match the current game before either action. | Seven browser cases reproduced newer recovery data becoming null: Ctrl+S, the desktop Save button, phone menu Save at 390×844 and 320×568, and Save Copy at desktop and both phone sizes. Each holds a real database open, makes another native move, then completes the original save. Save Copy additionally exercises the captured snapshot while its dialog is opening. All seven now retain the newer recovery copy; a subsequent ordinary save of the latest position clears recovery and retains that exact SGF after reload. The regular browser suite now runs these cases alongside the panel’s eight save/retry/recovery scenarios. This validates edits overtaking a save; ordering between multiple simultaneous save requests remains a separate check. |
| Overlapping game saves | An older pending Ctrl+S could overwrite a newer successful save after recovery had been cleared. Complete library read/modify/write operations now run in request order. The panel mirrors completed saves without writing them again, and request IDs prevent older toolbar notifications from replacing newer panel-saved SGF. Initial storage failures retain a snapshot for Retry. | A native delayed-read reproduction lost the newer move with no recovery copy. A mixed toolbar/Update reproduction also lost it on a subsequent Star action. The browser gate now has 30 save scenarios: the previous 15, six overlapping toolbar/menu cases across desktop and both phone widths with delayed reads/writes, two desktop toolbar/panel overlaps followed by Star, four phone Library-opening → Update → Star checks, and three failed-initialization retries. Five unit checks cover task ordering, rejection recovery, simultaneous additions/naming, and preserving unrelated records. Broader overlapping metadata edits, full-library replacements, cross-tab writes, and failover recovery still need separate checks. |
| Metadata edits during pending saves | Starring a record while Ctrl+S was waiting could later persist the panel’s stale full snapshot, erasing the just-saved move after recovery was cleared. Panel writes now apply only added/deleted records and edited fields to the latest stored collection, inside the ordered operation. Successful edit batches are acknowledged once; later batches do not replay them over intervening saves. | The native desktop reproduction stored the original zero-move record with favorite=true, no recovery copy, and a clean title. Six new desktop/phone cases now retain the exact game and favorite through delayed reads/writes and reload, bringing the save gate to 36 scenarios. Seven unit checks cover Star, tags, rename, unrelated imports/updates, deletion, duplicate-add avoidance, intervening saves, and retry of rejected edits. All local edit handlers use this path. Cross-tab coordination and complete backup replacements remain separate from field-edit merging. |
| Edit palette follows the game strip | Linux CI reported the desktop edit palette overlapping the game-info strip at 1024×768 and 1024×500. Its top offset assumed fixed header/strip heights. It now follows the measured board-stage top and observes geometry changes. | A native local stress check with a 120px strip reproduced 67px of overlap at 1024×768, 1024×500 and 1280×800. The same six normal/enlarged-strip checks now retain a 10px gap below the strip. The regular viewport gate also expands and restores the strip while editing stays open, requiring the palette to follow both changes and reporting actual geometry on failure. |
| Browser fixture module identity | After the layout checks passed, Linux CI failed when the long-metadata fixture dynamically imported the bare game-store URL. CI infers the `/web-katrain/` application base from `GITHUB_REPOSITORY`; root-relative imports bypass it. Fixtures now reuse recorded module URLs, including the app base and Vite timestamps, and exclude failed resource requests. The resource buffer is enlarged before app startup; components not yet loaded resolve their explicit first-import fallback against the document base. | Six unit regressions cover timestamp selection, failed requests, older timing APIs, required singleton identity, and first imports at root, project-base, and query/hash URLs. Targeted real-browser checks load long metadata into the visible app, exercise score-quiz request ordering with its actual engine client, and scroll preview boards by native touch. No application behavior is changed by this test-runner correction. |

| Resolved save errors | A successful Retry persisted the game but left the old save error pinned over the phone board, with the success message queued behind it. Save status notifications now carry their request identity, allowing the successful retry to replace its own error while unrelated errors retain their place. | Linux's 320×568 screenshot showed the resolved error covering the next move. Five notification regressions cover visible and queued resolution, repeated failure, unrelated operations, and normal success dismissal. The six native failed-save/update checks now require the old error to disappear and the success notice to appear after persistence, before playing and recovering a second unsaved move. |

The preview-board browser check now sends a complete native touch sequence.
Linux Chrome reported no movement for the earlier synthetic scroll command;
the check now verifies an unobstructed, scrollable fixture before dispatching
input and reports geometry and touch-action on failure. It also checks that
interactive boards retain their intentional gesture lock, so a test that ignores
touch-action cannot pass both cases. Portrait and landscape checks pass locally.

Position sharing relies on the store's existing invariant: board edits, replay,
and komi changes replace `gameState` and its arrays. Do not mutate a stored
position in place. The new regression freezes positions during setup edits and
checks undo/redo across rebuilt descendants.

Drawings remain session-only and are not part of SGF export. The drawing fixes
do not change that storage contract.

## Follow-up pass (2026-09-25, `claude/eloquent-euler-6uaxqr`)

Each item was reproduced first -- a failing test or a browser run -- and each
fix carries a regression test that fails on the code before it. Differential
fuzzing of the engine's board code against `gameLogic`/`treeSuperko` and an
independent KataGo-rules reference (2,620 games, ~590k moves, sizes 3-19, all
offered rules) and of terminal area scoring (17.4k positions) found no
disagreement; the two app-side bugs it surfaced are listed below.

| Area | Problem and resulting behavior |
| --- | --- |
| SGF export | An emptied node holding variations beside a sibling wrote `((;..)(;..))(;..)`, which no parser opens. Empty nodes are now lifted, root children included. |
| SGF load | A move in the root node copied the root's comment and game info onto move 1. Only move-level properties go with it. |
| Ko | Simple ko compared with the grandparent node, so a comment node after a ko capture allowed the recapture and a setup node refused a legal move; the engine, given the same boards, could rank the illegal recapture. One helper now serves play, replay, load, the bots and every engine request. |
| Replay | Setup stones on a pass node were dropped whenever the line was rebuilt. |
| Tree edits | Insert mode lost copied moves' comments and markup; pinned lines recalled the wrong node after variations moved; drag-painting relabelled labels; a handicap change removed moves without a word. |
| Clock | A tick crossing the end of main time charged its overshoot to nothing. |
| Scoring | A counted draw was written `RE[Jigo]` (now `RE[0]`), and recorded draws were not shown as results. Stone-scoring tax counted chains rather than KataGo's regions. |
| Bots | Jigo and score-loss did not pass when the top move was a pass; the fallback bot's superko filter ignored suicide. |
| Navigation | Next mistake stuck after the first jump and used a different points-lost measure from the rest of the app. |
| Library | Select all then Move flattened every folder; moves could duplicate names; metadata missed legal SGF whitespace and counted `AB[aa:cc]` as one stone. A drop on a subfolder also landed on its parent, and dragging to Root skipped the unique-name check. Resizing with the header menu open called `window.close` (now barred by lint). |
| Import | Pasted diagrams: `+` corners, a white `0` at a row edge, and the side to move. |
| Study | Problem grading ignored whose GB/GW marker it was, and Show solution could show the refuted line; a 0 tsumego wall recoloured the problem; ladder and gauntlet left the bot's 20k-6d range. |
| Inputs | Game Info fields could not take a trailing space; a cleared komi started a game at 0. |
| Keyboard | Enter on palette buttons ran a command; Shift+Space and Option-altered Alt shortcuts never matched; resetting a shortcut could re-create a clash. |
| Settings | A chosen 500 visits reloaded as 5000. |
| Offline | Activation deleted other apps' caches on the shared origin; reported bundles accumulated in the shell cache across deploys. |
| Display | Score leads rounded their sign, not their margin (B+0.2 against W+0.1 for one lead); PV tiles ignored the player's quality thresholds; arrow keys moved the board cursor against the rotation. |
| Drill and report | Replaying the drilled move graded as better or solved; pass-only positions were drilled; a phone tap or Enter played the guess instead of answering; report graph phases were windowed by line position, shifted by setup nodes. |
| Game replacement | Ladder and gauntlet games replaced unsaved work without asking, and Save then overwrote the library game still named in the title; a share link or launched file at startup destroyed the previous session's recovery snapshot (now kept in the Library). |
| Engine flows | A board edit left the play-elsewhere readout on "Checking..." or a stale price; play-to-end folded the real game when the engine chose its next move; the AI opponent answered the set-up position generator's moves. |
| Pointer input | A stale click-suppression flag swallowed the click after a right-click; a scroll that began on the score graph jumped the game. |
| Photo board | Play move was never offered for a move that captures; auto-trace found no black stones on a transparent PNG. |
| Phone controls | The branch-number editor in More Controls closed as it opened; Enter or Escape in a number field dropped focus to the page; the move strip clipped the turn stone off its left edge on narrow and landscape phones. |
| Kifu and quizzes | Printing a kifu gave one page however many diagrams it had; a diagram left out earlier stones captured within it; Guess the Move graded a click on a stone as a guess. |
| Series and edit dialogs | A gauntlet game started while the ladder awaited a result was scored by both; the tsumego wall distance clamped per keystroke and its dialog never took focus; the pro-games search lost its focus to the dialog; the edit toolbar's branch count went stale after Add PV and Copy was offered on setup nodes. |
| Analysis surfaces | Re-analyze's visits and range fields clamped per keystroke (500 became 1600); a Quick graph disabled the bar's Fast review as "Reviewed"; the review ETA carried a replaced run's start time; sorting candidates by win or score put White's worst move first; a candidate preview survived navigation, so one Enter played it. |
| Setup dialogs | New Game and Settings number fields rewrote their clamped value under the cursor (60 seconds became 160) and refused negatives; switching the AI's side left KataGo as the human's name; an unmarked White-to-play problem in a collection was posed and graded as Black; shortcut recording stayed armed while typing in search; camera capture stuck on "Capturing..." in development. |
| Desktop tree and dashboard | Dashboard navigation ignored insert mode and finishing then grafted the game onto the new moves; the desktop tree never scrolled to the current move, so Center did nothing; Make main branch hid on lines that left the main line at an earlier fork; the phone branch editor dropped focus; the Swing tooltip stayed stale after analysis. |
| Report and graph | The report's Review Queue closed and Show all folded whenever analysis landed; its graph was rebuilt every 0.9s during a review, losing focus; on games under 16 moves the graph previewed and jumped to the wrong move; a phase graph skipped its first move's marker; a clock-only graph showed invented win rates and scores. |
| Board | The Swing wash and next-move rings ignored analysis and Add PV landing on the current node; wheel, swipe and the mistake keys navigated mid-insert; Enter on the board cursor played a stone during region selection. |
| Edit history and saved analysis | A pending recovery auto-save was lost if the page was hidden and killed within its half-second wait; Undo edit restored a snapshot from before later moves and notes, deleting them for good once redo was cleared; 9x9/13x13 analysis reloaded with empty ownership and policy; a no-op Add PV wiped redo; undo dropped the id pins are stored under; a reordered variation could not be pinned. |
| Analysis pipeline | Reviews overwrote deeper results that landed while they waited, and stored the pre-edit position's result on an edited node; live progress replaced a 500-visit result with a 12-visit snapshot; Undo edit left review and play-to-end flags on; Quick review silently skipped a chunk after its third preemption. |
| Library storage and import | A save that fell back to localStorage vanished after a reload; clearing the library after such an outage brought its games back; stored metadata and move counts overrode what the SGF says, so reading fixes never reached existing games; an NGF with a blank title line failed to import. |
| Sharing and offline updates | An unreadable share link did nothing silently; copied links carried analysis and grew past what the app will read; the app's own link failed in Paste SGF and the share sheet; a link opened in an existing tab was ignored; a waiting service-worker update overwrote the running version's offline shell. |
| Layout and access | Board coordinates ran under edge stones; Tab on a focused control toggled analysis instead of moving focus, so the keyboard could not get past it; active report toggles were white on a 30% tint (1.5:1); faded 11px counts and hints fell below 4.5:1; Settings showed 101px of content on a 568x320 phone. |
| Efficiency | Six :root/body :has() rules restyled the whole page on every DOM change (4.9ms style + 3.0ms layout per move, now 0.45 + 1.1); each move re-rendered the app twice; the idle clock rendered 14 times a second; opening the Library rewrote every record (2.6s to rows at 3,000 games, now about 0.5s). |
| Everyday flows | Resigning while the engine thought recorded the engine's resignation; Enter in Library dialogs reopened them and saved duplicates, and a first save was "Game 9"; the desktop move rail wrapped at move 10 and moved the board; Fast review graded unlisted moves "Blunder, 0% of top"; Coach said "behind the best move" for a cost measured against the position; a chosen clock never started. |
| Accessibility | Closing an autofocused dialog dropped focus to <body>; the board had no role and its keyboard cursor was silent; dashboard toggles said "Hide analysis, pressed"; buttons were named unlike their visible text; review progress was never announced; ARIA the roles do not allow; a heading-less sheet; a tab bar outside any landmark and a second <main>. |
| AI opponents | Influence and Territory bots ranked sampled moves by raw policy, not policy times line weight, so the style barely mattered; the AI stored its own search as the position's analysis, including Handicap's and Human's deliberately biased ones, and over deeper stored results. |
| Data, language and gamepad | The Pro Game Library never showed a result or rank (its header reader missed properties that follow a value directly); a non-English browser marked the English UI as that language for screen readers, and the chip claimed to set the SGF's language; a second connected gamepad took input over from the one in use. |
| UI | Theme previews (Hikaru's square SVG, Bamboo's missing lines), a repeated AI-strength sentence, tooltips off-screen on phones, filled "unselected" library boxes, library names squeezed by hover actions, menu header gap, start-rail wrapping and reserve, lesson/quiz board size on tall phones, kifu stones in the wrong colour, large-tree centring, stale setup labels, phone move-list columns, OGS progress counter. |

## Follow-up pass (2026-09-26, `claude/bug-fixes-ui-polish-hpws9z`)

Found by reproducing in the browser (dev server and production build) and by
parallel read-only audits; each fix has a regression test that fails before
it (the Settings rows, the coordinate highlight and the start rail were
checked in the browser).

| Area | Problem and resulting behavior |
| --- | --- |
| AI games | A second Pass or a board click on the AI's turn was recorded as the AI's move (two passes ended the game on a pass it never chose); now refused, and a stalled AI is woken. Undo when the AI's reply was move 1 stalled the game at the root; it now declines. Resigning wrote over a recorded result. |
| Clock | Kept counting after a resignation or two passes and ran finished games out of time; ticked 14 times a second while paused. |
| SGF load | `HA[1]`, or handicap stones in the first child node, placed phantom stones and dropped the whole game. An empty `CA[]` refused to open. The app's own share link failed on drop and from the share sheet. The Library move counter missed `B [ee]` and `Black[dd]`. |
| Library and settings | A localStorage copy left after an IndexedDB outage came back after a later read failure, restoring deleted games and reverting edits. A corrupt stored setting crashed the desktop UI. Duplicate ids in a backup lost records. Names sort by number; names never split an emoji. |
| Report and graph | The tooltip showed smoothed, not per-move, values; an unreached phase plotted another phase's move; the result guess rounded halves toward Black; `-0.0`, `-0.00pp` and `#?` chips; the played-move readout missed "Best"; 99,950 visits read "100.0k". |
| Study | Tsumego with set-up in the second node were unsolvable; games branching at move 1 and handicap games were posed as problems; goproblems' `C[RIGHT]` was not read; the punish quiz's answer showed in the side panels; the drill passed guesses worse than the played move; Score quiz re-counted re-guessed positions. |
| UI | The offline/update card covered the desktop start rail (its offset summed two 56px bars under a 50px navbar). Phone Review status wrapped in body type. Landscape home and menu grids had stray borders and ghost cells. Settings rows squeezed labels, tabs opened mid-scroll, Teach Mode bands were unlabeled. The cursor coordinate highlight was ~1.2:1 in dark mode and overflowed the board. "Recent" listed unopened bundled games dated today. |
| Efficiency | Every analysis update re-serialized the whole game to test for unsaved changes (3-4 ms and 570 KB of garbage per update on an analysed 231-move game); the phone move list re-centred on every update. Production main-thread script during live analysis measured about 4%. |

Left as is: byo-yomi periods refresh when stepping back and forward (KaTrain
parity); New Game with handicap 1 still places one stone (saved explicitly).

## Validation and measurement

The baseline passed 2,384 tests, with one intentionally skipped benchmark. After
scoring, rule-editor, engine/UI superko, ending-adjustment, navigation-QA, startup-rules, interactive-request, pass-history, library-metadata, tag-editing, folder-picker, hierarchy, initialization, panel-save, shared-save acknowledgement, save-order and field-edit fixes, `npm run verify` passed 2,788 tests, with the same skip,
plus app/test typechecks, lint, and the production build. `npm audit` reported
zero vulnerabilities in the lockfile dependency graph on 2026-09-12.

A full-suite run exposed a timing assumption in the CPU cancellation regression:
its 500 ms search deadline could expire before a batch completed under contention.
The test now allows 10 seconds for the search while still requiring the queued
cancellation and a resumable tree; production browser Stop retains its one-second
latency budget.

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
| [Sabaki](https://github.com/SabakiHQ/Sabaki#features) | SGF collections, GIB/NGF import, variation copying, undo/redo, comment search, and a fast game tree support serious editing. | Reliability of annotations and large trees comes before adding more analysis controls. GIB/NGF import now uses the same validated import pipeline. Mixed-charset collections remain a separate design task. |
| [SGF charset specification](https://www.red-bean.com/sgf/properties.html#CA), [PySGF file reader used by KaTrain](https://github.com/sanderland/pysgf/blob/main/pysgf/parser.py), and [browser Encoding Standard](https://encoding.spec.whatwg.org/) | SGF declares text encoding with `CA` and defaults to Latin-1. PySGF reads that declaration before parsing. Browsers provide decoders for the common East Asian formats. | The reproduced corruption is fixed at the byte boundary with native decoders. Undeclared UTF-8 remains compatible; undeclared East Asian encodings need explicit conversion. Multi-game and mixed-charset collections require a separate import design. |
| [Lizzie](https://github.com/featurecat/lizzie) | Continuous analysis, full-game review, and configurable native-engine execution are central to its workflow. | Measure navigation and board responsiveness during real analysis, not just with an idle engine. |
| [KataGo analysis protocol](https://github.com/lightvector/KataGo/blob/master/docs/Analysis_Engine.md) | Native analysis supports asynchronous requests and multiple positions, with cross-position batching for capable GPUs. | An optional native-engine connection is a promising professional throughput path. This is an architectural inference, not a measured speedup for this repository. |
| [KataGo self-capture rules](https://lightvector.github.io/KataGo/rules.html) and [board legality implementation](https://github.com/lightvector/KataGo/blob/master/cpp/game/board.cpp) | A configured multi-stone self-capture removes the friendly group after resolving opponent captures; single-stone self-capture remains forbidden. | Policy masking, move simulation, undo, and previous-position replay must agree with the UI. The reproduced search gap is fixed; broader rule-specific evaluation remains under audit. |
| [KataGo area fixtures](https://github.com/lightvector/KataGo/blob/d3263466bd61c9e6aaee51b48c08826e18026506/cpp/tests/testboardarea.cpp) and [v7 neural inputs](https://github.com/lightvector/KataGo/blob/d3263466bd61c9e6aaee51b48c08826e18026506/cpp/neuralnet/nninputs.cpp) | The “Area 2” fixture distinguishes self-capture-dependent territory. Native input preparation carries that rule into area calculation. Newer native history modes can additionally select pass-alive behavior from model metadata. | The missing selected-rule flag is fixed in all three input paths, root pruning, and terminal area counting. Model-version migration flags and broader seki/endgame positions still need reference checks. |
| [KataGo root move pruning](https://github.com/lightvector/KataGo/blob/d3263466bd61c9e6aaee51b48c08826e18026506/cpp/search/searchhelpers.cpp) and [root safe-area calculation](https://github.com/lightvector/KataGo/blob/d3263466bd61c9e6aaee51b48c08826e18026506/cpp/search/search.cpp) | Four opponent passes trigger pruning inside strictly safe area, whose calculation depends on self-capture rules. Raw policy can still list a move that search prunes. | Restored the required history and selected-rule calculation. Regressions inspect actual visited candidates, rather than treating raw policy as evidence of pruning. |
| [KataGo terminal area scoring](https://github.com/lightvector/KataGo/blob/d3263466bd61c9e6aaee51b48c08826e18026506/cpp/game/boardhistory.cpp) | Untaxed area scoring uses area calculation with the self-capture rule. Taxed area scoring uses independent life; the all-group tax subtracts two points per independent region. | Terminal search now follows this split for every supported area ruleset. Separate the resulting exact terminal score from the root's remaining mixture of neural and searched values. |
| [KataGo superko history](https://github.com/lightvector/KataGo/blob/d3263466bd61c9e6aaee51b48c08826e18026506/cpp/game/boardhistory.cpp) | Native history tracks complete position hashes, includes the next player for situational superko, and computes banned moves for the next player after each move. Ordinary AGA/New Zealand/Tromp–Taylor passes do not clear that history. | The three-ko disagreement is now fixed through all evaluation/search callers, neural plane 6, deep expansion, graph identity, symmetry and child reuse. Exact encodings decide legality; graph fingerprints separate differing history sets. Broader native rule parity remains under audit. |
| [KataGo ending adjustments](https://github.com/lightvector/KataGo/blob/d3263466bd61c9e6aaee51b48c08826e18026506/cpp/search/searchhelpers.cpp) and [root safe area](https://github.com/lightvector/KataGo/blob/d3263466bd61c9e6aaee51b48c08826e18026506/cpp/search/search.cpp) | Native search selects ending adjustments by scoring rule and uses self-capture-aware safe area for the connection exemption. | Removed the Chinese-only branch and fixed the safe-area flag, including reused roots. Friendly-pass neural suppression is separate: native Tromp–Taylor disables friendly passing, unlike the other offered area presets. |
| [KataGo recorded input output](https://github.com/lightvector/KataGo/blob/d3263466bd61c9e6aaee51b48c08826e18026506/cpp/tests/results/runOutputTests.txt), [input test setup](https://github.com/lightvector/KataGo/blob/d3263466bd61c9e6aaee51b48c08826e18026506/cpp/tests/testnninputs.cpp), and [v7 feature generation](https://github.com/lightvector/KataGo/blob/d3263466bd61c9e6aaee51b48c08826e18026506/cpp/neuralnet/nninputs.cpp) | Native input generation distinguishes ending a phase from ending the game, retains only one history turn immediately after a normal phase ending, and applies the same history count to previous ladder boards. The output fixture records repeated passes and resumed play with encore disabled. | The reproduced consecutive-pass differences now have recorded reference regressions. Friendly passing follows the native preset, including Tromp–Taylor’s explicit false setting. Extend reference coverage to repeated-position endings and model-specific modes before claiming complete history parity. |
| [Chrome DevTools dialog events and responses](https://chromedevtools.github.io/devtools-protocol/tot/Page/#event-javascriptDialogOpening) | The protocol exposes beforeunload confirmations and explicit accept/dismiss responses; an unanswered dialog can pause page execution. | Navigation QA now handles the real confirmation and exercises both staying and leaving. The app’s unsaved-game protection remains intact. |

## Highest-priority remaining work

| Priority | Finding or opportunity | Evidence and next step |
| --- | --- | --- |
| High | Check remaining asynchronous save acknowledgements and storage recovery. | Panel Save/Update, Ctrl+S, the desktop Save button, phone menu saves, and Save Copy preserve newer recovery data when a save finishes late. Overlapping saves run in request order; metadata edits merge changed fields into the latest collection. Backup restore validates content and confirms replacement with both counts. Queued cross-tab fallback saves now have a durable lost-write reproduction and a shared-backend fix, with restart, failure and database-recovery checks above. Continue adversarial checks of full-library replacement, failed Save choices during game replacement, and storage-capability changes across tabs. |
| High | Validate remaining manual-count and handicap conventions. | The panel now passes the game's rules and handicap and saves the corresponding count. Its underlying manual estimator still floods empty regions and taxes connected living stone chains; broader seki and independently connected life regions need reference checks. Also compare root-declared `HA` compensation with the engine's root-board-based helper. These are separate from the proven omitted-input bug. |
| High | Confirm the restored browser gate on Linux CI. | The formerly recorded first-mobile failure now reproduces locally with a cold cache and has a traced cause and fix. The full viewport gate is enabled with failure screenshots. GitHub-hosted validation is tracked by the CI run on the final main commit. |
| High | Continue auditing large-tree operations. | Snapshotting, export, clipboard/replay, nested SGF parsing, and solution search are now iterative after reproduced failures. Expanded Library rendering is now iterative after a reproduced 1,500-folder crash. Inspect broad trees, redundant position copies during import, and responsiveness during analysis next. |
| High | Professional engine validation needs broader evidence. | The bundled model comes from KataGo's test fixtures. Existing golden/invariant tests are useful but do not prove b18 search equivalence across all supported rules and endgames. Self-capture, area inputs, search-history transport, root pass-alive pruning, and terminal area scoring now have direct regressions. Full-history superko now also has root/deep/browser regressions. Ending bonuses now also follow every offered rule. Consecutive-pass neural history, phase-end signals, friendly-pass presets, and previous ladder selection now also match the recorded reference cases. Validate repeated-position/irregular-turn phase resets, stronger weights, model-specific history modes, seki, handicap compensation, and territory encore next. |
| High | Analysis provenance is not carried comprehensively through imported records and reports. | `AnalysisResult` exposes evaluation data without model/search identity. The undo revision fix prevents one stale-data path, but imported external analysis can still have unknown provenance. Design explicit origin, model, and settings metadata before presenting mixed-source comparisons as equivalent. |
| Medium | Continue profiling large-library operations. | ZIP export preparation, batch import naming, single-folder duplication, and selection/deletion now use indexes, with measured gains on large fixtures. File, dropped-text and OGS sync completion now commit against current storage, and OGS identity survives renaming. Naming dialogs still need further adversarial checks. Compression still takes most of total export time. The 12,000-folder picker crash and duplication metadata loss are fixed. Bulk duplication now shares indexes, naming pools and final array assembly, with a 10,000-game study benchmark. Fully expanded 1,500-folder Libraries now pass native navigation and reload checks; larger DOM mounts and breadcrumb traversal remain separate performance checks. Native folder-copy timing varied: the first post-fix sample took 233–252 ms through its DOM update with 255–261 ms long tasks; the post-commit repeat took 45–72 ms with 68–70 ms long tasks. Profile repeated normalization, whole-store persistence, and rendering under controlled conditions before choosing the next optimization. Intentionally empty library reload now passes in both storage modes. Its empty state now offers a visible Import files button rather than pointing at the overflow menu. |
| Medium | Initial bundle size and slower-device behavior need targeted profiling. | The current production entry is about 761 kB uncompressed / 226 kB gzip. Idle dialog warming and worker inference already help. Measure cold network loading and CPU-throttled interaction before choosing further split points; do not infer gains from line counts alone. |
| Medium | Browser coverage is Chrome-only in this audit. | Touch capability and viewport sizes were emulated, but WebKit/Firefox, physical phone behavior, and browser-specific WebGPU/WASM fallbacks were not validated. Prioritize load/import/review/scoring and dialog keyboard behavior across engines. |

## Feature order for beginners and experienced players

1. **Guided first game:** Learn Go exposes the fundamentals lessons on both
   start screens, and Lessons now opens a 9×9 practice board for both colors.
   Next add a guided first game. Keep Coach as the
   plain-language path and let players reveal technical detail when useful.
2. **Professional import compatibility:** GIB/NGF now work through normal
   file, drop, launch, and library/ZIP paths. Auto tries UTF-8 then Korean;
   other unmarked encodings require the explicit setting. Rejected archive
   games now report their count and first reason. A multi-game collection
   imports as one item that opens at its first game; measured on a three-game
   file, the row read "Alice vs Bob · 9 moves" and opened at move 3, because
   the move count spanned the file while every other reader described game one.
   The count now describes the game that opens, and import says when a file
   holds more. Saving such a record used to delete the games behind the one
   being edited -- 187 bytes of three games became 165 bytes of one, with no
   prompt and no undo -- so the trailing games are now carried across as the
   verbatim text nothing ever parsed. The collection's Library actions now
   split its games into a numbered folder while retaining the source record.
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
accessibility path remains incomplete. The remaining investigations above are
follow-up work beyond this audit’s wrap-up.
