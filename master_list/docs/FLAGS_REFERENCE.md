# Flags, statuses and diagnostics — complete reference

**Scope.** Every flag, status, warning and blocker the master-list pipeline emits,
where it is raised, what it means, and its current frequency in the retained data.
Frequencies are from the FY2027 build (64,645 source observations) and will drift as
sources and rules evolve — the definitions are the contract, the counts are a snapshot
(2026-10-27 build).

Layers, in pipeline order:

| Layer | File | Vocabulary |
|---|---|---|
| Master location parse | `scripts/locations.py` | `location.review_flags` + score rules |
| Office context | `scripts/office_context.py` | `resolution` values + `warnings` |
| Coordinate PSGC | `scripts/build_coordinate_psgc.py` | `coordinate_status` + point issues |
| Interpretation layer | `scripts/build_location_interpretations.py` | `state`, `has_conflict`, candidate dimension states |
| Context scoring (trial gate) | `scripts/context_scoring.py` | `trial_status`, application `blockers`/`warnings` |
| Cleaned observations | `scripts/cleaned_policy.py` | consumer-facing `review_flags` from the shared catalog |
| Shared catalog | `reference/review_catalog.json` | the six question flags + five location statuses |

The cleaned layer's consumer-facing questions come **only** from
`reference/review_catalog.json` (`review_catalog_v1`); the parser flags below are
internal diagnostics that feed scores and review queues, not user-facing wording.

## 1. Master location parse — `location.review_flags`

Raised while parsing `title_clean` against the PSGC catalog
(`location_evidence_v6.5`). Each flag has a fixed score effect (shown in brackets);
flags never delete an assignment by themselves — they mark review.

| Flag | Effect | Count | Meaning |
|---|---|---:|---|
| `allocation_is_not_a_project_site` | base 0 | 5,850 | Record kinds outside `{project, facility, fap_project}` carry no site assertion at all; retained in the ledger. |
| `barangay_mentioned_but_unmatched` | −2 | 4,990 | A `Brgy.`/`Barangay` marker word exists but no adjacent words form a catalog barangay name. |
| `independent_city_with_separate_province_context` | −1 | 1,254 | A HUC barangay/town with no province parent sits next to a same-region province mention (e.g. an Isabela-province association for an independent-city project). |
| `source_region_differs_from_title_location` | −3 | 760 | The assigned location's region differs from the printed source region. |
| `grouped_barangays_under_same_municipality` | **+3** | 598 | Several barangay markers all resolve under one municipality — internally coherent enumeration. |
| `ambiguous_barangay_name` | −3 | 256 | A barangay name matched multiple codes and no context disambiguated it. |
| `barangay_list_requires_review` | −1 | 198 | A `Brgys.`/`Barangays` plural marker introduces a list. |
| `title_or_heading_province_conflict` | −5 | 45 | A stated town is not in the stated province (hard conflict; accepted towns reset to none). |
| `ambiguous_city_municipality_name` | review | 31 | A town homonym stayed ambiguous after parent filtering. |
| `city_district_context` | soft | 25 | A conflicting town mention is actually a city district (Jaro/La Paz in Iloilo City), soft-flagged instead of a hard conflict. |
| `bridge_registry_conflicts_with_title_location` | −3 | 8 | The bridge-registry-derived location disagrees with the title-parsed location. |

Score effects are the `SCORE_PENALTIES` / `SCORE_FLAG_BONUSES` tables in
`locations.py`. Statuses (`unresolved`, `ambiguous`, `province_only`,
`multiple_locations`, `name_matched`, `registry_matched`, `allocation_not_site`)
carry the base score (0/1/2/3/4/6/0).

## 2. Office context — `office_context_v1`

`OfficeResolver.resolve()` returns a `resolution` plus optional `warnings`. Office
names are administrative associations only — never a project site, never scored
except as review-ordering context.

| Resolution | Count | Meaning |
|---|---:|---|
| `resolved` | 42,581 | Exactly one province/city name association (e.g. "Nueva Ecija 2nd DEO" → Nueva Ecija province). |
| `central_office` | 9,911 | Central Office — no geographic hint. |
| `no_office` | 4,264 | No office label printed on the record. |
| `broad_region_only` | 1,400 | A regional-office or metropolitan label (Regional Office IV-A, Metro Manila) yields a region, not a place. |
| `multiple_named_places` | 403 | Two named places (e.g. "Iloilo City-Another City DEO"); retained as multiple associations. |
| `unresolved` | 230 | Label has words but no catalog hit. |
| `source_conflict` | 6 | Source fields disagree on the office (e.g. `implementing_office` vs `DEO`). |
| `ambiguous` | (within unresolved paths) | A name hitting both province- and city-level codes without a `city` word. |

