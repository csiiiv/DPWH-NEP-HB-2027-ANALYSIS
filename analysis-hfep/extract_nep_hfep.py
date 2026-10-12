#!/usr/bin/env python3
"""Extract the NEP FY 2027 HFEP annex from PaddleOCR PP-StructureV3 supplementary data.

Primary source: ``dbm-other-nep-line-data/HFEP.pdf_by_PP-StructrueV3.json`` — a
PaddleOCR PP-StructureV3 pipeline run over the 13 scanned annex pages (the PDF is
now named ``HFEP_2.pdf``). Each page's ``prunedResult.table_res_list[0]`` carries:

* ``pred_html``           — the recognized table structure,
* ``table_ocr_pred``      — OCR tokens with pixel boxes (2x scale vs PDF points),
* ``cell_box_list``       — per-cell bounding boxes.

The native PDF text layer misreads thousands separators ("920.000"), decorates
cells ("___", "—", "=") and drops digits. PP-StructureV3's independent OCR gives
clean comma-grouped amounts; residual misreads are dashes read as "一/。/·/=/E/0/1/7",
handled as explicit reviewed interpretations and reconciled by row arithmetic
(infrastructure + medical_equipment + motor_vehicle = total) and by the tree's
internal controls. Rows missing from the VL pass (pages 2,5,6,8,9,11,13) are all
present here.

Hierarchy uses token x0 indent ladders (region ≈ 205px, province ≈ 226px,
facility ≈ 247px; page-parity shift of ~ -20px on even pages), verified against
the label grammar.

Cross-controls:
* printed Grand Total row (p13): 7,386,456,000 + 6,834,203,000 + 252,000,000
  = 14,472,659,000;
* DOH HFEP PAP row on Volume II-A PDF 282 (printed 274): MOOE 67,173,000 +
  Capital Outlays 14,472,659,000 = 14,539,832,000;
* PaddleOCR-VL-1.6 markdown tables on pages 1, 3, 4, 7, 10, 12 (structure-level
  agreement for every shared row).

Outputs (analysis-hfep/data/): nep_hfep_facilities.csv, nep_hfep_controls.csv,
nep_hfep_tree.json, nep_hfep_source_rows.json, nep_hfep_audit.json.
"""
import argparse
import collections
import csv
import hashlib
import io
import json
import re
from html.parser import HTMLParser
from pathlib import Path

import pymupdf

ROOT = Path(__file__).resolve().parents[1]
PPS_JSON = ROOT / "dbm-other-nep-line-data/HFEP.pdf_by_PP-StructrueV3.json"
VL_JSON = ROOT / "dbm-other-nep-line-data/HFEP.pdf_by_PaddleOCR-VL-1.6.json"
VOLUME = ROOT / "dbm-nep-data/NEP-2027-VOLUME-2A_OCR.pdf"
OUT = Path(__file__).resolve().parent / "data"

AMOUNT_RE = re.compile(r"\d{1,3}(?:,\d{3})+")
COLUMN_NAMES = ("infrastructure", "medical_equipment", "motor_vehicle", "total")
PRINTED_OFFSET = 718          # printed = standalone + 718; Volume II-A PDF = +726
AGENCY_PAGE = 282
PPS_SCALE = 2.0               # table_ocr_pred boxes are 2x PDF points

# Amount column x0 zones in PPS pixel space (from cluster analysis of all pages):
#   infrastructure 795-855, medical 913-997, motor 1046-1066, total 1177-1260.
COLUMN_X0_ZONES = ((780, 912), (912, 1045), (1045, 1176), (1176, 1320))

# Tokens that PP-StructureV3 reads for the printed "-" dash. Every occurrence is
# recorded verbatim in the source-row artifact and interpreted as a dash only
# because (a) the rendered cell shows a dash and (b) row arithmetic reconciles.
DASH_MISREADS = {"", "-", "=", "—", "–", "一", "。", "·", "_", "二", "E", "|"}
# Single digits are never valid standalone amounts in this annex (min 110,000);
# they appear where PP-StructureV3 split a dash/decoration into its own token.
DASH_LIKE_DIGITS = {"0", "1", "7"}

# Documented printed-document discrepancy: Metro Manila's printed control under
# subcategory 1.d exceeds the sum of its 24 listed facility rows by exactly
# ₱140,000 (medical equipment and grand total; infrastructure and motor vehicle
# reconcile to the peso). The overhang propagates NCR → 1.d → category 1 →
# grand total. Verified against three independent text sources (PP-StructureV3
# tokens with cell boxes, HFEP_2.pdf native text layer, and Volume II-A page 728
# OCR text) plus native-scale glyph comparison of every "140,000" cell in the
# block (all six print 140,000; no 280,000 misread) and uniform row spacing
# (no dropped row). Documented as a published-annex defect, not repaired.
PRINTED_DISCREPANCIES = [{
    "id": "metro_manila_med_overhang_140000",
    "kind": "printed_control_exceeds_children",
    "node_ids": ["nep_hfep:p2:r47", "nep_hfep:p2:r46", "nep_hfep:p2:r45",
                 "nep_hfep:p1:r3", "nep_hfep:p1:title"],
    "columns": {"medical_equipment": 140_000, "total": 140_000},
    "note": "Metro Manila (p2 r47) prints med 31,680,000 / total 47,880,000 but "
            "its 24 listed facilities sum to 31,540,000 / 47,740,000; the "
            "₱140,000 medical-equipment overhang carries through every ancestor "
            "control to the printed grand total. Cross-verified against "
            "HFEP_2.pdf native text, Volume II-A p728 OCR text, and cell-level "
            "glyph inspection; the published annex omits one ₱140,000 facility "
            "row from the Metro Manila block.",
}]


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


