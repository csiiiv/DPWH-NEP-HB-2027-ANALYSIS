# PSGC2LEG Map Visualization

Interactive **MapLibre GL JS** map of the 254 Philippine legislative districts
(2025 elections / 20th Congress) at municipality-level assignment.

## Files

- `index.html` — self-contained MapLibre app:
  - **MapLibre GL JS 6.14.0 vendored locally** (`vendor/maplibre-gl.mjs` +
    `maplibre-gl-worker.mjs`, exact copy of the web app's pinned
    dependency; the worker resolves relative to `import.meta.url`, so no
    bundler or CDN needed)
  - CARTO basemaps (Voyager light / Dark Matter) — free, **no API key**,
    same styles as the project's geolocation tab
    (`analysis/web/src/GeoMap.jsx`), with light/dark toggle and automatic
    fallback to a blank style offline
  - district polygons colored by region
  - hover popups (jurisdiction · district · representative · leg_id)
  - live search (municipality/city/district/representative) with
    zoom-to-match and blue highlight
  - 13 split-city polygons rendered with diagonal stripe pattern + dashed
    outline
- `vendor/` — MapLibre GL JS 6.14.0 (ESM build) copied verbatim from the
  repo's pinned `analysis/web/node_modules/maplibre-gl/dist/`; serves with
  zero CDN dependency for the mapping library itself
- `leg_districts.geojson` — 232 simplified features (2.8 MB):
  205 dissolved whole-unit districts + 27 split-city polygons
- `preview.png` — actual MapLibre render (headless Chrome + SwiftShader
  software WebGL; CARTO Voyager basemap, region-colored fills)

## Run

```bash
cd PSGC2LEG/viz && python3 -m http.server 8901
# open http://localhost:8901
```

A static file server is required (the app fetches the GeoJSON via fetch();
file:// won't work in most browsers).

## Notes

- District polygons are **dissolves of municipality polygons** — internal
  municipality boundaries are intentionally removed per district.
- Split cities (Manila, QC, Caloocan, Davao City, Cebu City, Taguig, etc.)
  show as striped "multiple districts" — deliberate ambiguity visibility,
  resolved only when barangay-level assignment lands (stretch goal).
- Geometry: altcoder/philippines-psgc-shapefiles 2023 municity polygons,
  crosswalked to Q3 2026 PSGC codes (NIR creation, Sulu → Region IX,
  Bacolod HUC recode), simplified ~200 m.

## Regenerate

```bash
python3 ../scripts/build_viz_geojson.py [tolerance_degrees]   # default 0.002 (~200 m)
```
