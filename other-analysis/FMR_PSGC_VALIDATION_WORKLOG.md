# FMR coordinate validation worklog: PSGC cross-validation and final datasets

**Date:** 12 October 2026. This worklog records what was attempted, the issues
encountered, how each was addressed, and the pivots taken while validating the
FMR coordinate layers and building the per-document final JSON datasets. It is
written as a reference for parsing and validating similar budget-document
coordinate data in the future.

Starting point: both FMR coordinate normalizers were already deterministic and
reconciled ([HGAB flags](FMR_COORDINATE_REVIEW_FLAGS.md), [NEP flags](NEP_FMR_COORDINATE_REVIEW_FLAGS.md)), with 14 House GAB and 8 DBM NEP projects still flagged `needs_review` for printed-source coordinate anomalies. All amounts already tallied (₱19,628,100,000 across 964 House projects; ₱16,000,000,000 across 704 NEP projects; cross-stage control difference ₱3,628,100,000 reconciles). Nothing in this worklog changed any normalized value or flag.

## 1. Baseline verification first

Before adding anything, re-verify the claimed state. All of the following
passed at session start and still pass:

| Check | Command | Result |
|---|---|---|
| Workbench consistency | `python3 other-analysis/build_fmr_workbench.py --check` | pass |
| HGAB normalizer determinism | `python3 other-analysis/normalize_hgab_fmr_coordinates.py --check` | pass, 964 projects |
| NEP normalizer determinism | `python3 other-analysis/normalize_nep_fmr_coordinates.py --check` | pass, 704 projects |
| Python regressions | `python3 -m unittest discover -s other-analysis/tests -v` | pass (45 at start; 62 now) |
| Web tests | `npm test --prefix analysis/web` | 100/100 |
| Browser QA | `python scripts/check_fmr_pages.py` | pass at 390px/1440px, 149 PDF range responses |

Lesson: run the whole existing gate before touching anything; it defines the
invariants the new layers must preserve.

## 2. Decision rule for anomaly disposition

The flagged records split by an "identifiable pattern" test:

| Case | Rule | Outcome |
|---|---|---|
| Format-only quirks (DMS punctuation, comma-for-period, longitude-first, section labels) | Pattern uniquely determines the reading | Already normalized; image-verified for 16 NEP cells |
| Malformed digits with a unique valid reading under Philippine bounds | One candidate reading survives latitude 4–22 / longitude 116–127 | Candidate recorded, flag kept (3 HGAB cases: `14828381`, `123.691.92`, `7:005288`) |
| Anomalies where the printed value is itself valid but geographically absurd (e.g. latitude `4.606` in Quezon) | No repair is *required* to be valid; nothing is identifiable | Stays flagged |
| Multiple plausible repairs (`129.8030109` → any of 120.8…127.8) | Not identifiable | Stays flagged |

The uniqueness rule cuts both ways and is the correct discriminator: it
promotes nothing on its own, but it identifies which repairs are worth testing
against independent evidence.

## 3. PSGC reverse-geocoding as independent evidence

### Setup

- Submodule `dpwh_coor2psgc_geomapping` (declared in `.gitmodules`, already initialized).
- PSA 2023 PSGC shapefiles under `philippines-psgc-shapefiles/data/2023/`.
  The single-point engine (`geomap/geomap_core.py`) loads exactly four files:
  `Regions/PH_Adm1_Regions.shp.shp`, `Provdists/PH_Adm2_ProvDists.shp.shp`,
  `Municities/PH_Adm3_MuniCities.shp.shp`, `BgySubMuns/PH_Adm4_BgySubMuns.shp.shp`
  (note the doubled `.shp.shp` extension). Roughly 1.8 GB in total; hash those
  four only, not the whole tree (archive/duplicates exist alongside).
- API: `CombinedPSGCGeomapper(shapefile_dir).geomap_point(lat, lon)` returns
  `success`, `region/province/municipality/barangay` (+ `_psgc` codes). ~2–3 ms
  per point cold; ~3,450 points geocode in about 25 s including shapefile load.
- Dependencies: `geopandas`, `shapely`, `pandas` (already installed).

### Method

1. Read each flagged project's printed points from the normalized JSONs **by
   point ID** (`<project_id>:pointN`), never retyping coordinates.
2. Geocode each point; classify against the locality stated in the title:
   `AGREE` (municipality + province match), `PARTIAL`/`PARTIAL_PROVINCE_ONLY`
   (province only), `DISAGREE` (province differs), `NO_MATCH` (outside every
   administrative polygon — offshore).
