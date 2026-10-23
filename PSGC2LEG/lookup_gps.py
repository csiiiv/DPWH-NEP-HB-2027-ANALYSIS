#!/usr/bin/env python3
"""GPS -> existing PSGC geomapper -> code-keyed PSGC2LEG electoral resolver.

Uses the pinned 2023 PSGC geometry already employed by the FMR pipeline.
This is a coordinate *point* lookup, not a congressional electoral polygon
lookup. Name-based district assignments are provisional; see README.md.
"""
import argparse
import json
import subprocess
import sys
import tempfile
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
GEOMAP_DIR = REPO / "dpwh_coor2psgc_geomapping"
SHAPES = GEOMAP_DIR / "philippines-psgc-shapefiles" / "data" / "2023"


def lookup(lat, lon):
    if not SHAPES.is_dir():
        raise RuntimeError(
            "PSGC shapefiles are unavailable. Initialize dpwh_coor2psgc_geomapping "
            "and its philippines-psgc-shapefiles/data/2023 source first."
        )
    sys.path.insert(0, str(GEOMAP_DIR))
    from combined_geomap.combined_geomapper import CombinedPSGCGeomapper

    mapper = CombinedPSGCGeomapper(SHAPES)
    location = mapper.geomap_point(lat, lon)
    if not location.get("success"):
        return {
            "coordinates": {"latitude": lat, "longitude": lon},
            "location": location,
            "districtId": None,
            "status": "no_psgc_polygon_match",
            "matchMethod": "geomapper_2023"
        }

    with tempfile.TemporaryDirectory(prefix="psgc2leg-") as d:
        file = Path(d) / "location.json"
        file.write_text(json.dumps(location), encoding="utf-8")
        process = subprocess.run(
            ["node", str(REPO / "PSGC2LEG" / "lookup_district.mjs"), "--geocoder", str(file)],
            check=True,
            capture_output=True,
            text=True
        )
    result = json.loads(process.stdout)
    result["coordinates"] = {"latitude": lat, "longitude": lon}
    result["psgcGeometryVintage"] = "2023"
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("latitude", type=float)
    parser.add_argument("longitude", type=float)
    args = parser.parse_args()
    if not (-90 <= args.latitude <= 90 and -180 <= args.longitude <= 180):
        parser.error("GPS coordinates outside WGS84 latitude/longitude ranges")
    try:
        print(json.dumps(lookup(args.latitude, args.longitude), indent=2, ensure_ascii=False))
    except (RuntimeError, OSError, subprocess.CalledProcessError) as error:
        parser.exit(2, "PSGC2LEG GPS lookup failed: " + str(error) + "\n")


if __name__ == "__main__":
    main()
