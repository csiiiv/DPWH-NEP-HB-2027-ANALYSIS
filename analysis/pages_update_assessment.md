# Page assessment after the NEP and House dataset updates

Assessment date: 8 October 2026. This reviews the five reports open in the IDE, local dashboards, embedded datasets, generators, and the packaged site. A local Chromium smoke check covers desktop and mobile behavior; the live deployed site was not checked. The initial assessment changed no viewers or datasets; the implementation update below records the subsequent page work.

## Implementation update — 8 October 2026

The new [current source comparison](source_comparison_2027.html) is the primary comparison page. The earlier crosscheck and title taxonomy remain historical artifacts. The findings below describe the pre-update assessment; this section records what has since been implemented.

- Printed NEP/House controls, extraction coverage, and API coverage now have separate tables. The printed totals reproduce +₱11.49B overall and −₱2.527587B GAS/S2O; the invalid leaves-plus-MOOE upper bound is absent from the current data/page.
- All 42 House PAP controls map to canonical NEP source IDs. Three additional NEP PAPs show “House control not mapped”; absence is not presented as a removal. Exact peso agreement and 0.5% tolerance agreement are separate statuses. Regional drilldowns explicitly compare extracted allocations rather than printed House regional controls.
- The index and current page show House v5, 38/42 balanced PAP controls, all four coverage discrepancies, FAP funding status, source stage, and build provenance. House summary/details PDFs are packaged for working citations; NEP references retain local-PDF instructions.
- A new v5/source matcher runs against project totals whose source IDs and amounts agree with the canonical tree. Unique normalized-title candidates preserve region/PAP/local-FAP scope; duplicates remain ambiguous and fuzzy suggestions are not consumed as pairs. No current match is labeled a verified insertion/removal. The 19,001 result records are fully searchable, with 100 rows per page and a full download. There are 8,567 exact-title candidates, of which 259 have paired amount differences; 1,648 House rows have fuzzy suggestions, six have ambiguous exact keys, 5,927 are unmatched without suggestions, and 2,853 NEP rows have no unique exact pair. None is manually certified in this run.
- The NEP viewer shows separate arithmetic/evidence badges and evidence filters for all 237 review candidates, including two non-additive reference rows, and four unchecked nodes. Details include bounding boxes, review reasons/candidate amounts, and applicable repairs. Keyboard tree navigation preserves focus. Search can progressively reveal more than 300 matches.
- Amounts now display three decimal places with B (billion), M (million), and T (thousands); downloadable data keeps exact pesos. Every current and historical table has sortable headers. Current project sorts apply to the full filtered dataset before pagination; nested detail rows stay attached to their PAP. Positive deltas are green, negatives red, and zero neutral, with signed values retained.
- The new page uses keyboard-accessible PAP expansions and filters, paginated results, and contained horizontal table scrolling. The index, current page and NEP viewer have no document-level overflow at a 390-pixel viewport in local Chromium smoke checks. Legacy viewers retain their older layouts.
- Packaging rejects stale input hashes, mismatched embedded/source data, invalid accounting, incomplete matching coverage and missing static downloads. The Pages workflow runs the current matching/accounting regressions before packaging. Current report recommendations were updated to v5, while historical metrics remain labeled by version.

Evidence work remains: reconstruct the four House sections, finish the NEP image-review queue, review current project candidate identities, and certify House amendment completeness. The current static comparison has approximately 15 MB of embedded data and a shared local display/sorting script; it renders only the current result page, but does not stream/lazily load the dataset. No live deployment or assistive-technology audit was performed.

## Findings

The NEP source viewer contains the updated canonical tree. The comparison viewers still use older House extracts and the incomplete NEP API baseline. Their historical labels are appropriate, but they cannot yet support current project-change claims. Updating filenames alone would preserve incorrect accounting and matching assumptions.

