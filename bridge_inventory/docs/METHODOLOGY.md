# Bridge identification and location methodology

See the [documentation index](README.md), [data guide](DATA_GUIDE.md), and
[workflow](WORKFLOW_AND_ROADMAP.md).

## Source and acquisition

The source is the public DPWH
[Detailed Bridge Inventory service](https://services1.arcgis.com/IwZZTMxZCmAmFYvF/ArcGIS/rest/services/Detailed_Bridge_Inventory/FeatureServer).
Its attribution names RBIA, BMS, and GIAS geospatial data. The first acquisition
retains its January 2023 data-date statement separately from the October 2026
retrieval timestamps. Coverage is existing bridges along national roads.

Layer 1, **General Bridge Type**, exposes all 43 retained source fields. The
service advertises 17 thematic point layers; acquisition uses one inventory
layer and does not concatenate the views into additional bridge populations.
Service, item, and layer metadata are archived alongside feature responses.

The acquisition script:

1. Reads the advertised count and complete object-ID inventory.
2. Fetches explicit batches of at most 200 IDs, within the service limit.
   Smaller requests avoid this host's rejection of long GET query URLs.
3. Requests all attributes and WGS84 geometry with `outSR=4326`.
4. Rejects truncated batches, missing/duplicate object IDs, and unexpected CRS.
5. Rechecks counts, IDs, layer edit metadata, and schema after acquisition.
6. Produces exports and verifies them against the retained response bodies.
7. Publishes a timestamped snapshot and updates `latest.json` only on success.

The original layer CRS is EPSG:32651. The archived feature responses already
contain the server-requested reprojection to EPSG:4326; they are verbatim query
response bodies, not a separate export of the original projected geometry.
Coordinates are always **[longitude, latitude]** in derived geometry.

Raw response bodies are retained losslessly, with gzip compression for feature
batches. The manifest records SHA-256 hashes and sizes for stored and
decompressed bytes. Invalid coordinates, repeated bridge IDs, and missing
bridge IDs are disclosed rather than removed from the source archive. A broad
Philippines bounding-box screen detects anomalies without validating a site.

## Budget observation → bridge asset

Input observations come from `master_list/data/projects.jsonl.gz`.
Allocation records are excluded from site matching. The matcher extracts
case-insensitive, complete IDs matching `B` + five digits + `LZ`, `VS`, or `MN`.
It normalizes IDs to uppercase and removes repetitions within one title.

An ID must exist in the verified inventory index to supply coordinates.
Multiple referenced IDs remain separate matches on the observation. Missing
IDs remain visible even when other IDs on the same observation match.

Titles mentioning `bridge`, `bridges`, or `Br.` without a recognized ID enter
a review queue. This keyword screen is not an exhaustive classifier of all
bridge-related work. The current implementation does not assign identities
from bridge-name similarity, road-name similarity, or implementing-office
names. The matched asset's road and bridge names are retained for review;
their agreement with the project title is not automatically verified.

Each budget record remains a source observation. Matching the same asset in
several budget stages does not deduplicate projects or make amounts additive
across stages. A bridge point describes the referenced asset, not every road
approach or construction area covered by the funding.

## Coordinates → historical administrative units

The spatial step uses the local 2023 PSA/NAMRIA-derived polygon checkout under
`dpwh_coor2psgc_geomapping/philippines-psgc-shapefiles/data/2023/`. The four
levels are region, province, municipality/city, and barangay. Their exact input
files and hashes are listed in the matching audit.

For each level, bridge points are transformed to the polygon CRS. An
`intersects` spatial join retains every matching polygon. Each hit is classified
as `within` for strict containment or `boundary_touch` otherwise. Gaps retain
empty hit lists. No nearest-polygon assignment or coordinate snapping is used.
A separate [proximity review](PROXIMITY_REVIEW.md) now retains the nearest three
barangay edges for no-hit points without changing those intersection results.

The historical `adm*_psgc` attributes are numeric in these shapefiles. Their
decimal text is retained as `source_code`. It is not padded or sliced to
manufacture a code in the current catalog. A historical polygon code and a
current PSGC candidate code occupy different fields.

## Historical place hierarchy → current PSGC candidate

Current catalog reconciliation requires exactly one strictly containing hit
at each of barangay, municipality/city, and province levels. It matches the
spatial barangay name to catalog aliases, then follows actual `parent_code`
links to check the named town and province. For a city without a province
ancestor, the spatial province-level name must match a city/town ancestor.
An adjacent province is not silently made that city's administrative parent.

The 2023 shapefile represents NCR and Isabela City with adm2 units named
like `NCR, Fourth District (Not a Province)`. Those chains are barangay →
city → region in the current catalog — there is no province level to match —
so they validate by **region polygon name** instead of the pseudo-province
text. A mismatching region still blocks the chain.

Normalization and documented aliases are reused from the master-list location
module. There is no unrestricted fuzzy matching. The old region name is not
used as a required current-catalog filter, allowing for regional changes.
Unmatched or ambiguous chains remain visible; no code-digit conversion is used.

The result is a **current catalog name candidate derived from dated spatial
evidence**. It does not verify current boundary geometry. Even a unique candidate
can carry inventory-versus-spatial name disagreements. The field
`current_psgc_assignment` remains null; the proposed code and its parent chain
are stored in `current_psgc_candidates`.

## Coordinates → legislative district

Districts derive **directly from the bridge coordinate**, with the PSGC name
chain above only as fallback evidence for records without coordinates:

1. **Whole-unit join (primary).** The strictly containing 2023 municity
   polygon's historical code is crosswalked to Q3 2026 PSGC codes (NIR
   creation, Sulu transfer, Bacolod remap — the same mapping as the PSGC2LEG
   visualization build) and joined to the verified
   [PSGC2LEG](../../PSGC2LEG/README.md) `psgc_leg_assignments` table
   (1,656 municipality/city → district rows, 2025/20th Congress baseline).
