#!/usr/bin/env python3
"""
FY2027 line-item drill-down (level 3): HB 10858 leaf project rows vs
NEP API projectName rows.

The bill nests items in two patterns (region->DEO->items and
region->items); leaves therefore carry region and/or office. Matching:

  1. exact normalized title within (region, title) or (office, title)
  2. fuzzy Jaccard token overlap >= 0.62 within the same region
     (office-consistency and amount-equality as tie-breaks), greedy 1:1

Matched pairs split into amount-equal (passed through), amount-diff
(House re-costed), HB-only (insertions), API-only (dropped/absent).
PAP attribution for unmatched leaves reuses the level-2 program
classifier family (fuzzy pap3 match on the leaf's PAP text, else the
API pap3 of its sibling match).

Output: crosscheck_2027_lineitems.json + console summary. (Historical v4b/API matcher.)
"""

import sys
from pathlib import Path as _Path
sys.path[:0] = [str(_Path(__file__).resolve().parents[2]), str(_Path(__file__).resolve().parents[2] / 'builders')]
from paths import ANALYSIS, REPO, DATA, VIEWERS, DOCS, ARCHIVE, EVIDENCE


import json
import re
import unicodedata
from collections import defaultdict

LEAVES = "analysis/archive/data/hb_dpwh_leaves_corrected_v4b.json"
NEP = "../dpwh-transparency-nep-data/json/fy2027-combined.json"
OUT = "analysis/archive/data/crosscheck_2027_lineitems.json"

ROMAN = {"Ⅲ": "III", "Ⅳ": "IV", "Ⅴ": "V", "Ⅵ": "VI", "Ⅶ": "VII",
         "Ⅷ": "VIII", "Ⅸ": "IX", "Ⅹ": "X", "Ⅺ": "XI", "Ⅻ": "XII"}
CAN = {"Cordillera Administrative Region": "CAR",
       "National Capital Region": "NCR",
       "MIMAROPA Region": "MIMAROPA", "MIMAROPA": "MIMAROPA",
       "Soccsksargen Region": "Region XII",
       "Negros Island Region": "NIR", "BARMM": "Nationwide",
       "Autonomous Region in Muslim Mindanao": "Nationwide"}


def norm(s):
    s = unicodedata.normalize("NFKC", s or "")
    s = re.sub(r"[^A-Za-z0-9]+", " ", s).lower()
    return re.sub(r"\s+", " ", s).strip()


def reg(s):
    s = unicodedata.normalize("NFKC", (s or "")).strip()
    m = re.match(r"^(?:Region|egion)\s+(.+)$", s, re.I)
    if m:
        s = "Region " + m.group(1).strip().upper()
    return CAN.get(s, s)


def toks(s):
    stop = {"of", "the", "and", "in", "at", "to", "for", "along", "a",
            "barangay", "city", "road"}
    return set(norm(s).split()) - stop


def jaccard(a, b):
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)


def load():
    leaves = json.load(open(LEAVES, encoding="utf-8"))["leaves"]
    nep = json.load(open(NEP, encoding="utf-8"))["data"]["data"]
    hb = []
    for l in leaves:
        if l.get("zone") != "pap" or not (l.get("amount_php") or 0) > 0:
            continue
        t = re.sub(r"<headingless @\d+>\s*", "",
                   (l.get("project") or "")).replace("\n", " ").strip()
        if not t:
            continue
        hb.append({"region": reg(l.get("region")),
                   "office": norm(l.get("office")),
                   "amount": l["amount_php"],
                   "title": t, "ntitle": norm(t), "ttoks": toks(t),
                   "pap_raw": re.sub(r"<headingless @\d+>\s*", "",
                                     (l.get("pap") or "")),
                   "leaf_pap": (l.get("pap") or "").replace("\n", " ").strip(),
                   "sub_program": l.get("sub_program") or "",
                   "row": l.get("row")})
    api = []
    for i in nep:
        api.append({"region": reg(i.get("region")),
                    "office": norm(i.get("office")),
                    "amount": (i.get("amount") or 0) * 1000,
                    "title": (i.get("projectName") or "").strip(),
                    "ntitle": norm(i.get("projectName")),
                    "ttoks": toks(i.get("projectName")),
                    "pap3": (i.get("pap3") or "").strip(),
                    "code": i.get("code")})
    return hb, api


