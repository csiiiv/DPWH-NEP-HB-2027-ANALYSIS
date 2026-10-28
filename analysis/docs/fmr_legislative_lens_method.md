# FMR legislative lens — resolution and implementation

**Status:** initial implementation built and audited on 29 October 2026. The
generated lens is available locally at `#congress/fmr`; the evidence policy in
this document remains the governing contract for further review.

**Builder:** `analysis/web/buildFmrLegislativeLens.py`

**Output:** `analysis/data/fmr_legislative_index_2027.json`

**Route:** `#congress/fmr`, labelled **FMR (Legislative)**. Project
explorer links should retain `lens=fmr` so shared district links reopen the
same evidence policy.

The purpose of this lens is to organize the FY2027 DA farm-to-market-road
annex by geographic legislative district using the locality printed in the
project title, normalized coordinates, per-point PSGC reverse geocodes, and
the audited PSGC-to-legislative-district crosswalk. It must keep every source
allocation intact and must never imply that a representative requested,
sponsored, selected, or controls a project.

## Architectural decision: use a new FMR builder

The DPWH location builder,
[`analysis/web/buildLocationLens.py`](../web/buildLocationLens.py), is a useful
reference but is not the FMR resolver.

The new builder should reuse these established contracts:

- the 254-seat PSGC2LEG-to-viewer district-ID bridge;
- district and representative descriptors already published by the Congress
  index;
- the card, `row_resolution`, provenance, reconciliation, and build-check
  patterns;
- undivided-range presentation for evidence that genuinely covers more than
  one legislative district;
- the explorer's **Assignment basis** disclosure.

It must implement FMR-specific evidence rules because:

- FMR records have no DEO or implementing-office field;
- every FMR source document has its own project rows and amount controls;
- projects may contain several coordinate points and several separate
  segments;
- the House/NEP links are deterministic comparison candidates, not certified
  project identities;
- a coordinate can be syntactically valid while disagreeing with the title;
- a road may genuinely span districts, while a bad endpoint can only look like
  a span.

No DEO fallback, Central Office rule, or DPWH Transparency API evidence belongs
in this builder.

## Authoritative inputs

The builder should consume already-audited artifacts rather than geocoding
again in the web build:

| Input | Use |
|---|---|
| `other-analysis/data/fmr_psgc_locations_2027.json` | Per-stage PSGC title extraction and coordinate comparison, produced under [`fmr_psgc_location_extraction_method.md`](fmr_psgc_location_extraction_method.md) |
| `other-analysis/data/fmr_workbench.json` | 1,059 comparison rows, the House and NEP projects, candidate-pair method, normalized segments and points, source pages, title locality, PSGC point evidence, and coordinate-review provenance |
| `other-analysis/data/hgab_fmr_final_dataset.json` | Independent check of the 964 House projects and ₱19,628,100,000 control |
| `other-analysis/data/nep_fmr_final_dataset.json` | Independent check of the 704 NEP projects and ₱16,000,000,000 control |
| `PSGC2LEG/data/psgc_locations.jsonl` | Canonical PSGC hierarchy and names |
| `PSGC2LEG/data/psgc_leg_assignments.jsonl` | Municipality/city assignments and barangay assignments for split cities |
| `PSGC2LEG/data/legislative_districts.json` | 254-seat catalog |
| `analysis/data/congress_district_index_2027.json` | Viewer district IDs, district labels, representatives, and roster metadata |

Every input must be recorded with path and SHA-256 in the output. The builder
must fail on a stale final dataset, missing comparison member, duplicate row,
unknown PSGC code, or incomplete district bridge.

## Grain and money rules

The assignment grain is one row from `fmr_workbench.json → comparison`:

- 609 candidate pairs;
- 355 House-only observations;
- 95 NEP-only observations.

A paired row carries one House project and one NEP project. A source-only row
carries one project. The linked row is assigned to one card so comparison
buckets and amounts remain reviewable without duplicating either stage.

Segments and points are evidence. They never receive or divide the project's
allocation. A project that covers several districts stays as one undivided
amount on a range card. Equal shares, length-weighted shares, endpoint shares,
and per-barangay shares are prohibited unless a future source explicitly
prints such a split.

The words **House only** and **NEP only** describe unmatched source
observations. They are not certified insertions or deletions.

## Stage-level evidence resolution

Resolve the House and NEP project on a comparison row independently before
combining them.

### 1. Resolve the title locality