# ── PPS table reading ─────────────────────────────────────────────────────

def load_pps_pages():
    with open(PPS_JSON) as f:
        return json.load(f)


def pps_rows(page_item):
    """Rebuild the table grid from table_ocr_pred tokens.

    Rows come from y-centre grouping (12px tolerance at 2x scale); the four
    amount columns from fixed x zones. Returns dicts with raw tokens per column
    plus the label token boxes for indent-based classification.
    """
    tables = page_item["prunedResult"]["table_res_list"]
    if len(tables) != 1:
        raise ValueError("Expected exactly one PPS table per page")
    ocr = tables[0]["table_ocr_pred"]
    tokens = [(txt, box) for txt, box in zip(ocr["rec_texts"], ocr["rec_boxes"])]
    # sort by y then x
    tokens.sort(key=lambda tb: ((tb[1][1] + tb[1][3]) / 2, tb[1][0]))

    rows = []           # each: {"y": float, "label_tokens": [...], "amounts": {col: [tokens]}}
    for txt, box in tokens:
        yc = (box[1] + box[3]) / 2
        if rows and abs(yc - rows[-1]["y"]) < 12:
            row = rows[-1]
        else:
            row = {"y": yc, "label_tokens": [], "amounts": collections.defaultdict(list)}
            rows.append(row)
        x0 = box[0]
        if x0 < COLUMN_X0_ZONES[0][0]:
            row["label_tokens"].append((txt, box))
        else:
            col = next((i for i, (lo, hi) in enumerate(COLUMN_X0_ZONES) if lo <= x0 < hi), None)
            if col is not None:
                row["amounts"][col].append((txt, box))
    return rows


def join_tokens(pairs):
    return " ".join(txt for txt, _ in sorted(pairs, key=lambda tb: tb[1][0])).strip()


def label_x0(label_tokens):
    return min((box[0] for _, box in label_tokens), default=None)


# ── Row interpretation ────────────────────────────────────────────────────

def parse_amount_cell(raw_text):
    """Return (php, interpretation) for one amount cell's joined raw text."""
    raw = raw_text.strip()
    if raw in DASH_MISREADS:
        return None, None
    if raw in DASH_LIKE_DIGITS:
        return None, {"rule": "single_digit_dash_fragment_read_as_dash",
                      "raw": raw, "interpreted": "-"}
    m = AMOUNT_RE.fullmatch(raw)
    if m:
        return int(raw.replace(",", "")), None
    # e.g. "·300,000" — leading punctuation decoration
    stripped = re.sub(r"^[^\d]+", "", raw)
    if AMOUNT_RE.fullmatch(stripped):
        return int(stripped.replace(",", "")), {
            "rule": "leading_punctuation_stripped", "raw": raw, "interpreted": stripped}
    return None, {"rule": "unparseable", "raw": raw, "interpreted": None}


def classify(label, x0, page_num):
    """Role classification: label grammar + x0 indent ladder.

    PPS pixel ladders (from token-cluster analysis, 2x scale):
      odd pages:  region 204-208, province 225-229, facility 246-252
      even pages: region 186-191, province 205-213, facility 227-234
    Categories/subcategories are caught by their numbered grammar first.
    """
    t = label.strip()
    upper = t.upper()
    if upper == "GRAND TOTAL":
        return "grand_total"
    if re.match(r"^\d+\.\s", t):
        return "category"
    if re.match(r"^\d+\.[a-z]", t, re.I):
        return "subcategory"
    if "NAME OF" in upper:
        return "column_header"
    if x0 is None:
        return "ocr_fragment"
    even = page_num % 2 == 0
    region_x, province_x = (196.0, 220.0) if even else (214.0, 238.0)
    if upper in {"CAR", "NCR", "NIR", "BARMM"} or upper.startswith("REGION"):
        # Acronym/"Region N" names are regions only in the region indent zone;
        # e.g. "Region II Trauma and Medical Center" is a facility.
        return "region" if x0 < province_x else "facility"
    if x0 < region_x:
        return "region"
    if x0 < province_x:
        return "province"
    return "facility"


def extract_rows(pps_pages):
    rows = []
    for pg_idx, item in enumerate(pps_pages):
        pdf_page = pg_idx + 1
        for ri, row in enumerate(pps_rows(item), start=1):
            label = join_tokens(row["label_tokens"])
            if not label and not row["amounts"]:
                continue
            x0 = label_x0(row["label_tokens"])
            role = classify(label, x0, pdf_page)
            amounts_raw = {COLUMN_NAMES[c]: join_tokens(toks)
                           for c, toks in row["amounts"].items() if join_tokens(toks)}
            # Word/token indices within this page's ocr stream
            rows.append({
                "id": f"nep_hfep:p{pdf_page}:r{ri}",
                "pdf_page": pdf_page, "printed_page": pdf_page + PRINTED_OFFSET,
                "table_row": ri, "role": role, "label_raw": label,
                "label_x0_pps_px": round(x0, 1) if x0 else None,
                "row_y_pps_px": round(row["y"], 1),
                "amounts_raw": amounts_raw,
            })
    return rows


# ── Amount assignment with arithmetic reconciliation ─────────────────────