Warnings: `codebook_region_differs_from_current_catalog` (the DEO codebook's reference
region differs from the current PSGC catalog — metadata retained, association kept) and
`source_office_labels_disagree` (drives `source_conflict`). Place-name OCR repairs
(Marindugue→Marinduque, Siguijor→Siquijor, Occidenatal→Occidental, Batagas→Batangas,
Ilolilo→Iloilo) are applied at join time from the single home
(`analysis/builders/normalize_labels.py::PLACE_NAME_SPELLINGS`) and surface in each
source's `geographic_aliases` — the raw label is never rewritten.

Per-candidate office assessment states: `agrees`, `possible_agreement` (ambiguous
office overlaps the candidate chain), `no_province_parent`, `broad_region_only`,
`conflicts`, `not_assessed`.

## 3. Coordinate PSGC layer

`coordinate_psgc_v1` derives PSGC chains from title GPS points via the retained
shapefiles. Statuses: `parsed` (5,710), `normalized` (1,666 — a repaired-coordinate
review may apply), `needs_review` (2). GPS title-parse issues
(`gps-analysis/scan_gps_inventory.py`): `outside_philippines_orientation_bounds` (6),
`unparsed_coordinate_fragment` (4), `hint_only` (4). Chainage length reviews:
`repaired_km_ocr` (4), `absurd_unresolved` (6).

## 4. Interpretation layer — `location_interpretations_v6`

One profile per observation. `state`: `alternatives` (54,092), `unresolved` (3,081),
`single_reading` (1,622), `not_applicable` (5,850). `has_conflict`: 1,853 records.

Candidate dimension states (per candidate, per dimension):

- `named_parent` / `printed_province` / `region` / `headings` / `office_context` / `registry`: `agrees` · `conflicts` · `mixed` · `possible_reading` · `possible_agreement` · `no_province_parent` · `not_assessed`
- `title`: `asserted` · `reference_only` · `not_assessed` (a road name mentioning a place is reference-only; it never asserts a site)
- Evidence quality (`location_assessments_v1`): `supported` · `partial` · `requires_review` · `not_assessed`
- Scope fit: `supported` · `partial` · `conflicts` · `not_assessed`
- Hierarchy per level: `supported` · `partial_support` · `conflicting_evidence` · `mixed` · `not_applicable` (sub-municipality) · `not_assessed`
- Ambiguity: `single_candidate` · `competing_candidates` (per level)

## 5. Context scoring — trial gate (`context_scoring_v3`)

Per-observation `trial_status`: `already_selected` (27,707), `no_candidate` (11,225),
`blocked` (18,893), `ready_for_trial` (970), `not_applicable` (5,850).

Application `blockers` (candidate is ineligible for trial while any is present) —
top frequencies in parentheses:

| Blocker | Count | Meaning |
|---|---:|---|
| `no_title_application_route` | 87,324 | Candidate is not in the master suggestions list — no route exists to apply it. |
| `asserted_title_conflict` | 56,011 | An asserted title mention names places unrelated to this candidate. |
| `already_selected` | 52,055 | The candidate is already the master assignment. |
| `rivals_or_coarsens_master_scope` | 45,403 | Applying it would replace or erase an existing master location scope. |
| `spatial_scope_conflict` | 8,290 | Observed points disagree with the candidate scope (non-coordinate routes). |
| `region_conflict` | 4,614 | Printed region conflicts. |
| `title_candidate_review_only` | 3,400 | The suggestion is review-only (unmarked chain). |
| `named_parent_required_for_title_application` | 3,013 | Title-route candidates need a named town in the title. |
| `competing_title_candidate` | 2,548 | A higher-ranked suggestion exists. |
| `title_candidate_rivals_master` | 2,198 | Suggestion does not refine the existing master assignment. |
| `title_support_below_gate` | 2,112 | Suggestion support below the gate minimum. |
| `printed_province_conflict` | 2,101 | Printed province conflicts. |
| `coordinate-status / point blockers` | — | `no_coordinate_points`, `coordinate_status_requires_review`, `incomplete_point_mapping`, `points_do_not_all_support_candidate_scope`, `invalid_or_missing_coordinate_numbers`, `coordinate_issues_require_review`, `coordinate_quality_requires_review`, `registry_trial_route_requires_review`, `insufficient_title_margin`, `title_gate_context_conflict`, `conflicts_with_existing_title_application`, `existing_title_gate_not_passed`, `headings_conflict`, `registry_conflict` |

