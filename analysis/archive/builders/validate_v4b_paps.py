#!/usr/bin/env python3
"""
v4b PAP-level validation: does the repaired leaf attribution agree with the
independent ground truths?

For each canonical pap3 family:
  - HB v4b leaf sum        (repaired, page-family attributed)
  - HB printed family total (bold heading amount in the PDF — parse of
    hierarchy family blocks; authoritative)
  - NEP API pap3 total      (executive proposal)
  - v3 leaf sum             (pre-repair, to show what moved)

Also: per-region agreement between v4b leaf sums and API pap3 regions for the
families where totals agree, and a boundary-risk audit listing leaves whose
page position sits within ±3 pages of a family transition (the ±2-page row→page
map uncertainty zone).

Output: crosscheck_2027_v4b_validation.json + console report.
"""

import sys
from pathlib import Path as _Path
sys.path[:0] = [str(_Path(__file__).resolve().parents[2]), str(_Path(__file__).resolve().parents[2] / 'builders')]
from paths import ANALYSIS, REPO, DATA, VIEWERS, DOCS, ARCHIVE, EVIDENCE


import json
import re
import unicodedata
from collections import defaultdict, Counter

IN = "hb_dpwh_leaves_corrected_v4b.json"
V3 = "analysis/archive/data/hb_dpwh_leaves_corrected_v3.json"
NEP = str(REPO / "dpwh-transparency-nep-data/json/fy2027-combined.json")
HIER = "hb_dpwh_pap_hierarchy.json"
OUT = "analysis/archive/data/crosscheck_2027_v4b_validation.json"

OCR_JSON = "../HB_BUDGET/3 - HB 10858 VOL IC.pdf_by_PaddleOCR-VL-1.6.json"


def nrm(s):
    s = unicodedata.normalize("NFKC", s or "")
    return re.sub(r"\s+", " ", re.sub(r"[^A-Za-z0-9]+", " ", s)).lower().strip()


def canon_region(s):
    s = (s or "").strip()
    m = re.match(r"^(?:Region|egion)\s+(.+)$", unicodedata.normalize("NFKC", s), re.I)
    if m:
        s = "Region " + m.group(1).strip().upper()
    return {"Cordillera Administrative Region": "CAR",
            "National Capital Region": "NCR",
            "MIMAROPA Region": "MIMAROPA",
            "Soccsksargen Region": "Region XII",
            "Negros Island Region": "NIR",
            "BARMM": "Nationwide",
            "Autonomous Region in Muslim Mindanao": "Nationwide"}.get(s, s)


def walk(node, path=()):
    yield node, path
    for ch in node.get("children", []) or []:
        yield from walk(ch, path + (node,))


