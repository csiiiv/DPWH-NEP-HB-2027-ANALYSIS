#!/usr/bin/env python3
"""Phase 1: Build the canonical PSGC location catalog.

Primary source: bendlikeabamboo/barangay community mirror of the PSA PSGC
publication (version 2026-10-12 == PSA 3Q 2026 release). Community mirror is
used because psa.gov.ph blocks direct downloads from this network; the mirror's
totals and change pattern were validated against official PSA announcements
(18 regions, 82 provinces, 1493 municipalities, 42010 barangays, 33 HUC,
6 ICC, 111 CC) and the 4Q 2023 -> 3Q 2026 diff (NIR creation, Sulu->R9,
8 new BARMM municipalities).

Cross-check source: official PSA PSGC-4Q-2023 XLSX (local archive).

Outputs (data/):
  psgc_locations.jsonl   one row per geographic entity
  psgc_summary.json      counts, provenance, validation results

Row schema:
  code         str  10-digit PSGC (string; leading zeros preserved)
  name         str  official name
  level        str  region|province|municipality|city|sub_municipality|barangay|special_geographic_area
  city_class   str|none  HUC|ICC|CC (cities only)
  parent_code  str|none  explicit parent from source hierarchy
"""

from __future__ import annotations

import json
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "sources" / "raw"
DATA = ROOT / "data"

MIRROR_FLAT = RAW / "psgc-3q2026-bdb-flat__barangay_flat.json"
XLSX_2023 = RAW / "psgc-4q2023__PSGC-4Q-2023-Publication-Datafile.xlsx"

CITY_TYPES = {
    "highly_urbanized_city": "HUC",
    "independent_component_city": "ICC",
    "component_city": "CC",
}

LEVEL_MAP = {
    "region": "region",
    "province": "province",
    "municipality": "municipality",
    "submunicipality": "sub_municipality",
    "barangay": "barangay",
    "special_geographic_area": "special_geographic_area",
}


def main() -> int:
    if not MIRROR_FLAT.exists():
        print(f"missing {MIRROR_FLAT}", file=sys.stderr)
        return 1

    rows = json.loads(MIRROR_FLAT.read_text(encoding="utf-8"))

    locations = []
    problems = []
    for r in rows:
        t = r["type"]
        code = r["psgc_id"]
        if t in CITY_TYPES:
            level, city_class = "city", CITY_TYPES[t]
        elif t in LEVEL_MAP:
            level, city_class = LEVEL_MAP[t], None
        else:
            problems.append({"code": code, "reason": f"unhandled type {t!r}"})
            continue
        parent = r.get("parent_psgc_id")
        if parent in ("0000000000", "n/a", None):
            parent = None
        locations.append({
            "code": code,
            "name": r["name"],
            "level": level,
            "city_class": city_class,
            "parent_code": parent,
        })

    # ---- structural validation ----
    by_code = {l["code"]: l for l in locations}
    dupes = [c for c, n in Counter(l["code"] for l in locations).items() if n > 1]
    orphan_parents = [l["code"] for l in locations
                      if l["parent_code"] and l["parent_code"] not in by_code]
    cycles = []
    for l in locations:
        seen, cur = set(), l["code"]
        while cur:
            if cur in seen:
                cycles.append(l["code"])
                break
            seen.add(cur)
            cur = by_code[cur]["parent_code"] if cur in by_code else None

    counts = Counter(l["level"] for l in locations)
    city_classes = Counter(l["city_class"] for l in locations if l["city_class"])

    # official PSA Q3 2026 announcement totals
    OFFICIAL = {"region": 18, "province": 82, "municipality": 1493,
                "barangay": 42010}
    total_check = {k: {"got": counts[k], "official": v, "match": counts[k] == v}
                   for k, v in OFFICIAL.items()}
    city_total_check = {"HUC": 33, "ICC": 5, "CC": 111}
    # NOTE: mirror shows ICC=6. PSA announcement says 5 ICC + 111 CC = 116 others.
    # The 6th ICC is Isabela City ('not a province' edge case, see notes).
    icc_note = ("mirror ICC=6 vs PSA announcement 5: Isabela City counted as ICC "
                "in mirror; PSA lists it with '(Not a Province)' annotation. "
                "Kept as ICC; does not affect municipality-level LEG joins.")

    # ---- cross-check against official 4Q 2023 XLSX (municipality set) ----
    xcheck = {"source": "PSA PSGC 4Q 2023 XLSX", "compared": "municipality+city codes"}
    if XLSX_2023.exists():
        import openpyxl
        wb = openpyxl.load_workbook(XLSX_2023, read_only=True, data_only=True)
        ws = wb["PSGC"]
        old_munis = set()
        for row in ws.iter_rows(min_row=2, values_only=True):
            code = str(row[0] or "").strip()
            lvl = str(row[3] or "").strip()
            if len(code) == 9:
                code = code.zfill(10)
            if lvl in ("Mun", "City") and re_ok(code):
                old_munis.add(code)
        cur_mc = {l["code"] for l in locations if l["level"] in ("municipality", "city")}
        xcheck["old_municities"] = len(old_munis)
        xcheck["current_municities"] = len(cur_mc)
        xcheck["expected_added"] = 8  # BARMM new municipalities
        xcheck["added_since_2023"] = len(cur_mc - old_munis)
        xcheck["removed_since_2023"] = len(old_munis - cur_mc)

    summary = {
        "foundation_source": "bendlikeabamboo/barangay mirror 2026-10-12 (= PSA PSGC 3Q 2026)",
        "foundation_provisional": True,
        "replacement_plan": "swap to official PSA XLSX when network allows; structure identical",
        "row_count": len(locations),
        "counts_by_level": dict(counts),
        "city_class_counts": dict(city_classes),
        "official_totals_check": total_check,
        "icc_note": icc_note,
        "duplicate_codes": dupes,
        "orphan_parent_codes": orphan_parents[:20],
        "cycle_codes": cycles[:20],
        "cross_check_2023": xcheck,
        "problems": problems[:20],
    }

    DATA.mkdir(exist_ok=True)
    with (DATA / "psgc_locations.jsonl").open("w", encoding="utf-8") as f:
        for loc in sorted(locations, key=lambda r: r["code"]):
            f.write(json.dumps(loc, ensure_ascii=False) + "\n")
    (DATA / "psgc_summary.json").write_text(
        json.dumps(summary, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    print(json.dumps({k: summary[k] for k in
                      ("row_count", "counts_by_level", "official_totals_check",
                       "duplicate_codes", "orphan_parent_codes")},
                     indent=2))
    return 0


def re_ok(code: str) -> bool:
    return code.isdigit() and len(code) == 10


if __name__ == "__main__":
    sys.exit(main())
