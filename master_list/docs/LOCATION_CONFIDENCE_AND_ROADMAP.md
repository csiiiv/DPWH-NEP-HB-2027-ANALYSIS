# Master list location evidence: work log and roadmap

**Status:** additive evidence version 6 built, verified, and published  
**Score field:** `location.score`  
**Method identifier:** `location_evidence_v6`

This document records what the master-list work has done, how the location
parser now reasons about place mentions, and how the raw scores should be
assessed before any normalization. A score may change only when source evidence
or a documented rule changes.

## Version 6 changes

Version 6 addresses false penalties on multi-barangay titles, split-name
municipalities, numbered barangays, and city districts:

1. **Initial-dropping town aliases.** PSA names carrying personal initials
   (`Pres. Manuel A. Roxas`) are also indexed without single-letter tokens
   (`pres manuel roxas`), so titles writing `Pres. Manuel, Roxas` resolve.
2. **Comma-spanning phrases.** A catalog name may span a comma inside a
   bounded suffix when the phrase does not fit inside any single part; it
   then qualifies as locality syntax for that phrase alone.
3. **Province-first barangay scoping.** Barangay candidates are narrowed to a
   stated province before uniqueness, preventing homonym barangays under
   same-named towns in other provinces from poisoning the context.
4. **Multi-marker capture.** Every `Brgy.`/`Barangay` marker in every part is
   examined (previously only the first per part); grouped barangays under one
   municipality waive per-marker conflict/ambiguity flags and record
   `grouped_barangays_under_same_municipality`.
5. **Numbered-barangay comma join.** A marker part ending in a bare number
   (`Barangay 1`) joins the following part when the joined words form a
   catalog alias (`1 san lorenzo` → `Bgy. No. 1, San Lorenzo`, Laoag City);
   the absorbed part is suppressed from town scanning.
6. **City-district context.** A conflicting town mention that is positionally
   explained by a barangay's accepted parent city (`Jaro`, `La Paz` in Iloilo
   City) records `city_district_context` instead of a hard province conflict.
7. **Parenthetical qualifier disambiguation.** Same-named barangays inside one
   city (`San Isidro (Jaro)` vs `San Isidro (La Paz)`) resolve when the title
   mentions the parenthetical district elsewhere.
8. **Explicit-city marker scope.** An explicit city phrase (`Iloilo City`)
   outranks same-named town homonyms when scoping barangay markers.

Dataset effect: `title_or_heading_province_conflict` 323 → 169, `ambiguous`
status 349 → 195 records; 620 records now carry the grouped-barangay bonus.


## What we have done

The master list collates 64,645 FY2027 source observations from ten retained
DPWH, farm-to-market road, health-facility, and irrigation datasets. Each source
and budget stage remains a separate ledger. Titles, categories, integer PHP
amounts, source identifiers, PDFs, pages, coordinates, and source hashes remain
traceable. All ledgers reproduce their source controls; the known PHP 140,000
HFEP source discrepancy remains disclosed.

The first location release used a bounded `0.00`–`1.00` rules score. We removed
that presentation before calibration because the decimals looked probabilistic
and the cap hid how much evidence a row actually contained. The replacement is
an uncapped additive score. Existing binary statuses remain as explanations,
while each positive and negative factor is retained on the record.

The viewer displays title, category, amount, provisional PSGC locations, raw
evidence score, PDF, and page. It supports search, source/category/minimum-score
filters, review filtering, sorting, pagination, and direct PDF-page links.

## How a human-style parse is approximated

The parser first collects plausible place mentions, then tests their PSGC
relationships instead of deciding from one name in isolation:

1. Normalize punctuation, accents, `Sta.` and `Sto.`, and documented
   historical spellings (`North Cotabato` → `Cotabato`, `Compostela Valley` →
   `Davao de Oro`, `Western Samar` → `Samar`, `Pob.` → `Poblacion`), while
   retaining the source title unchanged.
2. Detect complete catalog names at word boundaries and record every candidate
   PSGC code for repeated names.
3. Identify locality syntax: comma suffixes, municipality/city/province labels,
   `Brgy.`/`Barangay` markers, and exact printed locality headings.
4. Test candidate chains using actual `parent_code` relationships:
   barangay → municipality/city → province → region.
5. Prefer a barangay candidate whose named town and province form the stated
   hierarchy. A source region may disambiguate remaining town or barangay
   homonyms when it leaves one regional candidate.
6. Accept an unmarked barangay only from a complete ordered
   `barangay, municipality, province` suffix and only when no same-named town is
   valid in that province.
