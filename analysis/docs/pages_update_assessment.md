# Static pages: current UI, validation, and remaining work

Updated: **9 October 2026**. This replaces the earlier dashboard implementation assessment. Start with the [overview](../../site/index.html) and [source-verification methods](source_hierarchy_verification.md). Earlier comparison pages remain reference material; comparisons are deferred.

## Current pages

| Page | What it verifies | Remaining source work |
|---|---|---|
| [Native House I-B](../viewers/hb_native_verification.html) | 660 immediate-child and recursive checks across PS/MOOE/CO/Total; 1,746 additive leaves reproduce ₱654,102,015,000 | Native I-C extraction for named local projects |
| [NEP PDF source](../viewers/nep_source_verification.html) | 2,552 additive branch checks; 14,190 atomic units reproduce ₱642,612,015,000; every node has an expense basis | 3,193 actionable source checks; retained amounts remain provisional |
| [DPWH Transparency NEP](../viewers/dpwh_nep_api_verification.html) | 11,372 unique FY2027 records and 2,662 derived group checks reproduce ₱445,378,063,000 | Documents, release scope, and coverage against the printed budget |

The API is the retained NEP project listing from the BetterGov-hosted `/nep/projects` endpoint, not the multi-year contract archive. House native artifacts are under `analysis/data/`; API downloads and fetchers are under `dpwh-transparency-nep-data/`.

## Implemented interaction

