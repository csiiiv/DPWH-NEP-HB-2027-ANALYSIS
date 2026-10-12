#!/usr/bin/env python3
"""Build per-document FMR final datasets (JSON) with full provenance.

Each FMR source document gets its own consolidated release artifact:

  * other-analysis/data/hgab_fmr_final_dataset.json  (House GAB, Vol I-B annex)
  * other-analysis/data/nep_fmr_final_dataset.json   (DBM NEP standalone FMR schedule)

The two documents are different legislative artifacts with their own trees,
pages, amounts, and review evidence; they are never merged here. Any
comparison between them belongs to a separate analysis pass.

Per stage, every project entry carries: title, amount, source page/bbox
lineage, normalized coordinates by segment, review flags, per-point PSGC
geocoding of all points (PSA 2023, via the dpwh_coor2psgc_geomapping
submodule), the parsed title locality recorded verbatim, and a
location-agreement classification for additional review.

Inputs (retained, hash-anchored):
  * other-analysis/data/{hgab,nep}_fmr_coordinates_normalized.json
  * other-analysis/data/fmr_psgc_validation.json (flagged-coordinate evidence;
    its anchors are re-verified here before any output is written)

The outputs are release/report artifacts; they do not feed back into the
normalized layers or the workbench. Run from the repository root:

    python3 other-analysis/build_fmr_final_dataset.py            # rebuild
    python3 other-analysis/build_fmr_final_dataset.py --check    # verify
"""

import argparse
import hashlib
import json
import re
import subprocess
import sys
from datetime import date
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
GEOMAP_DIR = REPO / "dpwh_coor2psgc_geomapping"
SHAPEFILES = GEOMAP_DIR / "philippines-psgc-shapefiles" / "data" / "2023"
sys.path.insert(0, str(GEOMAP_DIR))

STAGES = {
    "hgab": {
        "layer": "other-analysis/data/hgab_fmr_coordinates_normalized.json",
        "out": REPO / "other-analysis/data/hgab_fmr_final_dataset.json",
        "label": "House GAB Volume I-B, DA locally funded FMR annex (HB 10858, second reading working copy)",
    },
    "nep": {
        "layer": "other-analysis/data/nep_fmr_coordinates_normalized.json",
        "out": REPO / "other-analysis/data/nep_fmr_final_dataset.json",
        "label": "DBM NEP FY 2027 standalone FMR schedule",
    },
}
PSGC_AUDIT = "other-analysis/data/fmr_psgc_validation.json"
VALIDATOR = "other-analysis/validate_fmr_coordinates_psgc.py"

REGION_CODE = {
    "REGION I": "I", "REGION II": "II", "REGION III": "III",
    "REGION IVA": "IVA", "REGION IVB": "IVB", "REGION V": "V",
    "REGION VI": "VI", "REGION VII": "VII", "REGION VIII": "VIII",
    "REGION IX": "IX", "REGION X": "X", "REGION XI": "XI",
    "REGION XII": "XII", "REGION XIII": "XIII",
    "CAR": "CAR", "NIR": "NIR", "MIMAROPA": "IVB",
}

BRGY_TOKEN = re.compile(r"(brgy|barangay|sitio|purok)", re.I)


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def norm_name(s):
    if not s:
        return ""
    s = (str(s).casefold().replace("'", "").replace(".", "")
         .replace("city of ", "").replace(" city", "")
         .replace("sta ", "santa ").replace("sto ", "santo ")
         .replace("malang", "mlang"))
    return " ".join(s.split())


def classify_location(result, parsed):
    """Classify one geocode result against the parsed title locality."""
    if not result or not result.get("match"):
        return "NO_MATCH"
    got_prov = norm_name(result.get("province"))
    got_muni = norm_name(result.get("municipality"))
    got_brgy = norm_name(result.get("barangay"))
    prov = norm_name(parsed["province"])
    muni = norm_name(parsed.get("municipality"))

    def inside(needle, hay):
        return bool(needle) and bool(hay) and (needle in hay or hay in needle)

    prov_ok = inside(prov, got_prov)
    muni_ok = inside(muni, got_muni)
    brgy_list = parsed.get("barangays") or ([parsed["barangay"]] if parsed.get("barangay") else [])
    brgy_ok = any(inside(norm_name(b), got_brgy) for b in brgy_list)
    if prov_ok and muni_ok and (brgy_ok or not brgy_list):
        return "AGREE"
    if prov_ok and muni_ok:
        return "AGREE_MUNI_BRGY_DIFFERS"
    if prov_ok:
        return "PARTIAL_PROVINCE_ONLY"
    return "DISAGREE"


