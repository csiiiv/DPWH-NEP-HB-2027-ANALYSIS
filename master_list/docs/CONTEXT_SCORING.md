# Candidate support scores and trial proposals

**Method:** `context_evidence_v3` · **Profile:** `location_interpretations_v6`
**Qualitative method:** `location_assessments_v2` · **Status:** experimental
scoring, quality/scope assessments and dry-run proposals, 2026-10-26.
**Canonical rules:** [context_scoring.py](../scripts/context_scoring.py);
weights and trial counts are also in `data/location_interpretations_audit.json`.

The separate [cleaned release](CLEANED_DATASET.md) now consumes these trial
proposals for provisional, scope-aware selection and emits conservative
clarification questions using the [review contract](REVIEW_DATA_CONTRACT.md).
Those questions are separate from this layer's technical blockers and warnings.
The scoring producer retains its existing behavior. The viewer's **Source data**
tab preserves original scores; **Cleaned data** shows selected provisional
locations and their own existing candidate support, with clarification filters
and exact evidence links. Selecting a candidate adds no points.

The master `location.score` measures the existing text/registry interpretation.
It does not score the coordinate-to-PSGC layer. A zero master score can therefore
coexist with useful mapped coordinates. Candidate support adds a separate
assessment of those observations and explains whether they pass trial checks.
It changes neither master assignments nor the existing applied-suggestion data.

The retained build preserves **64,645 source observations**. Candidate counts,
trial-ready totals and qualitative review counts are published
in `data/LOCATION_INTERPRETATIONS_REPORT.md` and the interpretation audit.
These are overlapping source observations, not unique project sites.
Review categories can overlap. Coordinate-quality checks and administrative
office assessments are separately visible; no assignments are changed.
The older applied-suggestion layer remains unchanged; passing its original
gate does not guarantee passing these additional checks.

## Example: Marikina Polytechnic College

`Completion of Marikina Polytechnic College Food Service Management Building,
14.631294932063263, 121.09832624342637` appears in observations
`dpwh_house_second:c12744` and `dpwh_house_third:c12749`.

| Assessment | Result |
|---|---|
| Master score | **0**: the title reader treats Marikina as part of the institution name, without an asserted locality |
| Candidate | Santa Elena, City of Marikina, NCR · `1380700009` |
| Text | **0**: no asserted locality reading for Santa Elena |
| Spatial | **6**: the one valid mapped point agrees at barangay level |
| Context | **1**: source region agrees with NCR |
| Registry | **Not assessed** |
| Candidate support | **7** |
| Evidence quality | **Partial**: coordinate parsed and source page retained; coordinate-reference freshness and positional accuracy unassessed |
| Scope fit | **Supported for the observed point**; full project extent unassessed |
| Hierarchy | Point agrees at barangay, city and region levels; these are not additional spatial votes |
| Trial proposal | Santa Elena, limited to the **observed coordinate points**; not applied |

The implementing office, Metro Manila 1st District Engineering Office, is
administrative context. Its name does not establish a project site in Manila.
Coordinate decimal precision adds no points. The two House observations are
scored separately; they do not provide two independent confirmations.

## Dimensions and weights

Only master-selected candidates and candidates admitted to
`review_suggestion_codes` receive numeric assessments. Other retained names
and national homonyms remain available without a numeric score. An omitted
assessment means unassessed, rather than zero support.

| Dimension | Evidence | Points |
|---|---|---:|
| Text | Asserted title locality | +4 |
| Text | Named parent agrees | +3 |
| Spatial | All points agree at the candidate's own level: barangay / town / province / region | +6 / +4 / +2 / +1 |
| Context | Printed province agrees / conflicts or mixed | +2 / −4 |
| Context | Source region agrees / conflicts or mixed | +1 / −2 |
| Context | Locality headings agree / conflict or mixed | +2 / −2 |
| Context | Resolved office province/city association agrees / conflicts | +1 / −1 |
| Registry | Candidate from registry or assessed agreement / conflict or mixed | +4 / −4 |

