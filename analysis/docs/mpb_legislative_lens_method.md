# MPB legislative lens — scope, resolution reuse, and implementation

**Status:** initial implementation built and audited on 1 November 2026. The
generated lens is available locally at `#congress/mpb`; the scope rule and
evidence policy in this document remain the governing contract.

**Builder:** `analysis/web/buildMpbLegislativeLens.py`

**Output:** `analysis/data/mpb_legislative_index_2027.json`

**Route:** `#congress/mpb`, labelled **MPB (Legislative)**. Project explorer
links retain `lens=mpb` so shared district links reopen the same view.

The purpose of this lens is to organize the FY2027 DPWH multi-purpose-building
population by geographic legislative district, following the established
Congress legislative-lens pattern (the location lens and the FMR legislative
lens). It must keep every source allocation intact and must never imply that a
representative requested, sponsored, selected, or controls a project.

## Why this lens reuses the location-lens resolution instead of resolving again

MPB rows are ordinary DPWH comparison rows. Unlike the FMR lens — which had to
build a from-scratch resolver because FMR records carry no implementing office
and live in their own House/NEP annexes — every MPB row is already classified
by the audited DPWH location chain
([`location_district_lens_method.md`](location_district_lens_method.md)):

1. clean title PSGC + gate (usable DEO, coordinate, direct title hierarchy,
   or reviewed named site) → one legislative district;
2. one-to-one DEO → its legislative district;
3. multi-district DEO → the DEO's own undivided card;
4. no DEO → region;
5. no region → unassigned catch-all.

In the current ledger 5,816 of 5,877 title-matched MPB rows resolve through
step 1. The MPB builder therefore **consumes the committed location index's
`row_resolution` verbatim** and never re-derives a placement. The two tabs
cannot disagree about a row, because the MPB lens reads the same committed
resolution the **Districts (Legislative)** tab renders.

Any future tightening of the location chain applies to this lens automatically
on rebuild; it is not a fork of the policy.

## Scope: what counts as an MPB row

The population is one linked comparison row from
`analysis/data/comparison_projects_2027.json`. A row is in scope when either
condition holds:

- **PAP scope** — the row's program of activities is the BIP multi-purpose
  buildings line (`BIP - Multi-Purpose Buildings/ Facilities to support Social
  Services`); or
- **title scope** — the row's title names a multi-purpose building/hall,
  matching `multi…purpose` followed within a short window by a
  building/facility completion (`building(s)`, `hall`, `gymnasium`,
  `facility/facilities`, common OCR-mangled spellings such as
  `buidling`/`buildng`/`builidng`, abbreviations like `bldg`, or completions
  such as `evacuation center` and `covered court`).

