# Philippine Legislative District Mapping — Discussion Summary and Implementation Options

**Prepared:** 25 October 2026  
**Scope:** PSGC-to-legislative-district (`PSGC2LEG`) mapping, authoritative sources, validation, historical changes, and possible integration with DPWH/budget analysis.  
**Status:** Planning and source-assessment document; not a certified nationwide electoral-boundary dataset.  
**Granularity decision (25 October 2026):** the committed target is **municipality/city-level** assignment nationwide. Barangay-level detail is a **bonus stretch goal**, prioritized outside NCR first; **Metro Manila barangay splits are optional** and may be deferred or excluded, given the size and complexity of NCR barangay-level work (QC alone has 23 audited unresolved cases in the prior prototype). Any barangay work in split cities outside NCR remains valuable (e.g., Caloocan is also flagged, and prior audit counts: Bulacan 16, Quezon City 23, Agusan del Norte 11, Caloocan 11).

## 1. Executive summary

We want a **reusable, independently auditable mapping from Philippine Standard Geographic Code (PSGC) locations to geographic legislative/congressional districts (LEG)**, with **municipality/city-level assignment nationwide as the committed target** and barangay-level detail only where it is actually required and feasible (stretch goal, NCR optional).

The practical use case is to attach defensible legislative-district geography to projects, expenditures, procurement records, and other government datasets without treating administrative units (such as DPWH District Engineering Offices, or DEOs) as congressional districts.

The agreed direction is to **build and validate the root datasets first**, rather than continue expanding provisional name-based mappings piecemeal. The PSA PSGC will be the **source of truth for geographic entities and codes**; the **2025 election geography, enacted districting laws, and applicable COMELEC resolutions** will substantiate the geographic legislative-district assignments. Historical UACS/NSCB mappings and existing civic-tech datasets will be used for seeding, comparison, and quality assurance, not silently treated as current authoritative boundaries.

**Recommended immediate next step:** acquire and normalize the available UACS crosswalk, official 2025 COMELEC congressional-election geography, PSGC 2026 masterlist, and existing BetterGov mappings; then build a discrepancy report. Coverage priority is **municipality/city completeness first**; barangay-level splits (outside NCR first, NCR optional) follow as a stretch goal.

## 2. What we are actually trying to map

These are related but **not interchangeable**:

| Concept | Meaning | Proposed role |
| --- | --- | --- |
| **PSGC geography** | PSA-coded region → province → city/municipality → barangay hierarchy | Canonical geographic IDs, names, parentage, changes |
| **LEG** | Geographic House of Representatives legislative district, including lone districts | Electoral geography to be mapped onto PSGC units |
| **Representative** | Person holding or contesting the geographic legislative seat at a specific date | Separate, time-dependent lookup; not the identity of a district |
| **Councilor district** | Local city electoral subdivision for sangguniang panlungsod elections | Not a substitute for a legislative district; may be useful only as corroboration in expressly documented cases |
| **DEO** | DPWH implementing/administrative office or jurisdiction | Separate many-to-many crosswalk with LEG; never use DEO identity alone to establish project location |
| **Electoral precinct** | COMELEC voting unit used for election operations and returns | Potential bridge for verifying barangay-to-LEG assignments, especially in split cities |
| **GIS polygon** | Geometric boundary of a locality/district | Optional spatial validation or point-in-polygon lookup; boundaries and effective date must be verified |

The key distinction: **PSGC does not encode legislative districts directly**. UACS itself says the legislative district is not part of the location-code structure, but that a separate mapping is provided.

A place may be wholly within one LEG, but a large multi-district city may require **barangay-specific** assignments. Neither a province label, a city name, nor a councilor-district number is enough to make every congressional mapping safely.

## 3. The decisions reached during our discussion

