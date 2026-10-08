#!/usr/bin/env python3
"""
Complete PAP repair v3 -> v4b (two defect classes):

1. `<headingless @N>` leaves (1,082) — repaired from hierarchy ancestry or
   own-text canon match (as in repair_headingless.py).

2. Stale-pap runs (12,674 leaves, ~₱276B) — the parser mistook a project
   line for a PAP heading and stamped its title onto every leaf until the
   next heading. Examples: 'Rehabilitation of Philam Covered Court...'
   (1,735 leaves), 'Construction of Road, Sitio Macayas...' (350).

   Repair: locate each leaf's PDF page via the OCR-JSON cumulative table-row
   index (validated to ±2 pages against unique-text anchors), then assign the
   governing bold PAP family heading for that page (with multi-line headings
   merged).

Outputs archive/hb_dpwh_leaves_corrected_v4b.json (historical).
"""

import sys
from pathlib import Path as _Path
sys.path[:0] = [str(_Path(__file__).resolve().parents[1]), str(_Path(__file__).resolve().parents[1] / 'builders')]
from paths import ANALYSIS, REPO, DATA, VIEWERS, DOCS, ARCHIVE, EVIDENCE

import bisect
import json
import re
import unicodedata
from collections import Counter

import pymupdf as fitz

OCR_JSON = "../HB_BUDGET/3 - HB 10858 VOL IC.pdf_by_PaddleOCR-VL-1.6.json"
PDF = "../HB_BUDGET/3 - HB 10858 VOL IC.pdf"
IN = "analysis/archive/hb_dpwh_leaves_corrected_v4.json"
OUT = "analysis/archive/hb_dpwh_leaves_corrected_v4b.json"
NEP = "../nep-data/json/fy2027-combined.json"
HIER = "hb_dpwh_pap_hierarchy.json"
ROW_OFFSET = 35  # leaf row -> md row approx offset (validated 0..41)

CONTAINER_RX = re.compile(
    r"^(daang maharlika|davao city bypass|laguna lakeshore|"
    r"construction of multi-purpose building, barangay (poblacion|6)|"
    r"construction of multi-purpose building, sitio|"
    r"construction of multi-purpose building \(municipal plaza\)|"
    r"construction of public water supply|rehabilitation of lakewall|"
    r"construction/ rehabilitation of water supply/ septage|"
    r"construction/rehabilitation/improvement of facilities for persons|"
    r"impasug-ong|malaybalay)", re.I)
HEAD_SKIP_RX = re.compile(
    r"(volume i|republic of the philippines|contents|programs / projects|"
    r"maintenance and other operating|general administrative and support|"
    r"^support to operations|^capital outlays|^operations$|"
    r"organizational outcome|zational outcome|flood management program$|"
    r"asset preservation program$|network development program$|"
    r"convergence and special support program$|^bridge program$|"
    r"national building program|basic infrastructure program|"
    r"locally-funded projects|foreign-assisted projects|loan proceeds|"
    r"central office|^national capital region$|public-private partnership|"
    r"payments of right|^payments of contractual|january 1|"
    r"^region |engineering office)", re.I)
OCR_FIX = [("3IP", "BIP"), ("ff-Carriageway", "Off-Carriageway"),
           ("ff- Carriageway", "Off-Carriageway")]
JOINS = [("leading to Major/ Stra", "Public Buildings/ Facilities"),
         ("Major River B", "Basins and Principal Rivers"),
         ("within Major River", "Basins and Principal Rivers")]


def nrm(s):
    s = unicodedata.normalize("NFKC", s or "")
    return re.sub(r"\s+", " ", re.sub(r"[^A-Za-z0-9]+", " ", s)).lower().strip()


def walk(node, path=()):
    yield node, path
    for ch in node.get("children", []) or []:
        yield from walk(ch, path + (node,))


def ancestry_map():
    h = json.load(open(HIER, encoding="utf-8"))
    amap = {}
    for node, path in walk({"children": h["outcomes"]}):
        nm = node.get("name") or ""
        if "<headingless" not in nm:
            continue
        m = re.search(r"@(\d+)", nm)
        if not m:
            continue
        pap = None
        for anc in reversed(path):
            an = (anc.get("name") or "").replace("\n", " ").strip()
            if an and "<headingless" not in an \
                    and not CONTAINER_RX.match(an):
                pap = an
                break
        amap.setdefault(int(m.group(1)), pap)
    return amap


def own_text_pap(text, cn):
    nl = nrm(text)
    if not nl:
        return None
    if nl in cn:
        return cn[nl]
    for n, c in cn.items():
        if re.search(r" (primary|secondary|tertiary) roads$", n) \
                and nl.startswith(n.rsplit(" - ", 1)[0]) and len(nl) <= len(n):
            return c
    starts = [c for n, c in cn.items() if n.startswith(nl) and len(nl) >= 14]
    return starts[0] if len(starts) == 1 else None


