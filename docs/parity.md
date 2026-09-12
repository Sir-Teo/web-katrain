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
npm run test:viewport    # headless Chrome over CDP, 11 viewports and interaction checks
npm run test:responsiveness  # production response budgets; uses the build above
npm run test:study       # deep study correctness and operation timings
```

**Check the exit code, not the output.** `npm run verify | grep -q ...` keys off
grep's status, not the gate's; that mistake put a commit over a failing
typecheck during this work. Run the gate, then read `$?`.

Tests live in both `src/` and `test/`, so `test:typecheck` covers the second
location; `typecheck` alone would miss it.

## Where each check runs

| check | `verify` | `ci.yml` (pull requests **and pushes to `main`**) | deploy (push to `main`) |
| --- | --- | --- | --- |
| typecheck / lint / unit tests | yes | via `verify` | yes |
| `audit` | no | yes | yes |
| browser suite (`test:viewport`) | no | yes | no |

The browser step is enabled. The former first-mobile failure was reproduced
with a cold Vite cache: starting analysis discovered worker dependencies,
reloaded the page, and caused the QA helper to replay its interrupted checks
before the UI mounted. Startup optimization and explicit navigation readiness
fix those causes. Each run now uses a fresh dependency cache and Chrome profile;
CI retains screenshots on failure. The first GitHub-hosted run of this local
fix remains unverified. See [the audit](continuous-audit.md) for evidence.

```bash
npm run test:viewport                        # about 3 minutes locally
VIEWPORT_CPU_THROTTLE=6 npm run test:viewport  # optional slower-CPU diagnostic
```

`ci.yml` does now run on pushes to `main` as well as on pull requests, which is
what the row above it records; that part of the earlier fix stands.

The browser suite runs in CI separately from deployment. A failed browser
check does not currently stop the deployment workflow from publishing.

## How the three compare

The sibling repos are `web-chess`, `web-katrain` and `web-xiangqi`. They are
independent apps with the same shape, so most divergence is fine and some is
not. This section lists what actually differs, measured rather than remembered,
and says which side of that line each item falls on.

| | web-chess | web-katrain | web-xiangqi |
| --- | --- | --- | --- |
| `verify` steps | typecheck, lint, test, build | typecheck, test:typecheck, lint, test, build | typecheck, lint, test, openings, library, smoke, parity, build:react |
| Browser suite | `test:ui:browser` (Playwright) | `test:viewport` (raw CDP, no dependency) | `test:ui:layout` (Playwright) |
| Where the browser suite runs | `ci.yml` (PRs + main) | `ci.yml` (PRs + main) | `ci.yml` (PRs + main) |
| Node in CI / deploy | 20 / 20 | 24 / 24 | 20 / 20 |
| Deploy gates | audit, lint, test, build | audit, lint, test:typecheck, test, build | audit, build (WASM), verify |
| Hostile-input sweep | `src/__fuzz.test.ts` | `src/__fuzz.test.ts` | `src/__fuzz.test.ts` |
| Where the ceilings sit | search query; library PGN 512KB; backup 8MB; auto-save 2MB | search query; SGF import 5MB; auto-save 5MB; model upload 128MB; verdict scan 4000 nodes | search query; **import text 200KB, UCI moves 1024, tree nodes 1024** |

**Deliberate, leave alone.** The `verify` lists differ because the apps differ:
only web-xiangqi has a WASM engine to smoke-test and an opening book to check.
web-katrain drives Chrome over raw CDP instead of Playwright, which is why it
carries no browser dependency at all. Node 24 in web-katrain against 20 in the
other two is a per-repo pin, not drift -- what matters is that CI and deploy
agree *within* a repo, and all three now do.

**Not deliberate, and worth fixing.**

1. ~~**A push to `main` runs no browser suite anywhere.**~~ **Fixed.** `ci.yml`
   was pull-request-only in all three and no deploy runs a browser test, so
   green CI on `main` meant less than it appeared to. All three now also run
   `ci.yml` on pushes to `main`. It was originally made PR-only because an
   *unrestricted* `push` trigger double-fired alongside `pull_request` on the
   same branch; scoping the trigger to `main` gives the coverage without the
   duplication.
2. **Keep import limits ahead of expensive parsing.** Web-katrain now checks
   SGF imports against a 5 MB limit before parsing. Limits bound resource use;
   they do not replace deep-tree correctness checks within the accepted size.

**The rule this file exists to enforce:** any check that a sibling has and this
repo does not should be either adopted or explained here. The gaps found this
way so far were a deploy that ran no checks at all, a CI/deploy Node split
inside one repo, and a browser suite that ran in no workflow.
