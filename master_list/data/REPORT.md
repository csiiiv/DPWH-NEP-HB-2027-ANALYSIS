# Master list build report

64,645 source observations across 10 datasets. Records overlap across sources and budget stages; totals must be read within one dataset.

| Dataset | Rows | PHP | Assigned | Review | Score min | Score max | Score mean |
|---|---:|---:|---:|---:|---:|---:|---:|
| dpwh_nep_pdf | 11,420 | 572,924,074,000 | 8,887 | 4,776 | -8 | 15 | 6.78 |
| dpwh_house_second | 18,792 | 639,179,718,000 | 13,504 | 6,079 | -6 | 15 | 6.36 |
| dpwh_house_third | 18,797 | 639,179,718,000 | 13,509 | 6,084 | -6 | 15 | 6.36 |
| dpwh_nep_api | 11,372 | 445,378,063,000 | 8,954 | 4,874 | -8 | 15 | 6.89 |
| fmr_nep | 704 | 16,000,000,000 | 704 | 229 | -3 | 15 | 9.46 |
| fmr_hgab | 964 | 19,628,100,000 | 963 | 332 | -5 | 15 | 9.46 |
| hfep_nep | 464 | 14,472,519,000 | 435 | 384 | -1 | 11 | 3.64 |
| hfep_hgab | 513 | 10,021,659,000 | 492 | 392 | -1 | 11 | 4.17 |
| nia_nep | 791 | 17,598,181,000 | 15 | 780 | -2 | 8 | 0.10 |
| nia_hgab | 828 | 17,999,305,000 | 34 | 802 | -2 | 8 | 0.23 |

Location evidence uses the uncapped additive `location_evidence_v5` rules. Scores are raw evidence totals, not normalized values or probabilities. See the [scoring methodology and roadmap](../docs/LOCATION_CONFIDENCE_AND_ROADMAP.md).

## Raw location-score distribution

| Score | Records |
|---:|---:|
| -8 | 2 |
| -6 | 2 |
| -5 | 31 |
| -4 | 23 |
| -3 | 40 |
| -2 | 50 |
| -1 | 204 |
| 0 | 16,946 |
| 1 | 396 |
| 2 | 243 |
| 3 | 3,178 |
| 4 | 300 |
| 5 | 4,753 |
| 6 | 977 |
| 7 | 5,482 |
| 8 | 3,371 |
| 9 | 4,876 |
| 10 | 142 |
| 11 | 21,714 |
| 12 | 296 |
| 13 | 1,599 |
| 15 | 20 |

All location inferences remain provisional. Codes use the retained PSGC2LEG catalog, whose foundation is a community mirror pending official PSA replacement. No title inference certifies an actual project site.

All ten ledgers reproduce their retained source controls. The NEP HFEP facility ledger remains PHP 140,000 below its printed grand total, as recorded in the source audit; collation preserves that discrepancy.

See `audit.json` for source hashes, exact examples, coverage, and output checksums. `location_review.csv.gz` contains the review queue.
