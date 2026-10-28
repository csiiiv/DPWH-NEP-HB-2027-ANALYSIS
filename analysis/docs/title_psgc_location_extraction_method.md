# Title-to-PSGC location extraction — shared method

**Status:** shared normative target documented on 28 October 2026. The active
conservative matcher in
[`master_list/scripts/locations.py`](../../master_list/scripts/locations.py)
(`location_evidence_v6.5`) is the implementation base, but it does not yet
conform to every rule below. The explicit claim/span interchange schema in
this document is the interface to use when the matcher is extracted into a
shared module and the known gaps are closed under a new method version.

This method applies wherever the repository reads a project or facility title
and asks which Philippine Standard Geographic Code (PSGC) location the title
asserts. It is sector-neutral: DPWH, FMR, HFEP, NIA, and later datasets should
use the same title rules and add their sector evidence afterward.

The method is conservative. Finding a place name in a title creates a
candidate. It becomes a selected PSGC location only when the wording asserts
locality and the candidate fits a coherent catalog hierarchy.

## Current conformance and known gaps

Direct checks of `location_evidence_v6.5` against the retained PSGC catalog on
28 October 2026 found these differences from the normative method:

| Case | Current v6.5 behavior | Required shared behavior |
|---|---|---|
| `Barangays Paco and Paliwas, Obando, Bulacan` | Selects Paco and flags the plural list; Paliwas is not selected | Preserve both exact barangays under Obando as separate claims |
| `Brgy. Cawayan, Bongabon, Oriental Mindoro` | Selects Cawayan under **Bongabong** despite the printed Bongabon conflict | Retain the impossible printed chain as a conflict; do not silently repair the town |
| `Brgy. Granada, Bacolod City, Negros Occidental` | Selects Granada and Negros Occidental as two locations | Select Granada under the HUC and retain the province only as separate address context |
| `Iligan City - Cagayan de Oro City Alternate Road ..., Barangay Nangcaon Section ..., Opol, Misamis Oriental` | Selects the two cities embedded in the road name and Opol; misses the marked Nangcaon claim | Treat the road-name cities as references and select the explicit Nangcaon → Opol hierarchy |

These are implementation gaps, not accepted exceptions. Until the regression
suite passes, consumers must identify their result as
`location_evidence_v6.5`; they must not claim conformance with
`title_psgc_v1`. Refactoring should first preserve the existing output for a
clean parity baseline. The behavioral corrections then require an explicit
method-version change and an audited before/after report.

## Scope and evidence boundary

Title extraction answers one question:

> What PSGC location or locations does this printed title itself support?

It does not answer which legislative district, DEO, region card, map polygon,
or representative should receive the project. Those decisions consume the
title result later.

```text
raw source title + versioned readable cleanup
  -> locality mentions and their role in the sentence
  -> exact PSGC candidates
  -> hierarchy and context checks
  -> selected title locations, ambiguity, or no result

selected title locations
  + coordinates / registry / office / comparison-stage evidence
  -> downstream project assignment
```

The following are outside title extraction:

| Evidence | Permitted downstream use | Prohibited use during title extraction |
|---|---|---|
| Coordinates and reverse geocodes | Corroborate, conflict with, or provide a separately labelled spatial route | Invent or silently correct a title claim |
| DEO or implementing office | Administrative fallback or review context under a sector policy | Assert that the project site is the office location |
| NEP/HGAB source-tree parents | Ground title candidates with the row's inherited region, DEO/office, PAP, and funded-section context | Become title text or silently supply a missing site |
| Source region | Constrain homonyms and record disagreement; normally retain its source-parent reference | Substitute for a missing project locality |
| External registry or reviewed named site | Independent, explicitly labelled assignment route | Masquerade as a title-derived PSGC match |
| Another legislative stage or linked dataset | Comparison evidence | Rewrite this observation's printed title |
| PSGC-to-legislative crosswalk | Translate a selected PSGC after extraction | Influence which PSGC candidate is selected |

## Terms

| Term | Meaning |
|---|---|
| **Mention** | Text that exactly matches a canonical PSGC name or documented alias |
| **Claim** | A mention whose syntax asserts a project locality, such as an explicit barangay marker or bounded administrative suffix |
| **Candidate** | A canonical PSGC code associated with a mention; homonyms remain separate candidates |
| **Selected location** | A candidate that passes locality-syntax, hierarchy, and ambiguity gates |
| **Suggestion** | A coherent possible hierarchy retained for review but not selected |
| **Context** | Printed headings, source region, or other evidence that can constrain or assess a claim without becoming the title claim |
| **Ancestry** | The canonical chain obtained by following PSGC `parent_code`, never by slicing digits from the code |

A mention is not automatically a claim, and a candidate is not automatically
a selected location.

## Input contract

