# Page assessment after the NEP and House dataset updates

Assessment date: 8 October 2026. This reviews local artifacts and generators, not the live deployed site. No viewer or dataset was changed as part of this assessment.

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

Local source PDF paths do not work on the hosted site. Continue showing page numbers, and offer a configurable accessible source link or clearly identified local PDF instructions. A page number alone is not an independently accessible citation.

## Packaging and maintenance

`scripts/build_pages.py` currently copies committed pages; it does not regenerate them. Its downloads omit House v5/repair results, NEP atomic budget units, and the full native audit. Package these alongside a comparison manifest containing input hashes, build date, fiscal year, budget stage, and scope. Display that information on the pages.

Add checks that embedded/source payloads agree, accounting identities hold, advertised dataset versions match generator inputs, and required downloads exist. Extend coverage to JavaScript-generated links. The existing validator checks static local links and unrendered tree placeholders, but cannot establish dataset freshness. Run the relevant tree and comparison checks in the Pages workflow before packaging.

Hosted PDF-link adaptation depends on exact JavaScript/HTML string replacements. Update the adaptation when changing viewer markup, or replace these hooks with an explicit rendering configuration. Preserve historical pages under versioned names if the current pages are rebuilt. Update README and shared navigation to explain the current House candidate and current comparison baseline.

## Reference pages

All 38 HTML files under `reference/ph-budget-analysis/docs` are upstream reference/context pages, not generated from the local House/NEP extracts and not packaged by this project's Pages script. Their unrelated agency, historical, slide, and macroeconomic pages do not need a DPWH dataset rebuild.

The relevant reference entry points are `index.html`, `dpwh.html`, `hgab-2027-assessment.html`, `nep-2027-assessment.html`, `pap-browser.html`, and `agency-budget-utilization.html`. The HGAB assessment identifies a 6 October committee-report basis and already cites approximately ₱654.1B House versus ₱642.6B NEP. Preserve that stage/date when citing it. The DPWH historical page uses new plus automatic appropriations in parts of its long-run analysis; that scope differs from our new-appropriations tree. PAP and agency viewers launch external tools using separate upstream workbooks; their peso versus thousand-peso conventions also differ. Link these as contextual sources with scope and units, rather than treating them as current local project reconciliations.

## Verification and implementation order

Completed: page/generator inventory, embedded NEP payload equality, packaged/source adaptation equality, static packaged-link validation, and all five `test_nep_tree.py` tests. No rendered-browser, external-tool, or live-deployment verification was performed.

Recommended sequence: fix comparison accounting and source mapping; rebuild reviewed project matching; expose House coverage and NEP evidence status; then improve navigation, performance, accessibility, downloads, and CI freshness checks. The four House sections and NEP image-review queue remain evidence work regardless of interface improvements.

Supporting artifacts: [NEP tree](nep_2027_tree.md), [House repairs](hb_known_defect_repairs.md), [House usability audit](hb_json_usability_audit.md), and [work summary](FY2027_work_summary.md).