Application `warnings` (recorded, never blocking): `coordinate_reference_freshness_not_assessed` (8,482), `observed_coordinate_points_only` (8,482), `administrative_office_conflict` (2,882), `normalized_coordinates_review` (2,293), `office_context_requires_review` (203), `independent_city_province_association` (158).

## 6. Cleaned observations — consumer questions

`cleaned_observations_v1` selects provisional locations and emits clarification
questions drawn **only** from `reference/review_catalog.json`. Current frequencies:

| Flag | Count | Question |
|---|---:|---|
| `location_unclear` | 13,226 | "Location needs clarification" — no useful locality for the task. |
| `location_conflict` | 616 | "Location details disagree" — incompatible evidence (e.g. title vs coordinates). |
| `location_alternatives` | 128 | "Several locations are possible" — competing supported interpretations. |

Three more catalog flags exist for future/manual use: `project_coverage_unclear`,
`description_unclear`, `record_relationship_unclear`.

Location statuses in the cleaned layer: `resolved` / `partially_resolved` /
`ambiguous` / `unresolved` / `not_applicable`; decisions: `adopted_candidate` (970) /
`retained_master` / `review_required` / `not_applicable`.

## Reading the layers together

A single record's flag story flows: parser flags (§1) shape the master score and
review queue → office context (§2) and coordinates (§3) add context dimensions →
the interpretation layer (§4) re-derives competing readings with per-dimension
assessments → the trial gate (§5) decides which candidates are eligible for
provisional adoption → the cleaned layer (§6) adopts only gated candidates and
poses catalog-worded questions. Nothing auto-applies except the 970 gated trial
adoptions; every other flag surfaces review, never a silent assignment.

---

## Open flags and gaps — TODO backlog (added 28 Oct 2026)

Enumerated from the FY2027 comparison layer (`analysis/data/group_relations_*.json`,
built 2026-10-28). Findings are observations, not verdicts; amounts are the money
at stake, not confirmed wrongdoing. Companion exhibit: the Laoag City multi-purpose
building place shell (58 House rows vs 1 NEP row, ₱609.62M unsupplied — `hb:ic:c12906`–
`c13082`, House Vol. I-C pp. 665–674, all under Ilocos Norte 1st DEO).

**Census** (one state per row, rank-assigned): `committed_attached` 20,084 rows /
₱907.4B · `unmatched_insertion` 5,794 / ₱161.3B · `unmatched_deletion` 1,061 /
₱67.3B · `open_candidate` 658 / ₱18.5B · `review_attached` 74 / ₱4.8B ·
`twin_cross_referenced` 14 / ₱490M · `duplicate_key` 5 / ₱121.9M.

### A. Unsupplied shells — 795 findings, ₱41.3B at stake

One side of a road/place shell is fully paired while the other still holds rows:
split / insertion candidates, or dropped / re-titled items.

- [ ] **A1. House-unsupplied (576 shells, ₱26.9B)** — leftover House rows with
      exhausted NEP supply. Top regions: IV-A (116, ₱5.46B), III (59, ₱4.17B),
      II (47, ₱2.50B), I (47, ₱2.43B), VI (46, ₱2.03B). The Laoag exhibit above
      is the single largest. *Action: deep-dive the top ~20 shells; check for
      prior-year (FY2026 GAA) NEP presence to separate new insertions from
      multi-year continuations.*
- [ ] **A2. NEP-unsupplied (219 shells, ₱14.4B)** — leftover NEP rows with no
      House counterpart: deletion/re-scoping candidates or dropped items.
      *Action: confirm against Bicam ratification and the enacted GAA when
      published — which executive-proposed lines did Congress actually cut?*
- [ ] **A3. Road shells (97, ₱14.4B)** vs **place shells (698, ₱26.9B)** —
      both kinds need the same split/insertion vs re-title analysis.
- [ ] **A4. `office_change` holds (FY2027: 1,061 holds)** — every row parked on
      an office-change hold should be re-checked once the district index reruns;
      verify none is also sitting unsupplied in a shell.

