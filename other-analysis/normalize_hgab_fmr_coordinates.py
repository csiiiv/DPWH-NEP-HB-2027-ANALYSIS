#!/usr/bin/env python3
"""Normalize native HGAB FMR coordinates; preserve source data and segment grain.

Run after extract_hgab_fmr.py. This is a derived layer, never a PDF/source repair.
Outputs longitude/latitude in decimal degrees; the source does not specify a CRS.
"""
import argparse
import collections
import csv
import hashlib
import io
import json
import math
from pathlib import Path
import re
import sys

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from fmr_digit_repairs import apply_acceptances

INPUT = HERE / "data/hgab_fmr_tree.json"
OUT = HERE / "data"
EVENT = re.compile(r"(?P<endpoint>\b(?:STARTT?|STAR|END)\b)(?:\s*\((?:SEC(?:TION)?\s*)?(?P<endpoint_section>\d+)\))?\s*(?P<colon>:)?"
                   r"|(?P<section>\bSECTION\s*(?P<section_number>\d+)\s*:?)"
                   r"|(?P<short_section>\bS(?P<short_number>\d+)\s*[-:])"
                   r"|(?P<numbered>\((?P<number>\d+)\))", re.I)
DMS = r"(?P<degrees>\d{1,3})(?P<degree_sep>°|\s+|\.(?=\d{1,2}\s*'))\s*(?P<minutes>\d{1,2})\s*'\s*(?P<seconds>\d+(?:\.\d+)?)(?P<seconds_quote>\s*\")?"
ANGLE = re.compile(r"(?P<prefix>[NSEW])?\s*(?:" + DMS + r"|(?P<decimal>[+-]?\d+(?:[.:]\s*\d+)*))\s*(?P<decoration>[°`\"])?\s*(?P<suffix>[NSEW])?", re.I)
ORIGINAL_FLAGS = ["coordinate_format_needs_review", "out_of_range_or_reversed_decimal_pair",
                  "endpoint_count_or_section_structure_needs_review", "section_specific_endpoints",
                  "outside_philippines_orientation_bounds", "no_explicit_start_end_markers",
                  "nonstandard_endpoint_marker"]


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def ascii_text(text):
    return text.translate(str.maketrans({"’": "'", "‘": "'", "′": "'", "”": '"', "“": '"', "″": '"', "º": "°", "−": "-"}))


def parse_angle(match):
    rules, issues = [], []
    if match["degrees"] is not None:
        degrees, minutes, seconds = int(match["degrees"]), int(match["minutes"]), float(match["seconds"])
        value = degrees + minutes / 60 + seconds / 3600
        rules.append("dms_to_decimal_degrees")
        if match["degree_sep"] == ".":
            rules.append("dot_used_as_dms_degree_separator")
        if not match["seconds_quote"]:
            rules.append("dms_seconds_quote_restored")
        if not (0 <= minutes < 60 and 0 <= seconds < 60):
            issues.append("invalid_dms_minutes_or_seconds")
    else:
        raw = match["decimal"]
        compact = re.sub(r"\s+", "", raw)
        if compact != raw:
            rules.append("decimal_spacing_removed")
        if ":" in compact:
            compact = compact.replace(":", ".")
            rules.append("colon_decimal_separator_candidate")
            issues.append("source_numeric_repair_candidate")
        if compact.count(".") > 1:
            first, *rest = compact.split(".")
            compact = first + "." + "".join(rest)
            rules.append("extra_decimal_separator_candidate")
            issues.append("source_numeric_repair_candidate")
        if "." not in compact and abs(int(compact)) > 180:
            # Only the observed eight-digit missing-decimal latitude pattern.
            if re.fullmatch(r"\d{8}", compact) and 4 <= int(compact[:2]) <= 22:
                compact = compact[:2] + "." + compact[2:]
                rules.append("missing_latitude_decimal_candidate")
                issues.append("source_numeric_repair_candidate")
        value = float(compact)
        if match["decoration"]:
            rules.append("decimal_angle_unit_marker_removed")
    direction = (match["prefix"] or match["suffix"] or "").upper()
    if match["prefix"] or match["suffix"]:
        rules.append("hemisphere_interpreted")
    if match["prefix"] and match["suffix"] and match["prefix"].upper() != match["suffix"].upper():
        issues.append("conflicting_hemisphere_markers")
    if direction in {"S", "W"}:
        value = -abs(value)
    elif direction in {"N", "E"}:
        if value < 0:
            issues.append("conflicting_sign_and_hemisphere")
        value = abs(value)
    return {"value": value, "axis": "latitude" if direction in {"N", "S"} else "longitude" if direction else None,
            "rules": rules, "issues": issues}