1. **Build PSGC2LEG as a standalone reusable dataset/tool**, not just a hard-coded table inside the budget dashboard.
2. **Use PSGC as the canonical base geography.** PSGC determines the recognized location identifiers, parent-child hierarchy, current names, and geographic revisions. It does *not* alone establish LEG membership.
3. **Anchor the initial legislative baseline to the May 2025 congressional elections / 20th Congress**, with the applicable districting laws and COMELEC rules. Avoid importing older boundaries into the 2025 map without checking.
4. **Adopt the following working source hierarchy for reconciliation:**
   - 2025 COMELEC congressional-election geography and allocations (operational electoral baseline);
   - enacted laws and applicable COMELEC resolutions (legal basis and boundary exceptions);
   - latest PSA PSGC masterlist (canonical location codes and entities);
   - historical UACS/NSCB mapping (independent cross-check and historical seeding).
   This is a *workflow precedence*, not a claim that an election result can supersede an enacted statute.
5. **Use existing BetterGov data and other open datasets as accelerators**, subject to comparison against official sources and the 254-seat baseline.
6. **Use congressional election data, not city councilor-district data, as the preferable electoral-data route** to identify geographic legislative constituencies. Councilor districts may differ.
7. **Keep ambiguity visible.** Any unresolved, contradictory, historical, or only name-matched assignment must remain flagged rather than be silently filled.
8. **Split the project into manageable foundation-building stages**: PSGC catalog → LEG catalog → PSGC-to-LEG relations → exceptions/validation → optional geometry, representative roster, and DEO mappings.

## 4. What we established about the 20th Congress and changing districts

- COMELEC Resolution **No. 11050**, dated **4 September 2024**, allocated **254 geographic legislative seats** for the 12 May 2025 national and local elections. This is the baseline used in our discussion and in the strict 254-district budget view.
- Older UACS/NSCB mappings cannot be presumed contemporaneous with the 2025 election. Apportionments have changed over time, so a district identified with the same ordinal number may cover a different set of places in another electoral period.
- The potentially important changing/exception areas identified for targeted review included **Cavite, Isabela, Aklan, Bulacan, Bataan, Rizal, Caloocan, South Cotabato/General Santos, Agusan del Norte/Butuan, and the Taguig/Makati EMBO barangays**. This is an *audit shortlist*, not a claim that each underwent a new post-2025 change.
- **COMELEC Resolution No. 11069 (25 September 2024)** is a particularly useful example: it addresses the ten EMBO barangays' legislative and councilor-district apportionment for the 2025 elections after their transfer to Taguig. This is exactly the kind of legal/electoral exception a generic place-name join could miss.
- In our prior review, **no enacted post-2025 alteration to the 254-seat baseline was confirmed as of 23 October 2026**. This is a bounded verification result, not a permanent assertion; revisit if new laws, final judgments, or election directives emerge.
- **Do not confuse proposed bills with enacted districting laws.** Track enacted date, election applicability, and any transition or effective-date provisions.

**Important discrepancy to resolve:** BetterGov's public sources page currently describes **256 mapped districts** in one coverage summary, whereas COMELEC's 2025 seat allocation and the strict HGAB view use **254**. The BetterGov coverage also mixes different summary statistics (such as 417 non-party-list congressmen). Before using these as validation totals, determine whether they count aliases, historical entities, jurisdictions, or other records differently. Do not force these counts to agree without inspecting the underlying data and version.

## 5. Sources and data-acquisition options

