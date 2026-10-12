#!/usr/bin/env python3
"""Extract the supplied HB 10858 I-B HFEP annex using native ruled-cell geometry.

This profile is deliberately limited to I-B PDF 877-893 (HFEP annex), I-A
PDF 1039/1067 (agency controls), and a working-versus-third-reading I-B
annex text comparison. Amounts stay in integer PHP. No OCR, inferred
allocations, or title repairs.

The annex prints a five-level hierarchy inside a ruled grid:

    category (bold, "1. Primary Care Facilities")
      subcategory (bold, "1.a Construction of New Barangay Health Stations")
        region (bold, "CAR", "Region II", "NCR", "BARMM")
          province (bold, "Apayao", "Metro Manila")
            facility (regular, "Damilag Barangay Health Station")

Four amount columns are printed: Infrastructure, Medical Equipment, Motor
Vehicle, and Total. Blank cells stay blank; only the Total column is
populated on every row. Rows are recovered from the page's own vector rules,
so wrapped labels and vertically centred amounts need no guessing.
"""
import argparse
import bisect
import collections
import csv
import hashlib
import io
import json
from pathlib import Path
import re

import pymupdf

ROOT = Path(__file__).resolve().parents[1]
IB = ROOT / "HB_BUDGET/2 - HB 10858 VOL IB.pdf"
IB_THIRD = ROOT / "HB_BUDGET_3rd_reading/2- HB 10858 FOR 3RD READING VOL I-B.pdf"
IA = ROOT / "HB_BUDGET/1 - HB 10858 VOL IA.pdf"
OUT = Path(__file__).resolve().parent / "data"
ANNEX_FIRST, ANNEX_LAST = 877, 893
PRINTED_OFFSET = 20
AMOUNT = re.compile(r"\d{1,3}(?:,\d{3})+")
CATEGORY = re.compile(r"^\d+\.\s")
SUBCATEGORY = re.compile(r"^\d+\.[a-z]")
COLUMNS = ("infrastructure_php", "medical_equipment_php", "motor_vehicle_php", "total_php")
# Odd/even PDF pages carry shifted grids; the label divider sits near these x.
LABEL_DIVIDER_ODD, LABEL_DIVIDER_EVEN = 323.9, 292.4
# Control/province/facility indents on odd pages; even pages shift by ~30.5.
INDENT_SHIFT = 30.4
CTRL_X, PROV_X, FAC_X = 79.4, 99.8, 115.4
GRAND_TOTAL_LABEL = "GRAND TOTAL"


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def box(values):
    return [round(v, 4) for v in values]


def clusters(values, tolerance=1.2):
    result = []
    for value in sorted(values):
        if not result or value - result[-1] > tolerance:
            result.append(value)
    return result


def visual_lines(words):
    """Words include source token index; group by y, then read left to right."""
    lines = []
    for word in sorted(words, key=lambda w: (w[1], w[0])):
        if lines and abs(word[1] - lines[-1][0][1]) < 2:
            lines[-1].append(word)
        else:
            lines.append([word])
    return [{"text": " ".join(w[4] for w in sorted(line, key=lambda w: w[0])),
             "bbox": box([min(w[0] for w in line), min(w[1] for w in line),
                          max(w[2] for w in line), max(w[3] for w in line)]),
             "word_indices": [w[-1] for w in sorted(line, key=lambda w: w[0])]}
            for line in lines]


def page_rules(page):
    """Cluster the annex grid's horizontal band rules and vertical dividers."""
    horizontal, vertical = [], []
    for drawing in page.get_drawings():
        for item in drawing["items"]:
            if item[0] != "l":
                continue
            a, b = item[1:3]
            if abs(a.y - b.y) < 0.5 and abs(a.x - b.x) > 200:
                horizontal.append(a.y)
            if abs(a.x - b.x) < 0.5 and abs(a.y - b.y) > 60:
                vertical.append(a.x)
    return clusters(horizontal), clusters(vertical)


def bold_rects(page):
    rects = []
    for block in page.get_text("dict")["blocks"]:
        for line in block.get("lines", []):
            for span in line["spans"]:
                if span["text"].strip() and "Bold" in span["font"]:
                    rects.append(pymupdf.Rect(span["bbox"]))
    return rects


