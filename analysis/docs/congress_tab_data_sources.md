# Congress tab — data sources and map overlays

Updated: **2 November 2026**.

This is the catalog for the Congress workspace (`#congress/…`): which retained
files each tab loads, which builders produce them, how the nationwide map
layers relate to those indexes, and which method docs govern the numbers.

Nothing on these tabs establishes that a representative requested, sponsored,
selected, or controls a project or amount. Cards and markers report where the
budget documents and geographic evidence place the work.

For citizen/journalist download picks, see
[shareable_datasets_by_page.md](shareable_datasets_by_page.md) § Congress.
For suite-wide provenance, see [data_provenance_map.md](data_provenance_map.md).

---

## 1. Workspace map

Five tabs; `#congress/district` is a deep-link page only (opened from a card),
never a nav tab.

| Route | Label | What it shows | Primary packaged artifact |
| --- | --- | --- | --- |
| `#congress` / `#congress/home` | Districts (DEO) | DPWH comparison rows by implementing office → legislative district (DEO2LEG tiers) | `congress_district_index_2027.json` |
| `#congress/location` | Districts (Legislative) | Same ledger, resolved once through title PSGC → DEO → region → unassigned | `location_district_index_2027.json` |
| `#congress/fmr` | FMR (Legislative) | DA farm-to-market-road annex rows by title/coordinate → district | `fmr_legislative_index_2027.json` |
| `#congress/mpb` | MPB (Legislative) | DPWH multi-purpose-building scope; **reuses** location-lens `row_resolution` | `mpb_legislative_index_2027.json` |
| `#congress/map` | Map | Nationwide district polygons + FMR segments + MPB title GPS / PSGC-approx / leftover badges | indexes above + map supplements (below) |

Shared UI shell: `analysis/web/src/CongressApp.jsx`. Map stage:
`CongressMap.jsx` + `congressMapModel.js` + `mpbSegmentOverlay.js` /
`fmrSegmentOverlay.js`.

Explorer rows always hydrate from the underlying stage ledgers (DPWH
`comparison_projects_2027.json` or FMR `other-analysis/data/fmr_workbench.json`);
indexes carry **row IDs and rollups**, not duplicated project bodies.

---

## 2. Shared foundations

| Layer | Artifact | Role |
| --- | --- | --- |
| DPWH comparison ledger | `analysis/data/comparison_projects_2027.json` (+ overview) | One linked House↔NEP row grain for DEO / location / MPB lenses |
| FMR workbench | `other-analysis/data/fmr_workbench.json` | House/NEP FMR projects + comparison for the FMR lens and map segments |
| DEO ↔ district crosswalk | `DEO2LEG/outputs/deo_leg_crosswalk.json` (schema 2.1.0) | Office groups, 254 seats, roster metadata for DEO lens + card descriptors |
| PSGC ↔ district | `PSGC2LEG/` assignments + viz | Title/coordinate district targets; map polygons |
| District polygons + hues | `PSGC2LEG/viz/leg_districts.geojson`, `province_hues.json` | Map choropleth base (packaged beside analysis assets) |
| Portraits | `analysis/data/congress_portraits/` | WebP faces; hash-checked at package time, not rebuilt every deploy |
| 254-seat catalog | Embedded in Congress / location indexes as `districts` | Single roster every lens copies for card headings |

Honesty annotations that travel with every lens: Tier A/B / residual rules on
the DEO lens; disagreement flags on the location lens; FMR title↔coordinate
conflict flags; MPB scope rule (`pap` / `title` / both). Matching remains
provisional (`comparison_ready: false` upstream).

---

## 3. Per-tab builders and method docs

| Tab | Builder | Output | Method |
| --- | --- | --- | --- |
| Districts (DEO) | `analysis/web/buildCongressIndex.mjs` | `congress_district_index_2027.json` | [congress_district_index_method.md](congress_district_index_method.md) |
| Districts (Legislative) | `analysis/web/buildLocationLens.py` | `location_district_index_2027.json` (+ writes map id bridge) | [location_district_lens_method.md](location_district_lens_method.md) · title/PSGC evidence: [title_psgc_location_extraction_method.md](title_psgc_location_extraction_method.md), [psgc_location_evidence_resolution_method.md](psgc_location_evidence_resolution_method.md) |
| FMR (Legislative) | `other-analysis/build_fmr_psgc_locations.py` then `analysis/web/buildFmrLegislativeLens.py` | `fmr_legislative_index_2027.json` | [fmr_legislative_lens_method.md](fmr_legislative_lens_method.md) · [fmr_psgc_location_extraction_method.md](fmr_psgc_location_extraction_method.md) |
| MPB (Legislative) | `analysis/web/buildMpbLegislativeLens.py` | `mpb_legislative_index_2027.json` | [mpb_legislative_lens_method.md](mpb_legislative_lens_method.md) |
| Map id bridge | emitted by location builder | `congress_district_map_2027.json` | Bridges viz feature ids ↔ `leg_id` used by cards |
| MPB PSGC approx (map only) | `analysis/web/buildMpbPsgcApproxOverlay.py` | `mpb_psgc_approx_overlay_2027.json` | This document §5.2 (supplement; does **not** mutate the MPB index) |