| Option | Data/use | Strengths | Limitations and validation needed | Priority |
| --- | --- | --- | --- | --- |
| **A. PSA PSGC masterlist (2026)** | Complete region/province/city-municipality/barangay identities and PSGC codes | Authoritative national geographic classification; foundational joins | **No direct geographic LEG mapping**; handle code/name/parent changes over time | **1 — mandatory foundation** |
| **B. UACS/NSCB legislative-district mapping** | Historical municipality/LEG crosswalk | Government-published, already structured | Historical vintage, possible gaps, insufficient coverage of barangay splits; must inspect workbook and effective period | **1 — ingest as seed/check** |
| **C. COMELEC 2025 geographic seat data and official congressional results** | Seat roster and electoral geography for 2025; potential precinct-level evidence | Directly connected to the 20th Congress baseline; useful for confirming which legislative constituency contests a location | Election-result summaries are not always exhaustive **barangay boundary definitions**; precinct or local election records may be required | **1 — current LEG baseline** |
| **D. Enacted apportionment laws + COMELEC resolutions** | Official descriptions of district components, reorganizations, and exceptions | Strongest legal provenance for disputed or changed geography | Dispersed documents; parsing and effective-date tracking required | **1 for exceptions, 2 for comprehensive review** |
| **E. BetterGov open congressional mapping / PH location DB** | Existing municipality-/barangay-to-district mappings, validation scripts and roster | Extensive reusable work; potentially avoids a rebuild | Derived/composite dataset, uneven coverage, public count inconsistency; needs independent verification | **1 — compare and reuse cautiously** |
| **F. Community election datasets (e.g., `ph-elections2025`)** | Machine-readable electoral results and location aliases | Easier ingestion, cross-checking and prototyping | Must audit origin and coverage; not automatically an official district-boundary source | **2 — corroboration** |
| **G. Precinct-to-barangay assignments and COMELEC election statistics** | Locate voters/precincts inside specific congressional contests | Particularly useful for cities split into several LEGs | Precincts can reorganize; election administration geography may not perfectly match current PSGC snapshots | **2 — targeted split-city resolution** |
| **H. GIS/GeoJSON boundaries and official maps** | Spatial tests of district polygons, barangays and project points/segments | Powerful for coordinates and visualization | Coverage, geometry quality, vintage and legal status must be established | **3 — spatial enrichment** |
| **I. Historical House/COMELEC rosters and electoral maps** | Crosswalk across older Congresses | Useful for year-specific budget analysis | Requires explicitly versioned boundaries and offices | **3 — historical extension** |
| **J. DEO↔LEG crosswalk from DPWH/BetterGov** | Maps administrative offices to potentially multiple electoral districts | Helpful for office-oriented discovery and audit flags | **Not a location-to-LEG authority**; many-to-many and incomplete; no automatic budget attribution | **Separate downstream module** |
| **K. Councilor-district datasets** | Potential local corroboration in very specific cities | Occasionally shared geography | Councilor and congressional districts are different objects; cannot substitute for option C/D | **Not a primary source** |

### 5.1 Important discovery: UACS already has a downloadable spreadsheet

The UACS *Legislative District Mapping* page has a download whose discovered target is an **Excel (`.xlsx`) workbook**, not necessarily a PDF:

- Landing page: https://uacs.gov.ph/resources/legislative-district-mapping
- Direct linked file: https://uacs.gov.ph/downloads/resources/nscb/NSCB%20-%20Municipality%20with%20Legislative%20Districts.xlsx?view=download
- UACS explanation: https://uacs.gov.ph/primer/56/location-codes

This is likely preferable to OCR **for that particular source**. Inspect sheet names, raw fields, actual row granularity, dates and old codes before assuming it is complete or current. The filename indicates municipality mapping; verify whether any splits at barangay level are actually represented.

### 5.2 Official PSGC baseline

- PSA PSGC downloads and API/documentation: https://psa.gov.ph/classification/psgc/
- PSA latest releases index: https://psa.gov.ph/classification/psgc/index
- As of this document, PSA lists the **30 September 2026 (Q3 2026)** PSGC release. The Q2 2026 update reported **42,010 barangays**, **1,493 municipalities**, **82 provinces**, and **18 regions**; update/reconcile against the actual Q3 masterlist before computing final coverage.

**Note:** geographic hierarchy includes HUCs, independent component cities and NCR edge cases; do not require every city to have a province parent when PSGC indicates otherwise.

### 5.3 COMELEC, laws, and 2025 election records

