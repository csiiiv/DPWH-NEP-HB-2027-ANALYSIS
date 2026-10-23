# Shareable datasets by workbench page

Updated: **22 October 2026**. FY 2027 budget project/facility lists for
journalists, citizens, and data analysts.

This guide maps each workbench page family to the **best retained file to
download or cite**, not the browser’s filtered CSV export. Filtered exports are
useful for a specific search; the files below are the citable ledgers behind
those pages.

For restoring a filtered view in the app, see
[shareable_findings.md](shareable_findings.md). For download catalog links
inside the SPA, open `#sources` (the former DPWH `#resources` tab redirects
there).

## Audience quick picks

| Need | Prefer | Avoid as a primary cite |
| --- | --- | --- |
| Flat spreadsheet of named projects/facilities | Per-source CSV ledgers below | Nested trees, workbench JSON, candidate-pair tables |
| One stage only (House **or** NEP) | That stage’s project/facility CSV or final JSON | Summing House + NEP, or Compare pair files |
| Locations / mapping | FMR normalized / final datasets (coordinates + optional PSGC) | NIA/HFEP (no printed coordinates); DPWH trees without a geo layer |
| Cross-stage “what changed?” | Compare/Analysis payloads, labeled as **provisional candidates** | Treating unmatched rows as proven insertions/deletions |
| Verification / audit trail | Matching `*_audit.json` + source PDF hashes in method docs | Screenshots alone |

**Rules for every list below**

1. House GAB and DBM NEP are **two stages of the same program**, not two budgets to add.
2. IDs (`ib:p…`, `nep_fmr:p…`, `nep-nia-p…`) are **source locators**, not certified cross-document identity.
3. Amounts are **integer Philippine pesos** of printed allocation, not spending, completion, or unit cost.
4. Candidate matches in Compare/Analysis are **reviewable pairings**, not established project identity.

---

## Main Overview

`#overview` (also the empty-hash landing page) shows build-time summaries from
[main_overview_2027.json](../data/main_overview_2027.json). Its CSV export preserves
exact allocations, declared record grains, comparison bases and supporting
routes. The summary is regenerable through `buildMainOverview.mjs`; the source
ledgers below remain the citable records. Counts and money are kept separate
by workspace, and Geolocation remains a per-artifact exploration tool.

## Workspace map

| Workspace | App routes | Project/facility list pages |
| --- | --- | --- |
| DPWH | `#home`, `#highlights`, `#compare`, `#analysis`, `#house`, `#nep`, `#transparency` | House I-C projects, NEP source projects, Transparency listing, Compare/Analysis populations |
| DA FMR | `#fmr/…` | House / NEP project tables, Map, Compare projects, Analysis drill-downs |
| NIA | `#nia/…` | House / NEP irrigation annex rows, Compare projects, Analysis populations |
| DOH HFEP | `#hfep/…` | House / NEP facility tables, Compare pairs, Analysis populations |

---

## 1. DA Farm-to-Market Roads (`#fmr/…`)

Best overall package (already curated for sharing):
[other-analysis/data/shareable/](../../other-analysis/data/shareable/) ·
[FMR_DATA_README.md](../../other-analysis/data/shareable/FMR_DATA_README.md) ·
archive [fmr_data.7z](../../other-analysis/data/shareable/fmr_data.7z).

| Page / list | Best shareable dataset | Why |
| --- | --- | --- |
| **House GAB** project table (`#fmr/house`, `view=projects`) | [hgab_fmr_projects_normalized.csv](../../other-analysis/data/shareable/hgab_fmr_projects_normalized.csv) (964 rows, ₱19,628,100,000) | Flat ledger: title, region, amount, normalized coordinates, review flags, PDF/printed pages |
| **DBM NEP** project table (`#fmr/nep`) | [nep_fmr_projects_normalized.csv](../../other-analysis/data/shareable/nep_fmr_projects_normalized.csv) (704 rows, ₱16,000,000,000) | Same columns as House; executive-proposal stage |
| **Map** (`#fmr/map`) | Same normalized CSVs, or point/segment detail: [hgab_fmr_points.csv](../../other-analysis/data/shareable/hgab_fmr_points.csv) / [nep_fmr_points.csv](../../other-analysis/data/shareable/nep_fmr_points.csv), [hgab_fmr_segments.csv](../../other-analysis/data/shareable/hgab_fmr_segments.csv) / [nep_fmr_segments.csv](../../other-analysis/data/shareable/nep_fmr_segments.csv) | One row per point or segment for GIS; straight-line km is diagnostic only |
| **Analyst / locality check** | Per-document finals with PSGC: [hgab_fmr_final_dataset.json](../../other-analysis/data/hgab_fmr_final_dataset.json), [nep_fmr_final_dataset.json](../../other-analysis/data/nep_fmr_final_dataset.json) | Richer than the shareable zip: PSGC geocoding and location-agreement flags; still per-document, not merged |
| **Compare → projects** (`#fmr/compare?view=projects`) | Rebuild from [fmr_workbench.json](../../other-analysis/data/fmr_workbench.json) `comparison` + stage projects, or export from the UI | Pairings are provisional (title ± coordinates). Prefer citing each stage CSV and describing the pairing method |
| **Compare → regions** | Regional rows inside `fmr_workbench.json`, or rebuild from project CSVs grouped by `region` | Printed regional controls; good for “where funding moved between stages” headlines when labeled as stage comparison |
| **Analysis / Highlights** supporting records | Underlying stage CSVs above; UI export for the filtered subset | Analysis populations are filters over the same ledgers |
| **Audits** | [hgab_fmr_audit.json](../../other-analysis/data/shareable/hgab_fmr_audit.json), [nep_fmr_audit.json](../../other-analysis/data/shareable/nep_fmr_audit.json), coordinate normalization audits in the same folder | Reproduce additive controls and source hashes |

