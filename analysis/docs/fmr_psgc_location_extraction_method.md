# FMR PSGC location extraction — contract and implementation

**Status:** initial implementation built and audited on 29 October 2026. This
artifact resolves PSGC evidence only; legislative assignment remains a
separate downstream operation.

**Producer:** `other-analysis/build_fmr_psgc_locations.py`

**Output:** `other-analysis/data/fmr_psgc_locations_2027.json`

This is the FMR adapter for the shared
[`title-to-PSGC location extraction method`](title_psgc_location_extraction_method.md).
It applies the common title rules to each FMR stage, then compares that title
reading with the already-reviewed FMR coordinate evidence.
Legislative-district assignment is a separate downstream operation.
The comparison follows the shared
[`PSGC location evidence resolution method`](psgc_location_evidence_resolution_method.md)
with the FMR-specific restrictions below.

The separation matters:

```text
source title
  -> retained text claims and exact PSGC candidates
  -> selected title PSGC location(s), ambiguity, or no result
  -> comparison with reviewed coordinate PSGCs
  -> PSGC-to-LEG lookup in the FMR legislative builder
```

Coordinates may corroborate or contradict a title reading. They do not create
a title claim, silently correct printed text, or turn a point into the extent
of an entire road.

## Shared extractor and FMR adapter

Title parsing, aliases, locality syntax, hierarchy validation, homonym control,
selection statuses, and shared flags follow
[`title_psgc_location_extraction_method.md`](title_psgc_location_extraction_method.md).
The implementation should reuse
[`master_list/scripts/locations.py`](../../master_list/scripts/locations.py),
preferably through a shared module. The initial refactor must preserve current
master-list output; the FMR artifact must then use a version that passes the
general method's documented conformance cases.

The FMR extraction artifact is a sector-specific projection of that shared
contract. It adds FMR project IDs, stages, coordinate-point evidence, and FMR
regression checks. It must not maintain a second, weaker implementation of
PSGC name matching.

The current `parse_title_locality()` function in
[`other-analysis/build_fmr_final_dataset.py`](../../other-analysis/build_fmr_final_dataset.py)
is retained only as legacy descriptive evidence during migration. Its
comma-position fields are not assignment authority. For example, a title can
contain an FMR phase component, omit a final province, or name an independent
city followed by a province-style context; those shapes cannot be interpreted
reliably by assigning fixed meanings to the final three comma components.

## Authoritative inputs

| Input | Role |
|---|---|
| `other-analysis/data/hgab_fmr_tree.json` | House project titles, source hierarchy, IDs, pages, and region headings |
| `other-analysis/data/nep_fmr_tree.json` | NEP project titles, source hierarchy, IDs, pages, and region headings |
| `other-analysis/data/hgab_fmr_coordinates_normalized.json` | Reviewed House coordinate strings and normalized points |
| `other-analysis/data/nep_fmr_coordinates_normalized.json` | Reviewed NEP coordinate strings and normalized points |
| `other-analysis/data/hgab_fmr_final_dataset.json` | Existing House point-to-PSGC evidence and whole-file controls |
| `other-analysis/data/nep_fmr_final_dataset.json` | Existing NEP point-to-PSGC evidence and whole-file controls |
| `PSGC2LEG/data/psgc_locations.jsonl` | Canonical 10-digit PSGC units and `parent_code` hierarchy |
| `master_list/scripts/locations.py` or its shared successor | Implementation of the shared [`title-to-PSGC method`](title_psgc_location_extraction_method.md) |

The producer records the path and SHA-256 of every input. It must reject a
coordinate or final-dataset artifact whose recorded source hash no longer
matches the corresponding FMR tree.

`PSGC2LEG/data/psgc_leg_assignments.jsonl` is deliberately absent from this
stage. It is used after extraction to translate a selected PSGC location into
a legislative district. A district result must never influence which PSGC
candidate wins.

## Unit of extraction

One extraction record represents one printed project observation at one
legislative stage:

- 964 House working-copy projects; and
- 704 NEP projects.

Candidate-pair rows in `fmr_workbench.json` are not the extraction grain.
House and NEP titles are interpreted independently before their comparison
row is assigned. This prevents a clean title in one stage from rewriting a
different title in the other stage. Differences such as `Phase II` versus
`Phase 11`, or `Bongabon` versus `Bongabong`, remain stage-specific source
evidence. Candidate pairing must not normalize one stage's printed locality
into the other stage's result.

