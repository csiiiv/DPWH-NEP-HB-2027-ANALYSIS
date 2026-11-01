#!/usr/bin/env python3
"""Build barangay-level DEO geometry for Metro Manila (NCR).

Joins the DPWH-annotated PSGC 3Q 2026 CSV (anthony_data/, barangay rows carry
"Legislative District" and "DEO" columns) onto the 2023 ADM4 polygons, and
overrides the CSV's stale district labels with the COMELEC-verified catalog
from psgc_leg_assignments.jsonl / legislative_districts.json.

Known inputs accounted for:
  * Caloocan's CSV labels predate the city's 3-district split (Bgys 177-188).
    District fields come from the repo catalog; Anthony's label is retained
    verbatim in `anthony_district_label` for audit.
  * The 2023 layer renders Barangays 176-A..F as one aggregate polygon
    (1380100176). All six CSV rows share one DEO and one district, so the
    aggregate is rendered once with summed population.
  * Marikina's 16 barangay rows have no DEO in the CSV; they are filled from
    the DPWH allocation table (Metro Manila 1st DEO, rows 6-7) and flagged.
  * Manila District 6 is legitimately split between North and South Manila
    DEOs at barangay level (allocation table lists both).

Outputs:
  viz/ncr_barangay_deos.geojson   one feature per 2023 ADM4 polygon
  viz/ncr_deo_report.json         validation + provenance report
"""

from __future__ import annotations

import csv
import json
import re
import sys
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path

import geopandas as gpd

ROOT = Path(__file__).resolve().parent.parent
REPO_ROOT = ROOT.parent
ANTHONY_CSV = (REPO_ROOT / "anthony_data" /
               "PSGC-3Q-2026-Publication-Datafile-with DPWH DEOs and Legislative Districts(PSGC).csv")
BARANGAY_SHP = (REPO_ROOT / "dpwh_coor2psgc_geomapping" /
                "philippines-psgc-shapefiles" / "data" / "2023" /
                "BgySubMuns" / "PH_Adm4_BgySubMuns.shp.shp")
ASSIGN = ROOT / "data" / "psgc_leg_assignments.jsonl"
LEG = ROOT / "data" / "legislative_districts.json"
CROSSWALK = REPO_ROOT / "DEO2LEG" / "deo_leg_crosswalk.json"
OUT = ROOT / "viz" / "ncr_barangay_deos.geojson"
REPORT = ROOT / "viz" / "ncr_deo_report.json"

# Allocation-table rows 6-7: Marikina 1st/2nd -> Metro Manila 1st DEO.
MARIKINA_FILL_DEO = "Metro Manila 1st DEO"
AGGREGATE_176 = ("1380100176", [f"13801001{i}" for i in range(89, 95)])  # 176-A..F

ORDINALS = {"LONE": 0, "FIRST": 1, "SECOND": 2, "THIRD": 3, "FOURTH": 4,
            "FIFTH": 5, "SIXTH": 6, "SEVENTH": 7, "EIGHTH": 8}


def norm(value: str) -> str:
    value = unicodedata.normalize("NFKD", value or "")
    value = "".join(c for c in value if not unicodedata.combining(c)).upper()
    return re.sub(r"\s+", " ", re.sub(r"[^A-Z0-9 ]", " ", value)).strip()


def parse_int(text: str) -> int | None:
    digits = re.sub(r"[^0-9]", "", text or "")
    return int(digits) if digits else None


def label_district_no(label: str) -> int | None:
    match = re.search(r"\((LONE|FIRST|SECOND|THIRD|FOURTH|FIFTH|SIXTH|SEVENTH|EIGHTH)\s+DISTRICT\)",
                      label or "")
    return ORDINALS[match.group(1)] if match else None


def city_prefix(city_code: str) -> str:
    # Manila barangays sit below 14 sub-municipalities (1380601..1380614),
    # so only the five-digit prefix is stable across the full set.
    return city_code[:5] if city_code == "1380600000" else city_code[:7]


