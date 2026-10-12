#!/usr/bin/env python3
"""PSGC cross-validation of flagged FMR coordinates (provenance layer).

Geocodes the printed endpoints of every project still carrying a coordinate
review flag, plus explicitly labelled candidate repairs, and compares the
resulting PSGC administrative location against the locality stated in the
project title.

Method:
  1. Printed endpoints are read from the normalized layers
     (hgab/nep_fmr_coordinates_normalized.json) by project and point ID.
     Nothing about source values is hard-coded here.
  2. Candidate repairs are authored hypotheses in REPAIR_MANIFEST. Each entry
     names the repaired point, records the printed coordinates it expects, and
     supplies the repaired [longitude, latitude]. The manifest is rejected as
     stale when a normalized layer changes underneath it.
  3. Each point is geocoded with the dpwh_coor2psgc_geomapping submodule
     (PSA 2023 PSGC shapefiles) and classified against the title locality:
       AGREE     municipality and province match the title
       PARTIAL   province matches, municipality does not
       DISAGREE  province does not match
       NO_MATCH  point falls outside every administrative polygon

This layer never modifies the normalized outputs or the source text. It
produces evidence for review triage; repaired coordinates remain proposals,
not accepted corrections. Run from the repository root:

    python3 other-analysis/validate_fmr_coordinates_psgc.py           # rebuild
    python3 other-analysis/validate_fmr_coordinates_psgc.py --check   # verify
"""

import argparse
import csv
import hashlib
import json
import subprocess
import sys
from datetime import date
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
GEOMAP_DIR = REPO / "dpwh_coor2psgc_geomapping"
SHAPEFILES = GEOMAP_DIR / "philippines-psgc-shapefiles" / "data" / "2023"
sys.path.insert(0, str(GEOMAP_DIR))

HGAB_JSON = "other-analysis/data/hgab_fmr_coordinates_normalized.json"
NEP_JSON = "other-analysis/data/nep_fmr_coordinates_normalized.json"
OUT_JSON = REPO / "other-analysis/data/fmr_psgc_validation.json"
OUT_CSV = REPO / "other-analysis/data/fmr_psgc_validation_points.csv"

# Primary shapefiles loaded by geomap/geomap_core.py.
SHAPEFILES_USED = [
    "Regions/PH_Adm1_Regions.shp.shp",
    "Provdists/PH_Adm2_ProvDists.shp.shp",
    "Municities/PH_Adm3_MuniCities.shp.shp",
    "BgySubMuns/PH_Adm4_BgySubMuns.shp.shp",
]

# ---------------------------------------------------------------------------
# Authored review inputs. Expectations are localities as stated in the printed
# title; repairs are hypotheses, each tied to one point ID in one layer and
# validated against the layer's printed coordinates before use.
# ---------------------------------------------------------------------------

TITLE_LOCALITY = {
    "ib:p667:r7": {"municipality": "Marcos", "province": "Ilocos Norte"},
    "ib:p670:r4": {"municipality": "Laoag City", "province": "Ilocos Norte"},
    "ib:p677:r5": {"municipality": "Cauayan City", "province": "Isabela"},
    "ib:p680:r19": {"municipality": "San Jose Del Monte City", "province": "Bulacan"},
    "ib:p685:r5": {"municipality": "Guimba", "province": "Nueva Ecija"},
    "ib:p689:r18": {"municipality": "Camiling", "province": "Tarlac"},
    "ib:p692:r16": {"municipality": "Real", "province": "Quezon"},
    "ib:p696:r17": {"municipality": "San Luis", "province": "Batangas"},
    "ib:p696:r19": {"municipality": "San Luis", "province": "Batangas"},
    "ib:p697:r12": {"municipality": "San Luis", "province": "Batangas"},
    "ib:p703:r11": {"municipality": "San Jacinto", "province": "Masbate"},
    "ib:p713:r3": {"municipality": "Badian", "province": "Cebu"},
    "ib:p713:r12": {"municipality": "Isabel", "province": "Leyte"},
    "ib:p723:r3": {"municipality": "Matalam", "province": "Cotabato"},
    "nep_fmr:p1:r7": {"municipality": "Marcos", "province": "Ilocos Norte"},
    "nep_fmr:p4:r13": {"municipality": "Laoag City", "province": "Ilocos Norte"},
    "nep_fmr:p11:r11": {"municipality": "Cauayan City", "province": "Isabela"},
    "nep_fmr:p18:r15": {"municipality": "Guimba", "province": "Nueva Ecija"},
    "nep_fmr:p24:r10": {"municipality": "Real", "province": "Quezon"},
    "nep_fmr:p30:r14": {"municipality": "San Jacinto", "province": "Masbate"},
    "nep_fmr:p37:r8": {"municipality": "Isabel", "province": "Leyte"},
    "nep_fmr:p44:r10": {"municipality": "Sta. Josefa", "province": "Agusan del Sur"},
}

# NEP rows mirroring HGAB anomalies are NOT skipped: each printed value is a
# separate printed observation and is validated and geocoded independently.

