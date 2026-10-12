#!/usr/bin/env python3
"""Extract the supplied HB 10858 I-B NIA irrigation annex using native layout text.

This profile is limited to I-B PDF 896-941 (annex rows) plus I-B 568/570 (agency
controls). The annex prints no ruled grid: rows are recovered from native words
by indent, bold sub-program headings, and a right-aligned amount column. Amounts
stay in integer PHP. No OCR, inferred allocations, or title repairs.
"""
import argparse
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
OUT = Path(__file__).resolve().parent / "data"
ANNEX_FIRST, ANNEX_LAST = 896, 941
PRINTED_OFFSET = 22
AMOUNT = re.compile(r"\d{1,3}(?:,\d{3})+")
AMOUNT_COLUMN_X = 520.0
CONTROL_INDENT_X = 100.0
ANNEX_TITLE = "FY 2027 IRRIGATION PROGRAM"
PROGRAM_HEADING = "IRRIGATION SYSTEMS DEVELOPMENT PROGRAM"
# Agency-table row printed on I-B 570 under the Development program but not
# printed as an annex sub-program; special provision 3 (I-B 560) links the
# Other Irrigation Systems Sub-program to CARP.
AGENCY_ONLY_CARP_OTHER_IRRIGATION_PHP = 698_067_000
# The first annex page carries extra title furniture above the first row.
PAGE_BANDS = {ANNEX_FIRST: (105.0, 748.0)}
DEFAULT_BAND = (58.0, 748.0)
FURNITURE_VOCABULARY = {
    "NATIONAL", "IRRIGATION", "ADMINISTRATION", "FY", "2027", "PROGRAM",
    "PROGRAMS", "ACTIVITIES", "PROJECTS", "AMOUNT", "GENERAL", "APPROPRIATIONS",
    "BILL,", "-", "/", "PROGRAMS/ACTIVITIES/PROJECTS",
}
AGENCY_PAP_PAGE, AGENCY_TOTAL_PAGE = 570, 568
# The agency table prints "Other Irrigation SystemS Sub-program" (plural) where
# the annex prints "Other Irrigation System Sub-Program" (singular). Both rows
# carrying that agency label are matched by amount: the annex control 460,000,000
# and the agency-only CARP row 698,067,000.
AGENCY_LABEL_ALIASES = {
    "OTHER IRRIGATION SYSTEMS SUB-PROGRAM": "OTHER IRRIGATION SYSTEM SUB-PROGRAM",
}


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def box(values):
    return [round(v, 4) for v in values]


def visual_lines(words):
    """Words carry source token index; group by y, then read left to right."""
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


def bold_rects(page):
    rects = []
    for block in page.get_text("dict")["blocks"]:
        for line in block.get("lines", []):
            for span in line["spans"]:
                if span["text"].strip() and "Bold" in span["font"]:
                    rects.append(pymupdf.Rect(span["bbox"]))
    return rects


def word_in_bold(word, bolds):
    return any(rect.x0 - 1 <= word[0] and word[2] <= rect.x1 + 1
               and rect.y0 - 2 <= (word[1] + word[3]) / 2 <= rect.y1 + 2
               for rect in bolds)


