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
  - district polygons colored **per province** (see Color scheme below)
  - hover popups (jurisdiction · district · representative · leg_id)
  - live search (municipality/city/district/representative) with
    zoom-to-match and blue highlight
  - 13 split-city polygons rendered with diagonal stripe pattern + dashed
    outline
- `vendor/` — MapLibre GL JS 6.14.0 (ESM build) copied verbatim from the
  repo's pinned `analysis/web/node_modules/maplibre-gl/dist/`; serves with
  zero CDN dependency for the mapping library itself
- `leg_districts.geojson` — 232 simplified features (2.8 MB):
  219 dissolved whole-unit districts + 13 split-city polygons
- `preview.png` — actual MapLibre render (headless Chrome + SwiftShader
  software WebGL; CARTO Voyager basemap, province-hued fills)

## Run

```bash
cd PSGC2LEG/viz && python3 -m http.server 8901
# open http://localhost:8901
```

A static file server is required (the app fetches the GeoJSON via fetch();
file:// won't work in most browsers).

## Color scheme

Every jurisdiction (province / highly urbanized city) gets its **own hue**;
districts within it vary **lightness**, so a multi-district province reads as
one colour family — e.g. Camarines Sur's 5 districts are all the same hue at
5 different shades, while neighbouring Camarines Norte is a different hue.

- **Hue** — assigned by golden angle (~137.508°) over the alphabetically
  sorted jurisdiction list, so hues are both *deterministic* (stable across
  sessions and rebuilds) and *collision-free* (103/103 distinct).
  A first attempt hashed the jurisdiction name instead; it looked fine but
  produced 12 clashing hues across 103 jurisdictions, which defeats the
  point of distinguishing provinces at a glance.
- **Lightness** — 60% (1st district) → 28% (highest), saturation easing
  58% → 74%. Steps stay ≥5% apart so adjacent districts remain tellable.
  The range matters: an earlier 74% → 34% ramp was effectively invisible,
  since at 0.8 fill-opacity over CARTO Voyager's cream land 74% lightness
  reads as "basemap" and the national view looked blank.
- **Split cities** — grey diagonal stripes + dashed outline (deliberate
  ambiguity until barangay-level assignment lands).
- Colors are baked into each feature's `color` property at load, so the
  fill layer is a plain `['get','color']` rather than a ~100-case `match`.

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
