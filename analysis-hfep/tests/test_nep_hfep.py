"""Tests for the NEP FY 2027 HFEP extraction (PP-StructureV3 pipeline).

Run:  python -m pytest analysis-hfep/tests/test_nep_hfep.py -q
"""
import csv
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from extract_nep_hfep import (  # noqa: E402
    AMOUNT_RE, PRINTED_DISCREPANCIES, assign_amounts, build, build_tree,
    classify, extract_rows, load_pps_pages, parse_amount_cell, pps_rows,
    validate, vl_crosscheck)

DATA = Path(__file__).resolve().parents[1] / "data"
GT_EXPECTED = {"infrastructure": 7_386_456_000, "medical_equipment": 6_834_203_000,
               "motor_vehicle": 252_000_000, "total": 14_472_659_000}


def test_pps_source_present_and_complete():
    pages = load_pps_pages()
    assert len(pages) == 13
    for i, item in enumerate(pages, start=1):
        tables = item["prunedResult"]["table_res_list"]
        assert len(tables) == 1, f"page {i} table count"
        assert tables[0]["table_ocr_pred"]["rec_texts"], f"page {i} tokens"


def test_column_zones_match_token_layout():
    pages = load_pps_pages()
    for pg, item in enumerate(pages, start=1):
        ocr = item["prunedResult"]["table_res_list"][0]["table_ocr_pred"]
        for txt, box in zip(ocr["rec_texts"], ocr["rec_boxes"]):
            if AMOUNT_RE.fullmatch(txt.strip()) and box[0] >= 780:
                assert box[0] < 1320, f"p{pg} amount token outside zones: {txt}"


def test_role_classification_indent_ladder():
    assert classify("1. Primary Care Facilities", 142.0, 1) == "category"
    assert classify("1.a Construction of New BHS", 163.0, 1) == "subcategory"
    assert classify("CAR", 204.0, 1) == "region"
    assert classify("CAR", 246.0, 1) == "facility"  # indent wins for repeated labels
    assert classify("Region II", 207.0, 1) == "region"
    assert classify("Isabela", 226.0, 1) == "province"
    assert classify("Sagada", 227.0, 1) == "province"
    assert classify("Municipality of Sagada, Taccong BHS", 248.0, 1) == "facility"
    assert classify("Region II Trauma and Medical Center", 247.0, 1) == "facility"
    assert classify("Grand Total", 141.0, 13) == "grand_total"
    assert classify("NCR", 188.0, 2) == "region"       # even-page ladder
    assert classify("Metro Manila", 211.0, 2) == "province"
    assert classify("City of Caloocan, Amparo Health Center", 233.0, 2) == "facility"


def test_dash_misreads_interpreted():
    for raw in ("=", "一", "。", "·", "E", "-"):
        php, interp = parse_amount_cell(raw)
        assert php is None and interp is None, raw
    php, interp = parse_amount_cell("7")
    assert php is None and interp["rule"] == "single_digit_dash_fragment_read_as_dash"
    php, interp = parse_amount_cell("·300,000")
    assert php == 300_000 and interp["rule"] == "leading_punctuation_stripped"
    php, _ = parse_amount_cell("14,472,659,000")
    assert php == GT_EXPECTED["total"]


def test_grand_total_row_exact():
    rows = extract_rows(load_pps_pages())
    gt = [r for r in rows if r["role"] == "grand_total"]
    assert len(gt) == 1
    assign_amounts(rows)
    assert gt[0]["amounts_php"] == GT_EXPECTED


def test_every_row_satisfies_row_arithmetic():
    rows = extract_rows(load_pps_pages())
    assign_amounts(rows)
    for r in rows:
        a = r.get("amounts_php", {})
        if "total" not in a:
            continue
        s = a.get("infrastructure", 0) + a.get("medical_equipment", 0) + a.get("motor_vehicle", 0)
        assert s == a["total"], f"{r['id']} {r['label_raw'][:40]!r}: {s} != {a['total']}"