## Apply the shared title extraction independently

Run the shared extractor once per House or NEP source observation. The FMR
adapter additionally requires:

1. raw FMR project and stage IDs;
2. source page and region-control provenance;
3. all printed barangays and route endpoints retained in source order;
4. no borrowing of a corrected spelling or hierarchy from the candidate-paired
   project at the other stage; and
5. no use of FMR coordinates during title candidate selection.

Several selected locations remain several PSGC locations. This artifact does
not decide whether they form a continuous route or legislative range.

## Attach FMR coordinate evidence without rewriting the title

After title resolution, join each reviewed coordinate point by source project
ID and point ID. The joined point retains:

- raw and normalized coordinates;
- coordinate normalization rules and review flags;
- point role or segment label;
- reverse-geocoded PSGC code and full hierarchy;
- the existing title-agreement verdict; and
- whether the point supports, partially overlaps, conflicts with, or cannot be
  compared with the selected title PSGC location.

The coordinate relationship is one of:

| Relationship | Meaning |
|---|---|
| `corroborates` | Every usable point falls within a selected title hierarchy |
| `municipality_only` | Municipality/city agrees but barangay differs or is unavailable |
| `mixed` | Usable points both support and conflict with the title, or disagree with one another |
| `conflicts` | Usable points identify a disjoint hierarchy |
| `no_usable_points` | No accepted point has a PSGC result |
| `not_comparable` | Title extraction has no selected PSGC location |

These labels summarize evidence; they do not alter `selected_locations`.
Coordinate-only district placement, if permitted, is decided later by the FMR
legislative policy and must remain labelled `coordinate`.

## FMR outcome additions

The title status and shared parser flags use the vocabulary in the general
method. The FMR adapter adds `empty_or_incomplete_suffix`,
`destination_not_site`, and `title_coordinate_conflict` when those conditions
are not already represented by shared evidence.

The artifact stores the shared status directly, including `name_matched`,
`multiple_locations`, `province_only`, `ambiguous`, and `unresolved`. A
selected municipality can still require barangay evidence in a split
legislative city. The later PSGC-to-LEG step may add
`split_city_barangay_required`; that is a district-assignment finding.

## Record schema

```json
{
  "record_id": "fmr_hgab:ib:p667:r10",
  "source_project_id": "ib:p667:r10",
  "stage": "house_working_copy",
  "raw_title": "...",
  "source_region": "REGION I - ILOCOS",
  "claims": [
    {
      "raw": "Brgy. Tio-angan",
      "normalized": "tio angan",
      "span": [55, 72],
      "level_hint": "barangay",
      "marker": "Brgy.",
      "role": "bounded_administrative_suffix",
      "resolution_rule": "explicit_barangay_marker"
    }
  ],
  "candidates": [
    {
      "psgc_code": "0103304009",
      "name": "Tio-angan",
      "level": "barangay",
      "ancestry": {},
      "claim_refs": [0],
      "resolution_rules": [],
      "review_flags": []
    }
  ],
  "selected_locations": [
    {
      "psgc_code": "0103304009",
      "name": "Tio-angan",
      "level": "barangay",
      "ancestry": {
        "municipality": {
          "code": "0103304000",
          "name": "Bagulin"
        },
        "province": {
          "code": "0103300000",
          "name": "La Union"
        },
        "region": {
          "code": "0100000000",
          "name": "Region I (Ilocos Region)"
        }
      },
      "selection_rule": "explicit_barangay_with_parent_chain"
    }
  ],
  "suggestions": [],
  "status": "name_matched",
  "coordinate_assessment": {
    "relationship": "corroborates",
    "points": []
  },
  "review_flags": [],
  "method_version": "fmr_psgc_location_v1",
  "input_refs": []
}
```

The exact schema can add fields, but it must preserve the raw title, claim
spans, every candidate considered, the reason for selection or rejection,
coordinate-point provenance, full ancestry, method version, and input hashes.

## Required regression cases

