# PSGC location evidence resolution — shared method

**Status:** shared orchestration contract documented on 28 October 2026. The
underlying evidence layers are implemented, but there is not yet one suite-wide
resolver that conforms to this complete contract. The current cleaned release
implements a narrower city/municipality selection policy under
`candidate_trial_adoption_v1`.

This method begins after title-to-PSGC extraction. It combines a title reading
with the project's **NEP/HGAB source-tree parents**, coordinates, source
headings, administrative office context, registries, and review evidence
without erasing disagreements or overstating project extent.

The shared title parser is specified separately in
[`title_psgc_location_extraction_method.md`](title_psgc_location_extraction_method.md).
That document determines what the title itself claims. This document determines
what the available evidence supports for a declared task and scope.

## Existing implementations and their roles

The repository already implements the main layers, but their documents answer
different questions:

| Document/layer | What it owns | What it does not own |
|---|---|---|
| [Title-to-PSGC method](title_psgc_location_extraction_method.md) | Title mentions, claims, exact candidates, hierarchy filtering, and title-selected locations | Coordinates, office/registry evidence, or final multi-source resolution |
| [Source-hierarchy verification](source_hierarchy_verification.md) | Extracted NEP, HGAB, and API parent trees, source evidence, node paths, and arithmetic checks | Project-site PSGC selection |
| [Location interpretations](../../master_list/docs/LOCATION_INTERPRETATIONS.md) | Candidate inventory and per-context agreement/conflict profiles | A general production winner-selection policy |
| [Candidate support](../../master_list/docs/CONTEXT_SCORING.md) | Separate text, spatial, context, and registry scores plus experimental trial gates | Calibrated probability or unrestricted automatic assignment |
| [Cleaned dataset](../../master_list/docs/CLEANED_DATASET.md) | Implemented provisional city/municipality selection and clarification questions | Whole-project extent, legislative assignment, or all possible evidence routes |
| [Multidimensional assessment](../../master_list/docs/MULTIDIMENSIONAL_SCORING.md) | Broad evidence inventory and assessment design | One normative location-resolution algorithm |
| [Flags reference](../../master_list/docs/FLAGS_REFERENCE.md) | Current statuses, flags, blockers, and layer vocabularies | Cross-layer precedence and final scope decisions |

This document supplies the missing cross-layer contract. The detailed scoring,
flag, and artifact schemas remain in their existing documents.

## Two different hierarchies

This method uses two hierarchies that must never be conflated:

| Hierarchy | Example | Role |
|---|---|---|
| **Source-document hierarchy** | HGAB/NEP program → PAP/funded section → region parent → DEO/office parent → project | Grounding context inherited from the project's actual source branch |
| **Canonical PSGC hierarchy** | Region → province → municipality/city → barangay | Geographic ancestry of a candidate location |

The source hierarchy answers **where the budget source placed the row and
under which administrative parents**. The PSGC hierarchy answers **which
canonical geographic units contain a candidate**. Agreement between them is
meaningful grounding. It is not two independent geographic observations when
the source fields are all projections of the same parent branch.

Every source observation should retain its own source hierarchy. A linked NEP,
House, API, or later-reading record must not overwrite another observation's
parents.

## Resolution is task- and scope-specific

A location can be resolved for one question and unresolved for another. Every
decision must declare both:

1. **Target level:** region, province, municipality/city, barangay, or
   legislative district after a separate crosswalk.
2. **Claim scope:** what portion of the project the evidence describes.

Supported scopes include:

| Scope | Meaning |
|---|---|
| `title_locality_claim` | The place or places asserted by the printed title |
| `observed_coordinate_points` | Only the retained mapped points |
| `route_endpoints` | Printed or mapped endpoints, without claiming the intervening alignment |
| `registry_asset_location` | The location of an exactly linked external asset |
| `source_hierarchy_context` | Region, DEO/office, funded section, and other parents inherited from the NEP/HGAB/API source branch |
| `administrative_context` | A separately printed or resolved administrative association outside the source parent chain |
| `whole_project_extent` | The complete project site or alignment; requires evidence that actually covers it |

A mapped coordinate can resolve `observed_coordinate_points` while
`whole_project_extent` remains `not_assessed`. A city-level title can resolve a
municipality target while remaining insufficient for a split-city legislative
district.

## Core principles