def parse_pairs(raw):
    """Return every coordinate pair in a source fragment, plus consumed-text audit."""
    text = ascii_text(raw)
    rules, suffix = [], ""
    if text != raw:
        rules.append("unicode_angle_punctuation_normalized")
    text = text.strip()
    annotation = re.search(r"[oO]\s*\d+\s*$", text)
    if annotation:
        suffix = text[annotation.start():]
        text = text[:annotation.start()].rstrip()
        rules.append("trailing_annotation_preserved")
    if re.search(r"\b(?:LAT(?:ITUDE)?|LON(?:G(?:ITUDE)?)?|[XY])\s*:", text, re.I):
        rules.append("coordinate_axis_labels_removed")
        text = re.sub(r"\b(?:LAT(?:ITUDE)?|LON(?:G(?:ITUDE)?)?|[XY])\s*:", " ", text, flags=re.I)
    matches = list(ANGLE.finditer(text))
    residue = text
    for match in reversed(matches):
        residue = residue[:match.start()] + " " + residue[match.end():]
    residue = re.sub(r"[\s,;\"'`°]+", "", residue)
    if not matches or len(matches) % 2 or residue:
        return [{"raw": raw, "longitude": None, "latitude": None, "rules": rules,
                 "issues": ["unparsed_coordinate_fragment"], "unconsumed_text": residue,
                 "trailing_annotation_raw": suffix}]
    result = []
    for index in range(0, len(matches), 2):
        a, b = parse_angle(matches[index]), parse_angle(matches[index + 1])
        applied = rules + a["rules"] + b["rules"]
        issues = a["issues"] + b["issues"]
        if a["axis"] == "longitude" or b["axis"] == "latitude":
            lat, lon = b["value"], a["value"]
            applied.append("longitude_first_reordered")
        elif a["axis"] == "latitude" or b["axis"] == "longitude":
            lat, lon = a["value"], b["value"]
        elif abs(a["value"]) > 90 and abs(b["value"]) <= 90:
            lat, lon = b["value"], a["value"]
            applied.append("longitude_first_reordered")
        else:
            lat, lon = a["value"], b["value"]
        if a["axis"] is not None and a["axis"] == b["axis"]:
            issues.append("conflicting_coordinate_axes")
        if not (-90 <= lat <= 90 and -180 <= lon <= 180) or any(i.startswith("conflicting_") or i.startswith("invalid_dms") for i in issues):
            issues.append("invalid_coordinate_pair")
            lat, lon = None, None
        elif not (4 <= lat <= 22 and 116 <= lon <= 127):
            issues.append("outside_philippines_orientation_bounds")
        result.append({"raw": raw[matches[index].start():matches[index + 1].end()] if text == raw else raw,
                       "longitude": round(lon, 10) if lon is not None else None,
                       "latitude": round(lat, 10) if lat is not None else None,
                       "rules": sorted(set(applied)), "issues": sorted(set(issues)),
                       "unconsumed_text": residue, "trailing_annotation_raw": suffix})
    return result


