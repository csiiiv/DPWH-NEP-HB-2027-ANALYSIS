#!/usr/bin/env python3
"""
Audit ALL HB 10858 parsed leaves against the PDF's embedded text layer
(ground truth — no OCR noise), and produce a corrected leaf dataset.

Method
------
1. For each of the 942 pages, extract printed rows from get_text("words"):
   y-banded rows; a row starts at the y-band holding its amount cells
   (right column); the label is all text from that band until the next
   amount-bearing band (handles 2-line wrapped project names).
2. Classify rows: region-header subtotals ("Region <X>" label + amount)
   vs project rows.
3. Match each parsed leaf (document order) to its printed row via a
   label-key index; compare amounts.
4. Verdicts:
     OK                  parsed amount == printed amount
     GOT_REGION_SUBTOTAL parsed amount equals the region subtotal printed
                         just above the row (OCR attached it to the project)
     AMOUNT_DROPPED      printed row has an amount; parsed amount is 0/None
     AMOUNT_DIFF         both exist but differ (neither is a region subtotal)
     UNRESOLVED          no printed row found for the label
5. Emit corrected leaves (printed amount wins) + audit report.

Outputs
-------
  archive/data/hb_dpwh_leaves_corrected.json (historical)
  analysis/archive/data/textlayer_audit.json
  analysis/archive/docs/textlayer_audit.md
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
OUT_LEAVES = "analysis/archive/data/hb_dpwh_leaves_corrected.json"
OUT_JSON = "analysis/archive/data/textlayer_audit.json"
OUT_MD = "analysis/archive/docs/textlayer_audit.md"

ROMAN_MAP = {"Ⅲ": "III", "Ⅳ": "IV", "Ⅵ": "VI", "Ⅶ": "VII", "Ⅸ": "IX",
             "Ⅺ": "XI", "Ⅻ": "XII", "Ⅴ": "V", "Ⅱ": "II", "Ⅰ": "I",
             "Ⅷ": "VIII", "Ⅹ": "X"}
REGION_RX = re.compile(
    r"^(region\s*(?:[0-9]{1,2}|[ivx]{1,4}|[Ⅰ-Ⅺ]+)(?:\s*[-‑–]?\s*[ab])?)"
    r"\s*(.*)$", re.I)
SPECIAL_REGIONS = ("national capital region", "cordillera administrative region",
                   "mimaropa", "negros island region", "bangsamoro")


def nospace(s):
    s = s or ""
    for k, v in ROMAN_MAP.items():
        s = s.replace(k, v)
    return re.sub(r"[^a-z0-9]+", "", s.lower())


def is_region_label(label):
    n = (label or "").strip().lower()
    if any(n.startswith(p) for p in SPECIAL_REGIONS):
        return True
    m = REGION_RX.match(n)
    return bool(m and not m.group(2))   # pure header, no project tail


def extract_page_rows(page):
    """Return list of {label, amounts, y, page} in reading order."""
    words = page.get_text("words")      # x0,y0,x1,y1,text,block,line,wno
    if not words:
        return []
    bands = {}
    for w in words:
        y = round(w[1] / 4) * 4
        bands.setdefault(y, []).append(w)
    AMT = re.compile(r"^\(?\d{1,3}(?:,\d{3})+\)?$")
    rows = []
    cur_label, cur_amts, cur_y = [], [], None
    for y in sorted(bands):
        ws = sorted(bands[y], key=lambda w: w[0])
        amts = [w[4] for w in ws if AMT.match(w[4])]
        label_txt = " ".join(w[4] for w in ws if not AMT.match(w[4])).strip()
        if amts:
            if cur_label or cur_amts:
                rows.append({"label": " ".join(cur_label).strip(),
                             "amounts": cur_amts, "y": cur_y})
            cur_label, cur_amts, cur_y = [label_txt] if label_txt else [], \
                [int(a.replace(",", "").strip("()")) for a in amts], y
        else:
            if label_txt:
                cur_label.append(label_txt)
    if cur_label or cur_amts:
        rows.append({"label": " ".join(cur_label).strip(),
                     "amounts": cur_amts, "y": cur_y})
    for r in rows:
        r["page_idx"] = page.number
    return rows


def main():
    doc = pymupdf.open(PDF_FILE)
    all_rows = []
    for page in doc:
        all_rows.extend(extract_page_rows(page))
    doc.close()
    print(f"text-layer rows: {len(all_rows)}")

    region_rows = [r for r in all_rows if is_region_label(r["label"])
                   and len(r["amounts"]) == 1]
    print(f"region header rows with one amount: {len(region_rows)}  "
          f"total ₱{sum(r['amounts'][0] for r in region_rows)/1e9:.2f}B")

    # index: label key -> ordered row refs (project rows only)
    proj_rows = [r for r in all_rows if r not in region_rows and r["amounts"]]
    index = {}
    for i, r in enumerate(proj_rows):
        index.setdefault(nospace(r["label"]), []).append(i)
        plen = nospace(r["label"])[:60]
        index.setdefault(plen, []).append(i)

    leaves = json.load(open(LEAVES_FILE, encoding="utf-8"))["leaves"]
    STRIP_REGION = re.compile(
        r"^region\s*[0-9ivxⅠ-Ⅺ]{1,4}\s*([ab])?\s*\\n?\s*", re.I)
    results, corrected = [], []
    consumed = set()
    n_ok = n_sub = n_drop = n_diff = n_unres = 0
    cursor = 0                       # position of last confident match
    WINDOW = 260                     # search neighborhood around cursor

    def tokens(s):
        return set(re.findall(r"[a-z0-9]+", s.lower()))

    ENUM_RX = re.compile(r"^[a-z0-9]{1,2}[.)]\s*", re.I)

    def row_key(label):
        k = nospace(ENUM_RX.sub("", label or ""))
        return k

    row_keys = [row_key(r["label"]) for r in proj_rows]

    for leaf in leaves:
        amt = leaf["amount_php"] or 0
        label = STRIP_REGION.sub("", (leaf["project"] or "").replace("\\n", " "))
        label = ENUM_RX.sub("", label)          # strip 'a. ' / '17. ' prefixes
        key = nospace(label)
        ktok = tokens(key)

        # ---- candidate pool: every unconsumed row whose key equals/starts key
        cands = [i for i in range(len(proj_rows))
                 if i not in consumed and row_keys[i] == key] or \
                [i for i in range(len(proj_rows))
                 if i not in consumed and key and row_keys[i] and
                 (row_keys[i][:60] == key[:60])]

        def pick(cands):
            """prefer amount agreement, then nearest to cursor (forward first)"""
            if not cands:
                return None
            amt_hits = [i for i in cands
                        if amt and amt in proj_rows[i]["amounts"]]
            pool = amt_hits or cands
            fwd = [i for i in pool if i >= cursor]
            pool = fwd or pool
            return min(pool, key=lambda i: (abs(i - cursor), i))

        cand = pick(cands)
        rescued = False
        # ---- rescue 1: label/amount split across y-bands (empty label row)
        if cand is None and amt:
            near = [i for i in range(max(0, cursor - 40),
                                     min(len(proj_rows), cursor + WINDOW))
                    if i not in consumed and not proj_rows[i]["label"].strip()
                    and amt in proj_rows[i]["amounts"]]
            if near:
                cand = min(near, key=lambda i: abs(i - cursor))
                rescued = True
        # ---- rescue 2: fuzzy token overlap + amount agreement near cursor
        if cand is None and amt and len(ktok) >= 3:
            best, best_s = None, 0.0
            for i in range(max(0, cursor - 40),
                           min(len(proj_rows), cursor + WINDOW)):
                if i in consumed or amt not in proj_rows[i]["amounts"]:
                    continue
                rtok = tokens(row_keys[i])
                if not rtok:
                    continue
                s = len(ktok & rtok) / len(ktok | rtok)
                if s > best_s:
                    best, best_s = i, s
            if best is not None and best_s >= 0.55:
                cand = best
                rescued = True

        rec = {"md_row": leaf["row"], "project": leaf["project"],
               "parsed_php": amt, "zone": leaf["zone"]}
        if cand is None:
            n_unres += 1
            rec.update(verdict="UNRESOLVED")
        else:
            consumed.add(cand)
            if not rescued:
                cursor = cand
            row = proj_rows[cand]
            printed = row["amounts"]
            rec["page"] = row["page_idx"] + 1
            rec["printed_php"] = printed
            sub = None
            for rr in reversed(region_rows):
                if rr["page_idx"] == row["page_idx"] and rr["y"] < row["y"] - 2:
                    sub = rr["amounts"][0]
                    break
                if rr["page_idx"] < row["page_idx"] and not sub:
                    break
            if amt and amt in printed:
                n_ok += 1
                rec.update(verdict="OK", final_php=amt)
                if rescued:
                    rec["note"] = "rescued by amount+context match"
            elif sub and amt == sub:
                n_sub += 1
                good = next((p for p in printed if p != sub),
                            printed[0] if printed else None)
                rec.update(verdict="GOT_REGION_SUBTOTAL", region_subtotal=sub,
                           final_php=good)
            elif amt == 0 and printed:
                n_drop += 1
                rec.update(verdict="AMOUNT_DROPPED", final_php=printed[0])
            else:
                # last chance: a window row carrying the parsed amount whose
                # label overlaps (handles band-split labels, key drift)
                alt, alt_s = None, 0.0
                for i in range(max(0, cand - 260),
                               min(len(proj_rows), cand + 260)):
                    if i in consumed or amt not in proj_rows[i]["amounts"]:
                        continue
                    rtok = tokens(row_keys[i])
                    if not rtok:
                        continue
                    s = len(ktok & rtok) / max(1, len(ktok | rtok))
                    if s > alt_s:
                        alt, alt_s = i, s
                if alt is not None and alt_s >= 0.45:
                    consumed.add(alt)
                    n_ok += 1
                    row2 = proj_rows[alt]
                    rec.update(verdict="OK", final_php=amt,
                               page=row2["page_idx"] + 1,
                               note=f"band-split label row (overlap {alt_s:.2f})")
                else:
                    n_diff += 1
                    # conservative: keep parsed amount, flag for review
                    rec.update(verdict="AMOUNT_DIFF", final_php=None,
                               note="printed row differs; parsed value kept")
        # corrected leaf
        cl = dict(leaf)
        if "final_php" in rec and rec["final_php"] is not None:
            cl["amount_php"] = rec["final_php"]
            cl["validation"] = f"pdf:{rec['verdict'].lower()}"
        corrected.append(cl)
        results.append(rec)

    with open(OUT_LEAVES, "w", encoding="utf-8") as f:
        json.dump({"leaves": corrected}, f, ensure_ascii=False)
    out = {
        "meta": {"source": PDF_FILE, "leaves": len(leaves),
                 "textlayer_rows": len(all_rows)},
        "verdicts": {"OK": n_ok, "GOT_REGION_SUBTOTAL": n_sub,
                     "AMOUNT_DROPPED": n_drop, "AMOUNT_DIFF": n_diff,
                     "UNRESOLVED": n_unres},
        "results": results,
    }
    with open(OUT_JSON, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)

    old_total = sum(l["amount_php"] or 0 for l in leaves)
    new_total = sum(l["amount_php"] or 0 for l in corrected)
    lines = [
        "# HB 10858 — full leaf audit vs PDF text layer",
        "",
        f"Leaves: {len(leaves)} · verdicts: {out['verdicts']}",
        "",
        f"Parsed grand total: ₱{old_total:,}",
        f"Corrected grand total: ₱{new_total:,}",
        f"Delta: ₱{new_total - old_total:,}",
        "",
        "## GOT_REGION_SUBTOTAL rows",
        "",
        "| md_row | page | project | parsed | printed |",
        "|---|---|---|---|---|",
    ]
    for r in results:
        if r["verdict"] == "GOT_REGION_SUBTOTAL":
            lines.append(
                f"| {r['md_row']} | {r.get('page')} | {(r['project'] or '')[:60]} "
                f"| {r['parsed_php']:,} | {r.get('final_php')} |")
    with open(OUT_MD, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))

    print("verdicts:", out["verdicts"])
    print(f"old ₱{old_total/1e9:.3f}B -> corrected ₱{new_total/1e9:.3f}B "
          f"(Δ {(new_total-old_total)/1e9:+.3f}B)")
    print("wrote", OUT_LEAVES, OUT_JSON, OUT_MD)


if __name__ == "__main__":
    main()
