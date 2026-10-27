# Location interpretations from multiple contexts

**Method:** `location_interpretations_v6`.
**Status:** implemented location-focused evidence profile. Master
assignments and `location_evidence_v6.5` scores remain separately retained.

The catalog defines each candidate's actual administrative parents. Printed
province, region, office, title and coordinate context are assessed against
that chain rather than used to discard it. A conflicting printed province can
therefore coexist with a candidate supported by a named barangay and town.

The separate [cleaned observation consumer](CLEANED_DATASET.md) now selects
eligible trial proposals provisionally, with their scope and existing scores,
and generates compact clarification questions. This profile and the current
viewer continue to preserve original master assignments and assessments.
The viewer now exposes provisional selections and clarification questions
in a separate **Cleaned data** tab, with full interpretation evidence on demand.

## Readings and candidate retention

The builder reads the master observations, their validated processing release,
the coordinate-PSGC layer and the retained PSGC catalog. It materializes:

- The current master assignment for the whole record.
- A title-only reading using the existing name parser with no heading,
  source-region or office hints. This helps expose context-sensitive results.
- Candidate parent-chain readings for individual mentions, including existing
  hierarchy suggestions and unmarked comma components that can name a
  barangay under another named town. These are mention-level alternatives,
  not claims to have resolved the complete title.

Every catalog-valid candidate in the original title/barangay/heading evidence
is retained, together with master-selected and suggested locations. A
mapped coordinate or registry chain also contributes a candidate, including
when the title supplies no locality reading. An
unmarked barangay alternative requires a separately named parent town.
Unqualified road/facility names and parenthetical references retain their
reference-only status. Office context alone creates no site candidate.

This version combines existing parsing with alternative name roles and
parent chains. It is not an exhaustive grammar parser or a calibrated winner
selection algorithm. The title-only run is another interpretation of the same
wording, not an independent source confirmation.

## Connected hierarchy suggestions

Version 2 shares compact, missing-comma barangay/parent readings with the
master matcher. The review reader retains contradictory province interpretations;
master assignment still requires the complete coherent ordered chain.
Unmarked title hypotheses remain explicitly review-only in
`hierarchy_candidate_v6`.

`review_suggestion_codes` identifies candidates for the browser's existing
**Suggested hierarchies for review** section. It includes unassigned asserted
locality readings supported by named parents or other applicable context,
coordinate-derived chains, registry chains and old title suggestions.
Unscoped barangay homonyms stay in the full profile; they require a named
parent, specific locality heading, GPS or registry support to become review
suggestions. Town readings can also use printed-province, region or office
agreement. These checks retain candidates with contradictory dimensions;
they are an inclusion policy, not a confidence ranking. It uses all assessed candidates, before the eight-card preview.
Already selected locations and their explained ancestors need no new context
suggestion. Reference-only mentions remain available in the interpretation
profile without becoming suggested sites; office context alone creates none.

Current review counts are in [the generated report](../data/LOCATION_INTERPRETATIONS_REPORT.md)
and audit. They include overlapping source observations and readings.

The browser joins the separate assessments below onto each review card.
Legacy title support stays a title score, with its factors visible. Candidate
profiles carry experimental [candidate support scoring](CONTEXT_SCORING.md), method
`context_evidence_v3`, with text, spatial, context and registry components.
Unassessed dimensions remain explicit. Scored candidates carry separate trial
checks, blockers and warnings; a positive total does not bypass those checks.
These review cards and dry-run proposals do not replace master assignments
or change the existing applied-suggestion layer. The full interpretation JSONL
retains each candidate's evidence and assessment.

