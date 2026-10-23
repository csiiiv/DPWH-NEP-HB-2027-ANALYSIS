# DEO ↔ Legislative District Mapping

A general-purpose many-to-many mapping connecting DPWH District Engineering Offices
(DEOs) to Philippine legislative districts (LEGs), for reuse across projects, tools
and dashboards.

**Current state:** schema `2.1.0`, built from the complete 264-row allocation table —
200 offices, 254 districts, 264 relationships. Representatives are verified against the
official congress.gov.ph directory (252 resolved, 2 ambiguous surfaced) and enriched with
scraped member profiles (`member_code`, profile URL, portrait).

## Files

| File | Role |
|------|------|
| `deo_leg_crosswalk.json` | **Output (canonical).** Clean mapping graph. No amounts. |
| `evidence/source_amounts.json` | **Output (canonical).** All 264 allocation rows with amounts + provenance. |
| `outputs/` | **Published copies** of both outputs + `MANIFEST.json` (SHA-256) + a consumer guide. Read from here if you only need the data. |
| `publish_outputs.py` | Copies both outputs into `outputs/` byte-identically, writes the manifest, verifies. `--check` mode for CI. |
| `DPWH_per_district_extracted.csv` | **Input (primary).** Complete transcription of the scan. |
| `DPWH_per_district_extracted.json` | Same data, JSON form (includes `amount_as_printed`). |
| `sources/` | Vendored pinned sources (see below). |
| `build_mapping.py` | Rebuilds both outputs from the vendored inputs. |
| `join_districts.py` | Shared district-name normalisation + representative join. |
| `build_official_roster.py` | Rebuilds the official roster from the House directory dump. |
| `leg_profiles.py` | Lookup over scraped member profiles (member_code, URL, photo). |
| `legislative_profiles/` | Scraped congress.gov.ph member directory + 324 portraits. |
| `validate_sources.py` | Three-way source validation (see Validation). |
| `test_deo_leg_mapping.py` | 80 invariant tests. 73 guard a defect actually found and fixed; 7 guard the DEO-lens attribution policy (see Disclaimers). |
| `evidence/pdf_table_rows.json` | Retained third-party OCR pass, used only as a cross-check. |

## Schema

```json
{
  "schemaVersion": "2.1.0",
  "offices": {
    "office:bulacan-1st-deo": {
      "name": "Bulacan 1st DEO",
      "type": "district_engineering_office",
      "region": "Region III",
      "regionCode": "C",
      "projectCode": "C",
      "aliases": ["Bulacan 1st DEO"],
      "legislativeDistrictIds": ["leg:bulacan:1st", "leg:bulacan:2nd", "leg:bulacan:5th"],
      "evidence": { "inAllocationTable": true, "registryMatch": "Bulacan 1st DEO" }
    }
  },
  "legislativeDistricts": {
    "leg:bulacan:1st": {
      "jurisdiction": "BULACAN",
      "canonicalJurisdiction": "bulacan",
      "districtLabel": "1st",
      "displayName": "BULACAN (FIRST DISTRICT)",
      "sourceLabels": ["BULACAN (FIRST DISTRICT)"],
      "region": "Region III",
      "representative": {
        "name": "Domingo, Danilo \"Danny\" A.",
        "officialSeat": "Bulacan, 1st District",
        "leadershipRoles": [],
        "verifiedAgainstOfficialDirectory": true,
        "verificationSource": "congress.gov.ph/house-members",
        "verifiedDate": "2026-10-22",
        "resolutionStatus": "resolved",
        "profile": {
          "memberCode": "K029",
          "officialName": "Domingo, Danilo \"Danny\" A.",
          "detailUrl": "https://www.congress.gov.ph/house-members/view/K029",
          "photoFile": "domingo-danilo-danny-a.jpg",
          "photoPath": "legislative_profiles/photos/domingo-danilo-danny-a.jpg",
          "positionType": "District Representative",
          "source": "congress.gov.ph/house-members (scraped member directory)",
          "capturedDate": "2026-10-22"
        }
      },
      "officeIds": ["office:bulacan-1st-deo"]
    }
  },
  "relationships": [
    {
      "officeId": "office:bulacan-1st-deo",
      "legislativeDistrictId": "leg:bulacan:1st",
      "region": "Region III",
      "evidence": [{
        "type": "allocation_table_row",
        "sourceRow": 76,
        "sourcePage": 3,
        "underlyingDocumentFiscalYear": null
      }]
    }
  ]
}
```

`representative.resolutionStatus` is one of `resolved`,
`ambiguous_multiple_listed`, or `not_found_in_roster`. Ambiguous seats list all
candidates and deliberately pick none.

