#!/usr/bin/env python3
"""
FY2027 PAP-level drill-down v3 (final): every printed PAP heading in
HB 10858 VOL I-C vs NEP API pap3 line-item groups, per region.

Bill structure handled:
- Bold heading rows open PAP blocks; short wrap continuations merge;
  description paragraphs (long label-only rows starting with prose
  markers) are excluded.
- Program-family intro blocks (heading with type-split children, e.g.
  'Preventive Maintenance' -> '- Primary Roads') become verified family
  rollups rather than direct API comparisons.
- All-caps banners, program containers, and FAP program headers are
  printed control totals; S2O support blocks (pre-feasibility, ROW,
  contractual) are reported separately.
- Container artifacts (region group duplicating the block total via a
  single Central Office row) are dropped.
- API-side rollup: 'Facilities for PWD' also covers the Disaster-
  Related variant (merged bill row, pap3-name split in the API).

Output: crosscheck_2027_pap_drilldown.json + console summary.
"""

import sys
from pathlib import Path as _Path
sys.path[:0] = [str(_Path(__file__).resolve().parents[1]), str(_Path(__file__).resolve().parents[1] / 'builders')]
from paths import ANALYSIS, REPO, DATA, VIEWERS, DOCS, ARCHIVE, EVIDENCE

import json
import re
from collections import defaultdict

import pymupdf as fitz

import os
PDF = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "HB_BUDGET", "3 - HB 10858 VOL IC.pdf")
NEP = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "dpwh-transparency-nep-data", "json", "fy2027-combined.json")
OUT = "analysis/data/crosscheck_2027_pap_drilldown.json"
FAP_PAGE = 935

SKIP_RX = re.compile(
    r"general appropriations bill|details of dpwh'|"
    r"^programs? / activities / projects$|^amount \(php\)$", re.I)
BANNER_RX = re.compile(r"^[A-Z0-9][A-Z0-9 ,.\-/&()']+$")
REGION_RX = re.compile(
    r"^(region [ivx]+(-[a-z])?|cordillera administrative region|"
    r"national capital region|negros island region|"
    r"autonomous region in muslim mindanao|mimaropa region|"
    r"soccsksargen region|nationwide|barmm)$", re.I)
OFFICE_RX = re.compile(
    r"district engineering office|regional office|central office", re.I)
PROSE_RX = re.compile(r"^(the|this|these|it|a)\b", re.I)

CONTAINER_RX = re.compile(
    r"^(organizational outcome \d|[a-z]\. (asset preservation|network "
    r"development|flood management|bridge|convergence|national building) |"
    r"asset preservation program$|network development program$|"
    r"flood management program$|bridge program$|"
    r"basic infrastructure program \(bip\)$|"
    r"construction/ rehabilitation of water supply/ septage and sewerage/ "
    r"rain water collectors$|convergence and special support program$|"
    r"national building program$|multipurpose / facilities$|"
    r"loan proceeds$|public-private partnership strategic support fund|"
    r"national roads( and bridges)?$|locally-funded projects$|"
    r"foreign-assisted projects$|\d+\. (organizational outcome|"
    r"construction/ rehabilitation of flood mitigation facilities))", re.I)

# merged bill rows -> the set of API pap3 names they cover
PWD_DISASTER_KEY = ("Construction/Rehabilitation/Improvement of Facilities "
                    "for Persons with Disabilities Affected by Disaster-"
                    "Related Infrastructure and Other Facilities (Migration)")
API_ROLLUP_MAP = {
    "Facilities for Persons with Disabilities (PWD)": [PWD_DISASTER_KEY],
}

CANON = {
    "cordillera administrative region": "CAR",
    "national capital region": "NCR",
    "mimaropa region": "MIMAROPA", "mimaropa": "MIMAROPA",
    "soccsksargen region": "Region XII",
    "negros island region": "NIR",
    "barmm": "Nationwide",
    "autonomous region in muslim mindanao": "Nationwide",
}
SUPPORT_RX = re.compile(
    r"pre-feasibility|feasibility study|right-of-way|contractual "
    r"obligations", re.I)


def canon_region(s):
    s = re.sub(r"^\d+[a-z]?\.\s*", "", s.strip())
    return CANON.get(s.lower(), s.strip())


def N(s):
    return re.sub(r"[^a-z0-9]", "", (s or "").lower())


