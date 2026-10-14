#!/usr/bin/env python3
"""Build the Geolocation browser dataset from the GPS inventory layer.

Input : gps-analysis/data/gps_inventory.json (run scan_gps_inventory.py first).
Output: gps-analysis/data/gps_workbench.json (regenerable, git-ignored).

The browser dataset keeps every GPS-bearing record with its parsed points,
interpretation rules and review issues, adds dataset grouping metadata, and a
deep-link crosswalk into the FMR / NIA workspaces where record IDs are known
to match source-tree nodes. Nothing here certifies locations; the inventory
is a review screen over printed budget text.
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
HERE = Path(__file__).resolve().parent
INVENTORY = HERE / "data/gps_inventory.json"
SUMMARY = HERE / "data/gps_inventory_summary.json"
OUTPUT = HERE / "data/gps_workbench.json"

import sys
sys.path.insert(0, str(HERE))
import scan_gps_inventory as scan  # noqa: E402

# PDF documents the workbench can preview, keyed by evidence-ref document key.
DOCUMENTS = [
    {"key": meta["key"], "label": meta["label"], "pdf": meta["pdf"], "pages": meta["pages"]}
    for meta in scan.EVIDENCE_DOCUMENTS.values()
]

# Dataset presentation metadata. `group` drives map colours and the grouping
# tables; `deep_link` names the workspace route that accepts record_id as
# `node` (None where the SPA has no matching source-tree node).
DATASETS = {
    "hgab_fmr": {
        "label": "FMR · House GAB annex", "group": "fmr", "deep_link": ("fmr", "house"),
        "description": "Dedicated START/END coordinate cells on all 964 House FMR road rows.",
    },
    "nep_fmr": {
        "label": "FMR · DBM NEP annex", "group": "fmr", "deep_link": ("fmr", "nep"),
        "description": "Dedicated coordinate cells (embedded OCR) on all 704 NEP FMR road rows.",
    },
    "dpwh_comparison_2027": {
        "label": "DPWH comparison titles", "group": "dpwh", "deep_link": ("dpwh", "compare"),
        "description": "Unified FY2027 comparison rows; GPS text embedded in project titles.",
    },
    "hb_dpwh_leaves_v5": {
        "label": "House DPWH leaf rows", "group": "dpwh", "deep_link": None,
        "description": "House Volume I-C leaf projects; parenthetical or inline pairs in titles.",
    },
    "nep_2027_source_projects": {
        "label": "NEP DPWH source projects", "group": "dpwh", "deep_link": None,
        "description": "DBM NEP Volume II-B source rows; coordinate tails in some titles.",
    },
    "chainage_units_2027": {
        "label": "Chainage unit titles", "group": "dpwh", "deep_link": None,
        "description": "Chainage-derived road units; a minority of titles also print GPS pairs.",
    },
    "hgab_nia": {
        "label": "NIA · House GAB annex", "group": "nia", "deep_link": ("nia", "house"),
        "description": "Irrigation annex rows; no coordinate column, one printed DMS pair found.",
    },
    "nep_nia_projects": {
        "label": "NIA · DBM NEP annex", "group": "nia", "deep_link": ("nia", "nep"),
        "description": "Irrigation annex rows; one printed DMS pair mirrors the House annex.",
    },
    "hgab_hfep": {
        "label": "HFEP · House GAB annex", "group": "hfep", "deep_link": None,
        "description": "Health facility labels; no GPS-bearing records in the scan.",
    },
    "nep_hfep": {
        "label": "HFEP · DBM NEP annex", "group": "hfep", "deep_link": None,
        "description": "Health facility labels; no GPS-bearing records in the scan.",
    },
}

GROUPS = {
    "fmr": "FMR road annexes (dedicated coordinate cells)",
    "dpwh": "DPWH budget titles (coordinates inside titles)",
    "nia": "NIA irrigation annexes",
    "hfep": "HFEP health facilities",
}

# DPWH source fields that carry the PAP label; comparison keeps the unified
# `pap`, leaves their own, NEP source prints `pap3`, chainage units `pap`.
DPWH_PAP_FIELDS = {
    "dpwh_comparison_2027": "pap",
    "hb_dpwh_leaves_v5": "pap",
    "nep_2027_source_projects": "pap3",
    "chainage_units_2027": "pap",
}


def build():
    if not INVENTORY.is_file() or not SUMMARY.is_file():
        raise SystemExit("Missing gps_inventory outputs; run: python3 gps-analysis/scan_gps_inventory.py")
    inventory = json.loads(INVENTORY.read_text())
    summary = json.loads(SUMMARY.read_text())

    records = []
    for hit in inventory["hits"]:
        dataset = hit["dataset"]
        meta = DATASETS[dataset]
        link = None
        if meta["deep_link"]:
            workspace, route = meta["deep_link"]
            link = {"workspace": workspace, "route": route, "node": hit["record_id"]}
        sources = hit.get("sources") or []
        # Comparison rows open the unified Compare-stage record view; other
        # DPWH evidence refs carry the joinable tree node instead.
        if not link:
            for ref in sources:
                tree = ref.get("tree")
                if not tree:
                    continue
                link = {"workspace": tree["workspace"], "route": tree["route"],
                        "node": tree["node"], **({"params": tree["params"]} if tree.get("params") else {})}
                break
        records.append({
            "dataset": dataset,
            "group": meta["group"],
            "record_id": hit["record_id"],
            "title": hit["title"],
            "pap": hit.get("pap") or "",
            "status": hit["status"],
            "amount": hit.get("amount"),
            "change_type": hit.get("change_type"),
            "amount_delta": hit.get("amount_delta"),
            "source_path": hit["source_path"],
            "link": link,
            "sources": sources,
            "fields": hit["fields"],
        })

    # PAP facet over the DPWH group: shared vocabulary across the four DPWH
    # artifacts, counted per GPS-bearing record (datasets may repeat a record).
    pap_counts = {}
    for record in records:
        if record["group"] != "dpwh" or not record["pap"]:
            continue
        entry = pap_counts.setdefault(record["pap"], {"pap": record["pap"], "records": 0, "points": 0,
                                                     "datasets": set(), "issues": 0})
        entry["records"] += 1
        entry["datasets"].add(record["dataset"])
        entry["issues"] += sum(1 for f in record["fields"] for p in f["points"]
                               if (p.get("longitude") is None or p.get("latitude") is None) or p.get("issues"))
        entry["points"] += sum(1 for f in record["fields"] for p in f["points"]
                               if p.get("longitude") is not None and p.get("latitude") is not None)
    paps = sorted(pap_counts.values(), key=lambda e: (-e["records"], e["pap"]))
    for entry in paps:
        entry["datasets"] = sorted(entry["datasets"])

    datasets = []
    scanned = summary["records_scanned"]
    for dataset_id, meta in DATASETS.items():
        rows = [r for r in records if r["dataset"] == dataset_id]
        points = sum(
            1 for r in rows for f in r["fields"] for p in f["points"]
            if p.get("longitude") is not None and p.get("latitude") is not None
        )
        datasets.append({
            "id": dataset_id, **meta, "deep_link": bool(meta["deep_link"]),
            "scanned": scanned.get(dataset_id, 0), "records": len(rows), "points": points,
            "by_status": summary["status_by_dataset"].get(dataset_id, {}),
        })

    return {
        "schema_version": 1,
        "generator": "gps-analysis/build_gps_workbench.py",
        "note": (
            "Review inventory of GPS-bearing budget records. Pairs are parsed with the "
            "FMR coordinate grammar; rules and issues record every interpretation "
            "variation. Not a geocode and not location certification."
        ),
        "coordinate_unit": "decimal degrees",
        "coordinate_column_order": "longitude, latitude",
        "philippines_orientation_bounds": inventory["philippines_orientation_bounds"],
        "groups": GROUPS,
        "documents": DOCUMENTS,
        "datasets": datasets,
        "paps": paps,
        "records": records,
        "totals": summary["totals"],
    }


def main():
    data = build()
    OUTPUT.write_text(json.dumps(data, ensure_ascii=False) + "\n")
    records = data["records"]
    points = data["totals"]["points_parsed"]
    print(f"wrote gps-analysis/data/gps_workbench.json "
          f"({len(records)} GPS records, {points} parsed points)")


if __name__ == "__main__":
    main()
