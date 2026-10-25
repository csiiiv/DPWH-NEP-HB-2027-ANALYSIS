# PSGC2LEG Map Visualization

Interactive **MapLibre GL JS** map of the 254 Philippine legislative districts
(2025 elections / 20th Congress) at municipality-level assignment.

## Files

- `index.html` — self-contained MapLibre app:
  - WebGL vector rendering (smooth pan/zoom), OpenFreeMap positron basemap
    (free, no API key), with automatic fallback to a blank style offline
  - district polygons colored by region
  - hover popups (jurisdiction · district · representative · leg_id)
  - live search (municipality/city/district/representative) with
    zoom-to-match and blue highlight
  - 27 split cities rendered with diagonal stripe pattern + dashed outline
- `leg_districts.geojson` — 232 simplified features (2.8 MB):
  205 dissolved whole-unit districts + 27 split-city polygons
- `preview.png` — Leaflet-rendered snapshot (v0.1; MapLibre canvas needs a
  real GPU/Compositor, headless screenshots can't capture WebGL)

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