def span_bold(word, bolds):
    return any(r.x0 - 1 <= word[0] and word[2] <= r.x1 + 1
               and r.y0 - 2 <= (word[1] + word[3]) / 2 <= r.y1 + 2
               for r in bolds)


def extract_rows(doc):
    """Recover annex rows from the ruled grid, with per-page word ownership."""
    rows, pages = [], []
    for pdf_page in range(ANNEX_FIRST, ANNEX_LAST + 1):
        page = doc[pdf_page - 1]
        ys, xs = page_rules(page)
        dividers = [x for x in xs if x > 250]
        if len(dividers) != 5:
            raise ValueError(f"Unexpected HFEP ruled-table layout on PDF {pdf_page}: {dividers}")
        if len(ys) < 3:
            raise ValueError(f"Missing HFEP row rules on PDF {pdf_page}")
        # dividers: label|infra, infra|equip, equip|vehicle, vehicle|total, right border
        bounds = [dividers[0], dividers[1], dividers[2], dividers[3], dividers[4]]
        bolds = bold_rects(page)
        words = [(*w, i) for i, w in enumerate(page.get_text("words"))]
        printed = pdf_page - PRINTED_OFFSET
        margin_numbers = [w[4] for w in words if w[1] < 40 or w[3] > 755]
        if str(printed) not in margin_numbers:
            raise ValueError(f"Printed-page mapping is unsupported on PDF {pdf_page}")
        page_rows, furniture, table_indices = [], [], []
        for band, (y0, y1) in enumerate(zip(ys, ys[1:]), 1):
            band_words = [w for w in words if y0 <= (w[1] + w[3]) / 2 < y1]
            if not band_words:
                spacer = {"id": f"ib:p{pdf_page}:r{band}", "role": "blank_spacer",
                          "pdf_page": pdf_page, "printed_page": printed,
                          "band": band, "bbox": box([xs[0], y0, xs[-1], y1]),
                          "label_raw": "", "label_lines": [],
                          "amounts_raw": {}, "amounts_php": {},
                          "word_indices": []}
                rows.append(spacer)
                page_rows.append(spacer["id"])
                continue
            label_words = [w for w in band_words if (w[0] + w[2]) / 2 < bounds[0]]
            column_words = [[w for w in band_words if bounds[k] <= (w[0] + w[2]) / 2 < bounds[k + 1]]
                            for k in range(4)]
            for w in band_words:
                table_indices.append(w[-1])
            label_lines = visual_lines(label_words)
            label = "\n".join(line["text"] for line in label_lines)
            amounts_raw, amounts_php = {}, {}
            for k, name in enumerate(("infrastructure", "medical_equipment", "motor_vehicle", "total")):
                tokens = [w[4] for w in sorted(column_words[k], key=lambda w: w[0])]
                raw = " ".join(tokens)
                if raw:
                    amounts_raw[name] = raw
                    if AMOUNT.fullmatch(raw):
                        amounts_php[name] = int(raw.replace(",", ""))
            row_id = f"ib:p{pdf_page}:r{band}"
            joined = " ".join(label.split())
            full_band = " ".join([joined] + [amounts_raw.get(name, "") for name in
                                             ("infrastructure", "medical_equipment",
                                              "motor_vehicle", "total")]).strip()
            x0 = min((w[0] for w in label_words), default=xs[0])
            if pdf_page % 2 == 1:
                ctrl_x, prov_x = CTRL_X, PROV_X
            else:
                ctrl_x, prov_x = CTRL_X - INDENT_SHIFT, PROV_X - INDENT_SHIFT
            label_bold = bool(label_words) and all(span_bold(w, bolds) for w in label_words)
            if not label_words:
                raise ValueError(f"Amount cells without a label on PDF {pdf_page}, band {band}")
            if full_band == "DEPARTMENT OF HEALTH" \
                    or full_band.startswith("FY 2027 HEALTH FACILITIES") \
                    or full_band == "(Amount in Pesos)":
                role = "annex_heading"
            elif "Name of Projects and Facilities" in joined:
                role = "column_header"
            elif joined == GRAND_TOTAL_LABEL:
                role = "grand_total"
            elif CATEGORY.match(joined):
                role = "category"
            elif SUBCATEGORY.match(joined):
                role = "subcategory"
            elif x0 < ctrl_x + 2:
                role = "region"
            elif x0 < prov_x + 2:
                role = "province"
            else:
                role = "facility"
            if role in {"region", "province", "category", "subcategory", "grand_total"} and not label_bold:
                raise ValueError(f"Non-bold control row on PDF {pdf_page}, band {band}: {joined!r}")
            if role == "facility" and label_bold:
                raise ValueError(f"Bold facility row on PDF {pdf_page}, band {band}: {joined!r}")
            if role in {"category", "subcategory", "region", "province", "facility", "grand_total"}:
                if "total" not in amounts_php:
                    raise ValueError(f"Row without a parsable total on PDF {pdf_page}, band {band}: {joined!r}")
                if set(amounts_raw) - set(amounts_php):
                    raise ValueError(f"Non-numeric amount cell on PDF {pdf_page}, band {band}: {amounts_raw}")
                for name in ("infrastructure", "medical_equipment", "motor_vehicle"):
                    parts = amounts_php.get("total", 0)
                    components = sum(amounts_php.get(name, 0) for name in
                                     ("infrastructure", "medical_equipment", "motor_vehicle"))
                    if parts != components:
                        raise ValueError(
                            f"Component/total mismatch on PDF {pdf_page}, band {band}: "
                            f"{joined!r} components={components} total={parts}")
            rows.append({"id": row_id, "role": role, "pdf_page": pdf_page,
                         "printed_page": printed, "band": band,
                         "bbox": box([xs[0], y0, xs[-1], y1]),
                         "label_cell_bbox": box([xs[0], y0, bounds[0], y1]),
                         "x0": round(x0, 2), "label_raw": label, "label_lines": label_lines,
                         "amounts_raw": amounts_raw, "amounts_php": amounts_php,
                         "word_indices": [w[-1] for group in
                                          [label_words] + column_words
                                          for w in group]})
            page_rows.append(row_id)
        # Furniture check: any comma-grouped token outside the grid is unexpected.
        outside = [w[4] for w in words if w[-1] not in set(table_indices)
                   and AMOUNT.fullmatch(w[4])]
        if outside:
            raise ValueError(f"Amount-like tokens outside the grid on PDF {pdf_page}: {outside}")
        pages.append({"pdf_page": pdf_page, "printed_page": printed,
                      "page_size": box([page.rect.width, page.rect.height]),
                      "column_boundaries_x": box(xs), "row_boundaries_y": box(ys),
                      "source_row_ids": page_rows,
                      "table_word_indices": sorted(table_indices),
                      "outside_table_amount_tokens": outside})
    return rows, pages