def build_page_maps():
    """(md_row -> pdf_page), (pdf_page -> family heading)."""
    dj = json.load(open(OCR_JSON, encoding="utf-8"))
    counts = [len(re.findall(r"<tr", (x.get("markdown") or {}).get("text") or ""))
              for x in dj]
    starts = []
    c = 0
    for cnt in counts:
        starts.append(c)
        c += cnt

    def page_of_md_row(i):
        return max(0, bisect.bisect_right(starts, i) - 1)

    doc = fitz.open(PDF)
    heads = []
    for pno in range(len(doc)):
        d2 = doc[pno].get_text("dict")
        items = []
        for b in d2["blocks"]:
            for l in b.get("lines", []):
                for s in l.get("spans", []):
                    if "Bold" not in s["font"] or s["bbox"][0] >= 490:
                        continue
                    t = s["text"].strip()
                    if (t and "DETAILS OF DPWH" not in t
                            and "GENERAL APPROP" not in t
                            and not re.fullmatch(r"[\d\s]+", t)
                            and len(t) > 8 and not HEAD_SKIP_RX.search(t)):
                        items.append((s["bbox"][1], t))
        items.sort()
        merged = []
        for y, t in items:
            if merged and y - merged[-1][0] < 15:
                merged[-1] = (merged[-1][0], merged[-1][1] + " " + t)
            else:
                merged.append((y, t))
        for _, t in merged:
            heads.append((pno, re.sub(r"\s+", " ", t).strip()))
    fixed = []
    for p, t in heads:
        if fixed:
            pt = fixed[-1][1]
            for a, b in JOINS:
                if pt.endswith(a) and t == b:
                    fixed[-1] = (fixed[-1][0], pt + " " + b)
                    break
            else:
                fixed.append((p, t))
        else:
            fixed.append((p, t))
    fam_page = {}
    cur = None
    for p, t in fixed:
        cur = t
        fam_page[p] = cur
    last = None
    for p in range(len(doc)):
        if fam_page.get(p):
            last = fam_page[p]
        fam_page[p] = last
    return page_of_md_row, fam_page


def main():
    nep = json.load(open(NEP, encoding="utf-8"))["data"]["data"]
    cn = {nrm(i.get("pap3")): i["pap3"].strip() for i in nep if i.get("pap3")}
    amap = ancestry_map()
    page_of_md_row, fam_page = build_page_maps()

    data = json.load(open(IN, encoding="utf-8"))
    leaves = data["leaves"]
    stats = Counter()
    for l in leaves:
        pap = l.get("pap") or ""
        # pass 1: headingless tags
        m = re.search(r"<headingless @(\d+)>\s*(.*)", pap, re.S)
        if m:
            start = int(m.group(1))
            own = m.group(2).replace("\n", " ").strip()
            rep = own_text_pap(own, cn)
            src = "own-text"
            if not rep:
                rep = amap.get(start)
                src = "ancestry"
            if not rep:
                stats["<headingless unattributed>"] += 1
                continue
            for a, b in OCR_FIX:
                rep = rep.replace(a, b)
            if nrm(rep) not in cn:
                sp = (l.get("sub_program") or "").strip()
                if sp and nrm(sp) in cn:
                    rep, src = sp, "sub-program"
                elif rep in ("Flood Management Program",):
                    rep = "S2O - Regional Office allocations (Flood Mgmt section)"
                    src = "s2o-office"
            l["pap_raw"] = pap
            l["pap"] = rep
            l["pap_repaired"] = src
            stats["headingless:" + src] += 1
            continue
        # pass 2: stale-pap runs
        flat = pap.replace("\n", " ").strip()
        if nrm(flat) in cn or flat == "Bridge Program":
            continue
        row = l.get("row")
        if row is None:
            stats["stale:<no row>"] += 1
            continue
        page = page_of_md_row(row - ROW_OFFSET)
        gov = fam_page.get(page)
        if not gov:
            stats["stale:<no family>"] += 1
            continue
        new = cn.get(nrm(gov), gov)
        l["pap_raw"] = pap
        l["pap"] = new
        l["pap_repaired"] = "pdf-family"
        stats["stale->" + new[:52]] += 1

    data["parser"] = data.get("parser", "") + " + full pap repair v4b"
    json.dump(data, open(OUT, "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)
    print("repair stats:")
    for k, n in stats.most_common():
        print(f"  {n:>6}  {k}")
    n_rep = sum(1 for l in leaves if l.get("pap_repaired"))
    php = sum(l["amount_php"] or 0 for l in leaves if l.get("pap_repaired"))
    print(f"\ntotal repaired: {n_rep} leaves ₱{php/1e9:.2f}B -> {OUT}")


if __name__ == "__main__":
    main()
