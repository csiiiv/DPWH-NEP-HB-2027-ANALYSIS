> **House repair update:** use [hb_known_defect_repairs.md](hb_known_defect_repairs.md) and [hb_dpwh_leaves_corrected_v5.json](hb_dpwh_leaves_corrected_v5.json) for the repaired candidate. v5 has 16,148 positive allocations totaling ₱581.345349B; 38/42 PAP controls and all FAP funding splits balance. The remaining ₱5.596312B net operations gap is confined to four Convergence PAPs. Earlier v4b completeness, program-delta, zero-region, and grand-upper-bound claims below are historical. The printed House grand total is ₱654.102015B. Earlier API matcher/dashboard artifacts have not been regenerated.

# FY2027 DPWH Budget Crosscheck — Work Summary & Next Steps

**Date:** Oct 8, 2026 · **Scope:** FY 2027 only (no prior-year crosschecks)
**Sources:** HB 10858 summary (Volume I-B) and details (Volume I-C, 942 pp) · retained FY2027 NEP Volume II-B PDF and OCR trees (`paddle_pdf_ocr_v2`) · NEP official compilation (`ajamontesa/ph-budget-analysis`) · saved NEP API (BetterGov, 11,372 rows)
**Current House project candidate:** `hb_dpwh_leaves_corrected_v4b.json` — 15,487 rows, ₱520.651663B. Incomplete, with attribution/additive-status defects and 32 rows missing regions; not a certified budget total. Use printed House controls for aggregate comparisons. See [House JSON usability audit](hb_json_usability_audit.md).

**NEP source update (Oct 8):** `nep_2027_source_projects.json` now provides 11,420 source-page-referenced operations allocations, totaling ₱572.924074B. All 45 non-FAP PAP controls reconcile exactly. See `nep_2027_api_reconciliation.md`; older insertion/drop claims below require source-based review.

**Complete NEP tree (Oct 8):** [nep_2027_tree.html](nep_2027_tree.html) now drills down the full ₱642,612,015,000 new-appropriations baseline, including PS, MOOE, CO, GAS, S2O, and project financing. All 2,552 additive branch checks and the 14,190-unit ledger balance exactly. The source-only builder has no API/House dependency. This establishes an arithmetic baseline, not exhaustive OCR certification: 237 native-text/coordinate discrepancies remain as source-image review candidates. See [method and limits](nep_2027_tree.md) and [review queue](nep_2027_native_amount_review.json).

---

## 1. What we did

### 1.1 House Bill parsing & OCR repair
- Identified the DPWH section of `HB_BUDGET/3 - HB 10858 VOL IC.pdf` and parsed its budget tables into a strict hierarchy (`parse_hb_tree.py`), validating every block against printed subtotals.
- Cross-checked questionable rows against the PDF's native text layer (`audit_textlayer_v2/v3.py`, PyMuPDF spans + bold-font heading detection). You spot-checked 4 samples; 3 exposed systematic OCR damage classes that we then fixed globally:
  - **Class A:** region-header subtotals merged into the first project row (e.g., MPB Baras-Baras showed ₱4.77B = Region III subtotal; true ₱75M).
  - **Class B:** PAP-category / office subtotals glued onto project rows (e.g., Surigao–Davao Coastal Rd ₱1.08B was the Tertiary Roads subtotal; true ₱49.68M).
  - **Class C:** row-shifted amounts from page breaks.
- Result: corrected leaf dataset `hb_dpwh_leaves_corrected_v3.json` — 15,487 rows, ₱520.65B, with ₱18.16B of OCR phantom inflation removed.

### 1.2 Three-way program-level crosscheck
- Reconciled all three sources on one program axis (`crosscheck_2027.py`, `hb_program_classifier.py`): NEP official ₱642.61B (8 programs) vs NEP API ₱445.38B (line items) vs HB leaves ₱520.65B + printed control totals.
- Verified **MOOE ₱24,685,746,000 = GAS MOOE ₱1,505,758,000 + S2O MOOE ₱23,179,988,000**. The earlier leaves-plus-MOOE estimate (₱545.3B) is superseded: the House printed new-appropriations total is ₱654.102015B, and the candidate project table is incomplete.