- COMELEC seat allocation, Resolution 11050 (PDF): https://www.comelec.gov.ph/php-tpls-attachments/References/ComelecResolutions/BARMM/com_res_11050.pdf
- Alternative legal-text/PDF source for Resolution 11050: https://lawphil.net/administ/comelec/comres2024/comres_11050_2024.pdf
- EMBO district apportionment, Resolution 11069 (PDF): https://lawphil.net/administ/comelec/comres2024/comres_11069_2024.pdf
- COMELEC 2025 precinct/voter statistics (PDF): https://www.comelec.gov.ph/php-tpls-attachments/2025NLE/Statistics/CONSOLIDATED_2025_Number_Of_Registered_Voters.pdf
- Official legislative research/library entry point: https://issuances-library.senate.gov.ph/

**Practical election-results option:** extract **House district contests and constituency labels** from official results first. Then use municipality and, where necessary, precinct/barangay election geography to recover the district component areas. A candidate or winner list alone does not prove every barangay's membership.

### 5.4 Existing BetterGov and open-source resources

- BetterGov public source inventory: https://visualizations.bettergov.ph/sources?hl=en-US
- BetterGov repository: https://github.com/bettergovph/open-data-visualization
- Existing strict legislative-geography view: https://visualizations.bettergov.ph/static/nep-preview/congress.html
- District mapping file: https://github.com/bettergovph/open-data-visualization/blob/main/static/data/districts_generated.json
- Strict matching implementation: https://github.com/bettergovph/open-data-visualization/blob/main/analysis/strict_congress_geography.py
- 20th Congress roster: https://github.com/bettergovph/open-data-visualization/blob/main/static/data/20th_congress_representatives.json
- Community 2025 election data: https://github.com/klescosia/ph-elections2025
- Geographic geometry: https://github.com/OSSPhilippines/geoph

BetterGov's published documentation claims substantial municipality and city-barangay district coverage, which is useful as a **comparison dataset**, not final proof. Its own strict HGAB view requires agreement between local maps, explicitly excludes unresolved/shared records, and cautions that this agreement does not amount to independent official boundary verification.

## 6. Prior PSGC2LEG prototype: what was done and what remained incomplete

An earlier prototype/draft PR for reusable **PSGC2LEG** mapping was described in our discussion as:

- **1,766 municipality-level source entries**;
- **3,014 city-barangay source entries**;
- **name-based provisional indexing**;
- **no populated numeric PSGC lookup layer** yet;
- CI/tests passing on the draft PR at the time of discussion.

These are **prototype source-entry counts**, not a claim that it covers all extant municipalities or barangays, nor a claim that all 254 geographic districts are verified. The repository/PR state should be checked before treating the draft as current or merged.

A targeted unresolved audit identified **61 cases**:

| Place | Unresolved cases (earlier audit) |
| --- | ---: |
| Bulacan | 16 |
| Quezon City | 23 |
| Agusan del Norte | 11 |
| Caloocan | 11 |
| **Total** | **61** |

These figures are **an audited subset, not the full national exception count**. Broader unresolved work includes bringing in 2026 numeric PSGC codes, reconciling 2023 vs. 2026 references, covering all 254 LEGs, and handling roads or projects crossing multiple legislative districts.

**Decision coming out of this:** stop treating the provisional name index as the final crosswalk. Construct canonical PSGC entity tables and a versioned assignment table, and resolve disagreements with cited electoral/legal sources.

## 7. How the electoral-results approach would work

We considered extracting data from **2025 congressional election results** rather than attempting to reverse-engineer legislative geography from councilor districts.

Suggested method:

1. Enumerate each **2025 geographic House constituency** from official COMELEC data, keeping province/city context and district label (not merely ordinal values such as `1st`).
2. Normalize the contest or seat identity into a stable **LEG ID** and reconcile the number of unique geographic seats to **254**.
3. Link **municipalities or lone-district cities** when the evidence clearly identifies a whole-unit legislative assignment.
4. For **multi-district cities**, obtain appropriate electoral-area, precinct-to-barangay, official apportionment-law, or COMELEC-resolution evidence before assigning barangays.
5. Cross-check with the UACS workbook and existing BetterGov maps; emit a **conflict report** on differences.
6. Confirm effective date and congressional period; store source URLs and, ideally, raw file hashes.