def assign_amounts(rows):
    """Parse cells, then reconcile each row's four columns arithmetically.

    total = infrastructure + medical_equipment + motor_vehicle is asserted per
    printed row. Cells are filled by direct parse; when a cell is unparseable
    it is derived from the row identity if exactly one cell is missing. All
    interpretations carry lineage.
    """
    stats = collections.Counter()
    for row in rows:
        if row["role"] in {"column_header", "grand_total"}:
            row["amounts_php"] = {}
            row["amount_interpretations"] = {}
            for name in COLUMN_NAMES:
                raw = row["amounts_raw"].get(name)
                if raw is None:
                    continue
                php, interp = parse_amount_cell(raw)
                if php is not None:
                    row["amounts_php"][name] = php
                if interp:
                    row["amount_interpretations"][name] = interp
            continue
        if row["role"] in {"category", "subcategory", "region", "province", "facility"}:
            php_cells, interps = {}, {}
            for name in COLUMN_NAMES:
                raw = row["amounts_raw"].get(name)
                if raw is None:
                    continue
                php, interp = parse_amount_cell(raw)
                if php is not None:
                    php_cells[name] = php
                if interp:
                    interps[name] = interp
            # Row arithmetic reconciliation
            known = {k: v for k, v in php_cells.items() if k != "total"}
            total_known = php_cells.get("total")
            if total_known is not None and len(known) < 3:
                # missing at most one component → derive it
                missing = [n for n in COLUMN_NAMES[:3] if n not in known]
                if len(missing) == 1:
                    derived = total_known - sum(known.values())
                    if derived >= 0:
                        php_cells[missing[0]] = derived
                        interps[missing[0]] = {
                            "rule": "derived_from_row_identity_total_minus_components",
                            "raw": row["amounts_raw"].get(missing[0]),
                            "interpreted": str(derived)}
                        stats["derived_from_row_identity"] += 1
            elif total_known is None and len(known) == 3:
                php_cells["total"] = sum(known.values())
                interps["total"] = {"rule": "derived_from_row_identity_sum_components",
                                    "raw": row["amounts_raw"].get("total"),
                                    "interpreted": str(php_cells["total"])}
                stats["derived_total"] += 1
            row["amounts_php"] = php_cells
            row["amount_interpretations"] = interps
        else:
            row["amounts_php"] = {}
            row["amount_interpretations"] = {}
    return stats


# ── Tree ──────────────────────────────────────────────────────────────────

def build_tree(rows):
    annex_root = {"id": "nep_hfep:p1:title", "kind": "annex_program", "parent_id": None,
                  "child_ids": [],
                  "label": "FY 2027 HEALTH FACILITIES ENHANCEMENT PROGRAM (HFEP)",
                  "label_raw": "DEPARTMENT OF HEALTH\nFY 2027 HEALTH FACILITIES "
                               "ENHANCEMENT PROGRAM (HFEP)\n(Amount in Pesos)",
                  "printed_amounts_php": {}, "derived": True,
                  "source": {"source_pdf": PPS_JSON.relative_to(ROOT).as_posix(),
                             "row_id": "nep_hfep:p1:title", "pdf_page": 1,
                             "printed_page": 1 + PRINTED_OFFSET, "table_row": None},
                  "source_evidence_status": "pps_markdown_title",
                  "image_review_status": "not_individually_reviewed"}
    nodes = [annex_root]
    cursor = {"category": None, "subcategory": None, "region": None, "province": None}
    kind_map = {"category": "category_control", "subcategory": "subcategory_control",
                "region": "region_control", "province": "province_control",
                "facility": "facility", "grand_total": "grand_total"}
    for row in rows:
        role = row["role"]
        if role not in kind_map or not row["label_raw"].strip():
            continue
        kind = kind_map[role]
        node = {"id": row["id"], "kind": kind, "parent_id": None, "child_ids": [],
                "label": " ".join(row["label_raw"].split()),
                "label_raw": row["label_raw"],
                "printed_amounts_php": dict(row["amounts_php"]),
                "printed_amounts_raw": dict(row["amounts_raw"]),
                "derived": False,
                "source": {"source_pdf": PPS_JSON.relative_to(ROOT).as_posix(),
                           "row_id": row["id"], "pdf_page": row["pdf_page"],
                           "printed_page": row["printed_page"],
                           "table_row": row["table_row"]},
                "source_evidence_status": "pps_table_ocr_pred_cell",
                "image_review_status": "not_individually_reviewed"}
        if kind == "category_control":
            parent = annex_root
            cursor.update(subcategory=None, region=None, province=None)
        elif kind == "grand_total":
            parent = annex_root
        elif kind == "subcategory_control":
            parent = cursor["category"] or annex_root
            cursor.update(region=None, province=None)
        elif kind == "region_control":
            cursor.update(region=None, province=None)
            parent = cursor["subcategory"] or cursor["category"] or annex_root
        elif kind == "province_control":
            cursor["province"] = None
            parent = cursor["region"] or annex_root
        else:
            parent = cursor["province"] or cursor["region"] or annex_root
            if parent is annex_root:
                raise ValueError(f"Facility attached to annex root: {row['id']} {row['label_raw']!r}")
        node["parent_id"] = parent["id"]
        parent["child_ids"].append(node["id"])
        if role in cursor:
            cursor[role] = node
        nodes.append(node)
    by_id = {n["id"]: n for n in nodes}
    for node in nodes:
        path_ids, path_labels = [], []
        current = node
        while current:
            path_ids.insert(0, current["id"])
            path_labels.insert(0, current["label"])
            current = by_id.get(current["parent_id"])
        node["path_ids"], node["path_labels"] = path_ids, path_labels
    return {"root_id": annex_root["id"], "nodes": nodes}, annex_root


