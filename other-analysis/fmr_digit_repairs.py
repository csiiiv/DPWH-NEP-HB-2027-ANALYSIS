"""Accepted off-by-one / digit repairs for FMR normalized layers.

These acceptances promote PSGC-supported candidate repairs into the numeric
normalized arrays. Immutable `coordinates_raw` / OCR fragments are never
edited. Each acceptance records `off_by_one_digit_repair_accepted` (or
`source_numeric_repair_accepted` when the array already held the candidate).

Source: REPAIR_MANIFEST entries in validate_fmr_coordinates_psgc.py that
geocode AGREE against the title locality. Manual-review PARTIAL case
ib:p723:r3 is intentionally excluded.
"""

from __future__ import annotations

import math

# (layer, project_id, point_id, description, printed [lon,lat] or None, accepted [lon,lat])
ACCEPTANCES = [
    ("hgab", "ib:p667:r7", "ib:p667:r7:point1", "start latitude 17.00918 -> 18.00918",
     [120.7245783, 17.00918], [120.7245783, 18.00918]),
    ("hgab", "ib:p670:r4", "ib:p670:r4:point2", "end pair re-read as lat 18.153581",
     None, [120.53601, 18.153581]),
    ("hgab", "ib:p677:r5", "ib:p677:r5:point2", "end latitude 18.826792 -> 16.826792",
     [121.879302, 18.826792], [121.879302, 16.826792]),
    ("hgab", "ib:p680:r19", "ib:p680:r19:point1", "printed 14828381 -> 14.828381",
     None, [121.033211, 14.828381]),
    ("hgab", "ib:p685:r5", "ib:p685:r5:point2", "end longitude 129.8030109 -> 120.8030109",
     [129.8030109, 15.6377206], [120.8030109, 15.6377206]),
    ("hgab", "ib:p692:r16", "ib:p692:r16:point2", "S2 start latitude 4.606488 -> 14.606488",
     [121.583412, 4.606488], [121.583412, 14.606488]),
    ("hgab", "ib:p692:r16", "ib:p692:r16:point3", "S1 end latitude 4.606694 -> 14.606694",
     [121.583835, 4.606694], [121.583835, 14.606694]),
    ("hgab", "ib:p696:r17", "ib:p696:r17:point2", "end longitude 121.917756 -> 120.917756",
     [121.917756, 13.846302], [120.917756, 13.846302]),
    ("hgab", "ib:p696:r19", "ib:p696:r19:point2", "end longitude 121.914231 -> 120.914231",
     [121.914231, 13.823398], [120.914231, 13.823398]),
    ("hgab", "ib:p697:r12", "ib:p697:r12:point3", "S1 end longitude 121.953232 -> 120.953232",
     [121.953232, 13.84248], [120.953232, 13.84248]),
    ("hgab", "ib:p703:r11", "ib:p703:r11:point2", "printed 123.691.92 -> 123.69192",
     [123.69192, 12.528813], [123.69192, 12.528813]),
    ("hgab", "ib:p713:r3", "ib:p713:r3:point4", "section 2 end latitude 1.8042275 -> 9.8042275",
     [123.4080266, 1.8042275], [123.4080266, 9.8042275]),
    ("hgab", "ib:p713:r12", "ib:p713:r12:point1", "start latitude 11.871556 -> 10.871556",
     [124.488833, 11.871556], [124.488833, 10.871556]),
    ("nep", "nep_fmr:p44:r10", "nep_fmr:p44:r10:point2", "end longitude 125.008575 -> 126.008575",
     [125.008575, 7.989994], [126.008575, 7.989994]),
    ("nep", "nep_fmr:p1:r7", "nep_fmr:p1:r7:point1", "start latitude 17.00918 -> 18.00918",
     [120.7245783, 17.00918], [120.7245783, 18.00918]),
    ("nep", "nep_fmr:p4:r13", "nep_fmr:p4:r13:point2", "end pair re-read as lat 18.153581",
     None, [120.53601, 18.153581]),
    ("nep", "nep_fmr:p11:r11", "nep_fmr:p11:r11:point2", "end latitude 18.826792 -> 16.826792",
     [121.879302, 18.826792], [121.879302, 16.826792]),
    ("nep", "nep_fmr:p18:r15", "nep_fmr:p18:r15:point2", "end longitude 129.8030109 -> 120.8030109",
     [129.8030109, 15.6377206], [120.8030109, 15.6377206]),
    ("nep", "nep_fmr:p24:r10", "nep_fmr:p24:r10:point2", "S2 start latitude 4.606488 -> 14.606488",
     [121.583412, 4.606488], [121.583412, 14.606488]),
    ("nep", "nep_fmr:p24:r10", "nep_fmr:p24:r10:point3", "S1 end latitude 4.606694 -> 14.606694",
     [121.583835, 4.606694], [121.583835, 14.606694]),
    ("nep", "nep_fmr:p30:r14", "nep_fmr:p30:r14:point2", "printed 123.691.92 -> 123.69192",
     [123.69192, 12.528813], [123.69192, 12.528813]),
    ("nep", "nep_fmr:p37:r8", "nep_fmr:p37:r8:point1", "start latitude 11.871556 -> 10.871556",
     [124.488833, 11.871556], [124.488833, 10.871556]),
]