def endpoint_observations(raw):
    """Parse roles/sections as events, retaining offsets in the original raw string."""
    events = list(EVENT.finditer(raw))
    points, role, section, role_rules = [], "unspecified", None, []
    if not any(e["endpoint"] for e in events):
        # Station-labelled pairs: assign roles only for two increasing stations.
        station_lines = [line for line in raw.splitlines() if re.search(r"\bLAT\s*:", line, re.I)]
        chainages = []
        for line in station_lines:
            match = re.search(r"\bSTA[.:]?\s*(\d+)\+(\d+(?:\.\d+)?)", line, re.I)
            chainages.append(int(match[1]) * 1000 + float(match[2]) if match else None)
        infer_roles = len(station_lines) == 2 and all(c is not None for c in chainages) and chainages[0] < chainages[1]
        for index, line in enumerate(station_lines):
            value = re.split(r"\bLAT\s*:", line, maxsplit=1, flags=re.I)[1]
            for point in parse_pairs(value):
                point.update({"role": ("start" if index == 0 else "end") if infer_roles else "unspecified",
                              "section_label": None, "source_fragment_raw": line,
                              "source_offset": raw.find(line), "station_raw": line.split("Lat:")[0] if "Lat:" in line else line.split("LAT:")[0]})
                if infer_roles:
                    point["rules"].append("endpoint_roles_inferred_from_increasing_stations")
                else:
                    point["issues"].append("single_point_without_endpoint_roles")
                points.append(point)
        if not station_lines:
            for point in parse_pairs(raw):
                point.update({"role": "unspecified", "section_label": None, "source_fragment_raw": raw, "source_offset": 0})
                point["issues"].append("point_without_endpoint_roles")
                points.append(point)
        return points
    for index, event in enumerate(events):
        if event["endpoint"]:
            literal = event["endpoint"].upper()
            role = "end" if literal == "END" else "start"
            role_rules = []
            if literal not in {"START", "END"}:
                role_rules.append("endpoint_marker_typo_normalized")
            if not event["colon"]:
                role_rules.append("endpoint_colon_restored")
            if event["endpoint_section"]:
                section = event["endpoint_section"]
        else:
            section = event["section_number"] or event["short_number"] or event["number"]
        end = events[index + 1].start() if index + 1 < len(events) else len(raw)
        fragment = raw[event.end():end]
        if not fragment.strip().strip(","):
            continue
        for point in parse_pairs(fragment):
            point.update({"role": role, "section_label": section,
                          "source_fragment_raw": fragment, "source_offset": event.end()})
            point["rules"] = sorted(set(point["rules"] + role_rules))
            points.append(point)
    return points


def distance_km(start, end):
    if any(p[k] is None for p in [start, end] for k in ["latitude", "longitude"]):
        return None
    lat1, lat2 = math.radians(start["latitude"]), math.radians(end["latitude"])
    dlat, dlon = lat2 - lat1, math.radians(end["longitude"] - start["longitude"])
    a = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return round(6371.0088 * 2 * math.asin(min(1, math.sqrt(a))), 6)


def normalize_project(project):
    points = endpoint_observations(project["coordinates_raw"])
    # Numbered sections pair by label; parallel unlabelled lists pair by ordinal.
    starts = [p for p in points if p["role"] == "start"]
    ends = [p for p in points if p["role"] == "end"]
    groups = collections.OrderedDict()
    counters = collections.Counter()
    for point_index, point in enumerate(points, 1):
        counters[point["role"]] += 1
        point["id"] = f"{project['id']}:point{point_index}"
        point["coordinates"] = [point["longitude"], point["latitude"]] if point["longitude"] is not None and point["latitude"] is not None else None
        if point["role"] == "unspecified":
            label = "unspecified"
        elif point["section_label"] is not None:
            label = "section:" + point["section_label"]
        else:
            label = "ordinal:" + str(counters[point["role"]])
        if point["section_label"] is None and max(len(starts), len(ends)) > 1 and point["role"] != "unspecified":
            point["rules"] = sorted(set(point["rules"] + ["segments_paired_by_source_list_order"]))
        groups.setdefault(label, []).append(point)
    segments = []
    for index, (label, members) in enumerate(groups.items(), 1):
        start = [p for p in members if p["role"] == "start"]
        end = [p for p in members if p["role"] == "end"]
        issues = sorted(set(i for p in members for i in p["issues"]))
        if len(start) != 1 or len(end) != 1:
            issues.append("missing_or_ambiguous_segment_endpoint")
        s, e = start[0] if len(start) == 1 else None, end[0] if len(end) == 1 else None
        segment = {"id": f"{project['id']}:segment{index}", "project_id": project["id"],
                   "segment_index": index, "section_label": label, "point_ids": [p["id"] for p in members],
                   "pairing_basis": "explicit_section" if label.startswith("section:") else "source_list_order" if max(len(starts), len(ends)) > 1 else "single_pair" if s and e else "unpaired_point",
                   "start_longitude": s["longitude"] if s else None, "start_latitude": s["latitude"] if s else None,
                   "end_longitude": e["longitude"] if e else None, "end_latitude": e["latitude"] if e else None,
                   "straight_line_distance_km": distance_km(s, e) if s and e else None,
                   "normalization_rules": sorted(set(r for p in members for r in p["rules"]))}
        # Arrays use longitude first. Keep unavailable endpoint slots explicit.
        segment["coordinates"] = ([s["coordinates"] if s else None, e["coordinates"] if e else None]
                                  if any(p["role"] != "unspecified" for p in members)
                                  else [p["coordinates"] for p in members])
        if segment["straight_line_distance_km"] is not None and segment["straight_line_distance_km"] > 100:
            issues.append("endpoint_distance_over_100_km")
        segment["review_flags"] = sorted(set(issues))
        segment["status"] = "needs_review" if issues else "normalized"
        segments.append(segment)
    scalar = segments[0] if len(segments) == 1 else None
    unspecified = [p for p in points if p["role"] == "unspecified"]
    fields = {name: scalar[name] if scalar else None for name in ["start_longitude", "start_latitude", "end_longitude", "end_latitude"]}
    fields.update({"point_longitude": unspecified[0]["longitude"] if len(unspecified) == 1 else None,
                   "point_latitude": unspecified[0]["latitude"] if len(unspecified) == 1 else None})
    return {"project_id": project["id"], "title": project["title"], "region": project["region_label"],
            "amount_php": project["printed_amount_php"], "source": project["source"],
            "coordinates_raw": project["coordinates_raw"], "original_review_flags": project["coordinate_review_flags"],
            "coordinates": [s["coordinates"] for s in segments],
            "segment_count": len(segments), "point_count": len(points), **fields,
            "status": "needs_review" if any(s["review_flags"] for s in segments) else "normalized",
            "review_flags": sorted(set(f for s in segments for f in s["review_flags"])),
            "normalization_rules": sorted(set(r for p in points for r in p["rules"])),
            "points": points, "segments": segments}


