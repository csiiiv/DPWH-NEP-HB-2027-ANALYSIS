#!/usr/bin/env python3
"""Build district-level GeoJSON for the PSGC2LEG map visualization.

Joins the 2023 municity shapefile (altcoder/philippines-psgc-shapefiles)
to psgc_leg_assignments, dissolves whole-unit polygons by district,
simplifies for web use, and emits a self-contained HTML Leaflet map.

Notes:
- The shapefile is vintage 2023; PSGC codes for Negros Occidental,
  Negros Oriental, Siquijor (NIR creation 2024) and Sulu (Region IX
  transfer 2025) were recoded after that. A small crosswalk maps
  old->new codes before joining.
- Split cities keep one feature each, drawn hatched/grey.

Outputs:
  viz/leg_districts.geojson   (simplified, web-ready)
  viz/index.html              (Leaflet map, loads the geojson)
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import geopandas as gpd
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
REPO_ROOT = ROOT.parent
SHP = (REPO_ROOT / "dpwh_coor2psgc_geomapping" / "philippines-psgc-shapefiles"
       / "data" / "2023" / "Municities" / "Municities.shp.shp")
ASSIGN = ROOT / "data" / "psgc_leg_assignments.jsonl"
LEG = ROOT / "data" / "legislative_districts.json"
OUT = ROOT / "viz" / "leg_districts.geojson"

# 2023 shapefile -> Q3 2026 PSGC recodes (NIR creation, Sulu transfer).
# Prefix remap at 5-digit province level; municity digits unchanged.
OLD_TO_NEW_PREFIX = {
    "06045": "18045",  # Negros Occidental
    "07046": "18046",  # Negros Oriental
    "07061": "18061",  # Siquijor
    "19066": "09066",  # Sulu
}
# Whole-code remaps for HUCs whose 2023 coding differs from Q3 2026
OLD_TO_NEW_CODE = {
    "0630200000": "1830200000",  # Bacolod (HUC, own code; moved to NIR)
}


def modernize(code10: str) -> str:
    if code10 in OLD_TO_NEW_CODE:
        return OLD_TO_NEW_CODE[code10]
    pfx = OLD_TO_NEW_PREFIX.get(code10[:5])
    return pfx + code10[5:] if pfx else code10


def main() -> int:
    tol = float(sys.argv[1]) if len(sys.argv) > 1 else 0.002  # ~200 m
    print(f"reading shapefile (simplify tolerance {tol}) ...")
    g = gpd.read_file(SHP)[["psgc_code", "adm3_en", "geometry"]]
    g["code10"] = g["psgc_code"].astype(str).str.zfill(10).map(modernize)

    assign = pd.DataFrame([json.loads(l) for l in ASSIGN.open(encoding="utf-8")])
    leg = json.loads(LEG.read_text(encoding="utf-8"))
    leg_by_id = {d["leg_id"]: d for d in leg["districts"]}

    merged = g.merge(assign[["psgc_code", "leg_id", "assignment_type", "name"]],
                     left_on="code10", right_on="psgc_code", how="left")
    joined = merged["assignment_type"].notna().sum()
    print(f"joined: {joined} / {len(merged)} polygons")
    truly_unmatched = merged[merged["assignment_type"].isna()]
    for _, r in truly_unmatched.iterrows():
        print(f"   UNMATCHED {r['code10']} {r['adm3_en']}")

    print("simplifying + dissolving whole-unit polygons by district ...")
    whole = merged[merged["assignment_type"] == "whole_unit"].copy()
    whole["geometry"] = whole.geometry.simplify(tol, preserve_topology=True)
    dissolved = whole[["leg_id", "geometry"]].dissolve(by="leg_id")
    dissolved["geometry"] = dissolved.geometry.simplify(tol, preserve_topology=True)

    feats = []
    for leg_id, row in dissolved.iterrows():
        d = leg_by_id.get(leg_id, {})
        feats.append({
            "type": "Feature",
            "properties": {
                "leg_id": leg_id,
                "jurisdiction": d.get("jurisdiction"),
                "district_label": d.get("district_label"),
                # 0 = lone district; >=1 used by the viz for per-district
                # shades of the province hue
                "district_no": d.get("district_no"),
                "region": d.get("region"),
                "representative": d.get("representative"),
            },
            "geometry": row.geometry.__geo_interface__,
        })

    split = merged[merged["assignment_type"] == "multi_district_city"].copy()
    split["geometry"] = split.geometry.simplify(tol, preserve_topology=True)
    for _, r in split.iterrows():
        feats.append({
            "type": "Feature",
            "properties": {
                "leg_id": None,
                "jurisdiction": r.get("name") or r.get("adm3_en"),
                "district_label": "split city — multiple districts",
                "region": None,
                "representative": None,
                "split": True,
            },
            "geometry": r.geometry.__geo_interface__,
        })

    fc = {"type": "FeatureCollection", "features": feats}
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(fc, ensure_ascii=False))
    print(f"features: {len(feats)}  ->  {OUT}  ({OUT.stat().st_size/1e6:.1f} MB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
