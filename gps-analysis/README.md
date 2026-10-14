# GPS analysis

Cross-dataset inventory of budget records that include GPS / geographic
coordinate text (decimal pairs, DMS, START/END cells, axis labels, and
common OCR variants), plus the **Geolocation** workbench workspace that
visualizes it.

This folder owns the scanner, workbench dataset, docs, and derived outputs.
It does **not** replace the provenance-certified FMR coordinate pipelines in
[`other-analysis/`](../other-analysis/).

## Why

FMR annexes already carry dedicated `coordinates_raw` fields. Thousands of
DPWH project titles also embed coordinates (usually a parenthetical decimal
pair). NIA and HFEP annexes generally do not print coordinates. This scanner
makes that distribution visible in one place.

## Run

```bash
python3 gps-analysis/scan_gps_inventory.py           # rebuild inventory
python3 gps-analysis/build_gps_workbench.py          # rebuild browser dataset
python3 gps-analysis/scan_gps_inventory.py --check   # summarize prior outputs
python3 -m unittest discover -s gps-analysis/tests -v
node analysis/web/src/geoSmoke.mjs                   # render smoke (run from analysis/web)
```

## Outputs

| File | Contents |
|------|----------|
| [`data/gps_inventory.json`](data/gps_inventory.json) | Full hit list with per-field parse status, points, rules/issues |
| [`data/gps_inventory_summary.json`](data/gps_inventory_summary.json) | Counts by dataset and status |
| [`data/gps_inventory_hits.csv`](data/gps_inventory_hits.csv) | Flat table for triage |
| [`data/gps_workbench.json`](data/gps_workbench.json) | Browser dataset for the Geolocation workspace (regenerable, git-ignored) |

Coordinate arrays use **longitude, latitude** decimal degrees. The source
documents do not state a CRS. Philippines orientation bounds (lat 4–22,
lon 116–127) are inherited from the FMR normalizer as a review screen, not
certification.

## Datasets scanned

| Dataset | Source artifact | Text fields |
|---------|-----------------|-------------|
| `hgab_fmr` / `nep_fmr` | `other-analysis/data/{hgab,nep}_fmr_tree.json` | `coordinates_raw` (+ title if it also has GPS) |
| `dpwh_comparison_2027` | `analysis/data/comparison_projects_2027.json` | `title`, stage titles |
| `hb_dpwh_leaves_v5` | `analysis/data/hb_dpwh_leaves_corrected_v5.json` | `project` |
| `nep_2027_source_projects` | `analysis/data/nep_2027_source_projects.json` | `title` |
| `chainage_units_2027` | `analysis/data/chainage_units_2027.json` | `title` |
| `hgab_nia` / `nep_nia_projects` | NIA tree / dataset | project labels |
| `hgab_hfep` / `nep_hfep` | HFEP data lists | facility labels |

Overlapping DPWH corpora (leaves ⊂ comparison ⊂ trees) are **not** deduplicated;
counts are per source artifact.

## Parse logic

[`coordinate_parse.py`](coordinate_parse.py) vendors the FMR pair parser:

- Decimal degrees (lat/lon or lon/lat reorder)
- Spaced decimals, colon-as-decimal, missing-decimal PH latitude
- DMS with `° ' "`, Unicode quotes, hemisphere N/S/E/W
- Axis labels `LAT:` / `LON:` / `X:` / `Y:`
- Endpoint scaffolding `START` / `END` / `STAR` / `ISTART` / section markers

Titles are prefiltered with a GPS hint regex, then candidate fragments
(parenthetical pairs, PH-range inline pairs, DMS spans, endpoint spans) are
parsed. Chainage / kilometre decimals alone do not count as GPS.

## Status values

| Status | Meaning |
|--------|---------|
| `parsed` | At least one numeric lon/lat pair with no issues |
| `parsed_with_issues` | Pair produced, but review issues remain (e.g. outside PH bounds) |
| `unparsed_candidate` | GPS-like fragment present but not fully consumed |
| `hint_only` | Hint regex fired without an extractable fragment |

## Amount and budget change

Each hit also carries two review fields beyond the coordinate parse:

- **`amount`** — the printed allocation in PHP, attached at scan time from the
  owning source artifact. Field names differ per corpus, so the scanner reads
  the right one for each: `printed_amount_php` for the FMR/NIA trees,
  `amount_php` for DPWH leaves / NEP source rows / chainage units / the NIA
  dataset, `amounts_php.total` for HFEP items, and the 3rd-reading House amount
  (falling back to 2nd, then to the NEP side) for comparison rows. All 6,959
  current hits carry an amount.
