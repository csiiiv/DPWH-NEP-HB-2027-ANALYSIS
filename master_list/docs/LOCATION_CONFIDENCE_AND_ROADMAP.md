# Master list location evidence: work log and roadmap

**Status:** additive evidence version 2 built, verified, and published  
**Score field:** `location.score`  
**Method identifier:** `location_evidence_v2`

This document records what the master-list work has done, how the location
parser now reasons about place mentions, and how the raw scores should be
assessed before any normalization. A score may change only when source evidence
or a documented rule changes.

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

1. Normalize punctuation, accents, `Sta.` and `Sto.`, while retaining the source
   title unchanged.
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

The first complete run spans scores from `-8` to `15`. The exact distribution is
published in [REPORT.md](../data/REPORT.md) and `audit.json`. The most common
totals are `11` (21,551 observations), `0` (18,653), `7` (5,436), `9` (4,975),
`5` (4,055), and `3` (3,178). These clusters reflect the rules and source
formats; they are not validated accuracy classes.

Compared with the original bounded-rule corpus, the expanded hierarchy parser
changes assigned PSGC codes for 4,847 observations and status for 2,422. That
scale makes a stratified review essential before labels such as low, medium, or
high are reintroduced. The additive re-scoring itself did not change any
assigned code, status, or score: it only added the ranked `suggestions`
review queue and stabilized record serialization.

## What we are doing now

- Preserve every candidate, selected code, evidence item, review flag, and score
  factor in the full JSONL output.
- Export the raw score and method in the retained compressed CSV; the viewer
  build also writes a plain CSV locally for spreadsheet use.
- Publish exact per-dataset and global score distributions in the audit/report.
- Keep viewer filtering numeric, without undocumented score bands.
- Maintain regression cases for hierarchy ambiguity, HUC ancestry, explicit and
  unmarked barangays, compact locality components, and the three reported titles.

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
