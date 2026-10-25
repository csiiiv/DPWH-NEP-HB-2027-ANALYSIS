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
  - district labels at z≥6.5 and italic split-city labels at z≥7.5, using
    the basemap's own key-free CARTO glyph pipeline (Open Sans)
  - hover popups **and click-to-pin popups** showing the district's
    representative with photo and a congress.gov.ph profile link
    (photos from `DEO2LEG/legislative_profiles`)
  - live search (municipality/city/district/representative) with
    zoom-to-match and blue highlight
  - 13 split-city polygons each with a **distinct hue-tinted stripe
    pattern** (per-city pattern via data-driven `fill-pattern`) + dashed
    outline
- `vendor/` — MapLibre GL JS 6.14.0 (ESM build) copied verbatim from the
  repo's pinned `analysis/web/node_modules/maplibre-gl/dist/`; serves with
  zero CDN dependency for the mapping library itself
- `leg_districts.geojson` — 232 simplified features (2.6 MB):
  219 dissolved whole-unit districts + 13 split-city polygons
- `province_hues.json` — adjacency-aware hue table (one hue per
  jurisdiction); see Color scheme
- `rep_photos.json` + `photos/` — 254 representative photos (34 MB) +
  leg_id → {name, photo, area, detail_url} manifest
- `preview.png` — actual MapLibre render (headless Chrome + SwiftShader
  software WebGL; CARTO Voyager basemap, adjacency-hued fills, pinned
  popup with rep photo)

## Run

```bash
cd PSGC2LEG/viz && python3 -m http.server 8901
# open http://localhost:8901
```

A static file server is required (the app fetches the GeoJSON via fetch();
file:// won't work in most browsers).

## Color scheme

Every jurisdiction (province / highly urbanized city / split city) gets its
**own hue**; districts within it vary **lightness**, so a multi-district
province reads as one colour family — e.g. Camarines Sur's 5 districts are
all the same hue at 5 different shades, while neighbouring Camarines Norte
is a different hue.

- **Hue — adjacency-aware** (this replaced an earlier golden-angle scheme,
  which spread hues evenly over all 103 jurisdictions but ignored
  geography and could hand adjacent Bulacan and Nueva Ecija both-green
  hues). `scripts/build_province_hues.py` unions each jurisdiction's
  rendered polygons, builds the shared-border adjacency graph (203 edges;
  a 0.001° ~110 m buffer makes the border match robust — provinces that
  merely face each other across water do **not** count as adjacent), then
  greedily assigns hues highest-degree-first, each pick maximizing the
  minimum circular hue distance to already-coloured neighbours. The
  minimum separation between any two touching jurisdictions across the
  whole map is **55°**; the classic complaint case now reads Bulacan red
  (0°) / Nueva Ecija green (100°) / Pampanga blue (230°). Split cities
  participate in the same table, so Metro Manila stays readable. The page
  falls back to a golden-angle estimate for any name missing from the
  table (e.g. geojson rebuilt, hues stale) — determinism, not accuracy,
  matters there.
- **Lightness** — 60% (1st district) → 28% (highest), saturation easing
  58% → 74%. Steps stay ≥5% apart so adjacent districts remain tellable.
  The range matters: an earlier 74% → 34% ramp was effectively invisible,
  since at 0.8 fill-opacity over CARTO Voyager's cream land 74% lightness
  reads as "basemap" and the national view looked blank.
- **Split cities** — each gets its own hue from the same table, rendered
  as that hue's stripe pattern + dashed outline. They used to be uniform
  grey, which made Manila, QC, and Caloocan indistinguishable — the one
  thing a reader scanning Metro Manila needs. Stripe ambiguity is
  deliberate until barangay-level assignment lands.
- Colors are baked into each feature's `color` property at load, so the
  fill layer is a plain `['get','color']` rather than a ~100-case `match`.

## Representative photos

`scripts/copy_rep_photos.py` joins
`DEO2LEG/legislative_profiles/profiles.json` to
`data/legislative_districts.json` on (jurisdiction, district_no) and
copies each district rep's photo into `photos/`. The join has three
hazards, all handled (and each of which bit during development):

1. **Namesakes** — congress.gov.ph spells cities differently ("Manila
   City" vs our "City of Manila") and has provinces with city namesakes
   (Quezon, Cebu). Normalization must never strip the word "city";
   an explicit alias table maps the spellings.
2. **19th-Congress leftovers** — a few areas have two profiles (two
   Acops in Antipolo 2nd, two Barzagas in Cavite 4th); the candidate
   whose name tokens match our catalog's `representative` field wins.
3. **Source typos** — congress.gov.ph lists the Iloilo *province* 2nd
   district rep as "Iloilo City, 2nd District" (no such district);
   Taguig needs an explicit split into Taguig–Pateros 1st/2nd.

Result: 254/254 districts matched, 0 ambiguous, all photo files verified
on disk.

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
python3 ../scripts/build_viz_geojson.py [tolerance_degrees]  # default 0.002 (~200 m)
python3 ../scripts/build_province_hues.py                   # adjacency-aware hues
python3 ../scripts/copy_rep_photos.py                       # photos + manifest
python3 ../tests/check_viz_browser.py                       # headless browser check
```