2. **Split cities (fallback within cities).** For the 13 multi-district
   cities, the point is tested against the DPWH ArcGIS 2022 congressional
   district layer, adopted per its [validation
   verdicts](../../PSGC2LEG/docs/arcgis_congdist_validation.md): seven
   cities clean, Davao and Cagayan de Oro with coverage caveats, Antipolo
   and Cebu City (overextended polygons) plus Caloocan and Taguig (missing
   districts) **not adopted**. Exactly one containing district is required;
   boundary touches stay unresolved.

Every district records its `derivation`
(`municity_polygon_code_join` or `split_city_point_in_polygon`) and `source`.
Boundary touches, multiple hits, unadopted split cities, and no-hit points
leave `legislative_district` null — they are review queues, not assignments.

## Independent locality comparison and review

The inventory's `BRGY`, `MUNICIPAL`, `PROVINCE`, and `REGION` values are compared
independently with spatial names. Comparison normalizes punctuation, documented
aliases, city-name phrasing, parenthetical descriptions, and numbered region
labels. Missing values and nonunique polygon hits receive explicit statuses.
Name differences become review flags; they do not overwrite either source.

For example, Bocal (`B00532LZ`) has inventory barangay **Estancia**, while its
coordinate falls in the 2023 **Susugaen** polygon under Pasuquin, Ilocos Norte.
The provisional spatial hierarchy candidate is `0102817032`. Both barangay
readings are retained. Busilac (`B00664LZ`) agrees on **Paratong Norte, Bangar,
La Union**, with candidate `0103306022`.

A difference may reflect inventory error, polygon error, historical change,
spelling, or how a crossing is attributed. The flag alone establishes none of
those explanations. Existing asset coordinates remain useful despite an older
data date, but replacements, realignments, source errors, and uncovered new
bridges still require review. A single point cannot enumerate every
jurisdiction touched by a bridge.