1. **Preserve evidence by layer.** Title, source-tree parent, point, heading,
   office, registry, comparison, and review evidence remain separately
   identifiable.
2. **Keep both hierarchies explicit.** PSGC ancestry describes a candidate.
   NEP/HGAB source parents ground the source row. Their agreement is assessed;
   neither is silently substituted for the other.
3. **Use gates, not a total-score winner.** Numeric scores may order review.
   Eligibility, conflicts, scope, and ambiguity decide selection.
4. **Do not transfer evidence between observations.** Linked House/NEP/API/PDF
   records are comparison candidates, not a shared evidence pool unless a
   sector policy explicitly permits a labelled linked-stage route.
5. **Do not convert administration into site geography.** A DEO or regional
   office may provide context or a fallback card; it cannot create a project
   site.
6. **Do not convert points into an alignment.** Coordinate points support their
   mapped locations and declared roles only.
7. **Retain disagreement.** Conflicting credible evidence produces a conflict
   or ambiguity result rather than silent precedence.
8. **Keep money undivided.** Geographic interpretation does not duplicate or
   apportion project amounts.

## Evidence layers

### 1. NEP/HGAB/API source-hierarchy parents

For each observation, reconstruct and retain the complete enclosing branch
from the canonical source artifact. For DPWH, the useful path commonly
contains:

```text
source / expense class / section / program / PAP or funded section
  / region parent / office or DEO parent / project
```

The exact order varies by source. The Transparency API hierarchy is
`pap1 → pap2 → pap3 → region → office → project code`; its group totals are
derived from listing fields rather than printed budget controls. HGAB and NEP
PDF hierarchies come from their retained extracted trees and source evidence.

Each retained parent node should carry:

- source dataset and legislative stage;
- stable node ID and parent ID when the source artifact provides them;
- node kind;
- raw printed/extracted label;
- canonical normalized label, when applicable;
- source page or API field reference;
- evidence status;
- whether it is `printed`, `tree_inherited`, `normalized`, `derived_group`, or
  `inferred_from_nearest_ancestor`; and
- the source artifact and hash from which the path was traversed.

Flattened fields such as `program`, `subprogram`/`pap`, `source_region`, and
`implementing_office` are projections of this path. They must retain a
reference back to the parent node or derivation rule. Repeating the same parent
as both a path node and a flattened field does not create another witness.

#### Geographic use of source parents

The source region and DEO/office parents are crucial grounding context:

- a title or coordinate candidate in the parent region receives region-parent
  agreement;
- a candidate compatible with a documented office province/city association
  receives office-parent agreement;
- a candidate outside that context retains a source-hierarchy conflict;
- a unique real DEO parent may support the documented DEO-to-LEG or DEO-card
  fallback after title PSGC resolution fails;
- a region parent may support the region fallback when no usable real DEO is
  present; and
- PAP/funded-section parents help establish record identity and comparison
  scope, but do not by themselves identify a project site.

Only actual district/sub-district engineering-office parents count as real
DEOs. Central Office, a regional office, and broad administrative groupings do
not satisfy the DEO gate. Central Office contributes provenance and an office
reading; the source region parent remains separately available for a region
fallback.

Office-to-location agreement uses the provenance-bearing office resolver's
province/city associations. It must not reverse a DEO-to-legislative-district
crosswalk to invent a PSGC project site. `DEO2LEG` is used only by the later
administrative/legislative fallback policy.

For linked records, assess every source branch independently, then summarize:

| Relationship | Meaning |
|---|---|
| `source_parents_agree` | Resolved parent regions and real DEOs are compatible across linked observations |
| `changed_office` | Normalized printed/inherited office parents differ across sources or stages |
| `source_deo_conflict` | More than one distinct real DEO parent survives |
| `source_region_conflict` | Parent regions disagree or conflict with the candidate hierarchy |
| `source_parent_missing` | The source branch supplies no usable parent of that kind |

Missing source parents are not agreement. A parent borrowed through a linked
record must be labelled linked-stage evidence and cannot be written into the
observation that lacked it.

#### Source-hierarchy invariants

The source-parent layer must prove:

1. Every retained path begins in one pinned source artifact and reaches the
   exact observation leaf without cycles.
2. Node order and parent relationships reproduce that source artifact; the
   resolver does not reorder parents into a preferred geographic shape.
3. Flattened program/PAP, region, and office fields either equal the applicable
   path projection or identify the exact normalization/inference rule that
   produced them.
