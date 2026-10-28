#!/usr/bin/env python3
"""Build title-to-PSGC evidence for every FY2027 FMR source project.

This is the stage-level adapter documented in
analysis/docs/fmr_psgc_location_extraction_method.md.  It runs the shared
title matcher independently for House and NEP projects, then attaches the
already-built coordinate PSGC evidence without allowing coordinates to select
or rewrite a title location.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "master_list/scripts"))
from locations import Matcher, SCORE_METHOD  # noqa: E402


INPUTS = {
    "workbench": ROOT / "other-analysis/data/fmr_workbench.json",
    "house_final": ROOT / "other-analysis/data/hgab_fmr_final_dataset.json",
    "nep_final": ROOT / "other-analysis/data/nep_fmr_final_dataset.json",
    "psgc_catalog": ROOT / "PSGC2LEG/data/psgc_locations.jsonl",
}
OUTPUT = ROOT / "other-analysis/data/fmr_psgc_locations_2027.json"

BLOCKING_FLAGS = {
    "title_or_heading_province_conflict",
    "ambiguous_barangay_name",
    "ambiguous_city_municipality_name",
    "barangay_scope_spans_multiple_municipalities",
}


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def code(value) -> str | None:
    if value in (None, ""):
        return None
    return str(value).split(".")[0].zfill(10)


def compact_location(location: dict) -> dict:
    return {
        "psgc_code": location["psgc_code"],
        "name": location["name"],
        "level": location["level"],
        "ancestry": location["ancestry"],
    }


def fmr_selected_locations(match: dict) -> list[dict]:
    """Apply the FMR adapter's eligibility rules to shared matcher output."""
    if match["status"] not in {"name_matched", "multiple_locations"}:
        return []
    if BLOCKING_FLAGS.intersection(match["review_flags"]):
        return []
    selected = list(match["locations"])
    # An explicitly printed barangay may differ from the current PSGC spelling
    # (for example "VF Gustilo" versus "V. F. Gustilo") while its printed
    # municipality/city is an exact catalog match. Preserve that exact parent
    # as municipality-level evidence instead of discarding the whole title.
    # The unmatched-barangay flag remains on the record, and the legislative
    # resolver still rejects a parent-only route for a split city.
    if "barangay_mentioned_but_unmatched" in match["review_flags"]:
        parents = [item for item in selected
                   if item["level"] in {"municipality", "city", "sub_municipality"}]
        selected = parents if len(parents) == 1 else []
    # When one exact municipality/city is printed, discard a separately
    # matched barangay from another municipality. This commonly occurs when a
    # longer printed name such as "Silangan Calutan" also matches the shorter
    # catalog name "Silangan" elsewhere in the same province. A child may
    # accompany the parent only when its canonical ancestry contains it.
    printed_parents = [item for item in selected
                       if item["level"] in {"municipality", "city", "sub_municipality"}]
    if len(printed_parents) == 1:
        parent_code = printed_parents[0]["psgc_code"]
        uniquely_named_codes = {evidence["candidate_codes"][0] for evidence in match["evidence"]
                                if evidence.get("field") == "title" and
                                len(evidence.get("candidate_codes", ())) == 1}
        def coherent(item: dict) -> bool:
            if item["psgc_code"] == parent_code:
                return True
            ancestry_codes = {ancestor["code"] for ancestor in item.get("ancestry", {}).values()}
            # Preserve an intentional second route branch when its own parent
            # was also printed unambiguously (Canarom/Daraga to
            # Florista/Jovellar). Otherwise the child must belong to the one
            # printed parent.
            town_codes = {item.get("ancestry", {}).get(level, {}).get("code")
                          for level in ("municipality", "city", "sub_municipality")}
            return parent_code in ancestry_codes or bool((town_codes - {None}) & uniquely_named_codes)
        selected = [item for item in selected if coherent(item)]
    # A title may print an HUC followed by province-style context. The province
    # is retained as evidence but is not a second selected project location.
    if "independent_city_with_separate_province_context" in match["review_flags"]:
        non_province = [item for item in selected if item["level"] != "province"]
        if non_province:
            selected = non_province
    return [compact_location(item) for item in selected]


def location_scope(location: dict) -> set[str]:
    return {location["psgc_code"], *(
        ancestor["code"] for ancestor in location.get("ancestry", {}).values()
    )}


def point_scope(point_psgc: dict | None) -> set[str]:
    if not point_psgc or not point_psgc.get("match"):
        return set()
    return {value for value in (
        code(point_psgc.get("region_psgc")),
        code(point_psgc.get("province_psgc")),
        code(point_psgc.get("municipality_psgc")),
        code(point_psgc.get("barangay_psgc")),
    ) if value}


