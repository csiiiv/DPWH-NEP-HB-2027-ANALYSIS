# Readable processing dataset

20,320 comparison groups cover 59,601 source observations. Another 5,044 House GAS/S2O observations are explicitly not compared. All 64,645 source observations are retained.

| Domain | Matched | House only | NEP only | API only |
|---|---:|---:|---:|---:|
| dpwh | 10,080 | 6,192 | 1,340 | 0 |
| fmr | 609 | 355 | 95 | 0 |
| hfep | 341 | 172 | 123 | 0 |
| nia | 606 | 222 | 185 | 0 |

Matched means an upstream comparison attachment, not certified project identity. Scope-review pairs, repeated-key groups, fuzzy suggestions, strict/corrected statuses and stage-specific data remain available. No rematching is performed.

Readable titles preserve the original title and record conservative whitespace, Unicode, entity and split-ñ repairs. Matching abbreviations, numbers and geographic guesses are not rewritten.

See [the processing schema](../../docs/PROCESSING_DATASET.md) and audit.json for coverage, stage amounts, input hashes, source discrepancies and title examples.