- **`change_type`** + **`amount_delta`** — a budget-change bucket derived from
  the unified DPWH comparison, so the map can show only inserted / deleted /
  adjusted projects:

  | `change_type` | Source trace | Meaning |
  |---|---|---|
  | `insertion` | `house_only_candidate` | House row with no NEP counterpart |
  | `deletion` | `nep_only_candidate` | NEP row with no House counterpart |
  | `adjustment_increased` | `candidate_increase` | Matched pair, House amount above NEP |
  | `adjustment_decreased` | `candidate_decrease` | Matched pair, House amount below NEP |
  | `no_change` | `amount_same` | Matched pair, amounts equal |
  | `unknown` | `fuzzy_candidate`, `ambiguous` | Matched but no NEP amount to compare |
  | `null` | — | Dataset has no comparison signal |

  Compound traces (`outside_api_then_*`, `transparency_gap_then_*`) have no
  direct bucket, so they fall back to the signed `house_minus_nep_php` delta.

  **Known gap:** change tracking exists only for `dpwh_comparison_2027` —
  the other DPWH artifacts and the FMR/NIA/HFEP annexes have no comparison
  trace, so they stay `null` and appear under "No comparison data" in the
  filter. Standardizing a change signal across those corpora would require
  updating their data models first.

## Latest scan totals

From `data/gps_inventory_summary.json` (rebuild to refresh):

| Dataset | Scanned | With GPS |
|---------|--------:|---------:|
| HGAB FMR | 964 | 964 |
| NEP FMR | 704 | 704 |
| DPWH comparison | 17,613 | 2,350 |
| HB leaves v5 | 16,148 | 2,215 |
| NEP source projects | 11,420 | 610 |
| Chainage units | 12,243 | 128 |
| NIA (HGAB + NEP) | 1,619 | 2 (same TASMORIS DMS pair) |
| HFEP | 977 | 0 |

Overall: **61,688** records scanned → **6,973** with GPS signal (**6,935** cleanly
parsed, 34 parsed with issues, 1 unparsed candidate, 3 hint-only), yielding
**9,827** parsed coordinate points.

The totals moved when the scanner learned to read decimal degree pairs carrying
degree symbols and hemisphere markers — `(14.656598°N, 121.267969°E)`,
`8.452176°, 124.689299°`. That converted 357 of 360 `hint_only` records into
plottable coordinates; the 3 that remain are genuine OCR damage.

## Geolocation workbench

The SPA registers a fifth workspace — **Geolocation** (`#geo/…`), listed after
NIA Irrigation — with two tabs:

- **Home** — scan totals, records-with-GPS by grouping (FMR annexes, DPWH
  titles, NIA, HFEP), the DPWH group split further by PAP label, and three
  interpretation-variation tables: fragment kinds, interpretation rules, and
  review issues, each ranked by frequency.
- **Map** — every GPS-bearing record on one MapLibre map. Lines join a
  record’s parsed points in source order; individual coordinates carry a
  grouping badge. Selecting a feature shows the project amount, its
  budget-change badge, the printed fragment, PAP, every rule applied, review
  issues, per-source PDF page previews, and a deep link to the project record
  in its own workspace.

  **Visual encoding.** Two redundant channels carry the grouping so it survives
  greyscale printing and colour-vision deficiency:

  | Channel | Encodes |
  |---------|---------|
  | Badge glyph (shape) | Grouping — FMR road ribbon, DPWH gabled building, NIA water droplet, HFEP medical cross |
  | Badge / bubble colour | Grouping (purple FMR, blue DPWH, teal NIA, amber HFEP) |
  | Red ring | That coordinate carries a review issue |
  | Cluster bubble colour | Homogeneity — one grouping takes that group’s colour, a mixed cluster is neutral slate |
  | Cluster bubble size | Member count (sub-linear, so 15 does not dwarf 10) |
  | Cluster count label | Exact member count |

  Below zoom 11 MapLibre clusters nearby points into bubbles; past it clusters
  dissolve and the bubbles cross-fade into individual badges. Clicking a bubble
  zooms just far enough to break it apart. The legend and the map sprites are
  generated from one artwork module (`analysis/web/src/geoMapStyle.js`), so they
  cannot drift apart.

  **Camera framing.** The automatic fit uses only coordinates inside the
  Philippine orientation envelope (lat 4–22, lon 116–127, matching the scanner).
  12 of 9,827 points sit outside it — a `24.8131`/`124.8131` digit transposition
  present in the source title, a chainage misparse where lon == lat, and two FMR
  axis swaps. Framing every point centred the camera at 69°E and compressed the
  archipelago into a smudge, defeating the cluster assessment the map exists to
  support. Those points are still plotted and still carry their review issue; the
  result bar discloses the excluded count, and the fit falls back to all points
  if a filtered set is entirely outside the envelope.

  Filters cover grouping, budget change, dataset, DPWH PAP, parse status,
  fragment kind, interpretation rule, and review issue. Each facet is a
  **floating multi-select popover** (checkbox list with Select all / Select
  none) so several values can be combined in one pass; opening one overlays the
  map rather than reflowing the page. Selections are unioned within a facet and
  intersected across facets, and serialize to the URL with `|`
  (`#geo/map?change=insertion|adjustment_increased`) so a filtered view is
  shareable. Facet counts are computed over the full record set, not the
  filtered subset, so ticking a box never hides its sibling options. A dark
  basemap toggle is shareable through the same URL.