def toks(s):
    return set(re.findall(r"[a-z0-9]+", (s or "").lower()))


def page_rows(page):
    d = page.get_text("dict")
    spans = []
    for b in d["blocks"]:
        for l in b.get("lines", []):
            for s in l.get("spans", []):
                t = s["text"].strip()
                if t:
                    spans.append((s["bbox"][1], s["bbox"][0],
                                  s["font"], t))
    spans.sort()
    buckets = defaultdict(list)
    for y, x, font, t in spans:
        if y < 60:
            continue
        buckets[round(y * 4)].append((x, font, t))
    keys = sorted(buckets)
    clusters = []
    for k in keys:
        if clusters and k - clusters[-1][-1] <= 8:
            clusters[-1].append(k)
        else:
            clusters.append([k])
    rows = []
    for cl in clusters:
        parts = sorted(p for k in cl for p in buckets[k])
        label = " ".join(p[2] for p in parts if p[0] < 480)
        amounts = [p[2] for p in parts if p[0] >= 480]
        bold = any("Bold" in p[1] for p in parts)
        rows.append([label.strip(), amounts, bold])
    return rows


def parse_blocks():
    doc = fitz.open(PDF)
    blocks, containers = [], []
    cur, cur_region = None, None
    for pno in range(len(doc)):
        zone = "fap" if pno + 1 >= FAP_PAGE else "local"
        rows = page_rows(doc[pno])
        for i, (label, amounts, bold) in enumerate(rows):
            if not label or not amounts:
                continue
            if SKIP_RX.search(label):
                continue
            amt = None
            for a in amounts:
                try:
                    amt = int(a.replace(",", ""))
                    break
                except ValueError:
                    continue
            if amt is None:
                continue
            is_region = bool(REGION_RX.match(label))
            is_office = bool(OFFICE_RX.search(label))

            full = label
            if len(full) <= 90:               # headings wrap at ~2 lines
                j = i + 1
                while j < len(rows):
                    nl, na, _ = rows[j]
                    if nl and not na and len(nl) <= 90 \
                            and not REGION_RX.match(nl) \
                            and not OFFICE_RX.search(nl) \
                            and not SKIP_RX.search(nl) \
                            and not PROSE_RX.match(nl):
                        full = f"{full} {nl}"
                        j += 1
                    else:
                        break

            if bold and not is_region and not is_office:
                if BANNER_RX.match(full) and full == full.upper():
                    cur, cur_region = None, None
                    continue
                if CONTAINER_RX.match(full):
                    containers.append({"label": full, "total": amt,
                                       "page": pno + 1, "zone": zone})
                    cur, cur_region = None, None
                    continue
                cur = {"label": re.sub(r"^\d+[.)]\s+", "", full),
                       "total": amt, "page": pno + 1,
                       "zone": zone, "regions": []}
                blocks.append(cur)
                cur_region = None
                continue
            if cur is None:
                continue
            if is_region:
                cur_region = {"name": canon_region(label),
                              "subtotal": amt, "offices": {}}
                cur["regions"].append(cur_region)
                continue
            if is_office and cur_region is not None:
                o = cur_region["offices"]
                o[label] = o.get(label, 0) + amt
    return blocks, containers


def verify_block(b):
    def rsum(groups):
        return sum(g["subtotal"] for g in groups)

    dropped = []
    groups = b["regions"]
    if rsum(groups) != b["total"]:
        keep, drop = [], []
        for g in groups:
            vals = set(g["offices"].values())
            if (g["subtotal"] == b["total"] and g["offices"]
                    and vals == {g["subtotal"]}
                    and len(g["offices"]) == 1
                    and "central" in next(iter(g["offices"])).lower()):
                drop.append(g)
            else:
                keep.append(g)
        if drop and rsum(keep) == b["total"]:
            groups = keep
            dropped = [g["name"] for g in drop]
    for g in groups:
        g["offices_sum"] = sum(g["offices"].values())
        g["offices_match"] = g["offices_sum"] == g["subtotal"]
    b["regions_verified"] = groups
    b["container_dropped"] = dropped
    b["regions_sum"] = rsum(groups)
    b["regions_match"] = b["regions_sum"] == b["total"]
    return b