Each extraction operates on one source observation. The minimum inputs are:

- stable source record ID and stage/dataset identity;
- record kind;
- original source title;
- the exact title field used for matching;
- version and rules for any readable cleanup;
- canonical PSGC catalog version; and
- optional printed structured-locality and source-region context.

The current master-list implementation matches `title_clean`, generated by
`readable_title_v1`, while retaining `title`, `title_source`, and
`title_clean_rules`. Readable cleanup may repair Unicode composition, split
`ñ`, entities, or whitespace. It cannot add a place name, choose a homonym, or
change the source evidence without a named, versioned rule.

Allocation and control rows that do not assert a project or facility site are
not parsed as sites. They return `allocation_not_site` even if their labels
contain geographic names.

## Canonical catalog and codes

The catalog must supply, for every unit:

- canonical 10-digit PSGC code;
- canonical name;
- level;
- `parent_code`; and
- catalog version or input hash.

The active retained catalog is
[`PSGC2LEG/data/psgc_locations.jsonl`](../../PSGC2LEG/data/psgc_locations.jsonl).
All candidate codes and ancestry members must exist in that same catalog.

Legislative assignments are not part of this catalog lookup. A municipality
can be a clean PSGC result even when a downstream legislative lookup needs a
barangay because the city has several districts.

## Extraction procedure

### 1. Preserve the title and normalize only for matching

Keep the original and matching title separately. Matching normalization may:

- case-fold and normalize Unicode;
- fold diacritics for comparison while retaining the printed spelling;
- normalize punctuation and repeated whitespace into tokens;
- expand documented administrative abbreviations such as `Brgy.`, `Sta.`,
  `Sto.`, and `Pob.`;
- protect station syntax so `Sta. 23+806` is chainage rather than `Santa`;
- recognize documented historical names such as North Cotabato/Cotabato,
  Compostela Valley/Davao de Oro, and Western Samar/Samar; and
- derive aliases mechanically from canonical catalog forms, including
  supported `City of X`/`X City` forms and catalog parentheticals.

Every rewrite must be deterministic, versioned, and testable. Open-ended
spell correction, edit-distance matching, phonetic matching, and live
geocoding cannot select a location. A hand-curated alias must name its source,
scope, and canonical target.

### 2. Identify mentions and classify their role

The matcher finds exact canonical names and documented aliases, preserving all
homonymous PSGC codes. It then classifies how each mention appears:

| Role | Assignment strength |
|---|---|
| `explicit_administrative` | Strong: introduced by `Barangay`, `Brgy.`, `City of`, `Municipality of`, `Province of`, or equivalent syntax |
| `bounded_administrative_suffix` | Strong when a trailing component or ordered components form a coherent locality chain |
| `route_endpoint` | Strong only when the wording asserts the endpoint as part of the project alignment |
| `destination` | Reviewable; `leading to` can name a destination rather than the work site |
| `facility_or_road_name` | Reference-only unless another phrase asserts the same place as locality |
| `parenthetical_context` | Reference-only by itself; commonly an acronym, road specification, coordinate, district qualifier, or phase |
| `source_locality_heading` | Context from the source hierarchy, not title text |

Balanced parenthetical content does not assert locality merely because it
contains a place. Unclosed parentheses caused by extraction defects do not
mask the remainder of the title.

Chainage, road length, phase labels, project codes, and coordinate pairs are
not place names. `Sta.` immediately followed by a station value is chainage.

### 3. Recognize locality syntax

A mention qualifies as an asserted title locality through one of these
documented routes:

1. **Explicit marker:** an adjacent `Brgy.`/`Barangay` or administrative-level
   marker identifies the mention.
2. **Ordered parent chain:** adjacent or bounded components form a valid
   barangay → municipality/city → province chain.
3. **Compact complete component:** catalog names and administrative labels
   cover the complete bounded component, including supported missing-comma
   forms.
4. **Province-anchored enumeration:** several barangays or municipalities are
   grouped under a printed common parent.
5. **Explicit route endpoints:** wording establishes several places as the
   geographic endpoints or covered sections of the work.

A bare catalog name in the leading project description remains reference-only
unless one of these routes applies. This prevents a road, river, school,
hospital, university, district, or facility name from becoming a site solely
because it shares a PSGC name.

### 4. Generate candidates without discarding homonyms

Use longest non-overlapping exact catalog-name matches. For every mention:

- retain all matching codes before applying context;
- retain the raw and normalized mention;
- retain the title field, locality role, marker, and resolution rule;
- preserve the source order of enumerated claims; and
- keep distinct mentions separate even when they resolve to the same parent.

Do not select a candidate because its name is globally rare. Uniqueness is
evaluated only after the complete printed hierarchy and context are applied.

