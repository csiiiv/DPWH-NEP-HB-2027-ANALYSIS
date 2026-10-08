#!/usr/bin/env python3
"""
Native text-layer extractor for HB 10858 volume PDFs (digital InDesign PDFs).

Geometry-first pipeline, no OCR:

  1. words -> visual rows with tolerance-based y-merging (label and amount
     tokens of one printed row can differ by ~0.3pt in y; rounding must not
     split them)
  2. mirrored margins: odd pages shift content right by ~13.6pt vs even
     pages; label x is normalized by page parity before band matching
  3. printed line-number echoes (left margin + right margin) are stripped
  4. amount rows = rows with >=1 amount token in the numeric column band
     (x>280); stray numbers inside labels (loan nos, dates) are ignored
  5. label-x indent bands (built from amount rows only) = outline levels;
     wrapped-name fragments at a band attach to the next amount row in the
     same band; consecutive duplicate-printed headings collapse to one
  6. validation: every internal node must satisfy
     sum(leaf descendant amounts) == printed amount

Usage:
  python3 hb_native_extract3.py <volume.pdf> [start_page] [end_page] [out.json]
"""
import json
import re
import sys

import pymupdf

AMT = re.compile(r"^\d{1,3}(,\d{3}){1,}$")
SMALL_INT = re.compile(r"^\d{1,3}$")
SUBTOTAL = re.compile(r"^(Sub-total|Subtotal|Total)\b", re.I)
REGION_RE = re.compile(
    r"^(Region [IVX]{1,4}[A-B]?\b[-–]? ?|National Capital Region \(?NCR?\)?\b"
    r"|Cordillera Administrative Region\b|Negros Island Region \(?NIR?\)?\b"
    r"|Automatically Appropriated)")
DEO_RE = re.compile(r"(District Engineering Office|Central Office\b"
                    r"|Regional Office\b|District Office\b)")
FUNDING_RE = re.compile(r"^(Loan Proceeds|GOP Counterpart|Grant Proceeds"
                        r"|GOP Equity|Counterpart Funding)\b", re.I)
ODD_SHIFT = 13.6  # odd pages: content shifted right by this much
Y_MERGE = 2.5     # tokens within this y distance belong to the same row


def visual_rows(page):
    """Tolerance-based y clustering: sort words by y, start new row when the
    gap to the current row's baseline exceeds Y_MERGE."""
    words = sorted(page.get_text("words"), key=lambda w: (w[1], w[0]))
    rows = []
    for w in words:
        if rows and w[1] - rows[-1][0] <= Y_MERGE:
            rows[-1][1].append(w)
            # keep the min y as anchor
            rows[-1][0] = min(rows[-1][0], w[1])
        else:
            rows.append([w[1], [w]])
    out = []
    for _, ws in rows:
        ws.sort(key=lambda w: w[0])
        out.append([(w[0], w[4]) for w in ws])
    return out


def strip_echoes(toks):
    """Drop the left printed line numbers and their right-margin echoes."""
    left = None
    while toks and SMALL_INT.match(toks[0][1]) and toks[0][0] < 70:
        left = toks[0]
        toks = toks[1:]
    while toks and SMALL_INT.match(toks[-1][1]):
        r = toks[-1]
        if (left and r[1] == left[1] and r[0] > 540) or r[0] > 583:
            toks = toks[:-1]
        else:
            break
    return toks


def split_amounts(toks):
    """Amount tokens live in the numeric columns (x>280); other numbers are
    label content (loan numbers, dates, percentages)."""
    amounts = [(x, t) for x, t in toks if AMT.match(t) and x > 280]
    label = [(x, t) for x, t in toks if not (AMT.match(t) and x > 280) and t != "P"]
    vals = sorted({int(t.replace(",", "")) for _, t in amounts})
    return label, vals


def extract_rows(doc, p_start, p_end):
    rows = []
    for pno in range(p_start, p_end):
        odd = (pno + 1) % 2 == 1
        shift = ODD_SHIFT if odd else 0.0
        for toks in visual_rows(doc[pno]):
            toks = [(x - shift, t) for x, t in toks]
            toks = strip_echoes(toks)
            if not toks:
                continue
            label, vals = split_amounts(toks)
            if not label:
                continue
            rows.append({
                "page": pno + 1,
                "x": round(label[0][0], 1),
                "text": " ".join(t for _, t in label),
                "vals": vals,
            })
    return rows


def build_bands(rows, min_members=6, tol=3.0):
    xs = sorted(r["x"] for r in rows if r["vals"]
                and not SUBTOTAL.match(r["text"]))
    bands = []
    for x in xs:
        if bands and x - bands[-1][-1] <= tol:
            bands[-1].append(x)
        else:
            bands.append([x])
    return [sum(b) / len(b) for b in bands if len(b) >= min_members]


# semantic levels (fixed ints well above any geometry band index)
REGION_LEVEL = 80
DEO_LEVEL = 81
FUNDING_LEVEL = 82