# ── VL cross-validation ───────────────────────────────────────────────────

class _VLTableParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.tables, self._tbl, self._row = [], None, None

    def handle_starttag(self, tag, attrs):
        if tag == "table":
            self._tbl = []
        elif tag == "tr" and self._tbl is not None:
            self._row = []
        elif tag in ("td", "th") and self._row is not None:
            self._row.append(dict(attrs).get("colspan", "1"))

    def handle_data(self, data):
        if self._row is not None and data.strip():
            self._row[-1] = (self._row[-1], data.strip())

    def handle_endtag(self, tag):
        if tag in ("td", "th") and self._row:
            pass
        elif tag == "tr" and self._row is not None:
            self._tbl.append([c if isinstance(c, str) else c[1] for c in self._row])
            self._row = None
        elif tag == "table" and self._tbl is not None:
            self.tables.append(self._tbl)
            self._tbl = None


def vl_crosscheck(rows):
    """Compare PPS rows against PaddleOCR-VL markdown tables on shared pages.

    VL pages 1,3,4,7,10,12 carry tables. Labels repeat within a page (e.g. two
    "CAR" controls under different subcategories), so VL and PPS rows are paired
    per label in document order (k-th occurrence ↔ k-th occurrence) and only
    the grand-total column is compared.
    """
    with open(VL_JSON) as f:
        vl = json.load(f)
    report = {"vl_pages": [], "shared_rows": 0, "unmatched_labels": 0,
              "amount_agreements": 0, "amount_conflicts": []}
    pps_by_page = collections.defaultdict(list)
    for row in rows:
        pps_by_page[row["pdf_page"]].append(row)
    for pg_idx, item in enumerate(vl):
        md = item.get("markdown", {}).get("text", "")
        if "<table" not in md:
            continue
        parser = _VLTableParser()
        parser.feed(md)
        pps_page_rows = pps_by_page.get(pg_idx + 1, [])
        # PPS label → list of rows in document order
        pps_occurrences = collections.defaultdict(list)
        for r in pps_page_rows:
            pps_occurrences[" ".join(r["label_raw"].split())].append(r)
        seen = collections.Counter()
        for tbl in parser.tables:
            for vl_row in tbl[1:]:
                vl_label = (vl_row[0] or "").strip() if vl_row else ""
                if not vl_label:
                    continue
                vl_total_raw = (vl_row[-1] or "").strip() if len(vl_row) > 1 else ""
                vl_total = int(vl_total_raw.replace(",", "")) if AMOUNT_RE.fullmatch(vl_total_raw) else None
                occ = seen[vl_label]
                seen[vl_label] += 1
                candidates = pps_occurrences.get(vl_label, [])
                if occ >= len(candidates):
                    report["unmatched_labels"] += 1
                    continue
                match = candidates[occ]
                report["shared_rows"] += 1
                pps_total = match["amounts_php"].get("total")
                if vl_total is not None and pps_total is not None:
                    if vl_total == pps_total:
                        report["amount_agreements"] += 1
                    else:
                        report["amount_conflicts"].append(
                            {"page": pg_idx + 1, "label": vl_label,
                             "vl_total": vl_total, "pps_total": pps_total})
        report["vl_pages"].append(pg_idx + 1)
    return report


# ── Agency control (Volume II-A) ──────────────────────────────────────────

def agency_controls():
    page = pymupdf.open(VOLUME)[AGENCY_PAGE - 1]
    words = [(*w, i) for i, w in enumerate(page.get_text("words"))]
    lines = []
    for w in sorted(words, key=lambda w: (w[1], w[0])):
        if lines and abs(w[1] - lines[-1][0][1]) < 2:
            lines[-1].append(w)
        else:
            lines.append([w])
    observations, pending_label = [], []
    for line in lines:
        text = " ".join(w[4] for w in sorted(line, key=lambda w: w[0]))
        amounts = [w for w in line if AMOUNT_RE.fullmatch(w[4])]
        if len(amounts) == 3 and any(a[4] == "14,472,659,000" for a in amounts):
            observations.append({
                "label": " ".join(pending_label[-3:]) if pending_label else "",
                "mooe_php": int(amounts[0][4].replace(",", "")),
                "capital_outlay_php": int(amounts[1][4].replace(",", "")),
                "total_php": int(amounts[2][4].replace(",", "")),
                "source": {"source_pdf": VOLUME.relative_to(ROOT).as_posix(),
                           "pdf_page": AGENCY_PAGE, "printed_page": 274}})
            pending_label = []
        elif text.strip() and not amounts:
            pending_label.append(text.strip())
    if len(observations) < 3:
        raise ValueError(f"Expected PAP row plus echoes, found {len(observations)}")
    pap = observations[0]
    if {o["capital_outlay_php"] for o in observations} != {14_472_659_000}:
        raise ValueError("HFEP agency control value changed")
    return pap, observations[1:]


# ── Validation ────────────────────────────────────────────────────────────