7. Treat a compact component such as `Claver Surigao del Norte` as locality
   syntax only when catalog place names cover every word in the component.
8. Retain conflicts, unmatched markers, ambiguous candidates, and multi-place
   projects for review rather than silently forcing one answer.

Sitios and puroks are useful text context but are not PSGC administrative units.
Implementing-office names remain context and are never assigned as project
sites. Coordinate evidence is retained but does not affect the score until a
current PSGC geometry source is added.

## Raw additive scoring rules

The score has no imposed minimum or maximum. Negative totals are allowed. It is
an evidence ledger, not a probability, percentile, grade, or quality threshold.

### Resolution base

| Resolved outcome | Points |
|---|---:|
| Allocation without a site assertion | 0 |
| Unresolved | 0 |
| Ambiguous candidates | +1 |
| Province only | +2 |
| Several assigned locations | +3 |
| One municipality/city/sub-municipality | +4 |
| One barangay | +6 |

### Independent evidence and hierarchy agreement

| Evidence | Points |
|---|---:|
| Adjacent explicit `Brgy.`/`Barangay` marker | +2 |
| Complete unmarked barangay → town → province suffix | +4 |
| Compact multi-level locality component is fully covered | +1 |
| Title locality and printed source heading agree | +2 |
| Selected locality and explicit parent province agree | +2 |
| Source region and assigned PSGC region agree | +1 |

A cue type is counted once per observation. Repeating the same barangay in a
title does not create independent evidence.

### Contradictions and incomplete evidence

| Review condition | Points |
|---|---:|
| Title or heading conflicts with province | -5 |
| Source region conflicts with assigned region | -3 |
| Barangay name remains ambiguous | -3 |
| Barangay scope spans several municipalities | -3 |
| A barangay marker cannot be resolved under its context | -2 |
| Plural barangay list needs review | -1 |
| Independent city appears with separate province context | -1 |

`score_factors` records every applied item. `score_method` identifies the rules
version. The audit stores the same rule tables in machine-readable form.

## Why the three reported titles were previously zero

The earlier parser searched barangays only beneath a town that it had already
accepted and required a comma component to be exactly one place name.

| Title pattern | Earlier failure | Current interpretation | Raw score |
|---|---|---|---:|
| `Brgy. Danuman West` | No town had been accepted first. | Danuman West is nationally unique; its PSGC parent supplies Santa Maria, Ilocos Sur. | 9 |
| `Brgy. Wangke, Claver Surigao del Norte` | The compact town/province component was rejected. | Wangke → Claver → Surigao del Norte is a valid chain; the source region agrees. | 12 |
| `Sta. Maria, Piddig, Ilocos Norte` | Santa Maria was treated only as several municipality homonyms. | The only valid complete chain is Santa Maria barangay → Piddig → Ilocos Norte. | 13 |

The Danuman score is lower because the words “Ilocos Sur Provincial Trading
Center” describe a facility name rather than an explicit locality suffix. The
parser does not count that phrase as an independent parent assertion.

## Current corpus distribution

The v6 run spans scores from `-8` to `15`. The exact distribution is
published in [REPORT.md](../data/REPORT.md) and `audit.json`. The most common
totals are `11` (22,816 observations), `0` (16,946), `7` (5,520), `9` (4,551),
`5` (4,753), and `8` (3,374). These clusters reflect the rules and source
formats; they are not validated accuracy classes.

Compared with the original bounded-rule corpus, the expanded hierarchy parser
changes assigned PSGC codes for 4,847 observations and status for 2,422. That
scale makes a stratified review essential before labels such as low, medium, or
high are reintroduced. The v2 → v3 rebuild reported its exact deltas in the
sections below; prior rules remain reproducible from git history.

## What changed in v3

Version 3 keeps every v2 rule unchanged for assigned locations and makes three
targeted improvements. Scores, statuses, and assigned codes change only where a
documented rule changed; every change is auditable per record.

1. **Chain-combination review suggestions** (`hierarchy_candidate_v2`). The
   suggestion ranker now scores complete barangay → town → province chains as
   combinations instead of listing candidate barangays separately. When the
   stated town/province chain is absent from the catalog (`stated_chain_absent_
   from_catalog`, +2), every suggestion is a repair candidate rather than a
   rival reading; when exactly one repair is compatible with the source region
   (`unique_region_compatible_repair`, +3), it ranks decisively above the
   alternatives. Example: `Barangay Poblacion, Carmen, Lanao del Norte`
   (Region XIII source) has no Carmen in Lanao del Norte; the only
   region-compatible chain is Poblacion → Carmen → Agusan del Norte, which now
   scores 10 against 3 for the next alternative. Suggestions still never
   assign a location.
