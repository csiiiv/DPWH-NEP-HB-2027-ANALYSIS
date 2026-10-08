> **House repair update:** use [hb_known_defect_repairs.md](../../docs/hb_known_defect_repairs.md) and [hb_dpwh_leaves_corrected_v5.json](../../data/hb_dpwh_leaves_corrected_v5.json) for the repaired candidate. v5 has 16,148 positive allocations totaling ₱581.345349B; 38/42 PAP controls and all FAP funding splits balance. The remaining ₱5.596312B net operations gap is confined to four Convergence PAPs. Earlier v4b completeness, program-delta, zero-region, and grand-upper-bound claims below are historical. The printed House grand total is ₱654.102015B. Earlier API matcher/dashboard artifacts have not been regenerated.

# FY2027 DPWH Budget Crosscheck — Work Summary & Next Steps

**Current phase (9 October 2026):** [verify three independent source hierarchies](../../docs/source_hierarchy_verification.md)
before comparisons: additive Native House I-B (660 balanced internal nodes),
NEP PDF source (2,552 checks; 3,193 actionable source checks and two derived contexts),
and **DPWH Transparency NEP FY2027 API data** (11,372 projects; ₱445.378063B;
2,662 derived grouping checks). The source folder is now
`dpwh-transparency-nep-data/`; House native artifacts are in `analysis/data/`.
The multi-year contract snapshot was the wrong source and is outside scope.
Earlier comparison and OCR-era House viewers remain references.

**9 October per-item reassessment:** all 16,764 NEP nodes now retain their expense basis; 307 operating-unit rows preserve their full printed columns. The earlier fixed-column native audit was incorrect on continuation pages and accepted matches from multi-line row areas. Its 237-candidate queue is superseded by 3,149 row-identity checks, 28 text disagreements, 14 alignment checks, and two summary controls. Amounts remain retained extractions, not certified image values. See [reassessment evidence](../../data/nep_2027_amount_column_reassessment.json).

**Folder map:** [README.md](../../README.md) (`builders/` · `viewers/` · `data/` · `docs/` · `tests/`) · **ADRs:** [docs/adr/README.md](../../docs/adr/README.md) · **Archive:** [archive/README.md](../README.md)

**Date:** Oct 8, 2026 · **Scope:** FY 2027 only (no prior-year crosschecks)
**Sources:** HB 10858 summary (Volume I-B) and details (Volume I-C, 942 pp) · retained FY2027 NEP Volume II-B PDF and OCR trees (`paddle_pdf_ocr_v2`) · NEP official compilation (`ajamontesa/ph-budget-analysis`) · saved NEP API (BetterGov, 11,372 rows)
**Current House project candidate:** [House v5](../../data/hb_dpwh_leaves_corrected_v5.json) — 16,148 positive allocations, ₱581.345349B; 38/42 local PAP controls balance, zero missing regions, and a ₱5.596312B net operations gap across four unresolved Convergence PAPs. Use printed House controls for aggregate comparisons. [Earlier candidate comparison](../../viewers/source_comparison_2027.html) separates printed controls, extraction coverage, PAP mappings, and source-match candidates. Earlier v4b results below are historical.

**NEP source update (Oct 8):** `nep_2027_source_projects.json` now provides 11,420 source-page-referenced operations allocations, totaling ₱572.924074B. All 45 non-FAP PAP controls reconcile exactly. See `nep_2027_api_reconciliation.md`; older insertion/drop claims below require source-based review.

**Complete NEP tree (Oct 8):** [nep_2027_tree.html](../../viewers/nep_2027_tree.html) now drills down the full ₱642,612,015,000 new-appropriations baseline, including PS, MOOE, CO, GAS, S2O, and project financing. All 2,552 additive branch checks and the 14,190-unit ledger balance exactly. The source-only builder has no API/House dependency. This establishes an arithmetic baseline, not exhaustive OCR certification: the initial 237-candidate native-text queue was recorded on 8 October. The 9 October per-item reassessment supersedes that queue with 3,193 actionable source checks. See [method and limits](../../viewers/nep_2027_tree.md) and [review queue](../../data/nep_2027_native_amount_review.json).