# Remaining candidate repairs only. Off-by-one digit repairs that geocoded
# AGREE against the title locality were accepted into the normalized layers
# (see fmr_digit_repairs.py). This queue keeps the one PARTIAL / manual case.
REPAIR_MANIFEST = [
    # (layer, project_id, point_id, repair description, printed [lon, lat] or
    #  None when the printed pair is not numeric, repaired [lon, lat])
    ("hgab", "ib:p723:r3", "ib:p723:r3:point1", "printed 7:005288 -> 7.005288 (existing candidate)",
     [124.8880754, 7.005288], [124.8880754, 7.005288]),
]


def norm_name(s):
    """Normalize an administrative name for comparison."""
    if not s:
        return ""
    s = (s.casefold().replace("'", "").replace(".", "")
          .replace("city of ", "").replace(" city", "")
          .replace("sta ", "santa ").replace("sto ", "santo ")
          .replace("malang", "mlang"))
    return " ".join(s.split())


def classify(result, expected):
    """Compare a geocode result with the title locality."""
    if not result.get("success"):
        return "NO_MATCH", None
    got_prov = norm_name(result.get("province"))
    got_muni = norm_name(result.get("municipality"))
    exp_prov = norm_name(expected["province"])
    exp_muni = norm_name(expected["municipality"])
    where = f"{result.get('municipality')}, {result.get('province')} / Brgy. {result.get('barangay')}"
    prov_ok = bool(got_prov) and (exp_prov in got_prov or got_prov in exp_prov)
    muni_ok = bool(got_muni) and (exp_muni in got_muni or got_muni in exp_muni)
    if prov_ok and muni_ok:
        return "AGREE", where
    if prov_ok:
        return "PARTIAL", where
    return "DISAGREE", where


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def load_layer(path):
    data = json.loads((REPO / path).read_text())
    return {p["project_id"]: p for p in data["projects"]}


def point_index(project):
    return {pt["id"]: pt for pt in project["points"]}


def check_manifest_stale(layers):
    """Every manifest entry must reference a flagged project and match its
    layer coordinates exactly; otherwise the review evidence is stale."""
    errors = []
    for layer_name, project_id, point_id, _desc, printed, _rep in REPAIR_MANIFEST:
        project = layers[layer_name].get(project_id)
        if project is None:
            errors.append(f"{project_id}: not in {layer_name} layer")
            continue
        if project.get("status") != "needs_review":
            errors.append(f"{project_id}: no longer flagged needs_review in {layer_name}")
        point = point_index(project).get(point_id)
        if point is None:
            errors.append(f"{point_id}: point missing from {layer_name} layer")
            continue
        if printed is not None and point.get("coordinates") != printed:
            errors.append(
                f"{point_id}: manifest printed {printed} != layer {point.get('coordinates')}")
    return errors


def geocode_all():
    from combined_geomap.combined_geomapper import CombinedPSGCGeomapper
    mapper = CombinedPSGCGeomapper(SHAPEFILES)
    layers = {"hgab": load_layer(HGAB_JSON), "nep": load_layer(NEP_JSON)}

    stale = check_manifest_stale(layers)
    if stale:
        raise SystemExit("Stale review evidence; refusing to build:\n  " + "\n  ".join(stale))

    flagged = sorted(
        {pid for layer in layers.values()
         for pid, p in layer.items() if p.get("status") == "needs_review"})

    records = []
    for pid in flagged:
        for layer_name in ("hgab", "nep"):
            project = layers[layer_name].get(pid)
            if project is None:
                continue
            expected = TITLE_LOCALITY[pid]
            for pt in project["points"]:
                if pt.get("coordinates") is None:
                    records.append({
                        "project_id": pid, "layer": layer_name, "point_id": pt["id"],
                        "kind": "printed", "coordinates": None,
                        "verdict": "NO_MATCH", "where": None,
                        "title_barangay_match": None,
                        "note": "printed pair cannot form a numeric lat/lon",
                    })
                    continue
                lon, lat = pt["coordinates"]
                verdict, where = classify(mapper.geomap_point(lat, lon), expected)
                records.append({
                    "project_id": pid, "layer": layer_name, "point_id": pt["id"],
                    "kind": "printed", "coordinates": [lon, lat],
                    "verdict": verdict, "where": where,
                    "title_barangay_match": None, "note": None,
                })

    for layer_name, pid, point_id, desc, _printed, repaired in REPAIR_MANIFEST:
        expected = TITLE_LOCALITY[pid]
        lon, lat = repaired
        verdict, where = classify(mapper.geomap_point(lat, lon), expected)
        brgy_match = None
        if where and " / Brgy. " in where:
            brgy = norm_name(where.rsplit(" / Brgy. ", 1)[1])
            title = layers[layer_name][pid]["title"]
            brgy_match = any(norm_name(tok) and norm_name(tok) in brgy
                             for tok in title.replace("Brgy.", "|").split("|")[1:]
                             for tok in [tok.split(",")[0]])
        records.append({
            "project_id": pid, "layer": layer_name, "point_id": point_id,
            "kind": "candidate_repair", "repair": desc,
            "coordinates": repaired, "verdict": verdict, "where": where,
            "title_barangay_match": bool(brgy_match) if brgy_match is not None else None,
            "note": None,
        })
    return layers, records