def band_of(x, bands, tol=4.5):
    best, bd = None, 1e9
    for i, b in enumerate(bands):
        d = abs(x - b)
        if d < bd:
            best, bd = i, d
    return best if bd <= tol else None


def dedupe_halves(text):
    ws = text.split()
    n = len(ws)
    if n % 2 == 0 and n >= 2 and ws[: n // 2] == ws[n // 2:]:
        return " ".join(ws[: n // 2])
    return text


def build_outline(rows, bands):
    out, stack, buf = [], [], []
    prev_level = None
    for r in rows:
        if SUBTOTAL.match(r["text"]):
            buf = []
            prev_level = None
            # a section-level Sub-total closes its section
            if r["x"] < 70:
                stack.clear()
            continue
        # Object-of-Expenditures section: different table geometry; stop ops
        if re.match(r"^New Appropriations, by Object of Expenditures", r["text"]):
            break
        # section dividers: reset stack so following rows don't attach to the
        # previous PAP ("Foreign Assisted-Project(s)" becomes the new root)
        if re.match(r"^(Foreign[ -]Assisted[- ]Project|Locally-Funded Project)",
                    r["text"], re.I):
            stack.clear()
            out.append({"page": r["page"], "level": 0,
                        "text": dedupe_halves(r["text"]),
                        "amount": r["vals"][-1] if r["vals"] else 0,
                        "vals": r["vals"], "children": []})
            stack.append(out[-1])
            buf = []
            continue
        lvl = band_of(r["x"], bands)
        # geometry fallback: mis-banded region rows snap to region level 1;
        # DEO rows falling between bands take the DEO band (max level <4)
        if r["vals"] and lvl is not None:
            if REGION_RE.match(r["text"]) and lvl < 1:
                lvl = 1
            elif DEO_RE.search(r["text"]) and lvl == 0:
                lvl = 2
            elif DEO_RE.search(r["text"]) and lvl is None:
                lvl = 2
        if not r["vals"]:
            if lvl is not None:
                buf.append((lvl, r))
            continue
        if lvl is None:
            continue
        text = r["text"]
        frags = [t for l, t in buf if l == lvl]
        if frags:
            text = " ".join(f["text"] for f in frags) + " " + text
        buf = []
        node = {"page": r["page"], "level": lvl, "text": dedupe_halves(text),
                "amount": r["vals"][-1], "vals": r["vals"], "children": []}
        sibs = stack[-1]["children"] if stack else out
        if sibs and sibs[-1]["text"] == node["text"] \
                and sibs[-1]["amount"] == node["amount"] \
                and sibs[-1]["level"] == lvl:
            continue
        while stack and stack[-1]["level"] >= lvl:
            stack.pop()
        if stack:
            stack[-1]["children"].append(node)
        else:
            out.append(node)
        stack.append(node)
    return out


def sum_leaf(node):
    if not node["children"]:
        return node["amount"]
    return sum(sum_leaf(c) for c in node["children"])


def validate(node, rep):
    if node["children"]:
        s = sum_leaf(node)
        # marker roots (Foreign/Locally-Funded dividers) carry no printed
        # amount; validate them only when a control is present
        if node["amount"]:
            rep["checked"] += 1
            if s != node["amount"]:
                rep["failed"] += 1
                rep["fails"].append({"page": node["page"], "level": node["level"],
                                     "text": node["text"][:70], "printed": node["amount"],
                                     "leaf_sum": s, "diff": node["amount"] - s})
        else:
            rep["marker_roots"] = rep.get("marker_roots", 0) + 1
    for c in node["children"]:
        validate(c, rep)


def main():
    path = sys.argv[1] if len(sys.argv) > 1 else "HB_BUDGET/2 - HB 10858 VOL IB.pdf"
    p_start = int(sys.argv[2]) - 1 if len(sys.argv) > 2 else 0
    p_end = int(sys.argv[3]) if len(sys.argv) > 3 else None
    out_path = sys.argv[4] if len(sys.argv) > 4 else None

    doc = pymupdf.open(path)
    p_end = p_end if p_end is not None else len(doc)
    rows = extract_rows(doc, p_start, p_end)
    bands = build_bands(rows)
    print(f"rows: {len(rows)}  amount rows: {sum(1 for r in rows if r['vals'])}")
    print(f"indent bands ({len(bands)}): {[round(b, 1) for b in bands]}")
    tree = build_outline(rows, bands)
    rep = {"checked": 0, "failed": 0, "fails": []}
    for node in tree:
        validate(node, rep)
    print(f"top-level nodes: {len(tree)}")
    print(f"internal checks: {rep['checked']}  failed: {rep['failed']}")
    for f in rep["fails"][:20]:
        print(f"  p{f['page']:>3} L{f['level']} {f['text'][:55]:55s} "
              f"printed {f['printed']:>15,} sum {f['leaf_sum']:>15,} "
              f"diff {f['diff']:>14,}")
    if out_path:
        with open(out_path, "w") as fh:
            json.dump({"bands": bands, "tree": tree, "report": rep}, fh, indent=1)
        print(f"tree -> {out_path}")


if __name__ == "__main__":
    main()