**House rollup tree (Oct 8):** [hb_2027_tree.html](../viewers/hb_2027_tree.html) rolls the 16,148 v5 allocations up under the printed ₱654,102,015,000 House total through operations zones, programs, PAP controls, regions, offices, projects, and FAP funding partitions. Root, Operations, both zones, and all six program controls balance; 38/42 PAP controls balance with only the four documented unresolved sections mismatching. GAS/S2O remain control-only. Seven regression tests (`test_hb_tree.py`) plus a headless viewer check (`test_hb_tree_viewer.cjs`) pass. See [method and limits](../viewers/hb_2027_tree.md).

**House document-native tree (Oct 8):** [hb_2027_source_tree.html](../viewers/hb_2027_source_tree.html) drills the same printed total down the bill's own printed hierarchy — Operations (row 2444) → OO1/OO2/LFP/FAP/Convergence-residual → programs → PAPs → regions → offices → projects → GOP/loan partitions — with OCR row/page references at every node. 476 printed controls balance exactly, including 399 office and 15 region subtotals attached from the old strict hierarchy by exact row-set match, and FAP-tail sub-PAP controls verified against v5. OO1 = APP+NDP+Bridge controls exactly; Convergence (₱231,382,287,000) never prints and is the exact residual, marked derived. Nine regression tests (`test_hb_source_tree.py`) plus a headless viewer check pass. See [method and limits](../viewers/hb_2027_source_tree.md).

**Native text-layer breakthrough (Oct 8, evening):** the House PDFs are digital InDesign documents with a complete native text layer — no OCR needed. `scripts/hb_native_extract3.py` parses VOL I-B (DPWH office-granularity tables, pp 13–110) with a geometry-first profile: **647/647 internal balance checks pass**, and after dropping 43 printed banner/summary rows the tree reproduces the printed budget **additively to the peso** (GAS/S2O 67,160,354,000 + local PAPs 542,192,650,000 + FAP 44,749,011,000 = 654,102,015,000). Three-way reconciliation ([hb_native_v5_reconciliation.md](../../docs/hb_native_v5_reconciliation.md)) shows I-B and I-C agree on **35/35 shared PAP controls**, and **all four v5-unresolved PAPs are extraction damage** — the ₱5.596B operations gap was an OCR artifact, not a property of the bill. I-C's native layer also prints the Convergence control (p373) and BIP program control (p412) that the OCR markdown dropped, and reveals the Water Supply family's three sub-PAPs (incl. Septage and Sewerage ₱100M) and the PWD 510M family (PWD 85M + Elderlies 340M + Gender-Responsive 85M). The native tree is the new House control baseline; v5 remains the project-title layer pending a native I-C re-extraction.

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
- Built `builders/build_nep_tree.py` from the retained PAP tree, operating-unit PS details, and source PDF; API and House data do not determine its hierarchy or amounts.
- The full tree has **16,764 nodes**, **14,190 atomic budget units**, and **2,552 passing additive rollup checks** at zero-peso tolerance. PS ₱14.922297B + MOOE ₱24.685746B + CO ₱603.003972B = **₱642.612015B**.
- Recorded 54 repairs with source references, including the ₱5M Bertese split, hierarchy corrections, title restoration, and funding-label corrections. Two PS groupings are explicitly derived; two financing reference totals are non-additive.
- Initial 8 October audit: 16,760 printed rows, 16,523 within-box agreements, 23 nearby alignment candidates, and 214 text/image-review cases. **Superseded on 9 October:** page-specific column geometry and multi-line row checks now yield 13,569 single-line matches, 3,149 ambiguous row areas, 28 text disagreements, and 14 nearby candidates. Two summary controls bring the actionable queue to 3,193. No allocation amount changed in this reassessment.
- Added offline expense/program drilldown, search, printed-versus-child totals, and PDF page references in `nep_2027_tree.html`.
- Five regression tests passed, including missing projects, repeated paths, lower-branch errors despite a balanced root, and offsetting sibling errors detected by independent evidence. Browser checks passed for both views, search, and leaf details.