def row_label(row):
    return " ".join(row["label_raw"].splitlines())


def build_tree(rows):
    """Parent every printed row inside the annex, honouring document order."""
    annex_root = {"id": "ib:p877:title", "kind": "annex_program", "parent_id": None,
                  "child_ids": [], "label": "FY 2027 HEALTH FACILITIES ENHANCEMENT PROGRAM (HFEP)",
                  "label_raw": "DEPARTMENT OF HEALTH\nFY 2027 HEALTH FACILITIES "
                               "ENHANCEMENT PROGRAM (HFEP)\n(Amount in Pesos)",
                  "printed_amounts_php": {}, "derived": True,
                  "source": {"source_pdf": IB.relative_to(ROOT).as_posix(),
                             "row_id": "ib:p877:title", "pdf_page": ANNEX_FIRST,
                             "printed_page": ANNEX_FIRST - PRINTED_OFFSET,
                             "band": None,
                             "bbox": box([225.3, 60.5, 431.0, 89.5])},
                  "source_evidence_status": "native_words_annex_title",
                  "image_review_status": "not_individually_reviewed"}
    nodes = [annex_root]
    by_role = {"category": None, "subcategory": None, "region": None, "province": None}
    kind_by_role = {"category": "category_control", "subcategory": "subcategory_control",
                    "region": "region_control", "province": "province_control",
                    "facility": "facility", "grand_total": "grand_total"}
    for row in rows:
        role = row["role"]
        if role not in kind_by_role:
            continue
        node = {"id": row["id"], "kind": kind_by_role[role], "parent_id": None, "child_ids": [],
                "label": row_label(row), "label_raw": row["label_raw"],
                "printed_amounts_php": dict(row["amounts_php"]),
                "printed_amounts_raw": dict(row["amounts_raw"]),
                "derived": False,
                "source": {"source_pdf": IB.relative_to(ROOT).as_posix(),
                           "row_id": row["id"], "pdf_page": row["pdf_page"],
                           "printed_page": row["printed_page"], "band": row["band"],
                           "bbox": row["bbox"], "label_cell_bbox": row["label_cell_bbox"],
                           "x0": row["x0"]},
                "source_evidence_status": "native_ruled_cell_match",
                "image_review_status": "not_individually_reviewed"}
        if role == "category":
            parent = annex_root
            by_role.update(subcategory=None, region=None, province=None)
        elif role == "grand_total":
            parent = annex_root
        elif role == "subcategory":
            parent = by_role["category"]
            if parent is None:
                raise ValueError(f"Subcategory without a category: {row['id']}")
            by_role.update(region=None, province=None)
        elif role == "region":
            parent = by_role["subcategory"] or by_role["category"]
            if parent is None:
                raise ValueError(f"Region without a category: {row['id']}")
            by_role["province"] = None
        elif role == "province":
            parent = by_role["region"]
            if parent is None:
                raise ValueError(f"Province without a region: {row['id']}")
        else:
            parent = by_role["province"] or by_role["region"]
            if parent is None:
                raise ValueError(f"Facility without a region: {row['id']}")
        node["parent_id"] = parent["id"]
        parent["child_ids"].append(node["id"])
        if role in by_role:
            by_role[role] = node
        nodes.append(node)
    by_id = {node["id"]: node for node in nodes}
    for node in nodes:
        node["path_ids"], node["path_labels"] = [], []
        current = node
        while current:
            node["path_ids"].insert(0, current["id"])
            node["path_labels"].insert(0, current["label"])
            current = by_id.get(current["parent_id"])
    return {"root_id": annex_root["id"], "nodes": nodes}, annex_root