Method notes: [FMR_EXTRACTION.md](../../other-analysis/FMR_EXTRACTION.md),
[NEP_FMR_EXTRACTION.md](../../other-analysis/NEP_FMR_EXTRACTION.md),
[FMR_WORKBENCH.md](../../other-analysis/FMR_WORKBENCH.md).

---

## 2. NIA Irrigation (`#nia/…`)

No packaged `shareable/` zip yet. Prefer the flat House CSV and the NEP final JSON.

| Page / list | Best shareable dataset | Why |
| --- | --- | --- |
| **House GAB** projects (`#nia/house`) | [hgab_nia_projects.csv](../../analysis-nia/data/hgab_nia_projects.csv) (828 rows, ₱17,999,305,000) | Clean flat ledger: id, sub-program, title, amount, path, PDF/printed page |
| **House** sub-program controls | [hgab_nia_subprograms.csv](../../analysis-nia/data/hgab_nia_subprograms.csv) | Printed controls vs project sums — use for “does the annex add up?” |
| **DBM NEP** projects (`#nia/nep`) | [nep_nia_dataset.json](../../analysis-nia/data/nep_nia_dataset.json) (791 projects, ₱17,598,181,000) | Preferred NEP cite: sub-program controls, provenance, flags. Simpler spreadsheet: [nep_nia_projects.csv](../../analysis-nia/data/nep_nia_projects.csv) (less provenance) |
| **Compare → projects** (`#nia/compare?view=projects`) | [nia_workbench.json](../../analysis-nia/data/nia_workbench.json) (`comparison` + `stages.*.projects`) | 509 title-unique candidate pairs within sub-program; unmatched ≠ insertion/deletion |
| **Compare → subprograms / Highlights funding bridge** | `subprogram_controls` and `comparison_summary` in `nia_workbench.json` | Stage totals and control diffs without inventing project identity |
| **Analysis** (Overview, Insertions, Deletions, Adjustments, Statistics, AI monitoring, Candidates, Agency controls) | Same workbench + stage ledgers | Populations are filters/aggregations over those files |
| **AI monitoring** (`#nia/analysis?view=ai_monitoring`) | Same stage ledgers + title classification in `niaAnalysis.js`; filtered CSV adds `ai_monitoring_basis` | Whole irrigation-project allocations with AI monitoring wording, including separately labeled NEP OCR variants; insertion drilldown exports House-only comparison rows; component cost is not itemized |
| **Agency scope context** (not annex project rows) | Agency checks inside [hgab_nia_audit.json](../../analysis-nia/data/hgab_nia_audit.json) / workbench `agency_controls` | Annex ≠ whole ₱45.17B NIA appropriation; CARP-linked agency-only row is outside the annex ledger |
| **Audits** | [hgab_nia_audit.json](../../analysis-nia/data/hgab_nia_audit.json), [nep_nia_audit.json](../../analysis-nia/data/nep_nia_audit.json) | Control reconciliation and extraction limits |

Docs: [analysis-nia/README.md](../../analysis-nia/README.md),
[NIA_WORKBENCH.md](../../analysis-nia/NIA_WORKBENCH.md),
[NEP_NIA_EXTRACTION_FINDINGS.md](../../analysis-nia/NEP_NIA_EXTRACTION_FINDINGS.md).

**Not geospatial.** Titles may mention metres/hectares; do not convert those into unit costs.