def extract_rows(doc):
    """Recover annex rows by indent/layout, with per-page word ownership."""
    rows, pages = [], []
    saw_control = False
    for pdf_page in range(ANNEX_FIRST, ANNEX_LAST + 1):
        page = doc[pdf_page - 1]
        band = PAGE_BANDS.get(pdf_page, DEFAULT_BAND)
        bolds = bold_rects(page)
        words = [(*w, i) for i, w in enumerate(page.get_text("words"))]
        content, furniture = [], []
        for word in words:
            (content if band[0] < (word[1] + word[3]) / 2 < band[1] else furniture).append(word)
        grouped = []
        for word in sorted(content, key=lambda w: (w[1], w[0])):
            if grouped and abs(word[1] - grouped[-1][0][1]) < 2:
                grouped[-1].append(word)
            else:
                grouped.append([word])
        page_rows, opened = [], None
        for group in grouped:
            line_words = sorted(group, key=lambda w: w[0])
            x0 = min(w[0] for w in line_words)
            amounts = [w for w in line_words
                       if AMOUNT.fullmatch(w[4]) and w[0] >= AMOUNT_COLUMN_X]
            labels = [w for w in line_words if w not in amounts]
            numeric_in_label = [w[4] for w in labels if AMOUNT.fullmatch(w[4])]
            first_bold = bool(line_words) and word_in_bold(line_words[0], bolds)
            line = {"text": " ".join(w[4] for w in line_words),
                    "label_text": " ".join(w[4] for w in labels),
                    "bbox": box([min(w[0] for w in line_words), min(w[1] for w in line_words),
                                 max(w[2] for w in line_words), max(w[3] for w in line_words)]),
                    "word_indices": [w[-1] for w in line_words],
                    "x0": round(x0, 2), "first_word_bold": first_bold}
            if len(amounts) > 1:
                raise ValueError(f"Multiple amount-column tokens on PDF {pdf_page}: {line['text']!r}")
            if amounts:
                if x0 < CONTROL_INDENT_X and not first_bold:
                    raise ValueError(f"Non-bold control indent row on PDF {pdf_page}: {line['text']!r}")
                if x0 >= CONTROL_INDENT_X and first_bold:
                    raise ValueError(f"Bold row start at project indent on PDF {pdf_page}: {line['text']!r}")
                role = "subprogram_control" if x0 < CONTROL_INDENT_X else "project"
                if role == "project" and not saw_control:
                    raise ValueError(f"Project row before any control on PDF {pdf_page}")
                if role == "subprogram_control":
                    saw_control = True
                amount_bold = word_in_bold(amounts[0], bolds)
                if role == "subprogram_control" and not amount_bold:
                    raise ValueError(f"Control amount not bold on PDF {pdf_page}: {line['text']!r}")
                if role == "project" and amount_bold:
                    raise ValueError(f"Project amount bold on PDF {pdf_page}: {line['text']!r}")
                opened = {"id": f"ib:p{pdf_page}:r{len(page_rows) + 1}", "pdf_page": pdf_page,
                          "printed_page": pdf_page - PRINTED_OFFSET,
                          "row_number": len(page_rows) + 1, "role": role, "x0": line["x0"],
                          "amount_raw": amounts[0][4],
                          "amount_php": int(amounts[0][4].replace(",", "")),
                          "amount_token_bbox": box(amounts[0][:4]),
                          "amount_bold": amount_bold,
                          "title_lines": [line], "continuation_lines": [],
                          "title_numeric_tokens": list(numeric_in_label)}
                rows.append(opened)
                page_rows.append(opened["id"])
            elif x0 < CONTROL_INDENT_X:
                if not first_bold or line["text"] != PROGRAM_HEADING:
                    raise ValueError(f"Unexpected heading-indent line on PDF {pdf_page}: {line['text']!r}")
                if any(r["role"] == "program_control" for r in rows):
                    raise ValueError("Multiple program headings; inspect the source profile")
                opened = None
                heading = {"id": f"ib:p{pdf_page}:h1", "pdf_page": pdf_page,
                           "printed_page": pdf_page - PRINTED_OFFSET, "row_number": None,
                           "role": "program_control", "x0": line["x0"],
                           "amount_raw": None, "amount_php": None,
                           "amount_token_bbox": None, "amount_bold": None,
                           "title_lines": [line], "continuation_lines": [],
                           "title_numeric_tokens": []}
                rows.append(heading)
                page_rows.append(heading["id"])
            else:
                if opened is None:
                    raise ValueError(f"Continuation before any row on PDF {pdf_page}: {line['text']!r}")
                opened["continuation_lines"].append(line)
                opened["title_numeric_tokens"].extend(numeric_in_label)
        printed = pdf_page - PRINTED_OFFSET
        furniture_texts = [w[4] for w in furniture]
        if str(printed) not in furniture_texts:
            raise ValueError(f"Printed-page mapping is unsupported on PDF {pdf_page}")
        if [w[4] for w in furniture if AMOUNT.fullmatch(w[4])]:
            raise ValueError(f"Amount-like furniture tokens on PDF {pdf_page}")
        outside = sorted({w[4] for w in furniture
                          if w[4] not in FURNITURE_VOCABULARY and w[4] != str(printed)})
        if outside:
            raise ValueError(f"Unexpected furniture text on PDF {pdf_page}: {outside}")
        record = {"pdf_page": pdf_page, "printed_page": printed,
                  "page_size": box([page.rect.width, page.rect.height]),
                  "content_band_y": list(band),
                  "source_row_ids": page_rows,
                  "content_word_indices": sorted(w[-1] for w in content),
                  "furniture_words": [{"text": w[4], "bbox": box(w[:4]), "word_index": w[-1]}
                                      for w in sorted(furniture, key=lambda w: (w[1], w[0]))]}
        if pdf_page == ANNEX_FIRST:
            title_lines = [line for line in visual_lines(furniture)
                           if line["text"] == ANNEX_TITLE]
            if len(title_lines) != 1:
                raise ValueError("Annex title line not found exactly once on PDF 896")
            record["annex_title"] = title_lines[0]
        pages.append(record)
    return rows, pages