**Related comparison flag: `changed_office` — “Changed office”.** Unlike the
DEO lens's `office_change` hold, this shared review flag compares all linked
House readings, DBM NEP and DPWH Transparency API office assignments, including
grouped members. Canonical spelling, case, whitespace, hyphen and DEO
abbreviation differences are normalized with the district join's shared
`officeJoinKey`. Missing offices and unattached suggestions do not count as
changes. The flag preserves the source readings and does not alter resolution
or amounts; it indicates a discrepancy, not a verified transfer of work.
The Nangcaon/Opol example (`house-reading:2410`) is flagged because the House
and NEP say Central Office while the API says Misamis Oriental 2nd DEO. See
[`location_district_lens_method.md`](../../analysis/docs/location_district_lens_method.md#resolution-order)
for the independent five-step resolution policy. This flag is computed in
`analysis/web/src/matchFilters.js`, not the cleaned-observation flag catalog.

### B. Shell amount gaps — 39 findings, ₱1.92B

Shell totals differ across sides and no attached pair explains the gap. Could be
a split, a re-scope, or rows that belong elsewhere. Top: MSR JCT Canda-Hondagua-
Roma Point Rd (₱519.9M, Region IV-A), Punta Baja Rizal Palawan road (₱177M,
MIMAROPA), Lalud-Garchitorena Rd (₱107M, Region V).

- [ ] **B1.** Deep-dive the top 10 gap shells; classify each as split / re-scope /
      misfiled rows.

### C. Committed with rivals — 19 findings, ₱1.61B

The matcher committed a pair while other candidates remained plausible — the
clearest case where the relation view and the dashboard legitimately disagree.

- [ ] **C1.** Human tie-break the 19 committed_with_rivals pairs (top: the
      ₱519.9M Roma Point Bridge row, ₱200M Atimonan-Mauban Rd, ₱200M Isla-Pasolo
      Creek flood control wall).
- [ ] **C2.** Verify the 93 `competing_candidates` shells (₱4.15B) resolve to a
      single committed edge or stay visible as alternatives.

### D. Zero-overlap attachments — 37 pairs, ₱768M (gross delta withheld)

Measured station spans share no overlap: disjoint segments of the same road,
attached for scope review only; the amount delta is deliberately not booked.
Top: Kapalong-Talaingod-Valencia Rd (₱92M, Region X), Titulok-Sto. Niño Highway
(₱86.2M, Region XII), Aguinaldo-Toboy-Natonin Rd (₱80.7M, CAR), Iloilo-Capiz Rd
new route (₱79.3M, Region VI).

- [ ] **D1.** Confirm each zero-overlap pair is truly disjoint segments (same
      project, different sections) and not a matcher over-attachment.

### E. Cross-PAP twins — 7 pairs, ₱245M

Identical row under different program sections on both sides, both unmatched.
Transfer or duplicate printing — unproven either way. Top: Quipot Bridge (₱120M,
Region IV-A), plus five Region VIII / Region I items (₱5M–₱50M).

- [ ] **E1.** Certify the 7 cross-PAP twin pairs — transfer vs duplicate printing —
      before counting them in any insertion/deletion totals (both sides stay
      unmatched until a human certifies the pair).
- [ ] **E2.** Check whether the Quipot Bridge (₱120M) twin also appears in the
      bridge registry with a conflicting location (cf. §1
      `bridge_registry_conflicts_with_title_location`).

### F. Master-list pipeline gaps

- [ ] **F1. `(Completion)`-tagged House rows** — 18 of the 57 Laoag rows carry
      "(Completion)", implying prior-year starts that never appeared in any NEP
      baseline; quantify this pattern corpus-wide (title contains
      "Completion") — how much House-only money is year-2+ of rolling programs?
- [ ] **F2. Barangay-matrix insertions** — 28 of 57 Laoag rows are exactly ₱5M
      each with one barangay per row; build a detector for uniform-amount
      barangay spreads (≥10 rows, same municipality, same work type, near-identical
      amounts) to surface other district-wide blanket programs.
- [ ] **F3. FMR DA omissions cross-check** — ₱4.84B of FMR items present in the
      House bill but absent from the Transparency API (per
      `other-analysis/data/fmr_summary.json`); reconcile against the comparison
      ledger to verify these rows' shell states.
- [ ] **F3a. Transparency API coverage drift** — re-run the Transparency API vs
      GAA/House enumeration when the FY2027 GAA publishes to measure omission
      drift year-over-year (FY2026 baseline: ₱9.8B missing).
- **F4. (deferred)** Prior-year GAA trace for Laoag "(Completion)" rows — blocked
      on FY2026 GAA PDF digitization.

### G. Known limitations to document (not fix)

- **G1.** Shell matching is title-based: an NEP line rephrased or buried in a
      lump-sum won't pair, so "unsupplied" ≠ "never proposed." State this in any
      published exhibit.
- **G2.** `committed_attached` (₱907.4B) is provisional — no pair is manually
      certified; treat as matcher output, not ground truth.
- **G3.** The finding "Laoag City MPB 58v1" is a title-based place shell: the
      single NEP row is the ₱835M INSPIRE Building (exact pair with `c12297`,
      p.633); the other 57 House rows (₱609.62M) have no NEP counterpart under
      the same place shell.

### H. Location gaps and coordinate flags — the map-ready money (added 28 Oct 2026)

Location problems are the highest-engagement class (the earlier "FMR plotted in
the sea" finding). Current state across layers, with amounts:

**Master list cleaned layer** (64,645 project rows, ₱2.392T):

| Status / flag | Rows | Amount | Share |
|---|---:|---:|---:|
| `location_unclear` flag | 13,226 | ₱861.7B | 36% of all money |
| `unresolved` status | 11,257 | ₱715.9B | 30% |
| `partially_resolved` | 3,200 | ₱179.0B | 7.5% |
| `location_conflict` (title vs coordinates/registry) | 616 | ₱12.2B | 0.5% |
| `ambiguous` | 744 | ₱15.0B | 0.6% |
| `location_alternatives` | 128 | ₱2.8B | 0.1% |

- [ ] **H1. Map-ready insertion exhibit** — 1,719 insertion-candidate rows carry
      GPS coordinates (₱30.6B; `gps-analysis` inventory), and 107 deletion
      candidates (₱3.2B). *Action: publish the plotted layer — coordinates +
      insertion status + page cites — the proven engagement format. Also plot
      the 35 increased / 6 decreased GPS adjustments (₱842M/₱629M).*

      **Crosswalk done 28 Oct 2026** — all 2,350 GPS-bearing comparison rows
      joined to `group_relations_states_2027` (78 rows outside comparison
      scope). The new matcher materially tightens the exhibit:

      | Matcher state (new) | Old trace said | Rows | Amount |
      |---|---|---:|---:|
      | `unmatched_insertion` | insertion | 1,323 | ₱22.55B |
      | `unmatched_insertion` | no_change / adjusted / unknown | 88 | ₱2.16B |
      | `committed_attached` | insertion | **317** | **₱6.46B** |
      | `open_candidate` | insertion | 47 | ₱1.04B |
      | `unmatched_deletion` | deletion | 98 | ₱2.88B |
      | `open_candidate` | deletion | 9 | ₱0.32B |
      | `committed_attached` | adjustments (±) | 29 | ₱1.00B |

      Reading: **₱6.46B of the old "insertion" GPS layer are actually matched
      pairs** under the group-relations matcher — publishing the map off the
      old trace alone would overstate insertions by ~21%. The defensible
      exhibit core is **1,411 GPS-plotted insertion-candidate rows, ₱24.7B**
      (1,323 + 88), with 47 more (₱1.0B) awaiting candidate resolution.
      *Remaining: wire `group_relations_states_2027` into
      `gps-analysis/scan_gps_inventory.py` as an additional state field (the
      old `change_type` trace stays for continuity), rebuild the workbench,
      and add the state filter to the Geolocation map.*
- [ ] **H2. FMR title-vs-coordinate DISAGREE queue** — 76 projects (44 HGAB
      ₱828M + 32 NEP ₱551M, overlapping rows) where printed coordinates land in
      a *different province* than the title locality; top: ₱50M Brgy. Mandasig
      FMR (Candaba, Pampanga). *Action: case-by-case review with the
      `fmr_psgc_validation` evidence layer; classify wrong-coordinates vs
      wrong-title.*
- [ ] **H3. Offshore residual** — 3 NO_MATCH projects (₱40M) remain after the
      accepted off-by-one digit repairs (Tagumpay 4.6°→14.6° etc.), plus the
      single manual item `ib:p723:r3` (Bangbang, Matalam, Cotabato — both
      endpoints land in M'Lang; ₱10M, no NEP counterpart). *Action: request
      DPWH road records or accept as permanently flagged.*
- [ ] **H4. Decompose `location_unclear` (₱861.7B)** — *first pass done 28 Oct 2026
      (15,201 unresolved+partial+ambiguous rows, ₱909.9B across three status
      values; see table below). Remaining: fold the 13,226 `location_unclear`
      flag rows into the same cause buckets and publish the methodology note.*

      | Cause | Rows | Amount | Share |
      |---|---:|---:|---:|
      | A. Corridor title, no place printed (road/bridge + chainage only) | 10,407 | ₱675.0B | 74.2% |
      | F2. No signal — FAP/umbrella projects (JICA/ADB/IBRD programs, multi-locality) | 1,735 | ₱129.8B | 14.3% |
      | D. Place named but unmatched (homonym candidates, none committed) | 885 | ₱55.5B | 6.1% |
      | E. Barangay health stations — facility named, municipality only | 751 | ₱22.0B | 2.4% |
      | C. Genuinely ambiguous (multiple readings) | 744 | ₱15.0B | 1.7% |
      | F1. **Named barangay, zero candidates found — parser gap** (HUC province-context cases: Bacolod "in" Negros Occidental, CDO "in" Misamis Oriental, Puerto Princesa "in" Palawan) | 573 | ₱8.5B | 0.9% |
      | B. Already locatable via GPS in title | 166 | ₱4.6B | 0.5% |

      Reading: **~89% of unlocated money is data absence** (corridor titles with
      no place printed + umbrella FAPs), **~7% is matcher conservatism** (D+C),
      and **~1% is an actionable parser gap (F1)** — cf. §1
      `independent_city_with_separate_province_context`. The honest public claim
      is "₱675B of road money cannot be located *from the printed documents
      alone* — DPWH holds the road-book/chainage referential that would place
      it," not "₱862B is missing."
- [ ] **H4a. Fix the F1 parser gap (₱8.5B)** — 573 rows name a barangay +
      city + (conflicting) province in HUC pattern
      (`Barangay Kalipay, Puerto Princesa City, Palawan`); parser finds zero
      candidates. Likely needs the HUC-province-context acceptance rule from §1
      applied at candidate-generation time, not just as a −1 flag.
- [ ] **H4b. Corridor-title locator (A bucket, ₱675B)** — chainage spans on
      named roads (Maharlika Highway LZ, Manila North Rd K0212…) are placeable
      only with DPWH's road referential; probe `chainage_units_2027.json` +
      bridge registry for road-name → province anchor coverage before
      requesting records from DPWH.
- [ ] **H5. `location_conflict` 616 rows (₱12.2B)** — title vs coordinate/registry
      disagreement inside the master list; overlaps H2's FMR subset. *Action:
      rank by amount, cross-reference the FMR DISAGREE queue, publish top 20.*
- [ ] **H8. Derive `title_province_contradicted_by_office_region` flag** —
      verified case: NEP p.672 trio (`p672:r0-r2` + API mirrors, ₱8M each =
      ₱24M) prints "…Jabonga/Carmen/Magallanes, Lanao del Norte" but all three
      towns are Agusan del Norte, under Agusan del Norte DEO (Region XIII).
      Currently flagged correctly but diffusely: §1
      `title_or_heading_province_conflict` + `source_region_differs…` (status
      `ambiguous`, score −7, nothing assigned), §2 office `conflicts`, §4
      `has_conflict` with an office+region-agreeing alternative candidate,
      §6 `location_unclear` — where it disappears into 13,226 rows.
      *Action: derive a dedicated queryable flag from the interpretation
      dimensions (`printed_province: conflicts` + `region/office_context:
      agrees` on a rival candidate); sibling scan found 45 flagged records,
      incl. another genuine misprint — "Brgy. San Isidro, Talakag, Palawan"
      (Talakag is Bukidnon) — plus benign cross-province roads (Magpet→Davao,
      Balbalan access) that need the office-agreement test to separate.*
- [ ] **H6. NIA near-total unresolved** — 775/778 NIA NEP rows (₱16.5B) and
      794/799 HGAB rows (₱16.9B) are `unresolved`. *Action: verify whether NIA
      titles simply carry no locality (expected) or whether the parser misses
      NIA-specific title patterns — a parser fix could locate ₱17B.*
- [ ] **H7. HFEP partial-only pattern** — 344/374 HFEP NEP rows are
      `partially_resolved` (₱10.1B): facility-level but no barangay? *Action:
      confirm the ceiling and decide whether facility-level resolution is
      sufficient for advocacy mapping.*

*Backlog owner: [unassigned] · Last audit: 2026-10-28 group relations build
(`input_sha256 09dc5843…`)*