2. **Documented historical spellings.** Titles saying `North Cotabato`
   (150 occurrences), `Compostela Valley` (12), or `Western Samar` now match
   their current official province names (`Cotabato`, `Davao de Oro`, `Samar`).
   These are documented renames, not fuzzy matching.
3. **`Pob.` contraction with context backoff.** `Pob.` expands to `Poblacion`
   before matching; when the expanded name is not used in the stated town
   (e.g. `San Roque Pob.` in Bula, Camarines Sur, whose barangay is officially
   `San Roque`), the resolver drops only the trailing `poblacion` descriptor.
   Distinguishing numerals are never dropped: `Poblacion 6, Sariaya` stays an
   unmatched mention (Sariaya has no Poblacion-series barangay) instead of
   being rewritten to a bare `poblacion` under an unrelated same-named town.

Measured v2 → v3 effect: 10 status changes (8 `ambiguous →
multiple_locations`, 2 `unresolved → province_only`), 22 assigned-code
additions, and 175 score changes — every one an upgrade; zero
`name_matched` regressions. The largest cluster (111 records, `9 → 11`) is
the `North Cotabato` alias gaining explicit-parent-chain corroboration.

### Office province hints (suggestion ordering only)

District engineering offices are province-scoped, so an office name such as
`Agusan del Norte District Engineering Office` carries ordering evidence for
review suggestions — exactly the evidence that separates the printed
`Barangay Poblacion, Carmen, Lanao del Norte` (whose office names Agusan del
Norte) from its rival readings. `Matcher.province_code` extracts a hint only
when the office contains exactly one unambiguous province-level catalog name
(23,820 records carry one); homonym names like `Metro Manila` or `Isabela`
yield no hint. In `hierarchy_candidate_v3`, `office_province_agreement`
(+2) boosts a suggestion whose chain sits in the office's province, and
`office_province_conflict` (-1, asymmetrically weaker, since offices
legitimately administer cross-province works) notes the rest. Assigned
locations, statuses, and scores are untouched: office names remain context
and never become a project site. Measured effect: 4 top-suggestion
re-rankings (all corrections of a same-region tie, e.g. `Magsaysay,
Misamis Oriental` vs `Lanao del Norte`, both Region X with a Poblacion
barangay); 8 more records gained a decisive top-2 gap.

## What changed in v4

A barangay uniquely resolved under a highly urbanized city was being
dropped whenever the title also named an adjacent province. HUC barangays
have no province ancestor, and the marker resolver treated "no province" as
"conflicting province" — a hard conflict that discarded a valid barangay.
Example: `Barangay Macabalan, Cagayan de Oro City, Misamis Oriental`
(5 project groups) resolved the barangay correctly but then flagged and
dropped it, leaving only the province.

The fix mirrors the existing town-level HUC rule (as in `Bacolod City,
Negros Occidental`): a stated province that shares the HUC's region is soft
context — the barangay is kept alongside the province with the
`independent_city_with_separate_province_context` flag (-1) — while a
different-region province remains a hard `title_or_heading_province_conflict`
(-5) that drops the barangay. Both records' titles that name the city
without a province are unaffected (they already resolved cleanly).

Measured v3 → v4 effect: 881 records upgraded from `ambiguous` to
`multiple_locations`, every score change an upgrade (-2 → 5 cluster),
zero `name_matched` regressions. The recovered barangays sit under 13 HUCs
— Cagayan de Oro (166), Butuan (166), Puerto Princesa (142), Angeles (90),
Lapu-Lapu (89), Mandaue (60), Cebu City (47), Bacolod (44), Lucena (40),
Iloilo (30), Olongapo (10), General Santos (4), Iligan (1) — reflecting the
common DPWH title style `Mandaue City, Cebu`, where the province names the
HUC's surrounding region rather than an administrative parent.

## What changed in v5: bridge registry evidence

The retained [DPWH bridge inventory](../bridge_inventory/README.md) archive
matches budget observations to existing bridges by exact `BRIDGE_ID` and
derives current-PSGC chains from 2023 barangay polygon hits (roadmap item
3: independent registry evidence with stable identifiers). The master list
consumes that evidence read-only, with every registry effect recorded as
its own factor:

| Rule | Points | Condition |
|---|---:|---|
| `base:registry_matched` | +4 | Title asserted no location; a single registry chain is adopted as `registry_matched` (verification `provisional_registry_match`). |
| `bridge_registry_id_match` | +2 | An exact inventory `BRIDGE_ID` appears in the title. |
| `bridge_registry_unique_chain` | +2 | The matched bridge resolves to exactly one current-PSGC chain. |
| `bridge_registry_agreement` | +2 | The title-assigned scope intersects the registry chain. |
| `bridge_registry_conflicts_with_title_location` | -3 | Title assignment and the single-town registry chain are disjoint — review, never override. |

Registry evidence never overrides a title-asserted location: agreements
score, disagreements flag, and only a completely unresolved title adopts
the registry chain. The bridge snapshot stays pinned by the inventory's own
audit; the master-list audit records both evidence files' hashes.

Measured v4 → v5: 1,451 previously `unresolved` score-0 records adopt a
unique registry chain (`registry_matched`, scored 8 by default: base 4 +
ID 2 + chain 2); 252 records with an exact ID but no polygon chain gain
the ID factor only (+2); 94 records gain an agreement bonus; 16 records
(the Sayre Highway class, titled by road endpoint but physically in the
neighboring province) gain a conflict penalty and stay in review with
their title answer retained. The unresolved population drops from 12,917
to 11,466.

## What changed in v5.1: NCR chains and legislative districts

Two follow-ups to v5:

1. **NCR/HIC chain validation.** The 2023 boundary shapefile represents
   NCR (and Isabela City) with adm2 units named like `NCR, Fourth District
   (Not a Province)`. In the current catalog those chains are barangay →
   city → region with no province level, so the old province check could
   never pass; every NCR bridge stayed unresolved regardless of polygon
   hits. The bridge module now validates such chains by **region** instead
   of pseudo-province text (mirroring the v4 HUC principle). Unique chains
   rose from 8,060 to 8,358 and unresolved fell from 684 to 386; 168 more
   records (42 NCR projects × 4 dataset echoes) became `registry_matched`.
2. **Legislative districts derived directly from coordinates.** Districts
   now come from the bridge point itself where possible, with PSGC chains
   as the fallback: the 2023 municity polygon code joins the verified
   [PSGC2LEG](../../PSGC2LEG/README.md) municipality-to-district
   assignments (8,367 of 8,752 bridges; 100% of within-hits), and split
   cities use point-in-polygon on the DPWH ArcGIS 2022 congressional
   district layer adopted per its [validation
   verdicts](../../PSGC2LEG/docs/arcgis_congdist_validation.md) (62
   bridges; Antipolo, Cebu City, Caloocan, and Taguig excluded; Davao and
   Cagayan de Oro caveated). Every master-list record with an assigned
   municipality-level location also carries its verified district: 40,145
   through the assigned-municipality join and 1,503 through bridge
   coordinates (64.4% of all records). The district is a lookup of the
   final assignment, unscored and never new location evidence.

## What changed in v6: multi-barangay titles, split names, city districts

Version 6 removes four classes of false penalties, all generalized rules:

1. **Initial-dropping aliases and comma-spanning phrases.** PSA towns with
   personal initials (`Pres. Manuel A. Roxas`) are indexed without
   single-letter tokens, and a catalog phrase spanning a comma inside a
   bounded suffix (`Pres. Manuel, Roxas`) qualifies as locality syntax when
   it fits no single comma part. Covers all five `Pres./President` towns.
2. **Province-first barangay scoping + multi-marker capture.** Barangay
   candidates are scoped to a stated province before uniqueness, and every
   `Brgy.`/`Barangay` marker in every part is resolved (previously one per
   part). When several markers in a part share one municipality, per-marker
   conflict/ambiguity/unmatched flags are waived and the coherent group
   scores (`grouped_barangays_under_same_municipality`, 620 records).
   Example: the eight-barangay San Nicolas (Pangasinan) title resolves five
   barangays at score 8 instead of `ambiguous` at -5.
3. **Numbered-barangay comma join.** `Barangay 1, San Lorenzo` joins into
   the official `Bgy. No. 1, San Lorenzo` alias (2,261 numbered barangays
   nationwide); the absorbed part no longer masquerades as a town, so
   `... San Lorenzo, Laoag City, Ilocos Norte` resolves to the exact
   barangay instead of a hard conflict.