def validate(rows, pages_meta, tree, agency, vl_report):
    errors = []
    discrepancies = []
    by_id = {n["id"]: n for n in tree["nodes"]}

    # every structural row is owned by exactly one node
    structural = {"category", "subcategory", "region", "province", "facility", "grand_total"}
    structural_ids = {r["id"] for r in rows if r["role"] in structural}
    owned = collections.Counter(n["source"]["row_id"] for n in tree["nodes"]
                                if n["kind"] != "annex_program")
    if set(owned) != structural_ids or any(v != 1 for v in owned.values()):
        errors.append("source_amount_row_coverage_or_ownership")

    # grand-total row must equal the printed controls
    gt = next(n for n in tree["nodes"] if n["kind"] == "grand_total")
    gt_expected = {"infrastructure": 7_386_456_000, "medical_equipment": 6_834_203_000,
                   "motor_vehicle": 252_000_000, "total": 14_472_659_000}
    if gt["printed_amounts_php"] != gt_expected:
        errors.append(f"grand_total_row_disagreement:{gt['printed_amounts_php']}")

    # bottom-up recursive rollup
    rollups = []
    visited = collections.Counter()

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
            return collections.Counter()
        if not node["child_ids"]:
            return collections.Counter(node["printed_amounts_php"])
        total = collections.Counter()
        for child in children:
            total.update(walk(child["id"], ancestors | {node_id}))
        node["derived_amounts_php"] = dict(total)
        check = {"node_id": node_id, "label": node["label"], "kind": node["kind"],
                 "printed_amounts_php": dict(node["printed_amounts_php"]),
                 "recursive_children_sum_php": dict(total),
                 "child_count": len(children)}
        diffs = {k: node["printed_amounts_php"].get(k, 0) - total.get(k, 0)
                 for k in COLUMN_NAMES}
        check["differences_php"] = diffs
        # Documented printed discrepancies are recorded, not fatal.
        nonzero_diffs = {k: v for k, v in diffs.items() if v != 0}
        documented = next((d for d in PRINTED_DISCREPANCIES
                           if node_id in d["node_ids"]
                           and nonzero_diffs == d["columns"]), None)
        check["passed"] = all(v == 0 for v in diffs.values())
        if documented:
            check["printed_discrepancy_id"] = documented["id"]
            check["passed"] = True  # reconciled to a documented annex defect
            discrepancies.append(documented["id"])
        rollups.append(check)
        if not check["passed"]:
            errors.append(f"control_sum_disagreement:{node_id}:{dict(diffs)}")
        return total

    # annex program must equal the grand-total row; the ledger may differ from
    # both by exactly the documented printed overhang. The annex root's printed
    # control is the Grand Total row itself.
    root_node = by_id[tree["root_id"]]
    root_node["printed_amounts_php"] = dict(gt_expected)
    root_recursive = walk(tree["root_id"], set())
    if set(visited) != set(by_id) or any(c != 1 for c in visited.values()):
        errors.append("tree_reachability_or_duplicate_consumption")

    gt_ledger_gap = {k: v for k, v in
                     ((k, gt_expected.get(k, 0) - root_recursive.get(k, 0))
                      for k in gt_expected) if v != 0}
    documented_gap = next(iter(PRINTED_DISCREPANCIES))["columns"]
    if root_recursive == collections.Counter(gt_expected):
        pass
    elif gt_ledger_gap == documented_gap:
        discrepancies.append(next(iter(PRINTED_DISCREPANCIES))["id"])
    else:
        errors.append(f"annex_sum_vs_grand_total:{dict(root_recursive)}")

    # agency PAP cross-check
    pap, echoes = agency
    agency_check = {**pap, "echoes_count": len(echoes),
                    "annex_total_equals_agency_capital_outlay":
                        gt_expected["total"] == pap["capital_outlay_php"],
                    "agency_mooe_plus_co_equals_total":
                        pap["mooe_php"] + pap["capital_outlay_php"] == pap["total_php"],
                    "note": "The annex covers HFEP capital outlays only; the PAP row's "
                            "MOOE (₱67,173,000) is not part of this detail annex."}
    agency_check["passed"] = (agency_check["annex_total_equals_agency_capital_outlay"]
                              and agency_check["agency_mooe_plus_co_equals_total"])
    if not agency_check["passed"]:
        errors.append("agency_control_disagreement")

    # VL cross-check: conflicts are hard failures; matches recorded
    vl_conflicts = vl_report["amount_conflicts"]
    if vl_conflicts:
        errors.append(f"vl_amount_conflicts:{len(vl_conflicts)}")

    facilities = [n for n in tree["nodes"] if n["kind"] == "facility"]
    ledger = collections.Counter()
    for f in facilities:
        ledger.update(f["printed_amounts_php"])
    failed = sum(not c["passed"] for c in rollups)
    documented_discrepancies = [d for d in PRINTED_DISCREPANCIES if d["id"] in discrepancies]
    return {"passed": not errors, "errors": errors,
            "printed_discrepancies": documented_discrepancies,
            "summary": {"detail_pages": 13, "source_rows": len(rows),
                        "facilities": len(facilities),
                        "facility_ledger_total_php": ledger.get("total"),
                        "grand_total_php": gt_expected["total"],
                        "ledger_vs_grand_total_gap_php": {
                            k: ledger.get(k, 0) - gt_expected.get(k, 0)
                            for k in gt_expected},
                        "printed_discrepancies_count": len(documented_discrepancies),
                        "internal_control_checks": len(rollups),
                        "failed_internal_controls": failed,
                        "vl_shared_rows": vl_report["shared_rows"],
                        "vl_amount_agreements": vl_report["amount_agreements"],
                        "vl_amount_conflicts": len(vl_conflicts),
                        "agency_check_echoes": len(echoes)},
            "rollup_checks": rollups, "agency_check": agency_check,
            "vl_crosscheck": vl_report}


# ── Provenance marking ────────────────────────────────────────────────────

