#!/usr/bin/env python3
"""Build one rendered polygon per 2025 legislative district.

Whole-unit districts dissolve 2023 municipality/city polygons. Multi-district
cities dissolve barangay polygons using the barangay-level assignments emitted
by build_assignments.py. This resolves all former striped city placeholders,
including current Caloocan District 3 and Taguig–Pateros after the EMBO transfer.

Outputs:
  viz/leg_districts.geojson
  viz/geometry_report.json
"""

from __future__ import annotations

from collections import defaultdict
import json
import re
import sys
import unicodedata
from pathlib import Path

import geopandas as gpd
import pandas as pd
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parent.parent
REPO_ROOT = ROOT.parent
SHAPE_ROOT = (REPO_ROOT / "dpwh_coor2psgc_geomapping" /
              "philippines-psgc-shapefiles" / "data" / "2023")
MUNICITY_SHP = SHAPE_ROOT / "Municities" / "Municities.shp.shp"
BARANGAY_SHP = SHAPE_ROOT / "BgySubMuns" / "PH_Adm4_BgySubMuns.shp.shp"
ASSIGN = ROOT / "data" / "psgc_leg_assignments.jsonl"
LEG = ROOT / "data" / "legislative_districts.json"
OUT = ROOT / "viz" / "leg_districts.geojson"
REPORT = ROOT / "viz" / "geometry_report.json"

OLD_TO_NEW_PREFIX = {
    "06045": "18045", "07046": "18046", "07061": "18061", "19066": "09066",
}
OLD_TO_NEW_CODE = {"0630200000": "1830200000"}


def modernize(code10: str) -> str:
    if code10 in OLD_TO_NEW_CODE:
        return OLD_TO_NEW_CODE[code10]
    prefix = OLD_TO_NEW_PREFIX.get(code10[:5])
    return prefix + code10[5:] if prefix else code10


def norm(value: str) -> str:
    value = unicodedata.normalize("NFKD", value or "")
    value = "".join(c for c in value if not unicodedata.combining(c)).upper()
    return re.sub(r"\s+", " ", re.sub(r"[^A-Z0-9 ]", " ", value)).strip()


# The 2023 geometry publication predates these catalog splits/renamings. Each
# aggregate polygon belongs wholly to the stated current district.
GEOMETRY_OVERRIDES = {
    ("1380100000", "BARANGAY 176"): "leg:ph:caloocan:1:2025",
    ("0931700000", "DULIAN"): "leg:ph:zamboanga-city:2:2025",
}
ALLOWED_AGGREGATED_NAMES = {
    "1380100000": {f"BARANGAY 176 {letter}" for letter in "ABCDEF"},
    "0931700000": {"DULIAN UPPER BUNGUIAO", "DULIAN UPPER PASONANCA"},
}


def city_for_barangay(code: str, split_city_codes: set[str]) -> str | None:
    for city in split_city_codes:
        # Manila barangays sit below 14 submunicipalities (1380601… through
        # 1380614…), so the normal seven-digit city prefix is not shared by
        # the full set. The five-digit NCR/Manila prefix is unambiguous.
        prefix = city[:5] if city == "1380600000" else city[:7]
        if code.startswith(prefix):
            return city
    return None


def projected_area(geometry) -> float:
    return float(gpd.GeoSeries([geometry], crs=4326).to_crs(32651).area.iloc[0])