The profile includes `location_assessments_v2` quality and scope descriptors for scored
candidates, source/normalization provenance, per-level hierarchy evidence and
an alternatives summary. The browser exposes these through the score cards,
with review, partial-scope and competing-candidate filters. Positive and
negative numeric contributions remain separately inspectable. The numeric
weights stay unchanged; recorded coordinate review flags and inconsistent
point counts now explicitly block a GPS trial. See
[the complete assessment contract](CONTEXT_SCORING.md#evidence-quality-and-scope-fit).

Version 6 adds `office_context_v1`: provenance-preserving office labels,
exact DEO aliases, and province/city/multi-city administrative name
associations. These can scope an existing asserted title candidate into the
review collection, including a barangay without a named municipality or GPS.
Office-only site generation remains prohibited. Broad regional labels,
ambiguous names and conflicting source labels add no office points.
Legislative district fields and district crosswalks are excluded. See
[DEO context](CONTEXT_SCORING.md#deo-and-implementing-office-context).

## Province-supported reviews without a readable municipality

Version 3 consumes `hierarchy_candidate_v6` province/office-supported
barangay suggestions. An explicit barangay name can generate review chains
under the printed province or an unambiguous office-province hint when no
named-parent candidate fits. The office supports those existing exact-name
candidates; it does not supply a project-site name or automatic assignment.
Unmatched locality text has no scoring effect.

In `Barangay Bagacay, San Jose-Partido, Camarines Sur Sta. 0+706 - Sta. 1+256`,
the station range no longer masks the printed province. Bagacay candidates
in Libmanan, San Jose and Tinambac receive equal support from the printed
province, Region V and the retained Camarines Sur engineering office.
`San Jose-Partido` is left unmatched. All three candidates are review-only;
none earns a named-parent-town factor.

## Separate assessments for each candidate

| Field | Assessment |
|---|---|
| `title` | Asserted locality reading, reference-only mention, or no textual support assessed |
| `named_parent` | Whether another asserted town/city mention names the candidate barangay's parent |
| `printed_province` | Agreement/conflict with printed province candidates, unassessed, or no administrative province parent |
| `region` | Agreement/conflict with recognizable source-region context; neither removes the candidate |
| `headings` | Whether explicit locality-heading candidates overlap the chain |
| `office_context` | Administrative province context only, without assigning the office's locality as the site |
| `registry` | Agreement/conflict with retained registry candidate chains already present in the master evidence |
| `spatial` | Separate comparisons at region, province, municipality/city, submunicipality and barangay levels |

Candidate chains always use the catalog's actual parent links. City and
municipality share a comparison tier; submunicipalities remain separate.
Independent cities keep their province-free hierarchy. A printed surrounding
province is not manufactured into an administrative parent. Printed province
homonyms can retain several possible roles; agreement with one is a possible
interpretation, not proof that the source intended it.

Spatial comparisons report agreeing, comparable and unassessed point
occurrences. Only named, catalog-resolved, internally consistent returned
chains contribute. Ancestors are rebuilt from those catalog units. Unknown
codes and conflicting returned units remain unassessed. A candidate has no
spatial assessment where no comparable points exist.

Mixed per-candidate point results can be expected for multi-place work. The
record-level spatial diagnostic checks the complete master textual scope:
a point must fall outside all selected places at a comparable tier before
that scope is flagged. Partial mapping remains visible. Point occurrences
are coverage descriptors, not independent votes, surveyed accuracy or a
complete road alignment.

## Outputs and browser

| File under `data/` | Contents |
|---|---|
| `location_interpretations.jsonl.gz` | One profile per master observation, all retained candidates, mention references, reading scopes and assessments |
| `location_interpretations_audit.json` | Method, exact input/code/output hashes, observation states and candidate counts by dataset |
| `LOCATION_INTERPRETATIONS_REPORT.md` | Coverage and diagnostic counts |

Profile states are `alternatives`, `single_reading`, `unresolved`, and
`not_applicable`. `alternatives` means additional candidate codes exist beyond
the master selection, including reference-only names. It does not itself
mean the asserted site is ambiguous. Allocation records have no project-site
profile. `has_conflict` flags a printed-province contradiction for a selected
or parent-supported textual candidate, or a spatial disagreement with the
selected textual scope. These diagnostics are review prompts, not established
source errors.

The browser provides a **Location interpretations** filter. Each source row
has expandable **Location interpretations** details showing current versus
title-only readings and a preview of eight candidate profiles, with catalog
ancestry, wording and contextual/spatial assessments. All candidates are
retained in the full downloadable JSONL; preview omissions are stated.
Existing group filters select through individual observations and expansion
continues to show every group member. CSV exports add method, state, candidate
count and context-conflict columns.

The offline HTML embeds gzip-compressed JSON packets, with at most 256 source
rows or groups per packet. The browser decodes these incrementally, keeping
the expanded evidence payload below single-string loading limits while
retaining offline operation. The payload regression check verifies complete
record/group counts and all source amounts after decoding.

Viewer manifest schema 7 uses `psgc_code_references_v1`: each row stores its
candidate assessments once in `scoreAssessments`, keyed by PSGC code. Score
summaries, suggestions and candidate previews reference those entries; the
loader restores shared objects before rendering. The incremental decoder
collects fragments per packet without repeatedly rescanning growing strings.
This reduces memory during large file/HTTP loads. The full interpretation
JSONL, CSV fields and record-detail JSON still retain complete assessments.

## Full record details

The **Record details** column provides a **View data** button for every source
observation, including nested group members. Its modal includes the actual
source region and office, structured headings, original/readable titles,
source PDF/page and extraction rows, all master candidates/suggestions and
score factors, coordinate evidence, legislative reference, and the complete
retained upstream `analysis_record`. Chainage and normalization appear when
supplied by that record; absent fields are not synthesized.

The modal also includes the complete interpretation profile and candidate
names/parent chains, the applied-suggestion and coordinate-PSGC rows, and the
comparison group's stage evidence. **Download record JSON** exports the whole
bundle. The modal's candidate collection is not truncated to the table's
eight-candidate preview. Long sections expand into scrollable text.

Companion scripts in `data/record_details/` load on demand in bounded packets
(maximum 64 observations; normally at most 4 MiB before compression). Only two
decoded packets are cached. This keeps the initial standalone list and
filtering independent of the full detail payload. HTTP and offline `file://`
inspection are supported; offline modal use needs the companion folder next
to the HTML. Missing packets produce a visible error rather than partial data.
Every packet's hash and the packet/record counts are recorded in
`viewer_manifest.json`. CSV also exposes source region, implementing office,
structured headings and the parsed region/office province hints. Office and
region text are searchable in the browser.

## Rebuild and validation

With processing, master and coordinate evidence already current:

```sh
python3 master_list/scripts/build_location_interpretations.py
python3 master_list/scripts/build_location_interpretations.py --check
python3 master_list/scripts/build_cleaned_dataset.py
python3 master_list/scripts/build_viewer.py
python3 -m unittest master_list.tests.test_location_interpretations -v
```

The complete `npm run build:master-list --prefix analysis/web` chain regenerates
the dependent layers in order, including coordinate mapping and applied
suggestions. Coordinate regeneration needs the existing local geomapper and
boundary files described in its builder. Retained coordinate evidence can be
consumed without loading those geospatial dependencies.

The interpretation builder verifies master/coordinate output hashes and their
processing-release linkage. Its audit pins the actual coordinate artifact and
catalog consumed. The upstream coordinate audit does not yet pin its boundary
files, catalog and mapper code, so transitive coordinate-reference freshness
remains `not_assessed`. The new profile does not certify that missing lineage.

Regression cases cover conflicting province/region context, town/barangay
homonyms, independent cities, parenthetical references, office-only context,
partial/contradictory point mapping, multi-town extents and allocation
applicability. Integration checks preserve every original candidate and source
observation. Assess accuracy and calibrate the experimental candidate weights
on reviewed ambiguous cases before introducing new assignment policies; see the
[multidimensional assessment proposal](MULTIDIMENSIONAL_SCORING.md).