# Printed/OCR label spellings preserved verbatim; recorded so downstream users
# can normalize display names without losing the source reading.
LABEL_QUIRKS = [
    {"id": "label_typo_staion", "affects_ids": ["nep_hfep:p1:r20"],
     "raw": "Samoki Barangay Health Staion", "note": "printed typo for 'Station'"},
    {"id": "label_typo_lyinq", "affects_ids": ["nep_hfep:p2:r61"],
     "raw": "Gen. T. de Leon (GTDL) Lyinq-in Clinic",
     "note": "printed/OCR reading for 'Lying-in'"},
    {"id": "label_typo_facillity", "affects_ids": ["nep_hfep:p3:r12"],
     "raw": "Mina Primary Care Facillity", "note": "printed typo for 'Facility'"},
    {"id": "label_missing_space", "affects_ids": ["nep_hfep:p2:r65"],
     "raw": "City of Valenzuela,Pinalagad Health Center",
     "note": "missing space after comma as printed"},
]

# Non-round printed amounts individually verified against the rendered page
# and the Volume II-A OCR text layer before accepting.
VERIFIED_ODD_AMOUNTS = [
    {"id": "odd_amount_mabolo_55000", "row_id": "nep_hfep:p2:r62",
     "facility": "City of Valenzuela, Mabolo Health Center",
     "columns": {"medical_equipment": 55_000, "total": 55_000},
     "verification": "cell render at 10x (med and total) + Volume II-A p728 text"},
    {"id": "odd_amount_san_antonio_95000", "row_id": "nep_hfep:p5:r67",
     "facility": "San Antonio District Hospital",
     "columns": {"medical_equipment": 95_000, "total": 95_000},
     "verification": "row render at 5x + Volume II-A p731 text"},
    {"id": "odd_amount_dona_josefa_10682000", "row_id": "nep_hfep:p5:r27",
     "facility": "Dona Josefa Edralin Marcos District Hospital",
     "columns": {"medical_equipment": 10_682_000, "total": 10_682_000},
     "verification": "row render at 5x + Volume II-A p731 text"},
    {"id": "odd_amount_cadiz_33204000", "row_id": "nep_hfep:p6:r53",
     "facility": "Cadiz City District Hospital",
     "columns": {"medical_equipment": 33_204_000, "total": 33_204_000},
     "verification": "row render at 5x + Volume II-A p732 text"},
    {"id": "odd_amount_camiguin_149703000", "row_id": "nep_hfep:p10:r27",
     "facility": "Camiguin General Hospital",
     "columns": {"medical_equipment": 149_703_000, "total": 149_703_000},
     "verification": "row render at 5x + Volume II-A p736 text"},
]


def mark_provenance(tree, rows):
    """Stamp every node with provenance blocks derived from extraction state.

    Adds to each node:
    * normalizations — whitespace-collapsed label, kind-based hierarchy columns
    * amount_lineage — per-cell raw reading, rule, and derivation for cells
      that were interpreted or derived
    * flags — review statuses (ocr_suspect_label, verified_odd_amount,
      printed_discrepancy, page_break_continuation)
    """
    by_row = {r["id"]: r for r in rows}
    rows_by_page = collections.defaultdict(list)
    for r in rows:
        rows_by_page[r["pdf_page"]].append(r)

    # page-break continuation: region/province/facility rows whose parent block
    # was established on an earlier page — the rows where a per-page parser
    # must carry cross-page context (e.g. NCR's Metro Manila/Navotas City split
    # across pp2–3). Numbered category/subcategory blocks are self-contained
    # starts, not continuations, and are excluded.
    continuation_ids = set()
    by_id_all = {x["id"]: x for x in tree["nodes"]}
    for n in tree["nodes"]:
        if n["kind"] not in {"region_control", "province_control", "facility"}:
            continue
        src = n.get("source", {})
        if not src.get("pdf_page") or src["pdf_page"] < 2:
            continue
        parent = by_id_all.get(n["parent_id"])
        if parent and parent.get("source", {}).get("pdf_page", 0) < src["pdf_page"]:
            continuation_ids.add(n["id"])

    quirk_ids = {qid: q for q in LABEL_QUIRKS for qid in q["affects_ids"]}
    odd_by_row = {v["row_id"]: v for v in VERIFIED_ODD_AMOUNTS}
    disc_nodes = {nid: d for d in PRINTED_DISCREPANCIES for nid in d["node_ids"]}

    for n in tree["nodes"]:
        row = by_row.get(n["id"])
        prov = {"normalizations": [], "amount_lineage": [], "flags": []}
        # label normalization
        raw_label = n.get("label_raw") or n["label"]
        if raw_label != " ".join(raw_label.split()):
            prov["normalizations"].append(
                {"type": "label_whitespace_collapse", "from": raw_label,
                 "to": " ".join(raw_label.split())})
        # amount lineage from the source row's interpretations
        if row:
            for col, interp in (row.get("amount_interpretations") or {}).items():
                prov["amount_lineage"].append(
                    {"column": col, "rule": interp["rule"], "raw": interp.get("raw"),
                     "interpreted": interp.get("interpreted")})
        # flags
        if n["id"] in quirk_ids:
            q = quirk_ids[n["id"]]
            prov["flags"].append({"flag": "ocr_suspect_label", "id": q["id"],
                                  "raw": q["raw"], "note": q["note"]})
        if n["id"] in odd_by_row:
            v = odd_by_row[n["id"]]
            prov["flags"].append({"flag": "verified_odd_amount", "id": v["id"],
                                  "columns": v["columns"],
                                  "verification": v["verification"]})
        if n["id"] in disc_nodes:
            d = disc_nodes[n["id"]]
            prov["flags"].append({"flag": "printed_discrepancy", "id": d["id"],
                                  "columns": d["columns"], "note": d["note"]})
        if n["id"] in continuation_ids:
            prov["flags"].append({"flag": "page_break_continuation",
                                  "note": "first row of a block continued from "
                                          "the previous page"})
        n["provenance"] = prov
    return tree


