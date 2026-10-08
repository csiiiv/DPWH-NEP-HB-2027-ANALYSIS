#!/usr/bin/env python3
"""
Crosscheck HB 10858 (House FY 2027 budget proposal) DPWH project line items
against the DPWH NEP FY 2027 proposal dataset.

UNITS: HB VOL IC amounts are pesos; NEP API `amount` is thousands of pesos.
Comparison happens in thousands (hb_amount_thousands vs nep amount).

Matching strategy (3 passes):
  P1  exact raw-name match (no normalization)
  P2  exact normalized-name match (chainage stripped, OCR fixes) — merges
      section-splits of the same road; amount equality then tells us whether
      the House merely re-scoped or actually re-priced a section.
  P3  fuzzy match (rapidfuzz token_sort_ratio >= 85) on the remainder with
      greedy one-to-one resolution; >= 92 accepted, 85–92 flagged 'review'.

Buckets:
  matched_same_amount / matched_amount_changed / matched_review
  hb_only_not_in_nep   (House insertions or OCR garble)
  nep_only_not_in_hb   (House removals)
"""
import json
import os
import re
from collections import Counter

from rapidfuzz import fuzz, process

BASE = os.path.dirname(os.path.abspath(__file__))
HB_FILE = os.path.join(BASE, "hb_dpwh_items.json")
NEP_FILE = os.path.join(BASE, "..", "nep-data", "json", "fy2027-combined.json")
OUT_MATCH = os.path.join(BASE, "crosscheck_results.json")
OUT_SUMMARY = os.path.join(BASE, "crosscheck_summary.json")

FUZZ_ACCEPT = 92.0
FUZZ_REVIEW = 85.0

OCR_FIXES = [
    (r"\bOuezon\b", "Quezon"),
]