### 1.10 House rollup tree
- Built `builders/build_hb_tree.py` from House v5 allocations, printed summary controls (`hb_json_usability_audit.json`), printed PAP controls (`hb_known_defect_repairs.json`), and the canonical program mapping (`current_pap_controls.json`); NEP/API rows do not determine the hierarchy or amounts.
- The tree has **18,854 nodes** under the printed **₱654,102,015,000** grand total: root → GAS/S2O/Operations → local/FAP zones → 6 programs (+ FAP program groups) → 42 PAP controls + 2 control-less groups → regions → offices → 16,119 projects + 29 FAP funding partitions (58 nodes).
- Root, Operations, both zones, and all six local program controls balance exactly; 38/42 printed PAP controls balance. The four unresolved Convergence/local sections mismatch exactly as documented (−₱2.242B, −₱5.116B, +₱305M, +₱1.457B), and the build refuses any other mismatch. Printed controls stay distinct from extraction coverage at every level.
- The 29 FAP GOP/loan partitions balance to the peso (GOP ₱25,190,650,000 + Loan ₱19,558,361,000).
- Eight native-section rows whose region field had absorbed the office label were split back to (region, office), recorded in `hb_2027_tree_validation.json`; amounts unchanged.
- Interactive zone/program drilldown with mismatch/coverage/evidence filters in `hb_2027_tree.html`; per-node NEP control comparisons (canonical PAP IDs, program deltas) are surfaced in details.
- Seven regression tests (`test_hb_tree.py`) pass: control reproduction, v5 reproduction, documented-mismatch-only rejection of new mismatches, FAP partitions, coverage-gap survival, and localization of injected allocations to their PAP. Headless viewer smoke test (`test_hb_tree_viewer.cjs`) passes.

### 1.11 House document-native tree
- Built `builders/build_hb_source_tree.py`: a recursive drill-down following the bill's own printed hierarchy instead of attribution grouping. Root → Operations (OCR row 2444) → OO1 (row 2445, = APP+NDP+Bridge controls exactly) / OO2 (row 6979) / Locally-Funded Projects (row 20662, = PPP ₱1B + NBP ₱12,875,943,000) / FAP (row 20962) / Convergence (never printed; exact residual ₱231,382,287,000, marked derived) → programs → PAPs → regions → offices → projects, with GOP/loan partitions in all 29 FAP projects.
- The FAP tail (rows 20962–21042) is natively structured: FAP-OO1 (35,712,554,000) → `a. Asset Preservation Program` (2,832,301,000, printed) → numbered sub-PAPs with printed controls (rows 20969, 20973, 20977, 21001, 21018) → lettered projects. All printed sub-PAP controls verified against v5 sums at build time.
- **476 printed controls balance** (44 PAPs, 399 office subtotals, 15 region subtotals, 8 programs, 4 outcomes, 4 sections, root); only the four documented unresolved PAPs mismatch. 18,850 nodes; 16,148 allocations reproduce v5 exactly.
- Printed office/region subtotals are attached from the old strict hierarchy only when the old block's row set exactly equals the v5 (PAP, region[, office]) group and sums match — 399 offices and 15 regions qualify; all other region/office groupings are marked derived.
- Document anchor rows are asserted at build time (2444, 2445, 2446, 5811, 6979, 6980, 20662–20670, 20962–21018): if the OCR markdown changes, the build fails rather than producing a silently different tree.
- Interactive drilldown with printed-controls/mismatch/evidence filters and row/page references in `hb_2027_source_tree.html`; nine regression tests (`test_hb_source_tree.py`) and a headless viewer check (`test_hb_source_tree_viewer.cjs`) pass.

