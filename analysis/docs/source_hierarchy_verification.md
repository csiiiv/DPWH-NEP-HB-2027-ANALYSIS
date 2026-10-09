# Verify DPWH source hierarchies before comparisons

Date: 9 October 2026. Start with the [static overview](../../site/index.html). The three sources are **House Native I-B**, **NEP PDF source**, and **DPWH Transparency NEP FY2027 API data**. The earlier multi-year contract viewer was the wrong source and has been removed from this phase.

Each viewer separates hierarchy arithmetic, source evidence, coverage, and scope. Tree rows show retained PDF page references where available. House references open the PDF at that page; NEP review references open the retained source image, and other NEP rows show the page number. API groupings and projects have no invented PDF page references. Selecting a branch shows its parent path, immediate additive child sum, recursive leaf sum, and progressive child balances. Each path segment is navigable: selecting one opens that entity, clears search/review filters, expands its ancestor chain, and focuses the matching tree row. Navigation outside the selected expense class returns to the full source hierarchy. Review-queue context paths navigate the same way. Searches cover all hierarchy nodes, including every API project code and title. The candidate comparison and stage trace remain provisional references; certified comparisons are deferred. Superseded OCR-era House viewers, historical crosschecks, exploratory generators and outputs now live in [the archive](../archive/README.md).

| Source | Retained total (PHP) | Arithmetic | Outstanding verification |
|---|---:|---|---|
| [House Native I-B](../viewers/hb_native_verification.html) | 654,102,015,000 | 660 internal nodes pass direct and recursive checks across four expenditure columns | Native I-C detail and cross-volume checks pass; project identities and amendment completeness remain provisional. |
| [NEP PDF source](../viewers/nep_source_verification.html) | 642,612,015,000 | 2,552 additive branch checks pass; atomic ledger agrees | 3,193 source checks remain after the per-item column reassessment; two derived groupings are informational. |
| [DPWH Transparency NEP API](../viewers/dpwh_nep_api_verification.html) | 445,378,063,000 | 2,662 derived grouping checks pass; 11,372 unique project records match retained listing summaries | Source documents and API release coverage need confirmation before comparison with printed budgets. |

The [overview JSON](../data/source_verification_overview.json) retains `comparison_ready: false` for all three. Arithmetic is one verification step; it does not certify every label/document or establish equivalent source coverage.

## Expenditure classes

The printed sources show total appropriations as **PS + MOOE + CO**, counted once. The verification viewers display a separate expenditure table:

| Source | PS (PHP) | MOOE (PHP) | CO (PHP) | Total (PHP) |
|---|---:|---:|---:|---:|
| NEP PDF | 14,922,297,000 | 24,685,746,000 | 603,003,972,000 | 642,612,015,000 |
| House Native I-B | 14,922,297,000 | 24,685,746,000 | 614,493,972,000 | 654,102,015,000 |

The NEP **Expense class** selector opens the retained PS, MOOE, or CO branch. Searches and review queues stay within that selected class, and parent paths and source pages remain available. Header cards remain explicitly source-wide totals. House nodes already retain all four expenditure columns; the evidence panel shows each selected branch's breakdown. The retained Transparency API listing has no PS/MOOE/CO split, so its viewer states that the breakdown is unavailable. No split is inferred from another source.

The builder verifies that the three retained expense-class controls reproduce each printed source's total. These are independent source checks; they do not establish that the sources cover the same allocations.

## General extraction context

The [PDF dataset method](pdf_budget_dataset_method.md) explains the reusable
source-to-row-to-hierarchy workflow and concrete edge cases. Native House
extraction and NEP's OCR-derived hierarchy with PDF-text checks share accounting
rules but have different source-evidence limits. The guide includes complete
BCIB paths and funding partitions in both sources.

The comparison's optional region-independent mode adds flagged unique
candidates while retaining source assignments. It does not resolve source-review
flags or certify project identity. See [shareable findings](shareable_findings.md).

## Per-item amount reassessment (9 October 2026)

The earlier expense selector did not reassess individual values. In particular, the operating-unit portion displayed PS alone under a generic amount label and omitted the other printed columns. The earlier native-text check also used a fixed x range for PS and PAP amounts: the PS range can read MOOE on continuation pages such as PDF page 14. A matching amount anywhere in a large row area was accepted even when it covered neighbouring rows. Those checks were insufficient.