def api_groups():
    nep = json.load(open(NEP, encoding="utf-8"))["data"]["data"]
    groups = defaultdict(lambda: {"total": 0, "n": 0,
                                  "regions": defaultdict(float)})
    for i in nep:
        k = (i.get("pap3") or "").strip()
        if not k:
            continue
        amt = (i.get("amount") or 0) * 1000
        groups[k]["total"] += amt
        groups[k]["n"] += 1
        groups[k]["regions"][canon_region(i.get("region") or "?")] += amt
    return dict(groups)


def api_rollup_keys(pap3s):
    """Map extra API keys into their merged bill PAP (rollups)."""
    roll = defaultdict(list)
    matched = set()
    for rx, keys in API_ROLLUP_MAP.items():
        for k in keys:
            if k in pap3s:
                matched.add(k)
    return roll, matched


def match_pap3(label, pap3s, skip=frozenset()):
    n = N(label)
    if len(n) < 6:
        return None
    for k in pap3s:
        if k in skip:
            continue
        if n == N(k):
            return k
    best, best_score = None, 0.0
    for k in pap3s:
        if k in skip:
            continue
        nk = N(k)
        if len(nk) < 12 or len(n) < 12:
            continue
        if nk in n or n in nk:
            ratio = min(len(nk), len(n)) / max(len(nk), len(n))
            if ratio >= 0.60 and ratio > best_score:
                best, best_score = k, ratio
    if best:
        return best
    lt = toks(label)
    if len(lt) >= 4:
        for k in pap3s:
            if k in skip:
                continue
            kt = toks(k)
            ov = len(lt & kt) / len(lt | kt)
            if ov >= 0.62 and ov > best_score:
                best, best_score = k, ov
    return best


