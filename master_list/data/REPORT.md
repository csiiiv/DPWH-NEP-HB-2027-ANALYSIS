# Master list build report

64,645 source observations across 10 datasets. Records overlap across sources and budget stages; totals must be read within one dataset.

| Dataset | Rows | PHP | Assigned | Review | Score min | Score max | Score mean |
|---|---:|---:|---:|---:|---:|---:|---:|
| dpwh_nep_pdf | 11,420 | 572,924,074,000 | 8,887 | 4,702 | -7 | 15 | 6.90 |
| dpwh_house_second | 18,792 | 639,179,718,000 | 13,504 | 5,877 | -6 | 15 | 6.49 |
| dpwh_house_third | 18,797 | 639,179,718,000 | 13,509 | 5,882 | -6 | 15 | 6.49 |
| dpwh_nep_api | 11,372 | 445,378,063,000 | 8,954 | 4,800 | -7 | 15 | 7.01 |
| fmr_nep | 704 | 16,000,000,000 | 704 | 209 | 1 | 15 | 9.79 |
| fmr_hgab | 964 | 19,628,100,000 | 963 | 305 | -5 | 15 | 9.79 |
| hfep_nep | 464 | 14,472,519,000 | 435 | 384 | -1 | 11 | 3.64 |
| hfep_hgab | 513 | 10,021,659,000 | 492 | 392 | -1 | 11 | 4.17 |
| nia_nep | 791 | 17,598,181,000 | 15 | 780 | -2 | 8 | 0.10 |
| nia_hgab | 828 | 17,999,305,000 | 34 | 802 | -2 | 8 | 0.23 |

Location evidence uses the uncapped additive `location_evidence_v6` rules. Scores are raw evidence totals, not normalized values or probabilities. See the [scoring methodology and roadmap](../docs/LOCATION_CONFIDENCE_AND_ROADMAP.md).

## Raw location-score distribution

| Score | Records |
|---:|---:|
| -7 | 6 |
| -6 | 2 |
| -5 | 1 |
| -4 | 1 |
| -3 | 59 |
| -2 | 38 |
| -1 | 193 |
| 0 | 16,941 |
| 1 | 298 |
| 2 | 229 |
| 3 | 3,162 |
| 4 | 278 |
| 5 | 4,509 |
| 6 | 517 |
| 7 | 5,557 |
| 8 | 3,346 |
| 9 | 4,507 |
| 10 | 135 |
| 11 | 22,389 |
| 12 | 374 |
| 13 | 1,603 |
| 14 | 461 |
| 15 | 39 |

All location inferences remain provisional. Codes use the retained PSGC2LEG catalog, whose foundation is a community mirror pending official PSA replacement. No title inference certifies an actual project site.

All ten ledgers reproduce their retained source controls. The NEP HFEP facility ledger remains PHP 140,000 below its printed grand total, as recorded in the source audit; collation preserves that discrepancy.

See `audit.json` for source hashes, exact examples, coverage, and output checksums. `location_review.csv.gz` contains the review queue.
