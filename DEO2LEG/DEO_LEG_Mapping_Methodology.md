# DEO–Legislative District–Representative Crosswalk

## Methodology, sources, and limitations

**Status:** Provisional research dataset, not an authoritative jurisdiction map
**Prepared:** October 2026
**Superseded in part:** this document describes the **draft** crosswalk (108 rows).
The current build is `deo_leg_crosswalk.json` schema `2.1.0` (264 rows, 254 districts).
See [README.md](README.md) for the current pipeline and §8 below for what changed.
Sections 1, 2, 3, 4, 7 and the reasoning throughout still apply; the counts, the
output filename, and the amount-handling in §5 are draft-specific.
**Repository examined:** [bettergovph/open-data-visualization](https://github.com/bettergovph/open-data-visualization)

## 1. Objective

Create a reusable JSON mapping connecting:

- **DEO** — DPWH District Engineering Office (or a distinct source grouping when an entry is not an individual DEO);
- **LEG** — geographic legislative/congressional district; and
- **Representative** — the person associated with the legislative district in the repository's 20th Congress roster.

The intended use is to help query and compare DPWH budgets, projects, and procurement records across administrative and electoral geographies. The mapping is **many-to-many**: a DEO can be linked to several LEGs, and a LEG can appear under several DEOs. A representative is associated with a LEG, **not with a DEO**.

## 2. Source discovery

We searched the repository's code, documentation, data files, pull requests, and commit history for `DEO`, `LEG`, `District Engineering Office`, `Legislative District`, `cong_district`, and related terms.

The following were the most useful findings:

| Repository resource | What it provides | Role in this exercise |
| --- | --- | --- |
| [`static/nep-preview/congress.html`](https://github.com/bettergovph/open-data-visualization/blob/main/static/nep-preview/congress.html) | An embedded JavaScript crosswalk titled **“DEO and legislative-district allocation crosswalk”** | **Primary source of DEO–LEG pairs and transcribed amounts** |
| [`static/data/20th_congress_representatives.json`](https://github.com/bettergovph/open-data-visualization/blob/main/static/data/20th_congress_representatives.json) | Province/jurisdiction, district label, representative name, party | **Representative-name enrichment** |
| [`docs/gis_integration_guide.md`](https://github.com/bettergovph/open-data-visualization/blob/main/docs/gis_integration_guide.md) | Proposed extraction of `deo` + `cong_district` from DPWH GIS road data | A possible route for independently expanding/validating coverage; not the source used for this draft |
| [`analysis/strict_congress_geography.py`](https://github.com/bettergovph/open-data-visualization/blob/main/analysis/strict_congress_geography.py) | Conservative project-location attribution | Explains why DEO names/numbers must not be treated as legislative-district proof |
| [`static/data/districts_generated.json`](https://github.com/bettergovph/open-data-visualization/blob/main/static/data/districts_generated.json) | Municipality-to-legislative-district mappings | Potential later validation/enrichment; not used to fabricate DEO–LEG pairs |

The relevant history includes [“adding DEO vs LEG analysis”](https://github.com/bettergovph/open-data-visualization/commit/168f10d0f06889e3806b2fd4e8103c67cb72e140) and [“updating PH location DB on NE DEO to LEG”](https://github.com/bettergovph/open-data-visualization/commit/2eb9a51112370cbef169f957724f4e0390b2a8db).

The embedded HTML table says its associations and amounts were transcribed from a local scanned document titled **`DPWH per district.pdf`**. The document was **not independently retrieved or examined** in this exercise, and the page states that the scan does **not identify a fiscal year**. Thus the recorded amounts are *source-document evidence*, not FY2027 project amounts.

## 3. Extracting the DEO–LEG relationships

The HTML contains a JavaScript array named `deoLegRows`, with records in this form:

```javascript
['Bulacan 1st DEO', 'Bulacan · 1st', 1575230]
['Bulacan 1st DEO', 'Bulacan · 2nd', 1122308]
['Bulacan 1st DEO', 'Bulacan · 5th', 1450956]
```

Each row consists of **(1) office/group name, (2) legislative-district label, (3) source allocation amount in thousands of Philippine pesos**. We extracted the entries from both the initial `deoLegRows` array and its later `.push(...)` additions, retaining their source order. In the draft JSON, `sourceRow` is that extracted row's **1-based ordinal**, not a PDF page or line number.

The extraction yielded:

| Measure | Result |
| --- | ---: |
| Source DEO–LEG relationship rows | **108** |
| Unique office/group labels | **47** |
| Actual DEO labels | **46** |
| Other group labels | **1** (`BARMM`, a regional grouping) |
| Unique legislative-district labels | **98** |
| Office/group labels with more than one LEG | **30** (including `BARMM`) |
| LEGs with more than one office/group label | **10** |

The crosswalk is **partial by design**. Its page emphasizes many-to-many relationships and omits many ordinary one-to-one associations. Consequently, a missing DEO–LEG pair is **not** evidence that a relationship does not exist.

### Example: why a single-value lookup would be wrong

`Bulacan 1st DEO` has source rows for **Bulacan 1st, 2nd, and 5th** legislative districts. Conversely, **Manila 6th** has rows under both **North Manila DEO** and **South Manila DEO**. The JSON must preserve both directions rather than forcing one office to one seat or one seat to one office.

## 4. Enriching the LEGs with representative names

We then read the repository's `static/data/20th_congress_representatives.json`, which contained **318 roster entries** at the time inspected. The roster's keys are jurisdiction (`province`) and district (`district`); its associated attributes include `representative` and `party`.

For each crosswalk row:

1. Split a label such as `Bulacan · 1st` into **jurisdiction** (`Bulacan`) and **district** (`1st`).
2. Normalize the text on both sides of the join (case, accents, punctuation, whitespace, and redundant words such as `District`).
3. Seek a **unique** roster entry with matching jurisdiction **and** district label; do not join on ordinal alone.
4. Attach the representative's name when exactly one match is found.
5. Leave the representative `null` when the match is missing or unresolved, rather than guessing.

**Observed result:** **105 of 108 source relationships** mapped to a unique roster entry. At the district level, **95 of 98 LEGs** received a roster match.

The **three unresolved labels** in this draft are:

- `Taguig · 1st`
- `Taguig · 2nd`
- `General Santos City · Lone`

These are **label-join failures**, not proof that the districts lack representatives. For example, the source roster uses `General Santos` rather than the crosswalk's `General Santos City`. These cases should be resolved using an explicitly reviewed alias table or official references, not a silent string substitution.

Names are copied from the local roster and were **not independently checked against an official current House membership list**. Some source names retain citation-style suffixes, which also merit cleanup.

## 5. Building the JSON

Instead of a flat dictionary like `DEO -> one LEG -> one congressman`, we created three collections with stable, human-readable ID keys:

| Collection | Key | Purpose |
| --- | --- | --- |
| `offices` | `office:<slug>` | DEO or regional-group identity; linked LEG IDs |
| `legislativeDistricts` | `leg:<jurisdiction>:<district>` | Electoral district identity, representative information, linked office IDs |
| `relationships` | One record per source row | Association type, source row, and historical/undated allocation evidence |

A simplified example of the output shape:

```json
{
  "offices": {
    "office:bulacan-1st-deo": {
      "name": "Bulacan 1st DEO",
      "type": "district_engineering_office",
      "legislativeDistrictIds": [
        "leg:bulacan:1st",
        "leg:bulacan:2nd",
        "leg:bulacan:5th"
      ]
    }
  },
  "legislativeDistricts": {
    "leg:bulacan:1st": {
      "jurisdiction": "Bulacan",
      "districtLabel": "1st",
      "displayName": "Bulacan · 1st",
      "representative": {
        "name": "Danny Domingo",
        "congress": 20,
        "rosterMatch": "unique_label_match",
        "verifiedAgainstOfficialDirectory": false
      },
      "officeIds": ["office:bulacan-1st-deo"]
    }
  },
  "relationships": [
    {
      "officeId": "office:bulacan-1st-deo",
      "legislativeDistrictId": "leg:bulacan:1st",
      "relationship": "allocation_row_in_undated_source",
      "sourceRow": 39,
      "sourceAmount": {
        "value": 1575230,
        "unit": "thousand_PHP",
        "dashInSource": false
      }
    }
  ]
}
```

*The excerpt is illustrative and omits most entries. For exact values, use the complete JSON. The `sourceRow` field is the row ordinal in the extraction.*

Two transcribed zero-coded amount entries are represented with `sourceAmount.value: null` and `dashInSource: true`, because the source page displays them as dashes. **Do not interpret these as confirmed zero allocations.**

> **v2 change:** amounts no longer live in the mapping graph at all. The draft embedded
> `sourceAmount` inside each relationship; schema `2.0.0` moves every amount to a
> separate evidence sidecar (`evidence/source_amounts.json`) so the reusable mapping
> stays free of transient fiscal values. The sidecar preserves `sourceRow` **and**
> `sourcePage`/`rowOnPage` for every one of the 264 rows.

The draft also includes `schemaVersion`, source URLs, Git blob hashes, metadata warnings, and a `summary` section. It was generated as a **downloadable file in this conversation**; no changes were committed to the GitHub repository. The v2 build (`deo_leg_crosswalk.json`) is generated by a checked-in script.

## 6. Provenance and reproducibility

The draft records the exact source versions examined:

| Input | Git blob SHA |
| --- | --- |
| `static/nep-preview/congress.html` | `89fcbff6fdd6049adbe814078d33555052713ca2` |
| `static/data/20th_congress_representatives.json` | `4d8b4f642772caaad69d4e68de03c6d47a757e3f` |

A reproducible implementation should (a) fetch the specified source versions; (b) extract **all** `deoLegRows` triples, including `.push(...)`; (c) validate the 108-row baseline; (d) normalize and join against the roster while retaining unmatched records; (e) build both forward and reverse ID references; (f) preserve source-row amounts and notes; and (g) run referential-integrity and duplicate checks before writing the JSON.

Suggested validation assertions for this **specific draft**, not for future expanded datasets:

```python
assert len(data["offices"]) == 47
assert len(data["legislativeDistricts"]) == 98
assert len(data["relationships"]) == 108
assert sum(v["representative"] is None
           for v in data["legislativeDistricts"].values()) == 3
```

> **v2 replacement:** these assertions are obsolete. The current invariants live in
> `test_deo_leg_mapping.py` (80 tests) — e.g. 264 relationships, 254 districts,
> 252 resolved / 2 ambiguous representatives, 0 not found, every resolved seat carrying a
> scraped profile with a locally present portrait, and strict guarantees that legacy
> offices stay unlinked and no amount fields leak into the graph.
>
> The `== 3` count above was itself wrong for a second reason: one of those three
> "ambiguous" seats (Southern Leyte 1st) was an artifact of a roster parser defect, not a
> genuine ambiguity. See §5 and `build_official_roster.py`.

## 7. How the mapping should — and should not — be used

**Suitable uses:** listing candidate LEGs associated with a named DEO; finding offices associated with a named LEG; attaching roster information in exploratory tools; flagging records for geographic verification; and building many-to-many filtering interfaces.

**Unsuitable without additional evidence:** assigning **all projects** in a DEO to a particular LEG; distributing an office's entire budget across its candidate LEGs; claiming a representative requested, sponsored, received, or controlled an allocation; inferring current legislative boundaries from older DEO/LEG labels; or treating the source's undated amounts as FY2027 budget amounts.

These concepts should remain distinct:

1. **Implementing office:** Which DPWH unit administers the record?
2. **Project geography:** Where is the actual project or road segment located?
3. **Legislative district:** Which electoral district contains that location under an applicable boundary version?
4. **Representative:** Who held the seat at the relevant date?

The repository's [`analysis/strict_congress_geography.py`](https://github.com/bettergovph/open-data-visualization/blob/main/analysis/strict_congress_geography.py) expressly avoids assigning a legislative seat from a DEO number or road name. That caution also applies to this crosswalk.

## 8. Recommended next steps

**Completed in the v2 rebuild (schema `2.0.0`):**

- ✅ **Recover and cite the underlying PDF:** `DPWH per district.pdf` (9-page scan) was
  obtained and transcribed in full. Confirmed to state **no fiscal year**; units are
  thousands of PHP. Two independent extractions now exist and corroborate each other.
- ✅ **Fill missing one-to-one links:** coverage rose from the 108 multi-link rows to all
  **264** rows — 200 offices and **254** districts, versus 47 offices and 98 districts.
  The 254 districts match the official roster's 254 unique seats one-to-one.
- ✅ **Review aliases and special jurisdictions:** all three draft failures are resolved.
  `Taguig · 1st` → `Taguig City-Pateros, Lone` (Ading Cruz) and `Taguig · 2nd` →
  `Taguig City, 2nd` (Jorge Daniel Bocobo) via explicit documented overrides reflecting
  the post-2024 reapportionment; `General Santos City · Lone` matches once the join
  handles the `City` suffix. Zero districts are now unmatched.
- ✅ **Move to a generated source file:** `build_mapping.py` + `join_districts.py` +
  `validate_sources.py` + `test_deo_leg_mapping.py` (80 tests) are under version control.
- ✅ **Add per-link evidence and validation status:** evidence rows now carry
  `sourceRow` **and** `sourcePage`/`rowOnPage`; representatives carry an explicit
  `resolutionStatus` of `resolved`, `ambiguous_multiple_listed`, or `not_found_in_roster`.
- ✅ **Rebuild the roster from the directory's structured table** rather than from prose
  headings, eliminating a defect that fabricated a representative for Southern Leyte 1st.
- ✅ **Enrich representatives with scraped profiles** (`member_code`, profile URL,
  locally cached portrait) for all 252 resolved seats and both candidates on each
  ambiguous seat.

**Still open:**

- **Make time explicit:** store representative terms and effective dates for
  boundary/office changes; avoid treating a 20th Congress roster as timeless.
- **Resolve the 2 ambiguous seats** (Antipolo City 2nd, Cavite 4th) against a dated
  succession record rather than guessing. A third seat previously listed here —
  Southern Leyte 1st — turned out to be a parser artifact and is now resolved.
- **Verify the 13 legacy registry offices:** confirm which current office inherits each
  superseded project code, so those codes can be attached rather than left unlinked.
- **Distinguish evidence types:** separate `allocation_row_observed` from
  `geographic_overlap_verified` and `manual_review_required`.
- **Establish the fiscal year** of the underlying scan from an external authority; until
  then the amounts remain undated evidence.
- **Obtain genuinely independent verification.** Both the roster and the profiles are
  read from the *same* page on congress.gov.ph. They agree exactly on all 324
  `(seat, name)` pairs, which rules out a parser defect in either pipeline, but a site
  error would appear in both. The crosswalk therefore labels its source
  `congress.gov.ph/house-members` and does not claim an outside authority.

## 9. Bottom line

We **did build** a reusable, provenance-labeled **partial** JSON crosswalk from BetterGov's existing DEO–LEG allocation table and joined it to the repository's 20th Congress roster. We **did not** create an independently verified nationwide DPWH service-area map, geospatially attribute individual projects, or establish legislative responsibility for allocations.

> **v2 bottom line:** the current build replaces the partial crosswalk with one derived
> from the **complete** 264-row allocation table, with representatives verified against
> the official congress.gov.ph directory (252 resolved, 2 ambiguous surfaced rather than
> guessed), all three draft join failures fixed, amounts isolated in an evidence sidecar,
> and 80 regression tests locking the invariants. The caveats stand: it is still a
> transcription of an undated scan — not an authoritative jurisdiction map, not project
> attribution, and not evidence of sponsorship.

> **v2.1 bottom line:** schema `2.1.0` adds scraped **legislative profiles** — every
> resolved representative now carries a `member_code`, a congress.gov.ph profile URL and
> a locally cached portrait, and each ambiguous seat carries both candidates' profiles.
> It also corrects the roster: rebuilding from the directory's structured member table
> removed a parser-invented representative for Southern Leyte 1st, so the genuinely
> ambiguous count falls from 3 to 2 and resolved rises from 251 to 252.
>
> Note on "independently verified": the roster and the profiles are two extraction
> *pipelines* over the same congress.gov.ph page. They agree exactly on all 324
> `(seat, name)` pairs, which rules out a parser defect in either, but a site error would
> appear in both. This is cross-pipeline agreement, not independent verification.