def test_tree_structure_and_ledger():
    rows = extract_rows(load_pps_pages())
    assign_amounts(rows)
    tree, root = build_tree(rows)
    kinds = {n["kind"] for n in tree["nodes"]}
    assert kinds == {"annex_program", "category_control", "subcategory_control",
                     "region_control", "province_control", "facility", "grand_total"}
    facilities = [n for n in tree["nodes"] if n["kind"] == "facility"]
    assert len(facilities) == 464
    # every facility has a province or region parent, never the annex root
    for f in facilities:
        assert f["parent_id"] != root["id"]
    ledger = sum(f["printed_amounts_php"].get("total", 0) for f in facilities)
    gap = GT_EXPECTED["total"] - ledger
    documented = PRINTED_DISCREPANCIES[0]["columns"]["total"]
    assert gap == documented


def test_vl_crosscheck_zero_conflicts():
    rows = extract_rows(load_pps_pages())
    assign_amounts(rows)
    report = vl_crosscheck(rows)
    assert report["amount_conflicts"] == []
    assert report["amount_agreements"] == report["shared_rows"]
    assert report["amount_agreements"] > 350


def test_full_build_passes_and_reconciles():
    artifacts, audit = build()
    assert audit["passed"], audit["errors"]
    s = audit["summary"]
    assert s["facilities"] == 464
    assert s["grand_total_php"] == GT_EXPECTED["total"]
    assert s["failed_internal_controls"] == 0
    assert s["vl_amount_conflicts"] == 0
    assert s["ledger_vs_grand_total_gap_php"] == {
        "infrastructure": 0, "medical_equipment": -140_000,
        "motor_vehicle": 0, "total": -140_000}
    assert audit["agency_check"]["passed"]
    assert audit["agency_check"]["capital_outlay_php"] == GT_EXPECTED["total"]
    assert audit["agency_check"]["mooe_php"] == 67_173_000
    assert audit["printed_discrepancies"][0]["id"] == "metro_manila_med_overhang_140000"


def test_written_artifacts_consistent():
    expected = {"nep_hfep_facilities.csv", "nep_hfep_controls.csv",
                "nep_hfep_tree.json", "nep_hfep_source_rows.json",
                "nep_hfep_audit.json", "nep_hfep_items_with_pages.md",
                "nep_hfep_data_list.json"}
    assert expected == {p.name for p in DATA.glob("nep_hfep_*")}
    with open(DATA / "nep_hfep_facilities.csv") as f:
        facilities = list(csv.DictReader(f))
    assert len(facilities) == 464
    assert sum(int(r["total_php"]) for r in facilities) == 14_472_519_000
    with open(DATA / "nep_hfep_controls.csv") as f:
        controls = list(csv.DictReader(f))
    gt = next(c for c in controls if c["kind"] == "grand_total")
    assert int(gt["total_php"]) == GT_EXPECTED["total"]
    tree = json.loads((DATA / "nep_hfep_tree.json").read_text())
    assert len(tree["nodes"]) == len(facilities) + len(controls) + 1  # + annex root
    audit = json.loads((DATA / "nep_hfep_audit.json").read_text())
    assert audit["printed_discrepancies"]


def test_csv_hierarchy_joins():
    """Facility rows must join to their controls on the printed columns.

    Guards the path-position → kind-based column mapping: categories without
    numbered subcategories (2–6) attach regions directly and used to shift
    region/province/facility into the wrong columns.
    """
    with open(DATA / "nep_hfep_facilities.csv") as f:
        facilities = list(csv.DictReader(f))
    with open(DATA / "nep_hfep_controls.csv") as f:
        controls = list(csv.DictReader(f))
    sub_idx = {(c["category"], c["label"]) for c in controls
               if c["kind"] == "subcategory_control"}
    reg_idx = {(c["category"], c["subcategory"], c["label"]) for c in controls
               if c["kind"] == "region_control"}
    prov_idx = {(c["category"], c["subcategory"], c["region"], c["label"]) for c in controls
                if c["kind"] == "province_control"}
    for r in facilities:
        if r["subcategory"]:
            assert (r["category"], r["subcategory"]) in sub_idx, r["id"]
        assert (r["category"], r["subcategory"], r["region"]) in reg_idx, r["id"]
        if r["province"]:
            assert (r["category"], r["subcategory"], r["region"], r["province"]) in prov_idx, r["id"]
    # every facility has a region, and no facility name leaked into province
    assert all(r["region"] for r in facilities)
    prov_leak = {r["id"] for r in facilities
                 if r["province"] == r["facility"]}
    assert not prov_leak, prov_leak
    # categories reconcile against their subcategory (or region) controls
    for c in (c for c in controls if c["kind"] == "category_control"):
        subs = [x for x in controls if x["kind"] == "subcategory_control"
                and x["category"] == c["label"]]
        regs = [x for x in controls if x["kind"] == "region_control"
                and x["category"] == c["label"] and not x["subcategory"]]
        parts = sum(int(x["total_php"]) for x in subs) or sum(int(x["total_php"]) for x in regs)
        assert parts == int(c["total_php"]), c["label"]


