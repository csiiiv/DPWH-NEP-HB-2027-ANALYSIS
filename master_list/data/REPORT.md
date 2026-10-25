# Master list build report

64,645 source observations across 10 datasets. Records overlap across sources and budget stages; totals must be read within one dataset.

| Dataset | Rows | PHP | Assigned | Review | Score min | Score max | Score mean |
|---|---:|---:|---:|---:|---:|---:|---:|
| dpwh_nep_pdf | 11,420 | 572,924,074,000 | 8,478 | 5,187 | -8 | 15 | 6.35 |
| dpwh_house_second | 18,792 | 639,179,718,000 | 13,106 | 6,478 | -6 | 15 | 6.08 |
| dpwh_house_third | 18,797 | 639,179,718,000 | 13,111 | 6,483 | -6 | 15 | 6.08 |
| dpwh_nep_api | 11,372 | 445,378,063,000 | 8,540 | 5,290 | -8 | 15 | 6.45 |
| fmr_nep | 704 | 16,000,000,000 | 704 | 229 | -3 | 15 | 9.44 |
| fmr_hgab | 964 | 19,628,100,000 | 963 | 332 | -5 | 15 | 9.41 |
| hfep_nep | 464 | 14,472,519,000 | 435 | 384 | -1 | 11 | 3.64 |
| hfep_hgab | 513 | 10,021,659,000 | 490 | 392 | -1 | 11 | 4.16 |
| nia_nep | 791 | 17,598,181,000 | 15 | 780 | -2 | 8 | 0.10 |
| nia_hgab | 828 | 17,999,305,000 | 34 | 802 | -2 | 8 | 0.23 |

Location evidence uses the uncapped additive `location_evidence_v2` rules. Scores are raw evidence totals, not normalized values or probabilities. See the [scoring methodology and roadmap](../docs/LOCATION_CONFIDENCE_AND_ROADMAP.md).

## Raw location-score distribution

| Score | Records |
|---:|---:|
| -8 | 2 |
| -6 | 7 |
| -5 | 31 |
| -4 | 35 |
| -3 | 56 |
| -2 | 842 |
| -1 | 264 |
| 0 | 18,653 |
| 1 | 411 |
| 2 | 143 |
| 3 | 3,178 |
| 4 | 326 |
| 5 | 4,055 |
| 6 | 915 |
| 7 | 5,436 |
| 8 | 1,752 |
| 9 | 4,975 |
| 10 | 104 |
| 11 | 21,551 |
| 12 | 296 |
| 13 | 1,593 |
| 15 | 20 |

All location inferences remain provisional. Codes use the retained PSGC2LEG catalog, whose foundation is a community mirror pending official PSA replacement. No title inference certifies an actual project site.

All ten ledgers reproduce their retained source controls. The NEP HFEP facility ledger remains PHP 140,000 below its printed grand total, as recorded in the source audit; collation preserves that discrepancy.

See `audit.json` for source hashes, exact examples, coverage, and output checksums. `location_review.csv.gz` contains the review queue.