def row_label_raw(row):
    return "\n".join(line["label_text"] for line in row["title_lines"] + row["continuation_lines"])


def row_title(row):
    return " ".join(row_label_raw(row).split())


def annex_root_node(title_line):
    return {"id": f"ib:p{ANNEX_FIRST}:title", "kind": "annex_program", "parent_id": None,
            "child_ids": [], "label": title_line["text"], "label_raw": title_line["text"],
            "printed_amount_php": None, "derived": True,
            "source": {"source_pdf": IB.relative_to(ROOT).as_posix(),
                       "row_id": f"ib:p{ANNEX_FIRST}:title", "pdf_page": ANNEX_FIRST,
                       "printed_page": ANNEX_FIRST - PRINTED_OFFSET, "row_number": None,
                       "bbox": title_line["bbox"]},
            "source_evidence_status": "native_words_annex_title_line",
            "image_review_status": "not_individually_reviewed"}


def build_tree(rows, title_line):
    root = annex_root_node(title_line)
    nodes, program, subprogram = [root], None, None
    for row in rows:
        node = {"id": row["id"], "kind": row["role"], "parent_id": None, "child_ids": [],
                "label": row_title(row), "label_raw": row_label_raw(row),
                "printed_amount_php": row["amount_php"], "derived": False,
                "source": {"source_pdf": IB.relative_to(ROOT).as_posix(),
                           "row_id": row["id"], "pdf_page": row["pdf_page"],
                           "printed_page": row["printed_page"], "row_number": row["row_number"],
                           "x0": row["x0"]},
                "source_evidence_status": "native_words_indent_layout_match",
                "image_review_status": "not_individually_reviewed"}
        if row["role"] == "subprogram_control":
            parent = program if program is not None else root
            subprogram = node
        elif row["role"] == "project":
            if subprogram is None:
                raise ValueError("Project without a printed sub-program")
            parent = subprogram
            node["subprogram_label"] = subprogram["label"]
        else:
            if program is not None:
                raise ValueError("Multiple program headings")
            parent = root
            program = node
        node["parent_id"] = parent["id"]
        parent["child_ids"].append(node["id"])
        nodes.append(node)
    if program is None:
        raise ValueError("No program heading")
    by_id = {node["id"]: node for node in nodes}
    for node in nodes:
        node["path_ids"], node["path_labels"] = [], []
        current = node
        while current:
            node["path_ids"].insert(0, current["id"])
            node["path_labels"].insert(0, current["label"])
            current = by_id.get(current["parent_id"])
    return {"root_id": root["id"], "nodes": nodes}


