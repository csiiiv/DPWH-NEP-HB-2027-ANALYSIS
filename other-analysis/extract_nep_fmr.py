#!/usr/bin/env python3
"""Extract the supplied NEP FY 2027 FMR annex using raster rules and its existing OCR words.

This profile covers standalone FMR PDF 1–47 and Volume I controls 169–170.
Amounts stay in integer PHP. OCR amount decorations have explicit image-reviewed lineage.
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

import cv2
import numpy as np
import pymupdf

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "dbm-other-nep-line-data/FMR.pdf"
VOLUME = ROOT / "dbm-nep-data/NEP-2027-VOLUME-1_OCR.pdf"
OUT = Path(__file__).resolve().parent / "data"
AMOUNT = re.compile(r"\d{1,3}(?:,\d{3})+")
REGION = re.compile(r"^(?:REGION [IVX]+[AB]?\b|CORDILLERA ADMINISTRATIVE REGION|NEGROS ISLAND REGION)", re.I)
MARKER = re.compile(r"\b(?P<role>ISTART|STARTt?|STAR|END)(?P<section>\s*\([^)]*\))?\s*:", re.I)
PAIR = re.compile(r"([+-]?\d+\.\d+)\s*[°`]?\s*([NS]?)\s*[,;]\s*([+-]?\d+\.\d+)\s*[°`]?\s*([EW]?)", re.I)
RASTER_SCALE = 2
# These are OCR decorations, verified against rendered amount cells. No digit
# replacement is allowed, and raw tokens remain in the source-row artifact.
AMOUNT_DECORATIONS = {
    (19, 12): ("11,000,000}", "11,000,000"),
    (20, 5): ("15,125,000(", "15,125,000"),
    (26, 8): ("15,000,000(", "15,000,000"),
    (40, 14): ("10,000,000|", "10,000,000"),
}


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def box(values):
    return [round(v, 4) for v in values]


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


def raster_boundaries(page, pdf_page):
    """Recover scan rules at 144 dpi, allowing minor scan skew.

    Morphology removes text, then connected components recover long rules.
    Page 28's last row is visibly open: its bottom is the vertical-rule extent,
    recorded as a separate boundary basis rather than a printed horizontal rule.
    """
    pix = page.get_pixmap(matrix=pymupdf.Matrix(RASTER_SCALE, RASTER_SCALE),
                          colorspace=pymupdf.csGRAY)
    gray = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width)
    ink = (gray < 170).astype(np.uint8) * 255
    horizontal = cv2.morphologyEx(cv2.dilate(ink, np.ones((5, 1), np.uint8)),
                                 cv2.MORPH_OPEN, np.ones((1, 700), np.uint8))
    vertical = cv2.morphologyEx(cv2.dilate(ink, np.ones((1, 5), np.uint8)),
                               cv2.MORPH_OPEN, np.ones((600, 1), np.uint8))
    def components(mask, axis):
        _, _, stats, centres = cv2.connectedComponentsWithStats(mask)
        return [(float(c[axis]) / RASTER_SCALE, s)
                for s, c in zip(stats[1:], centres[1:])
                if s[2 if axis == 1 else 3] > 850]
    hs, vs = components(horizontal, 1), components(vertical, 0)
    ys, xs = sorted(c for c, _ in hs), sorted(c for c, _ in vs)
    basis = ["raster_horizontal_rule"] * len(ys)
    if len(xs) != 3 or len(ys) < 3:
        raise ValueError(f"Unexpected raster table on PDF {pdf_page}: {xs}, {ys}")
    if pdf_page == 28:
        bottom = min((int(s[1]) + int(s[3])) / RASTER_SCALE for _, s in vs)
        if not 40 < bottom - ys[-1] < 60:
            raise ValueError("Page 28 open-bottom row geometry changed")
        ys.append(bottom)
        basis.append("vertical_rule_extent_open_bottom_image_reviewed")
    return xs, ys, basis


def extract_rows(doc):
    rows, pages = [], []
    if len(doc) != 47:
        raise ValueError("Expected the supplied 47-page standalone FMR annex")
    mappings = printed_page_mappings()
    for pdf_page in range(1, 48):
        page = doc[pdf_page - 1]
        xs, ys, boundary_basis = raster_boundaries(page, pdf_page)
        cells = [([], []) for _ in range(len(ys) - 1)]
        words = [(*w, i) for i, w in enumerate(page.get_text("words"))]
        table_indices, outside_amounts, outside_words = [], [], []
        for word in words:
            x, y = (word[0] + word[2]) / 2, (word[1] + word[3]) / 2
            if xs[0] - 1 <= x <= xs[-1] + 1 and ys[0] <= y < ys[-1]:
                row_number = bisect.bisect_right(ys, y) - 1
                cells[row_number][int(x > xs[1])].append(word)
                table_indices.append(word[-1])
            else:
                outside_words.append({"text": word[4], "bbox": box(word[:4]), "word_index": word[-1]})
                if re.search(r"\d{1,3}(?:,\d{3}){2,}", word[4]):
                    outside_amounts.append(outside_words[-1])
        printed = pdf_page + 1510
        page_rows = []
        for index, (labels, amounts) in enumerate(cells, 1):
            label_lines, amount_lines = visual_lines(labels), visual_lines(amounts)
            label = "\n".join(line["text"] for line in label_lines)
            amount = " ".join(line["text"] for line in amount_lines)
            amount_value, repair = amount, None
            if (pdf_page, index) in AMOUNT_DECORATIONS:
                expected_raw, amount_value = AMOUNT_DECORATIONS[pdf_page, index]
                if amount != expected_raw:
                    raise ValueError(f"Reviewed OCR amount token changed: {pdf_page}, {index}, {amount!r}")
                repair = {"rule": "ocr_trailing_non_numeric_decoration_removed",
                          "raw": amount, "interpreted": amount_value,
                          "evidence": "rendered amount cell reviewed; digits unchanged"}
            if pdf_page == 1 and index == 1:
                if "DEPARTMENT OF AGRICULTURE" not in label or amount:
                    raise ValueError("Unexpected opening annex heading")
                role = "annex_heading"
            elif "NAME OF PROJECTS" in label:
                if "PROJECTS" not in label or "PESOS" not in amount:
                    raise ValueError(f"Unexpected column header on PDF {pdf_page}")
                role = "column_header"
            elif not label and not amount:
                role = "blank_spacer"
            elif not label or not AMOUNT.fullmatch(amount_value) or len(amounts) != 1:
                raise ValueError(f"Incomplete or ambiguous cell on PDF {pdf_page}, row {index}: {label!r}, {amount!r}")
            elif label.startswith("REPAIR/REHABILITATION"):
                role = "program_control"
            elif REGION.match(label):
                role = "region_control"
            else:
                role = "project"
            row = {"id": f"nep_fmr:p{pdf_page}:r{index}", "pdf_page": pdf_page,
                   "printed_page": printed, "table_row": index, "role": role,
                   "bbox": box([xs[0], ys[index - 1], xs[-1], ys[index]]),
                   "label_cell_bbox": box([xs[0], ys[index - 1], xs[1], ys[index]]),
                   "amount_cell_bbox": box([xs[1], ys[index - 1], xs[-1], ys[index]]),
                   "label_raw": label, "amount_raw": amount,
                   "amount_php": int(amount_value.replace(",", "")) if AMOUNT.fullmatch(amount_value) else None,
                   "amount_interpretation": repair,
                   "label_lines": label_lines, "amount_lines": amount_lines}
            rows.append(row)
            page_rows.append(row["id"])
        pages.append({"pdf_page": pdf_page, "printed_page": printed,
                      "printed_page_evidence": mappings[pdf_page - 1],
                      "page_size": box([page.rect.width, page.rect.height]),
                      "column_boundaries_x": box(xs), "row_boundaries_y": box(ys),
                      "row_boundary_basis": boundary_basis,
                      "source_row_ids": page_rows,
                      "source_word_count": len(words), "outside_table_words": outside_words,
                      "table_word_indices": sorted(table_indices),
                      "outside_table_amount_tokens": outside_amounts})
    return rows, pages


def printed_page_mappings():
    """The full-volume OCR retains running page numbers omitted by FMR.pdf."""
    result = []
    with pymupdf.open(VOLUME) as doc:
        for standalone_page in range(1, 48):
            full_page, printed = standalone_page + 1534, standalone_page + 1510
            tokens = [(*w, i) for i, w in enumerate(doc[full_page - 1].get_text("words"))
                      if (w[1] < 45 or w[1] > 800) and w[4] == str(printed)]
            if len(tokens) != 1:
                raise ValueError(f"Unsupported NEP printed pagination on Volume I PDF {full_page}")
            result.append({"source_pdf": VOLUME.relative_to(ROOT).as_posix(),
                           "pdf_page": full_page, "printed_page": printed,
                           "page_number_token_bbox": box(tokens[0][:4]),
                           "mapping_basis": "matching FMR annex sequence and full-volume running page number"})
    return result


def coordinate_fields(label_raw):
    """Preserve all coordinate text; parse only unambiguous decimal pairs.

    Multi-section, DMS, station-labelled, malformed and reversed pairs remain raw.
    Parsed values are syntax candidates, never geospatial certification.
    """
    lines = label_raw.splitlines()
    coordinate_start = next((i for i, line in enumerate(lines)
                             if re.search(r"\b(?:ISTART|STARTT?|STAR|END)\b", line, re.I)
                             or re.match(r"^(?:STA[.:]|LAT\s*:)", line, re.I)), len(lines))
    title = " ".join(lines[:coordinate_start])
    raw = "\n".join(lines[coordinate_start:])
    matches = list(MARKER.finditer(raw))
    observations, flags = [], []
    for i, match in enumerate(matches):
        value = raw[match.end():matches[i + 1].start() if i + 1 < len(matches) else len(raw)].strip()
        role = match["role"].upper()
        observation = {"role": "start" if role != "END" else "end",
                       "marker_raw": match.group(0), "section_raw": (match["section"] or "").strip() or None,
                       "value_raw": value, "parsed_decimal_pair": None, "flags": []}
        if role not in {"START", "END"}:
            observation["flags"].append("nonstandard_endpoint_marker")
        pair = PAIR.fullmatch(value)
        if pair:
            lat, lon = float(pair[1]), float(pair[3])
            if pair[2].upper() == "S":
                lat = -abs(lat)
            if pair[4].upper() == "W":
                lon = -abs(lon)
            if not (-90 <= lat <= 90 and -180 <= lon <= 180):
                observation["flags"].append("out_of_range_or_reversed_decimal_pair")
            else:
                observation["parsed_decimal_pair"] = {"latitude": lat, "longitude": lon}
                if not (4 <= lat <= 22 and 116 <= lon <= 127):
                    observation["flags"].append("outside_philippines_orientation_bounds")
        else:
            observation["flags"].append("coordinate_format_needs_review")
        observations.append(observation)
    if not matches:
        flags.append("no_explicit_start_end_markers")
    counts = collections.Counter(o["role"] for o in observations)
    if counts["start"] != 1 or counts["end"] != 1:
        flags.append("endpoint_count_or_section_structure_needs_review")
    if any(o["section_raw"] for o in observations):
        flags.append("section_specific_endpoints")
    flags.extend(flag for observation in observations for flag in observation["flags"])
    return {"title": title, "coordinates_raw": raw, "coordinate_observations": observations,
            "coordinate_review_flags": sorted(set(flags)),
            "coordinate_status": "needs_review" if flags else "decimal_pair_candidates"}


def build_tree(rows):
    nodes, root, region = [], None, None
    for row in rows:
        if row["role"] not in {"program_control", "region_control", "project"}:
            continue
        kind = row["role"]
        node = {"id": row["id"], "kind": kind, "parent_id": None, "child_ids": [],
                "label": " ".join(row["label_raw"].splitlines()), "label_raw": row["label_raw"],
                "printed_amount_php": row["amount_php"], "derived": False,
                "source": {"source_pdf": SOURCE.relative_to(ROOT).as_posix(),
                           "row_id": row["id"], "pdf_page": row["pdf_page"],
                           "printed_page": row["printed_page"], "table_row": row["table_row"],
                           "bbox": row["bbox"], "amount_cell_bbox": row["amount_cell_bbox"]},
                "source_evidence_status": "ocr_words_in_raster_ruled_cell",
                "image_review_status": "not_individually_reviewed"}
        node["amount_interpretation"] = row["amount_interpretation"]
        if row["amount_interpretation"]:
            node["image_review_status"] = "amount_cell_reviewed"
        if kind == "program_control":
            if root is not None:
                raise ValueError("Multiple FMR program controls; inspect the source profile")
            root = node
        elif kind == "region_control":
            if root is None:
                raise ValueError("Region without a program control")
            node["parent_id"] = root["id"]
            root["child_ids"].append(node["id"])
            region = node
        else:
            if region is None:
                raise ValueError("Project without a printed region")
            node["parent_id"] = region["id"]
            region["child_ids"].append(node["id"])
            node["region_label"] = region["label"]
            node.update(coordinate_fields(row["label_raw"]))
            node["label"] = node["title"]
        nodes.append(node)
    if root is None:
        raise ValueError("No FMR program control")
    by_id = {node["id"]: node for node in nodes}
    for node in nodes:
        node["path_ids"], node["path_labels"] = [], []
        current = node
        while current:
            node["path_ids"].insert(0, current["id"])
            node["path_labels"].insert(0, current["label"])
            current = by_id.get(current["parent_id"])
    return {"root_id": root["id"], "nodes": nodes}


def cross_volume_controls(tree):
    """Read Volume I CO/Total independently; office echoes are not allocations."""
    observations = []
    with pymupdf.open(VOLUME) as doc:
        for pdf_page, low, high in [(169, 165, 725), (170, 50, 225)]:
            page = doc[pdf_page - 1]
            shift = 0 if pdf_page == 169 else -27
            words = [(*w, i) for i, w in enumerate(page.get_text("words"))
                     if 110 + shift < w[0] < 678 + shift and low <= w[1] <= high]
            pending_title = []
            for line in visual_lines(words):
                line_words = [w for w in words if w[-1] in line["word_indices"]]
                label = " ".join(w[4] for w in sorted(line_words, key=lambda w: w[0]) if w[0] < 400 + shift)
                co = [w for w in line_words if 497 + shift <= w[0] < 592 + shift]
                total = [w for w in line_words if 592 + shift <= w[0] < 678 + shift]
                if not co and not total:
                    if label:
                        pending_title.append(label)
                    continue
                # OCR sometimes emits spaces as separate tokens within one amount.
                co_raw = " ".join(w[4] for w in sorted(co, key=lambda w: w[0]))
                total_raw = " ".join(w[4] for w in sorted(total, key=lambda w: w[0]))
                co_value, total_value = re.sub(r"\s", "", co_raw), re.sub(r"\s", "", total_raw)
                if not AMOUNT.fullmatch(co_value) or not AMOUNT.fullmatch(total_value):
                    raise ValueError(f"Unexpected NEP FMR amount columns: {pdf_page}, {line}")
                if label == "Designated Key Production Areas":
                    label = " ".join(pending_title + [label])
                    source_box = box([142, 165, 678, 196])
                    role = "program_control"
                elif REGION.match(label):
                    source_box, role = line["bbox"], "region_control"
                elif label.lstrip("_").startswith("Regional Field Unit"):
                    source_box, role = line["bbox"], "office_control_echo"
                else:
                    raise ValueError(f"Unexpected NEP FMR label: {label}")
                observations.append({"label": label, "role": role, "co_php": int(co_value.replace(",", "")),
                                     "total_php": int(total_value.replace(",", "")),
                                     "co_raw": co_raw, "total_raw": total_raw,
                                     "amount_interpretation": "intra_amount_OCR_whitespace_removed",
                                     "source": {"source_pdf": VOLUME.relative_to(ROOT).as_posix(),
                                                "pdf_page": pdf_page, "printed_page": pdf_page - 24,
                                                "bbox": source_box,
                                                "co_token_bboxes": [box(w[:4]) for w in co],
                                                "total_token_bboxes": [box(w[:4]) for w in total]}})
                pending_title = []
    def key(label):
        if re.match(r"REGION\s+([IVX]+[AB]?)", label, re.I):
            return re.match(r"REGION\s+([IVX]+[AB]?)", label, re.I)[1].upper()
        if label.upper().startswith("CORDILLERA"):
            return "CAR"
        if label.upper().startswith("NEGROS"):
            return "NIR"
        return "program"
    controls = {key(n["label"]): n for n in tree["nodes"] if n["kind"] != "project"}
    previous = None
    for obs in observations:
        if obs["role"] == "office_control_echo":
            target = previous
        else:
            target = controls.get(key(obs["label"]))
            previous = target
        if target is None:
            raise ValueError(f"Unmatched NEP FMR control: {obs['label']}")
        obs["annex_node_id"] = target["id"]
        obs["difference_php"] = obs["total_php"] - target["printed_amount_php"]
        obs["passed"] = obs["difference_php"] == 0 and obs["co_php"] == obs["total_php"]
    return observations


def validate(rows, pages, tree, cross_checks):
    """Arithmetic, reachability, cell evidence, and row/token ownership checks."""
    errors, rollups = [], []
    by_id = {n["id"]: n for n in tree["nodes"]}
    row_by_id = {r["id"]: r for r in rows}
    if len(by_id) != len(tree["nodes"]) or len(row_by_id) != len(rows):
        errors.append("duplicate_node_or_row_id")
    expected = [r for r in rows if r["role"] in {"program_control", "region_control", "project"}]
    expected_parents, source_root, source_region = {}, None, None
    for row in expected:
        if row["role"] == "program_control":
            expected_parents[row["id"]] = None
            source_root = row["id"]
        elif row["role"] == "region_control":
            expected_parents[row["id"]] = source_root
            source_region = row["id"]
        else:
            expected_parents[row["id"]] = source_region
    ownership = collections.Counter(n["source"]["row_id"] for n in tree["nodes"])
    if set(ownership) != {r["id"] for r in expected} or any(v != 1 for v in ownership.values()):
        errors.append("source_amount_row_coverage_or_ownership")
    for n in tree["nodes"]:
        row = row_by_id.get(n["source"]["row_id"])
        if not row or n["printed_amount_php"] != row["amount_php"] or n["label_raw"] != row["label_raw"] or n["kind"] != row["role"]:
            errors.append(f"source_cell_evidence_disagreement:{n['id']}")
        elif n["source"]["bbox"] != row["bbox"] or n["source"]["amount_cell_bbox"] != row["amount_cell_bbox"] or n["source"]["pdf_page"] != row["pdf_page"]:
            errors.append(f"source_geometry_disagreement:{n['id']}")
        if n["parent_id"] != expected_parents.get(n["id"]):
            errors.append(f"printed_heading_parent_disagreement:{n['id']}")
        if (n["source"]["source_pdf"] != SOURCE.relative_to(ROOT).as_posix()
                or n["source"]["printed_page"] != n["source"]["pdf_page"] + 1510
                or not row or n.get("amount_interpretation") != row.get("amount_interpretation")):
            errors.append(f"source_provenance_disagreement:{n['id']}")
        if row and n["kind"] == "project":
            fields = coordinate_fields(row["label_raw"])
            if any(n.get(key) != value for key, value in fields.items()):
                errors.append(f"title_or_coordinate_ownership_disagreement:{n['id']}")
    for page in pages:
        page_rows = [r for r in rows if r["pdf_page"] == page["pdf_page"]]
        if [r["id"] for r in page_rows] != page["source_row_ids"]:
            errors.append(f"source_table_row_coverage:{page['pdf_page']}")
        indices = [index for r in page_rows for line in r["label_lines"] + r["amount_lines"] for index in line["word_indices"]]
        if sorted(indices) != page["table_word_indices"] or len(indices) != len(set(indices)):
            errors.append(f"source_word_coverage_or_ownership:{page['pdf_page']}")
        all_indices = indices + [w["word_index"] for w in page["outside_table_words"]]
        if sorted(all_indices) != list(range(page["source_word_count"])):
            errors.append(f"all_page_word_coverage:{page['pdf_page']}")
        mapping = page["printed_page_evidence"]
        if (mapping["pdf_page"] != page["pdf_page"] + 1534
                or mapping["printed_page"] != page["printed_page"]):
            errors.append(f"printed_page_mapping_disagreement:{page['pdf_page']}")
        for row in page_rows:
            if row["amount_php"] is None:
                continue
            interpreted = row["amount_raw"]
            repair = row["amount_interpretation"]
            if repair:
                expected = AMOUNT_DECORATIONS.get((row["pdf_page"], row["table_row"]))
                if expected != (repair["raw"], repair["interpreted"]) or repair["raw"] != interpreted:
                    errors.append(f"amount_repair_lineage_disagreement:{row['id']}")
                interpreted = repair["interpreted"]
            if not AMOUNT.fullmatch(interpreted) or int(interpreted.replace(",", "")) != row["amount_php"]:
                errors.append(f"raw_amount_disagreement:{row['id']}")
        if page["outside_table_amount_tokens"]:
            errors.append(f"unexplained_amount_tokens:{page['pdf_page']}")
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
            if (node["kind"], child["kind"]) not in {("program_control", "region_control"), ("region_control", "project")}:
                errors.append(f"unexpected_hierarchy_kind:{child['id']}")
        if not node["child_ids"]:
            if node["kind"] != "project":
                errors.append(f"childless_control:{node_id}")
            return node["printed_amount_php"]
        total = sum(walk(c, ancestors | {node_id}) for c in node["child_ids"])
        immediate = sum(c["printed_amount_php"] for c in children)
        check = {"node_id": node_id, "label": node["label"], "printed_amount_php": node["printed_amount_php"],
                 "immediate_children_sum_php": immediate, "recursive_project_sum_php": total,
                 "direct_difference_php": immediate - node["printed_amount_php"],
                 "recursive_difference_php": total - node["printed_amount_php"],
                 "project_count": len(children) if node["kind"] == "region_control" else None}
        check["passed"] = check["direct_difference_php"] == check["recursive_difference_php"] == 0
        rollups.append(check)
        if not check["passed"]:
            errors.append(f"control_sum_disagreement:{node_id}")
        return total
    recursive_total = walk(tree["root_id"], set())
    if set(visited) != set(by_id) or any(count != 1 for count in visited.values()):
        errors.append("tree_reachability_or_duplicate_consumption")
    projects = [n for n in tree["nodes"] if n["kind"] == "project"]
    ledger_total = sum(n["printed_amount_php"] for n in projects)
    if ledger_total != recursive_total:
        errors.append("independent_project_ledger_disagreement")
    if len([c for c in cross_checks if c["role"] != "office_control_echo"]) != len(rollups):
        errors.append("cross_volume_control_coverage")
    control_ids = collections.Counter(c["annex_node_id"] for c in cross_checks if c["role"] != "office_control_echo")
    if control_ids != collections.Counter(c["node_id"] for c in rollups):
        errors.append("cross_volume_control_ownership")
    echo_ids = collections.Counter(c["annex_node_id"] for c in cross_checks if c["role"] == "office_control_echo")
    if echo_ids != collections.Counter(n["id"] for n in tree["nodes"] if n["kind"] == "region_control"):
        errors.append("cross_volume_office_echo_coverage")
    cross_failures = []
    for check in cross_checks:
        target = by_id.get(check["annex_node_id"])
        if (not target or not check["passed"] or check["co_php"] != check["total_php"]
                or check["total_php"] != target["printed_amount_php"]
                or check["difference_php"] != check["total_php"] - target["printed_amount_php"]):
            cross_failures.append(check)
            errors.append(f"cross_volume_control_disagreement:{check['label']}")
        for column in ["co", "total"]:
            raw = re.sub(r"\s", "", check[column + "_raw"])
            if not AMOUNT.fullmatch(raw) or int(raw.replace(",", "")) != check[column + "_php"]:
                errors.append(f"cross_volume_raw_amount_disagreement:{check['label']}:{column}")
    duplicates = collections.defaultdict(list)
    for project in projects:
        duplicates[project["title"]].append(project["id"])
    return {"passed": not errors, "errors": errors, "summary": {
                "detail_pages": len(pages), "source_table_rows": len(rows),
                "row_role_counts": dict(collections.Counter(r["role"] for r in rows)),
                "table_words_accounted_for": sum(len(p["table_word_indices"]) for p in pages),
                "nodes": len(by_id), "projects": len(projects), "regions": len(rollups) - 1,
                "project_ledger_total_php": ledger_total, "recursive_project_total_php": recursive_total,
                "internal_control_checks": len(rollups), "failed_internal_controls": sum(not c["passed"] for c in rollups),
                "cross_volume_control_checks": sum(c["role"] != "office_control_echo" for c in cross_checks),
                "cross_volume_office_echo_checks": sum(c["role"] == "office_control_echo" for c in cross_checks),
                "failed_cross_volume_checks": len(cross_failures),
                "coordinate_review_projects": sum(bool(p["coordinate_review_flags"]) for p in projects)},
            "rollup_checks": rollups, "cross_volume_checks": cross_checks,
            "amount_interpretations": [{"row_id": r["id"], **r["amount_interpretation"]}
                                       for r in rows if r["amount_interpretation"]],
            "repeated_title_groups": [{"title": title, "project_ids": ids} for title, ids in duplicates.items() if len(ids) > 1],
            "source_evidence": {"method": "existing OCR words assigned by centres to page-specific raster ruled cells",
                                "rendered_spot_check_pdf_pages": [1, 19, 20, 26, 28, 40, 47],
                                "spot_check_scope": "boundary/layout checks and selected amount cells; not complete OCR transcription review",
                                "open_bottom_row_id": "nep_fmr:p28:r16",
                                "all_rows_individually_image_reviewed": False,
                                "geographic_coordinates_certified": False,
                                "comparison_ready": False}}


def csv_text(records, fields):
    stream = io.StringIO(newline="")
    writer = csv.DictWriter(stream, fieldnames=fields, lineterminator="\n")
    writer.writeheader()
    writer.writerows(records)
    return stream.getvalue()


def build():
    metadata = {"schema_version": 1, "fiscal_year": 2027, "currency": "PHP", "source_unit": "pesos", "unit_multiplier": 1,
                "document": "National Expenditure Program FY 2027, supplied standalone FMR schedule",
                "legislative_stage": "NEP executive proposal; not an enacted appropriation",
                "scope": "DA locally-funded FMR annex; not the full DA budget or FMR planning/bridges activities",
                "source_pdf": SOURCE.relative_to(ROOT).as_posix(), "source_sha256": sha(SOURCE),
                "source_pdf_pages": [1, 47], "source_printed_pages": [1511, 1557],
                "cross_volume_source_pdf": VOLUME.relative_to(ROOT).as_posix(), "cross_volume_source_sha256": sha(VOLUME),
                "extractor_sha256": sha(__file__), "pymupdf_version": pymupdf.VersionBind,
                "opencv_version": cv2.__version__, "numpy_version": np.__version__,
                "raster_rule_scale": RASTER_SCALE,
                "text_layer": "supplied OCR; no fresh OCR and no title or coordinate corrections",
                "full_volume_annex_pdf_pages": [1535, 1581],
                "cross_volume_control_pdf_pages": [169, 170],
                "cross_volume_control_printed_pages": [145, 146],
                "ids": "source-artifact-local page and ruled row identifiers; not cross-document project identities"}
    with pymupdf.open(SOURCE) as doc:
        rows, pages = extract_rows(doc)
    tree = build_tree(rows)
    checks = cross_volume_controls(tree)
    audit = validate(rows, pages, tree, checks)
    projects = [n for n in tree["nodes"] if n["kind"] == "project"]
    flat = [{"id": p["id"], "region": p["region_label"], "title": p["title"],
             "amount_php": p["printed_amount_php"], "coordinates_raw": p["coordinates_raw"],
             "coordinate_status": p["coordinate_status"], "coordinate_review_flags": " | ".join(p["coordinate_review_flags"]),
             "source_pdf": p["source"]["source_pdf"], "pdf_page": p["source"]["pdf_page"],
             "printed_page": p["source"]["printed_page"], "table_row": p["source"]["table_row"],
             "parent_id": p["parent_id"], "path": " → ".join(p["path_labels"])} for p in projects]
    regions = [{"id": c["node_id"], "region": c["label"], "project_count": c["project_count"],
                "printed_amount_php": c["printed_amount_php"], "project_sum_php": c["recursive_project_sum_php"],
                "difference_php": c["recursive_difference_php"]} for c in audit["rollup_checks"] if c["project_count"] is not None]
    review = [p for p in flat if p["coordinate_review_flags"]]
    artifacts = {"nep_fmr_tree.json": {"metadata": metadata, **tree},
                 "nep_fmr_source_rows.json": {"metadata": metadata, "pages": pages, "rows": rows},
                 "nep_fmr_audit.json": {"metadata": metadata, **audit}}
    result = {name: json.dumps(value, ensure_ascii=False, indent=2) + "\n" for name, value in artifacts.items()}
    result["nep_fmr_projects.csv"] = csv_text(flat, list(flat[0]))
    result["nep_fmr_regions.csv"] = csv_text(regions, list(regions[0]))
    result["nep_fmr_coordinate_review.csv"] = csv_text(review, list(flat[0]))
    return result, audit


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="re-extract and compare deterministic outputs without writing")
    args = parser.parse_args()
    artifacts, audit = build()
    if not audit["passed"]:
        raise SystemExit(json.dumps(audit["errors"], indent=2))
    if args.check:
        stale = [name for name, content in artifacts.items() if not (OUT / name).exists() or (OUT / name).read_text() != content]
        if stale:
            raise SystemExit("Missing or stale FMR outputs: " + ", ".join(stale))
    else:
        OUT.mkdir(parents=True, exist_ok=True)
        for name, content in artifacts.items():
            (OUT / name).write_text(content)
    print(json.dumps(audit["summary"], indent=2))
    print("Deterministic output check passed." if args.check else "FMR artifacts written; all required accounting/coverage checks passed.")


if __name__ == "__main__":
    main()