# ── CSV / artifacts ───────────────────────────────────────────────────────

FACILITY_FIELDS = ["id", "category", "subcategory", "region", "province",
                   "facility", "facility_raw", "infrastructure_php",
                   "medical_equipment_php", "motor_vehicle_php", "total_php",
                   "source_json", "pdf_page", "printed_page", "table_row",
                   "parent_id", "path"]


def _crumb(by_id, node):
    """Map a node's ancestor chain to named columns by node kind.

    Categories without numbered subcategories (2–6) attach regions directly,
    so fixed path positions would shift; kind-based mapping stays correct.
    """
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


CONTROL_FIELDS = ["id", "category", "subcategory", "region", "label", "kind",
                  "infrastructure_php", "medical_equipment_php", "motor_vehicle_php",
                  "total_php", "child_count", "recursive_sum_total_php",
                  "pdf_page", "printed_page", "table_row"]


def control_csv_records(tree):
    recs = []
    by_id = {n["id"]: n for n in tree["nodes"]}
    root = by_id[tree["root_id"]]
    for n in tree["nodes"]:
        if n["kind"] in {"category_control", "subcategory_control", "region_control",
                         "province_control", "grand_total"}:
            if n["kind"] == "grand_total":
                recursive_sum = root.get("derived_amounts_php", {}).get("total")
                child_count = None
            else:
                recursive_sum = n.get("derived_amounts_php", {}).get("total")
                child_count = len(n["child_ids"])
            c = _crumb(by_id, n)
            own_cat = n["label"] if n["kind"] == "category_control" else c["category"]
            own_sub = n["label"] if n["kind"] == "subcategory_control" else c["subcategory"]
            own_reg = n["label"] if n["kind"] == "region_control" else c["region"]
            recs.append({"id": n["id"],
                         "category": own_cat,
                         "subcategory": None if n["kind"] == "category_control" else own_sub,
                         "region": own_reg,
                         "label": n["label"], "kind": n["kind"],
                         "infrastructure_php": n["printed_amounts_php"].get("infrastructure"),
                         "medical_equipment_php": n["printed_amounts_php"].get("medical_equipment"),
                         "motor_vehicle_php": n["printed_amounts_php"].get("motor_vehicle"),
                         "total_php": n["printed_amounts_php"].get("total"),
                         "child_count": child_count,
                         "recursive_sum_total_php": recursive_sum,
                         "pdf_page": n["source"]["pdf_page"],
                         "printed_page": n["source"]["printed_page"],
                         "table_row": n["source"]["table_row"]})
    return recs


def facility_csv_records(tree):
    by_id = {n["id"]: n for n in tree["nodes"]}
    recs = []
    for f in (n for n in tree["nodes"] if n["kind"] == "facility"):
        c = _crumb(by_id, f)
        recs.append({"id": f["id"],
                     "category": c["category"], "subcategory": c["subcategory"],
                     "region": c["region"], "province": c["province"],
                     "facility": f["label"], "facility_raw": f["label_raw"],
                     "infrastructure_php": f["printed_amounts_php"].get("infrastructure"),
                     "medical_equipment_php": f["printed_amounts_php"].get("medical_equipment"),
                     "motor_vehicle_php": f["printed_amounts_php"].get("motor_vehicle"),
                     "total_php": f["printed_amounts_php"].get("total"),
                     "source_json": f["source"]["source_pdf"],
                     "pdf_page": f["source"]["pdf_page"],
                     "printed_page": f["source"]["printed_page"],
                     "table_row": f["source"]["table_row"],
                     "parent_id": f["parent_id"],
                     "path": " → ".join(f["path_labels"][1:])})
    return recs


def csv_text(records, fields):
    stream = io.StringIO(newline="")
    writer = csv.DictWriter(stream, fieldnames=fields, lineterminator="\n")
    writer.writeheader()
    writer.writerows(records)
    return stream.getvalue()


# ── Consolidated data list ────────────────────────────────────────────────

CONSOLIDATED_SCHEMA_VERSION = 1