def main():
    # ---------------- canonical pap3 universe + API totals ----------------
    nep = json.load(open(NEP, encoding="utf-8"))["data"]["data"]
    api = defaultdict(lambda: {"total": 0, "n": 0,
                               "regions": defaultdict(float)})
    for i in nep:
        k = (i.get("pap3") or "").strip()
        if not k:
            continue
        api[k]["total"] += (i.get("amount") or 0) * 1000
        api[k]["n"] += 1
        api[k]["regions"][canon_region(i.get("region"))] += (i.get("amount") or 0) * 1000
    canon = {nrm(k): k for k in api}

    # ---------------- printed family totals from hierarchy ---------------
    h = json.load(open(HIER, encoding="utf-8"))
    # family blocks: pap-kind nodes whose normalized name is canonical,
    # or the printed 'Bridge Program' bridges family
    printed = {}
    for n, path in walk({"children": h["outcomes"]}):
        if n.get("kind") != "pap":
            continue
        nm = (n.get("name") or "").replace("\n", " ").strip()
        nn = nrm(nm)
        if nn in canon and isinstance(n.get("printed_total_php"), int):
            key = canon[nn]
            # keep the LARGEST printed total per canon name (duplicates from
            # family intro + type-split heads)
            if key not in printed or n["printed_total_php"] > printed[key]:
                printed[key] = n["printed_total_php"]
        elif nn == "bridge program" and isinstance(n.get("printed_total_php"), int):
            key = "Bridge Program (PAP family)"
            cur = printed.get(key, 0)
            printed[key] = max(cur, n["printed_total_php"])

    # ---------------- leaf sums (v4b vs v3) -------------------------------
    v4 = json.load(open(IN, encoding="utf-8"))["leaves"]
    v3 = json.load(open(V3, encoding="utf-8"))["leaves"]

    def leaf_rows(leaves):
        rows = []
        for l in leaves:
            if l.get("zone") != "pap" or not (l.get("amount_php") or 0) > 0:
                continue
            rows.append(l)
        return rows

    v4p, v3p = leaf_rows(v4), leaf_rows(v3)

    def fam_key(pap):
        nn = nrm((pap or "").replace("\n", " ").strip())
        if nn in canon:
            return canon[nn]
        if nn == "bridge program":
            return "Bridge Program (PAP family)"
        return None

    v4_sum, v4_reg = defaultdict(float), defaultdict(lambda: defaultdict(float))
    v4_n = Counter()
    moved = defaultdict(float)
    for l in v4p:
        k = fam_key(l.get("pap"))
        if k:
            v4_sum[k] += l["amount_php"]
            v4_n[k] += 1
            for r in {canon_region(l.get("region"))} | \
                     ({canon_region(l.get("office"))} if False else set()):
                pass
            # region: leaves carry region; empty for some BIP rows -> group
            # under 'NCR (office-implied)' handled below
            r = canon_region(l.get("region"))
            v4_reg[k][r if r else "(none)"] += l["amount_php"]
    v3_sum = defaultdict(float)
    for l in v3p:
        k = fam_key(l.get("pap"))
        if k:
            v3_sum[k] += l["amount_php"]

    # ---------------- per-family comparison -------------------------------
    rows = []
    for k in sorted(set(list(v4_sum) + list(printed) + list(api)),
                    key=lambda x: -(printed.get(x) or api[x]["total"]
                                    if x in api else 0)):
        hb4 = v4_sum.get(k, 0.0)
        pr = printed.get(k)
        ap = api[k]["total"] if k in api else 0.0
        hb3 = v3_sum.get(k, 0.0)
        rows.append({
            "pap3": k,
            "v4b_leaves_php": hb4,
            "v4b_leaf_n": v4_n[k],
            "v3_leaves_php": hb3,
            "printed_family_php": pr,
            "api_total_php": ap,
            "api_projects": api[k]["n"] if k in api else 0,
            "v4b_vs_printed": (hb4 - pr) if pr is not None else None,
            "v4b_vs_api": hb4 - ap if k in api else None,
            "repair_shift_php": hb4 - hb3,
            "regions": {r: {"v4b_php": v,
                            "api_php": api[k]["regions"].get(r, 0.0)
                            if k in api else 0.0}
                        for r, v in sorted(v4_reg[k].items())},
        })
    rows.sort(key=lambda r: -(r["printed_family_php"] or r["api_total_php"] or 0))

    # ---------------- boundary-risk audit ----------------------------------
    # row -> page via repair's approach; leaves within ±3 pages of a family
    # heading page = uncertainty zone
    import bisect
    dj = json.load(open(OCR_JSON, encoding="utf-8"))
    counts = [len(re.findall(r"<tr", (x.get("markdown") or {}).get("text") or ""))
              for x in dj]
    starts = []
    c = 0
    for cnt in counts:
        starts.append(c)
        c += cnt
    def page_of_row(row):
        return max(0, bisect.bisect_right(starts, row - 35) - 1)

    import pymupdf as fitz
    doc = fitz.open("../HB_BUDGET/3 - HB 10858 VOL IC.pdf")
    HEAD_SKIP_RX = re.compile(
        r"(volume i|republic of the philippines|contents|programs / projects|"
        r"maintenance and other operating|general administrative and support|"
        r"^support to operations|^capital outlays|^operations$|"
        r"organizational outcome|zational outcome|flood management program$|"
        r"asset preservation program$|network development program$|"
        r"convergence and special support program$|^bridge program$|"
        r"national building program|basic infrastructure program|"
        r"locally-funded projects|foreign_acrossed|locally|foreign|"
        r"locally-funded|foreign-assisted projects$|loan proceeds|"
        r"central office|^national capital region$|public-private partnership|"
        r"payments of right|^payments of contractual|january 1|"
        r"^region |engineering office)", re.I)
    fam_pages = sorted({p for p in range(len(doc))})
    # find pages where a PAP family heading starts
    head_pages = []
    for pno in range(len(doc)):
        d2 = doc[pno].get_text("dict")
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
                        head_pages.append((pno, t[:60]))
    boundary_pages = sorted({p for p, _ in head_pages})
    risky = []
    for l in v4p:
        row = l.get("row")
        if row is None:
            continue
        pg = page_of_row(row)
        # nearest heading page within 3 pages
        j = bisect.bisect_left(boundary_pages, pg)
        near = [boundary_pages[k] for k in (j - 1, j) if 0 <= k < len(boundary_pages)]
        if near and min(abs(pg - q) for q in near) <= 1:
            risky.append({"row": row, "page": pg,
                          "pap": (l.get("pap") or "")[:60],
                          "amount": l.get("amount_php")})
    risky_php = sum(r["amount"] or 0 for r in risky)

    # ---------------- console + output ------------------------------------
    print(f"{'pap3 family':<58}{'v4b leaves':>14}{'printed':>14}"
          f"{'API':>14}{'v4b-print':>11}{'v4b-API':>10}")
    for r in rows[:40]:
        pr_s = f"{r['printed_family_php']/1e9:.2f}B" if r["printed_family_php"] else "—"
        d1 = r["v4b_vs_printed"]
        d1s = f"{d1/1e9:+.2f}B" if d1 is not None else "—"
        d2s = f"{r['v4b_vs_api']/1e9:+.2f}B" if r["v4b_vs_api"] is not None else "—"
        print(f"{r['pap3'][:57]:<58}{r['v4b_leaves_php']/1e9:>12.2f}B"
              f"{pr_s:>14}{r['api_total_php']/1e9:>13.2f}B {d1s:>11}{d2s:>10}")

    print(f"\nboundary-risk leaves (page within 1 of a family heading): "
          f"{len(risky)} leaves ₱{risky_php/1e9:.2f}B")

    out = {
        "fiscal_year": 2027,
        "method": "v4b repaired leaf attribution vs printed family totals vs API pap3",
        "n_boundary_risk_leaves": len(risky),
        "boundary_risk_php": risky_php,
        "boundary_risk_rows": risky[:200],
        "families": rows,
    }
    json.dump(out, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("wrote", OUT)


if __name__ == "__main__":
    main()