def summarize(records):
    printed = [r for r in records if r["kind"] == "printed"]
    repairs = [r for r in records if r["kind"] == "candidate_repair"]
    def count(rs):
        out = {}
        for r in rs:
            out[r["verdict"]] = out.get(r["verdict"], 0) + 1
        return out
    manual_review = sorted({r["project_id"] for r in repairs if r["verdict"] != "AGREE"})
    confirmed = sorted({r["project_id"] for r in repairs if r["verdict"] == "AGREE"})
    return {
        "printed_points": len(printed),
        "printed_verdicts": count(printed),
        "candidate_repairs": len(repairs),
        "repair_verdicts": count(repairs),
        "repair_agree_projects": confirmed,
        "manual_review_projects": manual_review,
    }


def build_metadata():
    def h(path):
        return sha256_file(REPO / path)
    commit = subprocess.run(
        ["git", "-C", str(GEOMAP_DIR), "rev-parse", "HEAD"],
        capture_output=True, text=True, check=True).stdout.strip()
    return {
        "schema_version": 1,
        "generated_utc": None,  # deterministic build; filled only for display runs
        "generated_date": date.today().isoformat(),
        "hgab_layer": HGAB_JSON,
        "hgab_layer_sha256": h(HGAB_JSON),
        "nep_layer": NEP_JSON,
        "nep_layer_sha256": h(NEP_JSON),
        "validator_sha256": sha256_file(Path(__file__)),
        "geomapper_submodule_commit": commit,
        "psgc_shapefiles_source": "altcoder/philippines-psgc-shapefiles (2023), via dpwh_coor2psgc_geomapping submodule",
        "psgc_shapefiles_sha256": {name: sha256_file(SHAPEFILES / name)
                                   for name in SHAPEFILES_USED},
        "repair_manifest_project_count": len({pid for _l, pid, *_ in REPAIR_MANIFEST}),
        "coordinate_unit": "decimal degrees",
        "coordinate_column_order": "longitude, latitude",
        "disposition": ("evidence for remaining flagged projects; PSGC-supported "
                        "off-by-one digit repairs were accepted into normalized "
                        "numeric arrays via fmr_digit_repairs.py (raw text immutable)"),
    }


def write_outputs(records, metadata):
    summary = summarize(records)
    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    OUT_JSON.write_text(json.dumps(
        {"metadata": metadata, "passed": True, "summary": summary, "points": records},
        indent=1, ensure_ascii=False) + "\n")
    fieldnames = ["project_id", "layer", "point_id", "kind", "repair", "coordinates",
                  "verdict", "where", "title_barangay_match", "note"]
    with OUT_CSV.open("w", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=fieldnames)
        writer.writeheader()
        for r in records:
            row = {k: r.get(k) for k in fieldnames}
            row["coordinates"] = "" if r["coordinates"] is None else json.dumps(r["coordinates"])
            writer.writerow(row)
    return summary


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true",
                        help="recompute and compare against committed outputs")
    parser.add_argument("--quiet", action="store_true", help="suppress the point listing")
    args = parser.parse_args()

    layers, records = geocode_all()
    metadata = build_metadata()
    summary = summarize(records)

    if args.check:
        if not OUT_JSON.exists():
            raise SystemExit("--check: missing committed outputs; run a rebuild first")
        committed = json.loads(OUT_JSON.read_text())
        same = (committed.get("summary") == summary
                and committed.get("points") == records)
        if not same:
            for key in ("summary", "points"):
                if committed.get(key) != {"summary": summary, "points": records}[key]:
                    raise SystemExit(f"--check: committed {key} drifted from recomputation")
        stale_hash = []
        for key, expected in (
            ("hgab_layer_sha256", metadata["hgab_layer_sha256"]),
            ("nep_layer_sha256", metadata["nep_layer_sha256"]),
            ("validator_sha256", metadata["validator_sha256"]),
            ("geomapper_submodule_commit", metadata["geomapper_submodule_commit"]),
        ):
            if committed.get("metadata", {}).get(key) != expected:
                stale_hash.append(key)
        for name, digest in metadata["psgc_shapefiles_sha256"].items():
            if committed.get("metadata", {}).get("psgc_shapefiles_sha256", {}).get(name) != digest:
                stale_hash.append(f"psgc_shapefiles_sha256[{name}]")
        if stale_hash:
            raise SystemExit("--check: committed evidence anchors are stale: "
                             + ", ".join(sorted(stale_hash)))
        print("PSGC validation check passed:", json.dumps(summary))
        return

    write_outputs(records, metadata)
    print(f"Wrote {OUT_JSON.relative_to(REPO)} and {OUT_CSV.relative_to(REPO)}")
    print(json.dumps(summary, indent=1))
    if not args.quiet:
        for r in records:
            print(f"   [{r['kind']:16s}] {r['project_id']} {r['point_id']}: "
                  f"{r['verdict']:9s} {r.get('where') or r.get('note')}")


if __name__ == "__main__":
    main()