Submunicipalities use the town spatial weight. Conflicting registry context
takes precedence over the candidate's registry origin. Missing spatial,
context or registry evidence stays JSON `null`, displayed as **—**. Text starts
at zero when no applicable title support was assessed.

Spatial points are awarded once at the candidate's own administrative level.
Agreeing barangay, city and region ancestors are not three spatial votes.
Repeated point occurrences do not increase the weight. Partial mapping with
agreement among comparable points receives half the spatial weight and fails
the trial gate. Mixed or conflicting point results at the candidate's level
receive zero spatial points. Invalid coordinate numbers cannot earn spatial
points. Coverage and per-level assessments remain visible in the profile.

`support_score` is the sum of the assessed dimensions; negative totals are
possible. These provisional weights have not been calibrated against a
reviewed sample. The total is neither a probability nor an accuracy estimate.
Context fields may share a source, so their sum does not count independent
confirmations. A high total cannot override an application blocker.

Legacy `hierarchy_candidate_v6` support and `location_evidence_v6.5` master
scores have different rules. Compare candidates under the same method,
rather than comparing their numbers across methods.

## Evidence quality and scope fit

Version 2 keeps the four numeric component weights unchanged and adds two
qualitative assessments. Neither adds points or converts the total into a
confidence percentage. Both are retained under each `score_assessment`.

| Assessment | Retained details | Interpretation |
|---|---|---|
| `evidence_quality` | Source PDF/page or snapshot reference, readable-title cleanup, coordinate extraction origin/status, normalization rules, review flags, mapping coverage, recorded image review and reference freshness | A source reference permits inspection; it does not certify source/OCR accuracy. A parsed coordinate is not surveyed accuracy. Recorded image review is not inferred approval |
| `scope_fit` | Claim scope, candidate-level point coverage, point roles, unique versus repeated coordinate pairs, title-scope compatibility and extent limitations | A mapped point supports its point locality. Endpoints do not establish the intervening alignment or full project extent. Partial coverage remains partial |

Coordinate quality states are `parsed`, `normalized`, `partial`,
`requires_review` and `not_assessed`. Mapping must reconcile to catalog units;
a returned chain alone is insufficient. Original review flags and point
issues are retained. Declared/source point counts that disagree with the
mapped collection produce a review flag, preventing a missing point from
being presented as complete coverage.

The overall evidence-quality state is `requires_review`, `partial` or
`recorded_evidence`. It summarizes available provenance and limitations rather
than grading truth. `recorded_evidence` still leaves source/OCR accuracy
unassessed. A normalized coordinate or missing reference lineage remains
qualified even when its numeric support is positive.

Scope-fit states are `supported`, `partial`, `conflicts`, `requires_review`
and `not_assessed`. They apply to the stated `claim_scope`: observed coordinate
points, a title-locality claim or a registry asset location. Full project
extent remains `not_assessed`; this layer does not reconstruct route geometry
or certify a facility footprint. Several observed locations can be appropriate.

## Stronger component explanations

`dimension_details` complements the four numeric scores:

- Text retains explicit barangay markers, parser locality readings, inferred
  parent-chain readings and reference-only mentions as distinct roles. The
  role belongs to that candidate's mentions; an ancestor's reference does not
  become a textual assertion of its barangay.
- Spatial retains the candidate's scoring level, comparable/unassessed point
  occurrences and roles. Repeated coordinate pairs are counted for coverage,
  while their unique count shows that they are not independent observations.
- Context exposes province, source region, locality headings and office
  agreement separately.
- Registry separates **asset identity** from **location agreement**. An exact
  ID is reported only when the retained evidence explicitly records it.
  Candidate geography without that evidence is an `unassessed_link`.
  Exact asset identity can coexist with a geographic conflict. The original
  registry numeric weights remain experimental; no new name/proximity
  attachment or registry application route is introduced.

`support_balance` retains positive and negative numeric contributions
separately per component. A net zero from opposing contributions differs
from an unassessed component. Spatial conflicts currently earn zero spatial
points; their qualitative state remains visible despite having no negative
numeric contribution.

