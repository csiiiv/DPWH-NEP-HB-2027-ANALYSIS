# Cleaned source observations

64,645 observations; `cleaned_observations_v1`.

Every source observation, title, amount and comparison attachment is preserved. Candidate selections are provisional and limited to their declared scope. Existing master and applied ledgers are unchanged. Do not sum across source datasets.

| Location decision | Observations |
|---|---:|
| adopted_candidate | 970 |
| not_applicable | 5,850 |
| retained_master | 46,552 |
| review_required | 11,273 |

| Location status | Observations |
|---|---:|
| ambiguous | 732 |
| not_applicable | 5,850 |
| partially_resolved | 3,200 |
| resolved | 43,606 |
| unresolved | 11,257 |

| Clarification question | Observations |
|---|---:|
| Location needs clarification | 13,226 |
| Several locations are possible | 116 |
| Location details disagree | 616 |
| Project coverage needs clarification | 0 |
| Project description needs clarification | 0 |
| Record relationship needs clarification | 0 |

Questions can overlap. Empty flags mean no question generated, not verified correctness. Coverage, description and relationship questions are reserved until specific evidence and task requirements support them. Responses and human review events have not been imported.

The target is city/municipality identification. Finer barangay evidence is retained without requiring it for every observation. GPS selections describe observed points; full project extent and coordinate-reference freshness remain unassessed. No new legislative districts are derived.

Evidence IDs resolve within the matching record in `evidence.jsonl.gz`. Shared flag labels are in `review_catalog.json`; CSV expands them for review. Full comparison groups and their stage-scoped annotations are retained separately in `comparison_groups.jsonl.gz`. See [release contract](../../docs/CLEANED_DATASET.md).
