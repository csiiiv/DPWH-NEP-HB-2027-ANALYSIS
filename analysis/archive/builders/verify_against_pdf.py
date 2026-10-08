#!/usr/bin/env python3
"""
Crosscheck questionable HB 10858 leaf rows against the source PDF via the
PaddleOCR JSON (which retains per-block bbox coordinates per page).

Questionable classes verified:
  A. validation == 'spillover'      (OCR page-break cascades, ₱43.97B bucket)
  B. validation == 'dup_in_block'   (duplicate name+amount rows)
  C. suspicious short labels        (province-only / fragment labels)
  D. top-100 largest leaves         (amount spot-check)

Method:
  1. Build a per-page normalized (whitespace-stripped) text index over the
     942 OCR pages of VOL I-C.
  2. For each questionable leaf, locate candidate pages by project text;
     disambiguate with the formatted amount when needed (handles multi-page
     spillover by also scanning page-pair joins).
  3. Re-parse the page's HTML tables and extract the printed row cells.
  4. Verdict per row: EXACT_MATCH / AMOUNT_MISMATCH / TEXT_ONLY / NOT_FOUND.
  5. Render PDF crops (page + table bbox) for the largest mismatches using
     PyMuPDF, saved under analysis/evidence/.

Outputs:
  archive/data/pdf_verification.json    per-row evidence (historical)
  archive/docs/verify_report.md         human-readable summary (historical)
  analysis/evidence/*.png          visual crops (top mismatches)
"""

import sys
from pathlib import Path as _Path
sys.path[:0] = [str(_Path(__file__).resolve().parents[2]), str(_Path(__file__).resolve().parents[2] / 'builders')]
from paths import ANALYSIS, REPO, DATA, VIEWERS, DOCS, ARCHIVE, EVIDENCE



import json
import re
import html as htmllib
from collections import Counter, defaultdict
from pathlib import Path

LEAVES_FILE = "analysis/archive/data/hb_dpwh_leaves_validated.json"
OCR_JSON = "HB_BUDGET/3 - HB 10858 VOL IC.pdf_by_PaddleOCR-VL-1.6.json"
PDF_FILE = "HB_BUDGET/3 - HB 10858 VOL IC.pdf"
OUT_JSON = "analysis/archive/data/pdf_verification.json"
OUT_MD = "analysis/archive/docs/verify_report.md"
EVIDENCE_DIR = Path("analysis/evidence")

TOP_N_SPOT = 100          # largest leaves to spot-check
MAX_CROPS = 24            # evidence images to render


_ROMAN_UNI = {"Ⅰ": "i", "Ⅱ": "ii", "Ⅲ": "iii", "Ⅳ": "iv", "Ⅴ": "v",
              "Ⅵ": "vi", "Ⅶ": "vii", "Ⅷ": "viii", "Ⅸ": "ix", "Ⅹ": "x",
              "Ⅺ": "xi", "Ⅻ": "xii", "ⅰ": "i", "ⅱ": "ii", "ⅲ": "iii",
              "ⅳ": "iv", "ⅴ": "v", "ⅵ": "vi", "ⅶ": "vii", "ⅷ": "viii",
              "ⅸ": "ix", "ⅹ": "x"}


def nospace(s):
    s = htmllib.unescape(s or "")       # &amp; -> & before the & -> and map
    s = s.replace("\\n", "")            # literal backslash-n from OCR merges
    s = s.replace("&", "and")           # OCR alternates & / and
    for k, v in _ROMAN_UNI.items():
        s = s.replace(k, v)
    return re.sub(r"\s+", "", s).lower()


def fmt_amount(v):
    return f"{v:,.0f}" if v else None


def parse_page_tables(md_text):
    """Extract rows (list of cell strings) from the page's HTML tables."""
    rows = []
    for tbl in re.findall(r"<table[^>]*>(.*?)</table>", md_text, re.S | re.I):
        for tr in re.findall(r"<tr[^>]*>(.*?)</tr>", tbl, re.S | re.I):
            cells = [htmllib.unescape(re.sub(r"<[^>]+>", "", c)).strip()
                     for c in re.findall(r"<td[^>]*>(.*?)</td>", tr, re.S | re.I)]
            if cells:
                rows.append(cells)
    return rows


def amount_in_cell(c):
    """All bare formatted integers in a cell (merged cells hold several)."""
    s = (c or "").replace(",", "")
    return [int(x) for x in re.findall(r"(?<!\d)\d{3,}(?!\d)", s)]


