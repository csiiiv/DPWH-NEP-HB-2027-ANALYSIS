#!/usr/bin/env python3
"""
Produce the HB-vs-NEP crosscheck analysis report (markdown + supporting JSON).

Reads:
  archive/data/hb_dpwh_items.json  (parsed HB VOL IC project rows, historical)
  archive/data/crosscheck_results.json (match buckets, historical)
  archive/data/crosscheck_summary.json (headline numbers, historical)
  ../dpwh-transparency-nep-data/json/fy2027-combined.json

Writes:
  report.md
"""

import sys
from pathlib import Path as _Path
sys.path[:0] = [str(_Path(__file__).resolve().parents[2]), str(_Path(__file__).resolve().parents[2] / 'builders')]
from paths import ANALYSIS, REPO, DATA, VIEWERS, DOCS, ARCHIVE, EVIDENCE
from paths import ARCHIVE_DOCS

import json
import os
from collections import Counter, defaultdict

BASE = str(ANALYSIS)


def load(name):
    with open(os.path.join(BASE, name), encoding="utf-8") as f:
        return json.load(f)


def pesos(thousands):
    if thousands is None:
        return "—"
    v = thousands * 1000
    if abs(v) >= 1e9:
        return f"P{v/1e9:,.2f}B"
    if abs(v) >= 1e6:
        return f"P{v/1e6:,.1f}M"
    return f"P{v:,.0f}"