### Record links and PDF evidence

Every record carries `sources[]` evidence refs (`document`, `pdf`,
`pdf_page`, optional `tree`) resolved at scan time, and the map card / Home
record dialogs use them two ways:

- **Project record links** — each dataset references its record differently,
  so each gets its own URL format (verified end-to-end in
  `scripts/check_geo_pages.py` and the scanner tests):

  | Dataset | URL format | Selector convention |
  |---|---|---|
  | `hgab_fmr` | `#fmr/house?node=ib:p667:r5` | FMR tree node id |
  | `nep_fmr` | `#fmr/nep?node=nep_fmr:p1:r5` | FMR tree node id |
  | `dpwh_comparison_2027` | `#compare?record=house-reading:96&view=projects` | unified comparison row id |
  | `hb_dpwh_leaves_v5` | `#house?view=projects&reading=second&node=c6303` | joined native I-C node id |
  | `nep_2027_source_projects` | `#nep?node=p347:r6` | NEP tree row id |
  | `chainage_units_2027` (`nep:`) | `#nep?node=p352:r6` | NEP tree row id |
  | `chainage_units_2027` (`hb2:`/`hb3:`) | `#house?view=projects&reading=second|third&node=c0191` | native I-C node id + reading param |
  | `hgab_nia` | `#nia/house?node=ib:p905:r13` | NIA tree node id |
  | `nep_nia_projects` | `#nia/nep?node=nep-nia-p07-y208` | NIA dataset row id |

  Leaves join to native nodes by printed page + normalized title (exact);
  347 of 2,210 corrected-title GPS leaves fail that exact join (fuzzy prefix
  joins were measured ambiguous) and keep their PDF-page evidence without a
  record link.

- **PDF page previews** — each evidence ref opens the shared `PdfPreview`
  component at the recorded page. Comparison rows expose all three budget
  readings (NEP Volume II-B + House I-C 2nd/3rd) where a side carried the
  page; FMR/NIA annexes preview their standalone schedules. The document
  registry (`documents[]` in the workbench JSON) pins packaged paths and page
  counts so out-of-range refs never reach the viewer.

Each grouping needs different interpretation care — the same FMR grammar,
different failure modes: FMR cells carry OCR artefacts (colon decimals,
missing quotes), DPWH titles embed pairs inside prose (reordering, chainage
lookalikes), and NIA prints a lone DMS pair. The variation tables make those
differences explicit instead of hiding them behind a single “parsed” count.

Rebuild the browser dataset with `python3 gps-analysis/build_gps_workbench.py`
(it runs automatically in the web `predev`/`prebuild` chain). Packaging is
wired through `scripts/package_geo.py`, invoked by `scripts/build_pages.py`.

## Limits

- Inventory ≠ geocode. No PSGC / locality agreement is applied here (see
  FMR’s `validate_fmr_coordinates_psgc.py` for that layer).
- Raw PDFs under `dbm-other-nep-line-data/` are not scanned; use extracted
  JSON/CSV first.
- False positives are possible on unusual numeric titles; false negatives
  are possible for novel coordinate spellings outside the FMR grammar.
- Title `START`/`END` detection requires a colon so phrases like “Tail end
  of Lateral A” are not treated as GPS.
