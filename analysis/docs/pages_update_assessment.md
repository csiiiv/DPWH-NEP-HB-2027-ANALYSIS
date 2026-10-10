# Current budget webpages and remaining work

Updated: **9 October 2026**. The [React workbench](../web/README.md) is the
published presentation. Retained HTML viewers are reproducible diagnostic
outputs; their published URLs redirect to the corresponding app routes.
Comparisons remain provisional while source evidence and project identities
are reviewed.

## Current views and source scope

| View | Current data and checks | Remaining work |
|---|---|---|
| Home / House verification | Native I-B: ₱654,102,015,000 across PS/MOOE/CO, 660 balanced internal controls, 1,746 terminal leaves. Native I-C summary: ₱639,179,718,000 MOOE+CO, 15,972 named-project leaves, 29 FAP totals, 2,686 internal checks and 56 independent I-B checks | Project identity and amendment completeness |
| House / NEP comparison | Native I-C operations: 16,270 allocation records, ₱586,941,661,000 including FAP; 44/44 mapped non-FAP PAP controls balance; zero extraction gap | One NEP PAP unmapped; candidate identity review |
| Stage comparison | Current native I-C / DBM NEP / retained Transparency NEP candidates, with full-result total, delta and percent sorting | Matches do not establish insertions, removals or final amendments |
| DBM NEP verification / detail | 2,552 additive branch checks; 14,190 atomic units reproduce ₱642,612,015,000 | 3,193 actionable source checks |
| Transparency NEP verification | 11,372 unique FY2027 records and 2,662 derived group checks reproduce ₱445,378,063,000 | Release/document coverage against the printed budget |

I-B office allocations, I-C named-project leaves, FAP project totals, and
comparison allocation records have different grains. I-C excludes Personnel
Services; its MOOE+CO total is not the full agency total or the operations total.
The current sources remain the retained HB 10858 PDFs under `HB_BUDGET/`.
The House readings tab additionally compares the retained third-reading artifacts and opens their own PDF documents. See [reading differences](house_reading_comparison_checks.md).

The OCR-era v5 candidate and its four extraction gaps are historical. Current
builders, manifests, webpage payloads and packaged downloads use native I-C.
Historical reports retain their original figures under an explicit retired
status. See [I-C checks](hb_native_ic_rollup_checks.md),
[I-B checks](hb_native_ib_rollup_checks.md), and
[source verification](source_hierarchy_verification.md).

## Interaction and evidence

The app shares route navigation and an embedded PDF pane. House control trees
open Volume I-B; House comparison references open Volume I-C; DBM references
open NEP Volume II-B. Search, expense selection, review queues, progressive
rollups, mobile panel switching, and exact amounts remain available. Source
crop images are absent from the migrated verification views; their audit
artifacts remain retained separately. Downloads expose native I-C JSON and its
source/rollup audit.

The NEP reassessment covers 16,764 nodes. Of 16,760 comparable printed rows,
13,569 have single-line column/text support, 3,149 have ambiguous multi-line
areas, 28 have text disagreements, and 14 have nearby matches. Two summary
controls bring the actionable queue to 3,193; two derived groupings are context.
Balanced arithmetic does not resolve those source flags.

## Rebuild and validation

```sh
python analysis/builders/build_current_pages.py
python analysis/builders/build_stage_trace.py
python scripts/validate_current_pages.py
npm test --prefix analysis/web
npm run build --prefix analysis/web
python scripts/build_pages.py
node --test analysis/tests/test_static_navigation.cjs
python scripts/check_react_pages.py
```

Packaging validates current data, provenance hashes, accounting and required
local assets, and supplies the app, route redirects, canonical JSON and retained
PDFs. Pages CI runs source/audit tests and builds committed artifacts; pull
requests validate without publishing. See [analysis/README.md](../README.md)
for source extraction and the full validation commands.

The browser suite checks all routes under a GitHub Pages project prefix at
390px and 1440px, including navigation, expense scopes, native downloads,
source review, sorting and PDF range requests. These are targeted checks;
broader accessibility and performance assessment remain open.

## Remaining work

1. Resolve NEP source flags with recorded evidence and rebuild affected ledgers.
2. Confirm Transparency NEP release/document coverage.
3. Review candidate project identities and the unmapped NEP bridge PAP before
   certifying cross-stage changes.
4. Record amendment completeness separately from extraction completeness.
5. Add PDF text accessibility, saved review decisions, and broader performance
   and assistive-technology checks.
