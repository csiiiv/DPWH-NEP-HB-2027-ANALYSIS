# DEO2LEG outputs

Published, verified copies of the final DEO ↔ Legislative District artifacts. Read from
here if you only need the data — you do not need to run any build.

| File | What it is |
|------|-----------|
| `deo_leg_crosswalk.json` | **The mapping graph.** Offices ↔ legislative districts ↔ representatives. Structure only; contains **no monetary amounts**. |
| `source_amounts.json` | **The evidence sidecar.** All 264 allocation rows with transcribed amounts and page/row provenance. |
| `MANIFEST.json` | SHA-256 hashes, build provenance, and cross-checks for the two files above. |

Both data files are **byte-identical** to the canonical build outputs
(`DEO2LEG/deo_leg_crosswalk.json` and `DEO2LEG/evidence/source_amounts.json`). They are
copies, not forks: regenerate with `build_mapping.py`, then republish. Never edit them.

```bash
python DEO2LEG/publish_outputs.py          # republish after a build
python DEO2LEG/publish_outputs.py --check  # verify copies == canonical == manifest
```

`--check` exits non-zero if a copy has drifted from the canonical build, if it no longer
matches its manifest hash, or if any build input is newer than the build (i.e. the
published copy is stale).

---

## Read this before consuming the data

**The two files answer different questions and must not be merged casually.**

`deo_leg_crosswalk.json` is a *graph*: which offices are associated with which districts.
`source_amounts.json` is *evidence*: what the source scan printed, row by row. Amounts were
deliberately removed from the graph so the mapping stays reusable across fiscal years; an
amount is a transient fact about one undated document, not a property of a relationship.

Three things the data does **not** support:

1. **No fiscal year.** The underlying scan states none. Do not label these amounts FY2027
   or any other year. `source_amounts.json` records `fiscalYear: null` for this reason.
2. **No attribution of ownership.** An allocation row establishes only that the source table
   linked an office to a district. It does not establish geographic boundaries, project
   ownership, or that a representative requested, sponsored, or controlled anything.
3. **No project-level geography.** A DEO serving three districts does not mean its projects
   split across those three districts. Its money is **one undivided figure** shared by all
   three, and no rule for splitting it is defensible from this data.

Point 3 constrains *how much* a district can be said to hold; it does not forbid an
**office lens** that groups source records by the office the source printed and lists the
districts associated with that office. That use is authorized, with four mandatory
conditions, in [`../README.md`](../README.md) § "The one authorized project-level use: the
DEO lens". In short: label every aggregate Tier A (office serves 1 district — attributable)
or Tier B (office serves 2+ — undivided range, co-served districts named); never divide
Tier B; always publish the unattributable Central/Regional Office residual; carry the
upstream matcher's honesty annotations through. The `#congress` workspace asserts these at
build time.

---

## Crosswalk structure

```jsonc
{
  "schemaVersion": "2.1.0",
  "buildDate": "2026-10-23",
  "status": "complete_table_provisional_verification",
  "metadata":    { "completeness", "relationshipMeaning", "manyToManyEvidence",
                   "sources", "warnings" },
  "summary":     { /* counts and coverage, see below */ },
  "validation":  { "betterGovCorroboration", "unresolvedRepresentatives",
                   "rosterSeatCorrectionsApplied", "profileEnrichment",
                   "registryLegacyStatusCounts" },
  "offices":               { "<officeId>": {...} },
  "legislativeDistricts":  { "<districtId>": {...} },
  "relationships":         [ {...} ]
}
```

### Identifiers

- **Office:** `office:bulacan-1st-deo` — slug of the office name.
- **District:** `leg:bulacan:1st` — keyed on the *canonical official-roster* jurisdiction,
  not the DPWH label form. So `NORTH COTABATO (FIRST DISTRICT)` becomes `leg:cotabato:1st`.
  Ids changed between schema 1.0.0 and 2.0.0 for exactly this reason.

### `offices` node

| Field | Notes |
|-------|-------|
| `name`, `aliases` | Display name; `aliases` carries variant spellings from sources. |
| `type` | `district_engineering_office` (211), `regional_group` (1), `sub_district_engineering_office` (1). |
| `region`, `regionCode`, `projectCode` | `regionCode`/`projectCode` come from the DPWH registry and may be `null`. |
| `legislativeDistrictIds` | **Empty array for the 13 legacy offices, by design.** |
| `legacy` | Present only on legacy offices: `status`, `candidateSuccessors`, `note`. |
| `evidence` | `inAllocationTable`, `registryMatch`, `registryMatchType`. |