| Page | Current assessment | Recommended improvement | Priority |
|---|---|---|---|
| `site/index.html` | Current NEP summary; clearly labels the two comparisons historical. Does not expose House v5. | Add House coverage and repair status, the four unresolved PAPs, source/version dates, and links to current evidence/downloads. | High |
| `analysis/nep_2027_tree.html` | Embedded tree exactly matches current `nep_2027_tree.json`; arithmetic is current. Native audit flags are embedded but not displayed. | Show evidence status separately from arithmetic balance; provide review filters and source details. | High |
| `analysis/crosscheck_2027.html` | Generator loads House v4b. Headline extraction and House grand-upper amounts are obsolete; API comparison is not a complete NEP source comparison. | Rebuild accounting and matching against v5 and canonical NEP source branches; retain the API as a separate coverage comparison. | Critical |
| `analysis/taxonomy_comparison.html` | Generator loads House v3 and classifies titles against API rows. Category absence and extraction defects can look like policy changes. | Use canonical program/PAP mappings, comparable scopes, explicit unresolved coverage, and reviewed source matches. | Critical |
| `analysis/nep_tree_viewer.template.html` | Source template for the NEP viewer, not an additional dashboard. | Implement viewer improvements here, regenerate HTML, and update the packaging adaptation together. | High |

The generated `_site` contains the index and three viewers. All three packaged viewers match the current hosted adaptations of their committed source HTML. Static local links pass the existing packaging validator. Packaging therefore reproduces the historical comparison limitations; it does not regenerate or validate their underlying analysis.

## Consistency across the five open reports

The current NEP totals and the House v5 repair notices agree. The main problem is that updates were appended above older recommendations and conclusions. Readers following an individual section or search result can still encounter obsolete claims without the notice. Historical labels do not make incorrect accounting identities valid.

| Report / evidence | Consistency issue | Improvement | Priority |
|---|---|---|---|
| [Work summary](FY2027_work_summary.md), “Current House project candidate” and artifact index | Both still identify v4b as the current/best candidate, contradicting the v5 notice at the top. The next-step list still includes defects repaired in v5, including missing regions, paving, Rainwater, and PM-Primary. | Rewrite current status around v5, 16,148 allocations, ₱581.345349B, zero missing regions, 38/42 balanced PAPs, and the four outstanding sections. Keep v3/v4b work in explicitly dated history. | High |
| [House usability audit](hb_json_usability_audit.md), “Recommendation” and dataset table | Recommends v4b and omits v5 from the inventory, despite its own v5 update notice. Native-title hit counts apply to older extracts. | Recommend v5 with its unresolved coverage limits; add a v5 row. Mark native-title/heading metrics as not rerun for v5 instead of carrying forward older counts. Label all v4b defect tables by version. | High |
| [Crosscheck report](crosscheck_2027.md), sections 1–3 | Says operations plus MOOE is the House grand total and calls incomplete leaves plus MOOE an upper bound. Its historical program deltas compare incomplete extraction with complete source controls. | Remove or explicitly mark the accounting claims as invalid; lead with the printed ₱654.102015B House versus ₱642.612015B NEP comparison. Keep extracted coverage in a separate table. | Critical |
| [Crosscheck report](crosscheck_2027.md), sections 4–6 | Labels API-unmatched rows “House insertions” and “NEP items dropped,” and infers project pass-through from aggregate Rainwater agreement. | Use “House unmatched to API” / “API unmatched to House extract.” Aggregate agreement supports equal controls; project-level changes require reviewed source pairs. Archive version-specific matcher results with their actual inputs and method. | High |
| [NEP source audit](nep_2027_source_audit.md), opening follow-up | Calls all 237 cases independent native-text “discrepancies”; the canonical report distinguishes 23 nearby alignment candidates from 214 text/image-review cases. It also contains a stale instruction to revise earlier work-summary wording. | Use “237 review candidates” consistently; give the 23/214 split and four unchecked nodes, and identify completed corrections versus remaining review. | Medium |
| [NEP tree report](nep_2027_tree.md) | Current totals, evidence counts, scope, and limits agree with the canonical JSON. It is the clearest baseline report. | Keep it as the method reference. Standardize the other reports' status terminology and link them back here. Explain that 2,552 checks include 2 derived groupings, rather than implying every grouping has a standalone printed control. | Medium |