def build_page_index(ocr):
    pages = []
    for p in ocr:
        md = p.get("markdown", {}).get("text", "") or ""
        blocks = p.get("prunedResult", {}).get("parsing_res_list", [])
        # bbox per table block, in block order of appearance in markdown
        tb = [b["block_bbox"] for b in blocks if b.get("block_label") == "table"]
        pages.append({"text": md, "ns": nospace(md), "table_bboxes": tb})
    return pages


def extract_row(pages, page_idx, needle_ns):
    """Find the printed table row on a page whose first cell matches needle.
    Returns (cells, table_block_index) or (None, None)."""
    best = None
    for t_i, tbl in enumerate(re.findall(r"<table[^>]*>(.*?)</table>",
                                         pages[page_idx]["text"], re.S | re.I)):
        for tr in re.findall(r"<tr[^>]*>(.*?)</tr>", tbl, re.S | re.I):
            cells = [htmllib.unescape(re.sub(r"<[^>]+>", "", c)).strip()
                     for c in re.findall(r"<td[^>]*>(.*?)</td>", tr, re.S | re.I)]
            if cells and needle_ns in nospace(" ".join(cells[:2])):
                cand = (cells, t_i)
                # prefer a row starting exactly with the needle
                if cells[0] and nospace(cells[0]) == needle_ns:
                    return cand
                best = best or cand
    return best


def verdict_for(leaf, pages):
    name = (leaf["project"] or "").strip()
    amt = leaf["amount_php"]
    needle = nospace(name)
    if not needle:
        return {"verdict": "NOT_FOUND", "reason": "empty label"}
    frag = nospace(name[:40])
    needles = [needle] + ([frag] if frag and frag != needle else [])

    # collect candidate (page, cells, table_idx, label_kind) per needle
    cands = []
    for nd_i, nd in enumerate(needles):
        for i in range(len(pages)):
            if nd not in pages[i]["ns"]:
                continue
            # gather ALL matching rows on the page; prefer one carrying the amount
            rows = []
            for t_i, tbl in enumerate(re.findall(r"<table[^>]*>(.*?)</table>",
                                                 pages[i]["text"], re.S | re.I)):
                for tr in re.findall(r"<tr[^>]*>(.*?)</tr>", tbl, re.S | re.I):
                    cells = [htmllib.unescape(re.sub(r"<[^>]+>", "", c)).strip()
                             for c in re.findall(r"<td[^>]*>(.*?)</td>", tr,
                                                 re.S | re.I)]
                    if cells and any(nd in nospace(" ".join(cells[:2]))
                                     for c in cells):
                        rows.append((cells, t_i))
            if not rows:
                cands.append((i, None, None, "fragment" if nd_i else "page"))
                continue
            exact_rows = [rw for rw in rows
                          if any(nospace(c) == nd for c in rw[0])]
            pool = exact_rows or rows
            if amt:
                with_amt = [rw for rw in pool
                            if amt in [a for c in rw[0]
                                       for a in amount_in_cell(c)]]
                pool = with_amt or pool
            cells, t_i = pool[0]
            exact = any(nospace(c) == nd for c in cells)
            cell_amts = [a for c in cells for a in amount_in_cell(c)]
            amt_ok = bool(amt and amt in cell_amts)
            cands.append((i, cells, t_i,
                          "exact+amt" if exact and amt_ok else
                          "exact" if exact else
                          "amt" if amt_ok else
                          "fragment" if nd_i else "substring"))
    if not cands:
        # page-join attempt (text spanning two OCR pages)
        for i in range(len(pages) - 1):
            join = nospace(pages[i]["text"][-400:] + pages[i + 1]["text"][:400])
            if needle and needle in join:
                return {"verdict": "TEXT_ONLY", "how": "page-join",
                        "page": i + 1, "printed_cells": None,
                        "printed_amounts": [], "table_block": None,
                        "table_bbox": None, "other_pages": [],
                        "note": "row text spans a page boundary in the OCR"}
        return {"verdict": "NOT_FOUND", "reason": "text not located in OCR"}

    rank = {"exact+amt": 0, "exact": 1, "amt": 2, "substring": 3,
            "fragment": 4, "page": 5}
    cands.sort(key=lambda c: rank[c[3]])
    p_i, cells, t_i, kind = cands[0]
    ev = {
        "page": p_i + 1, "how": kind,
        "printed_cells": cells,
        "table_block": t_i,
        "table_bbox": pages[p_i]["table_bboxes"][t_i] if t_i is not None and
                      t_i < len(pages[p_i]["table_bboxes"]) else None,
        "other_pages": sorted({c[0] + 1 for c in cands[1:8]}),
    }
    printed_amts = sorted({a for c in (cells or []) for a in amount_in_cell(c)})
    ev["printed_amounts"] = printed_amts
    if amt and printed_amts:
        ev["verdict"] = "EXACT_MATCH" if amt in printed_amts else "AMOUNT_MISMATCH"
        if ev["verdict"] == "AMOUNT_MISMATCH":
            ev["printed_amount"] = printed_amts[0]
    elif cells:
        ev["verdict"] = "TEXT_ONLY"
    else:
        ev["verdict"] = "ROW_NOT_IN_TABLE"
    return ev


