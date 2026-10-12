# Published FMR page versus local workbench

Assessed on **12 October 2026 (Asia/Manila)**. This assessment downloaded the
live published HTML and its reading-comparison JSON and inspected the rendered
published and local pages with headless Chrome. Application code and source
ledgers were not changed.

## Finding

The published page uses an incomplete, partly misparsed House candidate ledger.
The local workbench uses complete ruled-cell House and NEP ledgers, checked
against printed regional/program controls and independent agency schedules.
The two pages also show different comparison baselines.

| Measure | Published page | Local workbench |
|---|---:|---:|
| House project/candidate rows | 795 | 964 |
| House project/candidate sum (PHP) | 14,035,375,000 | 19,628,100,000 |
| NEP total (PHP) | 16,000,000,000 | 16,000,000,000 |
| NEP named project ledger | Not used; described as regional envelopes only | 704 projects |
| Main comparison | House 2nd versus 3rd reading | NEP versus supplied House copy |
| Main difference (PHP) | 0 | +3,628,100,000 |

Published sources:
[HTML](https://research.bettergov.ph/static/nep-preview/fmr.html) and
[reading comparison JSON](https://research.bettergov.ph/static/nep-preview/hgab-revision-data.json).
Local page: [Compare Stages](http://localhost:5174/#compare).

## Exact accounting bridge

```text
Published House candidates          14,035,375,000
+ 169 omitted project rows           4,840,725,000
+ 40 understated amount corrections    752,000,000
= Complete House project ledger     19,628,100,000 PHP
```

The total discrepancy is **5,592,725,000 PHP**. Every published candidate was
mapped to one distinct local House row: 690 unique canonical-title matches,
100 unique title-prefix matches (the published titles are truncated), and five
repeated-title rows resolved using amounts and source context. This mapping is
an extraction reconciliation within the supplied House annex, rather than a
certification of project identity across legislative stages. Case, punctuation,
whitespace and `Brgy`/`Barangay` were normalized for title comparison; no fuzzy
matching was used. For the repeated Ogpoy title, the published `22, | 500,000`
context identifies the 22,500,000 PHP row on PDF page 689, rather than the distinct
15,000,000 PHP row on PDF page 688.

[Omitted rows](data/fmr_published_omitted_projects.csv) retain all 169 source IDs,
amounts and PDF/printed page references.
[Amount discrepancies](data/fmr_published_amount_discrepancies.csv) retain all
40 published contexts, source IDs and corrections.

## Amount parsing and missing coverage

All 40 understated amounts are in Central Luzon. Published text visibly splits
the leading millions from the comma-grouped remainder, and the embedded amount
retains only the remainder. Examples checked against the native ruled cells:

| Project | Published PHP | Native amount PHP | House PDF / printed page |
|---|---:|---:|---|
| J Gonzales–Bangan Bubon Chocolate, Amungan, Iba | 500,000 | 22,500,000 | 683 / 667 |
| Maymayan Buri, Inhobol, Masinloc | 500,000 | 32,500,000 | 683 / 667 |
| Parian, Mexico, Pampanga | 50,000 | 10,050,000 | 687 / 671 |
| Ogpoy–Ariada, Alangan, Limay (second printed row) | 500,000 | 22,500,000 | 689 / 673 |

The published page flags precisely 40 allocations below 1 million PHP; all 40
are these amount discrepancies. Its 755 unflagged-candidate count therefore
excludes real projects because their extracted amounts are wrong. It should
not be reused as the denominator for a complete-annex amount-pattern analysis.

Missing coverage is concentrated in Central Luzon (122 rows / 2.562 billion PHP)
and CAR (six rows / 1.136 billion PHP). For example, the 500,000,000 PHP
NRJ–Soysoyan–Ballay–Tawangan–Lusod Proper project in Kabayan, Benguet is absent
from the published ledger but present at `ib:p674:r2` (PDF 674 / printed 658).
160 of the 169 omitted titles contain `FMR`, so omission cannot be explained
solely by restricting titles to that keyword. Exact omissions and the retained
amount errors are established; the unavailable production extractor was not
inspected to establish every code path that caused an omission.

| Region | Omitted rows | Omitted PHP | Understated rows | Correction PHP |
| I | 4 | 375,000,000 | 0 | 0 |
| CAR | 6 | 1,136,000,000 | 0 | 0 |
| II | 11 | 281,700,000 | 0 | 0 |
| III | 122 | 2,562,000,000 | 40 | 752,000,000 |
| IVA | 10 | 232,625,000 | 0 | 0 |
| IVB | 0 | 0 | 0 | 0 |
| V | 3 | 60,000,000 | 0 | 0 |
| VI | 1 | 10,000,000 | 0 | 0 |
| NIR | 1 | 15,000,000 | 0 | 0 |
| VII | 0 | 0 | 0 | 0 |
| VIII | 1 | 10,000,000 | 0 | 0 |
| IX | 1 | 30,000,000 | 0 | 0 |
| X | 2 | 38,400,000 | 0 | 0 |
| XI | 2 | 20,000,000 | 0 | 0 |
| XII | 1 | 15,000,000 | 0 | 0 |
| XIII | 4 | 55,000,000 | 0 | 0 |
| **Total** | **169** | **4,840,725,000** | **40** | **752,000,000** |

## Different comparisons and NEP scope

The published top panel compares its extracted House 2nd- and 3rd-reading
candidates. Its JSON reports 795 rows and 14,035,375,000 PHP in each reading,
with all 795 marked `Same allocation`. Its zero delta is a House-to-House delta.

The local comparison subtracts the NEP control (16,000,000,000 PHP) from the
House control (19,628,100,000 PHP), giving **+3,628,100,000 PHP (+22.675625%)**.
These deltas answer different questions even after fixing the extraction.

The published statement that the NEP has no separately named FMR projects is
incomplete in light of the retained standalone `dbm-other-nep-line-data/FMR.pdf`:
its 47 detail pages (printed 1511–1557) contain 704 project rows totaling
16,000,000,000 PHP. Those rows reconcile to all 16 regional controls and the
independent NEP Volume I agency schedule. The agency's envelope table alone is
not the complete NEP project evidence.

The local model yields 609 candidate pairs, 355 House-only and 95 NEP-only rows.
They reconcile as -45,000,000 paired differences + 5,969,005,000 House-only
funding - 2,295,905,000 NEP-only funding = +3,628,100,000 PHP. These source-only
rows remain unmatched observations, rather than certified additions/deletions.

## Reading check and validation

The supplied files are:

- `HB_BUDGET/2 - HB 10858 VOL IB.pdf`
- `HB_BUDGET_3rd_reading/2- HB 10858 FOR 3RD READING VOL I-B.pdf`

Re-extracting PDF pages 667–726 of the 3rd-reading-named file with the native
House row extractor recovered **964 projects / 19,628,100,000 PHP**. All **1,057
ruled rows**, including project/control/header/spacer rows, have identical source
IDs, labels and amounts to the retained House source rows. This establishes
agreement of these supplied FMR annexes; it does not independently authenticate
the legislative status of either entire volume.

The browser-rendered local default `#compare` shows +3,628,100,000 PHP, 609 pairs,
355 House-only and 95 NEP-only rows. The rendered published reading metrics
show 795 lines and 14,035,375,000 PHP in each reading. The served local JSON and
retained build pass `python other-analysis/build_fmr_workbench.py --check`.
The House audit reports 17 balanced internal controls and 33 passing independent
program/region/office observations; the NEP audit reports the same check counts.
The difference is already present in the served datasets, rather than being
introduced by currency formatting or a filter on the default comparison route.

## Recommended correction

Rebuild the published House report from the complete ruled-cell ledger and
require project sums to balance every regional control before publishing.
Recompute amount-pattern statistics from corrected amounts. Add the NEP detail
annex to the published comparison and retain two explicit comparisons:
NEP → supplied House, and supplied House → 3rd-reading-named copy. Preserve the
source-status qualifications and provisional project-matching labels.

## Download fingerprints

- Published HTML SHA-256: `75ff4f9a1d5152824757458adf41afcd9834fa3a31d8cda3ef745205ee00011b`
- Published reading JSON SHA-256: `bfea0955da461b2f86bd00d0c94dceac5fd2466235fb87a471a4f58af670e34c`
- Served local workbench JSON SHA-256: `7d72978a4dc0a27bb25f49ff2118e3a43027040319f93fffa45762020e7bce2d`