def grand_total_row(rows):
    matches = [r for r in rows if r["role"] == "grand_total"]
    if len(matches) != 1:
        raise ValueError(f"Expected exactly one grand total, found {len(matches)}")
    return matches[0]


def agency_controls(doc_ia):
    """Read the DOH HFEP allocation row on I-A PDF 1067 (printed 1057).

    Line numbers in both margins ("41") share the visual line and are
    excluded by x-position; label and amount tokens can jitter ~0.3pt in y,
    so grouping uses a 2pt band.
    """
    page = doc_ia[1067 - 1]
    words = page.get_text("words")
    lines = []
    for w in sorted(words, key=lambda w: (w[1], w[0])):
        if lines and abs(w[1] - lines[-1][0][1]) < 2:
            lines[-1].append(w)
        else:
            lines.append([w])
    observations = []
    for line in lines:
        text = " ".join(w[4] for w in sorted(line, key=lambda w: w[0]))
        label = " ".join(w[4] for w in sorted(line, key=lambda w: w[0])
                         if 60 < w[0] < 405).strip()
        if label != "Health Facilities Enhancement Program":
            continue
        amounts = [w for w in line if AMOUNT.fullmatch(w[4]) and w[0] > 405]
        if len(amounts) != 3:
            raise ValueError(f"Unexpected HFEP agency row on I-A 1067: {text!r}")
        observations.append({
            "label": label,
            "mooe_php": int(amounts[0][4].replace(",", "")),
            "capital_outlay_php": int(amounts[1][4].replace(",", "")),
            "total_php": int(amounts[2][4].replace(",", "")),
            "source": {"source_pdf": IA.relative_to(ROOT).as_posix(),
                       "pdf_page": 1067, "printed_page": 1057,
                       "token_bboxes": [box(w[:4]) for w in amounts[:3]]}})
    if len(observations) != 1:
        raise ValueError(f"Expected one HFEP agency row, found {len(observations)}")
    return observations[0]


def reading_comparison():
    """Working-copy versus third-reading I-B annex native text comparison."""
    with pymupdf.open(IB) as working, pymupdf.open(IB_THIRD) as third:
        pages = []
        for pdf_page in range(ANNEX_FIRST, ANNEX_LAST + 1):
            a = working[pdf_page - 1].get_text()
            b = third[pdf_page - 1].get_text()
            pages.append({"pdf_page": pdf_page, "native_text_identical": a == b})
    return {"method": "page.get_text() equality over PDF 877-893 of both I-B copies",
            "identical_pages": sum(p["native_text_identical"] for p in pages),
            "total_pages": len(pages), "pages": pages,
            "note": "Textual identity does not authenticate the legislative stage "
                    "of either supplied copy."}