Packaging entry point: `scripts/build_pages.py` → `package_congress()`. Rebuild
order is fixed: DEO index → location (+ map bridge) → FMR PSGC refresh + FMR
index → MPB index → PSGC-approx overlay (rebuild when 2023 shapefiles are
present; otherwise ship the committed JSON) → copy PSGC2LEG viz assets.

Approximate retained counts (FY2027 artifacts as of this doc’s date; rebuilds
may move them slightly):

| Artifact | Snapshot |
| --- | --- |
| DEO index | 196 cards · 254 districts · 159 Tier A / 32 Tier B |
| Location index | 439 cards + 18 region cards · 16,481 located rows |
| FMR legislative | 202 cards · 1,059 rows · 1,006 on district cards |
| MPB legislative | 266 cards · 6,123 in-scope rows · 1,827 with title coordinates |
| MPB PSGC approx | 3,376 markers · 4,251 rows placed · 45 unplaced |

---

## 4. What the SPA loads

### 4.1 Lens tabs

| Load | When | Used for |
| --- | --- | --- |
| `congress_district_index_2027.json` | DEO tab / district deep-link | Cards, tiers, residuals |
| `location_district_index_2027.json` | Location tab | Cards + assignment-basis explorer |
| `fmr_legislative_index_2027.json` | FMR tab | Cards + FMR explorer / segment modals |
| `mpb_legislative_index_2027.json` | MPB tab + Map MPB layers | Cards, `row_points`, class buckets for badges |
| `comparison_projects_2027.json` | On demand (export / drawer hydrate) | Full DPWH row bodies |
| `other-analysis/data/fmr_workbench.json` | On demand for FMR explorers / map FMR overlays | FMR project geometry + amounts |
| `analysis/congress_portraits/<slug>.webp` | Card headings | Roster faces |

### 4.2 Map tab (`#congress/map`)

| Load | Role |
| --- | --- |
| `PSGC2LEG/viz/leg_districts.geojson` | District polygons |
| `PSGC2LEG/viz/province_hues.json` | Province hue table (adjacency-aware) |
| `congress_district_map_2027.json` | Feature ↔ `leg_id` bridge + roster fields for info panel |
| `mpb_legislative_index_2027.json` | Title-GPS points + district badge denominators |
| `mpb_psgc_approx_overlay_2027.json` | Collapsed PSGC-centroid markers (optional fetch; map degrades if absent) |
| FMR workbench (via map parent) | Accepted-geometry FMR segments / repair links |
| DPWH comparison rows with `row_points` | Solid MPB title-GPS boxes |

Layer toggles persist in the URL (`objects=`, `types=`). Defaults: districts,
FMR classes, MPB title-GPS classes, MPB approx classes, and stacked unmapped
class chips **on**; the red unmapped **total** chip is opt-in.

---

## 5. Nationwide map layers (detail)

### 5.1 District fill

Province-hued polygons from the PSGC2LEG viz geojson, coloured in the client
(`colorDistrictFeatures`). Click opens the district info panel and can deep-link
into a Congress card. This is geography context, not an allocation choropleth.

### 5.2 FMR overlay

Straight-line segments and endpoints from the FMR workbench / legislative
index geometry at the **accepted (reviewed) reading**, coloured by House-only /
NEP-only / paired vocabulary (`DISTRICT_SEGMENT_CLASSES`); matched pairs
therefore draw at their corrected position. Where an accepted digit repair
moved a point, the incorrect original position is retained as a red marker
("FMR corrections" subtype: *Incorrect original coordinate*) with a dashed
link back to the accepted position. Clicking a feature opens the ordinary
FMR evidence path.

### 5.3 MPB title GPS (solid boxes)