4. **City districts and explicit-city scoping.** A conflicting town mention
   explained positionally by the barangay's accepted parent city (`Jaro`,
   `La Paz` in Iloilo City) records `city_district_context` (102 records)
   instead of a hard conflict; explicit city phrases outrank same-named
   town homonyms when scoping markers; parenthetical barangay qualifiers
   (`San Isidro (Jaro)`) disambiguate via a district mentioned elsewhere
   in the title.

Measured v5.1 → v6: `title_or_heading_province_conflict` 323 → 169,
`ambiguous_barangay_name` 991 → 368, `ambiguous` status 349 → 195 records,
`multiple_locations` 3,490 → 3,557; `city_of_x`/`x city` forms (Butuan,
Iloilo, all HUCs) resolve identically through existing aliases.

## What we are doing now

- Preserve every candidate, selected code, evidence item, review flag, and score
  factor in the full JSONL output.
- Export the raw score and method in the retained compressed CSV; the viewer
  build also writes a plain CSV locally for spreadsheet use.
- Publish exact per-dataset and global score distributions in the audit/report.
- Keep viewer filtering numeric, without undocumented score bands.
- Carry the verified legislative district on every record with an assigned
  municipality-level location (lookup only: unscored, never new evidence).
- Maintain regression cases for hierarchy ambiguity, HUC ancestry, explicit and
  unmarked barangays, compact locality components, bridge registry behavior,
  and the three reported titles.

## What we plan to do

### 1. Review a stratified benchmark

Sample every dataset, raw-score value, inferred level, resolution rule, and
penalty type. Reviewers should mark the assignment correct, partly correct,
incorrect, or unknowable and cite the source page. Oversample changed codes and
rare negative or maximum scores.

### 2. Inspect score components separately

Measure the precision and coverage of explicit markers, complete parent chains,
source-region disambiguation, compact locality components, and each penalty.
Change weights only from review evidence, not from the visual shape of the
histogram alone.

### 3. Add independent spatial evidence

Validate retained coordinate pairs against a dated official PSGC geometry
release. Add road, bridge, irrigation, and facility registries where stable
identifiers exist. Each source should emit a separate factor so agreement and
conflict remain auditable.

Bridge registry evidence is **live as of v5/v5.1**: exact `BRIDGE_ID`
matches score as independent factors, unresolved titles adopt the single
registry chain as `registry_matched`, and the retained
[bridge inventory](../../bridge_inventory/README.md) derives legislative
districts directly from bridge coordinates (PSGC chains as fallback only).
The inventory retains dated DPWH Detailed Bridge Inventory snapshots, all
layer-1 source attributes, WGS84 points, source metadata, completeness
checks, and SHA-256 hashes, with GeoJSON/JSONL/CSV exports; refreshes
preserve previous snapshots.

The [bridge matching report](../../bridge_inventory/data/REPORT.md) records
exact project-ID matches (1,833 observations → 498 distinct bridges),
coordinates, point-in-polygon evidence, and coordinate-derived districts
(494/498 matched bridges; 8,429/8,752 inventory-wide). Inventory locality
names are compared independently and discrepancies stay flagged. Remaining
work under this item: the 32 unresolved matched chains, split cities
without adopted ArcGIS coverage (Antipolo, Cebu City, Caloocan, Taguig —
needing barangay-level PSGC + COMELEC assignment), and extending the
coordinate-first district pattern to title GPS pairs and facility
registries.

### 4. Normalize only after evaluation

After review, estimate empirical correctness by dataset, score, inferred level,
and rule combination. Possible outputs include calibrated probabilities,
percentile ranks, or operational review tiers. Keep the raw score alongside any
normalized value so the transformation remains reproducible.

### 5. Improve names conservatively

Add reviewed historical spellings, OCR variants, and aliases. Avoid unrestricted
fuzzy matching until false-positive rates have been measured. Replace the
provisional PSGC mirror with an official PSA source when available and retain
boundary effective dates.

## Change control

Any scoring or parsing revision should receive a new method identifier, document
changed factors, rebuild all derived outputs, report code/status/score changes,
and run source-total, PSGC ancestry, export, and browser checks. Published raw
distributions and prior rules should remain reproducible.

## Known limits

- A high raw score means more mutually consistent rule evidence; it does not
  establish a known error rate.
- A score of zero can mean no location evidence, an allocation row, or positive
  and negative factors that cancel. Inspect status and factors alongside it.
- Roads and other projects may cross administrative boundaries even when a
  title supplies one location.
- Source regions can be administrative grouping context rather than a physical
  site, so their contribution is deliberately small.
- Name inference does not validate project existence, budget correctness,
  construction progress, or identity across budget stages.