**Limitations:** published returns may identify the contest but not list every constituent barangay. A precinct-level election result, absent a documented precinct→barangay mapping, is not enough to establish the full barangay map. Administrative city boundaries and congressional district boundaries can also have transition cases.

## 8. Proposed canonical data hierarchy and schema

Build separate, versioned datasets rather than collapsing everything into one string-keyed JSON file.

```text
PSGC master (by release)
  └── Region
      └── Province or independent city as officially modeled
          └── City / Municipality
              └── Barangay

LEG catalog (by election/congress)
  └── Geographic legislative district
      └── Source-backed PSGC assignments
          ├── whole city/municipality (when unambiguous)
          └── individual barangays (where necessary)

Separate overlays
  ├── LEG ↔ representative, with term dates
  ├── DEO ↔ LEG, many-to-many, with relationship evidence
  ├── GIS boundaries / spatial features
  └── historical boundary/change events
```

### Minimal publication artifacts

| Dataset | Example fields | Purpose |
| --- | --- | --- |
| `psgc_locations` | `psgc_code`, `name`, `type`, `parent_code`, `psgc_release`, `aliases`, `valid_from`, `valid_to` | Geographic source of truth |
| `legislative_districts` | `leg_id`, `jurisdiction`, `label`, `congress`, `election_year`, `effective_from`, `effective_to`, `legal_refs` | Unique district identities and versions |
| `psgc_leg_assignments` | `psgc_code`, `leg_id`, `assignment_granularity`, `valid_from`, `valid_to`, `source_ref`, `verification_status`, `review_note` | Auditable one-to-LEG assignment rows |
| `source_register` | `source_id`, `url`, `publisher`, `document_date`, `retrieved_at`, `hash`, `scope`, `notes` | Provenance and reproducibility |
| `mapping_conflicts` | `psgc_code`, `competing_leg_ids`, `sources`, `reason`, `resolution_status` | Unresolved differences |
| `representative_terms` | `leg_id`, `person_id`, `name`, `term_start`, `term_end`, `source_ref` | Dated people/seat linkage |
| `deo_leg_links` | `office_id`, `leg_id`, `relationship_type`, `source_ref`, `confidence` | Optional downstream administrative ↔ electoral crosswalk |

**Recommended rule:** assign a barangay explicitly in a multi-district city; for a unit known to be entirely within one LEG, a whole-municipality/city assignment may be represented once and inherited for constituent barangays. The inheritance must be blocked when authoritative split evidence exists. Do not duplicate all barangay rows unless the export/API requires materialization. **Per the granularity decision:** a multi-LEG city without barangay resolution yet is a valid municipality-level record with status `multi_district_city` (assignments pending at barangay level), not a blocker for the municipality-level release.

**Identifier rules:** Keep PSGC values **as strings**, preserving leading zeros. Use stable, jurisdiction-qualified LEG IDs; do not join on `1st district` alone. Version by the legal/election boundary period as well as the PSGC release because the two may change independently.

### Example (illustrative schema, **not** an assertion about a real barangay)

```json
{
  "psgc_code": "<10-digit-PSGC-code>",
  "leg_id": "leg:sample-jurisdiction:1st:2025",
  "assignment_granularity": "barangay",
  "effective_from": "2025-05-12",
  "effective_to": null,
  "source_ref": "comelec-or-law-document-id",
  "verification_status": "officially_verified",
  "review_note": null
}
```

Possible statuses: `officially_verified`, `cross_checked`, `provisional_name_match`, `disputed`, `unresolved`, `historical_only`.

## 9. Related DEO↔LEG work and why it stays separate

We previously reviewed the BetterGov `static/nep-preview/congress.html` DEO-to-LEG table and drafted a **many-to-many** JSON crosswalk, described in `DEO_LEG_Mapping_Methodology.md`, with `deo_leg_crosswalk_draft.json` as the output.