## How It Works

1. **Primary source** — `DPWH_per_district_extracted.csv`: the complete 264-row
   transcription of `DPWH per district.pdf` (9-page scan, PCIJ-sourced). Supplies
   region, DEO name, district label, amount, and page/row provenance.

2. **Registry codes** — `sources/dpwh-project-code-mapping@38fe1cf2.json` (182 DEO
   codes, 19 regions) is matched by **accent-insensitive exact name only**.
   Substring matching is rejected: it once linked `South Cotabato 1st DEO` to
   `Cotabato 1st DEO`, which are different provinces.

3. **Representatives** — `sources/official_house_roster_2026-10-22.json`, the
   congress.gov.ph 20th Congress directory (254 unique district seats, matching the
   254 districts in the table one-to-one).

4. **Join** — `join_districts.py` bridges DPWH label forms (`CITY OF LAS PIÑAS (LONE
   DISTRICT)`, `NORTH COTABATO (FIRST DISTRICT)`) to roster seat forms (`Las Piñas
   City, Lone District`, `Cotabato, 1st District`).

5. **Profiles** — `leg_profiles.py` enriches each resolved representative with
   `member_code`, `detail_url` and a locally scraped portrait from
   `legislative_profiles/profiles.json`. The join is on the exact `(seat, name)` pair
   with whitespace normalised, **never on name alone**: the same name can appear on both
   a party-list and a district seat (see the Southern Leyte 1st defect below). Ambiguous
   seats get one profile per candidate instead of a chosen winner.

6. **Amounts** — kept entirely out of the graph, emitted only to the evidence sidecar.

## Validation

`python DEO2LEG/validate_sources.py` cross-checks three independent extractions of the
same scan:

- **BetterGov's 108-row subset** reproduces exactly — all 106 numeric rows match the
  full table on both office name and amount, 0 unmatched. BetterGov covered only the
  multi-link subset (29.8% of the table's allocation value).
- **A third, independent local OCR pass** agrees on 175 of 181 distinct amounts. Every
  one of the 6 disagreements is *proved* to be an OCR digit error in the local pass
  (single-digit substitution or spurious inserted digit), not a data conflict.
- The full table's 264 rows contain 0 exact duplicates and 2 dash rows (correctly
  encoded as `null`, never `0`).

`python -m pytest DEO2LEG/test_deo_leg_mapping.py -q` → 80 passed.

## Building / Updating

```bash
python DEO2LEG/validate_sources.py     # optional: re-verify sources
python DEO2LEG/build_mapping.py        # regenerate both canonical outputs
python DEO2LEG/publish_outputs.py      # copy both into outputs/ + write MANIFEST.json
python -m pytest DEO2LEG/test_deo_leg_mapping.py -q
```

`publish_outputs.py --check` verifies `outputs/` without writing: it fails if a copy has
drifted from the canonical build, if it no longer matches its manifest hash, or if any build
input is newer than the build (the published copy would be stale). Both guards are exercised
by the test suite.

**Consumers should read from [`outputs/`](outputs/README.md)** — both artifacts plus a
consumer guide in one directory. One caveat is documented there: files are byte-identical
copies, so `photoPath` values still resolve from the `DEO2LEG/` root, not from `outputs/`.

### Vendored sources

| File | Origin | Purpose |
|------|--------|---------|
| `DPWH_per_district_extracted.csv` | transcription of `DPWH per district.pdf` | **Primary** allocation table (264 rows) |
| `sources/dpwh-project-code-mapping@38fe1cf2.json` | BetterGov `database/` (blob `38fe1cf2`) | DEO project codes, region codes, legacy aliases |
| `sources/deoLegRows@26b3f3f2.json` | BetterGov `static/nep-preview/congress.html` @ `7d8700fe` (blob `26b3f3f2`) | Corroboration only (108-row subset) |
| `sources/house_members_dump_2026-10-22.txt` | text dump of congress.gov.ph/house-members, 2026-10-22 | **Raw input** for the roster builder; contains the authoritative structured member table |
| `sources/official_house_roster_2026-10-22.json` | built by `build_official_roster.py` from the dump above | Representative names, seats, leadership roles |
| `legislative_profiles/profiles.json` | Playwright scrape of the same directory, 2026-10-22 | `member_code`, `detail_url`, `photo_file` per member |
| `legislative_profiles/photos/` | same scrape | 324 locally cached portraits |
| `sources/20th_congress_representatives@4d8b4f64.json` | BetterGov legacy roster | Retained fallback; **stale** Taguig entries |