3. Geocode each authored candidate repair the same way. A repair is supported
   when it lands in the title locality — ideally the exact title barangay.

### Results (all 22 flagged records + repairs, both layers)

- 13 of 14 flagged projects' candidate repairs land in the title municipality;
  most on the exact title barangay. Seven NEP rows repeat the same anomalous
  printed values as HGAB; both documents' values were geocoded independently.
- Tagumpay (`ib:p692:r16` / `nep_fmr:p24:r10`): both `4.6…` latitudes repaired
  to `14.6…` geocode to **Brgy. Tagumpay, Real, Quezon** — the user's
  missing-leading-`1` hypothesis, confirmed twice.
- Confirming repair examples: Escoda START `17.00918 → 18.00918` lands on
  Brgy. Escoda, Marcos; Buyon `18.8 → 16.8` on Brgy. Buyon, Cauayan City;
  Tampac I `129.8 → 120.8` on Brgy. Triala, Guimba; Basiao–Candiis
  `1.80 → 9.80` on Brgy. Candiis, Badian; the three San Luis, Batangas
  longitude `121.9 → 120.9` repairs land back in San Luis.
- Bonus findings beyond the flag list: Busay/Apale printed START
  `11.871556` is also offshore (repair `10.87` lands on Brgy. Apale); the
  Sinulatan First single point geocodes exactly to Brgy. Sinulatan 1st,
  Camiling, Tarlac (its flag is purely structural — no start/end roles).
- **One manual-review item:** `ib:p723:r3` (Construction of Purok Modelo -
  Purok Malipayon, Brgy. Bangbang FMR, Brgy. Bangbang, Matalam, Cotabato,
  ₱10,000,000; `HB_BUDGET/2 - HB 10858 VOL IB.pdf`, PDF page 723, printed
  page 707, table row 3; no NEP counterpart). Both endpoints — printed and
  repaired — land in M'Lang, Cotabato / Brgy. Dalipe. Province agrees,
  municipality does not; both points agree with each other, so no digit
  repair reconciles title and coordinates. Requires a map or DPWH road
  record, not a repair.

## 4. Provenance engineering (evidence-only layer)

Disposition decision (12 Oct 2026): keep normalized values and flags; add
hash-anchored evidence layers. Repaired coordinates remain labelled proposals.

**Update (13 Oct 2026) — review pass accepted PSGC-supported off-by-one digit
repairs.** Map and ledger review showed the huge endpoint spans (≈1° lon/lat
or missing leading digits such as `4.606` vs `14.606`, `129.8` vs `120.8`) are
not plausible FMR lengths. All REPAIR_MANIFEST entries that geocoded `AGREE`
against the title locality were promoted into the normalized numeric arrays via
`fmr_digit_repairs.py` (`off_by_one_digit_repair_accepted` /
`source_numeric_repair_accepted`). Immutable `coordinates_raw` is unchanged.
Remaining queue: `ib:p689:r18` (structural single-point) and `ib:p723:r3`
(Bangbang / M'Lang PARTIAL — still manual). NEP review queue cleared (0
`needs_review`).

`validate_fmr_coordinates_psgc.py` structure (the pattern to reuse):

- Coordinates and printed values are read from the normalized JSONs by project
  and point ID; the source of truth is never retyped in the script.
- An authored `REPAIR_MANIFEST` lists `(layer, project_id, point_id,
  description, expected printed coordinates, repaired coordinates)`.
- A **staleness guard** verifies every manifest entry against the current
  layers (project still flagged, point exists, printed coordinates match
  exactly) and refuses to build otherwise. This caught a real authoring error
  during development (wrong point ID for the Badian SEC2 END: `point3` vs
  actual `point4`).
- Audit metadata anchors: SHA-256 of both normalized layers, of the validator
  itself, the geomapper submodule commit, and the four shapefiles.
- `--check` recomputes everything, compares against committed outputs, and
  separately verifies every hash anchor is still fresh.
- Regression tests (`test_fmr_psgc_validation.py`, 9 tests) enforce anchor
  freshness, manifest–layer consistency, coverage of every flagged project in
  both layers, verdict exhaustiveness, CSV/JSON agreement, and the
  single-project manual-review queue.

Final state: 51 printed points + 23 candidate repairs; 22 `AGREE`, 1
`PARTIAL`; `manual_review_projects = ["ib:p723:r3"]`.

## 5. Per-document final datasets

