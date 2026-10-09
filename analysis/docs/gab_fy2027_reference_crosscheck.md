# Cross-check: kimileeee/gab-fy2027-dataset against native House readings

Date: **9 October 2026**. External snapshot:
[`1de94242a1342c7174a9efdce71301538dcf43e0`](https://github.com/kimileeee/gab-fy2027-dataset/tree/1de94242a1342c7174a9efdce71301538dcf43e0).
This is reference evidence. The comparison webpages continue to use the native
I-B controls and native I-C project data.

## Result

The external appropriation fact table corroborates both House readings:
**22 controls agree exactly**, including agency totals, expense classes,
GAS, S2O, regular operations, locally funded projects, FAP, operations including
local/FAP, and Payments of Right-of-Way. Its six DPWH drill-down parent totals
also agree in each reading (**12 additional checks**).

| Control | 2nd reading, both datasets | 3rd reading, both datasets | 3rd − 2nd |
|---|---:|---:|---:|
| Agency total | ₱654,102,015,000 | ₱654,102,015,000 | ₱0 |
| Operations including local/FAP | ₱586,941,661,000 | ₱587,075,661,000 | +₱134,000,000 |
| Support to Operations | ₱49,082,061,000 | ₱48,948,061,000 | −₱134,000,000 |
| Payments of Right-of-Way (ROW) | ₱13,241,523,000 | ₱13,107,523,000 | −₱134,000,000 |
| FAP | ₱44,749,011,000 | ₱44,749,011,000 | ₱0 |

The three nonzero appropriation changes in the external comparison agree with
our native controls: Flood Management maintenance +₱68M, BIP Access Roads
+₱66M, and ROW −₱134M. ROW is independently present in both native I-B trees
on page 25; the attribution is not inferred solely from the S2O change.
The existing printed-label alias maps “Basic Infrastructure Program (BIP) -”
to “BIP -” when checking the access-roads control; amounts do not select it.

## Source and stage alignment

The external stages are `GAB_FILED`, `GAB_2R`, and `GAB_3R`. Compare `GAB_2R`
with our retained HB_BUDGET baseline and `GAB_3R` with HB_BUDGET_3rd_reading.
`GAB_FILED` is not a substitute for the second-reading House baseline.

The external second reading was extracted from the combined CR 638 PDF;
our second reading uses separately retained volumes. The third-reading
I-B/I-C PDFs are byte-identical to the external repository's published source
hashes, despite different local filenames:

| Volume | SHA-256 |
|---|---|
| I-B | `4cc0f17e472d1af380ea6d3972561f6bb241137826fd85ed7e7e70bcd92986b9` |
| I-C | `48cb7a11e391bd4da89d4f47cf39a2eba8fe9bfe636dba101c8284b224ac1b1b` |

See the external [source manifest](https://github.com/kimileeee/gab-fy2027-dataset/blob/1de94242a1342c7174a9efdce71301538dcf43e0/inputs/SOURCES.md).
This corroborates extraction from common documents; it is not a second
legislative source.

## Project coverage and matching

Project checks use only external `dpwh_vol_ic` and `dpwh_tail` rows and native
non-FAP operations allocations. The external tail maps to our **Local Program**
for this comparison; its list includes the ₱1B PPP allocation as well as building
projects. No project rows are added to appropriation rows.

| Scope | Native 2nd | External 2nd | Native 3rd | External 3rd |
|---|---:|---:|---:|---:|
| Non-FAP allocations | 16,241 | 15,964 | 16,246 | 15,969 |
| Allocation sum (PHP) | 542,192,650,000 | 540,312,950,000 | 542,326,650,000 | 540,446,950,000 |
| Native minus external (PHP) | — | 1,879,700,000 | — | 1,879,700,000 |

Matching uses a **unique normalized program + canonical region + normalized
title**, then checks amounts and offices. Amount is not an identity key.
Duplicate keys remain unmatched, and every source row is accounted for once.
The six parent controls agree, but the external Convergence detail is
**₱1,879,700,000 short in each reading**; the other five detail groups agree.
Our native Convergence allocations reproduce the printed control exactly.

There are **15,230 unique pairs per reading, with zero amount disagreements**.
Unmatched records include title/region differences, ambiguous repeated keys
and different treatment of office/region allocations. They do not establish
missing or invented projects:

| Reading | Native unmatched | Native unmatched PHP | External unmatched | External unmatched PHP |
|---|---:|---:|---:|---:|
| 2nd | 1,011 | 27,497,837,000 | 734 | 25,618,137,000 |
| 3rd | 1,016 | 27,631,837,000 | 739 | 25,752,137,000 |

The unmatched amount differences reconcile to ₱1,879,700,000 in each reading.
There are two shared ambiguous keys per reading. No fuzzy pairing was used.

## Office and region differences

For the 15,230 unique pairs in each reading:

- 11,598 have matching recorded offices.
- 3,333 have no recorded office in the external row.
- 285 have no recorded office in our native allocation.
- 14 have conflicting recorded offices; both observations are retained in
  the machine audit for review.

For example, the native terminal allocation **Regional Office I** records
Regional Office I, while the external row associates it with Pangasinan 4th DEO.
Matching title and amount does not resolve this metadata disagreement.

All **five third-reading-only records** from our reading comparison also occur
uniquely in the external third-reading detail and have no title/program
counterpart in its second reading. Their **titles, amounts, offices and I-C
pages** agree, totaling **₱134M**. The external rows use **Nationwide**, while
our native hierarchy records **NCR**. These five are therefore retained as
separate corroborations with the region discrepancy flagged; they are not
silently included in the strict title/region pairs.

## How to use this reference

Use it to corroborate appropriation totals, reading changes and matched
project observations. Retain our native project layer for webpage amounts,
office/region assignments and coverage: it closes the external Convergence
gap and retains **29 FAP project totals**, which are outside the external DPWH
drill-down scope. External FAP appropriation controls agree, but that does not
cross-check FAP project titles or funding partitions.

The external [validation document](https://github.com/kimileeee/gab-fy2027-dataset/blob/1de94242a1342c7174a9efdce71301538dcf43e0/docs/EXTERNAL_VALIDATION.md)
compares this repository's retired **v5 OCR** artifact. Its assessment of our
Convergence coverage does not describe the current native I-C extraction.
These results replace that historical comparison for this pinned snapshot;
they do not alter the external repository.

## Audit and reproduction

The [machine audit](../data/gab_reference_crosscheck.json) records the pinned
commit, four Parquet hashes, local source hashes, every control/program check,
all unmatched rows, conflicting offices, five project corroborations, and
reading change checks. The [builder](../builders/crosscheck_gab_reference.py)
downloads those immutable inputs into a temporary cache and verifies their
hashes before parsing. It does not execute external repository code.

```sh
python -m pip install duckdb==1.3.2
python analysis/builders/crosscheck_gab_reference.py
python -m unittest analysis.tests.test_gab_reference_crosscheck -v
```

The builder validates the native reading dataset before comparing. Tests cover
amount disagreements, region disagreements, repeated keys, missing/conflicting
offices and rejection of a changed external download. Unmatched project rows
still require source review before assigning a specific parser defect to each.