def normalize(name: str) -> str:
    s = name.lower().strip()
    for pat, rep in OCR_FIXES:
        s = re.sub(pat, rep, s, flags=re.I)
    s = s.replace("–", "-").replace("—", "-")
    s = re.sub(r"[^\w\s+\-/]", " ", s)
    # chainage / station noise
    s = re.sub(r"\bsta\.?\s*[a-z]?\s*\d+\s*\+\s*[\d.\-()]+", " sta ", s)
    s = re.sub(r"\bk\s*\d+\s*\+\s*[\d.\-()]+", " k ", s)
    s = re.sub(r"\bchainage\s*\d+\b", " ch ", s)
    s = re.sub(r"\bc\s?\d+\s*\+\s*\d+", " c ", s)
    # enumerators
    s = re.sub(r"^([a-z]|\d{1,3})[\.\)]\s+", "", s)
    # vocabulary normalization
    s = re.sub(r"\bbarangay\b|\bbgy\b", "brgy", s)
    s = re.sub(r"\bsn\b|\bsanto\b|\bsanta\b", "san", s)
    s = re.sub(r"\bconstruction of\b", "construction", s)
    s = re.sub(r"\bimprovement of\b", "improvement", s)
    s = re.sub(r"\bcompletion\b", "construction", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s.strip()


def load_data():
    with open(HB_FILE, encoding="utf-8") as f:
        hb = [it for it in json.load(f)["items"] if not it.get("is_header")]
    with open(NEP_FILE, encoding="utf-8") as f:
        nep = json.load(f)["data"]["data"]
    return hb, nep


def add_rec(bucket, it, r, score, pass_name):
    nep_amt = r["amount"]                # thousands
    hb_amt = it["amount_thousands"]      # thousands
    rec = {
        "nep_code": r["code"],
        "nep_name": r["projectName"],
        "nep_amount_thousands": nep_amt,
        "nep_office": r["office"],
        "nep_region": r["region"],
        "hb_name": it["name"],
        "hb_amount_thousands": hb_amt,
        "hb_program": it["program"],
        "hb_region": it["region"],
        "hb_office": it["office"],
        "score": score,
        "match_pass": pass_name,
    }
    if abs((hb_amt or 0) - (nep_amt or 0)) < 0.5:
        bucket = "matched_same_amount"
    else:
        rec["delta_thousands"] = round((hb_amt or 0) - (nep_amt or 0), 3)
        rec["direction"] = "increased" if rec["delta_thousands"] > 0 else "decreased"
        bucket = "matched_amount_changed"
    return bucket, rec


def main():
    hb, nep = load_data()
    print(f"HB project rows: {len(hb)}, NEP items: {len(nep)}")

    results = {
        "matched_same_amount": [],
        "matched_amount_changed": [],
        "matched_review": [],
        "hb_only_not_in_nep": [],
        "nep_only_not_in_hb": [],
    }
    matched_nep_ids = set()
    matched_hb_idx = set()

    hb_raw = [it["name"].strip() for it in hb]
    hb_norms = [normalize(n) for n in hb_raw]

    # index NEP by raw and normalized names
    nep_by_raw = {}
    nep_by_norm = {}
    for r in nep:
        nep_by_raw.setdefault(r["projectName"].strip(), []).append(r)
        nep_by_norm.setdefault(normalize(r["projectName"]), []).append(r)

    def commit(bucket, it, r, score, pass_name):
        b, rec = add_rec(bucket, it, r, score, pass_name)
        results[b].append(rec)
        matched_nep_ids.add(r["id"])

    # ---- pass 1: raw exact
    for i, it in enumerate(hb):
        cands = nep_by_raw.get(hb_raw[i])
        if cands:
            commit(None, it, cands[0], 100.0, "raw_exact")
            matched_hb_idx.add(i)
    print(f"P1 raw exact: {len(matched_hb_idx)}")

    # ---- pass 2: normalized exact
    before = len(matched_hb_idx)
    for i, it in enumerate(hb):
        if i in matched_hb_idx:
            continue
        cands = nep_by_norm.get(hb_norms[i])
        if cands:
            # prefer a candidate with same amount if any
            pick = None
            for c in cands:
                if abs((it["amount_thousands"] or 0) - (c["amount"] or 0)) < 0.5 and c["id"] not in matched_nep_ids:
                    pick = c
                    break
            if pick is None:
                pick = next((c for c in cands if c["id"] not in matched_nep_ids), None)
            if pick:
                commit(None, it, pick, 100.0, "norm_exact")
                matched_hb_idx.add(i)
    print(f"P2 norm exact: +{len(matched_hb_idx) - before}")

    # ---- pass 3: fuzzy
    remaining_nep = [r for r in nep if r["id"] not in matched_nep_ids]
    nep_norm_list = [normalize(r["projectName"]) for r in remaining_nep]

    cand_pairs = []
    for i, it in enumerate(hb):
        if i in matched_hb_idx:
            continue
        key = hb_norms[i]
        if len(key) < 20:
            continue
        best = process.extractOne(key, nep_norm_list,
                                  scorer=fuzz.token_sort_ratio,
                                  score_cutoff=FUZZ_REVIEW)
        if best:
            _n, score, idx = best
            cand_pairs.append((float(score), i, idx))

    cand_pairs.sort(key=lambda x: -x[0])
    taken_nep = set()
    n_review = 0
    for score, i, idx in cand_pairs:
        if i in matched_hb_idx:
            continue
        r = remaining_nep[idx]
        if r["id"] in taken_nep:
            continue
        it = hb[i]
        if score >= FUZZ_ACCEPT:
            taken_nep.add(r["id"])
            commit(None, it, r, round(score, 1), "fuzzy")
            matched_hb_idx.add(i)
        else:
            # review bucket: record without consuming the NEP item exclusively
            n_review += 1
            b, rec = add_rec(None, it, r, round(score, 1), "fuzzy_review")
            results["matched_review"].append(rec)

    print(f"P3 fuzzy: +{sum(1 for b in results.values() for r2 in b if r2.get('match_pass')=='fuzzy')}, review={n_review}")

    # ---- leftovers
    for i, it in enumerate(hb):
        if i not in matched_hb_idx and len(hb_norms[i]) >= 20:
            results["hb_only_not_in_nep"].append({
                "hb_name": it["name"],
                "hb_amount_thousands": it["amount_thousands"],
                "hb_program": it["program"],
                "hb_region": it["region"],
                "hb_office": it["office"],
                "hb_subcategory": it["subcategory"],
            })

    for r in nep:
        if r["id"] not in matched_nep_ids:
            results["nep_only_not_in_hb"].append({
                "nep_code": r["code"],
                "nep_name": r["projectName"],
                "nep_amount_thousands": r["amount"],
                "nep_office": r["office"],
                "nep_region": r["region"],
                "pap1": r.get("pap1"),
                "pap2": r.get("pap2"),
                "pap3": r.get("pap3"),
            })

    def s(lst, key):
        return round(sum(x.get(key) or 0 for x in lst), 1)

    matched = results["matched_same_amount"] + results["matched_amount_changed"]
    summary = {
        "hb_project_rows": len(hb),
        "nep_items": len(nep),
        "matched_same_amount": len(results["matched_same_amount"]),
        "matched_amount_changed": len(results["matched_amount_changed"]),
        "matched_review": len(results["matched_review"]),
        "hb_only_not_in_nep": len(results["hb_only_not_in_nep"]),
        "nep_only_not_in_hb": len(results["nep_only_not_in_hb"]),
        "amounts_thousands": {
            "nep_total": s(nep, "amount"),
            "nep_matched_total": s(matched, "nep_amount_thousands"),
            "hb_matched_total": s(matched, "hb_amount_thousands"),
            "net_change_on_matched": s(matched, "delta_thousands"),
            "increased": sum(1 for m in matched if m.get("direction") == "increased"),
            "decreased": sum(1 for m in matched if m.get("direction") == "decreased"),
            "hb_only_total": s(results["hb_only_not_in_nep"], "hb_amount_thousands"),
            "nep_only_total": s(results["nep_only_not_in_hb"], "nep_amount_thousands"),
        },
    }

    with open(OUT_MATCH, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=1)
    with open(OUT_SUMMARY, "w", encoding="utf-8") as f:
        json.dump(summary, f, ensure_ascii=False, indent=1)

    print(json.dumps(summary, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