Consume the versioned per-stage extraction records defined in
[`fmr_psgc_location_extraction_method.md`](fmr_psgc_location_extraction_method.md).
The legislative builder must not rerun the legacy comma parser or choose among
PSGC title candidates itself.

A title route is eligible only when the extraction record selected a coherent
PSGC location or explicit set of locations. The legislative builder then maps
those PSGC codes through the audited crosswalk. A whole municipality/city must
map to one legislative district; a split city requires a selected barangay;
and several selected locations either map to the same district or remain an
explicit multi-district set. Ambiguous and unresolved title candidates remain
visible as evidence but supply no title district.

### 2. Resolve accepted coordinate points

Use the reviewed/accepted point coordinates already carried by the FMR
workbench and their PSA 2023 PSGC reverse geocodes. Do not run a second spatial
mapper in the lens builder.

A point may support district placement only when:

- its normalized coordinate pair is present and finite;
- the project is not blocked by an unresolved coordinate-review finding that
  applies to that point;
- the reverse geocode has a PSGC match;
- the barangay PSGC maps to a legislative district, or its whole-unit parent
  municipality/city does; and
- its relationship to the title is retained, including
  `AGREE`, `AGREE_MUNI_BRGY_DIFFERS`, `PARTIAL_PROVINCE_ONLY`, `DISAGREE`, or
  `NO_MATCH`.

`AGREE` is direct spatial corroboration. `AGREE_MUNI_BRGY_DIFFERS` can
corroborate a whole-unit municipality but cannot select a barangay district in
a split city. `PARTIAL_PROVINCE_ONLY`, `DISAGREE`, and `NO_MATCH` remain review
evidence; they do not independently override a clean title route.

When the title cannot resolve, all otherwise clean usable points must agree on
one legislative district before coordinate-only assignment is allowed.
Conflicting clean point districts go to review unless the title explicitly
names a supported multi-district route.

### 3. Produce one stage result

| Condition | Stage result | Stage basis |
|---|---|---|
| Clean title district and usable coordinates corroborate it | That district | `title_coordinate` |
| Clean title district; no usable coordinate contradicts it | That district | `title_psgc` |
| Title is unresolved; all usable coordinates identify one district | That district | `coordinate` |
| Credible title and coordinate evidence identify the same set of several districts | The undivided district set | `spanning` |
| Clean title and clean coordinate evidence identify disjoint districts | Conflict, with both readings retained | `title_coordinate_conflict` |
| No district route, but the source region exists | Region | `region` |
| No district route or region | Unassigned | `unassigned` |

A multi-district result is allowed only for affirmative evidence of a route
covering those districts. Merely collecting every reverse-geocoded endpoint is
not enough.

## Combining House and NEP evidence

After stage-level resolution:

| Comparison condition | Row assignment |
|---|---|
| Source-only row | Its source project's stage result |
| Both stages resolve to the same district or same exact district set | That target |
| One stage resolves and the other has no district result | The resolved target, recorded as `linked_stage`, with the contributing stage named |
| Stage targets differ | A visible `stage_location_conflict` catch-all within the common region, or unassigned if no common region exists |

The builder must not union different House and NEP targets into a synthetic
spanning route. A candidate pair can reflect a source change, matching error,
or coordinate problem. The conflict card keeps both amounts and the candidate
link together for review.

The `linked_stage` route is allowed because the FMR workbench already limits
pairs to unique, same-region candidates based on exact canonical title and/or
exact clean coordinates. It must remain labelled **candidate-pair evidence**,
not a certified identity. If that policy is later judged too permissive, the
builder can demote these rows to region without changing the source data.

## Published row-resolution record

Every comparison row should emit a record shaped for audit rather than only a
card ID:

```json
{
  "basis": "title_coordinate",
  "target_type": "district",
  "target_ids": ["leg:..."],
  "contributing_stage": "both",
  "house": {
    "project_id": "ib:p...",
    "title_psgc": {},
    "point_districts": [],
    "basis": "title_coordinate"
  },
  "nep": {
    "project_id": "nep_fmr:p...",
    "title_psgc": {},
    "point_districts": [],
    "basis": "title_coordinate"
  },
  "flags": []
}
```

The exact schema may add fields, but it must preserve the selected title PSGC,
every usable and rejected coordinate point, point verdicts, source project IDs,
candidate-pair method, final target, and reason for every rejection.

## Flags

At minimum the lens should publish:

| Flag | Meaning |
|---|---|
| `title_coordinate_conflict` | A stage's clean title and clean spatial evidence resolve to disjoint districts |
| `stage_location_conflict` | House and NEP candidate members resolve to different targets |
| `multi_district_span` | Affirmative evidence supports an undivided range across several districts |
| `linked_stage_location` | Only one candidate-pair member supplied the usable district route |
| `coordinate_review` | One or more relevant points retain unresolved normalization/review findings |
| `title_location_unresolved` | Parsed title locality could not resolve uniquely through canonical PSGC |
| `split_city_barangay_required` | City-level evidence is insufficient because the city has several districts |

Flags disclose disagreement and uncertainty. They never silently change an
amount or manufacture a district.

### Source-analysis review flags in the explorer

The project explorer also reuses the pure review model in
[`analysis/web/src/fmrRedFlags.js`](../web/src/fmrRedFlags.js), which derives
its findings from the updated
[`other-analysis/data/fmr_workbench.json`](../../other-analysis/data/fmr_workbench.json).
These are kept separately as `analysisFindings`, with the source stage,
project ID, evidence text, and a link to the corresponding FMR Analysis
record. The row's combined `flags` list makes both assignment flags and source
review flags searchable in the legislative explorer. Source-analysis findings
do not participate in the assignment resolver.

The reused default screens are:

- positive endpoint spans below 100 m, zero spans, and spans above 10 km;
- incomplete endpoint geometry and unresolved coordinate review;
- coordinate/title province disagreement;
- exact shared footprints within one source and repeated sections within a
  project;
- allocation per endpoint meter above both 3 times the peer median and
  Q3 + 3 IQR; and
- candidate allocation increases of at least 25% on an unchanged exact
  coordinate footprint.

The full definitions and editable thresholds remain in
`#fmr/analysis?view=red_flags`. Endpoint spans are straight-line distances,
not road lengths. The allocation-per-meter measure is a screening proxy, not
a construction unit cost. Shared-footprint screening is source-specific, and
candidate increases still require identity and scope review.

### Per-record segment map

Each FMR legislative explorer row offers **View map**. It opens a modal over
the current district card using the reviewed coordinates already retained in
`fmr_workbench.json`; it does not geocode or repair coordinates in the
browser. House segments render as solid blue lines, NEP segments as narrower
dashed teal lines, and retained source points render as dots. The layered line
styles keep both readings visible when a candidate pair has identical
geometry. Point-only records remain mappable, while records with neither a
complete segment nor a retained point show an explicit no-geometry state.

The modal draws straight connections between printed endpoints. These lines
are evidence footprints, not surveyed road alignments, and each stage's full
project allocation remains counted once regardless of its segment count. A
link from the modal opens the same candidate pair or source project in the
full `#fmr/map` workspace.

The project evidence drawer exposes **Show project map**, which opens this
same segment modal above the drawer and returns to the drawer when closed.
FMR coordinates stay inside this evidence flow rather than linking each point
directly to an external OpenStreetMap page.

The district explorer also offers **View all segments** beside its heading.
This modal draws every reviewed segment and retained point on that card,
colored by comparison-row status: NEP only, House only, or matched candidate.
Matched rows use one color across both stages; identical House and NEP
footprints may therefore overlap, while the legend still reports the retained
source-segment count. Clicking a line or point opens the comparison row's
ordinary project evidence drawer above the map, preserving access to title
PSGC, assignment basis, analytical findings, coordinates, and source pages.

## Why raw endpoint-to-district grouping is unsafe

The current final datasets contain coordinates for every project, but presence
is not the same as reliable district evidence:

- House: 964 projects; 517 have `ALL_POINTS_AGREE`, 340 `MIXED`, 62
  `PARTIAL_PROVINCE_ONLY`, 44 `DISAGREE`, and 1 `NO_MATCH`.
- NEP: 704 projects; 350 have `ALL_POINTS_AGREE`, 266 `MIXED`, 54
  `PARTIAL_PROVINCE_ONLY`, 32 `DISAGREE`, and 2 `NO_MATCH`.

For example, the Gueteb FMR title names Urbiztondo, Pangasinan. One endpoint
reverse-geocodes there while another lands in San Carlos City, producing two
raw legislative districts. That is a mixed-coordinate review case, not enough
evidence to publish a two-district span. The Sulsugin, Nagcarlan title has both
points in Victorias City and must surface as a conflict. Conversely, HUC
province conventions can produce an administrative `DISAGREE` even when the
city and barangay names match, so the resolver must compare the legislative
result and canonical hierarchy rather than rely on the existing verdict label
alone.