`type: "regional_group"` is **BARMM** only. It is a regional grouping appearing in the
allocation table, not a single engineering office — it links to 6 districts. Do not treat
it as one office when counting.

The **13 legacy offices** exist in the DPWH project-code registry but not in the allocation
table. They are emitted flagged and unlinked, with candidate successors listed but **no
relationships created** — inheriting a project code across an unverified office split would
fabricate structure. Their `legacy.status` values: 8 `superseded_by_split`, 2
`numbering_variant`, 1 `renamed_province`, 1 `spelling_variant`, 1 `registry_only`.

### `legislativeDistricts` node

| Field | Notes |
|-------|-------|
| `jurisdiction`, `canonicalJurisdiction` | Source-cased and folded forms. |
| `districtLabel`, `displayName`, `sourceLabels` | `sourceLabels` preserves every DPWH label form seen. |
| `region` | From the allocation table's Region column. |
| `representative` | See below. |
| `officeIds` | Reverse links to offices. |

### `representative` block

`resolutionStatus` is the field to branch on:

| Value | Count | Meaning |
|-------|-------|---------|
| `resolved` | 252 | Single verified representative; carries `profile`. |
| `ambiguous_multiple_listed` | 2 | congress.gov.ph lists two reps. `name` is `null` — **no winner was chosen**. Use `candidates` + `candidateProfiles`. |
| `not_found_in_roster` | 0 | District in the table but unmatched in the roster. Does *not* imply a vacancy. |

Resolved blocks carry `name`, `officialSeat`, `leadershipRoles`,
`verifiedAgainstOfficialDirectory`, `verificationSource`, `verifiedDate`, and `profile`.

> **`verifiedAgainstOfficialDirectory`, not "independently verified."** The roster and the
> scraped profiles are two extraction pipelines over the *same* congress.gov.ph page. They
> agree exactly on all 324 `(seat, name)` pairs, which rules out a parser defect in either —
> but a site error would appear in both. This is cross-pipeline agreement, not independent
> verification. The field was renamed from `independentlyVerified` in schema 2.1.0 because
> the old name overclaimed.

`profile` (present on all 252 resolved districts):

```jsonc
{
  "memberCode": "K029",                       // stable congress.gov.ph member key
  "officialName": "Domingo, Danilo \"Danny\" A.",
  "detailUrl": "https://www.congress.gov.ph/house-members/view/K029",
  "photoFile": "domingo-danilo-danny-a.jpg",
  "photoPath": "legislative_profiles/photos/domingo-danilo-danny-a.jpg",
  "positionType": "District Representative",
  "source": "congress.gov.ph/house-members (scraped member directory)",
  "capturedDate": "2026-10-22"
}
```

### The two ambiguous seats

Both carry `candidateProfiles` — one profile per candidate, so you can render both without
picking:

- `leg:antipolo-city:2nd` — Acop, Philip Conrad "Dok Bong" M. (`L104`) / Acop, Romeo M. (`G002`)
- `leg:cavite:4th` — Austria-Barzaga, Jennifer (`I007`) / Barzaga, Francisco "Kiko" A. (`L096`)

These are succession or election-protest situations. A third seat, Southern Leyte 1st, was
listed as ambiguous in earlier builds; that was a roster **parser artifact**, not a real
ambiguity. It now resolves to Mercado, Roger Gaviola. See `DEO2LEG/README.md`.

### `relationships` array

One entry per allocation-table row (264). Each carries `officeId`, `legislativeDistrictId`,
`region`, and an `evidence` array with `type: "allocation_table_row"`, `sourceRow`,
`sourcePage`, `underlyingDocumentFiscalYear: null`, and an explicit `note` restating that the
row establishes association only.

### Many-to-many is real, not an edge case

- **33 offices** span more than one district (e.g. `office:aklan-deo` → Aklan 1st + 2nd).
- **10 districts** are served by more than one office (e.g. `leg:apayao:lone` ← Apayao 1st + 2nd DEO).
- **65 rows** have a DEO ordinal differing from the district ordinal (e.g. `Pangasinan 4th
  DEO` serves `PANGASINAN (THIRD DISTRICT)`). This is genuine in the source — **office
  numbers cannot be used to infer districts.**

---

## Sidecar structure