That source extraction contained **108 relationship rows**, **47 distinct office/group labels** (46 DEOs plus BARMM grouping), and **98 unique LEG labels**. Thirty office/group labels referenced multiple LEGs, and ten LEGs referenced multiple offices/groups. The work was a **partial research crosswalk**, not a complete or authoritative DPWH service-area map. It drew on an undated scanned `DPWH per district.pdf`, so its source allocations must not be assumed to be FY2027 figures. The 20th Congress representative joins also had unmatched labels, including Taguig 1st/2nd and General Santos City lone district, that required manual alias/legal review.

This reinforces why **DEO → LEG must not be collapsed to a single relationship**:

- A DEO can serve several legislative districts.
- A legislative district can be served by several DEOs.
- A DPWH project can cross more than one LGU or LEG.
- A representative associated with a district does not thereby become the office responsible for a project, its budget sponsor, or recipient.

For the budget workbench, first derive **project geography → PSGC → LEG** only when supported. A separate **DEO → candidate LEG(s)** association is suitable for filtering and investigation but **not** a substitute for identifying the location of an individual project.

## 10. Open problems and decisions still needed

| Issue | Why it matters | Suggested resolution |
| --- | --- | --- |
| UACS file vintage and coverage | Historic district boundaries could be copied into a current map | Parse metadata and compare against COMELEC 2025 and apportionment laws |
| 254 official seats vs BetterGov 256 mapped | A base-count discrepancy invalidates simplistic coverage claims | Diff normalized LEG IDs and distinguish historical, duplicate and alias labels |
| Older PSGC codes vs 2026 codes | Merged/renamed/recoded barangays can break joins | Version the PSGC master and maintain an explicit change/alias ledger |
| Bulacan / Quezon City / Caloocan / Agusan del Norte exceptions | Audited prototype conflicts concentrated here | Use legal definitions, COMELEC 2025 records and official barangay lists for focused review |
| Taguig/Makati EMBO transfer | Administrative and electoral geography shifted | Apply COMELEC Resolution 11069 with the correct effective period |
| General Santos / South Cotabato and Butuan / Agusan del Norte | Cities and neighboring provinces may have distinct seats/labels | Use jurisdiction-qualified LEG IDs and legal/electoral source checks |
| Whole municipality versus barangay split | Overgeneralization can misattribute all projects in a city | Require barangay-granular assignment whenever a city is split |
| Elections as mapping source | A contest label does not always enumerate its complete geography | Link official contest → precinct/barangay, or use legal boundary schedule |
| Legislative district vs councilor district | Similar-looking ordinals could be misread as equivalent | Model them separately and explicitly prohibit blind substitutions |
| Unmatched/homonymous place strings | Same locality names recur under different parents | Require parent code, geographic type, aliases and source evidence |
| Roads/multi-place projects | Project descriptions may span multiple LEGs | Preserve `multi_district`/`unresolved`; apportion only with defensible segment data |
| Boundary dates and representative terms | A seat and its occupant are time-dependent | Store effective dates and congressional/election release labels |
| Geometry accuracy | GeoJSON polygons may be generalized or stale | Treat spatial matches as provisional until checked against official electoral maps |
| Coverage statistics | Counts can inflate when aliases or source entries are mistaken for unique IDs | Report distinct PSGC units and unique current LEG IDs separately |

## 11. Recommended implementation plan

### Phase 0 — Inventory and preserve the sources

- [ ] Download/archive PSA **Q3 2026 PSGC** and record source URL and checksum.
- [ ] Download/inspect the **UACS NSCB municipality–LEG workbook** (it is an XLSX link).
- [ ] Acquire official **2025 COMELEC geographical constituency/House-election source material**; inspect which fields are machine readable.
- [ ] Archive Resolution 11050, Resolution 11069 and applicable local apportionment laws.
- [ ] Obtain and snapshot BetterGov `districts.json`, `districts_generated.json`, and the current 20th Congress roster.
- [ ] Document file dates, publisher, hash and legal/election coverage.

**Deliverable:** `sources.json` (or CSV), source archive, and a coverage matrix.

### Phase 1 — Build the root location catalog