These cases are the reason for a new, explicit FMR policy instead of a direct
copy of the DPWH resolver.

The `Soysoyan-Ballay-Tawangan-Lusod Proper` FMR is a concrete mixed case. Its
title resolves to Kabayan, Benguet and its start point resolves to Ballay,
Kabayan (**Benguet lone district**), but its end point resolves to Danggo,
Tinoc (**Ifugao lone district**). House and NEP repeat the same two
coordinates. Because the title does not affirm an Ifugao route and the second
point is materially inside Tinoc rather than merely touching the boundary,
the row remains a title-coordinate conflict instead of becoming a synthetic
two-district range. The interface counts two unique coordinates and retains
the four stage-specific observations as provenance.

## User interface

Add **FMR (Legislative)** as a fourth Congress tab after **Districts
(Legislative)** and before **Map**.

The existing legislative card shell can be reused for:

- representative and district descriptors;
- card sorting and search;
- district, undivided-range, region, conflict, and unassigned cards;
- stage totals and comparison buckets;
- deep links and the record drawer.

The FMR explorer needs an FMR adapter rather than DPWH columns. Recommended
columns are:

1. Project;
2. candidate status and match method;
3. assignment basis;
4. title locality;
5. coordinate/PSGC verdict;
6. House amount;
7. NEP amount;
8. change;
9. source page; and
10. FMR map link.

The **Assignment basis** cell and drawer must state the method, contributing
stage, selected PSGC chain, point evidence, final target, and flags. A range
card must say **undivided range, never split**. Conflict, region, and unassigned
cards are valid results and remain visible.

## Output and reconciliation invariants

The new builder and tests must prove:

1. All 1,059 comparison rows appear exactly once.
2. Every one of the 964 House projects and 704 NEP projects appears through
   exactly one comparison row.
3. Card totals reproduce ₱19,628,100,000 House and ₱16,000,000,000 NEP.
4. Candidate-pair delta plus House-only minus NEP-only equals the whole-ledger
   delta.
5. No segment, point, barangay, or district duplicates project money.
6. Every district target exists in the 254-seat catalog and viewer bridge.
7. Split-city assignment requires a barangay-level PSGC assignment.
8. Every row has one published basis and a complete evidence trace.
9. Different stage targets never become a synthetic range.
10. Region, conflict, and unassigned outcomes do not fail the build.
11. Rebuilding is deterministic and `--check` detects artifact drift.

## Initial implementation audit

The current generated index contains 202 cards and all 1,059 comparison rows.
Of those rows, 1,006 resolve to legislative-district cards and 53 remain on
explicit region or location-evidence-conflict fallbacks. The published
assignment bases are:

| Basis | Rows |
|---|---:|
| `title_coordinate` | 915 |
| `title_coordinate_conflict` | 51 |
| `title_psgc` | 46 |
| `coordinate` | 35 |
| `linked_stages_agree` | 9 |
| `region` | 2 |
| `linked_stage` | 1 |

No row met the affirmative evidence gate for a multi-district `spanning`
assignment, so the first index contains no synthetic undivided-range card.
This is an audit result rather than a disabled feature: a later row may use a
range card if its title and accepted coordinate evidence support the same
exact district set.

The build reconciles all 964 House projects and 704 NEP projects exactly once,
including the ₱19,628,100,000 House total and ₱16,000,000,000 NEP total.
`python analysis/web/buildFmrLegislativeLens.py --check` verifies deterministic
output and these controls. Browser tests also verify the tab, explorer,
assignment basis, and both source-document links.

Presence of a title PSGC and coordinates does not by itself pass the district
gate. In the current fallback population, 51 rows retain conflicting title
and coordinate district readings on dedicated **location-evidence conflict**
cards. Forty have a coordinate in the title district plus another coordinate
in a different district; 11 have coordinate districts disjoint from the title
district. Two rows remain on ordinary region cards because neither their
multi-place title nor their coordinates establish one clean district target.
An unmatched barangay spelling no longer discards an exact printed
municipality/city: the parent remains eligible when it maps one-to-one to a
district, while the unmatched-barangay flag and split-city safeguard remain.

Future changes may tighten the evidence gates after review. They must preserve
the no-duplication, split-city, conflict, and provenance requirements above.
