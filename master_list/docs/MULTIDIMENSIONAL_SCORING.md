# Multidimensional evidence assessment: inventory and proposal

**Status:** evidence inventory and design proposal, 2026-10-26.
**Active location rules:** `location_evidence_v6.5`; this document proposes
additional assessments without changing the master assignment rules.

The first [location-focused interpretation layer](LOCATION_INTERPRETATIONS.md)
is now implemented as `location_interpretations_v6`. It retains alternative
title/name-role and parent-chain readings, compares contextual support at
separate administrative levels, and exposes them in the browser. The broader
six-dimension model below remains a proposal. The implemented
[candidate support prototype](CONTEXT_SCORING.md), `context_evidence_v3`, now
scores text, spatial, context and registry evidence separately, with an
experimental total and explicit trial gates. It produces dry-run proposals;
automatic assignment remains outside this implementation.

A separate [cleaned consumer release](CLEANED_DATASET.md) now materializes
provisional selections from eligible trial proposals and conservative
review-facing questions. Its policies and statuses are separate from these
score dimensions; adoption adds no points or verification claim.

The location-focused implementation now also includes qualitative **evidence
quality** and **scope fit**, per-level hierarchy assessments, and an explicit
distinction between competing candidates and multiple observed/selected
locations. These descriptors do not add points. They are a practical subset
of the broader six-domain inventory below, not a claim that counterpart
identity, financial consistency or source accuracy have been fully assessed.

The office assessment now resolves DEO aliases and province/city name
associations with retained source provenance. It can support title-derived
review candidates without coordinates. Legislative districts are deferred:
they are potential downstream outputs of resolved PSGC locations, not inputs
to this candidate-scoring implementation.

A useful assessment answers several questions separately: what place is being
claimed, how explicitly it is named, whether its hierarchy is consistent,
whether coordinates support it, and whether another budget record actually
describes the same work. A single total makes those distinctions difficult to
see. More geographic detail, more printed cues, and more independent sources
are different properties.

The first step is an **evidence profile**, with separate dimensions,
explicit unknowns and linked supporting/conflicting observations. The candidate
subscores now provide a prototype to evaluate against reviewed cases; they do
not yet implement every broader assessment proposed below.

## 1. Evidence and context already available

Paths in this table refer to the master source observation unless stated
otherwise. `group.stages` and `group.upstream` refer to the readable processing
comparison group. Availability varies by dataset and record.