def match(hb, api):
    by_rt = defaultdict(list)
    by_ot = defaultdict(list)
    by_r = defaultdict(list)
    for idx, a in enumerate(api):
        by_rt[(a["region"], a["ntitle"])].append(idx)
        by_ot[(a["office"], a["ntitle"])].append(idx)
        by_r[a["region"]].append(idx)
    used = set()
    assign = [None] * len(hb)          # api idx or None
    kind = [""] * len(hb)

    # pass 1/2: exact titles (region scope preferred, office fallback)
    for hi, h in enumerate(hb):
        for key in (((h["region"], h["ntitle"]),) if h["region"] else ()) + \
                   (((h["office"], h["ntitle"]),) if h["office"] else ()):
            idx0 = by_rt if len(key[0]) and key is not None and \
                key in by_rt else by_ot
            cands = [i for i in idx0.get(key, []) if i not in used]
            if cands:
                cands.sort(key=lambda i: abs(api[i]["amount"] - h["amount"]))
                assign[hi] = cands[0]
                used.add(cands[0])
                kind[hi] = "exact"
                break

    # pass 3: fuzzy within region (or office-derived region)
    cand = []
    for hi, h in enumerate(hb):
        if assign[hi] is not None or not h["region"]:
            continue
        for ai in by_r[h["region"]]:
            if ai in used:
                continue
            a = api[ai]
            j = jaccard(h["ttoks"], a["ttoks"])
            if j >= 0.62:
                s = j + (0.25 if h["amount"] == a["amount"] else 0) + \
                    (0.15 if h["office"] and h["office"] == a["office"]
                     else 0)
                cand.append((s, hi, ai))
    cand.sort(reverse=True)
    for s, hi, ai in cand:
        if assign[hi] is not None or ai in used:
            continue
        assign[hi] = ai
        used.add(ai)
        kind[hi] = "fuzzy"
    return assign, kind