def parse_title_locality(title):
    """Split the title's trailing components into barangay/town/province.

    Titles end '..., <barangay/locality>, <town>, <province>' with the town
    sometimes omitted for city localities. An FMR commonly connects two
    barangays, so every barangay/sitio/purok fragment named in the title is
    collected as a locality candidate. The final component is treated as the
    province; components are recorded verbatim and not asserted correct.
    """
    comps = [c.strip() for c in title.rstrip(" .").split(",")]
    if not comps or not comps[-1]:
        return {"barangay": None, "barangays": [], "municipality": None,
                "province": "", "parse_note": "empty province component"}
    province = comps[-1]
    rest = comps[:-1]
    municipality = None
    barangays = []
    parse_note = None
    # Find the town: the last component that is not a barangay/sitio/purok
    # fragment and carries no FMR suffix.
    town_idx = None
    for i in range(len(rest) - 1, -1, -1):
        if not (BRGY_TOKEN.search(rest[i]) and "FMR" not in rest[i]):
            town_idx = i
            break
    if town_idx is None:
        parse_note = "no town component identified"
    else:
        municipality = rest[town_idx]
        # Collect every barangay fragment anywhere before the town; FMR titles
        # often name both endpoint barangays ('Brgy. A - Brgy. B').
        for comp in rest[:town_idx + 1]:
            if BRGY_TOKEN.search(comp) and "FMR" not in comp:
                parts = [p.strip(" -") for p in
                         re.split(r"(?:brgy|barangay)\.?\s*", comp, flags=re.I)
                         if p.strip(" -")]
                parts = [re.sub(r"\s+(?:and|&|to)$", "", p).strip(" -")
                         for p in parts]
                parts = [re.sub(r"^(?:and|&|to)\s+", "", p).strip(" -")
                         for p in parts]
                barangays.extend(p for p in parts if p)
    return {"barangay": barangays[-1] if barangays else None,
            "barangays": barangays, "municipality": municipality,
            "province": province, "parse_note": parse_note}


def verify_anchors():
    """Re-verify the hashes recorded in the PSGC evidence audit."""
    audit = json.loads((REPO / PSGC_AUDIT).read_text())
    meta = audit["metadata"]
    problems = []
    for stage in STAGES.values():
        if sha256_file(REPO / stage["layer"]) != meta.get(
                f"{'hgab' if 'hgab' in stage['layer'] else 'nep'}_layer_sha256"):
            problems.append(f"{stage['layer']} differs from the hash in {PSGC_AUDIT}")
    commit = subprocess.run(["git", "-C", str(GEOMAP_DIR), "rev-parse", "HEAD"],
                            capture_output=True, text=True, check=True).stdout.strip()
    if commit != meta["geomapper_submodule_commit"]:
        problems.append("dpwh_coor2psgc_geomapping commit changed")
    for name, digest in meta["psgc_shapefiles_sha256"].items():
        if sha256_file(SHAPEFILES / name) != digest:
            problems.append(f"PSGC shapefile {name} changed")
    return audit, problems


def geocode_project_points(mapper, project):
    points = []
    for pt in project["points"]:
        coords = pt.get("coordinates")
        entry = {"point_id": pt["id"], "role": pt["role"],
                 "section_label": pt.get("section_label"),
                 "coordinates": coords}
        if coords is None:
            entry["psgc"] = None
            entry["psgc_note"] = "printed pair cannot form a numeric lat/lon"
        else:
            lon, lat = coords
            res = mapper.geomap_point(lat, lon)
            entry["psgc"] = {
                "match": bool(res.get("success")),
                "region": res.get("region"), "region_psgc": res.get("region_psgc"),
                "province": res.get("province"), "province_psgc": res.get("province_psgc"),
                "municipality": res.get("municipality"),
                "municipality_psgc": res.get("municipality_psgc"),
                "barangay": res.get("barangay"), "barangay_psgc": res.get("barangay_psgc"),
            }
        points.append(entry)
    return points


def project_agreement(points, parsed):
    verdicts = [classify_location(pt["psgc"], parsed) if pt["psgc"] else "NO_MATCH"
                for pt in points]
    if not verdicts:
        return "NO_POINTS", verdicts
    if all(v == "AGREE" for v in verdicts):
        return "ALL_POINTS_AGREE", verdicts
    if any(v.startswith("AGREE") for v in verdicts):
        return "MIXED", verdicts
    if verdicts[0] in ("PARTIAL_PROVINCE_ONLY", "DISAGREE"):
        return verdicts[0], verdicts
    return "NO_MATCH", verdicts


def build_project_entry(project, mapper):
    parsed = parse_title_locality(project["title"])
    points = geocode_project_points(mapper, project)
    agreement, verdicts = project_agreement(points, parsed)
    src = project["source"]
    region = project.get("region") or ""
    return {
        "project_id": project["project_id"],
        "title": project["title"],
        "region": region,
        "region_code": REGION_CODE.get(
            re.sub(r"\s*[-–].*$", "", region.upper()), region.upper()[:3]),
        "amount_php": project["amount_php"],
        "status": project["status"],
        "review_flags": project.get("review_flags") or [],
        "normalization_rules": project.get("normalization_rules") or [],
        "original_review_flags": project.get("original_review_flags") or [],
        "coordinates_raw": project["coordinates_raw"],
        "coordinates": project["coordinates"],
        "segment_count": project["segment_count"],
        "point_count": project["point_count"],
        "source": {
            "source_pdf": src["source_pdf"], "pdf_page": src["pdf_page"],
            "printed_page": src["printed_page"], "table_row": src["table_row"],
            "bbox": src["bbox"],
        },
        "title_locality": {"barangay": parsed["barangay"],
                           "barangays": parsed["barangays"],
                           "municipality": parsed["municipality"],
                           "province": parsed["province"],
                           "parse_note": parsed["parse_note"]},
        "location_agreement": agreement,
        "point_verdicts": verdicts,
        "points": points,
    }


