# Layered project resolution — title PSGC, DEO, region and unassigned

**Status:** implemented for the FY2027 Congress location lens on 28 October
2026. The production builder is
[`analysis/web/buildLocationLens.py`](../web/buildLocationLens.py); its output is
`analysis/data/location_district_index_2027.json`.

This lens assigns each linked DPWH comparison project exactly once. A clean
place parsed from a funded-section title may put a project on a legislative
district when it is supported by a usable District Engineering Office, a clean
coordinate, direct title text whose geographic context does not contradict the
selected PSGC locality, or a reviewed named-site entry pinned to a PSGC unit.
Title parsing follows the shared
[`title-to-PSGC location extraction method`](title_psgc_location_extraction_method.md);
coordinates and other derived context follow the shared
[`PSGC location evidence resolution method`](psgc_location_evidence_resolution_method.md).
This document begins with the later DPWH project-assignment decision.

The proposed DA farm-to-market-road legislative lens is documented separately
in [`fmr_legislative_lens_method.md`](fmr_legislative_lens_method.md). It uses a
new FMR-specific builder because FMR has no DEO field and carries multi-point
coordinate evidence with different review semantics.

Nothing here establishes that a representative requested, sponsored or
controlled a project or amount. The result describes how the linked budget
records resolve through the evidence hierarchy below.

## Resolution order

| Step | Condition | Assignment | Published basis |
|---|---|---|---|
| 1 | The funded-section title location maps cleanly to one legislative district and has at least one of: one usable real DEO, clean coordinate corroboration, direct title-text support with non-negative geographic context, or a reviewed named-site-to-PSGC entry | That legislative district | `title_psgc` |
| 2 | Step 1 fails, but all resolvable printed DEOs identify one DEO group and it maps to exactly one legislative district | That legislative district | `deo_to_leg` |
| 3 | The unique printed DEO group serves several legislative districts | The DEO itself; the full allocation stays intact | `deo` |
| 4 | No usable DEO group is available, but the comparison row has a region | The region | `region` |
| 5 | Neither a usable DEO nor a region is available | Visible unassigned catch-all | `unassigned` |

The consequences are deliberate:

- A title candidate with no usable DEO, coordinate corroboration, or supported
  direct title hierarchy goes to `region`. Registry-only suggestions and
  candidates with negative context do not pass step 1.
- A multi-district DEO does not distribute its allocation among the served
  legislative districts. Its own card holds the amount once.
- Conflicting real DEOs do not authorize selecting either office. The row is
  flagged `deo_office_conflict`; coordinate-corroborated title evidence may
  still satisfy step 1, otherwise the row continues to region or unassigned.
- `unassigned` is a valid published result. It is not a build failure.
- `row_resolution` records the basis, target, chosen title PSGC chain, every
  printed office reading and every resolved DEO group for each project. The
  location-lens project explorer renders this provenance as an **Assignment
  basis** column and repeats the full explanation and target in the row drawer.

## Evidence and selection

The comparison unit is one linked project from
`analysis/data/comparison_projects_2027.json`. House 2nd, House 3rd, DBM NEP
and DPWH Transparency API records may all contribute office evidence. House and
NEP remain the amount stages.

Region and office readings must retain their source-hierarchy origin: the
enclosing NEP/HGAB/API parent node or the exact flattened field derived from
that parent. A repeated leaf field and its parent node are one source reading,
not independent corroboration. Every linked observation keeps its own parent
path; cross-source agreement or discrepancy is summarized only after those
paths are resolved independently.

Real DEOs are limited to `district_engineering_office` and
`sub_district_engineering_office` entries in
`DEO2LEG/outputs/deo_leg_crosswalk.json` that occur in the allocation table.
Central Office, regional offices and regional groupings do not satisfy the DEO
gate. Office names use the same normalized join vocabulary as the DEO lens, so
DEO abbreviations, hyphens, case and known OCR spellings do not manufacture a
different office.

Coordinate corroboration requires more than the presence of latitude and
longitude text. At least one title coordinate must parse without coordinate
issues, and the selected PSGC candidate must have positive spatial support from
that point. A clean point attached to an unrelated title locality therefore
does not open the district gate. Repeated linked observations may carry the
same point; they are retained as source evidence rather than treated as
independent surveys.

