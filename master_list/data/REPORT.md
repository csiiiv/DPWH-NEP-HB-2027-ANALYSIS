# Master list build report

64,645 source observations across 10 datasets. Records overlap across sources and budget stages; totals must be read within one dataset.

| Dataset | Rows | PHP | Assigned | Review | Score min | Score max | Score mean |
|---|---:|---:|---:|---:|---:|---:|---:|
| dpwh_nep_pdf | 11,420 | 572,924,074,000 | 8,851 | 4,647 | -8 | 15 | 6.94 |
| dpwh_house_second | 18,792 | 639,179,718,000 | 13,469 | 5,771 | -6 | 15 | 6.53 |
| dpwh_house_third | 18,797 | 639,179,718,000 | 13,474 | 5,776 | -6 | 15 | 6.53 |
| dpwh_nep_api | 11,372 | 445,378,063,000 | 8,918 | 4,747 | -8 | 15 | 7.05 |
| fmr_nep | 704 | 16,000,000,000 | 704 | 202 | 1 | 15 | 9.86 |
| fmr_hgab | 964 | 19,628,100,000 | 963 | 295 | -7 | 15 | 9.83 |
| hfep_nep | 464 | 14,472,519,000 | 435 | 384 | -1 | 11 | 3.64 |
| hfep_hgab | 513 | 10,021,659,000 | 492 | 391 | -1 | 11 | 4.19 |
| nia_nep | 791 | 17,598,181,000 | 15 | 780 | -2 | 8 | 0.10 |
| nia_hgab | 828 | 17,999,305,000 | 33 | 802 | -2 | 8 | 0.22 |

Location evidence uses the uncapped additive `location_evidence_v6.2` rules. Scores are raw evidence totals, not normalized values or probabilities. See the [scoring methodology and roadmap](../docs/LOCATION_CONFIDENCE_AND_ROADMAP.md).

## Raw location-score distribution

| Score | Records |
|---:|---:|
| -8 | 4 |
| -7 | 3 |
| -6 | 2 |
| -4 | 1 |
| -3 | 21 |
| -2 | 38 |
| -1 | 191 |
| 0 | 17,087 |
| 1 | 256 |
| 2 | 234 |
| 3 | 3,112 |
| 4 | 214 |
| 5 | 4,273 |
| 6 | 398 |
| 7 | 5,324 |
| 8 | 3,454 |
| 9 | 4,560 |
| 10 | 170 |
| 11 | 22,819 |
| 12 | 378 |
| 13 | 1,601 |
| 14 | 466 |
| 15 | 39 |

All location inferences remain provisional. Codes use the retained PSGC2LEG catalog, whose foundation is a community mirror pending official PSA replacement. No title inference certifies an actual project site.

All ten ledgers reproduce their retained source controls. The NEP HFEP facility ledger remains PHP 140,000 below its printed grand total, as recorded in the source audit; collation preserves that discrepancy.

See `audit.json` for source hashes, exact examples, coverage, and output checksums. `location_review.csv.gz` contains the review queue.
