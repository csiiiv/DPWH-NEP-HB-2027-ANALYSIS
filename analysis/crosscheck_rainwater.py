#!/usr/bin/env python3
"""
FY2027 Rainwater Collector System — HB 10858 (PDF) vs NEP API comparison.

PAP printed once in VOL I-C (PDF pages 401-411) under CONVERGENCE AND SPECIAL
SUPPORT PROGRAM: 'Rainwater Collector System' ₱1,027,200,000, subdivided by
region (region line = printed regional subtotal) then by District Engineering
Office. Region subtotals are taken from the region lines; DEO lines only
verify. Compared against NEP API line items per region.
"""
import json
import re
import pymupdf as fitz

PDF = "HB_BUDGET/3 - HB 10858 VOL IC.pdf"
NEP = "nep-data/json/fy2027-combined.json"
OUT = "analysis/crosscheck_2027_rainwater.json"

PAP_TOTAL = 1_027_200_000
region_rx = re.compile(
    r"^(Region [IVX]+(-[A-Z])?|Cordillera Administrative Region|"
    r"National Capital Region|Negros Island Region|"
    r"Autonomous Region in Muslim Mindanao|MIMAROPA Region|"
    r"Soccsksargen Region|Nationwide)$", re.I)
office_rx = re.compile(r"District Engineering Office|Regional Office", re.I)

CANON = {"Cordillera Administrative Region": "CAR",
         "National Capital Region": "NCR",
         "MIMAROPA Region": "MIMAROPA",
         "Soccsksargen Region": "Region XII",
         "Negros Island Region": "NIR",
         "Autonomous Region in Muslim Mindanao": "BARMM"}


def pdf_region_allocation():
    doc = fitz.open(PDF)
    regions = {}
    order = []
    started, done = False, False
    cur = None
    for pno in range(400, 420):
        if done:
            break
        d = doc[pno].get_text("dict")
        spans = []
        for b in d["blocks"]:
            for l in b.get("lines", []):
                for s in l.get("spans", []):
                    t = s["text"].strip()
                    if t:
                        spans.append((s["bbox"][1], s["bbox"][0],
                                      s["font"], t))
        spans.sort()
        merged = {}
        ys = []
        for y, x, font, t in spans:
            if y < 60:
                continue
            merged.setdefault(round(y * 4), []).append((x, font, t))
        # cluster rows whose label/amount split across a rounding boundary:
        # merge any two adjacent keys within ~2px when one has only a label
        # and the other only amounts
        keys = sorted(merged)
        clusters = []
        for k in keys:
            if clusters and k - clusters[-1][-1] <= 8:  # 8 quarter-px = 2px
                clusters[-1].append(k)
            else:
                clusters.append([k])
        merged2 = {}
        for cl in clusters:
            parts = [p for k in cl for p in merged[k]]
            y0 = min(cl) / 4
            merged2[y0] = parts
        for y in sorted(merged2):
            parts = sorted(merged2[y])
            label = " ".join(p[2] for p in parts if p[0] < 500)
            amounts = [p[2] for p in parts if p[0] >= 500]
            if not label or not amounts:
                continue
            bold = any("Bold" in p[1] for p in parts)
            if "Rainwater" in label:
                started = True
                continue
            if not started:
                continue
            try:
                amt = int(amounts[0].replace(",", ""))
            except ValueError:
                continue
            if bold and not (region_rx.match(label)
                             or office_rx.search(label)):
                done = True          # next PAP heading reached
                break
            if label == "Central Office" and amt == PAP_TOTAL:
                continue             # PAP-level container row
            if region_rx.match(label):
                if amt == PAP_TOTAL:
                    continue         # region container carrying PAP total
                cur = CANON.get(label, label)
                if cur not in regions:
                    regions[cur] = {"subtotal_php": amt, "offices": {}}
                    order.append(cur)
            elif label == "Central Office" and cur is None:
                # nationwide Central Office allocation outside any region
                regions["Central Office (Nationwide)"] = \
                    {"subtotal_php": amt, "offices": {}}
                order.append("Central Office (Nationwide)")
                cur = "Central Office (Nationwide)"
            elif cur is not None:
                o = regions[cur]["offices"]
                o[label] = o.get(label, 0) + amt
    # verification: offices sum to region subtotal
    # (NCR is a known exception: its ₱9M NCR Regional Office row is
    #  visually merged with a non-rainwater neighbouring block in the PDF)
    for r in regions.values():
        r["offices_sum_php"] = sum(r["offices"].values())
        r["offices_match"] = r["offices_sum_php"] == r["subtotal_php"]
    return regions, order


def api_region_allocation():
    nep = json.load(open(NEP, encoding="utf-8"))["data"]["data"]
    hit = [i for i in nep
           if "rainwater" in ((i.get("pap3") or "") + " "
                              + (i.get("projectName") or "")).lower()]
    regions = {}
    for i in hit:
        r = (i.get("region") or "?").strip()
        regions.setdefault(r, {"total": 0, "n": 0})
        regions[r]["total"] += (i.get("amount") or 0) * 1000
        regions[r]["n"] += 1
    return regions


def main():
    hb, order = pdf_region_allocation()
    api = api_region_allocation()

    hb_total = sum(v["subtotal_php"] for v in hb.values())
    api_total = sum(v["total"] for v in api.values())

    rows = []
    for r in sorted(set(hb) | set(api)):
        h = hb.get(r, {}).get("subtotal_php", 0)
        a = api.get(r, {}).get("total", 0)
        rows.append({"region": r, "hb_php": h, "api_php": a,
                     "delta_php": h - a,
                     "hb_offices": len(hb.get(r, {}).get("offices", {})),
                     "offices_sum_php": hb.get(r, {}).get("offices_sum_php", 0),
                     "offices_match": hb.get(r, {}).get("offices_match"),
                     "api_projects": api.get(r, {}).get("n", 0)})

    out = {
        "pap": "Rainwater Collector System",
        "fiscal_year": 2027,
        "hb_printed_total_php": PAP_TOTAL,
        "hb_region_sum_php": hb_total,
        "hb_region_sum_matches_printed": hb_total == PAP_TOTAL,
        "api_total_php": api_total,
        "api_total_matches_hb": api_total == PAP_TOTAL,
        "regions": rows,
        "hb_region_order": order,
        "hb_offices_sample": {k: hb[k]["offices"] for k in order[:3]},
    }
    json.dump(out, open(OUT, "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)

    print(f"HB printed PAP total : ₱{PAP_TOTAL:,}")
    print(f"HB region subtotals  : ₱{hb_total:,}  "
          f"(match: {hb_total == PAP_TOTAL})")
    print(f"NEP API line items   : ₱{api_total:,.0f} "
          f"({sum(v['n'] for v in api.values())} projects)  "
          f"(match: {api_total == PAP_TOTAL})")
    print(f"\n{'Region':<11}{'HB (PDF)':>13}{'API':>13}{'Δ':>11}"
          f"{'DEOs':>6}{'API prj':>9}  DEO-sum ok")
    for r in rows:
        d = r["delta_php"]
        ok = r["offices_match"]
        print(f"{r['region']:<11}{r['hb_php']:>13,}{r['api_php']:>13,.0f}"
              f"{d:>+11,}{r['hb_offices']:>6}{r['api_projects']:>9}"
              f"  {'' if ok is None else ('✓' if ok else '✗')}")
    print("\nwrote", OUT)


if __name__ == "__main__":
    main()