The extractor now inspects all **16,764 nodes**, records their amount basis (`ps`, `mooe`, `co`, or agency `total`), and retains each page's amount-column polygon. The text audit interpolates those page-specific boundaries. Operating-unit columns are resolved from the actual page layout: a three-amount continuation page has PS, MOOE, and Total; it does **not** have CO as its third column. Four-amount pages have PS, MOOE, CO, and Total. All **307 printed operating-unit rows** retain their captured columns and satisfy known-column sum versus printed row total; omissions remain null rather than claimed zeros.

For example, `ps:p13:r4` (NCR Regional Office – Proper, PDF page 13) has **PS ₱78,157,000**, **MOOE ₱24,732,000**, and **row total ₱102,889,000**. The PS branch adds ₱78,157,000; the full row total is contextual and is not added again. MOOE/CO PAP rows establish only their own class allocation, not an all-class item total.

The [every-item reassessment](../data/nep_2027_amount_column_reassessment.json) retains page-geometry hashes, row-column partitions, amount basis, and audit status for every comparable printed row, bound to the canonical tree hash. **16,760** printed rows are text-checked: **13,569** have a single-line column/text match, **3,149** have multiple amount lines in the extraction area, **28** have text disagreements, and **14** have nearby matches. Four nodes lack a comparable row: two summary controls remain actionable, while two derived groups are informational.

No allocation was numerically changed by this reassessment. It corrects lost expense-column context and invalid evidence classification; it does not certify all original OCR values. Single-line text support remains OCR evidence rather than rendered-image proof. All 3,193 actionable flags have retained source images. The larger queue supersedes the earlier 237-candidate audit; comparisons remain deferred until row identity and printed amounts are resolved.

## Viewer workflow

The overview opens each hierarchy directly and has a separate entry into NEP source review. Source tabs identify the active dataset. Expenditure context is expandable so the workspace is easier to reach.