### 1.3 PAP-level drill-down (level 2)
- Parsed **all 942 pages** into ordered rows (label/amount paired by y-clustering), extracted every printed PAP heading with region subtotals, each verified against its DEO office lines (`crosscheck_pap_drilldown.py`).
- Matched 42 PAP groups to API `pap3` values; separated program-family intros (rollups), printed containers (APP/ND/Flood/Bridge/BIP banners), FAP-zone blocks, and S2O support blocks (pre-feasibility, ROW, contractual).
- Validated the method on a single PAP first (Rainwater Collector System) — a perfect three-way match to the peso.

### 1.4 Line-item drill-down (level 3)
- Handled the bill's two nesting patterns (region→DEO→items and region→items directly) by normalizing everything to (canonical region, project title, office, amount) — including NFKC repair of OCR region noise (`Region Ⅳ-A`, `egion Ⅲ`, `Region ⅩⅢ`).
- Matched HB leaves against 11,372 API rows by normalized title — exact within region scope (office scope as fallback), then fuzzy Jaccard ≥ 0.62 with amount/office tie-breaks, greedy 1:1 (`crosscheck_lineitems.py`).

### 1.5 Headingless & stale-PAP pool repair → v4b
Two overlapping defects in the v3 leaf dataset were repaired end-to-end (`repair_headingless.py` → `repair_stale_pap.py`).

**Class 1 — `<headingless @N>` tags (1,082 leaves, ₱39.01B).** OCR page breaks dropped the bold PAP heading, so the block's first project title got stored as the `pap`. Repaired by walking each block's ancestry in the strict hierarchy (`hb_dpwh_pap_hierarchy.json`) to the nearest clean type-split PAP, falling back to the leaf's own text when it *is* a canonical PAP label (e.g. `Paving of Unpaved Roads - Tertiary Roads`), plus OCR fixes (`3IP→BIP`, `ff-Carriageway→Off-Carriageway`).

**Class 2 — stale-pap runs (12,674 leaves, ~₱276B; the bigger defect).** The parser mistook ordinary project lines for PAP headings and then stamped that project title as `pap` on thousands of subsequent leaves — e.g. `Rehabilitation of Philam Covered Court, Barangay Pamplona 2, Las Piñas City` became the "PAP" of 1,735 leaves (₱17.65B) that are actually Multi-Purpose Building projects. Repaired by:
1. Building the page → governing bold PAP family heading map from `Tahoma,Bold` spans (multi-line headings merged).
2. Mapping each leaf row to its PDF page via the OCR-JSON cumulative table-row index (validated ±2 pages against unique-text anchors: Tunasan→p370, Philam→p655, Mabinay→p839).
3. Re-attributing each non-canonical leaf to that page's family.

**Result:** 12,820 leaves relabeled (₱319.4B). Amount total unchanged (₱520.65B — repair only relabels). All 15,188 PAP-zone leaves now carry a PAP that either matches the API's canonical `pap3` set or is the printed `Bridge Program` family bucket (150 leaves, ₱11.16B).

### 1.6 v4b PAP validation & region backfill
- Three-way check per family (`validate_v4b_paps.py`): v4b leaf sums vs printed family totals vs API `pap3` totals → `crosscheck_2027_v4b_validation.json`.
- Region backfill improved the matcher scope through office/region mappings and title/geography hints. The full v4b table still has **32 region-less rows** (10 PAP, 22 FAP); the earlier zero-missing claim does not describe full-table coverage.

### 1.7 NEP PDF reference and API residual reconciliation
- Read the full FY2027 NEP Volume II-B PDF and retained OCR hierarchy from the supplied `paddle_pdf_ocr_v2` repository; PDF page 8 verifies the reference compilation's ₱642.612015B baseline.
- Built a separate operations reference: 11,395 non-FAP allocations (₱455.175063B) plus 25 FAP projects (₱117.749011B), totaling printed operations ₱572.924074B.
- Split merged Bentigan/Bertese rows on PDF page 494, restoring ₱5M after image verification; repaired four cross-row road titles on page 286. All 45 non-FAP PAP controls now balance exactly.
- Accounted for the entire ₱9.797B non-FAP API residual with 23 printed allocations: 17 Nationwide (₱6.688B), six NCR/Central Office (₱3.109B). Each omission has native PDF row evidence and reproduces its PAP gap.
- Paired 11,199 API rows by normalized exact title and equal amount/PAP; 173 further equal-amount/PAP OCR title pairs remain candidates for review.
- Reassessed the 6,073 previous API-unmatched House rows: 33 (₱4.9695B) have exact NEP source titles in the same region; 97 have exact titles with region conflicts, nine are possible heading/allocation rows, and 5,934 remain unresolved. This is a source-presence audit, not a complete 1:1 rematch.