def validate(rows, pages, tree, agency, comparison):
    errors = []
    by_id = {n["id"]: n for n in tree["nodes"]}
    row_by_id = {r["id"]: r for r in rows}
    structural_roles = {"category", "subcategory", "region", "province", "facility", "grand_total"}
    ownership = collections.Counter(n["source"]["row_id"] for n in tree["nodes"]
                                    if n["kind"] != "annex_program")
    structural_ids = {r["id"] for r in rows if r["role"] in structural_roles}
    if set(ownership) != structural_ids or any(v != 1 for v in ownership.values()):
        errors.append("source_amount_row_coverage_or_ownership")
    for n in tree["nodes"]:
        if n["kind"] == "annex_program":
            continue
        row = row_by_id.get(n["source"]["row_id"])
        if not row or n["printed_amounts_php"] != row["amounts_php"] \
                or n["label_raw"] != row["label_raw"]:
            errors.append(f"native_layout_evidence_disagreement:{n['id']}")
    for page in pages:
        page_row_ids = [r["id"] for r in rows if r["pdf_page"] == page["pdf_page"]]
        if page_row_ids != page["source_row_ids"]:
            errors.append(f"source_table_row_coverage:{page['pdf_page']}")
        indices = [r["word_indices"] for r in rows if r["pdf_page"] == page["pdf_page"]]
        flat = [i for group in indices for i in group]
        if sorted(flat) != page["table_word_indices"] or len(flat) != len(set(flat)):
            errors.append(f"source_word_coverage_or_ownership:{page['pdf_page']}")
    visited = collections.Counter()
    rollups = []

    def walk(node_id, ancestors):
        if node_id in ancestors or node_id not in by_id:
            errors.append(f"cycle_or_unknown_node:{node_id}")
            return collections.Counter()
        visited[node_id] += 1
        node = by_id[node_id]
        children = [by_id[c] for c in node["child_ids"] if c in by_id]
        for child in children:
            if child["parent_id"] != node_id:
                errors.append(f"parent_link_disagreement:{child['id']}")
        if node["kind"] == "grand_total":
            # Printed control, not an additive allocation; excluded from sums.
            return collections.Counter()
        if not node["child_ids"]:
            return collections.Counter({k: v for k, v in node["printed_amounts_php"].items()})
        total = collections.Counter()
        for child in children:
            total.update(walk(child["id"], ancestors | {node_id}))
        node["derived_amounts_php"] = dict(total)
        if node["kind"] != "annex_program":
            check = {"node_id": node_id, "label": node["label"], "kind": node["kind"],
                     "printed_amounts_php": dict(node["printed_amounts_php"]),
                     "recursive_children_sum_php": dict(total),
                     "child_count": len(children)}
            check["differences_php"] = {k: node["printed_amounts_php"].get(k, 0) - total.get(k, 0)
                                        for k in ("infrastructure", "medical_equipment",
                                                  "motor_vehicle", "total")
                                        if k in node["printed_amounts_php"] or k in total}
            check["passed"] = all(v == 0 for v in check["differences_php"].values())
            rollups.append(check)
            if not check["passed"]:
                errors.append(f"control_sum_disagreement:{node_id}")
        return total

    recursive = walk(tree["root_id"], set())
    if set(visited) != set(by_id) or any(c != 1 for c in visited.values()):
        errors.append("tree_reachability_or_duplicate_consumption")
    grand = grand_total_row(rows)
    grand_node = next(n for n in tree["nodes"] if n["kind"] == "grand_total"
                      ) if any(n["kind"] == "grand_total" for n in tree["nodes"]) else None
    facilities = [n for n in tree["nodes"] if n["kind"] == "facility"]
    ledger = collections.Counter()
    for f in facilities:
        ledger.update(f["printed_amounts_php"])
    if grand_node:
        diffs = {k: grand_node["printed_amounts_php"].get(k, 0) - ledger.get(k, 0)
                 for k in ("infrastructure", "medical_equipment", "motor_vehicle", "total")}
        if any(v != 0 for v in diffs.values()):
            errors.append(f"grand_total_vs_facility_ledger:{diffs}")
    annex = by_id[tree["root_id"]]
    annex_diffs = {k: annex["derived_amounts_php"].get(k, 0) - grand["amounts_php"].get(k, 0)
                   for k in ("infrastructure", "medical_equipment", "motor_vehicle", "total")}
    if any(v != 0 for v in annex_diffs.values()):
        errors.append(f"annex_derived_vs_grand_total:{annex_diffs}")
    agency_check = {**agency,
                    "annex_capital_outlay_php": grand["amounts_php"].get("total"),
                    "annex_vs_agency_capital_outlay_difference_php":
                        agency["capital_outlay_php"] - grand["amounts_php"].get("total", 0),
                    "agency_mooe_plus_co_equals_total":
                        agency["mooe_php"] + agency["capital_outlay_php"] == agency["total_php"],
                    "note": "The I-A row shows the wider HFEP allocation: MOOE plus the "
                            "annex's capital outlays. The annex total must match only the "
                            "capital-outlay component."}
    agency_check["passed"] = (agency_check["annex_vs_agency_capital_outlay_difference_php"] == 0
                              and agency_check["agency_mooe_plus_co_equals_total"])
    if not agency_check["passed"]:
        errors.append("agency_control_disagreement")
    repeated = collections.defaultdict(list)
    for f in facilities:
        repeated[(f["label"], f["parent_id"])].append(f["id"])
    return {"passed": not errors, "errors": errors, "summary": {
                "detail_pages": len(pages),
                "source_bands": len(rows),
                "band_role_counts": dict(collections.Counter(r["role"] for r in rows)),
                "table_words_accounted_for": sum(len(p["table_word_indices"]) for p in pages),
                "nodes": len(by_id),
                "facilities": len(facilities),
                "facility_ledger_total_php": ledger.get("total"),
                "facility_ledger_infrastructure_php": ledger.get("infrastructure"),
                "facility_ledger_medical_equipment_php": ledger.get("medical_equipment"),
                "facility_ledger_motor_vehicle_php": ledger.get("motor_vehicle"),
                "internal_control_checks": len(rollups),
                "failed_internal_controls": sum(not c["passed"] for c in rollups),
                "reading_comparison_identical_pages": comparison["identical_pages"]},
            "rollup_checks": rollups, "agency_check": agency_check,
            "repeated_facility_groups": [{"label": label, "parent_id": parent, "facility_ids": ids}
                                         for (label, parent), ids in repeated.items() if len(ids) > 1],
            "source_evidence": {"method": "native ruled bands, bold control rows, four amount columns",
                                "all_rows_individually_image_reviewed": False,
                                "comparison_ready": False}}