Requirement: one consolidated **JSON** (not CSV) per source document, with
PSGC location data on **every** entry — not just flagged ones — for additional
review. The documents stay separate: HGAB and NEP are different legislative
artifacts with their own trees, pages, amounts, and review evidence; any
cross-document comparison belongs to a separate analysis pass.

`build_fmr_final_dataset.py` emits:

| Output | Coverage |
|---|---|
| `data/hgab_fmr_final_dataset.json` | 964 projects, ₱19,628,100,000, 2,007 points (1,990 geocoded) |
| `data/nep_fmr_final_dataset.json` | 704 projects, ₱16,000,000,000, 1,444 points (1,434 geocoded) |

Each project entry: title, amount, region (+code), status and all flag layers,
immutable `coordinates_raw`, normalized `coordinates` by segment, source
lineage (PDF, PDF page, printed page, table row, bbox), parsed title locality
recorded verbatim, per-point PSGC results (names + PSGC codes), per-point
verdicts, and a project-level `location_agreement`:

`ALL_POINTS_AGREE` / `MIXED` / `AGREE_MUNI_BRGY_DIFFERS` /
`PARTIAL_PROVINCE_ONLY` / `DISAGREE` / `NO_MATCH` / `NO_POINTS`.

Current distribution — HGAB: 510 / 347 / — / 62 / 44 / 1; NEP: 346 / 270 / — /
54 / 32 / 2. These are review screens, not verified locations.

Builder guardrails: anchor verification (against the evidence audit) runs
**before** any output; `--check` compares full serialized output byte-for-byte;
both outputs are git-ignored as derived artifacts; 8 further regression tests
(`test_fmr_final_dataset.py`).

## 6. Title-locality parsing heuristics

FMR titles reliably end `..., <locality fragments>, <town>, <province>`
(comma-split is safe; a tail scan across all 1,668 titles showed no
locality-bearing final component).

- Province: last component (recorded verbatim; OCR quirks like NEP's
  `Tiocos Sur` and one truncated empty province are surfaced by `parse_note`,
  not corrected).
- Town: scanning back from the province, the first component that is **not**
  a barangay/sitio/purok fragment and carries no `FMR` suffix. Town is
  sometimes omitted for city localities; then `parse_note` explains it.
- Barangays: FMRs commonly connect **two** barangays, so collect *every*
  `Brgy./Barangay/Sitio/Purok` fragment anywhere before the town, split on the
  label tokens, strip connector words (`and`, `&`, `to`) and separators.
  Matching accepts a geocoded barangay hit on **any** named fragment.
- Name normalization for comparison: casefold; drop `City of`/`city`;
  `Sta.`/`Sto.` expansions; apostrophe handling for `M'Lang`/`Malang`;
  containment match in either direction.

Initial last-barangay-only matching wrongly downgraded two-barangay roads to
`MIXED` (383 HGAB projects); collecting all fragments and accepting any hit
restored 36 of them to `ALL_POINTS_AGREE` (final: 347 `MIXED`, 510 `ALL_POINTS_AGREE`).

## 7. Issues encountered and resolutions

| # | Issue | Resolution |
|---|---|---|
| 1 | Shell working directory persisted from a `cd` into the submodule, so a later relative-path run failed | Run long jobs with absolute `cd /repo && …`; remember terminal cwd is sticky |
| 2 | Browser QA exceeded the 30 s foreground window and was backgrounded | Used AwaitShell to poll to completion (62 s; healthy exit) |
| 3 | Repair manifest referenced the wrong point ID (`ib:p713:r3:point3` instead of `point4` for the Badian SEC2 END) | Staleness guard caught the printed-coordinate mismatch before any output; corrected the ID |
| 4 | Validator hash anchor went stale because the validator was edited after the audit was written | Rebuild-after-edit discipline; tests now assert anchor freshness so drift fails loudly |
| 5 | Initial validator skipped NEP mirrors of HGAB anomalies; the coverage test failed (`nep_fmr:p11:r11` missing) | Pivot: every flagged row in **both** documents is a distinct printed observation; validate and geocode each independently |
| 6 | First merged-dataset build classified everything `NO_MATCH` | The builder stored the geocode verdict under `match` but classification read `success`; aligned the key |
| 7 | A file write went to a wrong path outside the repo | Moved the file into place and removed the stray directory; verified with a syntax/lint pass |
| 8 | Title parser captured town and province but never the barangay | Scan the component immediately before the town for a `Brgy.` fragment |
| 9 | Two-barangay titles matched only the last barangay, inflating `MIXED` | Collect all title barangays; accept a match on any |
| 10 | Splitting `"Brgy. Escoda and Brgy. Elizabeth"` left `"Escoda and"` | Strip trailing/leading connector words after label-token splitting |
| 11 | `NameError` after refactoring to a barangay list (`brgy` reference left behind) | Flake8 `--select=F` before every run; fixed the reference |
| 12 | `--check` reported drift after parser improvements | Expected behavior: `--check` guards committed artifacts; rebuild after intentional logic changes, never hand-edit outputs |
| 13 | Test assertion bug: `assertLess(set(verdicts), {"AGREE"})` for `MIXED` | Corrected to "contains an AGREE* verdict and is not all-AGREE", matching the builder's definition |