def main() -> int:
    # ---- Anthony CSV: NCR barangay rows -------------------------------------
    rows = list(csv.reader(ANTHONY_CSV.open(encoding="cp1252")))[1:]
    anthony_bgy = {r[1]: {"name": r[2].strip(), "district_label": r[12].strip(),
                          "deo": r[13].strip(), "pop2024": parse_int(r[9]),
                          "urban": r[8].strip()}
                   for r in rows if r[1].startswith("13") and r[4] == "Bgy"}
    anthony_cities = {r[1]: r[2].strip() for r in rows
                      if r[1].startswith("13") and r[4] in ("City", "Mun")}

    # ---- verified district catalog ------------------------------------------
    assignments = [json.loads(line) for line in ASSIGN.open(encoding="utf-8")]
    leg = json.loads(LEG.read_text(encoding="utf-8"))
    leg_by_id = {d["leg_id"]: d for d in leg["districts"]}
    bgy_assign = {a["psgc_code"]: a["leg_id"] for a in assignments
                  if a.get("level") == "barangay" and a["psgc_code"].startswith("13")}
    whole_city = {a["psgc_code"]: a["leg_id"] for a in assignments
                  if a.get("assignment_type") == "whole_unit" and a["psgc_code"].startswith("13")}
    prefix_to_city = {city_prefix(code): (code, name) for code, name in anthony_cities.items()}

    # ---- polygons ------------------------------------------------------------
    gdf = gpd.read_file(BARANGAY_SHP)[["adm4_psgc", "adm4_en", "geo_level", "geometry"]].to_crs(4326)
    gdf["code10"] = gdf["adm4_psgc"].astype(str).str.zfill(10)
    gdf = gdf[gdf["code10"].str.startswith("13") & (gdf["geo_level"] == "Bgy")].copy()

    overrides, filled_deo, aggregate_note = [], [], None
    features = []
    deo_district_matrix = defaultdict(Counter)

    for code, row in gdf.set_index("code10").iterrows():
        props = {"psgc_code": code, "barangay_name": row["adm4_en"],
                 "geometry_source": "psgc_2023_adm4"}
        src = anthony_bgy.get(code)
        if src is None and code == AGGREGATE_176[0]:
            parts = [anthony_bgy[c] for c in AGGREGATE_176[1]]
            src = {"name": row["adm4_en"],
                   "district_label": parts[0]["district_label"],
                   "deo": Counter(p["deo"] for p in parts).most_common(1)[0][0],
                   "pop2024": sum(p["pop2024"] or 0 for p in parts),
                   "urban": parts[0]["urban"]}
            aggregate_note = {"polygon": code, "represents": AGGREGATE_176[1],
                              "district": src["district_label"], "deo": src["deo"]}
        if src is not None:
            props.update({"anthony_district_label": src["district_label"],
                          "pop2024": src["pop2024"], "urban_rural": src["urban"]})
            deo = src["deo"] or None
        else:
            deo = None
            props["anthony_district_label"] = None

        # city attribution via stable prefix
        city_code, city_name = prefix_to_city.get(code[:5] if code.startswith("13806")
                                                  else code[:7], (None, None))
        props["city_psgc"] = city_code
        props["city"] = city_name

        # verified district: barangay split first, then whole-unit city
        leg_id = bgy_assign.get(code)
        if leg_id is None and code == AGGREGATE_176[0]:
            # 2023 aggregate polygon: all six 176-A..F rows share District 1
            leg_id = bgy_assign.get(AGGREGATE_176[1][0])
        if leg_id is None and city_code:
            leg_id = whole_city.get(city_code)
        props["leg_id"] = leg_id

        flags = []
        if leg_id and src and label_district_no(src["district_label"]) is not None \
                and label_district_no(src["district_label"]) != leg_by_id[leg_id]["district_no"]:
            overrides.append({"psgc_code": code, "barangay": src["name"], "city": city_name,
                              "anthony_label": src["district_label"],
                              "verified": f'{leg_by_id[leg_id]["district_label"]} ({leg_id})'})
            flags.append("district_label_overridden_by_catalog")

        if deo is None and city_name == "City of Marikina":
            deo = MARIKINA_FILL_DEO
            filled_deo.append(code)
            flags.append("deo_filled_from_allocation_table")

        props["deo"] = deo
        if leg_id:
            props["district_label"] = leg_by_id[leg_id]["district_label"]
            props["district_no"] = leg_by_id[leg_id]["district_no"]
            props["representative"] = leg_by_id[leg_id].get("representative")
        if flags:
            props["flags"] = flags
        if deo:
            deo_district_matrix[(city_name, props.get("district_label"))][deo] += 1
        features.append({"type": "Feature", "properties": props,
                         "geometry": row.geometry.__geo_interface__})

    # ---- validation -----------------------------------------------------------
    missing_deo = [f["properties"]["psgc_code"] for f in features if not f["properties"]["deo"]]
    missing_leg = [f["properties"]["psgc_code"] for f in features if not f["properties"]["leg_id"]]
    multi_deo_groups = {f"{city} | {dist}": dict(cnt)
                        for (city, dist), cnt in deo_district_matrix.items() if len(cnt) > 1}

    cw = json.loads(CROSSWALK.read_text(encoding="utf-8"))
    cw_offices = {r["officeId"].replace("office:", "").replace("-", " ")
                  for r in cw["relationships"] if r.get("region") == "NCR"}

    report = {
        "feature_count": len(features),
        "polygon_source": str(BARANGAY_SHP.relative_to(REPO_ROOT)),
        "attribute_source": str(ANTHONY_CSV.relative_to(REPO_ROOT)),
        "district_catalog": str(ASSIGN.relative_to(REPO_ROOT)),
        "anthony_ncr_barangay_rows": len(anthony_bgy),
        "district_label_overrides": overrides,
        "deo_filled_from_allocation_table": {"count": len(filled_deo), "psgc_codes": filled_deo},
        "caloocan_176_aggregate": aggregate_note,
        "multi_deo_districts": multi_deo_groups,
        "missing_deo": missing_deo,
        "missing_verified_district": missing_leg,
        "deo_label_vs_crosswalk_office_names": {
            "csv_labels": sorted({f["properties"]["deo"] for f in features if f["properties"]["deo"]}),
            "crosswalk_offices": sorted(cw_offices),
        },
        "notes": [
            "District fields are the COMELEC-verified 2025 catalog; Anthony's CSV labels are kept verbatim in anthony_district_label.",
            "Caloocan CSV district labels predate the 3-district split and are reported as overrides, not used.",
            "Manila District 6 is intentionally split between North and South Manila DEOs at barangay level; the allocation table lists both rows.",
            "Pateros barangays (1381701*) carry TAGUIG CITY (FIRST DISTRICT) labels in the CSV, matching the Taguig-Pateros 1st catalog entry.",
        ],
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({"type": "FeatureCollection", "features": features},
                              ensure_ascii=False), encoding="utf-8")
    REPORT.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    print(f"features: {len(features)} -> {OUT} ({OUT.stat().st_size/1e6:.1f} MB)")
    print(f"district overrides: {len(overrides)} | deo fills: {len(filled_deo)} | "
          f"missing deo: {len(missing_deo)} | missing district: {len(missing_leg)}")
    print(f"multi-DEO districts: {list(multi_deo_groups)}")
    return 0 if not missing_deo and not missing_leg else 1


if __name__ == "__main__":
    sys.exit(main())