def csv_text(rows, fields):
    out = io.StringIO(newline="")
    writer = csv.DictWriter(out, fieldnames=fields, lineterminator="\n")
    writer.writeheader()
    for row in rows:
        writer.writerow({key: " | ".join(row[key]) if isinstance(row.get(key), list) else row.get(key) for key in fields})
    return out.getvalue()


def build(input_path=INPUT):
    tree = json.loads(input_path.read_text())
    originals = [n for n in tree["nodes"] if n["kind"] == "project"]
    projects = [normalize_project(p) for p in originals]
    digit_repairs = apply_acceptances(projects, "hgab")
    points = [dict(point, project_id=p["project_id"], pdf_page=p["source"]["pdf_page"], printed_page=p["source"]["printed_page"]) for p in projects for point in p["points"]]
    segments = [dict(segment, title=p["title"], region=p["region"], pdf_page=p["source"]["pdf_page"], printed_page=p["source"]["printed_page"]) for p in projects for segment in p["segments"]]
    metadata = {"schema_version": 1, "source_tree": str(input_path.relative_to(HERE)), "source_tree_sha256": sha(input_path),
                "source_pdf_sha256": tree["metadata"]["source_sha256"], "normalizer_sha256": sha(__file__),
                "coordinate_unit": "decimal degrees", "coordinate_column_order": "longitude, latitude",
                "coordinate_structure": "project.coordinates is an array of segments; each segment is an array of [longitude, latitude] pairs; unavailable points are null",
                "source_crs": "not stated in the source; no datum transformation applied",
                "scalar_project_columns": "filled only for one segment; multi-section endpoints remain in segment rows",
                "amounts": "project CSV only; no allocation duplicated in point/segment CSVs",
                "numeric_repair_candidates": "candidate readings may remain flagged; PSGC-supported off-by-one digit repairs are accepted into numeric arrays with rules off_by_one_digit_repair_accepted / source_numeric_repair_accepted; coordinates_raw stays immutable",
                "digit_repairs_accepted": len(digit_repairs)}
    errors = []
    if len(projects) != len(originals) or len({p["project_id"] for p in projects}) != len(projects):
        errors.append("project_coverage")
    if sum(p["amount_php"] for p in projects) != sum(p["printed_amount_php"] for p in originals):
        errors.append("allocation_ledger_changed")
    for source, project in zip(originals, projects):
        if source["coordinates_raw"] != project["coordinates_raw"]:
            errors.append("raw_coordinate_text_changed:" + project["project_id"])
        ids = [i for s in project["segments"] for i in s["point_ids"]]
        if collections.Counter(ids) != collections.Counter(p["id"] for p in project["points"]):
            errors.append("point_segment_ownership:" + project["project_id"])
        if len({p["id"] for p in project["points"]}) != len(project["points"]):
            errors.append("duplicate_point_id:" + project["project_id"])
    summary = {"projects": len(projects), "segments": len(segments), "points": len(points),
               "project_total_php": sum(p["amount_php"] for p in projects),
               "normalized_projects": sum(p["status"] == "normalized" for p in projects),
               "projects_needing_review": sum(p["status"] == "needs_review" for p in projects),
               "multi_segment_projects": sum(p["segment_count"] > 1 for p in projects),
               "fully_numeric_points": sum(p["latitude"] is not None and p["longitude"] is not None for p in points),
               "points_without_numeric_pair": sum(p["latitude"] is None or p["longitude"] is None for p in points),
               "original_83_flagged_projects_resolved": sum(bool(p["original_review_flags"]) and p["status"] == "normalized" for p in projects)}
    summary["original_flagged_projects_still_needing_review"] = sum(bool(p["original_review_flags"]) and p["status"] == "needs_review" for p in projects)
    summary["new_review_projects"] = sum(not p["original_review_flags"] and p["status"] == "needs_review" for p in projects)
    summary["digit_repairs_accepted"] = len(digit_repairs)
    summary["digit_repair_projects"] = sorted({row["project_id"] for row in digit_repairs})
    audit = {"metadata": metadata, "passed": not errors, "errors": errors, "summary": summary,
             "digit_repairs": digit_repairs,
             "review_flag_project_counts": dict(collections.Counter(f for p in projects for f in p["review_flags"])),
             "normalization_rule_project_counts": dict(collections.Counter(r for p in projects for r in p["normalization_rules"])),
             "original_flag_outcomes": {flag: {"original_projects": sum(flag in p["original_review_flags"] for p in projects),
                                              "normalized_projects": sum(flag in p["original_review_flags"] and p["status"] == "normalized" for p in projects),
                                              "remaining_review_projects": sum(flag in p["original_review_flags"] and p["status"] == "needs_review" for p in projects)} for flag in ORIGINAL_FLAGS}}
    flat = [dict(p, coordinates_json=json.dumps(p["coordinates"], separators=(",", ":")), pdf_page=p["source"]["pdf_page"], printed_page=p["source"]["printed_page"], source_pdf=p["source"]["source_pdf"]) for p in projects]
    for segment in segments:
        segment["coordinates_json"] = json.dumps(segment["coordinates"], separators=(",", ":"))
    project_fields = ["project_id", "region", "title", "amount_php", "segment_count", "point_count", "coordinates_json", "start_longitude", "start_latitude", "end_longitude", "end_latitude", "point_longitude", "point_latitude", "status", "review_flags", "normalization_rules", "original_review_flags", "coordinates_raw", "source_pdf", "pdf_page", "printed_page"]
    segment_fields = ["id", "project_id", "segment_index", "section_label", "pairing_basis", "coordinates_json", "start_longitude", "start_latitude", "end_longitude", "end_latitude", "straight_line_distance_km", "status", "review_flags", "normalization_rules", "point_ids", "title", "region", "pdf_page", "printed_page"]
    point_fields = ["id", "project_id", "role", "section_label", "longitude", "latitude", "rules", "issues", "source_fragment_raw", "source_offset", "station_raw", "trailing_annotation_raw", "unconsumed_text", "pdf_page", "printed_page"]
    artifacts = {"hgab_fmr_coordinates_normalized.json": json.dumps({"metadata": metadata, "projects": projects}, ensure_ascii=False, indent=2) + "\n",
                 "hgab_fmr_coordinate_normalization_audit.json": json.dumps(audit, ensure_ascii=False, indent=2) + "\n",
                 "hgab_fmr_projects_normalized.csv": csv_text(flat, project_fields),
                 "hgab_fmr_segments.csv": csv_text(segments, segment_fields),
                 "hgab_fmr_points.csv": csv_text(points, point_fields),
                 "hgab_fmr_coordinate_issues.csv": csv_text([p for p in flat if p["status"] == "needs_review"], project_fields)}
    return artifacts, audit


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="verify deterministic derived artifacts without rewriting")
    args = parser.parse_args()
    artifacts, audit = build()
    if not audit["passed"]:
        raise SystemExit(json.dumps(audit["errors"]))
    if args.check:
        stale = [name for name, value in artifacts.items() if not (OUT / name).exists() or (OUT / name).read_text() != value]
        if stale:
            raise SystemExit("Missing/stale coordinate outputs: " + ", ".join(stale))
    else:
        OUT.mkdir(parents=True, exist_ok=True)
        for name, value in artifacts.items():
            (OUT / name).write_text(value)
    print(json.dumps(audit["summary"], indent=2))
    print("Deterministic coordinate check passed." if args.check else "Normalized coordinate artifacts written.")


if __name__ == "__main__":
    main()
