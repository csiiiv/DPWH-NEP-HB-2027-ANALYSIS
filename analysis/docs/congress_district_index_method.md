# Congress district index — method, checks and fallbacks

**Scope.** This document explains how `analysis/web/buildCongressIndex.mjs` builds
`analysis/data/congress_district_index_2027.json`: what the DEO lens counts, how ledger
rows join the DEO2LEG crosswalk, how gaps and disagreements are handled, and every
invariant the build fails on. It is the reference to read before re-running the builder
or interpreting a card.

**What this is not.** Nothing in the index establishes that a representative requested,
sponsored, or controlled any project or amount. A card reports what the office that
serves that district printed. The authority for this lens is
[DEO2LEG/README.md — "The one authorized project-level use: the DEO lens"](../../DEO2LEG/README.md),
whose four conditions (label every tier, never divide Tier B money, publish the
residual, carry upstream honesty annotations) are enforced as build failures, not prose.

## Pipeline position

```
comparison_projects_2027.json ─┐
comparison_overview_2027.json ─┼─► buildCongressIndex.mjs ─► congress_district_index_2027.json
DEO2LEG crosswalk (2.1.0) ─────┘         │
                                         └─ reuses partition() from src/overviewSummary.js
                                            (the same code that publishes the Overview)
```

- **Inputs** (SHA-256 pinned in `input_provenance`): `analysis/data/comparison_projects_2027.json`
  (the DPWH comparison ledger), `analysis/data/comparison_overview_2027.json` (the published
  Overview anchor), and `DEO2LEG/outputs/deo_leg_crosswalk.json` (schema 2.1.0).
- **Output**: `analysis/data/congress_district_index_2027.json`, consumed by the
  `#congress` workspace (grid + district pages) via `src/congressModel.js`.
- **Why Node, not Python**: the buckets a card reports are produced by `partition()` in
  `src/overviewSummary.js` — the same function behind the published Overview. Importing
  it makes it impossible for a district roll-up to silently disagree with the Overview;
  a reconciliation block proves the cards sum back to the published whole.

## The ledger rows

The unit is one **printed DPWH allocation record**, taken from the comparison ledger
(`comparison_projects_2027.json`) after `hydrateProjects` and `regionCandidates`.
Sides: HGAB3 · 3rd reading (House) ↔ DBM NEP. The DPWH Transparency API side
corroborates but is **not a stage** and never decides attribution.

`regionCandidates` applies an optional display join: a House record and a NEP record
with the same normalized title + funding zone but **different printed regions** become a
"region difference candidate" only when each is unique on its key, ungrouped, and
previously unmatched. Source assignments are unchanged; the row just carries the
relaxed-match basis. (See the notice on the workbench: NEP regions shift between
stages for identical projects.)

Annex datasets (FMR, HFEP, NIA) are `not_attributable` by policy and carry the reason in
`datasets`: FMR prints no office field; HFEP is province-level only; NIA rows carry no
LGU fields. No office is ever invented from free text.

## Office join

Each ledger row prints an implementing office on each stage. The join to the crosswalk
is name-based, through one shared normalizer — and it reads `office_canonical ?? office`
per record, so a repaired canonical label from the extraction layer is used when
present and the normalizer is the fallback:

1. **Upstream canonical labels** (`office_canonical`, attached by
   `analysis/builders/normalize_labels.py::annotate_source_labels`) — already carry the
   place-name OCR repairs by the time rows reach the join.
2. `canonicalOffice` (`analysis/viewers/project_offices.mjs`) — NFKC, spaced-ñ collapse,
   hyphen flattening inside DEO names ("Las Piñas-Muntinlupa" ↔ "Las Piñas Muntinlupa"),
   `Regional Office IVA` → `Regional Office IV-A`, and the **place-name OCR repairs**
   (Marindugue→Marinduque, Siguijor→Siquijor, Occidenatal→Occidental, Batagas→Batangas,
   Ilolilo→Iloilo) for rows that only carry the raw label. These five repairs mirror
   `analysis/builders/normalize_labels.py::PLACE_NAME_SPELLINGS`, the repo's single home
   for label normalization — the same rules the master list and DEO2LEG joins now derive
   from. Without them, "Misamis Occidenatal …" (106 NEP records) would form its own
   bucket and split one office in two across every filter.
3. `officeJoinKey` — expands `DEO` → `district engineering office`, expands
   `sub DEO`, drops hyphens, lowercases. This meets the crosswalk's short registry forms
   ("… 2nd DEO") on one key with the ledger's long forms ("… 2nd District Engineering
   Office").

An office name resolves to at most one **office group** (below). A name form resolving
to offices in different groups is **not a safe join** and returns null.

## Office groups and tiers

A **group** is the set of crosswalk offices that serve the *same district set*:

- Two Tier A offices covering one district (Apayao 1st + 2nd DEO → `leg:apayao:lone`)
  form one undivided pool and share one card.
- Offices not in the allocation table (legacy registry-only) carry no ledger and are
  excluded from grouping.
- `type: "regional_group"` entries (BARMM) are rejected as money-carrying actors:
  DEO2LEG policy forbids counting a regional grouping as a district-level office.

Tier of a group:

- **Tier A** — serves exactly one district. The figure is attributable to that district
  alone.
- **Tier B** — serves two or more districts. The figure is an **undivided range** shared
  with the named co-served districts and is never split (not equally, not by population,
  not by road length — no rule exists that this data can support).

Districts reachable only through the BARMM regional group get a **tier-`none` card**:
the seat stays visible, the card states plainly that no office-level ledger exists, and
it books zero money (`partition([])` is all zeros, so it cannot quietly absorb BARMM's
money into the tie-out).