The title-context path likewise requires more than a registry match. The
selected candidate must have positive direct-text support, and its geographic
context score must be neutral or positive. This admits explicit chains such as
“Barangay Mandangoa, Balingasag, Misamis Oriental” while leaving a bridge
registry suggestion with no direct title occurrence, or a candidate contradicted
by its surrounding text, in the region catch-all.

Named campuses, compounds and facilities inside multi-district cities use the
separate, provenance-pinned
`analysis/data/location_named_sites_2027.json` registry. An entry must require
an exact conjunction of folded title phrases, identify an existing PSGC code
that already maps to a legislative district, and retain its evidence note and
sources. The builder rejects duplicate matches, missing assignments and a
conflict with an independently clean title PSGC. This provides a reviewable
path for landmarks without turning general facility names into locality aliases.

Title locations come from
`master_list/data/cleaned/observations.jsonl.gz` →
`location_resolution.selected_locations`. Within each linked source, candidates
are ranked by:

1. location level: barangay/sub-municipality, then municipality/city, then
   province;
2. ancestry depth;
3. candidate support score.

A top tie across legislative districts is not clean. Clean readings from the
linked sources must also agree on one district. Barangays may resolve through
their recorded municipality/city ancestry because the PSGC-to-LEG assignment
table is municipality/city keyed. Province-only readings never roll down to a
district.

This ranking distinguishes the funded section from road-name endpoints when
the evidence is more specific. It does not assert that every endpoint in a road
name is part of the funded station range.

## Office discrepancy flags

### `changed_office`

Raised when linked House, NEP or Transparency records print more than one
distinct office after normalization. Missing offices and unattached suggestions
do not count as a change. The flag means the source records disagree; it does
not prove an actual chronological transfer.

The flag is independent of resolution. It preserves all readings and does not
change the five-step order, amounts or source labels. The Congress record drawer
shows the source, printed office and record ID for every reading.

### `deo_office_conflict`

Raised when printed real DEOs resolve to different DEO groups. Because there is
no unique DEO for DEO-based resolution, another clean step-1 source may still
place the project; otherwise it proceeds to region or unassigned.

### `office_location_mismatch`

Raised when step 1 produces a legislative district outside the printed DEO's
DEO2LEG district set. The clean funded-section title remains the step-1 target,
while both readings are retained in `office_location_mismatch_detail`.

## Nangcaon example

`house-reading:2410`, “Iligan City - Cagayan de Oro City Alternate Road
(Digkilaan-Bulua Section), Barangay Nangcaon Section, Sta. 23+806 - Sta.
27+226, Opol, Misamis Oriental,” now resolves as follows:

| Evidence | Reading |
|---|---|
| House 2nd | Central Office |
| House 3rd | Central Office |
| DBM NEP | Central Office |
| DPWH Transparency API | Misamis Oriental 2nd DEO |
| Best funded-section PSGC | Opol (`1004321000`) |
| PSGC → LEG | Misamis Oriental 2nd legislative district |

The API supplies the real DEO gate. Opol outranks the Iligan and Cagayan de Oro
road-name endpoints because it has deeper ancestry and stronger support. The
row is therefore assigned to `leg:misamis-oriental:2nd` with basis
`title_psgc`. It also carries `changed_office`; the three Central Office labels
remain attached as source evidence.

It no longer appears in a generic spanning/undivided-location pool.

## NCR coordinate-corroborated examples

Two Central Office-only projects previously fell to the NCR region card because
they had no printed DEO. Both now pass step 1 through coordinate corroboration:

| Project | Selected title PSGC | Assignment | Gate |
|---|---|---|---|
| Rehabilitation of Road at Capitol Hills, Barangay Old Balara, Quezon City | Matandang Balara (`1381300066`; the official PSGC name for Old Balara) | Quezon City 3rd legislative district | Clean title coordinate `14.66325, 121.07438` |
| Completion of Multi-Purpose Building at Valley 5, Barangay San Antonio, Parañaque City | San Antonio (`1381000012`) | Parañaque City 2nd legislative district | Clean title coordinate `14.472186, 121.027337` |

Their Central Office readings remain attached as office evidence. Neither row
acquires a DEO; each records `title_gate: coordinate` so consumers can
distinguish this path from the Nangcaon printed-DEO gate.

## Why clean title locations were still falling to Region

An audit of the 1,166 region rows exposed a policy bottleneck rather than a
PSGC parser failure:

| Previous fallback reason | Rows |
|---|---:|
| Clean title PSGC already mapped to one district, but had no usable DEO or coordinate | 706 |
| No selected title PSGC evidence | 352 |
| Selected PSGC was too broad to identify one district: province, multi-district city, or sub-municipality | 108 |

The first group included 686 rows with no real DEO and 20 with conflicting
DEOs. Requiring a DEO or coordinate was therefore responsible for most of the
avoidable misses. The direct-title hierarchy gate moves 676 of those rows to
their clean district. Thirty remain at Region because their selected candidate
comes only from registry evidence, has no direct title support, or has negative
context.

For the Misamis Oriental examples:

| Project row | Selected PSGC | Assignment | Gate |
|---|---|---|---|
| `house-reading:4908`, Balatukan River at Barangay Mandangoa, Balingasag | Mandangoa (`1004302018`) → Balingasag | Misamis Oriental 1st legislative district | `title_context` |
| `house-reading:9769`, Science and Technology Park road, Taytayan (Libertad)–Lagutay (Gitagum) | Taytayan (`1004315009`) → Libertad | Misamis Oriental 2nd legislative district | `title_context` |

The second road's named municipalities, Libertad and Gitagum, both map to
Misamis Oriental 2nd. Both projects keep their Central Office readings and do
not acquire a synthetic DEO.

## Multi-district city and named-site examples

City-level PSGC evidence alone cannot select a district in Manila or Quezon
City. Reviewed sites now refine three such titles:

| Project row | Named-site PSGC | Assignment | Gate |
|---|---|---|---|
| `house-reading:16141`, PUP Rizal Campus, Lepanto | Barangay 410 (`1380606016`) | Manila 4th legislative district | `named_site` |
| `house-reading:16142`, PUP College of Engineering extension, NDC Compound, Pureza | Barangay 628 (`1380606235`) | Manila 6th legislative district | `named_site` |
| `house-reading:16154`, UP Resilience Institute, UP Diliman | U.P. Campus (`1381300124`) | Quezon City 4th legislative district | `named_site` |

The two Bulacan examples did not require this path. `house-reading:4042`
already resolves Paco, Obando to Bulacan 4th through title PSGC and its printed
DEO; its two coordinate points are retained but have no positive spatial
support for Obando. `house-reading:7659` already resolves Santo Niño II in San
Jose del Monte to that city's lone district; its longitude-first coordinate is
normalized and supplies positive spatial support.

## Current FY2027 result

The 17,613 comparison rows reconcile exactly across the five bases:

| Basis | Rows | HGAB3 amount |
|---|---:|---:|
| `title_psgc` | 13,969 | ₱359.391B |
| `deo_to_leg` | 2,512 | ₱111.940B |
| `deo` | 645 | ₱25.611B |
| `region` | 487 | ₱90.134B |
| `unassigned` | 0 | ₱0 |

Title PSGC and DEO-to-LEG together assign 16,481 rows and ₱471.331B to 251
legislative districts. Multi-district DEO money stays on 32 DEO cards. The
current flag census is 3,018 `changed_office`, 27 `deo_office_conflict` and 116
`office_location_mismatch` rows.

## Build invariants

The builder and `analysis/web/src/congressLocationIndex.test.js` enforce:

1. Every comparison row appears on exactly one card.
2. Card summaries tie to the whole comparison ledger on every numeric field.
3. Every `row_resolution.basis` is one of the five published bases and equals
   its card's basis.
4. A `deo` card has no legislative-district or representative owner and keeps
   its full allocation intact.
5. Region and unassigned cards carry no district or representative.
6. The Nangcaon regression resolves to Opol → Misamis Oriental 2nd and retains
   all four office readings plus `changed_office`.
7. The Capitol Hills and Valley 5 regressions resolve through the coordinate
   gate to Quezon City 3rd and Parañaque City 2nd, respectively, without
   manufacturing a DEO.
8. The Mandangoa and Taytayan regressions resolve through direct title
   hierarchy to Misamis Oriental 1st and 2nd, while registry-only candidates
   remain at Region.
9. Reviewed PUP and UP named sites refine Manila and Quezon City to their
   barangay-based legislative districts, while preserving Central Office.
10. The Obando and San Jose del Monte regressions preserve spatial conflict and
    longitude-first coordinate diagnostics, respectively.
11. The 254-feature map sums both district bases (`title_psgc` and
   `deo_to_leg`) without merging their cards or double-counting rows.
