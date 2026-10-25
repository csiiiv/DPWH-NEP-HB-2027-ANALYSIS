# Viz Upgrade — Adjacency Hues, Rep Photos, Pinned Popups (2026-10-25)

> **Follow-up:** the later split-city geometry build replaced the 13 striped
> placeholders with individual barangay-derived district polygons. The viewer
> still uses the colors, photos, and pinned-popup behavior described here, but
> now renders 254 district features. See
> [`split_city_geometry.md`](split_city_geometry.md).
> Counts in the original implementation notes below describe the earlier
> placeholder geometry; the regenerated hue table now has 115 jurisdictions,
> 201 adjacency edges, and a 65° minimum adjacent-hue separation.

**Scope.** Three upgrades to `viz/index.html` and its build pipeline,
from this session's user requests:

1. adjacent provinces must carry contrasting hues (Bulacan vs Nueva Ecija
   was the complaint case — both read green under the golden-angle scheme);
2. clicking a district must **hold the popup open** (hover-only dismissal
   made reading anything impossible);
3. popups must show the **representative's photo** from
   `DEO2LEG/legislative_profiles`, copied locally so the viz folder is
   self-contained.

## 1. Adjacency-aware province hues

### What changed

| | before | after |
|---|---|---|
| hue source | golden angle `(idx × 137.508°) % 360` over sorted names | `viz/province_hues.json`, built by `scripts/build_province_hues.py` |
| geography aware | no (name index only) | yes — shared-border adjacency graph |
| min hue separation between touching jurisdictions | unbounded (could be ~0°) | **55°** measured, by construction |

### How the table is built

`scripts/build_province_hues.py`:

1. Unions each jurisdiction's rendered polygons from
   `viz/leg_districts.geojson` (116 jurisdictions: 103 provinces/HUCs +
   13 split cities).
2. Builds adjacency: buffer one side by 0.001° (~110 m), test intersection
   → **203 edges**. The buffer is what makes shared borders (dissolved
   from the same municity polygons, so geometrically identical) match
   despite floating-point slivers. Provinces that merely face each other
   across water (Cebu/Bohol, Guimaras/Negros) do **not** become adjacent.
3. Greedy assignment, highest-degree-first (Bulacan is the hub with 10
   neighbors), each pick maximizing the minimum *circular* hue distance
   to already-coloured neighbours; ties broken by distance to all coloured
   jurisdictions, then lower angle for deterministic output.

Complaint case now: Bulacan 0° (red) / Nueva Ecija 100° (green) /
Pampanga 230° (blue) / Tarlac 345°. Camarines Norte 0° vs Camarines Sur
270°. Non-adjacent lookalikes (Cavite and Rizal both 180°) never touch,
which is the point — hue reuse is only forbidden along an edge.

`index.html` loads the table at startup and keeps the golden-angle
sequence only as a **fallback** for names missing from the table (e.g.
geojson rebuilt but hues stale) — determinism, not accuracy, matters
there.

**Rebuild order matters:** `build_viz_geojson.py` → `build_province_hues.py`
(the hue table derives adjacency from the rendered polygons).

## 2. Representative photos — 254/254 matched

`scripts/copy_rep_photos.py` copies each district rep's photo from
`DEO2LEG/legislative_profiles/photos/` into `viz/photos/` (254 files,
34 MB) and emits `viz/rep_photos.json`:

```json
"leg:ph:bulacan:1:2025": {
  "name": "Domingo, Danilo \"Danny\" A.",
  "photo": "photos/domingo-danilo-danny-a.jpg",
  "area": "Bulacan, 1st District",
  "detail_url": "https://congress.gov.ph/members/..."
}
```

The join is `(jurisdiction, district_no)` → congress.gov.ph profile, and
**every hazard below actually bit during development** — the naive
version put wrong photos on 8 districts:

| hazard | example | handling |
|---|---|---|
| city/province namesakes | Quezon City ≠ Quezon; Cebu City ≠ Cebu | normalization never strips the word "city"; explicit alias table maps our spellings to congress.gov.ph's ("City of Manila"→"Manila City", "Caloocan"→"Caloocan City", …) |
| 19th-Congress leftovers in the scrape | two Acops in Antipolo 2nd; two Barzagas in Cavite 4th | when a key has multiple profiles, the one whose name tokens match our catalog's `representative` field wins (surname alone cannot split father/son or same-surname pairs) |
| source-side quirks | "Iloilo City, 2nd District" is actually the *province* 2nd (Gorriceta — no such city district exists); Butuan listed without "City"; Taguig listed as one district + one "Taguig City-Pateros" | explicit crosswalk fixes; Taguig splits into Taguig–Pateros 1st (Pateros included, per COMELEC Res 11069) and 2nd |

Result: **254/254 districts matched, 0 ambiguous, all photo files verified
on disk.** (`leg_id` uses `:lone:` for lone districts — e.g.
`leg:ph:butuan:lone:2025` — keep that in mind when keying into the
manifest.)

## 3. Click-to-pin popups

Interaction model:

- **hover** → transient preview popup (as before), suppressed while a
  popup is pinned (two stacked popups fighting for the cursor is worse
  than none);
- **click** → pins a popup with close button: rep photo (floats right),
  name, congress.gov.ph link, jurisdiction — district label, region,
  `leg_id`; the pinned district gets a red outline + raised fill-opacity
  via a new `pinned` feature-state;
- **unpin** → close button, click on ocean/basemap, basemap switch, or
  pinning another feature.

Two MapLibre v6 gotchas surfaced in browser testing and are now handled
(and commented) in `index.html`:

1. `Popup.on()` returns `undefined` — it cannot be chained
   (`.setHTML().setLngLat().on().addTo()` throws mid-chain and the popup
   never appears).
2. Layer-scoped click handlers cannot cancel map-wide click handlers:
   `e.originalEvent.stopPropagation()` stops DOM propagation but not
   MapLibre's internal emitter, so the map-wide "click ocean → unpin"
   handler fired *after* the layer pin and instantly closed it. The
   map-wide handler now decides by `queryRenderedFeatures` at the click
   point (no district hit → unpin) instead of relying on propagation.

## Validation

`tests/check_viz_browser.py` (Playwright headless, serves `viz/` over
localhost) asserts all of the above end-to-end:

```
layers ok: True
hue table: Bulacan 0° vs Nueva Ecija 100° -> separation 100°
bulacan rendered color: hsl(0, 61%, 54%)     # hue table actually applied
pinned popup rep photo: photos/…jpg          # pin shows photo
popup survives mouse-out: True               # the "hold open" requirement
photo fetch status: 200
ocean click unpins: True
console errors: none
RESULT: PASS
```

`viz/preview.png` is a live render at z7.6 with a pinned Bulacan 1st
district popup (photo + link + red outline).

## Regenerate everything

```bash
cd PSGC2LEG
python3 scripts/build_viz_geojson.py       # polygons (254 features)
python3 scripts/build_province_hues.py     # adjacency hues — AFTER geojson
python3 scripts/copy_rep_photos.py         # photos + manifest
python3 tests/check_viz_browser.py         # headless browser verification
```
