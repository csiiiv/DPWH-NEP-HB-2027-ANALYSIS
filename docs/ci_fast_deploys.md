# Fast, incremental deployments — local pregeneration + change-aware CI

Status: **implemented** (2 November 2026) on the architecture:

**Local data processing → commit generated datasets → GitHub Actions validates
committed artifacts and builds the site → deploy to GitHub Pages.**

The build machine no longer regenerates datasets. Frontend-only deploys run a
fast path; data/generator/source/pipeline changes escalate validation
automatically, and a full comprehensive path remains one `workflow_dispatch`
click away.

## What changed

| Area | Before | After |
|---|---|---|
| `npm run build` | ran `prebuild` chain: ~15 dataset generators + vite | **vite only** (≈13 s) |
| `npm run dev` | ran `predev` chain before every dev session | prints a hint; dev serves existing artifacts |
| Data generation | implicit in npm lifecycle hooks | explicit **`npm run generate:data`** (plus `:workbenches` / `:congress` subsets) |
| Derived artifacts | gitignored, rebuilt in CI every deploy | **committed**; freshness gated by `scripts/derived_artifacts.py` |
| Packaging | `build_pages.py` re-ran generators while packaging | `--no-regenerate` consumes committed artifacts; default still regenerates for compatibility |
| CI | one monolithic 18-minute path for every push | change-aware `fast` / `data` / `comprehensive` levels |
| Master-list viewer | rebuilt (≈4 min) + full unittest suite every deploy | committed 82 MB viewer reused; data tests run only when `master_list/**` changes |
| Playwright | full 10-script suite every deploy | smoke subset on `fast`; full suite on `data`/`comprehensive` |

## Daily workflow

### Frontend-only change (components, styles, routes, site pages)

```bash
npm run build --prefix analysis/web   # vite only, no data regeneration
python3 scripts/build_pages.py --with-react --no-regenerate
git commit && git push
```

CI picks the `fast` level: derived-artifact gates → SPA build + unit tests →
package → smoke browser checks → deploy.

### Data or generator change

```bash
cd analysis/web
npm run generate:data        # full chain (workbenches → congress lenses → exports)
# or selective:
npm run generate:data:workbenches
npm run generate:data:congress
git add -A && git commit && git push
```

Commit the refreshed derived artifacts **in the same push**. CI detects the
`data`/`generators` change, re-verifies accounting gates and runs the full
browser suite. A generator change pushed without refreshed artifacts fails the
fast gate with the exact rebuild command:

```
FAIL comparison_projects_2027.json: input stage_trace_2027.json changed since
this artifact was built — rerun node analysis/web/buildComparisonData.mjs and
commit the refreshed artifact
```

### Raw source change (PDFs, OCR trees, API snapshots)

Regenerate everything downstream (`npm run generate:data`, plus the annex
builders listed in `scripts/derived_artifacts.py`), commit, push. CI runs the
comprehensive level (native extraction checks, FMR shapefile pipeline, NIA/HFEP
suites, master-list tests).

### Manual full verification

Actions → *Publish dashboards* → *Run workflow* → validation: `comprehensive`
(or `fast` to force the quick path).

## Freshness gates (`scripts/derived_artifacts.py`)

The registry maps every derived artifact to its producing command. On every
deployment it verifies:

1. the artifact exists and is non-empty;
2. artifacts carrying `input_provenance` / `input_sha256` blocks pin their
   inputs' **current** SHA-256 (provenance claims checked against bytes);
3. `--deep` (comprehensive level) additionally runs the FMR/NIA/HFEP
   workbenches' own `--check` modes.

Run locally at any time:

```bash
python3 scripts/derived_artifacts.py          # fast
python3 scripts/derived_artifacts.py --deep   # + workbench --check modes
```

## Committed derived artifacts

Formerly gitignored, now committed (see `.gitignore` — retired rules are
commented out for history): comparison overview/projects/highlights (≈69 MB
together), main overview, DPWH flow, budget-flow and hierarchy sources, the
comparison CSV, FMR/NIA/HFEP/GPS workbenches, FMR final datasets, FMR PSGC
locations, the four Congress indexes + map bridge, and the 82 MB master-list
viewer (already committed). Master-list `processing/` and `cleaned/` releases
remain local-only — they are inputs to `generate:data:congress`, rebuilt on
demand; the committed location index pins their hashes so CI verifies
consistency without needing the files.

## CI change detection (`.github/workflows/pages.yml`)

`dorny/paths-filter` classifies each push/PR:

| Filter | Paths | Escalates to |
|---|---|---|
| `frontend` | `analysis/web/src`, vite config, package files, `site/`, `disclaimer/` | `fast` |
| `data` | `analysis/data`, annex `data/` dirs, `master_list/data`, `analysis/viewers` | `data` |
| `generators` | `build*.mjs/.py`, `analysis/builders`, `master_list/scripts`, `DEO2LEG`, `PSGC2LEG` | `comprehensive` |
| `sources` | `HB_BUDGET*`, `dbm-*`, transparency snapshot, shapefile submodule | `comprehensive` |
| `pipeline` | `scripts/**`, the workflow itself | `comprehensive` |

Levels: `fast` (gates + build + unit tests + package + smoke) < `data`
(+ current-pages accounting, stage-trace, static-page tests, full browser
suite) < `comprehensive` (+ native House rollup checks with PDFs, FMR
shapefile pipeline, NIA/HFEP suites, master-list tests, deep workbench
checks). Shared-dependency safety: every level runs the derived-artifact gates
and the full unit-test suite; nothing skips integrity verification.

Concurrency now cancels obsolete runs on the same ref
(`cancel-in-progress: true`); PR validation runs in the same group as its
push, so a superseded commit's deploy is cancelled, never an unrelated PR's.

## Timings

Baseline before refactor (green run 41334400393, 2026-11-01): **18 m 2 s**
total — React build+tests 332 s, master-list viewer+tests 247 s, browser
checks 248 s, packaging 39 s, PSGC shapefile setup ~46 s, extraction checks
~95 s.

Fast path estimate (no shapefiles, no viewer rebuild, no comprehensive
suites, smoke browser subset): setup ≈60 s, gates ≈30 s, `npm ci`+build+unit
tests ≈180 s, packaging ≈40 s, smoke ≈120 s, upload+deploy ≈30 s →
**≈ 7–8 minutes** (deploy of a ≈950 MB artifact dominates; see future work).
Measured numbers land in the job summary of each run
(*Write timing summary* step) for regression tracking.

## Verification performed

- `npm run build` without hooks: vite build completes in ≈13 s.
- `npm test`: 500 tests, 496 pass, 4 skipped (data-optional suites now run
  against committed artifacts).
- `build_pages.py --with-react --no-regenerate`: packages cleanly from
  committed artifacts; all twelve SPA payloads byte-equivalent (modulo
  `built_at`) to the regenerating path.
- `check_react_pages.py` smoke suite against the packaged site: pass.
- Negative test: tampering `stage_trace_2027.json` makes the gates fail with
  the exact rebuild command, exit code 1.

## Remaining bottlenecks / future work

- The ≈950 MB Pages artifact (PDFs dominate) sets a floor on upload/deploy
  time; consider a separate data/artifact store only if measurements demand it.
- `master_list/data/cleaned/` (≈89 MB) is still local-only; committing it
  would let CI verify the location-lens chain end-to-end without local builds.
- Windows/local rebuilds of the FMR final datasets need the PSGC shapefile
  submodule; CI comprehensive path already handles this.
- `npm test` runtime (~80 s) is dominated by suites that rehydrate the 50 MB
  comparison payload; candidate for selective test levels later.