RULE_DIGIT = "off_by_one_digit_repair_accepted"
RULE_NUMERIC = "source_numeric_repair_accepted"
CLEARABLE_ISSUES = {
    "source_numeric_repair_candidate",
    "invalid_coordinate_pair",
    "outside_philippines_orientation_bounds",
    "endpoint_distance_over_100_km",
}


def distance_km(start, end):
    if any(start.get(k) is None or end.get(k) is None for k in ("latitude", "longitude")):
        return None
    lat1, lat2 = math.radians(start["latitude"]), math.radians(end["latitude"])
    dlat, dlon = lat2 - lat1, math.radians(end["longitude"] - start["longitude"])
    a = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return round(6371.0088 * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a)), 6)


def acceptances_for(layer: str):
    return [row for row in ACCEPTANCES if row[0] == layer]


def _in_ph_bounds(lon, lat):
    return 4 <= lat <= 22 and 116 <= lon <= 127


def apply_acceptances(projects, layer: str):
    """Mutate normalized projects in place; return acceptance audit rows."""
    by_id = {p["project_id"]: p for p in projects}
    applied = []
    for _layer, project_id, point_id, desc, printed, accepted in acceptances_for(layer):
        project = by_id.get(project_id)
        if project is None:
            raise ValueError(f"{project_id}: missing from {layer} projects")
        point = next((pt for pt in project["points"] if pt["id"] == point_id), None)
        if point is None:
            raise ValueError(f"{point_id}: missing from {project_id}")
        current = point.get("coordinates")
        if printed is not None and current != printed:
            raise ValueError(
                f"{point_id}: expected printed {printed} before acceptance, found {current}")
        if printed is None and current not in (None, accepted):
            raise ValueError(
                f"{point_id}: unexpected pre-acceptance coordinates {current}")
        already = current == accepted
        lon, lat = accepted
        point["longitude"] = lon
        point["latitude"] = lat
        point["coordinates"] = [lon, lat]
        point["issues"] = sorted(set(point.get("issues") or []) - CLEARABLE_ISSUES)
        if not _in_ph_bounds(lon, lat):
            point["issues"] = sorted(set(point["issues"] + ["outside_philippines_orientation_bounds"]))
        # Promote already-applied numeric candidates vs apply a new off-by-one fix.
        rule = RULE_NUMERIC if already else RULE_DIGIT
        point["rules"] = sorted(set(point.get("rules") or []) | {rule})
        applied.append({
            "layer": layer, "project_id": project_id, "point_id": point_id,
            "repair": desc, "printed": printed, "accepted": accepted,
            "rule": rule, "geometry_changed": not already,
        })
        _rebuild_project_geometry(project)
    return applied


def _rebuild_project_geometry(project):
    points = {pt["id"]: pt for pt in project["points"]}
    for segment in project["segments"]:
        members = [points[i] for i in segment["point_ids"]]
        start = [p for p in members if p["role"] == "start"]
        end = [p for p in members if p["role"] == "end"]
        issues = sorted(set(i for p in members for i in (p.get("issues") or [])))
        structural = {"missing_or_ambiguous_segment_endpoint", "single_point_without_endpoint_roles"}
        prior_structural = set(segment.get("review_flags") or []) & structural
        if len(start) != 1 or len(end) != 1:
            issues = sorted(set(issues) | prior_structural)
            if not prior_structural:
                issues.append("missing_or_ambiguous_segment_endpoint")
        s = start[0] if len(start) == 1 else None
        e = end[0] if len(end) == 1 else None
        if s:
            segment["start_longitude"], segment["start_latitude"] = s["longitude"], s["latitude"]
        if e:
            segment["end_longitude"], segment["end_latitude"] = e["longitude"], e["latitude"]
        segment["straight_line_distance_km"] = distance_km(s, e) if s and e else None
        if any(p["role"] != "unspecified" for p in members):
            segment["coordinates"] = [s["coordinates"] if s else None, e["coordinates"] if e else None]
        else:
            segment["coordinates"] = [p["coordinates"] for p in members]
        if segment["straight_line_distance_km"] is not None and segment["straight_line_distance_km"] > 100:
            issues.append("endpoint_distance_over_100_km")
        segment["normalization_rules"] = sorted({
            *(segment.get("normalization_rules") or []),
            *(r for p in members for r in (p.get("rules") or [])),
        })
        segment["review_flags"] = sorted(set(issues))
        segment["status"] = "needs_review" if segment["review_flags"] else "normalized"

    scalar = project["segments"][0] if len(project["segments"]) == 1 else None
    for name in ("start_longitude", "start_latitude", "end_longitude", "end_latitude"):
        project[name] = scalar[name] if scalar else None
    project["coordinates"] = [s["coordinates"] for s in project["segments"]]
    project["review_flags"] = sorted({f for s in project["segments"] for f in s["review_flags"]})
    project["normalization_rules"] = sorted({
        r for s in project["segments"] for r in s["normalization_rules"]})
    project["status"] = "needs_review" if project["review_flags"] else "normalized"