- The overview identifies three sources and links directly into NEP review. Source tabs highlight the active dataset.
- Compact source summaries and an expandable expenditure table keep the workspace easier to reach. PS/MOOE/CO availability is explicit; the API split is unavailable.
- Hierarchy rows show amount basis, arithmetic, source evidence, available page references, and pending checks beneath parent branches. Operating-unit rows also show their captured full-row expenditure columns.
- Path segments navigate to the entity, expand its ancestors, clear obstructing filters, and focus its tree row. Navigation outside a selected expense class returns to the full hierarchy.
- Search covers all retained nodes in the selected scope. Filtered results show counts and initially display 150 entries; **Show 150 more matches** extends the list. A reset action is available for empty results.
- Review-category buttons open a queue within the selected class/branch. Source images precede text candidates; previous/next controls and full-size image links support inspection.
- **Exact PHP** changes tree-row formatting; evidence amounts remain exact. **Reset view** clears the search, filter, review branch, and expense selection. **/** focuses search outside text-entry controls.
- At widths up to 1200px, **Tree / results** and **Selected evidence** switch panels without losing the selection. Selecting an item opens evidence; path navigation reveals the tree. Narrow rows use a card layout.

These interactions expose evidence; they do not resolve source flags or change budget allocations.

## Corrected NEP evidence model

The earlier fixed-x text audit could check MOOE while intending to check PS on continuation pages. It also accepted a matching amount inside a box containing multiple rows. The rebuilt [per-item reassessment](../data/nep_2027_amount_column_reassessment.json) uses each page's amount-column polygon and covers all 16,764 nodes.

Of 16,760 comparable printed rows, 13,569 have single-line column/text support, 3,149 have ambiguous multi-line row areas, 28 have text disagreements, and 14 have nearby matches. Two summary controls add to the actionable queue: **3,193 checks**. Two derived groupings are informational. The old 237-candidate count is superseded. Text support is OCR evidence, not exhaustive image certification.

PS amounts and full printed operating-unit row totals are distinct. All 307 printed operating-unit rows retain their captured columns. Missing columns stay null, not assumed zero. PAP rows establish only the amount of their own expense class. See [expense treatment and source checks](source_hierarchy_verification.md).

## Packaging and checks

[build_pages.py](../../scripts/build_pages.py) packages the six retained verification, NEP detail, candidate-comparison, and stage-trace viewers, shared scripts/styles, retained snapshots, source-review images and their provenance index, and House PDFs into `_site/`. It validates embedded data, hashes, accounting, local links, and required downloads first. Markdown report links use GitHub; the retained NEP PDF itself is local, with committed crops available for review.

The [Pages workflow](../../.github/workflows/pages.yml) runs current-page, budget-formatting, source-verification, viewer, stage-trace, and README-navigation checks. Pushes affecting the configured paths on `main` publish the static build; pull requests validate without publishing. CI uses committed artifacts and does not need external NEP OCR/PDF inputs or ignored API detail downloads.

Browser checks exercised the overview and three verification viewers at widths **320, 390, 768, 1024, and 1440px**. Review entry links, categories, exact amounts, reset, search shortcut, path navigation, source-image loading, and mobile panel switching passed without page errors or document-level horizontal overflow. This is targeted browser coverage, not a full assistive-technology audit or performance benchmark.

## Remaining work

1. Resolve source row identity and printed amounts, recording evidence before correcting values. Rebuild affected ledgers, evidence, pages, and hashes after a repair.
2. Extract Native I-C project detail and confirm API release/document coverage.
3. Establish comparable allocation grain, expense scope, local/FAP boundaries, fiscal year, and units before resuming matching.
4. Keep earlier v3/v4b/v5 comparison results visibly provisional. Unmatched or fuzzy rows do not establish insertions or removals.
5. Measure load/search performance and conduct broader keyboard and assistive-technology testing before making performance or accessibility claims.

For rebuild commands, use [analysis/README.md](../README.md). Architecture choices are recorded in the [ADRs](adr/README.md).

## Archive boundary — 9 October 2026

Superseded OCR-era House viewers, earlier crosschecks/taxonomy, exploratory
scripts, reports, outputs, and Ghostscript dumps are now under
[analysis/archive](../archive/README.md). They are excluded from the current
published viewer/download list. The stage trace remains active as a provisional
candidate workflow; it does not reopen the source-verification gate.

The overview and all six retained static viewers link to both the repository
README and the analysis workbench README. Hosted links open rendered Markdown
on GitHub; local links follow the checkout layout. Packaging checks that both
README links are present on every published page.

After the archive and README-navigation update, the overview plus all six
retained viewers passed browser checks at 390px and 1440px. Both README links
were visible on every page, with no page errors, failed local assets, or
horizontal overflow. Markdown links, data freshness/accounting, README-reference
regressions, current/archived Python tests, and Node viewer checks were also checked.

## Homepage navigation correction — 9 October 2026

The archive rewrite encoded the JavaScript placeholder `${s.page}` as
`%24%7Bs.page%7D`. The published homepage consequently generated nonexistent
URLs for all three source cards and the NEP review entry. The post-archive
browser checks above loaded viewers directly and missed this regression.

The placeholder is restored, and the stage comparison with total/delta/percent
sorting, House/NEP candidate comparison, and detailed NEP tree now have visible
homepage cards outside the archive disclosure. The source-verification gate
still applies to the candidate comparisons.

Packaging rejects encoded JavaScript URL placeholders. A Node regression test
executes the packaged homepage script, resolves its generated source/review
links under a GitHub Pages project prefix, checks target files, reproduces the
encoded-placeholder failure, and checks visible comparison navigation. Pages CI
runs this test after packaging. Browser validation follows all seven rendered
source, review, and comparison links at 390px and 1440px under the project prefix,
checks rendered local downloads, and exercises delta/percent sort controls in
both PAP and project tables.


## Simplified homepage — 9 October 2026

The landing page now has three concise source-verification cards, a direct entry
to the sortable stage comparison, and links to both READMEs and the repository.
It keeps each source’s total, arithmetic status, rollup count, and the NEP review
shortcut. A single note states that source review/coverage remain open and
comparisons are provisional.

The repeated verification table, next-work list, archive disclosure, older
House/NEP comparison card, detailed NEP card, and build-download footer links
have been removed from the homepage. The retained detail/comparison pages and
archive remain discoverable in the workbench README. Source data and the six
packaged viewers are unchanged. Navigation regressions check that only the
current stage comparison appears in the homepage comparison section.


The stage comparison is now the homepage hero: “Compare budget stages” is the
main heading, with the sortable comparison as the primary action and the
provisional-results note alongside it. The three verification cards follow below.

## Header navigation tabs — 9 October 2026

All seven current pages use the shared `page_navigation.css` stylesheet for
header navigation. Links have bordered tab styling, a filled active-page state,
keyboard focus rings, and wrapping with 44px touch targets on mobile. README
links use a quieter tab style. The homepage now has the same header navigation;
its duplicate README footer links are removed. The comparison hero remains the
primary action below the header.

These are page-navigation links marked with `aria-current="page"`, preserving
normal browser navigation, keyboard access, and open-in-new-tab behavior.
Packaging includes the shared stylesheet, and the source-verification manifest
tracks its hash. Existing section jump links on the earlier comparison page
receive the same styling.