Use the same short status block on the index, viewers, work summary, and audits: fiscal year, budget stage/source document, dataset version, scope, units, printed control, extracted coverage, arithmetic status, evidence-review status, and assessment date. Separate **current findings**, **unresolved evidence**, and **historical analysis** in each report. Use one date format and distinguish source document dates from build/assessment dates.

Allocation rows, source projects, tree nodes, and atomic funding units are different measures. Label each count explicitly; do not use them interchangeably as “projects.” The NEP's 45 non-FAP PAP controls and House's 42 local PAP controls also need an explicit mapping rather than positional comparison.

## Confirmed accounting and interpretation defects

- `crosscheck_2027.json` embeds `hb_grand_upper_php = ₱545,337,409,000`. This is v4b's ₱520,651,663,000 plus MOOE ₱24,685,746,000, not the printed House grand total and not a demonstrated upper bound. The difference from the printed total is ₱108,764,606,000.
- `s2o_gas.hb_printed_php = ₱49,371,492,000` adds total MOOE to its GAS and S2O MOOE components, double counting MOOE while omitting other expense classes. The viewer consequently shows a GAS/S2O delta of −₱20,316,449,000. The printed cross-class comparison is ₱67,160,354,000 − ₱69,687,941,000 = **−₱2,527,587,000**. Fix source scope as well as the addition; simply removing one addend still leaves a MOOE-only comparison.
- Crosscheck metadata says ₱18.7B stays unclassified, but its embedded accounting has zero unclassified rows and pesos. The generator's module description names v3 while its `LEAVES` constant names v4b. Display input-derived metadata instead of stale descriptions.
- Crosscheck rows still display `(deleted)` for API-unmatched records, and tooltip text describes matched amount differences as “House re-priced.” Taxonomy still defines “HB only” as “House-inserted category/family” and repeats the old approximately ₱127B missing-project explanation. These local labels contradict the current caveats and hosted historical banner. Replace them at the point of use, including generator strings.
- Taxonomy's displayed ₱476.814011B House classified total excludes ₱43.011411B unresolved and ₱0.826241B generic rows from the v3 extraction. Present that excluded coverage beside the total rather than relying on a footer. Its ≤0.5% “aligned” status is a tolerance classification, not exact peso agreement or source verification.

## Data that the pages should communicate

- **NEP new appropriations:** ₱642,612,015,000, excluding automatic appropriations. The tree has 16,764 nodes, 14,190 atomic budget units, and 2,552 exactly balanced additive rollups. It records 54 repairs.
- **NEP evidence review:** 16,760 source rows checked; 16,523 within-box agreements, 23 nearby alignment candidates, and 214 needing native-text/image review. The 237 candidates are not confirmed amount errors. Four nodes lack a comparable printed row/bounding box. Arithmetic balance does not resolve this evidence queue.
- **House printed new appropriations:** ₱654,102,015,000. This consists of operations ₱586,941,661,000 plus GAS/S2O ₱67,160,354,000, across expense classes. The comparable printed House–NEP total difference is **+₱11,490,000,000**.
- **House v5 extracted operations:** ₱581,345,349,000 across 16,148 positive allocations. Local PAP allocations total ₱536,596,338,000; the 29 FAP projects total ₱44,749,011,000, with funding splits balanced. **38 of 42 local PAP controls balance**; the operations net shortfall is **₱5,596,312,000**. This is extraction coverage, not the full House budget.

The four unresolved House PAPs must be visible wherever current extraction totals are used:

| PAP | v5 minus printed control |
|---|---:|
| BIP access roads/bridges to public buildings/facilities | −₱2,241,795,000 |
| BIP multi-purpose buildings/facilities | −₱5,115,958,000 |
| Water Supply System | +₱304,641,000 |
| BIP coastal roads | +₱1,456,800,000 |

Their discrepancies offset. A small net difference must not be presented as proof of complete coverage.