Review-category buttons show pending counts within the selected expense class or branch and open that queue. **Reset view** clears search, filters, branch restrictions, and the expense selection. **Exact PHP** switches tree-row amounts from compact units to pesos; detail amounts always remain exact. Press **/** outside a text field to focus search.

On phones and tablets, **Tree / results** and **Selected evidence** switch workspace panels without discarding the selection. Selecting a row opens its evidence; navigating a path reveals its tree row. Review details show previous/next controls and a clickable source image before the unverified text candidates. Empty searches offer a reset action.

## Review source flags

The viewer has separate **Arithmetic** and **Source evidence** columns. A balanced branch can still contain unverified extraction amounts; flags are pending checks, not confirmed budget errors. Parent branches show how many source checks are below them and open a queue restricted to that branch.

Choose **Start review** to inspect 3,193 actionable NEP checks: 3,149 ambiguous row areas, 28 text disagreements, 14 possible row-alignment issues, and two unaudited summary controls. Filters also expose two derived groupings with no printed control; these are context and are excluded from the default queue.

Each candidate shows the retained amount, raw PDF text, parsed candidates inside/near the extraction area, and candidate-minus-retained differences. A retained PDF crop shows the printed row and surrounding context; the amber outline marks the extraction area whose alignment may need checking. Summary controls show the full summary page. Previous/next buttons move through the queue. Review the label, amount column, and adjacent rows before proposing a correction. No flag is automatically resolved and no budget amount is changed by this presentation.

The [evidence index](../data/source_review_evidence.json) ties each crop to the retained PDF hash, tree hash, review-queue hash, and image hash. To regenerate crops after extraction changes, run `python3 analysis/builders/build_source_review_evidence.py` with the retained local NEP PDF and PyMuPDF available, then rebuild the verification pages. Committed crops are packaged with the static pages; CI does not need the local PDF.

## DPWH Transparency NEP snapshot

The source folder is now [dpwh-transparency-nep-data/](../../dpwh-transparency-nep-data), renamed from `nep-data/`. Its scripts record the BetterGov-hosted endpoint `https://api.dpwh.bettergov.ph/nep/projects`; this is the retained DPWH Transparency NEP project dataset intended here. The separate scraper checkout's `/projects` contract archive is outside scope.

The combined listing contains **11,372 FY2027 project codes and IDs**, with no duplicate identities or missing hierarchy fields. Amounts are converted from **thousands of PHP to integer PHP**, yielding **₱445,378,063,000**. The hierarchy follows `pap1 → pap2 → pap3 → region → office → project code`; grouped totals are derived, not independently printed controls.

All **23 original listing pages** are present. Their global reported count and amount agree with the combined snapshot, and every retained project record agrees exactly. All **11,372 successful detail responses** match the listing's ID/code/year, PAP hierarchy, region, office, title, and amount; they index **5,155 documents**. The older `progress_stats.json` counter lags the files on disk and is not used as the verification baseline.

The [normalized API tree](../data/dpwh_transparency_nep_tree.json) retains source code/ID, combined snapshot row index, original amount in thousands, and document counts. The [audit](../data/dpwh_transparency_nep_tree_validation.json) contains every rollup, original listing page hashes/summaries, and detail-file coverage findings. These checks establish the retained API snapshot's consistency. They do not establish that it covers every allocation in the printed NEP PDF.

Native House artifacts now live in `analysis/data/`: `hb_dpwh_native_tree.json`, `hb_dpwh_native_rollup.json`, and `hb_native_outline_report.json`. The renamed API folder contains API data and fetch tools.

## Rebuild and verify

For a checkout with the committed trees, audits, and source crops, rebuild and
validate the static pages without external inputs:

```sh
python3 analysis/builders/build_current_pages.py
python3 analysis/builders/build_stage_trace.py
python3 scripts/validate_current_pages.py
python3 -m unittest discover -s analysis/tests -p test_source_verification.py -v
node --test analysis/tests/test_source_verification_viewer.cjs
python3 scripts/build_pages.py
python3 -m http.server 8000 --directory _site
```

`build_source_verification.py` can refresh just the three verification viewers.
`build_current_pages.py` also refreshes the earlier candidate page's embedded
canonical data and manifest, which packaging checks for freshness.

When changing extraction or source artifacts, rebuild the relevant source first:

```sh
# NEP: retained local PDF, PAP/operating-unit trees, and table-structure pages.
python3 analysis/builders/build_nep_tree.py --source-dir /path/to/paddle_pdf_ocr_v2
python3 -m unittest discover -s analysis/tests -p test_nep_tree.py -v
# Reads the retained PDF path from canonical provenance; requires PyMuPDF + Pillow.
python3 analysis/builders/build_source_review_evidence.py

# API: combined snapshot, plus local raw pages/details for the full coverage audit.
python3 analysis/builders/build_dpwh_nep_api_tree.py

# HB: run these only when updating the retained native control extraction.
python3 scripts/hb_native_extract3.py \
  'HB_BUDGET/2 - HB 10858 VOL IB.pdf' 13 110 analysis/data/hb_dpwh_native_tree.json
python3 scripts/hb_native_rollup.py
python3 scripts/hb_native_ic_rollup.py
```

These source commands are independent choices; run only those relevant to your
change. Then refresh dependent pages and run the artifact validation/package
commands above. [Local input requirements](../../README.md) specify the NEP
filenames and explain which inputs are excluded from Git.

The API tree importer uses the committed combined snapshot, and checks original listing/detail files when available locally. The verification-page builder performs no project matching, source-PDF extraction, or network calls. The legacy `build_current_pages.py` also refreshes the verification overview after rebuilding its earlier candidate page.

Packaging recomputes unique traversal paths, parent links, reachability, immediate-child and recursive sums, API project identities/amounts/labels/parent metadata paths, and NEP atomic units. HB also checks expenditure-column partitions. The [manifest](../data/source_verification_manifest.json) records source and presentation hashes; stale pages or datasets stop packaging.

CI uses committed snapshots and normalized trees without local listing/detail downloads or external NEP OCR directories. Native House regressions additionally install pinned PyMuPDF and read the committed I-B/I-C PDFs. Before comparisons resume, finish the open PDF/document review and confirm each source's allocation grain and coverage.