def main() -> int:
    tolerance = float(sys.argv[1]) if len(sys.argv) > 1 else 0.002
    assignments = [json.loads(line) for line in ASSIGN.open(encoding="utf-8")]
    leg = json.loads(LEG.read_text(encoding="utf-8"))
    leg_by_id = {row["leg_id"]: row for row in leg["districts"]}
    split_city_rows = [row for row in assignments
                       if row["assignment_type"] == "multi_district_city"
                       and row["level"] == "city"]
    split_city_codes = {row["psgc_code"] for row in split_city_rows}

    print(f"reading municipality and barangay geometry (simplify {tolerance}) ...")
    municipalities = gpd.read_file(MUNICITY_SHP)[["psgc_code", "adm3_en", "geometry"]]
    municipalities = municipalities.to_crs(4326)
    municipalities["code10"] = (municipalities["psgc_code"].astype(str)
                                  .str.zfill(10).map(modernize))

    whole_assignments = pd.DataFrame([row for row in assignments
                                      if row["assignment_type"] == "whole_unit"])
    whole = municipalities.merge(whole_assignments[["psgc_code", "leg_id"]],
                                 left_on="code10", right_on="psgc_code", how="inner")
    whole["geometry_source"] = "municipality_2023"
    whole["source_city"] = None

    barangays = gpd.read_file(BARANGAY_SHP)[
        ["adm4_psgc", "adm4_en", "geo_level", "geometry"]].to_crs(4326)
    barangays["code10"] = barangays["adm4_psgc"].astype(str).str.zfill(10)
    barangays = barangays[barangays["geo_level"] == "Bgy"].copy()
    barangays["source_city"] = barangays["code10"].map(
        lambda code: city_for_barangay(code, split_city_codes))
    split_geometry = barangays[barangays["source_city"].notna()].copy()

    split_assignment = {row["psgc_code"]: row for row in assignments
                        if row["assignment_type"] == "barangay_split"}
    split_geometry["leg_id"] = split_geometry["code10"].map(
        lambda code: split_assignment.get(code, {}).get("leg_id"))
    for idx, row in split_geometry[split_geometry["leg_id"].isna()].iterrows():
        override = GEOMETRY_OVERRIDES.get((row["source_city"], norm(row["adm4_en"])))
        if override:
            split_geometry.at[idx, "leg_id"] = override
    unresolved_geometry = split_geometry[split_geometry["leg_id"].isna()]
    if not unresolved_geometry.empty:
        details = unresolved_geometry[["source_city", "code10", "adm4_en"]].to_dict("records")
        raise ValueError(f"Split-city geometry without a district: {details}")
    split_geometry["geometry_source"] = "barangay_2023"

    geometry_codes = set(split_geometry["code10"])
    missing_assignments = defaultdict(list)
    for code, row in split_assignment.items():
        if code in geometry_codes:
            continue
        city = city_for_barangay(code, split_city_codes)
        if city:
            missing_assignments[city].append(row["name"])
    for city, names in missing_assignments.items():
        unexpected = {norm(name) for name in names} - ALLOWED_AGGREGATED_NAMES.get(city, set())
        if unexpected:
            raise ValueError(f"Assigned barangays without geometry in {city}: {sorted(unexpected)}")

    pieces = gpd.GeoDataFrame(pd.concat([
        whole[["leg_id", "geometry", "geometry_source", "source_city"]],
        split_geometry[["leg_id", "geometry", "geometry_source", "source_city"]],
    ], ignore_index=True), geometry="geometry", crs=4326)
    source_sets = pieces.groupby("leg_id")["geometry_source"].agg(
        lambda values: sorted(set(values))).to_dict()
    dissolved = pieces[["leg_id", "geometry"]].dissolve(by="leg_id")
    dissolved["geometry"] = dissolved.geometry.simplify(tolerance, preserve_topology=True)

    expected_ids = set(leg_by_id)
    actual_ids = set(dissolved.index)
    if actual_ids != expected_ids:
        raise ValueError(f"Rendered district IDs differ: missing={sorted(expected_ids-actual_ids)}, "
                         f"extra={sorted(actual_ids-expected_ids)}")

    features = []
    for leg_id, row in dissolved.sort_index().iterrows():
        district = leg_by_id[leg_id]
        features.append({
            "type": "Feature",
            "properties": {
                "leg_id": leg_id,
                "jurisdiction": district["jurisdiction"],
                "district_label": district["district_label"],
                "district_no": district["district_no"],
                "region": district["region"],
                "representative": district["representative"],
                "geometry_sources": source_sets[leg_id],
            },
            "geometry": row.geometry.__geo_interface__,
        })

    coverage = {}
    for city_row in split_city_rows:
        code = city_row["psgc_code"]
        city_geometry = municipalities.loc[municipalities["code10"] == code, "geometry"]
        rendered = unary_union(split_geometry.loc[
            split_geometry["source_city"] == code, "geometry"].tolist())
        city_area = projected_area(city_geometry.iloc[0])
        coverage[code] = {
            "name": city_row["name"],
            "rendered_barangay_features": int((split_geometry["source_city"] == code).sum()),
            "assigned_catalog_barangays": sum(
                city_for_barangay(c, split_city_codes) == code for c in split_assignment),
            "catalog_assignments_without_individual_2023_geometry": missing_assignments.get(code, []),
            "coverage_within_2023_city_percent": round(
                100 * projected_area(rendered.intersection(city_geometry.iloc[0])) / city_area, 2),
            "rendered_area_vs_2023_city_percent": round(
                100 * projected_area(rendered) / city_area, 2),
        }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({"type": "FeatureCollection", "features": features},
                              ensure_ascii=False), encoding="utf-8")
    report = {
        "district_features": len(features),
        "catalog_districts": len(expected_ids),
        "unresolved_split_cities": 0,
        "whole_unit_geometry_features": len(whole),
        "split_city_barangay_geometry_features": len(split_geometry),
        "geometry_sources": {
            "whole_units": str(MUNICITY_SHP.relative_to(REPO_ROOT)),
            "split_cities": str(BARANGAY_SHP.relative_to(REPO_ROOT)),
        },
        "split_city_coverage": coverage,
        "notes": [
            "Coverage compares retained 2023 layers; Taguig exceeds its old city boundary because current barangay geometry includes the ten transferred EMBO barangays.",
            "Caloocan Barangay 176-A through 176-F share one older aggregate polygon; both the roster and rendered aggregate belong to District 1.",
            "Zamboanga's two current Dulian names share one older Dulian polygon, rendered in District 2; the 2023 barangay layer does not delimit Upper Pasonanca separately.",
        ],
    }
    REPORT.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"features: {len(features)} / {len(expected_ids)} districts; "
          f"split placeholders: 0 -> {OUT} ({OUT.stat().st_size/1e6:.1f} MB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