The NEP API contains ₱445,378,063,000 across 11,372 project rows. Its ₱197,233,952,000 difference from the complete new-appropriations source is decomposed into GAS/S2O ₱69,687,941,000, FAP ₱117,749,011,000, and 23 omitted non-FAP allocations totaling ₱9,797,000,000. Replace the older undifferentiated “about ₱127B missing projects” explanation.

## Required comparison changes

1. Establish separate views for printed source controls, extracted allocations, and API coverage. Always display scope, expense classes, local/FAP boundary, units, stage, and source version.
2. Replace the crosscheck's `hb_grand_upper_php` calculation. It adds MOOE to an incomplete extraction and does not reproduce the printed budget. Correct the `s2o_gas['hb_printed_php']` calculation, which adds MOOE to GAS/S2O controls and double counts that component.
3. Use the updated NEP tree for program and PAP controls. Match House rows against source project branches, preserving unresolved matches and PDF provenance. Atomic GOP/loan units partition project totals: they must not be counted as separate projects or matched independently to a House project total.
4. Re-run matching before showing current edited/House-only/NEP-only results. Label unmatched rows as unmatched; an absent API record or incomplete House section does not establish an insertion or removal. Expose fuzzy-match confidence and review evidence.
5. Separate exact peso agreement from percentage tolerance. Category mappings should use stable program/PAP identifiers and audited hierarchy, with title matching only as a documented fallback. Normalize regions explicitly and preserve Nationwide/office allocations.
6. Add a House source-control viewer or equivalent coverage panel, showing 38/42 balanced controls, the four discrepancies, FAP funding, and repair provenance. Link it from every comparison and the index.

## NEP viewer improvements

Display native evidence badges alongside balance badges, with filters for the 237 review candidates and four unchecked nodes. The detail pane should expose audit reason, candidate amounts, source page/bounding box, and applicable repairs. Derive summary counts from validation data instead of hardcoding zero unbalanced branches. Link the atomic ledger, full native audit, review queue, and validation/repair downloads.

The approximately 9 MB HTML embeds the full tree. Search scans the tree and returns at most 300 matches; selection/toggling rebuilds the visible DOM. Consider loading the JSON separately, indexing search, and rendering only visible rows. Make result limits explicit. Improve narrow-screen layout and add tree semantics, expansion state, column labels, and keyboard navigation. Evidence and balance status should remain understandable without relying on color.

The tree already reports its search cap explicitly: the local “road” search returned **3,808 matches · showing first 300**. Preserve that behavior; improve it with pagination or a full-results download. Performance recommendations above come from implementation inspection, not measured load-time or interaction benchmarks.

Local source PDF paths do not work on the hosted site. Continue showing page numbers, and offer a configurable accessible source link or clearly identified local PDF instructions. A page number alone is not an independently accessible citation.

## Packaging and maintenance

`scripts/build_pages.py` currently copies committed pages; it does not regenerate them. Its downloads omit House v5/repair results, NEP atomic budget units, and the full native audit. Package these alongside a comparison manifest containing input hashes, build date, fiscal year, budget stage, and scope. Display that information on the pages.

Add checks that embedded/source payloads agree, accounting identities hold, advertised dataset versions match generator inputs, and required downloads exist. Extend coverage to JavaScript-generated links. The existing validator checks static local links and unrendered tree placeholders, but cannot establish dataset freshness. Run the relevant tree and comparison checks in the Pages workflow before packaging.

Hosted PDF-link adaptation depends on exact JavaScript/HTML string replacements. Update the adaptation when changing viewer markup, or replace these hooks with an explicit rendering configuration. Preserve historical pages under versioned names if the current pages are rebuilt. Update README and shared navigation to explain the current House candidate and current comparison baseline.

## Reference pages

All 38 HTML files under `reference/ph-budget-analysis/docs` are upstream reference/context pages, not generated from the local House/NEP extracts and not packaged by this project's Pages script. Their unrelated agency, historical, slide, and macroeconomic pages do not need a DPWH dataset rebuild.