The two rules are intentionally a union: the PAP is the budget document's own
programme classification, while the title rule keeps MPB-typed rows printed
under other PAPs (for example the Coast Guard station building and the DAR
gymnasium rows on the generic `Buildings And Other Structures` line) visible.
A row that merely contains the phrase "multi-purpose" without a
building/facility completion — for example the Cabayongan River Multi-Purpose
Project (small river impounding) under the Flood Management Program — is
**not** an MPB row. Titles that drop the noun entirely ("Multi-Purpose,
Barangay San Jose, Anda, Pangasinan") are captured by the PAP rule, not the
title rule, so the title boundary stays auditable.

Scope is recorded per row with the rule(s) that admitted it (`pap`, `title`,
or both) plus the matched title fragment, so the membership is auditable and
reversible.

## Grain and money rules

The grain is one comparison row. House-only rows carry one House reading
(2nd/3rd reading members of the group), NEP-only rows one NEP record, paired
rows both. The row is assigned to exactly one card; comparison buckets and
amounts follow the shared `partition_summary` shape, so cards, the summary
modal and exports read the same figures as every other Congress lens.

Title-printed coordinates are evidence. They never receive or divide the
project's allocation. A building is a point facility: one coordinate pair
locates it, and no per-barangay or per-district splitting exists.

## Title coordinates

MPB titles frequently print a parenthetical or trailing decimal pair (for
example `…, Bangued, Abra 17.596246, 120.618253`). The builder consumes the
already-parsed `coordinate_summary` from the cleaned observations
(`master_list/data/cleaned/observations.jsonl.gz`) keyed by comparison group —
the same parse the Geolocation workspace and the location lens's coordinate
gate use. It does not parse coordinate text again.

- Only points whose parse status is `parsed` or `parsed_with_issues` are
  retained; issues travel with the point as review evidence.
- Coordinates inside the Philippine bounding box are mapped as points; the
  bounds are a review screen inherited from the scanner, not certification.
- Per row, points are deduplicated to unique lon/lat pairs while keeping every
  source stage observation as provenance.

## Cards

Cards mirror the location lens's shape so the shared card component renders
them unchanged:

| Resolution basis | Card |
|---|---|
| `title_psgc` | one legislative district card (`mpb:title_psgc:<district>`) |
| `deo_to_leg` | one legislative district card (`mpb:deo_to_leg:<district>`) |
| `deo` | the multi-district DEO's undivided card (`mpb:deo:<office-group>`) |
| `region` | region catch-all (`mpb-region:<region>`) |
| `unassigned` | unassigned catch-all (`mpb-unassigned`) |

Card ids are namespaced `mpb:` so a shared deep link can never collide with a
DEO-lens, location-lens or FMR card. District descriptors, representatives and
roster metadata are copied verbatim from the committed Congress index — the
same source every other lens uses.

## Output and reconciliation invariants

The builder and tests must prove:

1. Every in-scope comparison row appears on exactly one card, once.
2. Card sums tie out exactly to the in-scope whole (House total, NEP total,
   every bucket and adjustment figure) — no numeric drift.
3. Every district target exists in the 254-seat catalog.
4. Membership is reported per row (rule + matched fragment) and the row count
   reconciles against the scope census.
5. Every MPB row's resolution equals the location lens's committed resolution
   for that row (basis and target).
6. Rebuilding is deterministic and `--check` detects artifact drift.

## User interface

**MPB (Legislative)** is the Congress workspace's fifth tab, after
**FMR (Legislative)** and before **Map**. It reuses the legislative card shell
(district-first headings, portraits, tier badges, bucket lines, summary
modal). The grid offers **Export all districts…**, which fetches the DPWH
comparison payload on demand and downloads every scoped row across all cards
as Simple/Full CSV or JSON — the same columns as the per-district explorer,
plus Card ID / Card placement so the file stays navigable without opening a
district page. The explorer reuses the shared columns plus:

1. Project (title, id, HGAB3 office);
2. bucket (House only / NEP only / paired vocabulary);
3. assignment basis — the location lens's own basis and evidence, restated;
4. title PSGC location;
5. region;
6. HGAB3 ₱ / NEP ₱ / Δ;
7. **Map** — per-row point map and a per-card **View all buildings** overlay;
8. source pages (House Vol I-C, NEP Vol II-B), exactly as the DEO explorer
   cites them.

Coordinates render as dots on a MapLibre overlay, coloured by comparison
class (House-only blue, NEP-only teal, matched pair purple, per
`MPB_POINT_CLASSES` in `mpbSegmentOverlay.js`); lines are never drawn between
unrelated buildings. A building row with no retained coordinate shows an
explicit no-geometry state. Clicking a point opens the row's ordinary evidence
drawer, and the drawer separately discloses which scope rule admitted the row.

## Not claimed

Nothing in this lens establishes that a representative requested, sponsored,
selected, or controls any project or amount. A card reports where the budget
documents place the work. The MPB population itself is a title/PAP screen of
the DPWH ledger — inclusion does not certify a facility type, and exclusion of
a building-like row outside the scope rules is a scope decision, not a claim
that it is not a building.
