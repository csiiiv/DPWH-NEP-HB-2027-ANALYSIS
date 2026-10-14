#!/usr/bin/env python3
"""Scan structured budget datasets for any inclusion of GPS / coordinate text.

Reuses the FMR-style parse core in coordinate_parse.py. Emits an inventory of
records that contain GPS-like fragments (parsed pairs and unparsed candidates).

Usage:
  python3 gps-analysis/scan_gps_inventory.py           # rebuild outputs
  python3 gps-analysis/scan_gps_inventory.py --check   # verify outputs exist
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
import sys
from collections import Counter
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parent
sys.path.insert(0, str(HERE))
from coordinate_parse import endpoint_observations, parse_pairs  # noqa: E402

OUT = HERE / "data"
INVENTORY_JSON = OUT / "gps_inventory.json"
SUMMARY_JSON = OUT / "gps_inventory_summary.json"
HITS_CSV = OUT / "gps_inventory_hits.csv"

# Evidence documents: keys map a scan-time source path to the PDF shipped in
# the packaged site (siteUrl-able) and the workspace/tree that renders it.
# tree=None documents are preview-only (no joinable node id space).
EVIDENCE_DOCUMENTS = {
    "HB_BUDGET/2 - HB 10858 VOL IB.pdf": {
        "key": "house-tree", "label": "House 2nd reading · Volume I-B",
        "pdf": "HB_BUDGET/2%20-%20HB%2010858%20VOL%20IB.pdf", "pages": 982,
    },
    "HB_BUDGET/3 - HB 10858 VOL IC.pdf": {
        "key": "house-projects", "label": "House 2nd reading · Volume I-C",
        "pdf": "HB_BUDGET/3%20-%20HB%2010858%20VOL%20IC.pdf", "pages": 942,
    },
    "HB_BUDGET_3rd_reading/2- HB 10858 FOR 3RD READING VOL I-B.pdf": {
        "key": "house-third-controls", "label": "House 3rd reading · Volume I-B",
        "pdf": "HB_BUDGET_3rd_reading/2-%20HB%2010858%20FOR%203RD%20READING%20VOL%20I-B.pdf",
        "pages": 982,
    },
    "HB_BUDGET_3rd_reading/3- HB 10858 FOR 3RD READING VOL I-C .pdf": {
        "key": "house-third", "label": "House 3rd reading · Volume I-C",
        "pdf": "HB_BUDGET_3rd_reading/3-%20HB%2010858%20FOR%203RD%20READING%20VOL%20I-C%20.pdf",
        "pages": 942,
    },
    "dbm-nep-data/NEP-2027-VOLUME-2B_OCR.pdf": {
        "key": "nep", "label": "DBM NEP · Volume II-B (retained OCR)",
        "pdf": "pdfs/NEP-2027-VOLUME-2B_OCR.pdf", "pages": 722,
    },
    # Standalone annexes (FMR/NIA schedules) preview from the source path
    # itself; workbench trees address rows by the same ids the scanner sees.
    "dbm-other-nep-line-data/FMR.pdf": {
        "key": "fmr-nep", "label": "DBM NEP · standalone FMR annex",
        "pdf": "dbm-other-nep-line-data/FMR.pdf", "pages": 47,
    },
    "dbm-other-nep-line-data/NIA.pdf": {
        "key": "nia-nep", "label": "DBM NEP · standalone NIA annex",
        "pdf": "dbm-other-nep-line-data/NIA.pdf", "pages": 30,
    },
    "dbm-nep-data/NEP-2027-VOLUME-2A_OCR.pdf": {
        "key": "hfep-nep", "label": "DBM NEP · Volume II-A",
        "pdf": "dbm-nep-data/NEP-2027-VOLUME-2A_OCR.pdf", "pages": 772,
    },
}


def evidence_ref(document_path, pdf_page, *, node=None, workspace=None, route=None,
                 params=None, note=None):
    """Build a source-evidence reference for one PDF page of one document."""
    if not document_path:
        return None
    meta = EVIDENCE_DOCUMENTS.get(document_path)
    if not meta:
        return None
    ref = {
        "document": meta["key"],
        "label": meta["label"],
        "pdf": meta["pdf"],
        "pdf_page": pdf_page if isinstance(pdf_page, int) and pdf_page > 0 else None,
    }
    if node and workspace and route:
        tree = {"workspace": workspace, "route": route, "node": node}
        if params:
            tree["params"] = params
        ref["tree"] = tree
    if note:
        ref["note"] = note
    return ref


_PAGE_LOOKUPS: dict[str, dict] = {}


def _tree_pages(rel: str) -> dict:
    """node id → pdf_page for a native tree dataset (cached per run)."""
    if rel not in _PAGE_LOOKUPS:
        path, data, _ = load_json(rel)
        pages = {}
        root = data.get("root")
        stack = [root] if root else list(data.get("nodes") or [])
        while stack:
            node = stack.pop()
            if isinstance(node, dict):
                page = (node.get("source") or {}).get("pdf_page")
                if isinstance(page, int) and node.get("id"):
                    pages[node["id"]] = page
                stack.extend(node.get("children") or [])
        _PAGE_LOOKUPS[rel] = pages
    return _PAGE_LOOKUPS[rel]


def nep_page_lookup() -> dict:
    return _tree_pages("analysis/data/nep_2027_tree.json")


def ic_page_lookup(reading: str) -> dict:
    rel = ("analysis/data/hb_dpwh_native_ic_projects.json" if reading == "second"
           else "analysis/data/hb_dpwh_native_ic_projects_3rd_reading.json")
    return _tree_pages(rel)


# Cheap prefilter: avoid feeding every chainage title into the pair parser.
# START/END require a colon so prose like "Tail end of Lateral A" is ignored.
# `º` (U+00BA masculine ordinal) is an OCR variant of `°` and must count here:
# this gate runs BEFORE ascii_text normalization, so a coordinate written only
# with ordinals would otherwise be skipped without ever reaching the parsers.
# Being generous is safe — parse_pairs plus the Philippine bounding box are the
# real authority on whether a fragment yields a usable point.
GPS_HINT = re.compile(
    r"(?i)"
    r"(?:\b(?:ISTART|START|STARTT?|STAR|END)\s*:"
    r"|\b(?:LAT(?:ITUDE)?|LON(?:G(?:ITUDE)?)?|[XY])\s*:"
    r"|\d{1,3}\s*[°º]"
    r"|\(\s*(?:[NSEW]\s*)?[+-]?\d{1,3}(?:[.:]\d+)+\s*[°º]?\s*[NSEW]?\s*,\s*"
    r"(?:[NSEW]\s*)?[+-]?\d{1,3}(?:[.:]\d+)+\s*[°º]?\s*[NSEW]?\s*\)"
    r"|\b(?:[4-9]|1[0-9]|2[0-2])\.\d{3,}\s*,\s*1[12]\d\.\d{3,}\b"
    r"|\b1[12]\d\.\d{3,}\s*,\s*(?:[4-9]|1[0-9]|2[0-2])\.\d{3,}\b)"
)
PAREN_PAIR = re.compile(
    r"\(\s*([+-]?\d{1,3}(?:[.:]\s*\d+)+\s*,\s*[+-]?\d{1,3}(?:[.:]\s*\d+)+)\s*\)"
)
INLINE_PH_PAIR = re.compile(
    r"\b((?:[4-9]|1[0-9]|2[0-2])\.\d{3,}\s*,\s*1[12]\d\.\d{3,}"
    r"|1[12]\d\.\d{3,}\s*,\s*(?:[4-9]|1[0-9]|2[0-2])\.\d{3,})\b"
)
DMS_SPAN = re.compile(
    r"\d{1,3}\s*°\s*\d{1,2}\s*['′]?\s*\d+(?:\.\d+)?\s*[\"″]?\s*[NSEW]?"
    r"\s*[,;\s]+\s*"
    r"\d{1,3}\s*°\s*\d{1,2}\s*['′]?\s*\d+(?:\.\d+)?\s*[\"″]?\s*[NSEW]?",
    re.I,
)

# Decimal-degree pairs embedded in prose, e.g. "(14.656598°N, 121.267969°E)" or
# "…Misamis Oriental, 8.452176°, 124.689299°". PAREN_PAIR/INLINE_PH_PAIR only
# tolerate bare digits, so degree symbols, hemisphere letters and the º ordinal
# (OCR variant of °) all fell through and left these records hint_only despite
# carrying a perfectly good coordinate pair.
#
# Hemisphere letters MUST be anchored with lookarounds. Without them a trailing
# place-name letter is swallowed as a hemisphere marker: "Batanes 20.34983°"
# matches the "s" and yields latitude -20.34983, flipping real Batanes projects
# into the southern hemisphere. `(?<![A-Za-z])` blocks the prefix case and
# `(?![A-Za-z])` blocks suffixes that begin the next word ("121.9° Eastern").
#
# Two branches keep false positives down. Outside parentheses at least one
# number MUST carry a degree symbol or standalone hemisphere letter — making
# the marker optional degrades branch A into "any number, any number", which
# then swallows unrelated decimals such as the hyphen-joined point list in
# "(FRIENDSHIP)-15.155685101922105, 120.55356457224914" and reads the hyphen as
# a negative sign (INLINE_PH_PAIR already covers bare Philippine-range pairs
# correctly). Inside parentheses the delimiters are known to bound a
# coordinate, so markers become optional. The Philippine bounding box in
# parse_pairs remains the backstop for nonsense numbers.
#
# A sign may not follow a letter or closing parenthesis: in the hyphen-joined
# case above the "-" belongs to the prose, not to the number.
_NUM = r"(?<![\d.])(?:(?<![A-Za-z)])[+-])?\d{1,3}(?:[.:]\s*\d+)+"
_HEM_PRE = r"(?<![A-Za-z])[NSEW]"
_HEM_SUF = r"[NSEW](?![A-Za-z])"
_DEG = r"[°º]"
# A number that carries at least one unambiguous coordinate marker.
_NUM_MARKED = (
    rf"(?:{_HEM_PRE}\s*{_NUM}\s*(?:{_DEG})?(?:\s*{_HEM_SUF})?"
    rf"|{_NUM}\s*(?:{_DEG}(?:\s*{_HEM_SUF})?|{_HEM_SUF}(?=\s*[,;)])))"
)
# A number with any-or-no marker; only used on the side opposite a marked one,
# or inside parentheses where context already establishes a coordinate.
_NUM_ANY = rf"(?:{_HEM_PRE}\s*)?{_NUM}\s*(?:{_DEG})?(?:\s*{_HEM_SUF})?"
DECIMAL_DEGREE_PAIR = re.compile(
    rf"(?i)"
    rf"{_NUM_MARKED}\s*[,;]\s*{_NUM_ANY}"
    rf"|{_NUM_ANY}\s*[,;]\s*{_NUM_MARKED}"
    rf"|\(\s*((?:{_HEM_PRE}\s*)?{_NUM}\s*(?:{_DEG})?\s*(?:{_HEM_SUF})?\s*[,;]\s*"
    rf"(?:{_HEM_PRE}\s*)?{_NUM}\s*(?:{_DEG})?\s*(?:{_HEM_SUF})?)\s*\)"
)
ENDPOINT_SPAN = re.compile(
    r"(?is)\b(?:ISTART|START|STARTT?|STAR|END)\b.*"
)


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


# DPWH comparison traces encode how a House reading row relates to the NEP
# baseline. We surface them as budget-change categories the map can filter on.
# Only the unified comparison dataset carries a trace; the other DPWH artifacts
# (leaves, chainage units, NEP source rows) have no comparison signal and stay
# null — a gap to standardize if FMR/NIA/HFEP ever need change tracking too.
CHANGE_TYPE_BY_TRACE = {
    "house_only_candidate": "insertion",            # House has it, NEP does not
    "nep_only_candidate": "deletion",               # NEP has it, House does not
    "candidate_increase": "adjustment_increased",   # matched pair, House > NEP
    "candidate_decrease": "adjustment_decreased",   # matched pair, House < NEP
    "amount_same": "no_change",                     # matched pair, amounts equal
}


def comparison_change_type(trace: str | None, delta) -> str | None:
    """Map a comparison trace (or amount delta) to a budget-change category."""
    if trace in CHANGE_TYPE_BY_TRACE:
        return CHANGE_TYPE_BY_TRACE[trace]
    # Compound traces (e.g. outside_api_then_candidate_decrease) and fuzzy rows
    # fall back to the signed House-minus-NEP delta when one is present.
    if isinstance(delta, (int, float)):
        if delta > 0:
            return "adjustment_increased"
        if delta < 0:
            return "adjustment_decreased"
        return "no_change"
    return "unknown" if trace else None


def snippet(text: str, limit: int = 240) -> str:
    text = re.sub(r"\s+", " ", (text or "").strip())
    return text if len(text) <= limit else text[: limit - 1] + "…"


def has_gps_hint(text: str) -> bool:
    return bool(text and GPS_HINT.search(text))


def candidate_fragments(text: str) -> list[tuple[str, str]]:
    """Return (kind, fragment) candidates from title/body text."""
    if not text or not text.strip():
        return []
    found: list[tuple[str, str]] = []
    seen: set[str] = set()

    def add(kind: str, frag: str) -> None:
        frag = frag.strip()
        if not frag or frag in seen:
            return
        seen.add(frag)
        found.append((kind, frag))

    if re.search(r"(?i)\b(?:ISTART|START|STARTT?|STAR|END)\s*:", text):
        # Prefer the span from the first endpoint marker (FMR-style cells / titles).
        m = ENDPOINT_SPAN.search(text)
        add("endpoint_span", m.group(0) if m else text)
    if re.search(r"(?i)\b(?:LAT(?:ITUDE)?|LON(?:G(?:ITUDE)?)?)\s*:", text):
        add("axis_labelled", text)
    for m in PAREN_PAIR.finditer(text):
        add("paren_pair", m.group(1))
    for m in INLINE_PH_PAIR.finditer(text):
        add("inline_ph_pair", m.group(1))
    for m in DMS_SPAN.finditer(text):
        add("dms_pair", m.group(0))
    # Degree-symbol / hemisphere-letter decimal pairs the narrower patterns above
    # reject. Branch B captures the inner text (parens stripped); branch A has no
    # group, so group(0) is the match itself.
    for m in DECIMAL_DEGREE_PAIR.finditer(text):
        add("degree_pair", (m.group(1) or m.group(0)).strip())
    return found


def classify_points(points: list[dict]) -> str:
    if any(p.get("longitude") is not None and p.get("latitude") is not None for p in points):
        if any(p.get("issues") for p in points):
            return "parsed_with_issues"
        return "parsed"
    if points:
        return "unparsed_candidate"
    return "no_points"


def analyze_text(text: str, *, dedicated_field: bool = False) -> dict | None:
    """Return a hit payload for GPS-bearing text, or None if no GPS signal."""
    text = text or ""
    if dedicated_field:
        if not text.strip():
            return None
        points = endpoint_observations(text)
        return {
            "status": classify_points(points),
            "fragment_kinds": ["dedicated_coordinates_raw"],
            "points": compress_points(points),
            "snippet": snippet(text),
        }

    if not has_gps_hint(text):
        return None
    fragments = candidate_fragments(text)
    if not fragments:
        return {
            "status": "hint_only",
            "fragment_kinds": ["gps_hint"],
            "points": [],
            "snippet": snippet(text),
        }

    all_points: list[dict] = []
    kinds: list[str] = []
    for kind, frag in fragments:
        kinds.append(kind)
        if kind in {"endpoint_span", "axis_labelled"}:
            pts = endpoint_observations(frag)
        else:
            pts = parse_pairs(frag)
            for p in pts:
                p.setdefault("role", "unspecified")
                p.setdefault("source_fragment_raw", frag)
        all_points.extend(pts)

    return {
        "status": classify_points(all_points),
        "fragment_kinds": sorted(set(kinds)),
        "points": compress_points(all_points),
        "snippet": snippet(text),
    }


def compress_points(points: list[dict]) -> list[dict]:
    out = []
    for p in points:
        out.append({
            "longitude": p.get("longitude"),
            "latitude": p.get("latitude"),
            "role": p.get("role"),
            "section_label": p.get("section_label"),
            "rules": p.get("rules") or [],
            "issues": p.get("issues") or [],
            "source_fragment": snippet(p.get("source_fragment_raw") or p.get("raw") or "", 160),
        })
    return out


def load_json(rel: str):
    path = REPO / rel
    return path, json.loads(path.read_text()), sha256(path)


def iter_fmr_projects(rel: str, dataset: str):
    path, data, digest = load_json(rel)
    for node in data.get("nodes") or []:
        if node.get("kind") != "project":
            continue
        src = node.get("source") or {}
        ws_route = "house" if dataset == "hgab_fmr" else "nep"
        amt = node.get("printed_amount_php")
        yield {
            "dataset": dataset,
            "source_path": rel,
            "record_id": node["id"],
            "fields": [
                ("coordinates_raw", node.get("coordinates_raw") or "", True),
                ("title", node.get("title") or node.get("label") or "", False),
            ],
            "title": node.get("title") or node.get("label") or "",
            "amount": amt,
            "sources": [
                evidence_ref(
                    src.get("source_pdf"), src.get("pdf_page"),
                    node=node["id"], workspace="fmr", route=ws_route,
                ),
            ],
            "source_sha256": digest,
        }


def iter_comparison(rel: str = "analysis/data/comparison_projects_2027.json"):
    path, data, digest = load_json(rel)
    for row in data.get("projects") or []:
        fields = [("title", row.get("title") or "", False)]
        sources = []
        for side in ("nep", "second", "third"):
            side_obj = row.get(side)
            if isinstance(side_obj, dict) and side_obj.get("title"):
                fields.append((f"{side}.title", side_obj["title"], False))
        nep = row.get("nep") or {}
        second = row.get("second") or {}
        third = row.get("third") or {}
        for side_obj, doc, ws, note in (
            (nep, "dbm-nep-data/NEP-2027-VOLUME-2B_OCR.pdf", None,
             "DBM NEP Volume II-B row (unified comparison title)"),
            (second, "HB_BUDGET/3 - HB 10858 VOL IC.pdf", ("house", "second"),
             "House 2nd reading Volume I-C row (unified comparison title)"),
            (third, "HB_BUDGET_3rd_reading/3- HB 10858 FOR 3RD READING VOL I-C .pdf",
             ("house", "third"), "House 3rd reading Volume I-C row (unified comparison title)"),
        ):
            if not isinstance(side_obj, dict) or not isinstance(side_obj.get("pdf_page"), int):
                continue
            node, params = None, None
            if ws and side_obj.get("native_node_id"):
                node = side_obj["native_node_id"]
                params = {"view": "projects", "reading": ws[1]}
            sources.append(evidence_ref(
                doc, side_obj.get("pdf_page"), node=node,
                workspace="dpwh", route="house" if ws else "nep",
                params=params, note=note,
            ))
        # Amounts: House side prefers the 3rd reading, falls back to 2nd; the
        # NEP side carries its own printed amount. One of the two may be None
        # for insertion/deletion rows — that is exactly what change_type says.
        amount_house = third.get("amount_php") if isinstance(third.get("amount_php"), (int, float)) \
            else second.get("amount_php")
        amount_nep = nep.get("amount_php") if isinstance(nep.get("amount_php"), (int, float)) else None
        yield {
            "dataset": "dpwh_comparison_2027",
            "source_path": rel,
            "record_id": row.get("id") or "",
            "fields": fields,
            "title": row.get("title") or "",
            "pap": row.get("pap") or "",
            "amount": amount_house if amount_house is not None else amount_nep,
            "amount_house": amount_house,
            "amount_nep": amount_nep,
            "amount_delta": row.get("house_minus_nep_php"),
            "change_type": comparison_change_type(row.get("trace"), row.get("house_minus_nep_php")),
            "sources": [s for s in sources if s],
            "source_sha256": digest,
        }


def iter_leaves(rel: str = "analysis/data/hb_dpwh_leaves_corrected_v5.json"):
    path, data, digest = load_json(rel)
    prov = data.get("provenance") or {}
    doc = prov.get("source_pdf") or "HB_BUDGET/3 - HB 10858 VOL IC.pdf"
    # v5 leaves are corrected extractions of the 2nd-reading I-C tree; join
    # back to native nodes by printed page + normalized title for tree links.
    norm = lambda s: re.sub(r"\s+", " ", (s or "").strip()).casefold()
    _, ic_data, _ = load_json("analysis/data/hb_dpwh_native_ic_projects.json")
    by_page: dict[int, dict[str, str]] = {}
    stack = [ic_data.get("root")]
    while stack:
        node = stack.pop()
        if isinstance(node, dict):
            page = (node.get("source") or {}).get("pdf_page")
            if isinstance(page, int) and node.get("label"):
                by_page.setdefault(page, {})[norm(node["label"])] = node["id"]
            stack.extend(node.get("children") or [])
    for i, row in enumerate(data.get("leaves") or []):
        rid = row.get("source_record_id") or row.get("id") or f"leaf:{row.get('pdf_page')}:{row.get('row')}:{i}"
        node = by_page.get(row.get("pdf_page"), {}).get(norm(row.get("project")))
        yield {
            "dataset": "hb_dpwh_leaves_v5",
            "source_path": rel,
            "record_id": str(rid),
            "fields": [("project", row.get("project") or "", False)],
            "title": row.get("project") or "",
            "pap": row.get("pap") or "",
            "amount": row.get("amount_php"),
            "sources": [
                evidence_ref(doc, row.get("pdf_page"), node=node,
                             workspace="dpwh", route="house",
                             params={"view": "projects", "reading": "second"},
                             note="House 2nd reading Volume I-C leaf row"),
            ],
            "source_sha256": digest,
        }


def iter_nep_source(rel: str = "analysis/data/nep_2027_source_projects.json"):
    path, data, digest = load_json(rel)
    doc = data.get("source_pdf") or ""
    doc = doc.split("paddle_pdf_ocr_v2/")[-1]
    doc = "dbm-nep-data/" + doc.split("/")[-1] if doc else ""
    for row in data.get("projects") or []:
        yield {
            "dataset": "nep_2027_source_projects",
            "source_path": rel,
            "record_id": row.get("source_id") or "",
            "fields": [("title", row.get("title") or "", False)],
            "title": row.get("title") or "",
            "pap": row.get("pap3") or "",
            "amount": row.get("amount_php"),
            "sources": [
                evidence_ref(doc, row.get("pdf_page"),
                             node=row.get("source_id"), workspace="dpwh", route="nep",
                             note="DBM NEP Volume II-B source row"),
                ],
            "source_sha256": digest,
        }


def iter_chainage(rel: str = "analysis/data/chainage_units_2027.json"):
    path, data, digest = load_json(rel)
    # Chainage ids prefix their source tree: nep:pNNN:rR → NEP verification
    # tree, hb2:/hb3:cNNNN → the House I-C trees (2nd/3rd reading). The units
    # are derived rows, so pdf_page is resolved by joining the node id back to
    # the native trees.
    nep_pages = nep_page_lookup()
    ic2_pages = ic_page_lookup("second")
    ic3_pages = ic_page_lookup("third")
    for row in data.get("units") or []:
        rid = row.get("id") or ""
        sources = []
        if rid.startswith("nep:"):
            node = rid[4:]
            sources.append(evidence_ref(
                "dbm-nep-data/NEP-2027-VOLUME-2B_OCR.pdf", nep_pages.get(node),
                node=node, workspace="dpwh", route="nep",
                note="DBM NEP Volume II-B row (chainage-derived unit)",
            ))
        for prefix, reading, pages in (("hb2:", "second", ic2_pages), ("hb3:", "third", ic3_pages)):
            if rid.startswith(prefix):
                doc = ("HB_BUDGET/3 - HB 10858 VOL IC.pdf" if reading == "second"
                       else "HB_BUDGET_3rd_reading/3- HB 10858 FOR 3RD READING VOL I-C .pdf")
                node = rid[4:]
                sources.append(evidence_ref(
                    doc, pages.get(node), node=node,
                    workspace="dpwh", route="house",
                    params={"view": "projects", "reading": reading},
                    note=f"House {reading} reading Volume I-C row (chainage-derived unit)",
                ))
        yield {
            "dataset": "chainage_units_2027",
            "source_path": rel,
            "record_id": rid,
            "fields": [("title", row.get("title") or "", False)],
            "title": row.get("title") or "",
            "pap": row.get("pap") or "",
            "amount": row.get("amount_php"),
            "sources": [s for s in sources if s],
            "source_sha256": digest,
        }


def iter_tree_labels(rel: str, dataset: str, kinds: set[str], label_keys: tuple[str, ...] = ("label", "label_raw")):
    path, data, digest = load_json(rel)
    for node in data.get("nodes") or []:
        if node.get("kind") not in kinds:
            continue
        fields = []
        for key in label_keys:
            if node.get(key):
                fields.append((key, node[key], False))
        if not fields:
            continue
        src = node.get("source") or {}
        amt = node.get("printed_amount_php")
        if not isinstance(amt, (int, float)):
            amt = node.get("derived_amount_php")
        yield {
            "dataset": dataset,
            "source_path": rel,
            "record_id": node.get("id") or "",
            "fields": fields,
            "title": node.get("label") or node.get("title") or "",
            "amount": amt,
            "sources": [
                evidence_ref(src.get("source_pdf"), src.get("pdf_page"),
                             node=node.get("id"), workspace="nia", route="house"),
            ],
            "source_sha256": digest,
        }


def iter_nia_dataset(rel: str = "analysis-nia/data/nep_nia_dataset.json"):
    path, data, digest = load_json(rel)
    for row in data.get("projects") or []:
        prov = row.get("provenance") or {}
        page = prov.get("page")
        sources = [evidence_ref(
            "dbm-other-nep-line-data/NIA.pdf", page,
            node=row.get("id"), workspace="nia", route="nep",
            note="DBM NEP standalone NIA annex row",
        )]
        yield {
            "dataset": "nep_nia_projects",
            "source_path": rel,
            "record_id": row.get("id") or str(row.get("seq") or ""),
            "fields": [("label", row.get("label") or "", False)],
            "title": row.get("label") or "",
            "amount": row.get("amount_php"),
            "sources": sources,
            "source_sha256": digest,
        }


def iter_hfep_items(rel: str, dataset: str):
    path, data, digest = load_json(rel)
    for row in data.get("items") or []:
        src = row.get("source") or {}
        ws_route = "house" if dataset == "hgab_hfep" else "nep"
        doc = ("HB_BUDGET/2 - HB 10858 VOL IB.pdf" if dataset == "hgab_hfep"
               else "dbm-nep-data/NEP-2027-VOLUME-2A_OCR.pdf")
        note = ("House annex health-facility label" if dataset == "hgab_hfep"
                else "DBM NEP Volume II-A health-facility row")
        amounts = row.get("amounts_php") or {}
        amt = amounts.get("total")
        if not isinstance(amt, (int, float)):
            amt = amounts.get("infrastructure")
        yield {
            "dataset": dataset,
            "source_path": rel,
            "record_id": row.get("id") or "",
            "fields": [
                ("label", row.get("label") or "", False),
                ("label_raw", row.get("label_raw") or "", False),
            ],
            "title": row.get("label") or "",
            "amount": amt,
            "sources": [
                evidence_ref(doc, src.get("pdf_page"),
                             node=row.get("id"), workspace="hfep", route=ws_route, note=note),
            ],
            "source_sha256": digest,
        }


DATASETS = [
    ("hgab_fmr", lambda: iter_fmr_projects("other-analysis/data/hgab_fmr_tree.json", "hgab_fmr")),
    ("nep_fmr", lambda: iter_fmr_projects("other-analysis/data/nep_fmr_tree.json", "nep_fmr")),
    ("dpwh_comparison_2027", iter_comparison),
    ("hb_dpwh_leaves_v5", iter_leaves),
    ("nep_2027_source_projects", iter_nep_source),
    ("chainage_units_2027", iter_chainage),
    ("hgab_nia", lambda: iter_tree_labels(
        "analysis-nia/data/hgab_nia_tree.json", "hgab_nia", {"project"})),
    ("nep_nia_projects", iter_nia_dataset),
    ("hgab_hfep", lambda: iter_hfep_items(
        "analysis-hfep/data/hgab_hfep_data_list.json", "hgab_hfep")),
    ("nep_hfep", lambda: iter_hfep_items(
        "analysis-hfep/data/nep_hfep_data_list.json", "nep_hfep")),
]


def scan_record(record: dict) -> dict | None:
    field_hits = []
    for field, text, dedicated in record["fields"]:
        hit = analyze_text(text, dedicated_field=dedicated)
        if hit is None:
            continue
        field_hits.append({"field": field, **hit})
    if not field_hits:
        return None
    statuses = [fh["status"] for fh in field_hits]
    if "parsed" in statuses:
        status = "parsed"
    elif "parsed_with_issues" in statuses:
        status = "parsed_with_issues"
    elif "unparsed_candidate" in statuses:
        status = "unparsed_candidate"
    else:
        status = "hint_only"
    return {
        "dataset": record["dataset"],
        "source_path": record["source_path"],
        "record_id": record["record_id"],
        "title": snippet(record.get("title") or "", 200),
        "pap": record.get("pap") or "",
        "status": status,
        "amount": record.get("amount"),
        "change_type": record.get("change_type"),
        "amount_delta": record.get("amount_delta"),
        "sources": [s for s in (record.get("sources") or []) if s],
        "fields": field_hits,
        "point_count": sum(
            1 for fh in field_hits for p in fh["points"]
            if p.get("longitude") is not None and p.get("latitude") is not None
        ),
    }


def build() -> dict:
    hits = []
    scanned_by_dataset: Counter = Counter()
    hits_by_dataset: Counter = Counter()
    status_by_dataset: dict[str, Counter] = {}
    source_files: dict[str, str] = {}

    for name, factory in DATASETS:
        print(f"scanning {name}…", flush=True)
        status_by_dataset[name] = Counter()
        for record in factory():
            scanned_by_dataset[name] += 1
            source_files[record["source_path"]] = record["source_sha256"]
            hit = scan_record(record)
            if hit is None:
                continue
            hits.append(hit)
            hits_by_dataset[name] += 1
            status_by_dataset[name][hit["status"]] += 1
        print(
            f"  scanned {scanned_by_dataset[name]} · gps hits {hits_by_dataset[name]}",
            flush=True,
        )

    inventory = {
        "schema_version": 1,
        "generator": "gps-analysis/scan_gps_inventory.py",
        "coordinate_unit": "decimal degrees",
        "coordinate_column_order": "longitude, latitude",
        "philippines_orientation_bounds": {"lat": [4, 22], "lon": [116, 127]},
        "note": (
            "Inventory of records with GPS-like text. Not a certified geocode. "
            "Parse rules follow the FMR coordinate normalizer; lon/lat order may "
            "be reordered when hemispheres or |value|>90 imply longitude-first."
        ),
        "source_files": source_files,
        "hits": hits,
    }

    summary = {
        "schema_version": 1,
        "generator": inventory["generator"],
        "records_scanned": dict(scanned_by_dataset),
        "records_with_gps": dict(hits_by_dataset),
        "status_by_dataset": {k: dict(v) for k, v in status_by_dataset.items()},
        "totals": {
            "records_scanned": sum(scanned_by_dataset.values()),
            "records_with_gps": len(hits),
            "parsed": sum(1 for h in hits if h["status"] == "parsed"),
            "parsed_with_issues": sum(1 for h in hits if h["status"] == "parsed_with_issues"),
            "unparsed_candidate": sum(1 for h in hits if h["status"] == "unparsed_candidate"),
            "hint_only": sum(1 for h in hits if h["status"] == "hint_only"),
            "points_parsed": sum(h["point_count"] for h in hits),
            "with_amount": sum(1 for h in hits if isinstance(h.get("amount"), (int, float))),
            "by_change_type": dict(Counter(h.get("change_type") for h in hits if h.get("change_type"))),
        },
        "source_files": source_files,
    }
    return {"inventory": inventory, "summary": summary}


def write_outputs(bundle: dict) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    inventory, summary = bundle["inventory"], bundle["summary"]
    INVENTORY_JSON.write_text(json.dumps(inventory, indent=2, ensure_ascii=False) + "\n")
    SUMMARY_JSON.write_text(json.dumps(summary, indent=2, ensure_ascii=False) + "\n")

    fieldnames = [
        "dataset", "record_id", "status", "change_type", "amount_php",
        "point_count", "fields", "fragment_kinds", "longitude", "latitude",
        "title", "source_path", "evidence_document", "evidence_page",
    ]
    with HITS_CSV.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=fieldnames)
        writer.writeheader()
        for hit in inventory["hits"]:
            kinds = sorted({
                k for fh in hit["fields"] for k in fh.get("fragment_kinds") or []
            })
            coords = [
                (p["longitude"], p["latitude"])
                for fh in hit["fields"] for p in fh["points"]
                if p.get("longitude") is not None and p.get("latitude") is not None
            ]
            lon = coords[0][0] if coords else ""
            lat = coords[0][1] if coords else ""
            page_refs = [s for s in hit.get("sources") or [] if s.get("pdf_page")]
            writer.writerow({
                "dataset": hit["dataset"],
                "record_id": hit["record_id"],
                "status": hit["status"],
                "change_type": hit.get("change_type") or "",
                "amount_php": hit.get("amount") if hit.get("amount") is not None else "",
                "point_count": hit["point_count"],
                "fields": "|".join(fh["field"] for fh in hit["fields"]),
                "fragment_kinds": "|".join(kinds),
                "longitude": lon,
                "latitude": lat,
                "title": hit["title"],
                "source_path": hit["source_path"],
                "evidence_document": "|".join(s["document"] for s in page_refs),
                "evidence_page": "|".join(str(s["pdf_page"]) for s in page_refs),
            })


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Verify prior outputs exist and summarize")
    args = parser.parse_args(argv)
    if args.check:
        for path in (INVENTORY_JSON, SUMMARY_JSON, HITS_CSV):
            if not path.is_file():
                print(f"missing: {path.relative_to(REPO)}", file=sys.stderr)
                return 1
        summary = json.loads(SUMMARY_JSON.read_text())
        print(json.dumps(summary["totals"], indent=2))
        return 0
    bundle = build()
    write_outputs(bundle)
    print(json.dumps(bundle["summary"]["totals"], indent=2))
    print(f"wrote {INVENTORY_JSON.relative_to(REPO)}")
    print(f"wrote {SUMMARY_JSON.relative_to(REPO)}")
    print(f"wrote {HITS_CSV.relative_to(REPO)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