### 1.13 External Ghostscript candidate dumps (`joebert_data/`)
- Received four HB 10858 candidate extracts under `analysis/joebert_data/` (Ghostscript text; no OCR): DPWH VOL I-C (12,714 rows, ≈₱360.8B), DA FMR (795), DOH HFEP (513; metadata sum = printed grand), NIA (32; gap 0).
- Schema matches the BetterGov API envelope; every row is `reviewStatus: candidate; verify against PDF`. DPWH dump has almost no PAP labels and only ~3.5k exact title+amount overlaps with v5 — useful independent candidate list, **not** a control or project baseline.
- **Crosscheck vs native I-B tree** ([joebert_native_crosscheck.md](joebert_native_crosscheck.md)): 192/204 native office names appear (96.9% of office×PAP cells); amount rollups fail (different grain). Joebert swallowed FAP grand ₱44.749B and Flood Mitigation Facilities PAP ₱16.223B×2 as projects, carries ≈₱73B page-break duplicate mass, and matches **0/29** FAP project names. DA/HFEP/NIA dumps have zero overlap with the DPWH native tree.

### 1.12 Native text-layer extraction (I-B) and three-way reconciliation
- Built `scripts/hb_native_extract3.py` (geometry-first, OCR-free) against VOL I-B's native text layer: tolerance y-clustering, odd-page 13.6pt margin normalization, line-number echo stripping, amount tokens only in the numeric band (x>280), indent bands from amount-row label-x, mirrored-banner dedup, and internal-node validation (sum of leaf descendants == printed amount).
- Result: 3,348 rows / 2,444 amount rows / **647/647 internal checks pass**; artifact `analysis/data/hb_dpwh_native_tree.json`. After dropping 43 printed banner rows (37 PAP-control re-prints + 6 program banners), zones reproduce the printed budget exactly: GAS/S2O 67,160,354,000 + local PAPs 542,192,650,000 + FAP 44,749,011,000 = 654,102,015,000.
- Three-way reconciliation (`analysis/docs/hb_native_v5_reconciliation.md`): I-B native controls == printed I-C controls on **35/35** shared PAPs; v5 matches native on 34/37 matched PAPs, missing only the four documented sections — now attributed to v5 OCR-era extraction damage (Access Roads −2.242B, Multi-Purpose −5.116B, Coastal +1.457B, Water-family +0.205B net), together exactly the old ₱5.596B "operations gap."
- New document facts from I-C's native layer: Convergence control **is printed** (p373, ₱231,382,287,000; = BIP 221,004,362,000 + Disaster 1B + PWD family 510M + Water family 8,867,925,000 exactly), BIP program control printed (p412), Water Supply family = WS 7,740,725,000 + Septage/Sewerage 100,000,000 + Rainwater 1,027,200,000, and the PWD 510M family splits PWD 85M + Elderlies 340M + Gender-Responsive 85M (17 regions × 5M).
- Settled: the native I-B tree (banner-deduped) is the **House control baseline**; v5 remains the project-title layer until a native I-C project-level re-extraction replaces the v3→v5 repair chain.

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

- **NEP:** every additive branch and the atomic ledger balance exactly. This isolates lower-branch failures but cannot exclude equal-and-opposite OCR errors among siblings; the reassessed 3,193-check source-review queue remains open.
- **House:** printed grand/program controls provide the aggregate baseline. v5 has 38/42 balanced local PAP controls and a ₱5.596312B net operations gap across four Convergence PAPs. The historical v4b rollup flags below should not be carried forward as current v5 coverage metrics.
- House PAP controls are usable after the documented page checks. Old v4b coverage ratios, reported family gaps, and leaf-based overages are diagnostic only because controls, labels, and additive scope can be wrong. See `hb_json_usability_audit.md` for the audited examples.