---

## 3. DOH Health Facilities (HFEP) (`#hfep/…`)

| Page / list | Best shareable dataset | Why |
| --- | --- | --- |
| **House GAB** facilities (`#hfep/house`) | [hgab_hfep_facilities.csv](../../analysis-hfep/data/hgab_hfep_facilities.csv) (513 rows, capital outlays ₱10,021,659,000) | Flat facility list with Infrastructure / Medical Equipment / Motor Vehicle / Total |
| **House** hierarchy / provenance | [hgab_hfep_data_list.json](../../analysis-hfep/data/hgab_hfep_data_list.json) | Same facilities + controls with richer lineage for analysts |
| **House** controls | [hgab_hfep_controls.csv](../../analysis-hfep/data/hgab_hfep_controls.csv) | Category/region/province printed controls |
| **DBM NEP** facilities (`#hfep/nep`) | [nep_hfep_facilities.csv](../../analysis-hfep/data/nep_hfep_facilities.csv) (464 items) | Flat NEP facility ledger. Richer: [nep_hfep_data_list.json](../../analysis-hfep/data/nep_hfep_data_list.json) |
| **NEP** controls / printed defects | [nep_hfep_controls.csv](../../analysis-hfep/data/nep_hfep_controls.csv), audit [nep_hfep_audit.json](../../analysis-hfep/data/nep_hfep_audit.json) | Document the known Metro Manila ₱140,000 printed overhang before citing NEP block totals |
| **Compare** (`#hfep/compare`) | [hfep_workbench.json](../../other-analysis/data/hfep_workbench.json) | Column totals + 341 provisional title-similarity pairs; both schedules include national + LGU facilities with different category allocations |
| **Analysis / Highlights** | Stage facility CSVs + workbench | Export filtered subsets from the UI; cite the stage CSV as the population |
| **Audits** | [hgab_hfep_audit.json](../../analysis-hfep/data/hgab_hfep_audit.json), [nep_hfep_audit.json](../../analysis-hfep/data/nep_hfep_audit.json) | Four-column recursive controls |

Docs: [analysis-hfep/README.md](../../analysis-hfep/README.md),
[HFEP_EXTRACTION.md](../../analysis-hfep/HFEP_EXTRACTION.md),
[NEP_HFEP_EXTRACTION.md](../../analysis-hfep/NEP_HFEP_EXTRACTION.md).

Annex totals are **capital outlays** only; MOOE in the wider HFEP allocation is outside these facility lists.

---

## 4. DPWH (`#…` unprefixed)

DPWH lists are larger and mostly JSON trees. Prefer the flattest file that still matches the page.

| Page / list | Best shareable dataset | Why |
| --- | --- | --- |
| **House GAB** named projects (`#house`, project view) | [hb_dpwh_native_ic_projects.json](../data/hb_dpwh_native_ic_projects.json) | Native I-C tree: ~15,972 named project leaves + FAP rows; MOOE+CO ₱639,179,718,000. Primary House project cite |
| **House** agency/office controls | [hb_dpwh_native_rollup.json](../data/hb_dpwh_native_rollup.json) | I-B additive controls (₱654,102,015,000 new appropriations); not the project-detail grain |
| **House 2nd vs 3rd reading** | [hb_dpwh_native_ic_projects_3rd_reading.json](../data/hb_dpwh_native_ic_projects_3rd_reading.json), [house_reading_changes_2027.json](../data/house_reading_changes_2027.json) | Side-by-side extract + recorded amount differences (e.g. ₱134M Caloocan reallocation) |
| **DBM NEP** project listing (`#nep` / coverage work) | [nep_2027_source_projects.json](../data/nep_2027_source_projects.json) (~11,420 rows) | Flatter than the full tree: title, region, office, amount, PDF page |
| **DBM NEP** hierarchy / totals | [nep_2027_tree.json](../data/nep_2027_tree.json) (₱642,612,015,000) | Canonical additive hierarchy; use with [nep_2027_tree_validation.json](../data/nep_2027_tree_validation.json) |
| **Transparency NEP** (`#transparency`) | [fy2027-combined.json](../../dpwh-transparency-nep-data/json/fy2027-combined.json) (11,372 projects, ₱445,378,063,000) | Raw listing snapshot. Hierarchy form: [dpwh_transparency_nep_tree.json](../data/dpwh_transparency_nep_tree.json). **Incomplete vs full NEP** |
| **Compare stages** (`#compare`) | [stage_trace_2027.json](../data/stage_trace_2027.json), [source_comparison_2027.json](../data/source_comparison_2027.json), [comparison_manifest.json](../data/comparison_manifest.json) | PAP/project/listing-gap candidates; `comparison_ready` remains false |
| **Analysis** groupings / headlines | [road_group_candidates_2027.json](../data/road_group_candidates_2027.json) plus stage source files above | Same-shell grouping candidates; not certified insertions/deletions |
| **DEO ↔ legislative district** lookup (any workspace) | [deo_leg_crosswalk.json](../../DEO2LEG/deo_leg_crosswalk.json) (264 relationships, 254 districts) | Reference mapping only: office → districts → representatives (each resolved seat carries `member_code`, profile URL and portrait). Amounts live separately in [source_amounts.json](../../DEO2LEG/evidence/source_amounts.json) and cite an **undated** scan |
| **Highlights** | Supporting populations from the stage files; story context via the app | Prefer citing the underlying House/NEP/Transparency file for each claim |
| **Resources catalog** | [resources.js](../web/src/resources.js) mirrors this inventory for the SPA | Packaged site copies many JSON files under `analysis/` paths |