def main():
    print("loading ...")
    hb, api = load()
    print(f"  HB leaf items: {len(hb):,} | API items: {len(api):,}")
    assign, kind = match(hb, api)

    matched = [(hi, assign[hi]) for hi in range(len(hb))
               if assign[hi] is not None]
    amt_eq = sum(1 for hi, ai in matched
                 if hb[hi]["amount"] == api[ai]["amount"])
    amt_diff = len(matched) - amt_eq
    hb_only = [hi for hi in range(len(hb)) if assign[hi] is None]
    api_only = [ai for ai in range(len(api))
                if ai not in set(assign) or ai is None]
    api_used = {assign[hi] for hi, _ in matched}
    api_only = [ai for ai in range(len(api)) if ai not in api_used]

    # PAP attribution: prefer the leaf's repaired pap field (v4), then fall
    # back to longest-common-prefix with matched siblings in the same region
    def by_r_key(h):
        return h["region"]

    sib = defaultdict(list)
    for hi, ai in matched:
        sib[hb[hi]["region"]].append((norm(hb[hi]["title"]),
                                      api[ai]["pap3"]))
    def attribute(h):
        n = norm(h["title"])
        best, best_len = "(unattributed)", 0
        for t, p3 in sib.get(h["region"], []):
            k = 0
            while k < min(len(t), len(n)) and t[k] == n[k]:
                k += 1
            if k > best_len:
                best, best_len = p3, k
        return best if best_len >= 14 else "(unattributed)"

    hb_only_rows = []
    for hi in hb_only:
        h = hb[hi]
        pap_guess = h.get("leaf_pap") or attribute(h)
        hb_only_rows.append({"region": h["region"], "office": h["office"],
                             "title": h["title"], "php": h["amount"],
                             "pap3_guess": pap_guess})
    api_only_rows = [{"region": api[ai]["region"], "office": api[ai]["office"],
                      "title": api[ai]["title"], "php": api[ai]["amount"],
                      "pap3": api[ai]["pap3"]} for ai in api_only]

    # per-PAP aggregation (attribute via match's API pap3; HB-only via guess)
    agg = defaultdict(lambda: defaultdict(float))
    for hi, ai in matched:
        p3 = api[ai]["pap3"]
        a = agg[p3]
        a["matched_n"] += 1
        a["matched_php"] += hb[hi]["amount"]
        a["amt_eq_n"] += hb[hi]["amount"] == api[ai]["amount"]
        a["amt_diff_php"] += (hb[hi]["amount"] - api[ai]["amount"]) \
            if hb[hi]["amount"] != api[ai]["amount"] else 0
        a["kind_" + kind[hi]] += 1
    for r in hb_only_rows:
        a = agg[r["pap3_guess"]]
        a["hb_only_n"] += 1
        a["hb_only_php"] += r["php"]
    api_agg = defaultdict(lambda: defaultdict(float))
    for a in api:
        api_agg[a["pap3"]]["n"] += 1
        api_agg[a["pap3"]]["php"] += a["amount"]

    paps = []
    for p3 in set(list(agg.keys()) + list(api_agg.keys())):
        a, s = agg.get(p3, {}), api_agg.get(p3, {})
        paps.append({
            "pap3": p3,
            "api_items": int(s.get("n", 0)), "api_php": s.get("php", 0),
            "matched_n": int(a.get("matched_n", 0)),
            "matched_php": a.get("matched_php", 0),
            "amount_equal_n": int(a.get("amt_eq_n", 0)),
            "amount_diff_net_php": a.get("amt_diff_php", 0),
            "kind_exact": int(a.get("kind_exact", 0)),
            "kind_containment": 0,
            "kind_fuzzy": int(a.get("kind_fuzzy", 0)),
            "hb_only_n": int(a.get("hb_only_n", 0)),
            "hb_only_php": a.get("hb_only_php", 0),
            "api_only_n": int(s.get("n", 0)) - int(a.get("matched_n", 0)),
            "api_only_php": s.get("php", 0) - a.get("matched_php", 0),
        })
    paps.sort(key=lambda r: -r["hb_only_php"])

    summary = {
        "hb_items": len(hb),
        "api_items": len(api),
        "matched": len(matched),
        "matched_amount_equal": amt_eq,
        "matched_amount_diff": amt_diff,
        "hb_only_items": len(hb_only),
        "hb_only_php": sum(h["amount"] for h in
                           (hb[hi] for hi in hb_only)),
        "api_only_items": len(api_only),
        "api_only_php": sum(api[ai]["amount"] for ai in api_only),
    }
    out = {
        "fiscal_year": 2027,
        "method": "exact title (region/office scope) + fuzzy Jaccard >=0.62, "
                  "greedy 1:1; amount & office tie-breaks",
        "summary": summary,
        "by_pap": paps,
        "matched_pairs": [{"region": hb[hi]["region"],
                           "kind": kind[hi],
                           "hb_title": hb[hi]["title"],
                           "hb_php": hb[hi]["amount"],
                           "api_title": api[ai]["title"],
                           "api_php": api[ai]["amount"],
                           "pap3": api[ai]["pap3"],
                           "amount_equal": hb[hi]["amount"] ==
                                           api[ai]["amount"]}
                          for hi, ai in matched],
        "hb_only_items": hb_only_rows,
        "api_only_items": api_only_rows,
    }
    json.dump(out, open(OUT, "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)

    print(f"\nmatched: {len(matched):,} "
          f"(amount-equal {amt_eq:,} / amount-diff {amt_diff:,})")
    print(f"HB-only (insertions): {len(hb_only):,} "
          f"(₱{summary['hb_only_php']/1e9:.2f}B)")
    print(f"API-only (absent from bill): {len(api_only):,} "
          f"(₱{summary['api_only_php']/1e9:.2f}B)")
    print(f"\n{'PAP':<50}{'HBonly':>8}{'₱HBonly':>11}{'₱=match':>9}"
          f"{'Δcost':>9}")
    for r in paps:
        print(f"{r['pap3'][:49]:<50}{r['hb_only_n']:>8,}"
              f"{r['hb_only_php']/1e6:>10,.0f}M"
              f"{r['amount_equal_n']:>9,}"
              f"{r['amount_diff_net_php']/1e6:>+8,.0f}M")
    print("wrote", OUT)


if __name__ == "__main__":
    main()