def test_source_rows_preserve_raw_ocr():
    rows = json.loads((DATA / "nep_hfep_source_rows.json").read_text())["rows"]
    by_id = {r["id"]: r for r in rows}
    # a dash misread recorded verbatim
    isabela = by_id["nep_hfep:p1:r10"]
    assert isabela["amounts_raw"].get("motor_vehicle") == "="
    # coordinates preserved for auditability
    assert isabela["label_x0_pps_px"] is not None
    # interpretations carry lineage
    derived = [r for r in rows if r.get("amount_interpretations")]
    assert all(v.get("rule") for r in derived for v in r["amount_interpretations"].values())


def test_data_list_json_provenance():
    """Consolidated JSON must be self-contained with per-item provenance."""
    d = json.loads((DATA / "nep_hfep_data_list.json").read_text())
    assert d["schema"] == "dpwh_nep_api/nep_hfep_data_list"
    assert len(d["items"]) == 464
    assert len(d["controls"]) == 348  # 347 printed controls + annex root ledger
    # every item carries full provenance structure
    for it in d["items"]:
        assert set(it["provenance"]) == {"normalizations", "amount_lineage", "flags",
                                         "image_review_status"}
        assert it["source"]["row_id"] == it["id"]
        assert {"category", "region"} <= set(it["hierarchy"])
    # flags present where expected
    all_flags = [f["flag"] for s in ("items", "controls") for x in d[s]
                 for f in x["provenance"]["flags"]]
    assert "ocr_suspect_label" in all_flags
    assert "verified_odd_amount" in all_flags
    assert "printed_discrepancy" in all_flags
    assert all_flags.count("printed_discrepancy") == 5  # MM→NCR→1.d→cat1→annex
    # Navotas City: the p2→p3 split continuation
    nav = next(c for c in d["controls"] if c["id"] == "nep_hfep:p3:r3")
    assert any(f["flag"] == "page_break_continuation"
               for f in nav["provenance"]["flags"])
    # its reconciliation must be exact
    assert nav["reconciliation"]["status"] == "exact"
    # Metro Manila control carries the discrepancy
    mm = next(c for c in d["controls"] if c["id"] == "nep_hfep:p2:r47")
    assert mm["reconciliation"]["status"] == "printed_discrepancy"
    assert mm["reconciliation"]["printed_discrepancy_id"] == "metro_manila_med_overhang_140000"
    # derived cells carry lineage
    with_lineage = [i for i in d["items"] if i["provenance"]["amount_lineage"]]
    assert len(with_lineage) == 88
    rules = {l["rule"] for i in with_lineage for l in i["provenance"]["amount_lineage"]}
    assert "derived_from_row_identity_total_minus_components" in rules
    # document-level findings embedded
    assert d["document"]["verification"]["findings"][0]["id"] == \
        "metro_manila_med_overhang_140000"
    assert len(d["document"]["verification"]["label_quirks"]) == 4
    assert len(d["document"]["verification"]["verified_odd_amounts"]) == 5


def test_hgab_data_list_parity():
    """HGAB consolidated JSON mirrors the NEP schema for future A+B passes."""
    hg = json.loads((DATA / "hgab_hfep_data_list.json").read_text())
    assert hg["schema"] == "dpwh_nep_api/hgab_hfep_data_list"
    assert len(hg["items"]) == 513
    assert sum(i["amounts_php"].get("total", 0) for i in hg["items"]) == 10_021_659_000
    statuses = {c["reconciliation"]["status"] for c in hg["controls"]}
    assert statuses == {"exact"}  # HGAB annex reconciles fully
    # schema parity with NEP data list
    nep = json.loads((DATA / "nep_hfep_data_list.json").read_text())
    assert set(hg["items"][0]) == set(nep["items"][0])
    assert set(hg["items"][0]["provenance"]) == set(nep["items"][0]["provenance"])
    assert set(hg["items"][0]["hierarchy"]) == set(nep["items"][0]["hierarchy"])
    assert set(hg["controls"][0]) == set(nep["controls"][0])