def agency_controls():
    """Read the NIA agency PAP control rows on PDF 568/570; MOOE and Total stay separate."""
    expected = collections.Counter([
        "IRRIGATION SYSTEMS RESTORATION PROGRAM",
        "NATIONAL IRRIGATION SYSTEM SUB-PROGRAM",
        "COMMUNAL IRRIGATION SYSTEM SUB-PROGRAM",
        "OTHER IRRIGATION SYSTEMS SUB-PROGRAM",
        "IRRIGATION SYSTEMS DEVELOPMENT PROGRAM",
        "ESTABLISHMENT OF PUMP IRRIGATION SUB-PROGRAM",
        "SPECIAL IRRIGATION SUB-PROGRAM",
        "EXTENSION/EXPANSION OF EXISTING IRRIGATION SYSTEM SUB-PROGRAM",
        "OTHER IRRIGATION SYSTEMS SUB-PROGRAM",
        "SUB-TOTAL, OPERATIONS",
        "TOTAL NEW APPROPRIATIONS",
    ])

    def read_rows(doc, pdf_page, y_low, y_high):
        page = doc[pdf_page - 1]
        words = [(*w, i) for i, w in enumerate(page.get_text("words"))
                 if y_low <= w[1] <= y_high and w[0] < 596]
        observations, pending, pending_bbox = [], [], None
        for line in visual_lines(words):
            line_words = [w for w in words if w[-1] in line["word_indices"]]
            label = " ".join(w[4] for w in sorted(line_words, key=lambda w: w[0])
                             if w[0] < 300 and w[4] != "P"
                             and not (w[0] < 66 and w[4].isdigit()))
            mooe = [w for w in line_words if 380 <= w[0] < 447 and AMOUNT.fullmatch(w[4])]
            total = [w for w in line_words if 523 <= w[0] < 596 and AMOUNT.fullmatch(w[4])]
            if not mooe and not total:
                if label:
                    pending.append(label)
                    pending_bbox = line["bbox"]
                continue
            if len(mooe) != 1 or len(total) != 1:
                raise ValueError(f"Unexpected agency amount columns: PDF {pdf_page}, {line['text']!r}")
            parts = pending + ([label] if label else [])
            if not parts:
                raise ValueError(f"Agency amount row without label: PDF {pdf_page}, {line['text']!r}")
            label_bbox = line["bbox"] if label else pending_bbox
            observations.append({
                "label": " ".join(parts), "role": "agency_control",
                "mooe_php": int(mooe[0][4].replace(",", "")),
                "total_php": int(total[0][4].replace(",", "")),
                "source": {"source_pdf": IB.relative_to(ROOT).as_posix(), "pdf_page": pdf_page,
                           "printed_page": pdf_page - 8, "bbox": label_bbox,
                           "mooe_token_bbox": box(mooe[0][:4]),
                           "total_token_bbox": box(total[0][:4])}})
            pending, pending_bbox = [], None
        if pending:
            raise ValueError(f"Unconsumed agency label on PDF {pdf_page}: {pending}")
        return observations

    with pymupdf.open(IB) as doc:
        observations = (read_rows(doc, AGENCY_PAP_PAGE, 185, 425)
                        + read_rows(doc, AGENCY_TOTAL_PAGE, 300, 318))
    seen = collections.Counter(" ".join(o["label"].upper().split()) for o in observations)
    if seen != expected:
        raise ValueError(f"Agency control labels differ from expectations: {dict(seen)}")
    return observations


def key(text):
    return " ".join(text.upper().split())