def consolidated_json(tree, audit, metadata):
    """Single self-contained JSON: full item list with per-item provenance.

    Structure:
    * items — every facility line item with hierarchy, amounts, source, and
      provenance (normalizations / amount_lineage / flags)
    * controls — every printed control (category → province, grand total) with
      recursive sums, reconciliation status, and the same provenance block
    * document — metadata, controls verification, cross-checks, findings
    """
    by_id = {n["id"]: n for n in tree["nodes"]}

    def prov_block(n):
        return {
            "normalizations": n["provenance"]["normalizations"],
            "amount_lineage": n["provenance"]["amount_lineage"],
            "flags": n["provenance"]["flags"],
            "image_review_status": n.get("image_review_status"),
        }

    items = []
    for n in tree["nodes"]:
        if n["kind"] != "facility":
            continue
        c = _crumb(by_id, n)
        items.append({
            "id": n["id"],
            "label": n["label"], "label_raw": n["label_raw"],
            "hierarchy": {"category": c["category"], "subcategory": c["subcategory"],
                          "region": c["region"], "province": c["province"]},
            "amounts_php": {k: n["printed_amounts_php"].get(k)
                            for k in COLUMN_NAMES if k in n["printed_amounts_php"]},
            "amounts_raw": n.get("printed_amounts_raw", {}),
            "source": n["source"],
            "provenance": prov_block(n),
        })

    controls = []
    for n in tree["nodes"]:
        if n["kind"] not in {"category_control", "subcategory_control",
                             "region_control", "province_control", "grand_total",
                             "annex_program"}:
            continue
        c = _crumb(by_id, n)
        rollup = next((r for r in audit["rollup_checks"]
                       if r["node_id"] == n["id"]), None)
        controls.append({
            "id": n["id"],
            "kind": n["kind"],
            "label": n["label"], "label_raw": n["label_raw"],
            "hierarchy": {"category": c["category"], "subcategory": c["subcategory"],
                          "region": c["region"], "province": c["province"]},
            "amounts_php": {k: n["printed_amounts_php"].get(k)
                            for k in COLUMN_NAMES if k in n["printed_amounts_php"]},
            "amounts_raw": n.get("printed_amounts_raw", {}),
            "children": {"count": len(n.get("child_ids", [])),
                         "recursive_sum_php": n.get("derived_amounts_php")},
            "reconciliation": {
                "status": ("exact" if rollup is None or rollup["passed"]
                           and not rollup.get("printed_discrepancy_id")
                           else "printed_discrepancy" if rollup["passed"]
                           else "failed"),
                "differences_php": (rollup or {}).get("differences_php"),
                "printed_discrepancy_id": (rollup or {}).get("printed_discrepancy_id"),
            },
            "source": n["source"],
            "provenance": prov_block(n),
        })

    return {
        "schema": "dpwh_nep_api/nep_hfep_data_list",
        "schema_version": CONSOLIDATED_SCHEMA_VERSION,
        "document": {
            "metadata": metadata,
            "verification": {
                "summary": audit["summary"],
                "agency_check": audit["agency_check"],
                "vl_crosscheck": {k: v for k, v in audit["vl_crosscheck"].items()
                                  if k != "amount_conflicts"},
                "findings": audit["printed_discrepancies"],
                "label_quirks": LABEL_QUIRKS,
                "verified_odd_amounts": VERIFIED_ODD_AMOUNTS,
            },
        },
        "items": items,
        "controls": controls,
    }


# ── Build ─────────────────────────────────────────────────────────────────

def build():
    metadata = {
        "schema_version": 1, "fiscal_year": 2027, "currency": "PHP",
        "source_unit": "pesos", "unit_multiplier": 1,
        "document": "NEP FY 2027 Executive Budget Proposal, HFEP detail annex",
        "legislative_stage": "executive_proposal",
        "scope": "DOH FY 2027 Health Facilities Enhancement Program capital outlays",
        "source_pdf": "dbm-other-nep-line-data/HFEP_2.pdf",
        "source_pps_json": PPS_JSON.relative_to(ROOT).as_posix(),
        "source_pps_sha256": sha(PPS_JSON),
        "source_vl_json": VL_JSON.relative_to(ROOT).as_posix(),
        "source_vl_sha256": sha(VL_JSON),
        "volume_cross_control": {"source_pdf": VOLUME.relative_to(ROOT).as_posix(),
                                 "pdf_page": AGENCY_PAGE, "printed_page": 274},
        "printed_page_offset": PRINTED_OFFSET,
        "extractor_sha256": sha(__file__),
        "pymupdf_version": pymupdf.VersionBind,
        "ids": "artifact-local page/row identifiers; not cross-document identities"}
    pps_pages = load_pps_pages()
    if len(pps_pages) != 13:
        raise ValueError("Expected 13 PPS pages")
    rows = extract_rows(pps_pages)
    assign_stats = assign_amounts(rows)
    tree, root = build_tree(rows)
    pap, echoes = agency_controls()
    vl_report = vl_crosscheck(rows)
    audit = validate(rows, pps_pages, tree, (pap, echoes), vl_report)
    audit["amount_assignment_stats"] = dict(assign_stats)
    mark_provenance(tree, rows)
    artifacts = {
        "nep_hfep_tree.json": {"metadata": metadata, **tree},
        "nep_hfep_source_rows.json": {"metadata": metadata, "rows": rows},
        "nep_hfep_audit.json": {"metadata": metadata, **audit},
        "nep_hfep_data_list.json": consolidated_json(tree, audit, metadata),
    }
    result = {name: json.dumps(v, ensure_ascii=False, indent=2) + "\n"
              for name, v in artifacts.items()}
    result["nep_hfep_facilities.csv"] = csv_text(facility_csv_records(tree), FACILITY_FIELDS)
    result["nep_hfep_controls.csv"] = csv_text(control_csv_records(tree), CONTROL_FIELDS)
    return result, audit


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true",
                        help="re-extract and compare without writing")
    args = parser.parse_args()
    artifacts, audit = build()
    if not audit["passed"]:
        raise SystemExit(json.dumps(audit["errors"], indent=2))
    if args.check:
        stale = [n for n, c in artifacts.items()
                 if not (OUT / n).exists() or (OUT / n).read_text() != c]
        if stale:
            raise SystemExit("Stale outputs: " + ", ".join(stale))
    else:
        OUT.mkdir(parents=True, exist_ok=True)
        for n, c in artifacts.items():
            (OUT / n).write_text(c)
    print(json.dumps(audit["summary"], indent=2))
    print("Deterministic output check passed." if args.check
          else "NEP HFEP artifacts written; all accounting checks passed.")


if __name__ == "__main__":
    main()