| Detail or context | Retained fields / source | What it can support | Interpretation limit |
|---|---|---|---|
| Source identity and traceability | `record_id`, `dataset`, `stage`, `fiscal_year`, `source_dataset`, `source_record_id`, `source`, `source_pdf`; PDF/printed pages and, for some sources, cell/row bounding boxes | Revisit the printed row, distinguish editions, trace a derived finding | A source locator identifies a record, not a physical project. API rows have snapshot references without asserted PDF pages |
| Original and readable wording | `title`, `title_source`, `title_clean`, `title_clean_method`, `title_clean_rules`; HFEP stage `title_raw`, `normalizations` | Explain cleanup and distinguish observed wording from interpretation | Cleanup is not an estimate of OCR accuracy. Unchanged text can still contain errors |
| Explicit geographic language | `location.evidence`: title candidates, barangay markers, locality syntax, enumerations, parenthetical handling and resolution rules | Support a specific locality assertion and explain how it was read | A road name, facility name or parenthetical endpoint can mention a place without asserting the site |
| Geographic specificity and alternatives | `location.locations`, their levels/ancestry, `candidate_codes`, `status`, `review_flags` | Describe resolution depth, valid parent chains, remaining alternatives and contradictions | Barangay precision is a resolution level, not proof of correctness. Several locations may be appropriate |
| Printed headings | `structured_localities`, `source_path`, `source_region`, `source_region_psgc_hint` | Corroborate, scope or challenge title interpretation | A regional allocation heading can be administrative rather than physical. Distinguish explicit locality headings from budget organization |
| Implementing office | `implementing_office`, `office_province_hint`, `office_location_candidates`; stage `office_canonical` | Assess administrative consistency and order review suggestions | Office jurisdiction does not establish the project site. Office evidence should stay weaker than an explicit locality or independently supported point |
| Sector, activity and record grain | `agency`, `program`, `subprogram`, `record_kind`, `source_kind`, `zone`, stage `path_labels`/program group | Choose which assessments apply to an allocation, road, facility, bridge or irrigation entry | Current record kinds are not a complete physical-asset taxonomy; infer finer types only with recorded evidence |
| Road chainage and extent | DPWH stage `chainages`, `chainage_incomplete`, `chainage_length_review`; further unit details in `analysis/data/chainage_units_2027.json` | Assess segment completeness, overlap, scope amendments and potential identity | A station number needs a road/route reference to establish geography. Similar chainage on different roads is not a location match |
| Printed and interpreted coordinates | `coordinates_raw`, `coordinate_observations`, `coordinate_interpretation`, `title_coordinate_evidence`, `coordinate_summary`; FMR stage points/segments, normalization rules and image-review metadata | Separate extraction, numeric plausibility, repairs, point roles and segment structure | A parseable coordinate is not necessarily a correct site. A repair requires its own provenance |
| Direct coordinate-to-PSGC results | `data/coordinate_psgc.jsonl.gz`: per-point coordinates, role, `matched`, `chain`, record `agreement`; FMR stage `psgc`/`location_agreement` also retains title comparisons | Assess polygon support, mapping completeness and agreement at each administrative level | Direct-layer `agreement` compares points with one another, not with title locations. Historical polygon hits and current catalog reconciliation are different steps |
| Bridge registry and spatial evidence | `location.evidence` registry entries; `bridge_inventory/data/bridge_project_matches.jsonl.gz`, `bridge_spatial_evidence.jsonl.gz`, `bridge_proximity.jsonl.gz` | Test exact asset identity, title/registry agreement, boundary hits and nearby-edge candidates | An existing bridge point does not establish the full extent of new work. Nearest edges are review candidates, not polygon hits |
| Suggested and promoted hierarchies | `location.suggestions`: support scores, factors, conflicts; `data/applied_suggestions.jsonl.gz`: gate, margin, proposed hierarchy and separate score | Assess alternative interpretations, decisiveness and whether a proposal refines the master assignment | These are derived from the existing wording/context. Promotion is an automated decision, not new independent evidence or human verification |
| Cross-source comparison and membership | `comparison_group_id`, `comparison_stage`; group `partition`, `presence_by_house_reading`, `upstream` match methods, suggestions, scope/repeated-key/strict/corrected statuses | Assess counterpart identity, reading coverage and whether a comparison was performed | An attachment is not certification. House-only, NEP-only and not-compared have different meanings; copied wording is not an independent confirmation |
| Amounts and accounting lineage | `amount_php`, API source amount/unit, `funding_php`, `amount_components_php`; HFEP stage `amounts_php`, `amount_lineage`; source-control audits | Assess unit conversion, component sums, ledger reconciliation and printed discrepancies | Financial reconciliation does not validate geography or prove counterpart identity. A real budget change can coexist with a valid match |
| Legislative district | `legislative_district`: identifier, label, derivation and available reference-assignment metadata; bridge spatial district derivations | Describe the jurisdiction associated with a location under a stated reference | A district derived from that location is not corroboration of the location, or evidence of who proposed or inserted a budget entry |
| Reference authority, date and freshness | Master/processing audits; PSGC summary; bridge boundary/snapshot metadata; domain extraction/normalization audits | Describe reference limitations, edition consistency and reproducibility | Matching hashes establish the checked dependency relationship, not source correctness or complete transitive freshness |