def validate(rows, pages, tree, agency):
    """Arithmetic, reachability, layout evidence, and agency control checks."""
    errors, rollups = [], []
    by_id = {n["id"]: n for n in tree["nodes"]}
    row_by_id = {r["id"]: r for r in rows}
    if len(by_id) != len(tree["nodes"]) or len(row_by_id) != len(rows):
        errors.append("duplicate_node_or_row_id")
    ownership = collections.Counter(n["source"]["row_id"] for n in tree["nodes"]
                                    if n["kind"] != "annex_program")
    if set(ownership) != set(row_by_id) or any(v != 1 for v in ownership.values()):
        errors.append("source_amount_row_coverage_or_ownership")
    expected_parents, current_subprogram = {}, None
    for row in rows:
        if row["role"] == "subprogram_control":
            current_subprogram = row["id"]
        expected_parents[row["id"]] = current_subprogram
    for n in tree["nodes"]:
        if n["kind"] == "annex_program":
            continue
        row = row_by_id.get(n["source"]["row_id"])
        if (not row or n["printed_amount_php"] != row["amount_php"]
                or n["label_raw"] != row_label_raw(row) or n["kind"] != row["role"]
                or n["source"]["pdf_page"] != row["pdf_page"]):
            errors.append(f"native_layout_evidence_disagreement:{n['id']}")
        elif row["role"] == "project" and not n.get("subprogram_label"):
            errors.append(f"missing_subprogram_label:{n['id']}")
        elif row["role"] == "project" and n["parent_id"] != expected_parents.get(n["source"]["row_id"]):
            errors.append(f"printed_heading_parent_disagreement:{n['id']}")
    for page in pages:
        page_rows = [r for r in rows if r["pdf_page"] == page["pdf_page"]]
        if [r["id"] for r in page_rows] != page["source_row_ids"]:
            errors.append(f"source_table_row_coverage:{page['pdf_page']}")
        indices = [index for r in page_rows
                   for line in r["title_lines"] + r["continuation_lines"]
                   for index in line["word_indices"]]
        if sorted(indices) != page["content_word_indices"] or len(indices) != len(set(indices)):
            errors.append(f"source_word_coverage_or_ownership:{page['pdf_page']}")
    title_line = pages[0]["annex_title"]
    if title_line["text"] != tree["nodes"][0]["label"] or \
            title_line["bbox"] != tree["nodes"][0]["source"]["bbox"]:
        errors.append("annex_title_evidence_disagreement")

    visited = collections.Counter()

    def walk(node_id, ancestors):
        if node_id in ancestors or node_id not in by_id:
            errors.append(f"cycle_or_unknown_node:{node_id}")
            return 0
        visited[node_id] += 1
        node = by_id[node_id]
        children = [by_id[c] for c in node["child_ids"] if c in by_id]
        for child in children:
            if child["parent_id"] != node_id:
                errors.append(f"parent_link_disagreement:{child['id']}")
            if (node["kind"], child["kind"]) not in {
                    ("annex_program", "subprogram_control"),
                    ("annex_program", "program_control"),
                    ("program_control", "subprogram_control"),
                    ("subprogram_control", "project")}:
                errors.append(f"unexpected_hierarchy_kind:{child['id']}")
        if not node["child_ids"]:
            if node["kind"] != "project":
                errors.append(f"childless_control:{node_id}")
            return node["printed_amount_php"]
        total = sum(walk(c, ancestors | {node_id}) for c in node["child_ids"])
        immediate = sum(c["printed_amount_php"] for c in children
                        if c["printed_amount_php"] is not None)
        if node["kind"] == "subprogram_control":
            check = {"node_id": node_id, "label": node["label"],
                     "printed_amount_php": node["printed_amount_php"],
                     "immediate_children_sum_php": immediate,
                     "recursive_project_sum_php": total,
                     "direct_difference_php": immediate - node["printed_amount_php"],
                     "recursive_difference_php": total - node["printed_amount_php"],
                     "project_count": len(children)}
            check["passed"] = check["direct_difference_php"] == check["recursive_difference_php"] == 0
            rollups.append(check)
            if not check["passed"]:
                errors.append(f"control_sum_disagreement:{node_id}")
        else:
            node["derived_amount_php"] = total
        return total

    recursive_total = walk(tree["root_id"], set())
    if set(visited) != set(by_id) or any(count != 1 for count in visited.values()):
        errors.append("tree_reachability_or_duplicate_consumption")
    projects = [n for n in tree["nodes"] if n["kind"] == "project"]
    ledger_total = sum(n["printed_amount_php"] for n in projects)
    if ledger_total != recursive_total:
        errors.append("independent_project_ledger_disagreement")
    root = by_id[tree["root_id"]]
    if root.get("derived_amount_php") != ledger_total:
        errors.append("annex_root_derived_total_disagreement")

    subprograms = {key(n["label"]): n for n in tree["nodes"]
                   if n["kind"] == "subprogram_control"}
    program = next(n for n in tree["nodes"] if n["kind"] == "program_control")
    restoration_sum = sum(by_id[i]["printed_amount_php"] for i in root["child_ids"]
                          if by_id[i]["kind"] == "subprogram_control")
    development_sum = sum(by_id[c]["printed_amount_php"] for c in program["child_ids"])
    carp = AGENCY_ONLY_CARP_OTHER_IRRIGATION_PHP
    agency_checks, carp_rows = [], []
    for obs in agency:
        label = key(obs["label"])
        record = {**obs, "annex_total_php": None, "difference_php": None,
                  "passed": False, "note": None}
        if label == "TOTAL NEW APPROPRIATIONS":
            record["passed"] = obs["mooe_php"] == obs["total_php"]
            record["note"] = "scope context: annex is not the whole NIA appropriation"
        elif label == "SUB-TOTAL, OPERATIONS":
            expected = restoration_sum + development_sum + carp
            record.update(annex_total_php=expected,
                          difference_php=obs["total_php"] - expected,
                          note="annex programs plus the agency-only CARP Other Irrigation row")
            record["passed"] = (record["difference_php"] == 0
                                and obs["mooe_php"] == obs["total_php"])
        elif label == "IRRIGATION SYSTEMS RESTORATION PROGRAM":
            record.update(annex_total_php=restoration_sum,
                          difference_php=obs["total_php"] - restoration_sum,
                          note="sum of the three annex sub-programs printed before the Development heading")
            record["passed"] = (record["difference_php"] == 0
                                and obs["mooe_php"] == obs["total_php"])
        elif label == "IRRIGATION SYSTEMS DEVELOPMENT PROGRAM":
            expected = development_sum + carp
            record.update(annex_total_php=development_sum,
                          difference_php=obs["total_php"] - expected,
                          note="annex Development group plus the agency-only CARP row")
            record["passed"] = (record["difference_php"] == 0
                                and obs["mooe_php"] == obs["total_php"])
        else:
            alias = AGENCY_LABEL_ALIASES.get(label, label)
            targets = [n for k, n in subprograms.items() if k in {label, alias}]
            if len(targets) != 1:
                errors.append(f"unmatched_agency_control:{obs['label']}")
                agency_checks.append(record)
                continue
            target = targets[0]
            if obs["total_php"] == target["printed_amount_php"]:
                record.update(annex_total_php=target["printed_amount_php"],
                              difference_php=obs["total_php"] - target["printed_amount_php"])
                record["passed"] = (record["difference_php"] == 0
                                    and obs["mooe_php"] == obs["total_php"])
            else:
                record.update(
                    passed=obs["total_php"] == carp,
                    note="agency-only scope: not printed as an annex sub-program; "
                         "special provision 3 links this row to CARP")
                carp_rows.append(record)
        if not record["passed"]:
            errors.append(f"agency_control_disagreement:{obs['label']}")
        agency_checks.append(record)
    if len(agency_checks) != 11 or len(carp_rows) != 1 or not carp_rows[0]["passed"]:
        errors.append("agency_control_coverage")

    duplicates = collections.defaultdict(list)
    for project in projects:
        duplicates[project["label"]].append(project["id"])
    return {"passed": not errors, "errors": errors, "summary": {
                "detail_pages": len(pages), "source_table_rows": len(rows),
                "row_role_counts": dict(collections.Counter(r["role"] for r in rows)),
                "content_words_accounted_for": sum(len(p["content_word_indices"]) for p in pages),
                "furniture_words_accounted_for": sum(len(p["furniture_words"]) for p in pages),
                "nodes": len(by_id), "projects": len(projects),
                "subprograms": len(rollups),
                "project_ledger_total_php": ledger_total,
                "recursive_project_total_php": recursive_total,
                "internal_control_checks": len(rollups),
                "failed_internal_controls": sum(not c["passed"] for c in rollups),
                "agency_control_checks": len(agency_checks),
                "failed_agency_controls": sum(not c["passed"] for c in agency_checks),
                "agency_only_carp_rows": len(carp_rows),
                "title_numeric_token_rows": sum(bool(r["title_numeric_tokens"]) for r in rows)},
            "rollup_checks": rollups, "agency_checks": agency_checks,
            "repeated_title_groups": [{"title": title, "project_ids": ids}
                                      for title, ids in duplicates.items() if len(ids) > 1],
            "title_numeric_tokens": [{"row_id": r["id"], "tokens": r["title_numeric_tokens"]}
                                     for r in rows if r["title_numeric_tokens"]],
            "source_evidence": {"method": "native words grouped by indent, bold headings, "
                                          "and a right-aligned amount column",
                                "all_rows_individually_image_reviewed": False,
                                "comparison_ready": False}}


