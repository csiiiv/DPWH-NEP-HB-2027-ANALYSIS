#!/usr/bin/env python3
"""Build the FY2027 FMR legislative-district lens.

The builder consumes stage-level title PSGC extraction plus retained coordinate
PSGC evidence.  It assigns each FMR comparison row exactly once and never
divides a project amount across points, segments, barangays, or districts.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
INPUTS = {
    "locations": ROOT / "other-analysis/data/fmr_psgc_locations_2027.json",
    "workbench": ROOT / "other-analysis/data/fmr_workbench.json",
    "assignments": ROOT / "PSGC2LEG/data/psgc_leg_assignments.jsonl",
    "psgc_catalog": ROOT / "PSGC2LEG/data/psgc_locations.jsonl",
    "districts": ROOT / "PSGC2LEG/data/legislative_districts.json",
    "congress_index": ROOT / "analysis/data/congress_district_index_2027.json",
    "district_map": ROOT / "analysis/data/congress_district_map_2027.json",
}
OUTPUT = ROOT / "analysis/data/fmr_legislative_index_2027.json"
BUCKETS = ("insertions", "deletions", "increased", "reduced", "unchanged", "scope_review")


def fail(message: str):
    raise ValueError(message)


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def load_jsonl(path: Path) -> list[dict]:
    return [json.loads(line) for line in path.read_text().splitlines() if line.strip()]


def source_amount(row: dict, side: str) -> int:
    project = row.get(side)
    return int(project["amount_php"]) if project else 0


def row_bucket(row: dict) -> str:
    if row.get("house") and not row.get("nep"):
        return "insertions"
    if row.get("nep") and not row.get("house"):
        return "deletions"
    house, nep = source_amount(row, "house"), source_amount(row, "nep")
    return "increased" if house > nep else "reduced" if house < nep else "unchanged"


def partition(rows: list[dict]) -> dict:
    house_rows = [row for row in rows if row.get("house")]
    nep_rows = [row for row in rows if row.get("nep")]
    grouped = {bucket: [row for row in rows if row_bucket(row) == bucket] for bucket in BUCKETS}
    increased, reduced, unchanged = grouped["increased"], grouped["reduced"], grouped["unchanged"]
    house_total = sum(source_amount(row, "house") for row in rows)
    nep_total = sum(source_amount(row, "nep") for row in rows)
    return {
        "sources": {
            "house": {"count": len(house_rows), "amount_php": house_total},
            "nep": {"count": len(nep_rows), "amount_php": nep_total},
        },
        "insertions": {"count": len(grouped["insertions"]), "comparison_rows": len(grouped["insertions"]),
                       "amount_php": sum(source_amount(row, "house") for row in grouped["insertions"])},
        "deletions": {"count": len(grouped["deletions"]), "comparison_rows": len(grouped["deletions"]),
                      "amount_php": sum(source_amount(row, "nep") for row in grouped["deletions"])},
        "unchanged": {"count": len(unchanged), "comparison_rows": len(unchanged),
                      "amount_php": sum(source_amount(row, "house") for row in unchanged)},
        "paired_comparison_rows": len(increased) + len(reduced) + len(unchanged),
        "adjustments": {
            "count": len(increased) + len(reduced),
            "count_unit": "changed candidate pairs",
            "increased_count": len(increased), "reduced_count": len(reduced),
            "increased_php": sum(source_amount(row, "house") - source_amount(row, "nep") for row in increased),
            "reduced_php": sum(source_amount(row, "nep") - source_amount(row, "house") for row in reduced),
            "net_php": sum(source_amount(row, "house") - source_amount(row, "nep") for row in increased + reduced),
            "increased_nep_php": sum(source_amount(row, "nep") for row in increased),
            "increased_house_php": sum(source_amount(row, "house") for row in increased),
            "reduced_nep_php": sum(source_amount(row, "nep") for row in reduced),
            "reduced_house_php": sum(source_amount(row, "house") for row in reduced),
        },
        "scope_review": {"count": 0, "count_unit": "same-road pairs with non-overlapping segments",
                         "house_php": 0, "nep_php": 0, "net_php": 0,
                         "note": "FMR segment geometry is evidence and never a money-splitting unit."},
        "delta_php": house_total - nep_total,
    }


def bucket_ids(rows: list[dict]) -> dict:
    out = {bucket: [] for bucket in BUCKETS}
    for row in rows:
        out[row_bucket(row)].append(row["id"])
    if sum(map(len, out.values())) != len(rows):
        fail("bucket membership lost FMR rows")
    return out


def bridge_from_map(payload: dict) -> dict[str, str]:
    bridge = {}
    for feature in payload["features"]:
        properties = feature["properties"]
        psgc_id, viewer_id = properties.get("psgc_leg_id"), properties.get("district_id")
        if psgc_id and viewer_id:
            if psgc_id in bridge and bridge[psgc_id] != viewer_id:
                fail(f"district bridge collision: {psgc_id}")
            bridge[psgc_id] = viewer_id
    if len(bridge) != 254:
        fail(f"district map bridge covers {len(bridge)}/254 seats")
    return bridge


def district_descriptors(index: dict) -> dict[str, dict]:
    result = {}
    for card in index["cards"]:
        for district in card["districts"]:
            result.setdefault(district["id"], district)
    if len(result) != 254:
        fail(f"Congress index describes {len(result)}/254 districts")
    return result


def sole_representative(districts: list[dict]) -> dict:
    if len(districts) == 1:
        return districts[0]["representative"]
    names = [district["representative"]["name"] for district in districts
             if district["representative"].get("resolutionStatus") == "resolved" and
             district["representative"].get("name")]
    return {"multiple": True, "count": len(names), "names": names}


class LegislativeLookup:
    def __init__(self, assignments: list[dict], catalog: list[dict], bridge: dict[str, str]):
        self.catalog = {row["code"]: row for row in catalog}
        self.bridge = bridge
        self.assignments = defaultdict(set)
        for row in assignments:
            self.assignments[row["psgc_code"]].add(row["leg_id"])
        conflicts = {code: values for code, values in self.assignments.items() if len(values) > 1}
        if conflicts:
            fail(f"conflicting PSGC assignments: {list(conflicts)[:3]}")
        self.assignments = {code: next(iter(values)) for code, values in self.assignments.items()}
        self.split_towns = defaultdict(set)
        for psgc_code, leg_id in self.assignments.items():
            row = self.catalog.get(psgc_code)
            if row and row["level"] == "barangay":
                town = self.town(psgc_code)
                if town:
                    self.split_towns[town].add(leg_id)

    def ancestors(self, psgc_code: str):
        seen = set()
        while psgc_code:
            if psgc_code in seen or psgc_code not in self.catalog:
                break
            seen.add(psgc_code)
            yield psgc_code
            psgc_code = self.catalog[psgc_code].get("parent_code")

    def town(self, psgc_code: str) -> str | None:
        for ancestor in self.ancestors(psgc_code):
            if self.catalog[ancestor]["level"] in {"city", "municipality", "sub_municipality"}:
                return ancestor
        return None

    def viewer_district(self, psgc_code: str | None) -> str | None:
        if not psgc_code:
            return None
        leg_id = self.assignments.get(psgc_code)
        if not leg_id:
            town = self.town(psgc_code)
            leg_id = self.assignments.get(town)
        return self.bridge.get(leg_id) if leg_id else None

    def is_split_town(self, psgc_code: str) -> bool:
        town = self.town(psgc_code) or psgc_code
        return len(self.split_towns.get(town, ())) > 1


def point_code(point: dict) -> str | None:
    psgc = point.get("psgc") or {}
    value = psgc.get("barangay_psgc") or psgc.get("municipality_psgc")
    return str(value).split(".")[0].zfill(10) if value not in (None, "") else None


def stage_result(record: dict, lookup: LegislativeLookup) -> dict:
    locations = record["title_match"]["selected_locations"]
    flags = set(record["flags"])
    title_targets = []
    for location in locations:
        district = lookup.viewer_district(location["psgc_code"])
        if district:
            title_targets.append(district)
        elif lookup.is_split_town(location["psgc_code"]):
            flags.add("split_city_barangay_required")
    clean_title = bool(locations) and len(title_targets) == len(locations)
    title_set = tuple(sorted(set(title_targets))) if clean_title else ()

    usable_points, point_targets = [], []
    for point in record["points"]:
        if not point["usable"]:
            continue
        district = lookup.viewer_district(point_code(point))
        usable_points.append({**point, "district_id": district})
        if district:
            point_targets.append(district)
    point_set = tuple(sorted(set(point_targets)))
    incomplete_points = bool(usable_points) and len(point_targets) != len(usable_points)

    target_type, targets, basis = None, (), None
    if title_set:
        if point_set and (set(point_set) - set(title_set)):
            basis = "title_coordinate_conflict"
            flags.add("title_coordinate_conflict")
        elif len(title_set) == 1:
            target_type, targets = "district", title_set
            basis = "title_coordinate" if point_set else "title_psgc"
        elif point_set == title_set and not incomplete_points:
            target_type, targets, basis = "range", title_set, "spanning"
            flags.add("multi_district_span")
        else:
            flags.add("title_location_unresolved")
    elif point_set and len(point_set) == 1 and not incomplete_points:
        target_type, targets, basis = "district", point_set, "coordinate"
    elif point_set and len(point_set) > 1:
        flags.add("coordinate_review")

    if not target_type:
        target_type = "region" if record.get("source_region_key") else "unassigned"
        targets = (record.get("source_region_key"),) if record.get("source_region_key") else ()
        basis = basis or target_type
        if not locations:
            flags.add("title_location_unresolved")
    return {
        "project_id": record["source_project_id"],
        "basis": basis,
        "target_type": target_type,
        "target_ids": list(targets),
        "title_status": record["title_match"]["status"],
        "selected_locations": locations,
        "coordinate_relationship": record["coordinate_relationship"],
        "point_districts": usable_points,
        "flags": sorted(flags),
    }


def district_result(result: dict | None) -> bool:
    return bool(result and result["target_type"] in {"district", "range"})


def combine(row: dict, house: dict | None, nep: dict | None) -> dict:
    flags = set((house or {}).get("flags", ())) | set((nep or {}).get("flags", ()))
    contributing = "both" if house and nep else "house" if house else "nep"
    if house and not nep:
        final = dict(house)
    elif nep and not house:
        final = dict(nep)
    elif district_result(house) and district_result(nep):
        if house["target_type"] == nep["target_type"] and house["target_ids"] == nep["target_ids"]:
            final = dict(house)
            final["basis"] = house["basis"] if house["basis"] == nep["basis"] else "linked_stages_agree"
        else:
            flags.add("stage_location_conflict")
            final = {"basis": "stage_location_conflict", "target_type": "region",
                     "target_ids": [row["region_key"]] if row.get("region_key") else []}
    elif district_result(house) or district_result(nep):
        resolved = house if district_result(house) else nep
        contributing = "house" if resolved is house else "nep"
        flags.add("linked_stage_location")
        final = dict(resolved)
        final["basis"] = "linked_stage"
    else:
        conflict = any(result and result["basis"] == "title_coordinate_conflict" for result in (house, nep))
        final = {"basis": "title_coordinate_conflict" if conflict else "region",
                 "target_type": "region" if row.get("region_key") else "unassigned",
                 "target_ids": [row["region_key"]] if row.get("region_key") else []}
    return {
        "basis": final["basis"], "target_type": final["target_type"],
        "target_ids": final.get("target_ids", []), "contributing_stage": contributing,
        "candidate_status": row["status"], "candidate_method": row.get("method"),
        "house": house, "nep": nep, "flags": sorted(flags),
    }


def card_key(resolution: dict) -> tuple[str, str, list[str]]:
    targets = resolution["target_ids"]
    if resolution["target_type"] == "district":
        return f"fmr:district:{targets[0]}", "fmr_district", targets
    if resolution["target_type"] == "range":
        return f"fmr:range:{'+'.join(targets)}", "fmr_spanning", targets
    region = targets[0] if targets else "unassigned"
    if resolution["basis"] in {"stage_location_conflict", "title_coordinate_conflict"}:
        return f"fmr:conflict:{region}", "location_evidence_conflict", []
    if resolution["target_type"] == "region":
        return f"fmr:region:{region}", "fmr_region", []
    return "fmr:unassigned", "unassigned", []


def build(built_at: str | None = None) -> dict:
    workbench = json.loads(INPUTS["workbench"].read_text())
    locations = json.loads(INPUTS["locations"].read_text())
    congress = json.loads(INPUTS["congress_index"].read_text())
    district_map = json.loads(INPUTS["district_map"].read_text())
    bridge = bridge_from_map(district_map)
    descriptors = district_descriptors(congress)
    lookup = LegislativeLookup(load_jsonl(INPUTS["assignments"]),
                               load_jsonl(INPUTS["psgc_catalog"]), bridge)
    extraction = {(record["stage"], record["source_project_id"]): record for record in locations["records"]}
    projects = {stage: {project["id"]: project for project in workbench["stages"][stage]["projects"]}
                for stage in ("house", "nep")}
    stage_results = {key: stage_result(record, lookup) for key, record in extraction.items()}

    rows, resolutions, row_flags = [], {}, {}
    seen_house, seen_nep = set(), set()
    for comparison in workbench["comparison"]:
        house_project = projects["house"].get(comparison.get("house_id"))
        nep_project = projects["nep"].get(comparison.get("nep_id"))
        if house_project:
            seen_house.add(house_project["id"])
        if nep_project:
            seen_nep.add(nep_project["id"])
        row = {**comparison, "house": house_project, "nep": nep_project,
               "title": (house_project or nep_project)["title"]}
        resolution = combine(comparison,
                             stage_results.get(("house", comparison.get("house_id"))),
                             stage_results.get(("nep", comparison.get("nep_id"))))
        rows.append(row)
        resolutions[row["id"]] = resolution
        row_flags[row["id"]] = resolution["flags"]
    if len(rows) != 1059 or len(seen_house) != 964 or len(seen_nep) != 704:
        fail(f"comparison coverage mismatch: rows={len(rows)} house={len(seen_house)} nep={len(seen_nep)}")

    grouped = defaultdict(list)
    card_meta = {}
    for row in rows:
        key, tier, district_ids = card_key(resolutions[row["id"]])
        grouped[key].append(row)
        card_meta[key] = (tier, district_ids)
    region_labels = {region["id"]: region["label"] for region in workbench["regions"]}
    cards, region_cards = [], []
    for key, card_rows in grouped.items():
        location_tier, district_ids = card_meta[key]
        districts = [descriptors[district_id] for district_id in district_ids]
        region_key = card_rows[0].get("region_key")
        label = None
        if not districts:
            region_label = region_labels.get(region_key, region_key or "Unassigned")
            label = (f"{region_label} · location-evidence conflicts" if location_tier == "location_evidence_conflict"
                     else region_label if location_tier == "fmr_region" else "Unassigned FMR projects")
        card = {
            "id": key, "tier": "B" if len(districts) > 1 else "A" if districts else "region",
            "location_tier": location_tier, "card_label": label,
            "undivided": len(districts) > 1, "offices": [], "ledger_names": [],
            "districts": districts, "representative": sole_representative(districts) if districts else None,
            "region": districts[0]["region"] if districts else region_key,
            "rows": len(card_rows), "summary": partition(card_rows), "row_ids": bucket_ids(card_rows),
            "tier_note": ("Affirmative title and coordinate evidence supports several districts; the allocation remains intact."
                          if len(districts) > 1 else
                          "No clean district route passed the FMR policy; the allocation remains on this catch-all."
                          if not districts else None),
        }
        (cards if districts else region_cards).append(card)
    cards.sort(key=lambda card: (-card["summary"]["sources"]["house"]["amount_php"], card["id"]))
    region_cards.sort(key=lambda card: (-card["summary"]["sources"]["house"]["amount_php"], card["id"]))

    whole = partition(rows)
    all_cards = cards + region_cards
    if sum(card["rows"] for card in all_cards) != len(rows):
        fail("cards do not contain every FMR comparison row exactly once")
    if whole["sources"]["house"]["amount_php"] != 19_628_100_000 or whole["sources"]["nep"]["amount_php"] != 16_000_000_000:
        fail("FMR source controls changed")
    card_house = sum(card["summary"]["sources"]["house"]["amount_php"] for card in all_cards)
    card_nep = sum(card["summary"]["sources"]["nep"]["amount_php"] for card in all_cards)
    if (card_house, card_nep) != (19_628_100_000, 16_000_000_000):
        fail("FMR cards do not reconcile to source controls")
    basis_counts = Counter(resolution["basis"] for resolution in resolutions.values())
    flag_counts = Counter(flag for flags in row_flags.values() for flag in flags)
    district_cards = [card for card in cards if card["location_tier"] == "fmr_district"]
    return {
        "schema_version": 1, "fiscal_year": 2027,
        "built_at": built_at or datetime.now(timezone.utc).isoformat(),
        "lens": {
            "name": "FMR legislative location lens",
            "authority": "analysis/docs/fmr_legislative_lens_method.md",
            "grouping_unit": "Title PSGC and accepted coordinate evidence mapped through PSGC2LEG.",
            "grain": "One FMR comparison row; points and segments never divide project money.",
            "stages": "House FMR annex working copy ↔ DBM NEP FMR schedule; links are candidate pairs.",
            "tiers": {"district": "One legislative district", "range": "Affirmative undivided multi-district route",
                      "region": "No clean district route",
                      "conflict": "Title, coordinate, or candidate-stage locations disagree"},
            "not_claimed": "Nothing here establishes that a representative requested, sponsored, selected, or controls an FMR project or amount.",
        },
        "datasets": {"fmr": {"status": "active", "basis": "FMR title PSGC and accepted coordinate evidence."}},
        "reconciliation": {
            "whole": whole, "cards_total": {"house_php": card_house, "nep_php": card_nep},
            "row_counts": {"total": len(rows), "cards": sum(card["rows"] for card in cards),
                           "fallback": sum(card["rows"] for card in region_cards)},
            "tied_numeric_fields": 2,
        },
        "cards": cards, "region_cards": region_cards,
        "districts": congress["districts"],
        "row_resolution": resolutions, "row_flags": row_flags,
        "counts": {
            "cards": len(all_cards), "district_cards": len(district_cards),
            "districts_with_projects": len({district["id"] for card in cards for district in card["districts"]}),
            "rows": len(rows), "district_rows": sum(card["rows"] for card in cards),
            "fallback_rows": sum(card["rows"] for card in region_cards),
            "basis": dict(sorted(basis_counts.items())), "flags": dict(sorted(flag_counts.items())),
        },
        "input_provenance": {name: {"path": str(path.relative_to(ROOT)), "sha256": sha256(path)}
                             for name, path in INPUTS.items()},
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
        print(f"FMR legislative check passed: {payload['counts']}")
        return
    OUTPUT.write_text(rendered)
    print(f"Wrote {OUTPUT.relative_to(ROOT)}: {payload['counts']}")


if __name__ == "__main__":
    main()