Useful producers are the [processing builder](../scripts/build_processing_dataset.py),
[master enrichment](../scripts/build_master_list.py),
[name parser/scorer](../scripts/locations.py),
[applied-suggestion builder](../scripts/build_applied_suggestions.py),
[coordinate-PSGC builder](../scripts/build_coordinate_psgc.py), and
[bridge evidence guide](../../bridge_inventory/README.md#project-coordinates-districts-and-spatial-psgc-evidence).

## 2. Current availability, measured from retained outputs

This snapshot counts **source observations**, including overlapping sources
and readings. It is not a count of independent sites or independent evidence.
Coordinate coverage means `coordinate_summary.point_count > 0`; heading
coverage means nonempty `structured_localities`. The hierarchy-suggestion column
counts `location.suggestions` in the master ledger; the browser also joins
context-supported review candidates from the interpretation audit’s separate
`review_suggestions` counts.

| Dataset | Observations | With coordinates | With structured locality headings | With hierarchy suggestions | With district reference |
|---|---:|---:|---:|---:|---:|
| DPWH House second | 18,792 | 2,241 | 0 | 406 | 12,146 |
| DPWH House third | 18,797 | 2,241 | 0 | 406 | 12,146 |
| DPWH NEP API | 11,372 | 617 | 0 | 288 | 7,883 |
| DPWH NEP PDF | 11,420 | 609 | 0 | 291 | 7,870 |
| FMR House | 964 | 964 | 0 | 38 | 937 |
| FMR NEP | 704 | 704 | 0 | 25 | 680 |
| HFEP House | 513 | 0 | 513 | 7 | 112 |
| HFEP NEP | 464 | 0 | 464 | 3 | 70 |
| NIA House | 828 | 1 | 0 | 0 | 27 |
| NIA NEP | 791 | 1 | 0 | 0 | 12 |
| Total | 64,645 | 7,378 | 977 | 1,464 | 41,883 |

Other measurable context:

- Source-region text is present on 63,026 observations; implementing-office
  text on 60,379. Those are field-availability counts, not evidence weights.
- Readable cleanup changes 270 source titles, all in the DPWH NEP PDF ledger.
  Nonempty source flags occur on 73 observations; their absence is not a
  certificate of error-free extraction.
- The 20,321 comparison groups cover 59,601 observations. Another 5,044
  GAS/S2O observations remain outside comparison. All 5,850 allocation-without-
  site observations need an applicability decision before geographic scoring.
- DPWH has 15,813 stage entries with chainages, 516 marked incomplete and
  10 with a length-review value. These are counts over 55,331 populated
  comparison stages, not over unique projects or source observations.
  Six DPWH stages have multiple source members; keep their aggregate
  annotations at stage level. Of the 59,601 compared observations, 59,589
  have an individual `analysis_record`.
- All 1,668 FMR stage entries retain points, segments and PSGC results;
  176 have normalization rules and 23 have image-review metadata. HFEP has
  977 stage entries with funding components, including 88 with nonempty
  amount lineage and two with normalization entries.
- FMR's 609 pairs use title plus coordinates (555), coordinates (53), or
  title (one). HFEP retains 341 title-similarity candidate pairs. NIA retains
  606 `ai_corrected` pairs, including 97 with `strict_status = split_pair`.
  Those methods should remain distinct in any identity assessment.

These figures were read from `data/projects.jsonl.gz`, the processing groups,
and the [applied-suggestion](../data/applied_suggestions_audit.json) and
[coordinate-PSGC](../data/coordinate_psgc_audit.json) audits. The
[processing contract](PROCESSING_DATASET.md) documents the record grains.

### Existing derived layers need careful interpretation

The coordinate layer covers 7,378 observations and 10,060 point occurrences.
It reports 9,965 resolved and 95 unresolved occurrences. Its record summaries
are 6,544 `single_barangay`, 620 `single_municipality`, 144
`spans_municipalities`, and 70 `none_resolved`.

However, the builder calls a point matched when it has a non-null chain.
In 66 observations, at least one returned chain contains an unnamed level;
13 observations mix matched and unmatched points. Nine observations repeat a
coordinate pair under their point occurrences. A profile should expose named
catalog resolution and per-point completeness, retain roles, and distinguish
repeated representations from independent measurements. `single_barangay`
alone does not prove that every point is resolved, that all chain levels are
mapped, or that the title agrees with that barangay.

The coordinate audit currently pins its input processing observations and output,
but does not record boundary-file, catalog, mapper or builder hashes. Those
dependencies need explicit provenance before that dimension can claim
reproducible reference freshness. Reuse the retained layer for assessment
while identifying that limit; its current input and output hashes match.

The applied-suggestion layer promotes 90 of 1,464 suggestion-bearing
observations. All 90 have the same application score, **11**, because the
builder emits the same base/mention/town factors for every promoted row.
That score identifies a gate-passing class; it does not distinguish their
relative reliability. Keep original support, margin, conflicts and gate
decisions visible. A missing runner-up and a measured score margin are also
different kinds of decisiveness.

The browser hierarchy-review cards now consume the interpretation profiles
as well as the legacy numeric title suggestions. They expose each context
separately, including mapped-coordinate and registry candidates. The
experimental candidate total now retains its dimension vector and trial
checks. Unmarked parent-chain hypotheses are review-only; see the
[connected suggestion contract](LOCATION_INTERPRETATIONS.md#connected-hierarchy-suggestions).

## 3. Proposed dimensions

Separate measured descriptors from assessable support. Geographic depth,
number of point occurrences and record scope are descriptors; they need not
be turned into confidence scores.

| Dimension | Question answered | Useful inputs | Initial output |
|---|---|---|---|
| Source fidelity and traceability | Can we trace this wording/amount, and what transformations or review support it? | Source pages/cells, raw/clean text, repairs, source flags, audit lineage, recorded image review | Citation availability, transformation history, review coverage and reference freshness; no inferred OCR accuracy |
| Geographic identification | Which place assertions are supported by the wording, and which alternatives remain? | Explicit markers, candidate sets, location ancestry, suggestions, unmatched mentions | Supported assertions, specificity, candidate ambiguity and named-place coverage |
| Context and hierarchy agreement | Do the asserted places and printed context fit together? | PSGC parent links, title province, structured headings, source region, office context | Agreement/conflict by level and context type; keep office context separate |
| Spatial support | What do the actual points support, and does that agree with the text? | Coordinate origin/repairs/roles, polygon chains, FMR verdicts, bridge points, boundary vintage | Numeric/parse status, mapping completeness, title–point agreement by administrative level and extent compatibility |
| Counterpart identity and scope | How well supported is the NEP/House or registry attachment? | Comparison method, repeated keys, fuzzy candidates, chainage/geometry correspondence, exact asset IDs, strict/corrected status | Link assessment with alternatives and scope qualifications; separate project counterpart and asset-identity links |
| Financial consistency | Do units, components and source controls reconcile at the applicable grain? | PHP conversion, funding columns, stage/member sums, source audits and printed gaps | Row/stage/source checks, known discrepancies and budget movement; no geographic bonus |

Sector/record type, location precision, geographic extent, source edition and
assessment applicability accompany these six dimensions as context. Human
review should be a separate provenance-bearing observation: what was checked,
by whom, when, against which evidence and for which assertion. The current
outputs do not provide one uniform human-review collection across all domains.

For assessable claims, initially use explicit states such as `supported`,
`mixed`, `conflicting`, `insufficient_evidence`, `not_assessed`, and
`not_applicable`. Define the predicates per dimension before implementing
them. Missing GPS is insufficient spatial evidence, not a contradiction;
an allocation with no site assertion has a different applicability state.
If GPS exists but has not been compared with the title, agreement is
`not_assessed`, even when every point has a polygon result.

## 4. Assess explicit assertions at the right level

An assessment needs a target. For example, “this observation names municipality
M” is different from “the work is entirely inside barangay B.” Store the
target observation, candidate/assigned place, administrative level and source
edition. Record both supporting and conflicting items, with a method and
dependency references.

Distinguish title interpretation, spatial location and recommended assignment.
A named municipality can be clear in the PDF while printed coordinates point
elsewhere. That yields strong identification of the printed claim and a
spatial conflict; averaging those findings would hide the source discrepancy.
A province can be well supported even when its municipality is ambiguous.

For a road or other multi-place entry, assess each place assertion and point
role, then summarize coverage. One correctly resolved barangay does not make
the whole title resolved. A multi-town corridor is not inherently a conflict;
compare its expected extent with the point evidence. Endpoints alone do not
establish the complete route, and no synthetic route should be treated as a
printed or surveyed alignment.

An illustrative shape, **not an implemented schema**, is:

```json
{
  "record_id": "<source observation ID>",
  "assessment_method": "<proposed profile version>",
  "context": {"extent": "multi_place", "record_kind": "project"},
  "assertions": [
    {
      "target": {"kind": "printed_locality", "level": "municipality", "psgc_code": "<catalog code>"},
      "identification": {"state": "supported", "evidence_ids": ["title-locality"]},
      "spatial_agreement": {"state": "not_assessed", "evidence_ids": []}
    }
  ],
  "dependencies": {"master_sha256": "<hash>", "catalog_sha256": "<hash>"}
}
```

## 5. Dependencies and contradictions

Evidence should carry its source observation, field/span or point, producer,
method/version and input references. Then reuse can be recognized:

- An explicit barangay marker and a coherent parent chain can both explain
  a reading of one title. They are distinct cues from the same text, not two
  independent source confirmations.
- Original text, cleaned text, parser suggestions and an applied suggestion
  are a transformation chain. Reprocessing does not create a second witness.
- A coordinate, its polygon chain and the district derived from that chain
  share a dependency. Title–point agreement can be useful corroboration;
  the derived hierarchy and district do not add two further observations.
- FMR already uses coordinates for many counterpart links. The existence of
  that link cannot then independently corroborate the same coordinates.
- Identical annex copies or repeated House wording can establish edition
  consistency without providing independent confirmation of a site.
- A registry can provide additional asset evidence, but its ID, coordinates,
  inventory labels and spatial products should remain linked to that asset's
  snapshot and stated reference lineage.

Support and contradiction should remain visible together. An exact bridge ID
can support asset identity while title geography conflicts with the inventory
point. Neither a balanced ledger nor a large number of weaker context cues
should erase that conflict. Freshness, spatial ambiguity and known reference
limitations need their own states rather than an unexplained numeric penalty.

## 6. Human-readable profiles and task-specific use

These are illustrative interpretations, not labels assigned to current rows:

| Situation | Profile | Useful next action |
|---|---|---|
| One explicit barangay/town/province chain, no GPS | Clear geographic wording and coherent hierarchy; spatial evidence unavailable | Retain provisional textual assignment; seek independent spatial evidence only if required by the task |
| Several explicit towns along a road, points in several municipalities | Multi-place description; assess each claim and endpoint; cross-town points can be compatible with extent | Inspect route/segment correspondence and unresolved place mentions |
| Explicit title locality, parsed points in another province | Printed claim identifiable; spatial agreement conflicting | Review source fragments and normalization/point roles; preserve both findings |
| Exact bridge ID, title locality conflicts with registry | Asset-link support present; geographic conflict remains | Review inventory snapshot and project scope without overriding the printed title silently |
| Detailed facility name with repeated locality homonyms, no GPS | Source traceable, location ambiguity remains; identity may still have a candidate counterpart | Review locality headings and facility registry candidates |
| GAS/S2O allocation outside operations comparison | Site assessment not applicable to this record; counterpart matching not performed | Evaluate ledger/scope consistency without penalizing absent GPS |

Browsing can then offer context-based filters: “text clear but spatially
conflicting,” “coordinates mapped but title comparison not assessed,”
“unresolved named barangays,” or “counterpart link requires scope review.”
For a location map, select explicit assignment/geometry conditions. For budget
comparison, select identity and compatible-scope conditions. For a review
queue, prioritize contradictions, uncovered claims and interpretation changes.
Those are different tasks and should not share an unexplained universal rank.

If numeric dimension scores are later introduced, define their target,
applicability, evidence dependencies and calibration separately. Missing
dimensions should remain missing. Any task-specific composite would need
stated weights and conflict rules, with its component profile still visible.

## 7. Suggested implementation sequence

1. Materialize an evidence inventory from existing master/group/derived
   layers, keyed by source observation or specific link. Preserve citations,
   producer dependencies, applicable record type and reference vintages.
2. Add structured assessments for named-place coverage, hierarchy/context
   agreement, coordinate mapping completeness and title–point agreement.
   Keep candidate interpretation and proposed assignment distinct. Strengthen
   coordinate/reference provenance and reconcile historical codes explicitly.
3. Produce a separate assessment-profile artifact that reads existing layers
   without rewriting them. Keep `location.score` and both existing suggestion
   scores under their current method names during the transition. Share raw
   evidence IDs across dimensions so reuse is visible.
4. Add browser columns/filters and an expandable evidence profile. Show
   unknown/not-applicable states, conflicts, precision and extent. Retain
   existing source observations, per-stage amounts and review alternatives.
5. Review a stratified sample across datasets, record kinds and dimension
   combinations. Label the target claims separately; evaluate both correctness
   and coverage. Only then consider numerical dimension scores, thresholds
   or task-specific rankings.

The immediate deliverable is this inventory and candidate assessment model.
Weights and automatic assignment-policy changes require a subsequent,
documented design decision and evaluation. See the
[current scoring rules](SCORING_RULES.md),
[location work log and roadmap](LOCATION_CONFIDENCE_AND_ROADMAP.md), and
[suite provenance map](../../analysis/docs/data_provenance_map.md) for the
existing implementation and source limitations.
