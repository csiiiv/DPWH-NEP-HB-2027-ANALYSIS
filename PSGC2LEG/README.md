# PSGC2LEG — Philippine Standard Geographic Code → Legislative District Mapping

**Project status:** v0.1 municipality-level baseline complete (25 Oct 2026).
See [`docs/release_v0.1.md`](docs/release_v0.1.md) for coverage and validation.

## What this is

A standalone, reusable, independently auditable mapping from **PSGC-coded locations**
(region → province → city/municipality → barangay) to **geographic legislative
districts (LEG)** of the Philippine House of Representatives, anchored to the
**May 2025 elections / 20th Congress baseline (254 geographic seats)**.

Planning document: [`DEO2LEG/docs/philippine_legislative_district_mapping_discussion.md`](../DEO2LEG/docs/philippine_legislative_district_mapping_discussion.md)

## Granularity decision (25 October 2026)

- **Committed target:** municipality/city-level assignment nationwide.
- **Stretch goal:** barangay-level splits for multi-district cities **outside NCR**.
- **Optional/deferrable:** Metro Manila barangay splits (QC alone had 23 audited
  unresolved cases in the prior prototype).

A multi-LEG city without barangay resolution is a valid municipality-level record
with status `multi_district_city` — not a release blocker.

## Directory layout

```
PSGC2LEG/
├── sources/           # Downloaded raw sources (archived, hash-recorded). Large binaries may be gitignored.
│   ├── raw/           # Verbatim downloads, never modified
│   └── register/      # sources.json — provenance register
├── scripts/           # Download, parse, build, validate scripts
├── docs/              # Working notes, discrepancy reports
└── (later) data/      # Generated canonical datasets
```

## Source hierarchy (reconciliation precedence)

1. **2025 COMELEC congressional-election geography** (operational electoral baseline)
2. **Enacted apportionment laws + COMELEC resolutions** (legal basis, exceptions)
3. **Latest PSA PSGC masterlist** (canonical location codes/entities)
4. **Historical UACS/NSCB mapping** (independent cross-check, historical seeding)

BetterGov and community datasets are accelerators for comparison, not authority.

## Ground rules

- PSGC codes are **strings**, always — never integers (leading zeros matter).
- LEG IDs are jurisdiction-qualified (`leg:ph:<jurisdiction>:<district>:2025`),
  never bare ordinals like `1st district`.
- Unresolved assignments stay **flagged** (`provisional_name_match`, `disputed`,
  `unresolved`), never silently filled.
- Every assignment row carries source provenance and verification status.
- DEO ↔ LEG is a **separate downstream module** (see `DEO2LEG/`), never a
  substitute for project location.
