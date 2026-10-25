# PSGC2LEG Map Visualization

Interactive **MapLibre GL JS** map of all 254 Philippine legislative districts
for the May 2025 elections / 20th Congress baseline.

## Coverage

`leg_districts.geojson` contains exactly one feature for every district in
`data/legislative_districts.json`:

- whole-unit districts dissolve 2023 city and municipality polygons; and
- the 13 multi-district cities dissolve 2023 barangay polygons according to
  the barangay assignments in `data/psgc_leg_assignments.jsonl`.

This includes separate district polygons for Manila, Quezon City, Caloocan,
Makati, Marikina, Parañaque, Taguig–Pateros, and Valenzuela. There are no
striped unresolved-city placeholders. See
[`../docs/split_city_geometry.md`](../docs/split_city_geometry.md) and
`geometry_report.json` for the assignment sources and retained-geometry caveats.

## Files

- `index.html` — self-contained MapLibre app with light/dark CARTO basemaps,
  district labels, live search, hover and click-to-pin popups, and local
  representative photos.
- `vendor/` — locally vendored MapLibre GL JS 6.14.0.
- `leg_districts.geojson` — 254 simplified district features.
- `geometry_report.json` — machine-readable feature counts and split-city
  geometry coverage.
- `province_hues.json` — adjacency-aware jurisdiction hue table.
- `rep_photos.json` and `photos/` — 254 representative photos and manifest.
- `preview.png` — browser-test render of the map.

## Run

```bash
cd PSGC2LEG/viz
python3 -m http.server 8901
# open http://localhost:8901
```

A static file server is required because the page loads modules and GeoJSON with
`fetch()`; most browsers block these when the page is opened with `file://`.

## Color scheme

Every province or independent city jurisdiction gets a hue. Districts within
the jurisdiction vary in lightness, which keeps each family recognizable while
making adjacent districts distinct. `scripts/build_province_hues.py` derives
the hue table from shared polygon borders and maximizes circular hue separation
between neighboring jurisdictions. Feature colors are added in the browser.

## Representative photos

`scripts/copy_rep_photos.py` joins the 254 catalog districts to the retained
Congress profiles and copies the matching images into `photos/`. Popups show the
representative, photo, profile link, region, and stable `leg_id`.

## Geometry notes

- Municipality and barangay geometry comes from the retained 2023
  `altcoder/philippines-psgc-shapefiles` copy and is crosswalked to the Q3 2026
  PSGC catalog.
- Current Caloocan barangays 176-A through 176-F share the older aggregate
  Barangay 176 polygon. They all belong to District 1.
- The old Zamboanga `Dulian` polygon is assigned to District 2 because the
  retained geometry does not separately delimit the current Dulian names.
- Taguig includes the ten transferred EMBO barangays. Pateros is dissolved into
  Taguig–Pateros District 1.

These are visualization geometries for the recorded assignments, not cadastral
or election-precinct survey boundaries.

## Regenerate and validate

```bash
cd PSGC2LEG
python3 scripts/build_assignments.py
python3 scripts/build_viz_geojson.py          # 254 polygons
python3 scripts/build_province_hues.py         # run after GeoJSON
python3 scripts/copy_rep_photos.py
python3 -m unittest discover -s tests -v
python3 tests/check_viz_browser.py
```