4. Printed, inherited, inferred, and API-derived group parents remain
   distinguishable.
5. Repeated projections of one parent branch count once when assessing
   support.
6. Each legislative stage and dataset retains its own path, even when linked
   observations have identical titles or amounts.
7. Missing, conflicting, or changed parents remain explicit and cannot be
   repaired from another observation without a labelled review decision.

### 2. Title locality

Use the shared title-to-PSGC output exactly as produced:

- selected title locations and their ancestry;
- all claims and candidates;
- title status and flags;
- reference-only mentions;
- suggestions; and
- raw and cleaned title provenance.

A title-selected location is the printed geographic claim, not proof that the
work is physically there. Reference-only road, river, institution, and facility
names do not become site candidates in this later layer.

### 3. Other printed locality headings

Printed locality headings outside the canonical source parent path can support,
scope, or conflict with a title candidate. Classify each heading before use:

| Heading kind | Use |
|---|---|
| Explicit locality hierarchy | Candidate scoping and hierarchy agreement |
| Regional/provincial allocation heading | Source hierarchy or administrative context; not automatically a site |
| Program/office grouping | Attach to the source hierarchy; provenance and administration only |
| Ambiguous extracted heading | Review evidence only |

Compare printed units with the candidate's canonical ancestry level by level.
Do not treat a derived parent as a second witness for the candidate.

### 4. Source region

The source region should normally be the normalized projection of the nearest
applicable region parent in the observation's source hierarchy. It may
constrain homonyms and assess agreement. It can support an existing title or
point candidate but cannot supply a missing municipality or barangay. Region
disagreement is material context; it does not automatically prove which
evidence is wrong.

### 5. DEO and implementing office

The primary office reading should be the normalized projection of the
applicable source-tree office parent. Additional leaf fields and API labels are
retained as separate readings. Resolve every label independently with aliases
and provenance. Their permitted roles are:

- agreement/conflict context for an already existing candidate;
- ordering of review suggestions;
- a sector-specific administrative fallback, such as a DEO card; and
- disclosure of changed or conflicting printed offices.

An office cannot generate a project-site candidate. Central Office supplies no
local site. Broad regional offices supply administrative region context only.
Conflicting office labels remain a source-office conflict.

### 6. Coordinates and coordinate-to-PSGC mapping

Coordinate evidence passes through four checks before it can support a
candidate:

1. **Extraction:** retain raw text, source field/span, point role, segment, and
   image-review provenance.
2. **Numeric validity:** coordinates are finite, in range, and have a documented
   orientation/normalization rule.
3. **Mapping completeness:** every used point maps to named units that exist in
   the pinned PSGC catalog and form one valid ancestry chain.
4. **Evidence relationship:** compare each point with each candidate at the
   administrative levels both contain.

Per-point relationships are `agrees`, `conflicts`, `partial_support`, or
`not_assessed`. A record-level summary must distinguish:

- all usable points agree on one hierarchy;
- points cover several coherent project locations;
- points are mixed between supporting and conflicting hierarchies;
- only a broader level agrees;
- some points are unmapped or require review; and
- no usable points exist.

Normalized or repaired coordinates retain warnings. Decimal precision is not
positional accuracy. A point on or near a boundary needs the mapper's retained
boundary and tolerance provenance.

### 7. Registry and reviewed named-site evidence

Registry evidence must state what was linked and how:

- exact stable asset/project ID;
- exact reviewed title phrase;
- polygon or point containment;
- proximity candidate; or
- manual reviewed mapping with cited sources.

Exact asset identity can support `registry_asset_location`. Proximity or a name
resemblance is a review candidate. A registry point does not establish a road's
complete extent. Registry-only automatic adoption remains disabled in the
current cleaned policy; a sector adapter may define a stricter route with a new
method version.

### 8. Cross-stage and counterpart evidence

Comparison membership and exact wording can help assess whether observations
describe related work. They do not independently confirm geography when both
records copy the same source wording. Each observation retains its own title,
coordinates, offices, and selection.

A sector may allow a labelled `linked_stage` assignment when one member has a
usable location and the pair satisfies a documented identity gate. That is a
comparison policy, not title extraction, and the contributing stage must be
recorded. Conflicting stage locations must never be unioned into a synthetic
multi-location route.

### 9. Human review

A review decision is evidence only when it records:

- assertion reviewed;
- reviewer or responsible process;
- date;
- evidence inspected;
- decision and rationale;
- method/catalog versions; and
- whether the decision changes data or closes a question without change.

An image-review marker, empty flag list, or prior generated output does not by
itself mean a location was human-verified.

## Candidate universe

Candidates may enter the evidence profile from:

- asserted title claims and title suggestions;
- structured locality headings;
- completely mapped coordinate points;
- exact registry/named-site evidence; and
- recorded human review.

Office labels, legislative districts, amount patterns, nearby projects, and
comparison membership cannot create candidates.

Every candidate retains:

- PSGC code, name, level, and full ancestry;
- origin layer and evidence references;
- claim scope;
- per-level title, spatial, source-hierarchy, heading, region, office, and
  registry assessment;
- evidence-quality and scope-fit assessment;
- blockers, warnings, and alternatives; and
- whether it is selected, suggested, or review-only.

## Per-level hierarchy assessment

Assess each candidate separately at region, province, municipality/city,
sub-municipality, and barangay levels. Valid states are:

| State | Meaning |
|---|---|
| `supported` | Applicable evidence consistently supports the unit at this level |
| `partial_support` | Some applicable evidence supports the unit; coverage or precision is incomplete |
| `conflicting_evidence` | Credible applicable evidence identifies a different unit at this level |
| `mixed` | Different evidence items both support and conflict, or several valid project locations are present |
| `not_assessed` | Evidence is absent or not comparable at this level |
| `not_applicable` | The level does not belong to this hierarchy or task |

Independent cities keep province-free PSGC ancestry. A separately printed
province is assessed as association context, not inserted as a parent.

Competing candidates and multiple project locations are different:

- **Competing candidates:** several interpretations of the same claim remain.
- **Multiple locations:** the evidence affirmatively describes several places.

Do not use a numeric score or candidate count to collapse that distinction.

## Selection routes

Selection routes are explicit and separately labelled. A general resolver may
support these routes:

| Route | Minimum gate | Selection scope |
|---|---|---|
| `title_psgc` | Shared title extractor selects a coherent location with no blocking contextual conflict for the declared task | `title_locality_claim` |
| `title_coordinate` | Title selection plus usable coordinates support the same hierarchy | Title scope, with coordinate corroboration recorded separately |
| `coordinate` | Title is unresolved; every usable, completely mapped point supports one compatible hierarchy and no asserted title claim conflicts | `observed_coordinate_points` |
| `registry_asset` | Exact, provenance-bearing registry identity and no conflicting asserted title location | `registry_asset_location` |
| `reviewed` | Recorded human decision satisfies the review contract | Declared by the review |
| `linked_stage` | Sector-specific counterpart gate permits one stage's result to support the linked row | Declared linked-row scope; contributing stage required |

The current cleaned release implements only its documented subset. In
particular, registry-only adoption is blocked, coordinate selection is limited
to observed points, and whole-project extent remains unassessed.

Office, region, DEO, conflict, and unassigned fallbacks belong to the consumer's
assignment policy. They are not PSGC project-site selection routes.

## Selection gates

A candidate can be selected only when all applicable gates pass:

1. Its code and ancestry are valid in the pinned PSGC catalog.
2. Its origin route is permitted for the target task.
3. Its claim scope is sufficient for the target task.
4. Required evidence is complete and free of unresolved quality blockers.
5. Asserted title claims have at least one compatible interpretation.
6. Printed province, source-tree region/office parents, other headings, and
   registry evidence have no blocking conflict under that route.
7. A new candidate refines or agrees with an existing selected scope; it does
   not erase a separate valid project location.
8. Eligible candidates lie in one compatible ancestry chain, or affirmative
   evidence establishes several project locations.
9. The selected candidate is the deepest candidate supported for that same
   claim and scope.

Scores do not bypass these gates. A high-scoring blocked candidate remains
blocked. Missing evidence is generally `not_assessed`, not agreement.

## Conflict and ambiguity policy

Return a visible conflict or ambiguity when:

- a clean title location and complete coordinate evidence identify disjoint
  places for the same claim and comparable level;
- printed parent context contradicts an otherwise exact candidate;
- several eligible candidate chains interpret one claim;
- stage members of a linked comparison resolve differently; or
- registry identity and asserted title geography disagree.

Do not declare conflict merely because:

- a city has no province parent;
- a DEO differs from the site;
- a point resolves only at a broader level;
- coordinates are missing;
- several locations are affirmatively part of the project; or
- a coordinate endpoint does not establish the full route.

Conflicts retain every reading and evidence reference. They do not silently
select one source as correct.

## Resolution result

Keep `decision`, `status`, `verification_status`, and `scope` separate:

| Field | Example values | Meaning |
|---|---|---|
| `decision` | `selected_title`, `adopted_candidate`, `retained_master`, `review_required`, `unresolved`, `not_applicable` | What the resolver did |
| `status` | `resolved`, `partially_resolved`, `ambiguous`, `unresolved`, `not_applicable` | Whether the declared target is identified |
| `verification_status` | `provisional`, `reviewed`, `not_applicable` | Nature of verification |
| `claim_scope` | Values defined above | What the selection actually covers |

A result should contain:

```json
{
  "record_id": "dataset:source-row",
  "target_level": "municipality_city",
  "decision": "adopted_candidate",
  "status": "resolved",
  "verification_status": "provisional",
  "source_hierarchy": {
    "stage": "nep",
    "path_ref": "source_hierarchy:dpwh_nep_pdf:p195:r10",
    "region_parent": {},
    "office_parent": {},
    "funded_section_parent": {},
    "relationship": "source_parents_agree"
  },
  "selected_locations": [
    {
      "psgc_code": "...",
      "name": "...",
      "level": "barangay",
      "ancestry": {},
      "selection_origin": "coordinate",
      "claim_scope": "observed_coordinate_points",
      "evidence_refs": []
    }
  ],
  "unresolved_levels": ["whole_project_extent"],
  "alternatives": [],
  "conflicts": [],
  "review_flags": [],
  "method_version": "psgc_evidence_resolution_v1",
  "input_refs": []
}
```

The exact schema may differ, but it must preserve candidate profiles, rejected
routes, blockers, warnings, scope, alternatives, and all source references.

## Relationship to legislative and administrative assignment

PSGC resolution precedes legislative-district lookup. The downstream policy
must still determine whether:

- a municipality/city maps to one legislative district;
- a split city requires barangay evidence;
- several selected PSGC locations map to one district;
- affirmative evidence supports an undivided district range; or
- the record falls back to DEO, region, conflict, or unassigned.

District assignments cannot feed back into PSGC candidate selection. A desired
district outcome is never evidence for a locality.

## Current limitations

The present suite has these material limits:

- House observations retain a structured `source_path`, while the NEP PDF and
  API master projections currently expose mostly flattened program/PAP,
  region, and office fields. A uniform path schema with parent-node references
  and derivation status is not yet published for every observation.
- `location_evidence_v6.5` has the title-extraction conformance gaps documented
  in the shared title method.
- `context_evidence_v3` is experimental; its total is not calibrated confidence.
- `candidate_trial_adoption_v1` targets useful municipality/city identification,
  not whole-project extent or legislative assignment.
- Coordinate-reference freshness remains partly unassessed because the current
  coordinate audit does not pin every boundary, catalog, mapper, and code input.
- Registry-only application is blocked in the cleaned selection policy.
- A uniform provenance-bearing human-review collection is not implemented
  across all datasets.
- Cross-stage links are candidates and must not transfer geography implicitly.

These limitations remain explicit in downstream products. A new resolver
version can close them only with regression fixtures, input hashes, and an
audited before/after population report.

## Implementation sequence

1. Complete `title_psgc_v1` conformance and publish its migration audit.
2. Publish a uniform per-observation source-hierarchy record for NEP, HGAB,
   and API inputs, retaining full parent paths and printed/derived provenance.
3. Define a shared candidate/evidence schema across title, source hierarchy,
   interpretation, coordinate, office, registry, and review layers.
4. Pin transitive coordinate mapping dependencies and boundary versions.
5. Implement `psgc_evidence_resolution_v1` as an orchestration layer without
   changing source observations or amounts.
6. Compare its city/municipality decisions with
   `candidate_trial_adoption_v1`; review every difference.
7. Add sector adapters for DPWH and FMR assignment, keeping their DEO,
   linked-stage, range, and fallback policies separate.
8. Publish deterministic artifacts, full evidence companions, reconciliation
   controls, and browser assignment-basis disclosures.

The general resolver owns evidence combination and scope. The title extractor
owns textual claims. Sector policies own final presentation and fallbacks.