Docs: [analysis/README.md](../README.md),
[pdf_budget_dataset_method.md](pdf_budget_dataset_method.md),
[gab_fy2027_reference_crosscheck.md](gab_fy2027_reference_crosscheck.md).

---

## 5. Page-family cheat sheet (all workspaces)

| Page family | Citizen / journalist default | Analyst default |
| --- | --- | --- |
| **House GAB** | Flat CSV (FMR/NIA/HFEP) or House I-C JSON (DPWH) | Same + tree/audit JSON |
| **DBM NEP** | Flat CSV / NEP source projects JSON | Canonical tree + audit + provenance-rich JSON |
| **Compare stages** | Stage ledgers + narrative of printed control deltas; treat pairs as candidates | Workbench / stage_trace JSON; keep matching notes |
| **Analysis** | Stage ledger filtered to the claim; quote population and stage | Aggregations + source IDs/pages retained in export |
| **Highlights** | Story’s supporting CSV export + link to stage ledger | Same; do not promote candidate identity |
| **Map (FMR)** | Normalized project CSV or points CSV | Final dataset JSON (PSGC) |
| **Transparency (DPWH)** | `fy2027-combined.json` with incomplete-coverage caveat | Tree + API reconciliation docs |

---

## 6. What not to share as “the” project list

| Artifact | Role | Limit |
| --- | --- | --- |
| Browser filtered CSV/JSON | Convenient subset for one URL state | Not a versioned release; regenerate from retained files |
| `*_workbench.json` / `stage_trace_2027.json` as sole source | UI payload including provisional matches | Derived; always ship stage ledgers beside it |
| Raw OCR / source_rows JSON | Extraction evidence | Hard to use as a public spreadsheet |
| Archived / v5 / joebert candidate dumps under [analysis/archive/](../archive/) | Historical | Superseded by native I-C / current annex extracts |
| Parent + child rows summed | Hierarchy nodes | Double-counts the same appropriation |

---

## 7. Source PDFs (evidence behind every list)

| Program | House detail | NEP detail |
| --- | --- | --- |
| DPWH | [HB_BUDGET/3 - HB 10858 VOL IC.pdf](../../HB_BUDGET/) (I-C); controls in Vol I-B | [dbm-nep-data/](../../dbm-nep-data/) Volume II-B OCR |
| FMR | Vol I-B FMR annex (pp. PDF 667–726) | [dbm-other-nep-line-data/FMR.pdf](../../dbm-other-nep-line-data/FMR.pdf) |
| NIA | Vol I-B irrigation annex (pp. PDF 896–941) | [dbm-other-nep-line-data/NIA.pdf](../../dbm-other-nep-line-data/NIA.pdf) |
| HFEP | Vol I-B HFEP annex (pp. PDF 877–893) | [dbm-other-nep-line-data/HFEP_2.pdf](../../dbm-other-nep-line-data/HFEP_2.pdf) |

Orientation for the three annexes: [other-analysis/README.md](../../other-analysis/README.md).

---

## 8. Related docs

- [shareable_findings.md](shareable_findings.md) — URL parameters to reopen filtered views
- [other-analysis/data/shareable/FMR_DATA_README.md](../../other-analysis/data/shareable/FMR_DATA_README.md) — FMR public package description
- [UI_CONSISTENCY_PLAN.md](../UI_CONSISTENCY_PLAN.md) — shared citizen questions across pages
- SPA Sources workspace: `#sources` (catalog in [sourcesCatalog.js](../web/src/sourcesCatalog.js); the former DPWH `#resources` tab folded in)