def main():
    print("parsing PDF blocks ...")
    raw_blocks, containers = parse_blocks()
    blocks = [verify_block(b) for b in raw_blocks]
    print(f"  {len(blocks)} PAP blocks, {len(containers)} printed containers")
    pap3s = api_groups()
    print(f"  {len(pap3s)} API pap3 groups")

    # merged PWD+Elderlies+Gender heading family: intro children rollup
    merged_pw = [b for b in blocks if b["zone"] == "local" and
                 "including gender-responsive facilities" in b["label"].lower()]
    for b in merged_pw:
        b["label"] = ("Construction/Rehabilitation/Improvement of Facilities "
                      "for PWD/Elderlies/Gender (merged heading)")
        b["is_merged_family"] = True

    # family detection: base heading with ' - ' type-split children
    by_base = defaultdict(list)
    for b in blocks:
        base = b["label"].split(" - ")[0].strip()
        by_base[N(base)].append(b)
    family_intro_keys, pap_blocks = set(), []
    for b in blocks:
        if b.get("is_merged_family"):
            family_intro_keys.add(id(b))
            continue
        base = b["label"].split(" - ")[0].strip()
        sibs = [x for x in by_base[N(base)] if x is not b
                and x["label"] != b["label"]]
        if " - " not in b["label"] and sibs and \
                all(x["label"].startswith(base + " - ") for x in sibs):
            family_intro_keys.add(id(b))
        else:
            pap_blocks.append(b)

    supports, unmatched = [], []
    matched = defaultdict(list)
    consumed_api = set()
    rollup_into = {}
    for b in pap_blocks:
        if SUPPORT_RX.search(b["label"]):
            supports.append(b)
            continue
        k = match_pap3(b["label"], pap3s)
        if not k and re.search(r"facilities for persons with disabilities",
                               b["label"], re.I):
            k = "Facilities for Persons with Disabilities (PWD)"
        if k:
            matched[k].append(b)
            consumed_api.add(k)
        else:
            unmatched.append(b)
    for k, extras in API_ROLLUP_MAP.items():
        for e in extras:
            if e in pap3s and e not in consumed_api and k in matched:
                rollup_into[k] = e

    # family rollup checks (local zone only)
    rollups = []
    for b in blocks:
        if id(b) not in family_intro_keys or b["zone"] != "local":
            continue
        if b.get("is_merged_family"):
            sibs = [x for x in blocks if x["zone"] == "local" and
                    x["label"] in ("Facilities for Elderlies/ Senior Citizen",
                                   "Facilities for Persons with Disabilities (PWD)",
                                   "Gender-Responsive Facilities")]
        else:
            base = b["label"]
            sibs = [x for x in blocks
                    if x is not b and x["zone"] == "local"
                    and x["label"].startswith(base + " - ")]
        if not sibs:
            continue
        s = sum(x["total"] for x in sibs)
        rollups.append({
            "family": b["label"],
            "intro_total_php": b["total"],
            "page": b["page"],
            "children": sorted({x["label"] for x in sibs}),
            "children_sum_php": s,
            "rollup_match": s == b["total"],
            "delta_php": s - b["total"],
        })

    rows = []
    for k, bs in sorted(matched.items(),
                        key=lambda kv: -sum(b["total"] for b in kv[1]
                                            if b["zone"] == "local")):
        hb_local = sum(b["total"] for b in bs if b["zone"] == "local")
        hb_fap = sum(b["total"] for b in bs if b["zone"] == "fap")
        api = pap3s[k]
        hb_regions = defaultdict(float)
        for b in bs:
            if b["zone"] != "local":
                continue
            for g in b["regions_verified"]:
                hb_regions[g["name"]] += g["subtotal"]
        # API side must add any keys folded into this PAP
        api_total = api["total"] + sum(pap3s[e]["total"]
                                       for e in (rollup_into.get(k),) if e)
        api_regions = defaultdict(float, api["regions"])
        for e in (rollup_into.get(k),):
            if e:
                for r, v in pap3s[e]["regions"].items():
                    api_regions[r] += v
        all_regions = sorted(set(hb_regions) | set(api_regions),
                             key=str.lower)
        deltas = []
        regions_exact = 0
        for r in all_regions:
            h = hb_regions.get(r, 0.0)
            a = api_regions.get(r, 0.0)
            if h == a:
                regions_exact += 1
            deltas.append({"region": r, "hb_php": h, "api_php": a,
                           "delta_php": h - a})
        rows.append({
            "pap3": k,
            "hb_labels": sorted({b["label"] for b in bs}),
            "hb_pages": sorted({b["page"] for b in bs}),
            "n_hb_blocks": len(bs),
            "zones": sorted({b["zone"] for b in bs}),
            "hb_local_php": hb_local,
            "hb_fap_php": hb_fap,
            "api_total_php": api_total,
            "api_projects": api["n"],
            "api_rollup_keys": [e for e in (rollup_into.get(k),) if e],
            "total_match": hb_local == api_total,
            "delta_php": hb_local - api_total,
            "regions_compared": len(all_regions),
            "regions_exact": regions_exact,
            "region_deltas": deltas,
        })

    out = {
        "fiscal_year": 2027,
        "method": "printed PAP heading blocks (HB PDF) vs NEP API pap3",
        "matched_paps": rows,
        "family_rollups": rollups,
        "printed_containers": containers,
        "support_blocks": [{"label": b["label"], "total": b["total"],
                            "page": b["page"]} for b in supports],
        "hb_only_blocks": [{"label": b["label"], "total": b["total"],
                            "page": b["page"], "zone": b["zone"]}
                           for b in unmatched],
        "n_hb_pap_blocks": len(blocks),
        "n_matched_groups": len(rows),
    }
    json.dump(out, open(OUT, "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)

    exact = sum(1 for r in rows if r["total_match"])
    print(f"\n{'PAP (pap3)':<56}{'HB local':>16}{'API':>16}{'Δ':>9}"
          f"{'regs Δ0':>9}")
    for r in rows:
        m = "✓" if r["total_match"] else f"{r['delta_php']/1e9:+.1f}B"
        print(f"{r['pap3'][:55]:<56}{r['hb_local_php']:>16,}"
              f"{r['api_total_php']:>16,.0f}{m:>9}"
              f"{r['regions_exact']:>5}/{r['regions_compared']:<3}")
    print("\nFAMILY ROLLUPS (intro vs type-split children, local):")
    for f in sorted(rollups, key=lambda x: -x["intro_total_php"]):
        m = "✓" if f["rollup_match"] else f"{f['delta_php']/1e9:+.2f}B"
        print(f"  {f['family'][:52]:<54}{f['intro_total_php']:>16,}"
              f"{f['children_sum_php']:>16,}{m:>9}")
    print(f"\nmatched PAP groups: {len(rows)} (local-total exact: {exact}) | "
          f"families: {len(rollups)} | supports: {len(supports)} | "
          f"HB-only: {len(unmatched)}")
    print("wrote", OUT)


if __name__ == "__main__":
    main()
