#!/usr/bin/env python3
"""Build the consolidated HGAB HFEP data list (provenance-rich single JSON).

Derives `analysis-hfep/data/hgab_hfep_data_list.json` from the existing
HGAB extractor artifacts (tree + audit + source rows), mirroring the schema of
the NEP side (`nep_hfep_data_list.json`) so cross-document passes can consume
both uniformly. Per-document only — comparisons are a separate analysis pass.

Differences from the NEP consolidated builder (all structural, from how the
HGAB extractor records its work):
* No per-cell amount lineage (HGAB native-text extraction needed no OCR cell
  interpretation; components+total identity held on every row by construction).
* Flags: page_break_continuation (parent block on an earlier page),
  label_multiline (label_raw contains embedded newline, normalized by
  whitespace collapse). HGAB audit reported zero printed discrepancies, so no
  printed_discrepancy flags exist.
* Source rows carry band bboxes; provenance embeds them verbatim.

Run:  python3 analysis-hfep/build_hgab_data_list.py [--check]
"""
import argparse
import collections
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
DATA = HERE / "data"
SCHEMA = "dpwh_nep_api/hgab_hfep_data_list"
SCHEMA_VERSION = 1


def load(name):
    return json.loads((DATA / name).read_text())


def crumb(by_id, node):
    """Hierarchy columns by ancestor kind (categories may skip subcategories)."""
    out = {"category": None, "subcategory": None, "region": None, "province": None}
    cur = by_id.get(node["parent_id"])
    while cur is not None and cur["kind"] != "annex_program":
        if cur["kind"] == "category_control" and out["category"] is None:
            out["category"] = cur["label"]
        elif cur["kind"] == "subcategory_control" and out["subcategory"] is None:
            out["subcategory"] = cur["label"]
        elif cur["kind"] == "region_control" and out["region"] is None:
            out["region"] = cur["label"]
        elif cur["kind"] == "province_control" and out["province"] is None:
            out["province"] = cur["label"]
        cur = by_id.get(cur["parent_id"])
    return out


def mark(node, rollup_by_id):
    """Provenance block for one node."""
    normalizations, flags = [], []
    raw = node.get("label_raw") or ""
    label = node["label"]
    if raw and raw != label and " ".join(raw.split()) == label:
        normalizations.append({"type": "label_whitespace_collapse",
                               "from": raw, "to": label})
    if "\n" in raw:
        flags.append({"flag": "label_multiline",
                      "note": "label printed across multiple lines"})
    src = node.get("source", {})
    parent = None  # filled by caller via by_id
    rollup = rollup_by_id.get(node["id"])
    if rollup and rollup.get("printed_discrepancy_id"):
        flags.append({"flag": "printed_discrepancy",
                      "id": rollup["printed_discrepancy_id"]})
    return {"normalizations": normalizations, "amount_lineage": [],
            "flags": flags,
            "image_review_status": node.get("image_review_status")}


def build():
    tree = load("hgab_hfep_tree.json")
    audit = load("hgab_hfep_audit.json")
    by_id = {n["id"]: n for n in tree["nodes"]}
    rollup_by_id = {r["node_id"]: r for r in audit.get("rollup_checks", [])}

    # page-break continuations: region/province/facility whose parent block was
    # established on an earlier page (same rule as the NEP side)
    continuation_ids = set()
    for n in tree["nodes"]:
        if n["kind"] not in {"region_control", "province_control", "facility"}:
            continue
        src = n.get("source", {})
        pg = src.get("pdf_page")
        if not pg or pg < 2:
            continue
        parent = by_id.get(n["parent_id"])
        ppg = (parent or {}).get("source", {}).get("pdf_page")
        if ppg and ppg < pg:
            continuation_ids.add(n["id"])

    def prov(node):
        p = mark(node, rollup_by_id)
        if node["id"] in continuation_ids:
            p["flags"].append({"flag": "page_break_continuation",
                               "note": "first row of a block continued from the "
                                       "previous page"})
        return p

    items = []
    for n in tree["nodes"]:
        if n["kind"] != "facility":
            continue
        c = crumb(by_id, n)
        items.append({
            "id": n["id"],
            "label": n["label"], "label_raw": n["label_raw"],
            "hierarchy": c,
            "amounts_php": n["printed_amounts_php"],
            "amounts_raw": n.get("printed_amounts_raw", {}),
            "source": n["source"],
            "provenance": prov(n),
        })

    controls = []
    for n in tree["nodes"]:
        if n["kind"] not in {"category_control", "subcategory_control",
                             "region_control", "province_control",
                             "grand_total", "annex_program"}:
            continue
        c = crumb(by_id, n)
        rollup = rollup_by_id.get(n["id"])
        status = ("exact" if rollup is None or (rollup.get("passed")
                                                and not rollup.get("printed_discrepancy_id"))
                  else "printed_discrepancy" if rollup.get("passed")
                  else "failed")
        controls.append({
            "id": n["id"],
            "kind": n["kind"],
            "label": n["label"], "label_raw": n["label_raw"],
            "hierarchy": c,
            "amounts_php": n["printed_amounts_php"],
            "amounts_raw": n.get("printed_amounts_raw", {}),
            "children": {"count": len(n.get("child_ids", [])),
                         "recursive_sum_php": n.get("derived_amounts_php")},
            "reconciliation": {
                "status": status,
                "differences_php": (rollup or {}).get("differences_php"),
                "printed_discrepancy_id": (rollup or {}).get("printed_discrepancy_id"),
            },
            "source": n["source"],
            "provenance": prov(n),
        })

    doc = {
        "schema": SCHEMA,
        "schema_version": SCHEMA_VERSION,
        "document": {
            "metadata": tree["metadata"],
            "verification": {
                "summary": audit["summary"],
                "agency_check": audit.get("agency_check"),
                "repeated_facility_groups": audit.get("repeated_facility_groups"),
                "source_evidence": audit.get("source_evidence"),
                "reading_comparison": audit.get("reading_comparison"),
                "findings": [],  # HGAB audit: zero printed discrepancies
                "label_quirks": [],
                "verified_odd_amounts": [],
            },
        },
        "items": items,
        "controls": controls,
    }
    return json.dumps(doc, ensure_ascii=False, indent=2) + "\n", doc


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true",
                        help="compare against existing output without writing")
    args = parser.parse_args()
    text, doc = build()
    n_items, n_controls = len(doc["items"]), len(doc["controls"])
    exact = sum(1 for c in doc["controls"]
                if c["reconciliation"]["status"] == "exact")
    out_path = DATA / "hgab_hfep_data_list.json"
    if args.check:
        if not out_path.exists() or out_path.read_text() != text:
            raise SystemExit("Stale or missing hgab_hfep_data_list.json")
        print("Deterministic output check passed.")
    else:
        out_path.write_text(text)
        print(f"wrote {out_path} ({n_items} items, {n_controls} controls, "
              f"{exact} exact reconciliations)")


if __name__ == "__main__":
    main()