## Hierarchy resolution and alternatives

Each scored candidate carries a `resolution` list for region, province,
city/municipality, submunicipality and barangay. It retains the candidate's
catalog unit and separate text, point, context and registry assessments at
each level. A city can be supported while its barangay has mixed point
results. A missing more-specific unit stays unassessed; an absent province
parent for an independent city is not forced into the chain. Catalog ancestry
alone never constitutes support or earns points.

Possible title readings retain their ambiguity. A national homonym pool
containing the candidate can be a possible reading without being a resolved
textual identification. Mixed or conflicting assessments remain review
diagnostics, not certified errors or reasons to discard the candidate.

Record-level `context_scoring.ambiguity` counts **scored selected/review
candidates** at each level, rather than all unscoped names in the full profile.
It distinguishes `single_candidate`, `competing_candidates` and
`multiple_locations`. Multiple units already in the selected scope or covered
by mapped points are recorded as multiple locations; other alternatives
remain competing candidates. Equal best totals are recorded as ties.
The stable best-candidate display order does not resolve those ties.

## DEO and implementing-office context

`office_context_v1` resolves administrative office labels into province/city
**name associations**, not verified service-area boundaries. Source fields
`implementing_office`, `DEO`, `deo` and `district_engineering_office` are retained
at record, source and analysis-record level. Analysis `office` and
`office_canonical` are also retained. Each value keeps its field path, original
label, readable cleanup, normalized key and any exact codebook match.

The only new reference is
`DEO2LEG/sources/dpwh-project-code-mapping@38fe1cf2.json`: office names and
regional metadata, pinned in the interpretation audit. The legislative
crosswalk, district polygons and representative data are not read by this
resolver. Archived office/region metadata is not asserted to describe current
jurisdiction boundaries. A regional mismatch with current PSGC ancestry is
reported without moving or discarding the named place.

Name resolution handles `DEO` versus `District Engineering Office`, written
ordinals, enumeration prefixes, punctuation and conservative readable-title
repairs such as split `ñ`. There is no fuzzy office matching. An explicit city
name remains a city association; a bare province name in a DEO label remains
a province association, including names shared with cities. Generic ambiguous
office labels retain their alternatives without earning an office point.
Catalog-derived aliases also recognize reversed `Oriental`/`Occidental`
province wording and `Mt.` for `Mountain`. The raw label and each geographic
alias remain in the evidence. Nested catalog units sharing the same city name
can supply one encompassing administrative association rather than rival
office locations; this does not alter the site-candidate catalog.

Examples:

| Source label | Administrative context |
|---|---|
| `Iloilo 1st DEO` | Iloilo province association |
| `Iloilo City District Engineering Office` | City of Iloilo association |
| `Mindoro Oriental DEO` / `Mt. Province DEO` | Oriental Mindoro / Mountain Province name associations |
| `Las Piñas-Muntinlupa DEO` | Both named cities retained; neither is chosen as the project site |
| `Metro Manila 1st DEO` | Broad NCR context; no Manila City inference and no additional office point |
| `Central Office` / `Regional Office IVA` | Central/broad regional context; no specific-site hint |

Multiple equivalent source fields earn **at most one office contribution**:
agreement +1, conflict −1, using the existing numeric weights. Disagreeing
source office labels retain all values, produce `source_conflict`, and supply
no office points. Ambiguous or unknown labels remain reviewable. A province
association does not impose a province parent on an independent city.

An asserted title locality, including an explicit barangay, can enter the
review collection when it fits a resolved office province/city association.
This is especially useful without coordinates or a readable municipality.
The candidate must already come from title evidence; the office creates no
site candidate on its own. Competing hierarchies remain visible, and this
inclusion does not bypass the application gate. Office disagreement is a weak
context penalty/review note rather than a verified boundary violation.