### 1.8 Complete source-only NEP tree and recursive validation
- Built `build_nep_tree.py` from the retained PAP tree, operating-unit PS details, and source PDF; API and House data do not determine its hierarchy or amounts.
- The full tree has **16,764 nodes**, **14,190 atomic budget units**, and **2,552 passing additive rollup checks** at zero-peso tolerance. PS ₱14.922297B + MOOE ₱24.685746B + CO ₱603.003972B = **₱642.612015B**.
- Recorded 54 repairs with source references, including the ₱5M Bertese split, hierarchy corrections, title restoration, and funding-label corrections. Two PS groupings are explicitly derived; two financing reference totals are non-additive.
- Independently compared 16,760 printed rows against PDF text: 16,523 within-box agreements, 23 nearby alignment candidates, and 214 requiring further text/image review. The **237 review candidates are not confirmed amount errors**.
- Added offline expense/program drilldown, search, printed-versus-child totals, and PDF page references in `nep_2027_tree.html`.
- Five regression tests passed, including missing projects, repeated paths, lower-branch errors despite a balanced root, and offsetting sibling errors detected by independent evidence. Browser checks passed for both views, search, and leaf details.

### 1.9 House JSON usability audit
- Inventoried saved House tables and structural/crosscheck artifacts; v4b remains the best project candidate but is incomplete and includes confirmed subtotal/project double counting.
- House PDF summary controls establish **₱654.102015B new appropriations**, **₱586.941661B operations**, and **₱67.160354B GAS/S2O**. The operations-minus-candidate-leaves gap is **₱66.289998B**, a net reconciliation difference rather than an enumerated missing-project total.
- All 42 saved local PAP controls agree with native heading amounts on referenced pages. This validates printed PAP controls, not project completeness or every regional subtotal.
- Documented examples: secondary-road paving subtotal counted with its children; Rainwater captured as only ₱99M under its v4b label; PM-Primary validation used the following NCR subtotal instead of the printed PAP control.

---

## 2. What we found

### 2.1 The NEP API is materially incomplete
- API projects sum to **₱445.378063B vs official NEP ₱642.612015B**. The **₱197.233952B** gap is now fully decomposed:
  - GAS/S2O across expense classes: **₱69.687941B**.
  - Foreign-assisted projects: **₱117.749011B**, including NEP LLRN Phase I **₱35.209919B**. The earlier ₱10.1B LLRN and ₱12.9B FAP Multipurpose figures were House amounts, not NEP gap components.
  - 23 non-FAP allocations absent from the API: **₱9.797B**, reproduced exactly by PAP and scope.
- Rainwater matches the NEP source and API at ₱1.0272B. The remaining non-FAP discrepancy is concentrated in identified allocations, not an unexplained ₱127B project pool. Whether the API intentionally excludes those allocations or omitted them during ingestion is not established by the totals alone.

### 2.2 House versus NEP — printed controls

House new appropriations **₱654.102015B** exceed NEP **₱642.612015B** by **₱11.49B**. Compare the same scope using printed controls; historical v4b leaf-minus-NEP estimates are superseded.

| Local operations program (excluding FAP) | House ₱B | NEP ₱B | House − NEP ₱B |
|---|---:|---:|---:|
| Asset Preservation | 79.720290 | 68.418283 | +11.302007 |
| Network Development | 92.435879 | 92.179924 | +0.255955 |
| Bridge | 37.590473 | 38.987589 | −1.397116 |
| Flood Management | 87.187778 | 83.846944 | +3.340834 |
| Convergence & Special Support | 231.382287 | 157.308648 | +74.073639 |
| Local Program | 13.875943 | 14.433675 | −0.557732 |