- [ ] Parse PSGC into region/province/city-municipality/barangay entities.
- [ ] Keep numeric PSGC identifiers as strings, including leading zeros.
- [ ] Normalize labels and aliases without destroying original official names.
- [ ] Track changes from earlier PSGC versions and flag unresolved cross-vintage joins.

**Deliverable:** fully testable canonical PSGC lookup; no legislative mapping required yet.

### Phase 2 — Establish the 2025 LEG catalog

- [ ] Extract official geographic House seats and reconcile to **254**.
- [ ] Establish jurisdiction-qualified district keys and source citations.
- [ ] Annotate districts established or redefined by districting laws and COMELEC issuances.
- [ ] Cross-check against existing roster and BetterGov 254/256 discrepancy.

**Deliverable:** `legislative_districts.json` with stable current-period LEG IDs.

### Phase 3 — Produce source-backed PSGC→LEG links

- [ ] Import municipality-level assignments from UACS and existing mappings **as candidates**.
- [ ] Verify whole-unit assignments against 2025 election/legal sources.
- [ ] **Priority order (per granularity decision):** (a) complete all whole-unit municipality/city assignments nationwide first; (b) then resolve barangay splits for multi-district cities **outside NCR** (e.g., Caloocan, Butuan, GenSan as flagged); (c) NCR barangay splits (QC, Manila, etc.) are **optional** and may be delivered separately or deferred without blocking the municipality-level release.
- [ ] Build a reproducible `mapping_conflicts` report and human-review ledger.
- [ ] Do not auto-resolve ambiguous names based on nearest name similarity.

**Deliverable:** `psgc2leg_2025.json` or tabular equivalent, with assignment confidence/provenance.

### Phase 4 — Validate and publish

- [ ] Confirm unique current LEG count; distinguish no-match, conflict, historic-only, and multi-LEG cases.
- [ ] Verify representative samples of whole municipalities, split cities and all known exception areas.
- [ ] Report coverage with **municipality/city completeness as the primary metric** (denominator: 1,493 municipalities + cities per PSGC). Barangay-granularity coverage is reported separately and may be partial (non-NCR prioritized, NCR optional) without failing the release.
- [ ] Publish simple lookup CLI/API and deterministic regeneration/tests.
- [ ] Make the dataset and source registry independently usable by BetterGov, budget dashboards and other projects.

**Deliverable:** documented PSGC2LEG release with validation report.

### Phase 5 — Optional downstream enrichments

- [ ] Add historical Congress versions for cross-year budget comparisons.
- [ ] Add official/verified GeoJSON boundaries and point/line/area intersection support.
- [ ] Connect to DEO↔LEG links without confusing implementing office and project location.
- [ ] Add dated representative rosters for UI display and independent filtering.
- [ ] Expose `unresolved`/`multi_district` classifications in budget dashboards rather than forcing single-district attribution.

## 12. Candidate acceptance tests

The minimum viable release should test that:

1. Each referenced PSGC code exists in the claimed PSGC snapshot; parent/child hierarchy is internally valid.
2. Each linked LEG exists in the correct election-period LEG catalog.
3. The current **2025 baseline consists of 254 geographic seats**; party-list seats are excluded from PSGC2LEG geography.
4. Any PSGC unit linked to two different LEGs is explicitly represented as a split/exception or a conflict, never silently overwritten.
5. A whole-unit city/municipality assignment is **not inherited** into barangays in a known multi-LEG city without supporting evidence.
6. **Release gate (municipality level):** every PSGC municipality/city is either assigned to exactly one LEG, explicitly marked `multi_district_city` (e.g., Taguig, Caloocan, Butuan, General Santos), or listed as an open conflict — no silent gaps.
7. Barangay-level tests (EMBO via Resolution 11069, QC/Caloocan splits) apply **only to whatever barangay coverage is shipped**; partial or absent NCR barangay data must not fail the municipality-level release.
8. Unmatched entries remain visible in machine-readable QA output.
9. Mapping includes source provenance, election applicability, verification status and stable IDs.
10. Project geography, DEO associations and representative identities remain distinct.
11. Reported coverage uses a defined denominator (municipalities + cities for the primary metric; barangays reported separately), excludes duplicate source rows, and identifies provisional versus verified coverage.