def point_relation(point: dict, selected: list[dict], project: dict) -> dict:
    psgc = point.get("psgc")
    scope = point_scope(psgc)
    usable = bool(scope) and project.get("status") != "needs_review"
    selected_scopes = [location_scope(item) for item in selected]
    if not usable:
        relation = "unusable"
    elif not selected_scopes:
        relation = "not_comparable"
    elif any(scope & selected_scope and (
            item["psgc_code"] in scope or code(psgc.get("barangay_psgc")) in selected_scope)
            for item, selected_scope in zip(selected, selected_scopes)):
        relation = "supports"
    elif any(code(psgc.get("municipality_psgc")) in selected_scope
             for selected_scope in selected_scopes):
        relation = "partial"
    else:
        relation = "conflicts"
    return {
        "point_id": point.get("point_id"),
        "role": point.get("role"),
        "coordinates": point.get("coordinates"),
        "usable": usable,
        "verdict": point.get("verdict"),
        "relationship": relation,
        "psgc": psgc,
        "note": point.get("note"),
    }


def coordinate_relationship(points: list[dict], selected: list[dict]) -> str:
    usable = [point for point in points if point["usable"]]
    if not usable:
        return "no_usable_points"
    if not selected:
        return "not_comparable"
    relations = {point["relationship"] for point in usable}
    if relations == {"supports"}:
        return "corroborates"
    if relations <= {"supports", "partial"} and "partial" in relations:
        return "municipality_only"
    if "supports" in relations and "conflicts" in relations:
        return "mixed"
    if relations == {"conflicts"}:
        return "conflicts"
    return "mixed"


def build_record(stage: str, project: dict, matcher: Matcher) -> dict:
    region_hint = matcher.region_code(project.get("region") or "")
    match = matcher.match(project["title"], region_hint=region_hint)
    selected = fmr_selected_locations(match)
    flags = list(match["review_flags"])
    if project["title"].rstrip().endswith(","):
        flags.append("empty_or_incomplete_suffix")
    if project.get("status") == "needs_review" or project.get("review_flags"):
        flags.append("coordinate_review")
    points = [point_relation(point, selected, project) for point in project.get("psgc", [])]
    relationship = coordinate_relationship(points, selected)
    if relationship in {"mixed", "conflicts"}:
        flags.append("title_coordinate_conflict")
    return {
        "record_id": f"fmr_{stage}:{project['id']}",
        "source_project_id": project["id"],
        "stage": stage,
        "raw_title": project["title"],
        "source_region": project.get("region"),
        "source_region_key": project.get("region_key"),
        "source": project.get("source"),
        "title_match": {
            "status": match["status"],
            "method": match["method"],
            "score": match["score"],
            "score_method": match["score_method"],
            "selected_locations": selected,
            "candidate_codes": match["candidate_codes"],
            "evidence": match["evidence"],
            "suggestions": match["suggestions"],
            "review_flags": match["review_flags"],
            "needs_review": match["needs_review"],
        },
        "coordinate_relationship": relationship,
        "points": points,
        "flags": sorted(set(flags)),
    }


def build(built_at: str | None = None) -> dict:
    catalog = [json.loads(line) for line in INPUTS["psgc_catalog"].read_text().splitlines()]
    matcher = Matcher(catalog)
    workbench = json.loads(INPUTS["workbench"].read_text())
    records = []
    for stage in ("house", "nep"):
        records.extend(build_record(stage, project, matcher)
                       for project in workbench["stages"][stage]["projects"])
    expected = len(workbench["stages"]["house"]["projects"]) + len(workbench["stages"]["nep"]["projects"])
    if len(records) != expected or len({record["record_id"] for record in records}) != expected:
        raise ValueError("FMR PSGC extraction lost or duplicated source projects")
    status_counts = Counter(record["title_match"]["status"] for record in records)
    relationship_counts = Counter(record["coordinate_relationship"] for record in records)
    return {
        "schema_version": 1,
        "fiscal_year": 2027,
        "built_at": built_at or datetime.now(timezone.utc).isoformat(),
        "method": {
            "title_matcher": SCORE_METHOD,
            "contract": "analysis/docs/fmr_psgc_location_extraction_method.md",
            "coordinate_policy": "Coordinates are attached after title matching and never select a title location.",
        },
        "input_provenance": {
            name: {"path": str(path.relative_to(ROOT)), "sha256": sha256(path)}
            for name, path in INPUTS.items()
        },
        "summary": {
            "records": len(records),
            "house": sum(record["stage"] == "house" for record in records),
            "nep": sum(record["stage"] == "nep" for record in records),
            "title_statuses": dict(sorted(status_counts.items())),
            "coordinate_relationships": dict(sorted(relationship_counts.items())),
            "selected": sum(bool(record["title_match"]["selected_locations"]) for record in records),
        },
        "records": records,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    previous = json.loads(OUTPUT.read_text()) if OUTPUT.exists() else None
    payload = build(previous.get("built_at") if args.check and previous else None)
    rendered = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n"
    if args.check:
        if previous is None or OUTPUT.read_text() != rendered:
            raise SystemExit(f"stale or missing artifact: {OUTPUT.relative_to(ROOT)}")
        print(f"FMR PSGC location check passed: {payload['summary']}")
        return
    OUTPUT.write_text(rendered)
    print(f"Wrote {OUTPUT.relative_to(ROOT)}: {payload['summary']}")


if __name__ == "__main__":
    main()