def csv_text(records, fields):
    stream = io.StringIO(newline="")
    writer = csv.DictWriter(stream, fieldnames=fields, lineterminator="\n")
    writer.writeheader()
    writer.writerows(records)
    return stream.getvalue()


def build():
    metadata = {"schema_version": 1, "fiscal_year": 2027, "currency": "PHP",
                "source_unit": "pesos", "unit_multiplier": 1,
                "document": "HB 10858 General Appropriations Bill, local HB_BUDGET copy",
                "legislative_stage": "not_independently_authenticated",
                "scope": "NIA FY 2027 Irrigation Program detailed annex (printed 874-919); "
                         "not the whole NIA appropriation of PHP 45,172,024,000 and not the "
                         "agency's separately listed major locally-funded and foreign-assisted "
                         "projects",
                "source_pdf": IB.relative_to(ROOT).as_posix(), "source_sha256": sha(IB),
                "source_pdf_pages": [ANNEX_FIRST, ANNEX_LAST],
                "source_printed_pages": [ANNEX_FIRST - PRINTED_OFFSET, ANNEX_LAST - PRINTED_OFFSET],
                "agency_control_pdf_pages": sorted({AGENCY_PAP_PAGE, AGENCY_TOTAL_PAGE}),
                "extractor_sha256": sha(__file__), "pymupdf_version": pymupdf.VersionBind,
                "ids": "source-artifact-local page and layout row identifiers; "
                       "not cross-document project identities"}
    with pymupdf.open(IB) as doc:
        rows, pages = extract_rows(doc)
    tree = build_tree(rows, pages[0]["annex_title"])
    agency = agency_controls()
    audit = validate(rows, pages, tree, agency)
    projects = [n for n in tree["nodes"] if n["kind"] == "project"]
    flat = [{"id": p["id"], "subprogram": p["subprogram_label"], "title": p["label"],
             "amount_php": p["printed_amount_php"],
             "source_pdf": p["source"]["source_pdf"], "pdf_page": p["source"]["pdf_page"],
             "printed_page": p["source"]["printed_page"], "row_number": p["source"]["row_number"],
             "parent_id": p["parent_id"], "path": " → ".join(p["path_labels"])} for p in projects]
    subprograms = [{"id": c["node_id"], "subprogram": c["label"],
                    "printed_amount_php": c["printed_amount_php"],
                    "project_count": c["project_count"],
                    "project_sum_php": c["recursive_project_sum_php"],
                    "difference_php": c["recursive_difference_php"]}
                   for c in audit["rollup_checks"]]
    artifacts = {"hgab_nia_tree.json": {"metadata": metadata, **tree},
                 "hgab_nia_source_rows.json": {"metadata": metadata, "pages": pages, "rows": rows},
                 "hgab_nia_audit.json": {"metadata": metadata, **audit}}
    result = {name: json.dumps(value, ensure_ascii=False, indent=2) + "\n"
              for name, value in artifacts.items()}
    result["hgab_nia_projects.csv"] = csv_text(flat, list(flat[0]))
    result["hgab_nia_subprograms.csv"] = csv_text(subprograms, list(subprograms[0]))
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
            raise SystemExit("Missing or stale NIA outputs: " + ", ".join(stale))
    else:
        OUT.mkdir(parents=True, exist_ok=True)
        for name, content in artifacts.items():
            (OUT / name).write_text(content)
    print(json.dumps(audit["summary"], indent=2))
    print("Deterministic output check passed." if args.check
          else "NIA artifacts written; all required accounting/coverage checks passed.")


if __name__ == "__main__":
    main()