```jsonc
{
  "schemaVersion": "2.1.0",
  "amountUnit": "thousand_PHP (null = dash in source; NOT a confirmed zero allocation)",
  "underlyingDocument": {
    "file": "DPWH per district.pdf", "pages": 9,
    "provenance": "PCIJ-sourced scan provided by BetterGov",
    "fiscalYear": null,
    "fiscalYearNote": "The document states no fiscal year. Do not assume one."
  },
  "extractionProvenance": { "primary", "corroboratedBy", "crossCheckedAgainst", "validator" },
  "summary": { /* 264 rows, 262 non-dash, 2 dash, ₱440,610,663 thousand */ },
  "totalsByRegion": { ... },
  "rows": [ ... ]
}
```

Row fields: `sourceRow`, `sourcePage`, `rowOnPage`, `region`, `officeName`,
`legislativeDistrictLabel`, `amountThousandsPHP`, `dashInSource`, `millionPesoDisplay`,
`notes`.

> **Two rows print a dash, not an amount** (`Taguig City (Second District)`, `City of Makati
> (Second District)`). They are encoded `amountThousandsPHP: null` with `dashInSource: true`
> — never `0`. Filtering on `amount == 0` would misread a dash as a confirmed zero
> allocation. Filter on `dashInSource` instead.

Amounts are in **thousands of pesos**. `millionPesoDisplay` reproduces the scan's own
"1,346.4M" formatting for comparison against the source.

---

## Path resolution caveat

Files are copied byte-for-byte, so **relative paths inside them still resolve from the
`DEO2LEG/` root, not from `outputs/`**. The only such field is
`representative.profile.photoPath`:

```
"legislative_profiles/photos/domingo-danilo-danny-a.jpg"
 → DEO2LEG/legislative_profiles/photos/domingo-danilo-danny-a.jpg
```

The 324 portraits (44MB) are **not** copied into `outputs/` — they are scraped inputs, not
outputs. Resolve `photoPath` against `DEO2LEG/`, or against the repo root as
`DEO2LEG/<photoPath>`.

Rewriting the JSON to make those paths `outputs/`-relative would break byte-identity and
invalidate every hash in the manifest, so it is deliberately not done.

---

## Coverage summary

| Metric | Value |
|--------|-------|
| Schema version | `2.1.0` |
| Allocation rows / relationships | 264 |
| Offices | 213 (200 in table + 13 legacy) |
| Legislative districts | 254 |
| Representatives resolved | 252 |
| Representatives ambiguous | 2 |
| Representatives not found | 0 |
| Resolved districts with a profile | 252 / 252 |
| Portraits present locally | 324 / 324 |
| Total allocation | ₱440.61B (thousands: 440,610,663) |
| Dash rows | 2 |

254 districts is a 1:1 match with the 254 geographic House seats of the 20th Congress.

---

## Verification

The numbers above are not assertions — they are re-derived and enforced on every build.

```bash
python DEO2LEG/publish_outputs.py --check                 # copies == canonical == manifest
python -m pytest DEO2LEG/test_deo_leg_mapping.py -q       # 80 invariant tests
python DEO2LEG/validate_sources.py                        # three-way source validation
```

`validate_sources.py` cross-checks three extractions of the same scan. BetterGov's 108-row
subset reproduces exactly (106/106 numeric rows match on office name *and* amount, 0
unmatched). A third independent local OCR pass agrees on 175 of 181 distinct amounts, and
every one of the 6 disagreements is *proved* to be an OCR digit error in the local pass
rather than a data conflict.

73 of the 80 tests guard a defect that was actually found and fixed — city/province
merging, registry substring false positives, dropped leadership-prefixed seats, the
invented Southern Leyte representative, profile join correctness. The other 7 guard the
DEO-lens attribution policy authorized in `DEO2LEG/README.md` § Disclaimers (tier census,
BARMM never counted as a district office, Tier B districts named on both sides, ambiguous
seats choosing no representative). See `DEO2LEG/README.md` for the full list.

---

## Deliberately not published

| Path | Why |
|------|-----|
| `legislative_profiles/photos/` | 44MB of scraped portraits; inputs, referenced by `photoPath`. |
| `deo_leg_crosswalk_draft(1).json` | Superseded schema `0.1.0` draft (108-row partial crosswalk). Retained as a historical artifact. |
| `legislative_profiles/state/`, `CONGRESS_WEB/`, `*.html`, `cf_cookies.json` | Gitignored. Scratch browser profile, raw page capture, and **live session credentials**. |

## Related docs

- [`../README.md`](../README.md) — pipeline, sources, defects found and fixed, limitations.
- [`../DEO_LEG_Mapping_Methodology.md`](../DEO_LEG_Mapping_Methodology.md) — reasoning, what the mapping should and should not be used for.
- [`MANIFEST.json`](MANIFEST.json) — hashes, build inputs, cross-checks.
