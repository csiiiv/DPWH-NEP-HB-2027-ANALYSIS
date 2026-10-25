# Master list build report

64,645 source observations across 10 datasets. Records overlap across sources and budget stages; totals must be read within one dataset.

| Dataset | Rows | PHP | Assigned | Review | Score min | Score max | Score mean |
|---|---:|---:|---:|---:|---:|---:|---:|
| dpwh_nep_pdf | 11,420 | 572,924,074,000 | 8,478 | 5,185 | -8 | 15 | 6.36 |
| dpwh_house_second | 18,792 | 639,179,718,000 | 13,106 | 6,477 | -6 | 15 | 6.09 |
| dpwh_house_third | 18,797 | 639,179,718,000 | 13,111 | 6,482 | -6 | 15 | 6.09 |
| dpwh_nep_api | 11,372 | 445,378,063,000 | 8,540 | 5,288 | -8 | 15 | 6.46 |
| fmr_nep | 704 | 16,000,000,000 | 704 | 229 | -3 | 15 | 9.44 |
| fmr_hgab | 964 | 19,628,100,000 | 963 | 332 | -5 | 15 | 9.41 |
| hfep_nep | 464 | 14,472,519,000 | 435 | 384 | -1 | 11 | 3.64 |
| hfep_hgab | 513 | 10,021,659,000 | 492 | 392 | -1 | 11 | 4.17 |
| nia_nep | 791 | 17,598,181,000 | 15 | 780 | -2 | 8 | 0.10 |
| nia_hgab | 828 | 17,999,305,000 | 34 | 802 | -2 | 8 | 0.23 |

Location evidence uses the uncapped additive `location_evidence_v3` rules. Scores are raw evidence totals, not normalized values or probabilities. See the [scoring methodology and roadmap](../docs/LOCATION_CONFIDENCE_AND_ROADMAP.md).

## Raw location-score distribution

| Score | Records |
|---:|---:|
| -8 | 2 |
| -6 | 5 |
| -5 | 31 |
| -4 | 33 |
| -3 | 56 |
| -2 | 842 |
| -1 | 264 |
| 0 | 18,649 |
| 1 | 409 |
| 2 | 143 |
| 3 | 3,170 |
| 4 | 322 |
| 5 | 4,029 |
| 6 | 919 |
| 7 | 5,466 |
| 8 | 1,752 |
| 9 | 4,874 |
| 10 | 104 |
| 11 | 21,666 |
| 12 | 296 |
| 13 | 1,593 |
| 15 | 20 |

All location inferences remain provisional. Codes use the retained PSGC2LEG catalog, whose foundation is a community mirror pending official PSA replacement. No title inference certifies an actual project site.

All ten ledgers reproduce their retained source controls. The NEP HFEP facility ledger remains PHP 140,000 below its printed grand total, as recorded in the source audit; collation preserves that discrepancy.

See `audit.json` for source hashes, exact examples, coverage, and output checksums. `location_review.csv.gz` contains the review queue.