`legislative_profiles/state/` (scratch Chrome profile), `CONGRESS_WEB/` (raw "Save Page As"
capture), `*.html` (CDP scrape output) and `cf_cookies.json` (Cloudflare/PHP session
credentials) are **gitignored** — large and/or sensitive, and regenerated by `scrape.py`.

## Known Issues and Corrections

These are recorded in the output's `metadata` and `validation` blocks.

**Source-document defects**

- The scan states **no fiscal year**. Amounts must not be assumed to be FY2027 or any
  other year.
- 65 rows have a DEO ordinal differing from the district ordinal (e.g. `Pangasinan 4th
  DEO` serves `PANGASINAN (THIRD DISTRICT)`). This is genuine in the source — office
  numbers cannot be used to infer districts.
- `BARMM` appears as an office-like label but is a regional grouping, not a single
  engineering office. Typed `regional_group`.
- 2 rows print a dash instead of an amount (`Taguig City (Second District)`, `City of
  Makati (Second District)`). Encoded `null`, never `0`.

**Defects found and fixed in this pipeline**

- *Roster parser invented a representative.* The first extraction anchored on
  `District Representative` and silently lost seats carrying a leadership-role prefix —
  `Speaker of the House District Representative Isabela, 6th District` — dropping Isabela
  6th (Bojie Dy). A second extraction fixed that but searched a fixed character window
  *ahead* of each `###### Name` heading. Exactly one heading in the dump has no seat line
  in its own block (`Mendoza, Raymond Democrito C.`), so it borrowed the **next** member's
  seat and fabricated a second representative for Southern Leyte 1st. Mendoza is in fact a
  TUCP party-list member holding no district. The roster is now built from the directory's
  **structured member table** (`| Name | District | Seat |`, repeated 3× in the dump),
  which is authoritative for `(name, kind, seat)`; prose headings supply leadership roles
  only. Both defects are asserted against in the builder and in
  `test_southern_leyte_1st_is_resolved_not_ambiguous`.
- *District canonicalisation merged cities with provinces.* Stripping the token `city`
  wrongly unified `Quezon City` (NCR, 6 districts) with `Quezon` province (Region IV-A,
  4 districts), and `Cebu City` with `Cebu` province — producing 14 bogus "ambiguous"
  matches. `city` is now preserved as distinctive; `test_city_province_not_merged` guards it.
- *`congress.gov.ph` itself mislabels one seat.* It groups Kathryn Joyce Gorriceta under
  `Iloilo City, 2nd District`, but Iloilo City is a **lone** district (Julienne Baronda),
  so a 2nd Iloilo City seat cannot exist. The Wikipedia 20th Congress table places her at
  `Iloilo, 2nd` (province), matching the PDF's `ILOILO (SECOND DISTRICT)`. Corrected in
  `ROSTER_SEAT_CORRECTIONS`; `test_iloilo_seat_correction` guards it.
- *Registry substring matching produced false positives.* `Cotabato City DEO` (a BARMM
  city) matched the **North** Cotabato offices; `Southern Leyte DEO` matched **Leyte**
  offices. Now exact-match only; `test_no_substring_registry_match` guards 6 pairs.

**Deliberately left unresolved**

- **2 seats have two representatives listed** on congress.gov.ph — Antipolo City 2nd
  (Acop, Philip Conrad "Dok Bong" / Acop, Romeo) and Cavite 4th (Austria-Barzaga, Jennifer /
  Barzaga, Francisco "Kiko"). These are succession or election-protest situations. Both
  candidates are recorded with their own `member_code`, profile URL and portrait, and
  neither is chosen, because picking one would assert an outcome this dataset cannot verify.
  (Southern Leyte 1st was previously listed here; that ambiguity was an artifact of the
  parser defect above and is now resolved to Mercado, Roger Gaviola.)
- **13 legacy registry names** are absent from the allocation table and are emitted as
  flagged, unlinked offices carrying a `legacy` block. 8 are `superseded_by_split`, 2
  `numbering_variant`, 1 `renamed_province` (Compostela Valley → Davao de Oro, RA 11297),
  1 `spelling_variant`, 1 `registry_only` (Cotabato City DEO). Candidate successors are
  listed but **no relationships are created** — inheriting a code across an unverified
  split would fabricate structure.
- **Counts are internal to this scrape, not reconciled against any stated House total.**
  The dump declares no member count. It yields 324 distinct people = 256 district entries
  spanning 254 unique seats + 68 party-list. An earlier note claimed "67 party-list versus
  64 implied by a stated 318-member total"; neither figure appears in the source, so the
  claim was dropped rather than carried forward.