### 2.4 Historical API matcher (v4b, post-region backfill)
- **9,115 matched** pairs; **95.6% amount-equal** (8,715 pass-through), 400 re-costed.
- **6,073 API-unmatched House items (₱178.2B)**; **2,257 API items unmatched to House leaves (₱147.3B)**. These are matcher outcomes, not verified insertions/removals.
- Region backfill raised historical matcher matches 8,843 → 9,115. This does not establish full-table region completeness or insertion status; 32 v4b rows still lack regions.
- **Quirino correction:** K0264–K0281 is already present in NEP PDF page 225 and the API at ₱1.392209B, and the current v4b artifact marks it as an exact amount-equal House match. K0251–K0264 and the two Andaya segments remain unmatched to House leaves; confirm House coverage before concluding removal.
- **Disaster-Related correction:** the ₱1B allocation exists in NEP PDF page 430 and matches the parsed House amount. Its absence is an API omission, not evidence of a House insertion.

---

### 2.5 Earlier source matcher (House v5)

The [earlier candidate comparison](../../viewers/source_comparison_2027.html) rematches all 16,148 House allocations against 11,420 NEP source allocations, using canonical PAP IDs and source-node amounts. It finds 8,567 unique normalized-title candidates (259 paired amount differences), 1,648 House rows with fuzzy suggestions, six ambiguous exact-key rows, 5,927 House rows without a suggestion, and 2,853 NEP rows without a unique exact pairing. Suggestions can overlap and do not consume NEP rows. Zero pairs have been manually certified in this run. Unmatched rows do not establish additions/removals; funding partitions stay within project totals.

## 3. What we settled on (conventions & decisions)

| Decision | Choice | Why |
|---|---|---|
| Totals basis | NEP validated source tree ₱642.612015B; House printed controls ₱654.102015B | House v5 covers incomplete operations allocations and cannot supply a grand total |
| House control baseline | **Native I-B tree** (`analysis/data/hb_dpwh_native_tree.json`, banner-deduped; 647/647 checks) | Both volumes print balancing controls; OCR-era v5 sections are the damaged layer, not the bill |
| OCR validation | Recursive zero-tolerance rollups plus independent PDF evidence | A balanced root or sibling total can hide offsetting errors |
| Source independence | NEP hierarchy and amounts from PDF/PAP/PS sources only | API omissions must not define the comparison baseline |
| House-delta signal | **HB − official NEP** (not HB − API) | API incompleteness overstates insertions |
| Program attribution | Earlier candidate comparison: audited PAP labels map to canonical NEP source IDs; FAP uses source program headings | Title classifiers remain historical fallback evidence |
| Headingless / stale-pap rows | **Repaired in v4b** (not excluded) — ancestry + PDF bold-heading map | Historical attribution repairs; improved labels do not establish insertions |
| FAP zone | Kept separate from local PAP comparisons | API carries no FAP items |
| Family intro blocks | Treated as rollups (verified vs children), not API comparisons | Prevents double counting |
| Region identity | NFKC-normalized, 18 canonical regions; office→region backfill for empty leaves | OCR variants (`Ⅳ-A`, `egion`, mangled DEO names) |
| Line-item matching | Current v5/source run: unique normalized title + region + PAP/zone; duplicate keys ambiguous; fuzzy title suggestions ≥0.85 remain candidates | Amount agreement and title similarity are separate from reviewed identity |
| Method validation | Single-PAP case study (Rainwater) before scaling; v4b three-way family check after repair | You verified 4 samples manually; method reproduced the findings |

---

## 4. What else can / should we check

**Current verification gate:** finish independent NEP row review, Native I-C project extraction, and DPWH Transparency NEP release/document coverage first. Matching and analysis extensions below remain deferred until those prerequisites are resolved.

**Priority sequence**

