# Master list build report

64,645 source observations across 10 datasets. Records overlap across sources and budget stages; totals must be read within one dataset.

| Dataset | Rows | PHP | Assigned | Review | Score min | Score max | Score mean |
|---|---:|---:|---:|---:|---:|---:|---:|
| dpwh_house_second | 18,792 | 639,179,718,000 | 13,501 | 5,539 | -6 | 16 | 6.65 |
| dpwh_house_third | 18,797 | 639,179,718,000 | 13,506 | 5,539 | -6 | 16 | 6.65 |
| dpwh_nep_api | 11,372 | 445,378,063,000 | 8,937 | 4,566 | -8 | 16 | 7.18 |
| dpwh_nep_pdf | 11,420 | 572,924,074,000 | 8,918 | 4,407 | -8 | 16 | 7.12 |
| fmr_hgab | 964 | 19,628,100,000 | 963 | 295 | -7 | 15 | 9.84 |
| fmr_nep | 704 | 16,000,000,000 | 704 | 202 | 1 | 15 | 9.86 |
| hfep_hgab | 513 | 10,021,659,000 | 492 | 390 | -1 | 11 | 4.20 |
| hfep_nep | 464 | 14,472,519,000 | 435 | 383 | -1 | 11 | 3.65 |
| nia_hgab | 828 | 17,999,305,000 | 33 | 802 | -2 | 8 | 0.23 |
| nia_nep | 791 | 17,598,181,000 | 15 | 780 | -2 | 8 | 0.10 |

Location evidence uses the uncapped additive `location_evidence_v6.5` rules. Scores are raw evidence totals, not normalized values or probabilities. See the [scoring methodology and roadmap](../docs/LOCATION_CONFIDENCE_AND_ROADMAP.md).

## Raw location-score distribution

| Score | Records |
|---:|---:|
| -8 | 4 |
| -7 | 3 |
| -6 | 2 |
| -5 | 2 |
| -4 | 3 |
| -3 | 16 |
| -2 | 8 |
| -1 | 139 |
| 0 | 16,994 |
| 1 | 214 |
| 2 | 231 |
| 3 | 2,465 |
| 4 | 204 |
| 5 | 3,962 |
| 6 | 345 |
| 7 | 5,651 |
| 8 | 3,534 |
| 9 | 4,900 |
| 10 | 170 |
| 11 | 23,138 |
| 12 | 386 |
| 13 | 1,639 |
| 14 | 506 |
| 15 | 125 |
| 16 | 4 |

All location inferences remain provisional. Codes use the retained PSGC2LEG catalog, whose foundation is a community mirror pending official PSA replacement. No title inference certifies an actual project site.

All ten ledgers reproduce their retained source controls. The NEP HFEP facility ledger remains PHP 140,000 below its printed grand total, as recorded in the source audit; collation preserves that discrepancy.

See `audit.json` for source hashes, exact examples, coverage, and output checksums. `location_review.csv.gz` contains the review queue.
