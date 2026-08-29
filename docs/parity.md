# Gates and parity

What has to pass before a change lands here, where each check runs, and how
that compares with the two sibling repos. Written because the checks drifted
apart three times without anyone noticing -- a deploy that ran none of them, a
CI job on a different Node major than the thing it shipped, and a browser suite
wired into no workflow at all.

## Running everything locally

```bash
npm run verify          # typecheck, test:typecheck, lint, test, build
npm run audit           # dependency audit; not part of verify, runs in CI
npm run test:viewport         # headless Chrome over raw CDP, 8 viewports
```

**Check the exit code, not the output.** `npm run verify | grep -q ...` keys off
grep's status, not the gate's; that mistake put a commit over a failing
typecheck during this work. Run the gate, then read `$?`.

Tests live in both `src/` and `test/`, so `test:typecheck` covers the second
location; `typecheck` alone would miss it.

## Where each check runs

| check | `verify` | `ci.yml` (pull requests) | deploy (push to `main`) |
| --- | --- | --- | --- |
| typecheck / lint / unit tests | yes | via `verify` | yes |
| `audit` | no | yes | yes |
| browser suite (`test:viewport`) | no | **yes** | **no** |

The last row is the one to remember: **a push to `main` does not run the browser
suite.** It runs the deploy workflow, which does not include it. Trigger
`ci.yml` on `main` via `workflow_dispatch` if you need that coverage after a
direct push.

## How the three compare

The sibling repos are `web-chess`, `web-katrain` and `web-xiangqi`. They are
independent apps with the same shape, so most divergence is fine and some is
not. This section lists what actually differs, measured rather than remembered,
and says which side of that line each item falls on.

| | web-chess | web-katrain | web-xiangqi |
| --- | --- | --- | --- |
| `verify` steps | typecheck, lint, test, build | typecheck, test:typecheck, lint, test, build | typecheck, lint, test, openings, library, smoke, parity, build:react |
| Browser suite | `test:ui:browser` (Playwright) | `test:viewport` (raw CDP, no dependency) | `test:ui:layout` (Playwright) |
| Where the browser suite runs | `ci.yml` | `ci.yml` | `ci.yml` |
| Node in CI / deploy | 20 / 20 | 24 / 24 | 20 / 20 |
| Deploy gates | audit, lint, test, build | audit, lint, test:typecheck, test, build | audit, build (WASM), verify |
| Hostile-input sweep | `src/__fuzz.test.ts` | `src/__fuzz.test.ts` | `src/__fuzz.test.ts` |
| Where the ceilings sit | search query; library PGN 512KB; backup 8MB; auto-save 2MB | search query; auto-save 5MB; model upload 128MB; verdict scan 4000 nodes | search query; **import text 200KB, UCI moves 1024, tree nodes 1024** |

**Deliberate, leave alone.** The `verify` lists differ because the apps differ:
only web-xiangqi has a WASM engine to smoke-test and an opening book to check.
web-katrain drives Chrome over raw CDP instead of Playwright, which is why it
carries no browser dependency at all. Node 24 in web-katrain against 20 in the
other two is a per-repo pin, not drift -- what matters is that CI and deploy
agree *within* a repo, and all three now do.

**Not deliberate, and worth fixing.**

1. **A push to `main` runs no browser suite anywhere.** `ci.yml` is
   pull-request-only in all three, and no deploy workflow runs a browser test.
   Green CI on `main` therefore means less than it appears to. `ci.yml` accepts
   `workflow_dispatch`, so it can be triggered on `main` by hand as a stopgap.
2. **Only one repo caps input *before* it parses it.** All three have ceilings,
   but they sit in different places: web-chess and web-katrain bound what they
   *write* (auto-save, backups, uploads), while web-xiangqi also bounds what it
   *reads* -- import text at 200KB, UCI moves and tree nodes at 1024 -- so
   hostile input is rejected by a length check instead of being walked. The
   hostile-input sweeps put numbers on it: the same class of input clears
   web-xiangqi in 7ms and web-katrain in 30ms. Neither is a bug today; 30ms is
   nowhere near a stutter. The read-side ceiling is the cheaper design and is
   the thing to port.

**The rule this file exists to enforce:** any check that a sibling has and this
repo does not should be either adopted or explained here. The gaps found this
way so far were a deploy that ran no checks at all, a CI/deploy Node split
inside one repo, and a browser suite that ran in no workflow.
