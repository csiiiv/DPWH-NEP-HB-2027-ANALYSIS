"""GPS/coordinate parse core shared by the cross-dataset inventory scanner.

Logic is adapted from other-analysis/normalize_{hgab,nep}_fmr_coordinates.py
(parse_angle / parse_pairs / endpoint_observations). Kept here so gps-analysis
is self-contained; FMR normalizers remain the provenance-certified pipelines.
"""
from __future__ import annotations

import re

# Superset of HGAB + NEP endpoint markers (NEP OCR sometimes prints ISTART).
EVENT = re.compile(
    r"(?P<endpoint>\b(?:ISTART|STARTT?|STAR|END)\b)"
    r"(?:\s*\((?:SEC(?:TION)?\s*)?(?P<endpoint_section>\d+)\))?\s*(?P<colon>:)?"
    r"|(?P<section>\bSECTION\s*(?P<section_number>\d+)\s*:?)"
    r"|(?P<short_section>\bS(?P<short_number>\d+)\s*[-:])"
    r"|(?P<numbered>\((?P<number>\d+)\))",
    re.I,
)
DMS = (
    r"(?P<degrees>\d{1,3})\s*(?P<degree_sep>°|\.(?=\d{1,2}\s*')|\s+)\s*"
    r"(?P<minutes>\d{1,2})\s*'\s*(?P<seconds>\d+(?:\.\d+)?)(?P<seconds_quote>\s*\")?"
)
ANGLE = re.compile(
    r"(?P<prefix>[NSEW])?\s*(?:" + DMS + r"|(?P<decimal>[+-]?\d+(?:[.:]\s*\d+)*))\s*"
    r"(?P<decoration>[°`\"])?\s*(?P<suffix>[NSEW])?",
    re.I,
)


def ascii_text(text: str) -> str:
    return text.translate(str.maketrans({
        "’": "'", "‘": "'", "′": "'", "”": '"', "“": '"', "″": '"', "º": "°", "−": "-",
    }))


def parse_angle(match) -> dict:
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
    return {
        "value": value,
        "axis": "latitude" if direction in {"N", "S"} else "longitude" if direction else None,
        "rules": rules,
        "issues": issues,
    }


def parse_pairs(raw: str) -> list[dict]:
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
        return [{
            "raw": raw, "longitude": None, "latitude": None, "rules": rules,
            "issues": ["unparsed_coordinate_fragment"], "unconsumed_text": residue,
            "trailing_annotation_raw": suffix,
        }]
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
        if (not (-90 <= lat <= 90 and -180 <= lon <= 180)
                or any(i.startswith("conflicting_") or i.startswith("invalid_dms") for i in issues)):
            issues.append("invalid_coordinate_pair")
            lat, lon = None, None
        elif not (4 <= lat <= 22 and 116 <= lon <= 127):
            issues.append("outside_philippines_orientation_bounds")
        result.append({
            "raw": raw[matches[index].start():matches[index + 1].end()] if text == raw else raw,
            "longitude": round(lon, 10) if lon is not None else None,
            "latitude": round(lat, 10) if lat is not None else None,
            "rules": sorted(set(applied)), "issues": sorted(set(issues)),
            "unconsumed_text": residue, "trailing_annotation_raw": suffix,
        })
    return result


def endpoint_observations(raw: str) -> list[dict]:
    """Parse roles/sections as events, retaining offsets in the original raw string."""
    events = list(EVENT.finditer(raw))
    points, role, section, role_rules = [], "unspecified", None, []
    if not any(e["endpoint"] for e in events):
        station_lines = [line for line in raw.splitlines() if re.search(r"\bLAT\s*:", line, re.I)]
        chainages = []
        for line in station_lines:
            match = re.search(r"\bSTA[.:]?\s*(\d+)\+(\d+(?:\.\d+)?)", line, re.I)
            chainages.append(int(match[1]) * 1000 + float(match[2]) if match else None)
        infer_roles = (
            len(station_lines) == 2
            and all(c is not None for c in chainages)
            and chainages[0] < chainages[1]
        )
        for index, line in enumerate(station_lines):
            value = re.split(r"\bLAT\s*:", line, maxsplit=1, flags=re.I)[1]
            for point in parse_pairs(value):
                point.update({
                    "role": ("start" if index == 0 else "end") if infer_roles else "unspecified",
                    "section_label": None, "source_fragment_raw": line,
                    "source_offset": raw.find(line),
                    "station_raw": line.split("Lat:")[0] if "Lat:" in line else line.split("LAT:")[0],
                })
                if infer_roles:
                    point["rules"].append("endpoint_roles_inferred_from_increasing_stations")
                else:
                    point["issues"].append("single_point_without_endpoint_roles")
                points.append(point)
        if not station_lines:
            for point in parse_pairs(raw):
                point.update({
                    "role": "unspecified", "section_label": None,
                    "source_fragment_raw": raw, "source_offset": 0,
                })
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
            point.update({
                "role": role, "section_label": section,
                "source_fragment_raw": fragment, "source_offset": event.end(),
            })
            point["rules"] = sorted(set(point["rules"] + role_rules))
            points.append(point)
    return points