Record-level office evidence is in `context.office`; each scored candidate's
comparison is in `dimension_details.office`. The viewer exposes both through
**DEO / implementing office** disclosures and the full-record modal. The
**DEO / office context requires review** filter selects unresolved, ambiguous
or conflicting labels and disagreements among scored candidates.
CSV adds `office_context_evidence` and `candidate_office_context` JSON columns.
The original master `office_province_hint` remains a separately retained
legacy field and can differ from this newer assessment.

Legislative districts remain outside candidate generation and scoring.
`CONG_DIST` and existing derived district metadata do not affect this layer.
The intended direction is **source evidence → candidate PSGC locations →
possible later legislative-district derivation**, including records without
coordinates. This implementation performs no new district derivation.

## Trial eligibility is separate from the total

Each scored candidate retains factors plus an `application` object containing
its route, blockers, warnings, scope, `eligible_for_trial` and
`automatic_application: false`. No total-score threshold grants eligibility.

For the **mapped coordinates** route, trial eligibility requires parsed or
normalized coordinates, finite latitude/longitude in range, complete
catalog-resolved mapping, and agreement of every point at the proposed
candidate's level. Recorded coordinate issues, upstream coordinate review
flags and inconsistent point counts block the trial through
`coordinate_quality_requires_review`. Normalized
coordinates carry a review warning. A successful route proposes only the
locality of the observed points: it does not establish the full extent of a
road, bridge or other work.

Shared checks block conflicting or mixed province, region, locality-heading
or registry assessments. Asserted title mentions must have at least one
compatible interpretation in their candidate pool; national homonyms need
not all fit. Independent-city province association is retained as a warning
rather than forced parentage. A new candidate cannot coarsen or replace an
incompatible master scope, or contradict the existing title application.
An office mismatch remains a weak penalty and warning for the GPS route.

The **existing title gate** route reuses the existing support, margin,
named-parent and refinement checks, then applies the shared checks above.
Province-only barangay fallback suggestions remain review-only. A new
**registry review** route is retained but blocked pending a separate policy;
registry support alone does not create a new application rule.

When eligible candidates form one compatible ancestor/descendant chain, the
trial proposes the deepest candidate. Rival eligible chains produce
`ambiguous_trial_candidates`; the numeric total does not choose a winner.
The best score shown for sorting can belong to a blocked candidate and is
distinct from the eligible proposal.

Coordinate-reference freshness is still `not_assessed`: the upstream mapper
audit does not pin all boundary/catalog/code inputs. Every GPS trial carries
that warning. Passing this experimental gate is a review aid, not approval
for production assignment. Review representative successes, conflicts,
partial mappings and multi-place work before changing the application policy.

## Browser and exports

The browser keeps **Master score** and **Candidate support** separate. Candidate
support displays the best candidate's dimension vector; each suggestion's
score disclosure contains its factors, blockers and warnings. The best
candidate's name and code appear beside its total. **Evidence quality, scope
and hierarchy** expands the qualitative assessments and per-level evidence;
**Location alternatives** shows competing versus multiple-place readings.
A **Trial proposal · not applied** card shows the proposed locality and scope.
**Ready for trial proposal** in the Location interpretations filter selects
eligible observations. Candidate support can be sorted in observation views;
unassessed values sort last in either direction.

The same filter also provides **Evidence requires review**, **Partial point
coverage / scope** and **Competing location candidates**. These operate on
any scored candidate in an observation, so they can select a record whose
best-scoring candidate has a different assessment state.

**View data** and its JSON download retain every candidate's complete
`score_assessment`, plus the record-level `context_scoring` summary. CSV adds
method, best candidate code, support, dimensions, trial status, proposed code
and proposal scope. It also adds JSON columns `candidate_evidence_quality`,
`candidate_scope_fit`, `candidate_resolution` for the best displayed candidate,
and record-level `location_ambiguity`. Existing source amounts and ledger
identities are retained. Master/applied numeric ledgers keep their own methods;
qualitative assessments do not promote or rewrite either ledger.

Rebuild interpretations, the cleaned consumer and the viewer:

```sh
python3 master_list/scripts/build_location_interpretations.py
python3 master_list/scripts/build_cleaned_dataset.py
python3 master_list/scripts/build_viewer.py
```
