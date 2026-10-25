# Bridge inventory workflow and roadmap

See the [documentation index](README.md), [methodology](METHODOLOGY.md), and
[data guide](DATA_GUIDE.md).

## Current baseline: 25 October 2026

The retained inventory snapshot is `20261025T084450161740Z`, with **8,752
features, 8,752 unique bridge IDs, and 43 source attributes**. No missing or
duplicate bridge IDs, invalid coordinate pairs, or broad country-range flags
were found in acquisition checks. Nonblank locality names do not by themselves
establish correct administrative locations.

The initial enrichment scans 64,645 master-list observations. Results from the
[generated report](../data/REPORT.md) and [audit](../data/bridge_matching_audit.json):

| Dataset | Exact-ID observations | Observations with absent IDs | Bridge mentions without IDs |
|---|---:|---:|---:|
| DPWH NEP PDF | 458 | 23 | 691 |
| DPWH House second reading | 456 | 27 | 806 |
| DPWH House third reading | 456 | 27 | 806 |
| DPWH NEP API | 463 | 23 | 673 |
| FMR NEP | 0 | 0 | 1 |
| FMR House working copy | 0 | 0 | 1 |

The **1,833 matched observations reference 498 distinct bridges**. All 498
points have one strictly containing barangay polygon in the 2023 dataset.
Current catalog reconciliation yields **466 unique provisional candidates**
and **32 unresolved hierarchies**. There are no partial-ID matches in this run.

Legislative districts derive **directly from bridge coordinates**: **494 of
the 498 matched bridges** carry a district — 458 through the 2023 municity
polygon code joining the verified PSGC2LEG municipality-to-district
assignments, and 4 more inside split cities through point-in-polygon on the
validated DPWH ArcGIS 2022 congressional layer. Across the whole inventory,
8,429 of 8,752 assets have districts (8,367 by code join, 62 in split
cities). PSGC name-chain reconciliation remains separate fallback evidence;
see the [methodology](METHODOLOGY.md).

**288 matched bridges** carry at least one inventory-versus-spatial name
difference. Flag counts overlap: 268 barangay, 67 municipality/city, 61 province,
and 6 region differences. These are review signals, not measured error rates.
Independent-city chains whose spatial province-level unit is named after an
adjacent province now reconcile by matching that city/town ancestor; NCR
chains validate by region because the catalog has no province level there.

Across the entire inventory, **8,743 points** intersect barangay polygons and
**9 points** have no polygon hit at any level. None of those nine assets occurs
among the 498 matched bridges. Budget-stage overlap prevents interpreting the
1,833 observations as a count of unique funded projects.

## Acquire and verify a snapshot

From the repository root, using Python 3's standard library:

```sh
python3 bridge_inventory/scripts/archive_bridges.py
python3 bridge_inventory/scripts/archive_bridges.py --check
```

The first command reads the public service over the network and writes a new
timestamped snapshot. The second runs offline, verifies file hashes, and
reconstructs every export from archived feature responses. Existing snapshots
are preserved. A failed acquisition leaves the previous latest pointer intact.

To check an older snapshot, supply its actual directory:

```sh
python3 bridge_inventory/scripts/archive_bridges.py --check --snapshot bridge_inventory/snapshots/20261025T084450161740Z
```

## Build and verify matching evidence

The enrichment requires the retained master-list JSONL, PSGC catalog and
summary, local normalization module, and four local boundary layers. Boundary
files are in the ignored local checkout under
`dpwh_coor2psgc_geomapping/philippines-psgc-shapefiles/data/2023/`; they are not
bundled into the bridge module. Their identities and hashes are recorded in
the audit. A checkout without them can still read the generated outputs.

The baseline environment records GeoPandas 1.1.1, Shapely 2.1.2, Pyogrio 0.12.1,
and Pyproj 3.7.2. See `software_versions` in the audit for the build being used.

```sh
python3 bridge_inventory/scripts/match_projects.py
python3 bridge_inventory/scripts/match_projects.py --check
python3 -m unittest discover -s bridge_inventory/tests -v
```

The builder verifies the inventory, computes all-asset spatial evidence,
derives legislative districts, and matches budget observations. It writes the
generated `data/` files. The check rebuilds them offline in a temporary
directory and compares their bytes. The baseline passed that reproducibility
check and all 20 tests, including incomplete acquisition, checksum corruption,
missing IDs, boundary ambiguity, locality disagreements, catalog parent-chain
matching, NCR region validation, and district joins/crosswalks.

After an inventory refresh or any change to the master list, boundaries,
catalog, assignments, or matching rules, rebuild enrichment and inspect its
report before using the refreshed evidence. The matching audit pins these
inputs. Record any intentional method changes and their before/after coverage.
Master-list integration is live as of location evidence v5/v5.1: bridge
registry evidence scores under `location_evidence_v5`, and every assigned
municipality-level record carries its verified legislative district.

## Next work

The [table viewer](../index.html) is available for browsing the retained
inventory and review evidence. After rebuilding matching outputs, run
`python3 bridge_inventory/scripts/analyze_proximity.py`, then
`python3 bridge_inventory/scripts/build_viewer.py` and then the same command
with `--check`. The viewer's build verifies the pinned snapshot and matching
output hashes; it does not require boundary files. The optional browser check
is `python3 bridge_inventory/tests/check_viewer_browser.py`.

1. **Review locality disagreements.** Inspect bridge points, crossing endpoints,
   inventory names, boundary vintage, and project source pages. Distinguish
   jurisdiction conventions and spelling from coordinate or geometry errors.
2. **Resolve current-catalog gaps.** Review the 32 unresolved matched hierarchies
   and 323 district-less assets, preserving ambiguity rather than forcing a
   parent province. Split cities without adopted ArcGIS coverage (Antipolo,
   Cebu City, Caloocan, Taguig) need barangay-level assignment from PSGC +
   COMELEC rosters.
3. **Improve identity coverage.** Review missing inventory IDs and generate
   candidates for titles without IDs using bridge name plus road/locality
   context. Retain candidate evidence and ambiguity before accepting matches.
4. **Validate current geography.** Replace the provisional catalog foundation
   with an official retained source and obtain dated current boundary evidence
   or documented crosswalks. An old-to-current name match alone cannot establish
   that a boundary footprint stayed unchanged.
5. **Extend coordinate-first districts.** Apply the direct coordinate-to-district
   pattern to other verifiable coordinate sources (title GPS pairs, facility
   registries), keeping PSGC chains as fallback only.

The retained source snapshots are reusable now. Current-catalog candidates,
districts, and locality differences remain inspectable evidence for those
next steps.