Local operations increase **₱87.017587B** (House ₱542.192650B versus NEP ₱455.175063B). FAP falls **₱73B** (House ₱44.749011B versus NEP ₱117.749011B). Operations therefore increase **₱14.017587B**; GAS/S2O decrease **₱2.527587B**, reproducing the **₱11.49B** grand-total increase. These are allocation changes, not established project-level insertions/removals.

### 2.3 Validation strength and remaining extraction limits

- **NEP:** every additive branch and the atomic ledger balance exactly. This isolates lower-branch failures but cannot exclude equal-and-opposite OCR errors among siblings; the independent 237-row image-review queue remains open.
- **House:** printed grand/program controls provide the aggregate baseline. Existing project tables cannot yet reproduce it reliably; v4b contains 32 `pdf3:verified_rollup` rows totaling ₱4.565125B whose additive status needs review.
- House PAP controls are usable after the documented page checks. Old v4b coverage ratios, reported family gaps, and leaf-based overages are diagnostic only because controls, labels, and additive scope can be wrong. See `hb_json_usability_audit.md` for the audited examples.

### 2.4 Line-item deltas (post-v4b, post-region backfill)
- **9,115 matched** pairs; **95.6% amount-equal** (8,715 pass-through), 400 re-costed.
- **6,073 API-unmatched House items (₱178.2B)**; **2,257 API items unmatched to House leaves (₱147.3B)**. These are matcher outcomes, not verified insertions/removals.
- Region backfill raised historical matcher matches 8,843 → 9,115. This does not establish full-table region completeness or insertion status; 32 v4b rows still lack regions.
- **Quirino correction:** K0264–K0281 is already present in NEP PDF page 225 and the API at ₱1.392209B, and the current v4b artifact marks it as an exact amount-equal House match. K0251–K0264 and the two Andaya segments remain unmatched to House leaves; confirm House coverage before concluding removal.
- **Disaster-Related correction:** the ₱1B allocation exists in NEP PDF page 430 and matches the parsed House amount. Its absence is an API omission, not evidence of a House insertion.

---

## 3. What we settled on (conventions & decisions)

| Decision | Choice | Why |
|---|---|---|
| Totals basis | NEP validated source tree ₱642.612015B; House printed controls ₱654.102015B | House v4b leaves are incomplete and cannot supply a grand total |
| OCR validation | Recursive zero-tolerance rollups plus independent PDF evidence | A balanced root or sibling total can hide offsetting errors |
| Source independence | NEP hierarchy and amounts from PDF/PAP/PS sources only | API omissions must not define the comparison baseline |
| House-delta signal | **HB − official NEP** (not HB − API) | API incompleteness overstates insertions |
| Program attribution | Ordered classifier + pap3 match: canonical PAP labels → flood keywords → BIP/local-road families → APP work verbs → bridges → roads | Mirrors the NEP's own filing (barangay roads → Convergence) |
| Headingless / stale-pap rows | **Repaired in v4b** (not excluded) — ancestry + PDF bold-heading map | ₱319B pool reclaimed; unattributed insertions eliminated |
| FAP zone | Kept separate from local PAP comparisons | API carries no FAP items |
| Family intro blocks | Treated as rollups (verified vs children), not API comparisons | Prevents double counting |
| Region identity | NFKC-normalized, 18 canonical regions; office→region backfill for empty leaves | OCR variants (`Ⅳ-A`, `egion`, mangled DEO names) |
| Line-item matching | Exact title in region scope (office fallback) → Jaccard ≥0.62; greedy 1:1; amount/office tie-breaks | High precision (~95.6% of matches amount-equal) |
| Method validation | Single-PAP case study (Rainwater) before scaling; v4b three-way family check after repair | You verified 4 samples manually; method reproduced the findings |

---

## 4. What else can / should we check