The relevant reference entry points are `index.html`, `dpwh.html`, `hgab-2027-assessment.html`, `nep-2027-assessment.html`, `pap-browser.html`, and `agency-budget-utilization.html`. The HGAB assessment identifies a 6 October committee-report basis and already cites approximately ₱654.1B House versus ₱642.6B NEP. Preserve that stage/date when citing it. The DPWH historical page uses new plus automatic appropriations in parts of its long-run analysis; that scope differs from our new-appropriations tree. PAP and agency viewers launch external tools using separate upstream workbooks; their peso versus thousand-peso conventions also differ. Link these as contextual sources with scope and units, rather than treating them as current local project reconciliations.

## Verification and implementation order

Completed in this reassessment:

- All three embedded viewer payloads equal their corresponding JSON artifacts. All three packaged viewers equal their source HTML after the hosting adaptation. Static packaged links pass validation.
- The NEP atomic ledger sums to ₱642,612,015,000. Its checks contain 2,550 `pass` and 2 `derived` statuses, with no mismatch. All five existing `test_nep_tree.py` tests pass, including the offsetting-error evidence test.
- House v5 has 16,148 positive allocations summing to ₱581,345,349,000, zero missing regions, 16,119 local PAP rows and 29 FAP rows. The repair artifact has 42 PAP checks, 38 exact balances, and a combined difference of −₱5,596,312,000.
- Local packaged pages load in headless Chromium without JavaScript errors at 1440 × 1000. The NEP search, row selection, program switch, and collapse controls work; crosscheck PAP expansion and project filtering work; taxonomy filtering and sorting work.
- At 390 × 844, the index and NEP page have no document-level horizontal overflow. In the exercised filtered states, crosscheck overflows by **520 px** and taxonomy by **170 px**. Wrap wide tables in labeled horizontal-scroll containers, adjust controls for mobile, and keep navigation/headlines within the viewport.
- Crosscheck expandable PAP rows have no `tabindex` and rely on click handlers; taxonomy also uses clickable table rows and span filters. Provide native buttons, visible focus, and `aria-expanded`. The NEP uses buttons but lacks tree semantics and loses DOM focus when rebuilding rows. This was a code-level accessibility review, not a full assistive-technology audit.

No live deployment, external links/tools, exhaustive browser coverage, or performance benchmarks were verified. Local PDF review was limited to the existing NEP regression test; this assessment did not resolve the evidence queues.

Recommended sequence: fix comparison accounting and source mapping; rebuild reviewed project matching; expose House coverage and NEP evidence status; then improve navigation, performance, accessibility, downloads, and CI freshness checks. The four House sections and NEP image-review queue remain evidence work regardless of interface improvements.

Acceptance checks for the next implementation:

1. Current report recommendations and page badges identify House v5; v3/v4b results carry visible historical/version labels, and repaired defects are removed from current next steps.
2. Printed controls reproduce ₱654.102015B House and ₱642.612015B NEP, +₱11.49B overall and −₱2.527587B GAS/S2O. Extraction totals cannot populate printed-budget fields.
3. All four unresolved House PAPs and the NEP 237-candidate/four-unchecked evidence status are visible beside relevant totals. A balanced arithmetic badge does not imply image verification.
4. Unmatched, candidate match, amount difference, tolerance agreement, and exact agreement are distinct labels. Current change claims link to reviewed source pairs and a manifest of the actual matcher inputs/method.
5. Search and filters state which rows they cover. Crosscheck currently embeds at most 800 findings per class and displays at most 400 rows, so searching it cannot establish absence from the full dataset. Provide full-data search or a clearly labeled searchable subset and download.
6. At 390 px, wide tables scroll within their containers; core controls and expansions work by keyboard; required downloads and generated links resolve; freshness/accounting checks run before packaging.

Supporting artifacts: [NEP tree](nep_2027_tree.md), [House repairs](hb_known_defect_repairs.md), [House usability audit](hb_json_usability_audit.md), and [work summary](FY2027_work_summary.md).