## 8. Pivots

1. **From "are the flags legitimate?" to "can independent evidence resolve
   them?"** — the uniqueness-under-PH-bounds analysis alone was suggestive;
   PSGC reverse-geocoding turned 13 repairs into evidence-backed candidates.
2. **From one-off validation script to provenance layer** — the first
   validator hardcoded coordinates for speed; the durable version anchors
   everything to point IDs and hashes so it survives upstream rebuilds.
3. **From HGAB-only flagged coverage to both layers** — repeated anomalous
   values in NEP are themselves distinct printed observations worth geocoding.
4. **From one merged dataset to per-document datasets** — different documents
   get different release artifacts; comparison is a separate pass. The shared
   entry schema keeps that future pass cheap.
5. **From flagged-only geocoding to whole-corpus geocoding** — per-request,
   every point now carries PSGC data, which surfaces non-flagged review
   targets (title-vs-coordinate conflicts like a Sablan-titled project landing
   in La Union, or truncated province names in titles).

## 9. Reusable checklist for similar work

1. Run the full existing verification gate; record the baseline.
2. Separate "extraction correctness" from "printed-source anomalies"; never
   let the normalizer silently repair the latter.
3. Prefer decision rules that fail closed: uniqueness of the repaired reading
   under hard bounds (Philippine lat/long envelope) before anything else.
4. Use PSGC (or equivalent administrative-boundary) reverse-geocoding as the
   independent, title-vs-location check; `NO_MATCH` offshore is a strong
   transcription-defect signal; exact barangay agreement is a strong repair
   signal.
5. Anchor every evidence layer: source point IDs (never retyped values),
   SHA-256 of inputs, tooling, and reference data; verify anchors before
   writing outputs and in `--check`.
6. Author repair manifests with expected printed values so staleness is
   detectable; refuse to build on mismatch.
7. Keep evidence layers write-only relative to the normalized data: raw text
   immutable, repairs labelled proposals, flags unchanged.
8. One release artifact per source document; hash-anchored lineage in
   metadata; byte-identical `--check`.
9. Wrap new parsers in pure-function tests (fixtures inline) plus
   corpus-level invariants (coverage, sums, verdict consistency) so logic
   changes are caught both ways.
10. Expect shell-environment friction (sticky cwd, backgrounded long jobs)
    and lint/syntax checks before every execution.

## 10. Artifacts and commands

| Artifact | Role |
|---|---|
| `validate_fmr_coordinates_psgc.py` | Flagged-coordinate PSGC evidence layer (manifest, staleness guard, hash anchors) |
| `data/fmr_psgc_validation.json` / `data/fmr_psgc_validation_points.csv` | Evidence audit and point table |
| `build_fmr_final_dataset.py` | Per-document final dataset builder (all-point PSGC, title parsing, agreement classes) |
| `data/hgab_fmr_final_dataset.json`, `data/nep_fmr_final_dataset.json` | Release artifacts (git-ignored, rebuilt) |
| `tests/test_fmr_psgc_validation.py`, `tests/test_fmr_final_dataset.py` | 17 new regressions (suite total 62) |

```sh
# Evidence layer
python3 other-analysis/validate_fmr_coordinates_psgc.py            # rebuild (~30 s)
python3 other-analysis/validate_fmr_coordinates_psgc.py --check

# Final per-document datasets (~25–60 s each rebuild; loads ~1.8 GB shapefiles)
python3 other-analysis/build_fmr_final_dataset.py
python3 other-analysis/build_fmr_final_dataset.py --check

# Full gate
python3 -m unittest discover -s other-analysis/tests -v
python3 other-analysis/build_fmr_workbench.py --check
```