def csv_text(records, fields):
    stream = io.StringIO(newline="")
    writer = csv.DictWriter(stream, fieldnames=fields, lineterminator="\n")
    writer.writeheader()
    writer.writerows(records)
    return stream.getvalue()


def facility_csv_records(tree):
    facilities = [n for n in tree["nodes"] if n["kind"] == "facility"]
    return [{"id": f["id"],
             "category": f["path_labels"][1] if len(f["path_labels"]) > 1 else None,
             "subcategory": f["path_labels"][2] if len(f["path_labels"]) > 2 else None,
             "region": f["path_labels"][3] if len(f["path_labels"]) > 3 else None,
             "province": f["path_labels"][4] if len(f["path_labels"]) > 4 else None,
             "facility": f["label"], "facility_raw": f["label_raw"],
             "infrastructure_php": f["printed_amounts_php"].get("infrastructure"),
             "medical_equipment_php": f["printed_amounts_php"].get("medical_equipment"),
             "motor_vehicle_php": f["printed_amounts_php"].get("motor_vehicle"),
             "total_php": f["printed_amounts_php"].get("total"),
             "source_pdf": f["source"]["source_pdf"], "pdf_page": f["source"]["pdf_page"],
             "printed_page": f["source"]["printed_page"], "band": f["source"]["band"],
             "parent_id": f["parent_id"], "path": " → ".join(f["path_labels"][1:])}
            for f in facilities]