## Row classification

Each comparison row is classified once (`classifyRow`). A row joins a group **only when
every stage that printed an office agrees on one group**:

| Verdict | Condition | Where the money goes |
|---|---|---|
| `group` | all printed offices resolve to the same single group | that group's card |
| `residual` | offices printed but none attributable (Central Office, Regional Office, BARMM grouping, unknown spellings) | published residual |
| `office_change` | stages disagree: two groups, or one side attributable and the other not (e.g. NEP printed Central Office, HGAB3 printed a DEO) | published separately, never assigned |
| `no_office` | stages present, no office printed at all | residual |
| `no_stage` | neither HGAB3 nor NEP present | build fails — these rows should not exist |

The deliberate asymmetry in `office_change`: when one stage printed Central Office and
the other a DEO, the row is **not** booked to the district. The NEP-side money was
printed under Central Office; charging it to a DEO would move money between the residual
and a card without evidence. `office_change` rows keep both stages' offices, amounts and
a `cross_district` flag (groups span districts) for inspection.

Cards also retain `ledger_names`: the office spellings the ledger rows carry for the
group (canonical form when the extraction layer attached one, raw print otherwise), so
any card can be traced back to source rows without re-deriving the join in the browser.

## Buckets and the reconciliation

Card/residual/office-change summaries are produced by `partition()` — literally the same
function the Overview publishes. Its buckets: insertions, deletions, unchanged,
increased, reduced, and **segment-scope review** (paired rows on the same road whose
station spans share no overlap; their delta is a different-segment artifact, not a
same-project adjustment, and equal-amount segment pairs also stay in the review bucket
so a silent mispair cannot hide as "unchanged").

**Tie-out.** `numericLeaves` flattens every numeric leaf of `partition()` output and
asserts, per field path:

```
cards + residual + office_change == whole ledger
```

A new bucket added to `partition()` later is automatically covered — a field the sum
misses fails the build. Before that, the local partition of the whole ledger is tied
against the **published Overview adapter** (`dpwhSummary`), which itself asserts the
same numbers against the printed headlines. If that throws, the ledger moved and the
build stops.

Per-card, `bucketRowIds` reproduces the bucket assignment row-by-row (the explorer
filters the shared comparison payload by these IDs) and fails if any row is lost — a
card and its table can never disagree.

## Invariants (build failures)

The build fails loudly on every one of these:

1. **Schema drift** — crosswalk schemaVersion ≠ 2.1.0; detail/overview schema ≠ 1.
2. **Published-anchor divergence** — local partition ≠ published Overview numbers.
3. **Tie-out** — cards + residual + office_change ≠ whole, on any numeric field.
4. **Residual majority** — residual share of the ledger < 50% on either stage. Central
   Office money is the bulk of this ledger; if a join bug ever routed it onto cards,
   district cards would imply full coverage of a budget they account for a minority of —
   exactly the misleading reading the policy forbids.
5. **Central Office presence** — residual must still contain Central Office rows.
6. **BARMM exclusion intact** — the crosswalk must still carry the `regional_group`
   entry the lens excludes.
7. **Full district coverage** — every crosswalk district appears on at least one card
   (a missing seat is a silent drop), and the coverage count equals the crosswalk's
   district count.
8. **Tier consistency** — a district may sit on several cards (two multi-district
   offices can overlap, e.g. Manila 6th served by both North and South Manila DEO; each
   card's rows are distinct and the tie-out already proves no row is booked twice), but
   never with conflicting tiers; Tier A cards serve exactly one district; Tier B cards
   serve at least two; tier-`none` cards carry a mandatory explanatory note and zero rows.
9. **Row buckets** — bucket row-ID lists reproduce `partition()` exactly, no row lost.
10. **No stage-less rows** — a row with neither HGAB3 nor NEP is a ledger error.
11. **House/API-only scope** — rows outside the HGAB3 ↔ NEP comparison need a separate
    adapter and fail the build here.

Representative labels are carried from the crosswalk (verified against the official
congress.gov.ph directory; ambiguous seats name no representative and list both
candidates). Tier B ranges list their representatives rather than inventing an owner.
Leadership roles (Speaker badge) appear on the one card that holds them.

## Relationship to the planned location lens

A second `#congress` view attributes the same ledger by **project location**
(master-list PSGC resolution → PSGC2LEG assignments) instead of by office, with
the DEO view remaining the catch-all for unlocatable rows. The two lenses
disagree by construction and cross-validate each other. Method, field sources
and the verified district-id bridge: [`location_district_lens_method.md`](location_district_lens_method.md).

## Re-running

```sh
node analysis/web/buildCongressIndex.mjs
```

Runs in `prebuild`/`predev` of `analysis/web` (see `package.json`), so a Vite build or
dev server refreshes it automatically; it can also be run standalone. The build prints
card counts, the row equation (`total = cards + residual + office_change`), the
unattributable share, and the number of tied numeric fields.

After today's shared-normalizer change (master list office hints now derive from
`normalize_labels.py`), a re-run is expected to change nothing on the cards: this
builder's join side already read `office_canonical` (repaired upstream by
`annotate_source_labels`), so records printed as "Misamis Occidenatal …" have always
landed on the Misamis Occidental 2nd card — its `ledger_names` carries only the
repaired spelling. What today's change guarantees is different: every office-touching
consumer in the repo (master-list hints, title matching, this join) now provably
derives from the single `PLACE_NAME_SPELLINGS` home instead of maintaining parallel
copies, so a future added repair cannot fix one consumer and silently miss another.