def main():
    res = load("archive/data/crosscheck_results.json")
    summary = load("archive/data/crosscheck_summary.json")
    hb = [it for it in load("archive/data/hb_dpwh_items.json")["items"] if not it.get("is_header")]

    hb_only = res["hb_only_not_in_nep"]
    nep_only = res["nep_only_not_in_hb"]
    changed = res["matched_amount_changed"]
    review = res["matched_review"]

    L = []
    A = L.append

    A("# HB 10858 (House FY 2027 Budget) vs DPWH NEP FY 2027 — Crosscheck Report\n")
    A("**Data sources**")
    A("- `HB_BUDGET/3 - HB 10858 VOL IC.pdf_by_PaddleOCR-VL-1.6.md` — *Details of DPWH's Programs/Projects* (project-level appropriations, printed in pesos)")
    A("- `dpwh-transparency-nep-data/json/fy2027-combined.json` — DPWH NEP FY 2027 proposal API dump (11,372 projects, amounts in thousands of pesos)")
    A("- Matching: 3-pass name matching (raw exact → normalized exact → fuzzy ≥92, with 85–92 flagged for review)\n")

    A("## 1. Headline numbers\n")
    A("| Metric | Count | Amount |")
    A("|---|---:|---:|")
    A(f"| NEP projects | {summary['nep_items']:,} | {pesos(summary['amounts_thousands']['nep_total'])} |")
    A(f"| HB project line items | {summary['hb_project_rows']:,} | {pesos(sum(i['amount_thousands'] for i in hb))} |")
    A(f"| Matched, same amount | {summary['matched_same_amount']:,} | — |")
    A(f"| Matched, amount changed | {summary['matched_amount_changed']:,} | {pesos(summary['amounts_thousands']['net_change_on_matched'])} net |")
    A(f"| Matched, needs review (fuzzy 85–92) | {summary['matched_review']:,} | — |")
    A(f"| **In HB but not in NEP** (House insertions*) | **{summary['hb_only_not_in_nep']:,}** | **{pesos(summary['amounts_thousands']['hb_only_total'])}** |")
    A(f"| **In NEP but not in HB** (House removals*) | **{summary['nep_only_not_in_hb']:,}** | **{pesos(summary['amounts_thousands']['nep_only_total'])}** |")
    A("")
    A("\\* *Assumes HB = NEP + amendments. OCR garble and section re-scoping can inflate both buckets; the review bucket isolates ambiguous cases.*\n")

    # Amount changed details
    inc = sorted([c for c in changed if c["direction"] == "increased"], key=lambda x: -x["delta_thousands"])
    dec = sorted([c for c in changed if c["direction"] == "decreased"], key=lambda x: x["delta_thousands"])
    A("## 2. Amount changes on retained projects\n")
    A(f"- **{summary['amounts_thousands']['increased']} projects increased** (+{pesos(sum(c['delta_thousands'] for c in inc))})")
    A(f"- **{summary['amounts_thousands']['decreased']} projects decreased** ({pesos(sum(c['delta_thousands'] for c in dec))})\n")
    A("### Top 15 increases\n")
    A("| Project | NEP | HB | Δ | Office |")
    A("|---|---:|---:|---:|---|")
    for c in inc[:15]:
        A(f"| {c['nep_name'][:90]} | {pesos(c['nep_amount_thousands'])} | {pesos(c['hb_amount_thousands'])} | +{pesos(c['delta_thousands'])} | {c['nep_office'] or '—'} |")
    A("")
    A("### Top 15 decreases\n")
    A("| Project | NEP | HB | Δ | Office |")
    A("|---|---:|---:|---:|---|")
    for c in dec[:15]:
        A(f"| {c['nep_name'][:90]} | {pesos(c['nep_amount_thousands'])} | {pesos(c['hb_amount_thousands'])} | {pesos(c['delta_thousands'])} | {c['nep_office'] or '—'} |")
    A("")

    # Insertions by program/region
    A("## 3. House insertions (in HB, not in NEP)\n")
    A("### By DPWH program\n")
    A("| Program | Items | Amount |")
    A("|---|---:|---:|")
    prog_tot = defaultdict(lambda: [0, 0.0])
    for r in hb_only:
        p = (r["hb_program"] or "Unknown/unattributed")
        p = p.split(" (")[0][:60]
        prog_tot[p][0] += 1
        prog_tot[p][1] += (r["hb_amount_thousands"] or 0)
    for p, (n, t) in sorted(prog_tot.items(), key=lambda kv: -kv[1][1]):
        A(f"| {p} | {n:,} | {pesos(t)} |")
    A("")
    A("### By region\n")
    A("| Region | Items | Amount |")
    A("|---|---:|---:|")
    reg_tot = defaultdict(lambda: [0, 0.0])
    for r in hb_only:
        g = r["hb_region"] or "Unattributed"
        reg_tot[g][0] += 1
        reg_tot[g][1] += (r["hb_amount_thousands"] or 0)
    for g, (n, t) in sorted(reg_tot.items(), key=lambda kv: -kv[1][1]):
        A(f"| {g} | {n:,} | {pesos(t)} |")
    A("")
    A("### Top 25 largest insertions\n")
    A("| Amount | Project | Program | District Office |")
    A("|---:|---|---|---|")
    for r in sorted(hb_only, key=lambda x: -(x["hb_amount_thousands"] or 0))[:25]:
        prog = (r["hb_program"] or "—").split(" (")[0][:30]
        A(f"| {pesos(r['hb_amount_thousands'])} | {r['hb_name'][:95]} | {prog} | {(r['hb_office'] or '—')[:40]} |")
    A("")

    # Removals
    A("## 4. House removals (in NEP, not in HB)\n")
    A("### By NEP program (pap2)\n")
    A("| Program | Items | Amount |")
    A("|---|---:|---:|")
    p2_tot = defaultdict(lambda: [0, 0.0])
    for r in nep_only:
        g = (r.get("pap2") or "Unknown")[:60]
        p2_tot[g][0] += 1
        p2_tot[g][1] += (r["nep_amount_thousands"] or 0)
    for g, (n, t) in sorted(p2_tot.items(), key=lambda kv: -kv[1][1]):
        A(f"| {g} | {n:,} | {pesos(t)} |")
    A("")
    A("### Top 25 largest removals\n")
    A("| Amount | Project | Office |")
    A("|---:|---|---|")
    for r in sorted(nep_only, key=lambda x: -(x["nep_amount_thousands"] or 0))[:25]:
        A(f"| {pesos(r['nep_amount_thousands'])} | {r['nep_name'][:95]} | {(r['nep_office'] or '—')[:40]} |")
    A("")

    # Review bucket note
    A("## 5. Caveats & next steps\n")
    A(f"1. **{len(review)} fuzzy pairs scored 85–92** (mostly OCR variants and chainage-only differences) — kept out of the headline match counts; see `crosscheck_results.json → matched_review`.")
    A("2. HB rows ≥ P1B aggregate captions (e.g. `Organizational Outcome 1 …`) were filtered as headers, not projects; a few large genuine foreign-assisted projects therefore sit in the insertion list (LLRN Phase I, Davao City Bypass III, CIA-FRIMP, PMRCIP IV — these exist in HB with loan-tagged names that the NEP dump does not contain as separate items).")
    A("3. District-office attribution for HB rows relies on the OCR table hierarchy; ~17% of rows lack an office context (mostly region-level lump sums like `Regionwide / Nationwide`).")
    A("4. Unit handling: HB prints pesos; NEP stores thousands. All comparisons use thousands.")
    A("5. Suggested next steps: reconcile the review bucket manually (365 rows), then link matched NEP codes to the DPWH transparency contracts data (`dpwh-transparency-data-api-scraper`) for implementation-stage tracking of House-inserted projects.")

    with open(str(ARCHIVE_DOCS / "report.md"), "w", encoding="utf-8") as f:
        f.write("\n".join(L))
    print("Wrote report.md")
    print("\n".join(L[:40]))


if __name__ == "__main__":
    main()
