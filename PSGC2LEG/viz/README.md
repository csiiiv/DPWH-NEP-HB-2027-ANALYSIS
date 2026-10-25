# PSGC2LEG Map Visualization

Interactive Leaflet map of the 254 Philippine legislative districts
(2025 elections / 20th Congress) at municipality-level assignment.

## Files

- `index.html` — self-contained Leaflet app (search, region-colored districts,
  split-city hatching, popups with jurisdiction/district/representative/leg_id)
- `leg_districts.geojson` — 232 simplified features (2.8 MB):
  205 dissolved whole-unit districts + 27 split-city polygons
- `preview.png` — rendered snapshot

## Run

```bash
cd PSGC2LEG/viz && python3 -m http.server 8901
# open http://localhost:8901
```

(A static file server is needed because the app fetches the GeoJSON via XHR;
opening index.html directly from file:// won't load it in most browsers.)

## Regenerate

```bash
python3 ../scripts/build_viz_geojson.py [tolerance_degrees]   # default 0.002 (~200 m)
```

Geometry source: altcoder/philippines-psgc-shapefiles 2023 municity polygons,
crosswalked to Q3 2026 PSGC codes (NIR creation, Sulu -> Region IX, Bacolod
HUC recode), dissolved by legislative district, simplified ~200 m.