| Printed example | Required interpretation |
|---|---|
| `Construction of Sitio Rango, Brgy. Tubburan FMR, Brgy. Tubburan, Bacarra, Ilocos Norte` | Select Tubburan under Bacarra. `Construction of Sitio Rango` is project description, not a barangay candidate. |
| `Construction of Brgy. Escoda - Brgy. Elizabeth FMR, Brgy. Escoda and Brgy. Elizabeth, Marcos, Ilocos Norte` | Preserve Escoda and Elizabeth as two barangay claims under Marcos. Do not reduce them to the last barangay. |
| `Construction of FMR Leading to Ilocos Sur Provincial Trading Center, Brgy. Danuman West,` | Retain the Danuman West claim and the incomplete suffix flag. Do not infer its parent from coordinates or an adjacent row. |
| `Construction of Baguio Animal Breeding Research Center (BABRC), Brgy. Dontogan FMR Phase II, Brgy. Dontogan, Baguio City` and the stage variant with `Phase 11` | Select Dontogan under Baguio City independently at each stage. The facility name and FMR phase are not municipality components, and the numeral difference remains source evidence. |
| `Construction of Brgy. Cawayan FMR, Brgy. Cawayan, Bongabong, Oriental Mindoro` | Resolve only the exact Cawayan-Bongabong-Oriental Mindoro hierarchy. |
| The stage variant `Construction of Brgy. Cawayan FMR, Brgy. Cawayan, Bongabon, Oriental Mindoro` | Retain the municipality-province conflict: Bongabon is not Bongabong and does not form the printed Oriental Mindoro hierarchy. Coordinates or the other stage may suggest a correction for review but cannot silently substitute it. |
| `Construction of Brgy. Granada FMR, Brgy. Granada, Bacolod City, Negros Occidental` | Select Granada under Bacolod City when unique; retain Negros Occidental as separate province context and flag the HUC relationship. |

These cases test parsing and hierarchy behavior only. Their eventual
legislative district is asserted by the downstream PSGC-to-LEG crosswalk.

## Build invariants

The producer and tests must prove:

1. Exactly 1,668 records are emitted: 964 House and 704 NEP.
2. Every source project ID appears once at its own stage, and every extraction
   record maps back to one source row and page.
3. Every selected or candidate PSGC code exists in the canonical catalog and
   every ancestry chain follows `parent_code` without cycles.
4. The raw title equals the source title; normalization is stored separately.
5. Suggestions and coordinate PSGCs never appear as title-selected locations
   without qualifying title evidence.
6. Multiple printed locations remain distinct and do not duplicate or divide
   project amounts.
7. Independent-city context is flagged rather than coerced into a false PSGC
   parent relationship.
8. The required regression cases produce their specified statuses, claims,
   and flags.
9. Rebuilding from unchanged inputs is deterministic, and `--check` detects
   artifact drift.
10. Refactoring the shared matcher leaves the existing master-list output
    unchanged, apart from an explicitly versioned migration reviewed on its
    own merits.
11. House and NEP extraction records retain their own printed wording and do
    not borrow a corrected name, hierarchy, or claim from a candidate-paired
    project at the other stage.

## Initial implementation audit

The producer runs the shared `location_evidence_v6.5` matcher independently
for all 1,668 source observations, then attaches the retained point evidence.
The initial title outcomes are 1,349 `name_matched`, 298
`multiple_locations`, 15 `province_only`, 5 `ambiguous`, and 1 `unresolved`.
It selected at least one PSGC location for 1,607 observations.

Coordinate comparison produced 993 `corroborates`, 365
`municipality_only`, 137 `conflicts`, 108 `mixed`, 4 `no_usable_points`, and 61
`not_comparable` outcomes. These populations remain reviewable in the output;
the extractor does not rewrite the selected title PSGC from coordinates.

When an explicit barangay spelling is unmatched but the title contains one
exact municipality/city, the extractor now retains that parent as
municipality-level evidence and keeps `barangay_mentioned_but_unmatched` for
review. A child match outside the one printed parent is discarded unless its
own parent was also printed unambiguously. Legislative resolution later
rejects parent-only evidence for split cities.

The required regression cases are exercised in the FMR index tests. The
shared matcher suite also covers the hierarchy correction that prevents a
municipality typo such as `Bongabon, Oriental Mindoro` from being accepted as
city-district context. `python other-analysis/build_fmr_psgc_locations.py
--check` verifies deterministic output, source coverage, and artifact drift.

The shared extraction contract may later serve other sectors. The FMR output
remains separate because its source IDs, coordinate evidence, stage pairing,
and audit controls are FMR-specific.