def control_csv_records(tree):
    records = []
    for n in tree["nodes"]:
        if n["kind"] in {"category_control", "subcategory_control", "region_control",
                         "province_control", "grand_total"}:
            records.append({"id": n["id"], "kind": n["kind"], "label": n["label"],
                            "infrastructure_php": n["printed_amounts_php"].get("infrastructure"),
                            "medical_equipment_php": n["printed_amounts_php"].get("medical_equipment"),
                            "motor_vehicle_php": n["printed_amounts_php"].get("motor_vehicle"),
                            "total_php": n["printed_amounts_php"].get("total"),
                            "child_count": len(n["child_ids"]),
                            "recursive_sum_total_php": n.get("derived_amounts_php", {}).get("total"),
                            "pdf_page": n["source"]["pdf_page"],
                            "printed_page": n["source"]["printed_page"]})
    return records


def csv_rows(tree):
    """Deterministic facility-ledger CSV text (test/inspection helper)."""
    return csv_text(facility_csv_records(tree), FACILITY_CSV_FIELDS)


FACILITY_CSV_FIELDS = ["id", "category", "subcategory", "region", "province",
                       "facility", "facility_raw", "infrastructure_php",
                       "medical_equipment_php", "motor_vehicle_php", "total_php",
                       "source_pdf", "pdf_page", "printed_page", "band",
                       "parent_id", "path"]


def build():
    metadata = {"schema_version": 1, "fiscal_year": 2027, "currency": "PHP",
                "source_unit": "pesos_printed_on_annex", "unit_multiplier": 1,
                "document": "HB 10858 General Appropriations Bill, local HB_BUDGET copy",
                "legislative_stage": "not_independently_authenticated",
                "scope": "DOH FY 2027 Health Facilities Enhancement Program (HFEP) annex; "
                         "not the entire DOH appropriation. The I-A HFEP allocation of "
                         "PHP 10,088,832,000 additionally includes PHP 67,173,000 MOOE, "
                         "which is outside this annex.",
                "source_pdf": IB.relative_to(ROOT).as_posix(), "source_sha256": sha(IB),
                "source_pdf_pages": [ANNEX_FIRST, ANNEX_LAST],
                "source_printed_pages": [ANNEX_FIRST - PRINTED_OFFSET, ANNEX_LAST - PRINTED_OFFSET],
                "agency_control_pdf_pages": {"IA_allocation_table": [1067],
                                             "IA_special_provision": [1039]},
                "extractor_sha256": sha(__file__), "pymupdf_version": pymupdf.VersionBind,
                "ids": "source-artifact-local page and band identifiers; not cross-document "
                       "facility identities"}
    with pymupdf.open(IB) as doc, pymupdf.open(IA) as doc_ia:
        rows, pages = extract_rows(doc)
        agency = agency_controls(doc_ia)
    comparison = reading_comparison()
    tree, annex_root = build_tree(rows)
    audit = validate(rows, pages, tree, agency, comparison)
    flat = facility_csv_records(tree)
    controls = control_csv_records(tree)
    artifacts = {
        "hgab_hfep_tree.json": {"metadata": metadata, **tree},
        "hgab_hfep_source_rows.json": {"metadata": metadata, "pages": pages,
                                       "rows": [{k: v for k, v in r.items() if k != "label_lines"}
                                                for r in rows]},
        "hgab_hfep_audit.json": {"metadata": metadata, **audit,
                                 "reading_comparison": comparison},
    }
    result = {name: json.dumps(value, ensure_ascii=False, indent=2) + "\n"
              for name, value in artifacts.items()}
    result["hgab_hfep_facilities.csv"] = csv_text(flat, FACILITY_CSV_FIELDS)
    result["hgab_hfep_controls.csv"] = csv_text(controls, list(controls[0].keys()))
    return result, audit


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true",
                        help="re-extract and compare deterministic outputs without writing")
    args = parser.parse_args()
    artifacts, audit = build()
    if not audit["passed"]:
        raise SystemExit(json.dumps(audit["errors"], indent=2))
    if args.check:
        stale = [name for name, content in artifacts.items()
                 if not (OUT / name).exists() or (OUT / name).read_text() != content]
        if stale:
            raise SystemExit("Missing or stale HFEP outputs: " + ", ".join(stale))
    else:
        OUT.mkdir(parents=True, exist_ok=True)
        for name, content in artifacts.items():
            (OUT / name).write_text(content)
    print(json.dumps(audit["summary"], indent=2))
    print("Deterministic output check passed." if args.check
          else "HFEP artifacts written; all required accounting/coverage checks passed.")


if __name__ == "__main__":
    main()