- **Taguig reapportionment.** The PDF's `TAGUIG CITY (FIRST DISTRICT)` maps to the official
  seat `Taguig City-Pateros, Lone District` (Ading Cruz); `TAGUIG CITY (SECOND DISTRICT)`
  maps to `Taguig City, 2nd District` (Jorge Daniel Bocobo). Handled by an explicit
  documented override rather than name matching.

## Limitations

- **Not an authoritative jurisdiction map.** The allocation table came from an undated
  scan. It does not prove current DEO service boundaries.
- **Absence is not evidence.** Missing DEO–district pairs do not imply no relationship
  exists.
- **Representatives are point-in-time** — the official directory as of 2026-10-22.
- **Registry vintage predates several office splits** and contains no BARMM entries.

## Disclaimers

- **DO NOT** claim legislative sponsorship or control. Nothing in this mapping
  establishes that a representative requested, sponsored, or controlled any project or
  amount.
- **DO NOT** divide an office's money among the districts it serves. A shared office's
  total is an **undivided** figure. Splitting it — equally, by population, by road
  length, by any rule — fabricates a district-level amount this data cannot support.
- **DO NOT** interpret the amounts as FY2027 (or any year's) budget figures.
- **DO NOT** assume one-to-one correspondence. 10 districts are served by more than one
  office and 33 offices span more than one district; many-to-many is the intended pattern.
- **DO NOT** treat an office's absence from a district as evidence of no relationship.

### The one authorized project-level use: the DEO lens

An earlier version of this section prohibited using the mappings "to assign projects to
DEOs or districts" outright. That was correct about *districts* and wrong about *offices*:
the office that recorded a project is printed on the source row itself, so it needs no
inference from this mapping at all. The prohibition is therefore narrowed rather than
lifted.

**A consumer MAY** group source project records by the office the source documents
printed, and then list the legislative districts this mapping associates with that office.
This is an **office lens**: it answers "which districts does this office's ledger touch,"
not "which district owns this project."

Every such view **MUST** satisfy all four conditions:

1. **Label every aggregate with its attribution tier.** Tier A = the office serves exactly
   one district, so the figure is attributable to that district alone. Tier B = the office
   serves two or more, so the figure is an undivided **range** shared with the named
   co-served districts. A tier-less number is not compliant.
2. **Never divide Tier B money.** Render it undivided and list the co-served districts on
   the face of the view. See the previous bullet.
3. **Publish the unattributable residual.** Records printed under a Central Office, a
   Regional Office, the BARMM regional grouping, or no office at all have no district. In
   the FY2027 DPWH operations ledger that residual is **78.1% of the NEP side and 69.6% of
   the HGAB3 side** (₱447.7B of ₱572.9B and ₱408.6B of ₱587.1B). A further 67 paired rows
   are held out separately because the two stages do not agree on one office group — either
   the implementing office changed between the NEP and the 3rd reading (10 rows), or one
   stage printed an office with no district. Neither bucket is ever folded into a card. A
   view showing only district cards implies full coverage of a budget it accounts for a
   minority of.
4. **Carry the source's own honesty annotations.** The upstream comparison already
   separates provisional matches, segment-scope review, and reading-restoration markers
   from certified findings. A district roll-up must not fold those back in.

**Still prohibited:** per-representative totals presented as that person's insertions,
deletions, or budget changes; any framing implying a representative moved money;
regional-group rows counted as offices (BARMM is `type: "regional_group"`, not an office);
inferring a district from an office's ordinal number, which disagrees with the district
ordinal on 65 rows.

The reference implementation is the `#congress` workspace
(`analysis/web/buildCongressIndex.mjs`), which asserts conditions 1–4 at build time and
ties every card total back to the published Overview. It is Node rather than Python because
the bucket definitions come from `partition()` in `analysis/web/src/overviewSummary.js` —
the same function behind the Overview — so the cards cannot silently disagree with it.
`DEO2LEG/test_deo_leg_mapping.py` guards the crosswalk invariants the lens depends on.

## References

- BetterGov open-data-visualization: https://github.com/bettergovph/open-data-visualization
- DPWH project-code mapping: https://github.com/bettergovph/open-data-visualization/blob/main/database/dpwh-project-code-mapping.json
- Official House directory: https://www.congress.gov.ph/house-members
- 20th Congress of the Philippines: https://en.wikipedia.org/wiki/20th_Congress_of_the_Philippines
- RA 11080 (Isabela six districts), RA 11297 (Davao de Oro), RA 10360 (Davao Occidental),
  RA 8487 (Taguig-Pateros)