Rows with retained title-printed coordinates from `mpb_legislative_index_2027.json`
→ `row_points`. Rendered as solid class-coloured squares (`MPB_POINT_CLASSES`:
House-only blue, NEP-only teal, paired purple). These are the only MPB markers
that claim a printed coordinate in the title text.

### 5.4 MPB PSGC approx (class color + light gray slash)

**Supplement file:** `mpb_psgc_approx_overlay_2027.json`

**Builder:** `analysis/web/buildMpbPsgcApproxOverlay.py`

**Inputs:** committed MPB index (`row_psgc` / resolution targets) + 2023 PSA
barangay and municipality shapefiles under
`dpwh_coor2psgc_geomapping/philippines-psgc-shapefiles/data/2023/` (with the
same vintage→modern PSGC prefix bridges PSGC2LEG viz uses).

**Rule:** for every in-scope MPB row that prints **no** title coordinate, if
its title-PSGC (or committed location target) is a barangay / municipality /
city with a polygon, place it at that polygon’s centroid. Many rows at one
PSGC code collapse to **one marker** with `counts` by House-only / NEP-only /
paired. Province-only and unresolved rows stay in `unplaced_row_ids`.

**Map style:** class fill + a single light-gray diagonal slash (sprite
`mpb-approx-marker-…`). Count chips are smaller than district unmapped badges;
singles match solid-box visual weight. Click opens `MpbApproxClusterModal`
(title, NEP/HGAB3 amounts, PDF source buttons, open-full drawer).

**Not claimed:** survey GPS, surveyed site accuracy, or a change to the MPB
legislative index. The base index is never mutated; district money and card
membership stay on the lens artifacts.

### 5.5 MPB still-unplaced district badges

Stacked class chips at legislative-district centroids for MPB rows that have
**neither** title GPS **nor** a PSGC-approx placement. The map passes
approx-placed row ids into `mpbUnmappedDistrictBadges(…, excludeRowIds)` so the
two layers never double-count. Subtype toggles mirror House / NEP / paired;
the red Σ total square is optional.

Status line wording: “MPB approx. (PSGC)” vs “MPB still unplaced”.

---

## 6. How the layers partition one MPB population

```text
MPB in-scope rows (mpb_legislative_index_2027.json)
├─ with title coordinates ──────────► solid GPS boxes (§5.3)
└─ without title coordinates
   ├─ barangay/municipality/city PSGC ─► approx markers (§5.4)
   └─ province-only / unresolved ──────► district leftover badges (§5.5)
```

Card money on `#congress/mpb` is unchanged by map placement. Approx markers
are a cartographic aid for rows the documents locate by place-name but not by
printed decimal coordinates.

---

## 7. Rebuild and verify

From the repository root (also run inside packaging):

```bash
node analysis/web/buildCongressIndex.mjs
python3 analysis/web/buildLocationLens.py
python3 other-analysis/build_fmr_psgc_locations.py
python3 analysis/web/buildFmrLegislativeLens.py
python3 analysis/web/buildMpbLegislativeLens.py
python3 analysis/web/buildMpbPsgcApproxOverlay.py          # needs 2023 shapefiles
python3 analysis/web/buildMpbPsgcApproxOverlay.py --check  # drift vs committed
python3 scripts/build_congress_portraits.py --check
```

Frontend tests covering map models and sprites:
`analysis/web/src/congressMapModel.test.js`,
`mpbSegmentOverlay.test.js`, `congressLocationIndex.test.js`.

---

## 8. Related docs

| Doc | Covers |
| --- | --- |
| [congress_district_index_method.md](congress_district_index_method.md) | DEO lens join, tiers, residuals |
| [location_district_lens_method.md](location_district_lens_method.md) | DPWH title-PSGC resolution chain |
| [fmr_legislative_lens_method.md](fmr_legislative_lens_method.md) | FMR district assignment |
| [mpb_legislative_lens_method.md](mpb_legislative_lens_method.md) | MPB scope + resolution reuse |
| [mm3_deo_district_allocation_validation.md](mm3_deo_district_allocation_validation.md) | External DEO allocation cross-check |
| [DEO2LEG/README.md](../../DEO2LEG/README.md) | Authorized DEO-lens use conditions |
| [PSGC2LEG/README.md](../../PSGC2LEG/README.md) · [viz/README.md](../../PSGC2LEG/viz/README.md) | District crosswalk and map polygons |
| [shareable_datasets_by_page.md](shareable_datasets_by_page.md) | What to download/cite per page |
| [data_provenance_map.md](data_provenance_map.md) | Suite-wide lineage |