def summarize(entries):
    locations = {}
    for e in entries:
        locations[e["location_agreement"]] = locations.get(e["location_agreement"], 0) + 1
    return {
        "projects": len(entries),
        "amount_php": sum(e["amount_php"] for e in entries),
        "points": sum(len(e["points"]) for e in entries),
        "psgc_matched_points": sum(1 for e in entries for pt in e["points"]
                                   if pt["psgc"] and pt["psgc"]["match"]),
        "flagged_projects": sum(1 for e in entries if e["status"] == "needs_review"),
        "location_agreement": dict(sorted(locations.items())),
    }


def build_stage_payload(stage_key, stage, mapper):
    layer_rel = stage["layer"]
    layer = json.loads((REPO / layer_rel).read_text())
    projects = layer["projects"]
    entries = [build_project_entry(p, mapper) for p in projects]

    def sha(rel):
        return sha256_file(REPO / rel)
    commit = subprocess.run(["git", "-C", str(GEOMAP_DIR), "rev-parse", "HEAD"],
                            capture_output=True, text=True, check=True).stdout.strip()
    metadata = {
        "schema_version": 1,
        "generated_date": date.today().isoformat(),
        "document": stage["label"],
        "normalized_layer": {"path": layer_rel, "sha256": sha(layer_rel),
                             "source_pdf": projects[0]["source"]["source_pdf"],
                             "source_pdf_sha256": layer["metadata"]["source_pdf_sha256"]},
        "psgc_evidence_audit": {"path": PSGC_AUDIT, "sha256": sha(PSGC_AUDIT),
                                "anchors_verified": True},
        "builder_sha256": sha256_file(Path(__file__)),
        "validator_sha256": sha(REPO / VALIDATOR),
        "geomapper_submodule_commit": commit,
        "psgc_shapefiles_source": "altcoder/philippines-psgc-shapefiles (2023), via dpwh_coor2psgc_geomapping submodule",
        "psgc_shapefiles_sha256": {name: sha256_file(SHAPEFILES / name)
                                   for name in json.loads((REPO / PSGC_AUDIT).read_text())["metadata"]["psgc_shapefiles_sha256"]},
        "coordinate_unit": "decimal degrees",
        "coordinate_column_order": "longitude, latitude",
        "title_locality_note": ("barangay/municipality/province parsed from the "
                                "trailing title components and recorded verbatim; "
                                "parsed names are not asserted to be correct"),
        "location_agreement_values": ["ALL_POINTS_AGREE", "MIXED",
                                      "AGREE_MUNI_BRGY_DIFFERS", "PARTIAL_PROVINCE_ONLY",
                                      "DISAGREE", "NO_MATCH", "NO_POINTS"],
        "scope_note": ("single-document release artifact; comparisons with other "
                       "documents belong to a separate analysis pass"),
        "disposition": ("derived from the retained normalized layers; does not "
                        "modify them or the source text"),
    }
    return {"metadata": metadata, "summary": summarize(entries), "projects": entries}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true",
                        help="verify committed outputs without rewriting")
    args = parser.parse_args()

    _audit, problems = verify_anchors()
    if problems:
        raise SystemExit("Anchor verification failed; rebuild the PSGC evidence layer:\n  "
                         + "\n  ".join(problems))

    from combined_geomap.combined_geomapper import CombinedPSGCGeomapper
    mapper = CombinedPSGCGeomapper(SHAPEFILES)

    for stage_key, stage in STAGES.items():
        payload = build_stage_payload(stage_key, stage, mapper)
        blob = json.dumps(payload, indent=1, ensure_ascii=False) + "\n"
        if args.check:
            if not stage["out"].exists():
                raise SystemExit(f"--check: missing {stage['out'].name}; rebuild first")
            if stage["out"].read_text() != blob:
                raise SystemExit(f"--check: committed {stage['out'].name} drifted")
            print(f"{stage['out'].name} check passed:",
                  json.dumps(payload["summary"]))
        else:
            stage["out"].write_text(blob)
            print(f"Wrote {stage['out'].relative_to(REPO)} "
                  f"({stage['out'].stat().st_size / 1e6:.1f} MB)")
            print(f"  {stage_key}: {json.dumps(payload['summary'])}")


if __name__ == "__main__":
    main()