def main():
    leaves = json.load(open(LEAVES_FILE, encoding="utf-8"))["leaves"]
    print("loading OCR JSON (11 MB)…")
    ocr = json.load(open(OCR_JSON, encoding="utf-8"))
    pages = build_page_index(ocr)
    del ocr
    print(f"indexed {len(pages)} pages")

    # ---------------- select questionable rows ------------------------------
    targets = []          # (leaf, reason)
    seen_rows = set()
    for l in leaves:
        if l["validation"] == "spillover":
            targets.append((l, "spillover"))
        elif l["validation"] == "dup_in_block":
            targets.append((l, "duplicate"))
        elif len((l["project"] or "").strip()) <= 15 or \
                (l["project"] or "").strip().title() in (
                    "Batangas", "Roads", "Bridge", "Bulacan", "Province"):
            targets.append((l, "short-label"))
        seen_rows.add(id(l))
    big = sorted((l for l in leaves if id(l) not in {id(t[0]) for t in targets}
                  and (l["amount_php"] or 0) > 0),
                 key=lambda l: -l["amount_php"])[:TOP_N_SPOT]
    targets += [(l, f"top-{TOP_N_SPOT} spot-check") for l in big]
    print(f"verifying {len(targets)} rows "
          f"({Counter(r for _, r in targets)})…")

    results = []
    for k, (leaf, reason) in enumerate(targets):
        ev = verdict_for(leaf, pages)
        rec = {
            "reason": reason,
            "project": leaf["project"], "amount_php": leaf["amount_php"],
            "region": leaf["region"], "pap": leaf["pap"],
            "md_row": leaf["row"], "orig_validation": leaf["validation"],
            **ev,
        }
        results.append(rec)
        if (k + 1) % 50 == 0:
            print(f"  {k+1}/{len(targets)}")

    # ---------------- summary ----------------------------------------------
    vc = Counter(r["verdict"] for r in results)
    by_reason = defaultdict(Counter)
    for r in results:
        by_reason[r["reason"]][r["verdict"]] += 1
    mism = [r for r in results if r["verdict"] == "AMOUNT_MISMATCH"]
    nf = [r for r in results if r["verdict"] == "NOT_FOUND"]
    mism_val = sum(abs((r.get("printed_amount") or 0) - (r["amount_php"] or 0))
                   for r in mism)

    out = {
        "meta": {
            "source_pdf": PDF_FILE, "ocr_json": OCR_JSON,
            "pages": len(pages),
            "note": ("page = 1-based PDF page; table_bbox = pixel coords "
                     "[x0,y0,x1,y1] of the containing table block on that page"),
        },
        "verdict_counts": dict(vc),
        "mismatch_amount_delta_total": mism_val,
        "results": results,
    }
    with open(OUT_JSON, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)

    # ---------------- evidence crops ---------------------------------------
    EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)
    crop_rows = sorted(mism + nf,
                       key=lambda r: -(r["amount_php"] or 0))[:MAX_CROPS]
    if crop_rows:
        import pymupdf as fitz
        doc = fitz.open(PDF_FILE)
        for r in crop_rows:
            pno = r.get("page")
            if not pno or pno > len(doc):
                continue
            page = doc[pno - 1]
            bbox = r.get("table_bbox")
            rect = None
            if bbox:
                x0, y0, x1, y1 = bbox
                # OCR bbox is in rendered-image pixels; scale to PDF points
                sx = page.rect.width / max(1, page.get_pixmap().width) \
                    if hasattr(page, "get_pixmap") else 1.0
                r0 = fitz.Rect(x0, y0, x1, y1)
                # if bbox exceeds page bounds, it's image-space: scale it
                if r0.x1 > page.rect.width or r0.y1 > page.rect.height:
                    pm_w = page.get_pixmap(matrix=fitz.Matrix(1, 1)).width
                    pm_h = page.get_pixmap(matrix=fitz.Matrix(1, 1)).height
                    sx = page.rect.width / max(1, pm_w)
                    sy = page.rect.height / max(1, pm_h)
                    r0 = fitz.Rect(x0 * sx, y0 * sy, x1 * sx, y1 * sy)
                pad = 6
                rect = fitz.Rect(max(0, r0.x0 - pad), max(0, r0.y0 - pad),
                                 min(page.rect.width, r0.x1 + pad),
                                 min(page.rect.height, r0.y1 + pad))
                if rect.is_empty or rect.width < 10 or rect.height < 10:
                    rect = None
            if rect is None:
                rect = page.rect
            pix = page.get_pixmap(matrix=fitz.Matrix(2, 2), clip=rect)
            name = f"p{pno:04d}_{r['verdict'].lower()}_mdrow{r['md_row']}.png"
            pix.save(EVIDENCE_DIR / name)
            r["evidence_png"] = f"analysis/evidence/{name}"
        doc.close()
        with open(OUT_JSON, "w", encoding="utf-8") as f:
            json.dump(out, f, ensure_ascii=False, indent=1)

    # ---------------- markdown report ---------------------------------------
    def amt(x):
        return f"₱{(x or 0)/1e9:.3f}B" if (x or 0) >= 1e9 else f"₱{(x or 0)/1e6:.1f}M"

    lines = [
        "# HB 10858 VOL I-C — PDF verification of questionable rows",
        "",
        f"Source: `{PDF_FILE}` via `{OCR_JSON}` ({len(pages)} pages, bbox-aware).",
        f"Rows verified: **{len(results)}** — "
        + ", ".join(f"`{k}`×{v}" for k, v in sorted(by_reason.items(),
                                                    key=lambda kv: -sum(kv[1].values()))),
        "",
        "| Verdict | Count |",
        "|---|---|",
    ]
    for v, c in vc.most_common():
        lines.append(f"| {v} | {c} |")
    lines += ["", f"Total absolute amount delta on mismatches: **{amt(mism_val)}**", ""]

    for reason, cnts in sorted(by_reason.items(), key=lambda kv: -sum(kv[1].values())):
        lines.append(f"## `{reason}` ({sum(cnts.values())} rows)")
        lines.append("")
        for v, c in cnts.most_common():
            lines.append(f"- {v}: {c}")
        sub = [r for r in results if r["reason"] == reason
               and r["verdict"] in ("AMOUNT_MISMATCH", "NOT_FOUND")]
        sub.sort(key=lambda r: -(r["amount_php"] or 0))
        if sub:
            lines += ["", "| Project | Parsed | Printed | Δ | Page | Verdict |",
                      "|---|---|---|---|---|---|"]
            for r in sub[:15]:
                pa = r.get("printed_amount")
                d = (pa - r["amount_php"]) if pa else None
                lines.append(
                    f"| {(r['project'] or '')[:60] or '∅'} | {amt(r['amount_php'])} "
                    f"| {amt(pa) if pa else '—'} | {amt(d) if d is not None else '—'} "
                    f"| {r.get('page','—')} | {r['verdict']} |")
        lines.append("")

    if crop_rows:
        lines.append("## Evidence crops")
        lines.append("")
        for r in crop_rows[:12]:
            png = r.get("evidence_png", "")
            lines.append(f"### {r['verdict']} — {amt(r['amount_php'])} — "
                         f"page {r.get('page')} — md-row {r['md_row']}")
            lines.append("")
            lines.append(f"![{r['verdict']} page {r.get('page')}]({png})")
            lines.append("")

    with open(OUT_MD, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))

    print("\nverdicts:", dict(vc))
    print(f"mismatch total |Δ|: {mism_val/1e9:.3f}B")
    print(f"crops: {len(crop_rows)} under {EVIDENCE_DIR}/")
    print("wrote", OUT_JSON, "and", OUT_MD)


if __name__ == "__main__":
    main()
