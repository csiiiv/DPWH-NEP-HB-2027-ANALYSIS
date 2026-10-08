#!/usr/bin/env python3
"""
HB 10858 leaf audit v2 — span-level text-layer extraction with heading
classification via fonts + patterns.

Key improvements over v1 (audit_textlayer.py):
  * rows are built from dict spans, not word bands: an amount row owns all
    label text since the previous amount row, plus up to 14pt of wrapped
    label lines BELOW the amount baseline (vertically-centered 2-line rows)
  * heading rows classified three ways:
      - font '...,Bold'                -> PAP-category heading + subtotal
      - 'Region <X>' pattern           -> region header + subtotal
      - '<...> (District|Regional|) Engineering Office / Regional Office /
        Central Office' pattern        -> office heading + subtotal
    heading amounts are never valid project amounts
  * verdict GOT_HEADING_SUBTOTAL replaces GOT_REGION_SUBTOTAL and corrects
    from the row's own printed amount

Outputs: archive/data/hb_dpwh_leaves_corrected_v2.json, archive/textlayer_audit_v2.{json,md} (historical)
"""

import sys
from pathlib import Path as _Path
sys.path[:0] = [str(_Path(__file__).resolve().parents[2]), str(_Path(__file__).resolve().parents[2] / 'builders')]
from paths import ANALYSIS, REPO, DATA, VIEWERS, DOCS, ARCHIVE, EVIDENCE



import json
import re
import pymupdf

PDF_FILE = "HB_BUDGET/3 - HB 10858 VOL IC.pdf"
LEAVES_FILE = "analysis/archive/data/hb_dpwh_leaves_validated.json"
OUT_LEAVES = "analysis/archive/data/hb_dpwh_leaves_corrected_v2.json"
OUT_JSON = "analysis/archive/data/textlayer_audit_v2.json"
OUT_MD = "analysis/archive/docs/textlayer_audit_v2.md"

ROMAN_MAP = {"Ⅲ": "III", "Ⅳ": "IV", "Ⅵ": "VI", "Ⅶ": "VII", "Ⅸ": "IX",
             "Ⅺ": "XI", "Ⅻ": "XII", "Ⅴ": "V", "Ⅱ": "II", "Ⅰ": "I",
             "Ⅷ": "VIII", "Ⅹ": "X"}
AMT_RX = re.compile(r"^\(?\d{1,3}(?:,\d{3})+\)?$")
HEADER_RX = re.compile(
    r"general appropriations bill|details of dpwh|programs / activities / projects"
    r"|^amount \(php\)$", re.I)
REGION_RX = re.compile(r"^region\s*[0-9]{1,2}|^region\s*[ivx]{1,4}|^national capital region|^cordillera administrative region|^mimaropa|^negros island region|^bangsamoro", re.I)
OFFICE_RX = re.compile(r"(district engineering office|regional office|central office)\s*$", re.I)


def nospace(s):
    s = s or ""
    for k, v in ROMAN_MAP.items():
        s = s.replace(k, v)
    return re.sub(r"[^a-z0-9]+", "", s.lower())


def is_heading(label, bold):
    n = (label or "").strip()
    if bold:
        return True
    if REGION_RX.match(n):
        return True
    if OFFICE_RX.search(n):
        return True
    return False


def extract_page_rows(page):
    """v1-style accumulation: a row owns ALL label text since the previous
    amount anchor (complete multi-line labels). The anchor's bold flag and
    label pattern drive heading classification. Running-header spans are
    filtered out."""
    dd = page.get_text("dict")
    spans = []                       # (y0, x0, text, bold)
    for b in dd["blocks"]:
        for l in b.get("lines", []):
            for s in l["spans"]:
                t = s["text"].strip()
                if t and not HEADER_RX.search(t):
                    spans.append((s["bbox"][1], s["bbox"][0], t,
                                  "Bold" in s["font"]))
    if not spans:
        return []
    amt_idx = [i for i, s in enumerate(spans) if AMT_RX.match(s[2])]
    if not amt_idx:
        return []
    rows = []
    prev_i = -1
    for a_i in amt_idx:
        a = spans[a_i]
        seg = spans[prev_i + 1:a_i]
        label = " ".join(s[2] for s in sorted(seg,
                         key=lambda s: (round(s[0] / 6), s[1]))).strip()
        rows.append({"label": re.sub(r"\s+", " ", label),
                     "amounts": [int(a[2].replace(",", "").strip("()"))],
                     "y": a[0], "page_idx": page.number, "bold": a[3]})
        prev_i = a_i
    return rows