## 13. Bottom line — our options in one sentence each

- **Fastest seed:** parse the already published **UACS XLSX** and existing BetterGov files — fast, but insufficient alone for the current map.
- **Best authoritative 2025 baseline:** COMELEC **congressional constituency/election geography** plus the 254-seat allocation — current, but may require supplemental source material for barangays.
- **Best legal resolution of ambiguous boundaries:** enacted **reapportionment laws and COMELEC resolutions** — authoritative, but time-consuming to assemble and normalize.
- **Best canonical entity spine:** the latest **PSA PSGC** — comprehensive identifiers, but it does not contain a LEG field.
- **Best targeted method for split cities:** official **barangay/precinct geography** and districting schedules — more effort, but resolves the most damaging ambiguities.
- **Best way to avoid duplicative work:** validate and contribute back improvements to **BetterGov mapping datasets**.
- **Best optional geographic extension:** verified GIS polygons for spatial lookup and cross-boundary projects.
- **Not recommended as a primary shortcut:** inferring congressional districts from **councilor districts, DEO names, road names, or representative names alone**.

**Selected approach:** build **PSGC foundation → 2025 LEG catalog → sourced PSGC2LEG assignments**, use UACS and BetterGov for seeding/cross-checking, use COMELEC/legal evidence to resolve exceptions, and maintain a separate versioned DEO↔LEG and representative layer. Publish unresolved cases honestly rather than manufacture national completeness.

---

## References and working links

**Official government sources**

1. [PSA Philippine Standard Geographic Code](https://psa.gov.ph/classification/psgc/)
2. [PSA PSGC latest releases](https://psa.gov.ph/classification/psgc/index)
3. [UACS Legislative District Mapping](https://uacs.gov.ph/resources/legislative-district-mapping)
4. [UACS downloadable municipality–legislative district XLSX](https://uacs.gov.ph/downloads/resources/nscb/NSCB%20-%20Municipality%20with%20Legislative%20Districts.xlsx?view=download)
5. [UACS Location Codes FAQ](https://uacs.gov.ph/primer/56/location-codes)
6. [COMELEC Resolution 11050: 2025 election seat allocation](https://www.comelec.gov.ph/php-tpls-attachments/References/ComelecResolutions/BARMM/com_res_11050.pdf)
7. [COMELEC Resolution 11069: EMBO barangay apportionment](https://lawphil.net/administ/comelec/comres2024/comres_11069_2024.pdf)
8. [COMELEC 2025 precinct and voter statistics](https://www.comelec.gov.ph/php-tpls-attachments/2025NLE/Statistics/CONSOLIDATED_2025_Number_Of_Registered_Voters.pdf)
9. [Senate legislative issuances library](https://issuances-library.senate.gov.ph/)

**Existing code and comparison data**

10. [BetterGov sources page](https://visualizations.bettergov.ph/sources?hl=en-US)
11. [BetterGov open-data-visualization](https://github.com/bettergovph/open-data-visualization)
12. [BetterGov strict congressional-geography / DEO crosswalk view](https://visualizations.bettergov.ph/static/nep-preview/congress.html)
13. [BetterGov generated district data](https://github.com/bettergovph/open-data-visualization/blob/main/static/data/districts_generated.json)
14. [BetterGov strict geography script](https://github.com/bettergovph/open-data-visualization/blob/main/analysis/strict_congress_geography.py)
15. [2025 community election data](https://github.com/klescosia/ph-elections2025)
16. [OSSPhilippines GeoPH](https://github.com/OSSPhilippines/geoph)

**Documentation note:** This document combines discussion outcomes and spot-checked publicly accessible references as of **25 October 2026**. It is a roadmap, not a declaration that every source has been fully downloaded, parsed, audited or reconciled.
