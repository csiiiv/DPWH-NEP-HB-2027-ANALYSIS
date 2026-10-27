# Cleaned observations: review vocabulary and next release

**Implemented:** shared `review_catalog_v1` vocabulary, validation helper and
the separate [cleaned release](CLEANED_DATASET.md) with provisional selection
and conservative location questions, displayed in the viewer's **Cleaned data**
tab. **Pending:** review-event storage. Existing master assignments and technical review flags
are preserved in the evidence companion.

The [catalog](../reference/review_catalog.json) stores reusable labels,
descriptions, requested information and trigger guidance. The
[validator](../scripts/review_catalog.py) checks catalog structure, compact
flags and reference integrity. It does not infer questions from technical
flags or decide whether a clarification is sufficient.

## Review-facing questions

| Code | Label | Information requested |
|---|---|---|
| `location_unclear` | Location needs clarification | Intended locality or coordinates |
| `location_alternatives` | Several locations are possible | Intended place, or confirmation of multiple project locations |
| `location_conflict` | Location details disagree | Which conflicting details describe the site |
| `project_coverage_unclear` | Project coverage needs clarification | Endpoints, alignment, covered barangays or site plan |
| `description_unclear` | Project description needs clarification | Intended description or supporting source |
| `record_relationship_unclear` | Record relationship needs clarification | Same project, separate phases or separate works |

Generate a question only when a documented gap matters for the declared task.
The cleaned release declares city/municipality identification as its task;
whole-project geometry is not required. It cannot assume every project needs
a barangay. Missing coordinates, readable-title repairs, unknown office
labels, name matches elsewhere in the country, and technical freshness notes
do not automatically become reviewer questions. A DEO association alone does
not establish a project-site conflict. Several known sites may be legitimate
coverage. House-only/NEP-only membership and `not_compared` are comparison
states, not problems in themselves.

The catalog's `trigger_guidance` sets boundaries for the
[generation policy](../scripts/cleaned_policy.py); it is not executable logic.
The full technical evidence remains available in the companion collection.

## Compact observation fields

The cleaned release keeps one row per existing `record_id`. Its
location decision and clarification workflow are separate:

```json
{
  "record_id": "example:observation_1",
  "location_resolution": {
    "status": "partially_resolved",
    "verification_status": "provisional",
    "claim_scope": "title_locality_claim"
  },
  "review_flags": [
    {
      "code": "location_alternatives",
      "status": "open",
      "evidence_refs": ["candidate:example_code_a", "candidate:example_code_b"]
    }
  ]
}
```

This is an illustrative fragment, not an existing observation or a complete
location-resolution schema. The cleaned release also retains selected
locations, supported hierarchy, decision basis and unresolved scope. See its
[field contract](CLEANED_DATASET.md#observation-fields).

Each flag requires `code`, `status` and a nonempty `evidence_refs` array.
`detail` is optional record-specific text; shared labels, standard explanations
and requested information belong only in the catalog. Store at most one entry
per flag code per observation, combining the relevant evidence references.
An optional `review_event_refs` array links the clarification history.

References must resolve to stable evidence IDs in the same release or a pinned
companion collection. Evidence for relationship questions must identify the
related record IDs and the matching uncertainty. Array positions and browser
display order are unsuitable evidence identifiers. The cleaned builder now
materializes record-local `items` in `evidence.jsonl.gz`, including stable
`candidate:<PSGC code>` references and retained interpretation collections.

An empty `review_flags` array means no clarification questions were generated.
It does not mean verified, accurate or reviewed. Observations without site
location requirements may have location status `not_applicable`; outside
comparison membership alone does not establish that status.

## Three separate decisions

**Location status** describes interpretation for the declared scope:
`resolved`, `partially_resolved`, `ambiguous`, `unresolved`, `not_applicable`.
A selected coordinate locality can be resolved for the observed points while
whole-project extent remains unassessed. An independent city need not have a
province parent; do not invent one or treat its absence as a missing level.
`verification_status` is separate: selecting a candidate does not verify it.

**Review status** belongs to each question:

| Code | Meaning |
|---|---|
| `open` | Question is open; no message is implied to have been sent |
| `response_received` | Response recorded, assessment pending |
| `under_review` | Review in progress, supported by a recorded event |
| `resolved` | Assessment records how the question was addressed |
| `closed_no_change` | Review closed without changing data; uncertainty can remain |

Generated questions start `open`. Every other status requires at least one
review-event reference. A response alone cannot mark a question resolved,
change a location assignment, or establish verification. Closing a question
does not certify the whole observation. If a browser needs a record-level
review summary, derive it from the questions instead of storing another
independently editable status.

**Adoption decision** records why a candidate was selected, retained or left
for review. This is separate from both statuses and from the four candidate
support components. Selecting a candidate adds no score. Existing master
and applied-layer scores retain their original methods.

## Review events and release integrity

Store responses and decisions separately, linked by `record_id` and flag code.
The future event collection should retain an event ID, timestamp, event kind,
respondent's stated role, explanation, proposed correction, supporting
references and any assessment/disposition. A stated role is not verified
identity. Response received, evidence assessed and correction accepted must
remain distinguishable events. A resolved question needs a disposition that
explains closure, including whether a correction was accepted. Reopening a
question must retain the earlier history.

No response collection or submission workflow is implemented by this change.
An eventual event consumer must check that each review event belongs to the same
record and question and supports the recorded status. The helper currently
checks structure and ID membership, not those event semantics.

The cleaned release manifest pins:

- Catalog relative path, `version` and SHA-256, once for the release.
- Cleaned schema, adoption-policy and flag-policy versions.
- Consumed processing/master/interpretation releases and reference hashes.
- Builder/validator hashes, output hashes and coverage/review counts.

Catalog codes are stable readable strings; do not reuse a code with a different
meaning. Revise the catalog version for content changes and reject unknown
versions, codes and statuses. Gzip already compresses repeated codes well.
Standalone exports must include the matching catalog or an expanded readable
view. CSV exports should expand labels for ordinary review.

Validate the installed vocabulary and contract behavior:

```sh
python3 master_list/scripts/review_catalog.py
python3 -m unittest master_list.tests.test_review_catalog -v
```

The validator's reference inventories are optional for isolated structural
checks. A release builder must supply **both** inventories, including empty
ones, to reject dangling evidence and review-event references.

## Next integration

The cleaned builder now joins readable processing observations, master
evidence and candidate interpretations, with stable evidence IDs, provisional
selection and three conservative question rules. It checks coverage, source
amounts and reference integrity. The browser now provides a separate cleaned
tab with catalog wording, filters, full-record downloads and exact question
evidence. Human responses require their own event collection
and validation. Legislative-district derivation remains downstream.

Review questions, record inclusion and office associations do not establish
who proposed, inserted, endorsed or was responsible for an item. Public labels
request clarification of data; they do not allege wrongdoing.