Barangay names are first scoped through a named municipality/city when
available. Province and source-region context may narrow candidates, but a
context-only candidate remains a suggestion when the title lacks enough
parent information to assert it safely.

### 5. Validate hierarchy through `parent_code`

For every candidate, construct the complete ancestry and apply these gates:

1. A barangay candidate must fall under the compatible printed
   municipality/city.
2. A municipality/city must fit the compatible printed province and region.
3. Every asserted homonymous name must be unique after parent and region
   filtering.
4. A contradictory printed province blocks automatic selection; a globally
   unique name cannot overrule it.
5. A selected descendant explains its own ancestors, so those ancestors do
   not appear as separate selected locations. Separately asserted places do.
6. Catalog intermediate levels, including Manila districts and other
   sub-municipalities, remain in ancestry and cannot be skipped by assuming a
   fixed code layout.

#### Independent and highly urbanized cities

An independent or highly urbanized city may have no province in its PSGC
ancestry even when a familiar address prints a nearby province. If the city
or barangay is otherwise unique and the region is coherent, select the city
hierarchy and retain the province as separate context with
`independent_city_with_separate_province_context`.

This is not a general exception for municipality-province conflicts. It
applies only to cataloged independent-city relationships.

### 6. Select the narrowest defensible location or preserve uncertainty

Selection follows these rules:

1. Select a unique asserted barangay with a coherent parent chain.
2. Otherwise select a unique asserted municipality/city with coherent parent
   context.
3. Otherwise retain an asserted province as `province_only`; do not claim a
   more specific site.
4. Preserve several coherent, separately asserted sites as
   `multiple_locations`.
5. If competing candidates survive or the printed hierarchy conflicts,
   return `ambiguous` and retain all evidence.
6. If no asserted candidate survives, return `unresolved`.

Suggestions never become selected locations automatically. Their scores may
order a review queue; the score is an additive evidence ledger, not a
probability or assignment threshold.

## Multiple locations and project extent

Multiple title locations remain multiple locations. Extraction does not:

- collapse an enumeration to the last barangay;
- split or duplicate project money;
- assume equal shares;
- infer a continuous route from a list of names; or
- turn several point locations into the full extent of a project.

Hyphens require context. They can be part of a canonical name or join route
endpoints. The matcher tests complete catalog names before treating a hyphen
as a separator.

The downstream consumer decides whether several PSGC locations map to one
target, form an affirmative undivided range, or require review.

## Output contract

The active matcher returns these statuses:

| Status | Meaning |
|---|---|
| `name_matched` | One coherent town/city or barangay selection |
| `multiple_locations` | Several coherent asserted sites retained |
| `province_only` | Only a province-level site claim can be selected |
| `ambiguous` | Competing candidates or conflicting hierarchy prevent a clean selection |
| `unresolved` | No asserted candidate passes the gates |
| `allocation_not_site` | The source row does not assert a project/facility site |

`registry_matched` is an enriched master-list status, not a title-extraction
status. It is valid only when separately labelled registry evidence supplies a
location after title extraction returned no site.

A stable shared record should contain:

```json
{
  "record_id": "dataset:source-row",
  "raw_title": "...",
  "matching_title": "...",
  "matching_title_field": "title_clean",
  "cleanup_method": "readable_title_v1",
  "claims": [
    {
      "raw": "Barangay Mandangoa",
      "normalized": "mandangoa",
      "span": [0, 19],
      "level_hint": "barangay",
      "role": "explicit_administrative",
      "resolution_rule": "explicit_barangay_marker"
    }
  ],
  "candidates": [
    {
      "psgc_code": "...",
      "name": "Mandangoa",
      "level": "barangay",
      "ancestry": {},
      "claim_refs": [0]
    }
  ],
  "selected_locations": [],
  "suggestions": [],
  "status": "unresolved",
  "method": "exact_catalog_name_with_locality_syntax",
  "method_version": "title_psgc_v1",
  "verification_status": "provisional_name_match",
  "review_flags": [],
  "needs_review": true,
  "input_refs": []
}
```

The implementation may retain the current names `locations` and `evidence`
while migrating to explicit `selected_locations` and `claims`. Whichever
schema is used must preserve every candidate considered, the reason for each
selection or rejection, full ancestry, raw source evidence, method version,
and input hashes.

All title-derived results remain provisional name interpretations. They do
not certify the physical project site.

## Review flags

The shared extractor must retain, at minimum:

| Flag | Meaning |
|---|---|
| `allocation_is_not_a_project_site` | The row kind carries no site assertion |
| `barangay_mentioned_but_unmatched` | An explicit barangay marker has no compatible exact candidate |
| `ambiguous_barangay_name` | Several barangay candidates survive context |
| `ambiguous_city_municipality_name` | Several town/city candidates survive context |
| `barangay_list_requires_review` | A plural barangay enumeration needs scope review |
| `grouped_barangays_under_same_municipality` | Several marked barangays form a coherent common-parent group |
| `title_or_heading_province_conflict` | The asserted town/city does not fit the printed province context |
| `source_region_differs_from_title_location` | Selected title hierarchy differs from the printed source region |
| `independent_city_with_separate_province_context` | Printed province is context for an independent city, not a PSGC parent |
| `city_district_context` | A city-district name supplies context without becoming a conflicting municipality |

Sector adapters may add flags, but they cannot silently reinterpret these
meanings. Coordinate, registry, office, and legislative-district flags belong
to their own evidence layers.

## General regression cases

| Title pattern | Required behavior |
|---|---|
| `... Barangay Mandangoa, Balingasag, Misamis Oriental` | Select the exact Mandangoa → Balingasag → Misamis Oriental hierarchy. |
| `... Barangays Paco and Paliwas, Obando, Bulacan` | Preserve Paco and Paliwas as separate claims under Obando. |
| `... UP Diliman, Quezon City` | Select only what the canonical wording supports. A university/facility name cannot manufacture a barangay; a city-only result may be insufficient for downstream district assignment. |
| `... College of Engineering Extension Building, NDC Compound Pureza St., Sta. Mesa, Manila` | Treat facility and street text as context; retain an exact asserted Manila locality without guessing a barangay from an institution or street. |
| `... Brgy. Cawayan, Bongabon, Oriental Mindoro` | Retain the impossible municipality-province chain as conflict. Do not silently change Bongabon to Bongabong. |
| `... Brgy. Granada, Bacolod City, Negros Occidental` | Select Granada under Bacolod City when unique; retain Negros Occidental as separate HUC address context. |
| `... Sta. 23+806 - Sta. 27+226, Opol, Misamis Oriental` | Treat both `Sta.` values as chainage and select only the explicit Opol → Misamis Oriental locality. |
| `Iligan City - Cagayan de Oro City Alternate Road ..., Barangay Nangcaon Section ..., Opol, Misamis Oriental` | Treat Iligan and Cagayan de Oro as road-name references; select the marked Nangcaon → Opol → Misamis Oriental hierarchy. |
| A road/facility name containing a municipality with no locality syntax | Retain the name as reference-only; do not assign it as the site. |

Sector documents should add their own regression titles without redefining
these shared expectations.

## Invariants and tests

Every implementation and adapter must prove:

1. Raw source title and matching title are both retained with cleanup
   provenance.
2. Every candidate and selected code exists in the pinned PSGC catalog.
3. Every ancestry chain follows `parent_code` and contains no cycle.
4. Exact names and documented aliases are the only automatic name routes.
5. Reference-only mentions cannot become selected title locations.
6. A contradictory province cannot be overridden by global name uniqueness.
7. Suggestions, coordinates, offices, registries, linked stages, and district
   mappings cannot enter `selected_locations` as title evidence.
8. Multiple asserted locations remain distinct and never duplicate money.
9. Independent-city province context is retained and flagged without creating
   a false parent.
10. Rebuilding from identical inputs is deterministic, and a method or catalog
    change produces an explicit version/hash change.
11. Existing regression fixtures cover explicit markers, compact/missing-comma
    chains, homonyms, numbered barangays, Manila ancestry, HUCs, enumerations,
    chainage, parentheticals, road/facility references, and incomplete titles.

## Implementation and reuse

The current implementation lives in
[`master_list/scripts/locations.py`](../../master_list/scripts/locations.py).
Shared use should extract or wrap `Matcher`, normalization, aliases, ancestry,
and evidence vocabulary with a parity test against current master-list output.
After that refactor, close the documented conformance gaps under a new method
version and publish the affected records and totals. Scoring, candidate
interpretation, coordinates, office context, and application gates can remain
separate layers.

Related documents:

- [shared PSGC evidence resolution](psgc_location_evidence_resolution_method.md)
  combines title results with coordinates, hierarchy context, offices,
  registries, and review evidence;
- [master-list scoring rules](../../master_list/docs/SCORING_RULES.md) define
  the active additive evidence weights;
- [flags reference](../../master_list/docs/FLAGS_REFERENCE.md) defines current
  diagnostics across all enrichment layers;
- [DPWH location-district policy](location_district_lens_method.md) consumes
  title PSGC alongside DEO and region fallbacks; and
- [FMR PSGC adapter](fmr_psgc_location_extraction_method.md) defines FMR
  inputs, per-stage isolation, coordinate comparison, and FMR controls.

This document owns the shared title-to-PSGC rules. Sector documents may
tighten whether a selected title location is sufficient for their assignment,
but they should not fork parsing, alias, hierarchy, or ambiguity behavior.