**Priority sequence**
1. **NEP source-image review** — resolve the 237 candidates in `nep_2027_native_amount_review.json`; distinguish PDF text corruption and coordinate drift from genuine amount errors. Record evidence and rerun the recursive checks after any repair.
2. **House tree reconstruction** — build a source-grounded hierarchy against printed ₱654.102015B new appropriations and ₱586.941661B operations. Repair additive status, dropped rows, stale controls, and PAP/page attribution; require recursive balance as for NEP.
3. **House boundary and attribution review** — verify the 1,558 previously flagged boundary leaves, 32 missing regions, rollup-tagged rows, paving double count, Rainwater coverage, and PM-Primary control. Existing matcher labels are candidates.
4. **Complete House–NEP rematch** — compare validated source branches with one-to-one matching. Review the 97 region-conflict exact titles, nine possible headings, and 173 API OCR-title candidates; do not interpret unmatched rows as established changes.
5. **Targeted change verification** — verify the historical 400 re-costing candidates and largest unmatched rows against both PDFs. Check Quirino K0251–K0264 and Andaya coverage; K0264–K0281 already matches unchanged.
6. **FAP and support comparisons** — compare source GOP/loan partitions and GAS/S2O office allocations across versions. Use House printed FAP ₱44.749011B rather than the older ₱47.95B candidate-leaf sum.

**Analysis extensions**
7. **Duplicate/multi-site funding check** — same title+amount across multiple DEOs (real pattern in MPBs); confirm these are distinct sites, not double appropriations.
8. **Formulaic-distribution detector** — Rainwater showed perfect ₱4.2M×DEO uniformity; scan other PAPs for identical per-DEO splits (pork-style equilibration vs needs-based allocation).
9. **Geo-extraction** — titles embed coordinates (`14.662042, 120.952531`) and K-stations; parse into lat/lon + road segments for mapping and overlap detection.
10. **Comparison dashboard** — the NEP-only drilldown is complete in `nep_2027_tree.html`; extend it with validated House comparisons after reconstruction and rematching.
11. **Bicam/veto watch** — when the bicameral version or GAA lands, rerun the same pipeline (all parsers are reusable) to measure Senate/bicam/veto deltas; the reference repo's 2025 veto list provides the template.

---

## 5. Artifact index

| File | Purpose |
|---|---|
| `hb_json_usability_audit.md` | House dataset inventory, printed totals, usable controls, confirmed defects, and limits |
| `build_nep_tree.py` + `test_nep_tree.py` | Source-only complete NEP build; recursive, missing-row, repeated-path, and offsetting-error regression checks |
| `nep_2027_tree.{json,html,md}` | Full hierarchy, interactive drilldown, and validation method/limits |
| `nep_2027_tree_validation.json` + `nep_2027_budget_units.json` | All 2,552 rollup checks, 54 repairs, and 14,190 atomic budget units |
| `nep_2027_native_amount_{audit,review}.json` | Independent PDF text-layer evidence and 237 source-image review candidates |
| `reconcile_nep_source.py` + `nep_2027_api_reconciliation.{json,md}` | Reproducible NEP/API audit: all PAP controls and 23 omissions with PDF evidence |
| `nep_2027_source_projects.json` | Expanded NEP operations reference: 11,420 allocations, ₱572.924074B |
| `nep_2027_hb_only_reassessment.json` | Source-presence assessments for all 6,073 previous API-unmatched House rows |
| `crosscheck_2027.{py,json,html,md}` | Three-way program-level crosscheck + dashboard + report |
| `crosscheck_pap_drilldown.{py,json}` | PAP-level: 42 groups, family rollups, containers, supports |
| `crosscheck_rainwater.py` + `crosscheck_2027_rainwater.json` | Single-PAP method validation |
| `crosscheck_lineitems.py` + `crosscheck_2027_lineitems.json` | Line-item matching, insertions/drops (post-v4b) |
| `validate_v4b_paps.py` + `crosscheck_2027_v4b_validation.json` | v4b leaf sums vs printed vs API pap3 |
| `hb_program_classifier.py` | HB row → official program mapping |
| `hb_dpwh_leaves_corrected_v3.json` | Pre-repair leaves (superseded by v4b) |
| `repair_headingless.py` | v3 → v4: headingless-tag repair (ancestry/own-text) |
| `repair_stale_pap.py` | v4 → v4b: stale-pap repair (PDF page → bold family heading) |
| `hb_dpwh_leaves_corrected_v4b.json` | Best existing House project candidate — 15,487 rows, ₱520.651663B; incomplete, 32 missing regions, additive/attribution defects |
| `hb_dpwh_pap_hierarchy.json` | Original House hierarchy; pre-repair amounts and damaged controls, diagnostic only |
| `page_family_map.json` | PDF page → governing bold PAP family heading |