1. **NEP source-image review** — resolve the 3,191 row candidates and two summary controls; row candidates are in `nep_2027_native_amount_review.json`; distinguish PDF text corruption and coordinate drift from genuine amount errors. Record evidence and rerun the recursive checks after any repair.
2. ~~**House tree reconstruction**~~ — **done**: `builders/build_hb_tree.py` builds `hb_2027_tree.{json,html,md}` from v5 allocations and printed controls; see §1.10. Remaining House work is resolving the four Convergence/local sections and inherited-attribution review.
3. **House boundary and attribution review** — ~~reconstruct the four unresolved v5 sections~~ **diagnosed**: the native I-B/I-C reconciliation ([§1.12](#112-native-text-layer-extraction-i-b-and-three-way-reconciliation), [hb_native_v5_reconciliation.md](../../docs/hb_native_v5_reconciliation.md)) shows both volumes print balancing controls; the four sections are v5 extraction damage. **Next:** build the I-C geometry profile (indent bands ≈ 79/89.6/100–103/112/123/140.7/154.2) and re-extract project-level leaves natively, superseding the v3→v5 repair chain; re-attribute the Septage ₱100M, Elderlies ₱340M, and Gender-Responsive ₱85M rows.
4. **Source-match review** — the v5/source candidate rematch is retained in the earlier candidate page. Review ambiguous keys, fuzzy suggestions, unmatched sections, and paired amount differences against both PDFs before certifying project changes. Optionally cross-check against `joebert_data/hb10858_projects.json` once a native I-C extract exists. The historical region-conflict and API OCR-title pools remain separate evidence work.
5. **Targeted change verification** — verify the historical 400 re-costing candidates and largest unmatched rows against both PDFs. Check Quirino K0251–K0264 and Andaya coverage; K0264–K0281 already matches unchanged.
6. **FAP and support comparisons** — compare source GOP/loan partitions and GAS/S2O office allocations across versions. Use House printed FAP ₱44.749011B rather than the older ₱47.95B candidate-leaf sum.

**Analysis extensions (deferred)**

7. **Duplicate/multi-site funding check** — same title+amount across multiple DEOs (real pattern in MPBs); confirm these are distinct sites, not double appropriations.
8. **Formulaic-distribution detector** — Rainwater showed perfect ₱4.2M×DEO uniformity; scan other PAPs for identical per-DEO splits (pork-style equilibration vs needs-based allocation).
9. **Geo-extraction** — titles embed coordinates (`14.662042, 120.952531`) and K-stations; parse into lat/lon + road segments for mapping and overlap detection.
10. **Comparison dashboard** — the NEP-only drilldown is complete in `nep_2027_tree.html`; extend it with validated House comparisons after reconstruction and rematching.
11. **Bicam/veto watch** — when the bicameral version or GAA lands, rerun the same pipeline (all parsers are reusable) to measure Senate/bicam/veto deltas; the reference repo's 2025 veto list provides the template.

---

## 5. Artifact index

Start with the [verification overview](../../../site/index.html), [methods](../../docs/source_hierarchy_verification.md), [every-item reassessment](../../data/nep_2027_amount_column_reassessment.json), and [evidence index](../../data/source_review_evidence.json). The shared workspace now has navigable parent paths, branch/class review queues, exact-peso amounts, reset/search shortcuts, and mobile tree/evidence panels; see [UI and packaging status](../../docs/pages_update_assessment.md).

Earlier candidate page: [source comparison](../../viewers/source_comparison_2027.html), [full candidate results](../../data/source_comparison_2027.json), [PAP controls](../../data/current_pap_controls.json), and [input manifest](../../data/comparison_manifest.json). Regenerate with `python analysis/builders/build_current_pages.py`. Folder map: [README.md](../../README.md).

| Path | Purpose |
|---|---|
| `docs/hb_native_v5_reconciliation.md` | Native I-B tree vs v5 vs printed I-C controls: zone accounting, 35/35 control agreement, four-section diagnosis |
| `docs/hb_native_full_processing.md` + `docs/hb_native_textlayer_assessment.md` | Native-layer feasibility and full-processing reports (647/647 checks) |
| `scripts/hb_native_extract3.py` + `analysis/data/hb_dpwh_native_tree.json` | Geometry-first native extractor (I-B) and raw outline; additive control baseline is `data/hb_dpwh_native_rollup.json` |
| `docs/hb_json_usability_audit.md` | House dataset inventory, printed totals, usable controls, confirmed defects, and limits |
| `builders/build_nep_tree.py` + `tests/test_nep_tree.py` | Source-only complete NEP build; recursive, missing-row, repeated-path, and offsetting-error regression checks |
| `data/nep_2027_tree.json` · `viewers/nep_2027_tree.{html,md}` | Full hierarchy, interactive drilldown, and validation method/limits |
| `builders/build_hb_tree.py` + `tests/test_hb_tree.py` + `tests/test_hb_tree_viewer.cjs` | House rollup build over v5 and printed controls |
| `data/hb_2027_tree.json` · `viewers/hb_2027_tree.{html,md}` | House rollup hierarchy, interactive drilldown, and validation method/limits |
| `data/hb_2027_tree_validation.json` | Control checks, repairs, region/office normalizations |
| `builders/build_hb_source_tree.py` + `tests/test_hb_source_tree.py` + `tests/test_hb_source_tree_viewer.cjs` | Document-native House tree build with anchor assertions |
| `data/hb_2027_source_tree.json` · `viewers/hb_2027_source_tree.{html,md}` | Document-native hierarchy with OCR row references |
| `data/hb_2027_source_tree_validation.json` | Printed-control checks, attached subtotals, anchor rows |
| `data/nep_2027_tree_validation.json` + `data/nep_2027_budget_units.json` | All 2,552 rollup checks, 54 repairs, and 14,190 atomic budget units |
| `data/nep_2027_native_amount_{audit,review}.json` | Page-specific column/text audit and 3,191 row-review candidates (plus two summary controls in the viewer) |
| `builders/reconcile_nep_source.py` + `data/nep_2027_api_reconciliation.json` + `docs/nep_2027_api_reconciliation.md` | Reproducible NEP/API audit: all PAP controls and 23 omissions with PDF evidence |
| `data/nep_2027_source_projects.json` | Expanded NEP operations reference: 11,420 allocations, ₱572.924074B |
| `data/nep_2027_hb_only_reassessment.json` | Source-presence assessments for all 6,073 previous API-unmatched House rows |
| `builders/crosscheck_2027.py` + `data/crosscheck_2027.json` + `viewers/crosscheck_2027.{html,md}` | Three-way program-level crosscheck (historical labels; current page supersedes its accounting) |
| `builders/crosscheck_pap_drilldown.py` + `data/crosscheck_2027_pap_drilldown.json` | PAP-level: 42 groups, family rollups, containers, supports |
| `builders/crosscheck_rainwater.py` + `archive/crosscheck_2027_rainwater.json` | Single-PAP method validation (historical) |
| `builders/crosscheck_lineitems.py` + `data/crosscheck_2027_lineitems.json` | Line-item matching (post-v4b; historical labels) |
| `builders/validate_v4b_paps.py` + `archive/crosscheck_2027_v4b_validation.json` | v4b leaf sums vs printed vs API pap3 (historical) |
| `builders/hb_program_classifier.py` | HB row → official program mapping |

**Historical extraction lineage — [archive/](..)** (see [archive/README.md](../README.md)): `archive/hb_dpwh_leaves_corrected_v3.json` → `builders/repair_headingless.py` → `archive/hb_dpwh_leaves_corrected_v4.json` → `builders/repair_stale_pap.py` → `archive/hb_dpwh_leaves_corrected_v4b.json` (superseded by v5 / native controls). Active hierarchy export: `data/hb_dpwh_pap_hierarchy.json`. Plus early text-layer audits and matcher outputs under `archive/`.