def main():
    doc = pymupdf.open(PDF_FILE)
    all_rows = []
    for page in doc:
        all_rows.extend(extract_page_rows(page))
    doc.close()
    for r in all_rows:
        r["heading"] = is_heading(r["label"], r["bold"])
    headings = [r for r in all_rows if r["heading"] and r["amounts"]]
    proj_rows = [r for r in all_rows if not r["heading"]]
    print(f"rows: {len(all_rows)}  headings: {len(headings)} "
          f"(₱{sum(r['amounts'][0] for r in headings)/1e9:.2f}B)  "
          f"project rows: {len(proj_rows)}")

    ENUM_RX = re.compile(r"^[a-z0-9]{1,2}[.)]\s*", re.I)
    STRIP_REGION = re.compile(
        r"^region\s*[0-9ivxⅠ-Ⅻ]{1,4}\s*([ab])?\s*\\n?\s*", re.I)

    def tokens(s):
        return set(re.findall(r"[a-z0-9]+", s.lower()))

    row_keys = [nospace(ENUM_RX.sub("", r["label"])) for r in proj_rows]

    leaves = json.load(open(LEAVES_FILE, encoding="utf-8"))["leaves"]
    results, corrected = [], []
    consumed = set()
    counts = {"OK": 0, "GOT_HEADING_SUBTOTAL": 0, "GOT_PREV_ROW_AMOUNT": 0,
              "AMOUNT_DROPPED": 0, "AMOUNT_DIFF": 0, "UNRESOLVED": 0}
    cursor = 0
    WINDOW = 400

    for leaf in leaves:
        amt = leaf["amount_php"] or 0
        label = STRIP_REGION.sub(
            "", (leaf["project"] or "").replace("\\n", " "))
        label = ENUM_RX.sub("", label)
        key = nospace(label)
        ktok = tokens(key)

        cands = [i for i in range(len(proj_rows))
                 if i not in consumed and row_keys[i] == key]
        if not cands and key:
            cands = [i for i in range(len(proj_rows))
                     if i not in consumed and row_keys[i][:60] == key[:60]]

        def pick(c):
            if not c:
                return None
            fwd = [i for i in c if i >= cursor]
            return min(fwd or c, key=lambda i: (abs(i - cursor), i))

        cand = pick(cands)
        rescued = False
        if cand is None and amt:
            near = [i for i in range(max(0, cursor - 40),
                                     min(len(proj_rows), cursor + WINDOW))
                    if i not in consumed and amt in proj_rows[i]["amounts"]
                    and (not ktok or
                         len(ktok & tokens(row_keys[i])) /
                         max(1, len(ktok | tokens(row_keys[i]))) >= 0.3)]
            if near:
                cand = min(near, key=lambda i: abs(i - cursor))
                rescued = True

        rec = {"md_row": leaf["row"], "project": leaf["project"],
               "parsed_php": amt, "zone": leaf["zone"]}
        if cand is None:
            counts["UNRESOLVED"] += 1
            rec.update(verdict="UNRESOLVED")
        else:
            consumed.add(cand)
            if not rescued:
                cursor = cand
            row = proj_rows[cand]
            printed = row["amounts"]
            rec["page"] = row["page_idx"] + 1
            rec["printed_php"] = printed
            # nearest heading amount above this row on same page
            sub = None
            for hr in reversed(headings):
                if hr["page_idx"] == row["page_idx"] and hr["y"] < row["y"] + 2:
                    sub = hr["amounts"][0]
                    break
                if hr["page_idx"] < row["page_idx"]:
                    break
            if amt and amt in printed:
                counts["OK"] += 1
                rec.update(verdict="OK", final_php=amt,
                           note="rescued by amount+context" if rescued else "")
            elif sub and amt == sub and printed:
                counts["GOT_HEADING_SUBTOTAL"] += 1
                good = next((p for p in printed if p != sub), None)
                rec.update(verdict="GOT_HEADING_SUBTOTAL",
                           heading_subtotal=sub, final_php=good)
            elif amt == 0 and printed:
                counts["AMOUNT_DROPPED"] += 1
                rec.update(verdict="AMOUNT_DROPPED", final_php=printed[0])
            else:
                # refinement 1: parsed equals a heading subtotal ON THE SAME
                # page (heading may print above OR below the row)
                page_sub = next((hr["amounts"][0] for hr in headings
                                 if hr["page_idx"] == row["page_idx"]
                                 and hr["amounts"][0] == amt), None)
                # refinement 2: parsed equals the previous project row's
                # printed amount (OCR stole the row-above amount)
                prev_amt = proj_rows[cand - 1]["amounts"][0] if cand else None
                if page_sub is not None and printed:
                    counts["GOT_HEADING_SUBTOTAL"] += 1
                    rec.update(verdict="GOT_HEADING_SUBTOTAL",
                               heading_subtotal=page_sub, final_php=printed[0],
                               note="heading below/above row on same page")
                elif prev_amt == amt and printed:
                    counts["GOT_PREV_ROW_AMOUNT"] += 1
                    rec.update(verdict="GOT_PREV_ROW_AMOUNT",
                               final_php=printed[0],
                               note="parsed amount belonged to row above")
                else:
                    counts["AMOUNT_DIFF"] += 1
                    rec.update(verdict="AMOUNT_DIFF", final_php=None,
                               note="printed row differs; parsed value kept")
        cl = dict(leaf)
        if rec.get("final_php") is not None:
            cl["amount_php"] = rec["final_php"]
            cl["validation"] = f"pdf2:{rec['verdict'].lower()}"
        corrected.append(cl)
        results.append(rec)

    with open(OUT_LEAVES, "w", encoding="utf-8") as f:
        json.dump({"leaves": corrected}, f, ensure_ascii=False)
    old_total = sum(l["amount_php"] or 0 for l in leaves)
    new_total = sum(l["amount_php"] or 0 for l in corrected)
    out = {"meta": {"source": PDF_FILE, "leaves": len(leaves)},
           "verdicts": counts,
           "totals": {"parsed": old_total, "corrected": new_total},
           "results": results}
    with open(OUT_JSON, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)

    lines = [
        "# HB 10858 — leaf audit v2 (span-level, heading-aware)",
        "",
        f"Leaves: {len(leaves)} · verdicts: {counts}",
        f"Parsed: ₱{old_total:,}  →  Corrected: ₱{new_total:,}  "
        f"(Δ {new_total - old_total:+,})",
        "",
        "## GOT_HEADING_SUBTOTAL (all)",
        "",
        "| md_row | page | project | parsed | corrected |",
        "|---|---|---|---|---|",
    ]
    for r in results:
        if r["verdict"] == "GOT_HEADING_SUBTOTAL":
            lines.append(
                f"| {r['md_row']} | {r.get('page')} | {(r['project'] or '')[:55]} "
                f"| {r['parsed_php']:,} | {r.get('final_php'):,} |")
    with open(OUT_MD, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))

    print("verdicts:", counts)
    print(f"₱{old_total/1e9:.3f}B -> ₱{new_total/1e9:.3f}B "
          f"(Δ {(new_total-old_total)/1e9:+.3f}B)")
    print("wrote", OUT_LEAVES, OUT_JSON, OUT_MD)


if __name__ == "__main__":
    main()
