#!/usr/bin/env python3
"""
FY2027 three-way crosscheck: House Bill 10858 (PDF parse) vs official NEP
(github compilation) vs NEP line-item API (DPWH bettergov).

Pillars
-------
A. NEP official  — analysis/data/reference_official_compilation.json
                   (program-level NEP FY2027, PHP pesos, incl. S2O/GAS)
B. NEP API       — nep-data/json/fy2027-combined.json
                   (11,372 project line items, PHP thousands; S2O/GAS absent)
C. HB 10858 PDF  — analysis/archive/hb_dpwh_leaves_corrected_v3.json (historical; corrected
                   line items) + hb_dpwh_pap_hierarchy.json (printed section
                   control totals)

Program mapping: canonical HB categories (from build_taxonomy_comparison
classifier) roll up to the 8 official DPWH programs, so all three sources
land on one program axis. Outputs crosscheck_2027.{json,html}.

Drill-downs: the HTML embeds per-PAP/per-region HB-vs-API deltas
(from crosscheck_2027_pap_drilldown.json) and project-level findings
(from crosscheck_results.json: same / amount-edited / review / HB-only /
NEP-only), so the report can be expanded from program totals down to
individual projects.
"""

import sys
from pathlib import Path as _Path
sys.path[:0] = [str(_Path(__file__).resolve().parents[1]), str(_Path(__file__).resolve().parents[1] / 'builders')]
from paths import ANALYSIS, REPO, DATA, VIEWERS, DOCS, ARCHIVE, EVIDENCE


import json
import re
from collections import defaultdict

from hb_program_classifier import fap_program, hb_program  # noqa: F401
import sys

REF = "analysis/data/reference_official_compilation.json"
NEP = "nep-data/json/fy2027-combined.json"
LEAVES = "analysis/archive/hb_dpwh_leaves_corrected_v4b.json"
HIER = "analysis/data/hb_dpwh_pap_hierarchy.json"
DD_PATH = "analysis/data/crosscheck_2027_pap_drilldown.json"
XRES_PATH = "analysis/archive/crosscheck_results.json"
OUT_JSON = "analysis/data/crosscheck_2027.json"
OUT_HTML = "analysis/viewers/crosscheck_2027.html"

CAT2PROG = {
    "Construction/ Maintenance of Flood Mitigation Structures and Drainage Systems": "Flood Management Program",
    "Construction/ Rehabilitation of Flood Mitigation Facilities within Major River Basins and Principal Rivers": "Flood Management Program",
    "Rehabilitation of Disaster-Related Infrastructure and Other Facilities": "Flood Management Program",
    "BIP - Access Roads and/or Bridges from the National Roads leading to Major/ Strategic Public Buildings/ Facilities": "Convergence and Special Support Program",
    "BIP - Multi-Purpose Buildings/ Facilities to support Social Services": "Convergence and Special Support Program",
    "BIP - Coastal Roads to augment Resiliency of Coastal Communities": "Convergence and Special Support Program",
    "BIP - Local Ports and Boat Landings": "Convergence and Special Support Program",
    "Water Supply System": "Convergence and Special Support Program",
    "Rainwater Collector System": "Convergence and Special Support Program",
    "Septage and Sewerage": "Convergence and Special Support Program",
    "Facilities for Elderlies/ Senior Citizen": "Convergence and Special Support Program",
    "Facilities for Persons with Disabilities (PWD)": "Convergence and Special Support Program",
    "Gender-Responsive Facilities": "Convergence and Special Support Program",
    "Buildings And Other Structures": "Local Program",
    "Construction of By-Pass and Diversion Roads": "Network Development Program",
    "Construction of Missing Links/ New Roads": "Network Development Program",
    "Construction of Flyovers/ Interchanges/ Underpasses/ Long Span Bridges": "Network Development Program",
    "Asset Preservation Program": "Asset Preservation Program",
    "Preventive Maintenance - Primary Roads": "Asset Preservation Program",
    "Preventive Maintenance - Secondary Roads": "Asset Preservation Program",
    "Preventive Maintenance - Tertiary Roads": "Asset Preservation Program",
    "Preventive Maintenance (unspecified class)": "Asset Preservation Program",
    "Rehabilitation/ Reconstruction/ Upgrading of Damaged Paved Roads - Primary Roads": "Asset Preservation Program",
    "Rehabilitation/ Reconstruction/ Upgrading of Damaged Paved Roads - Secondary Roads": "Asset Preservation Program",
    "Rehabilitation/ Reconstruction/ Upgrading of Damaged Paved Roads - Tertiary Roads": "Asset Preservation Program",
    "Rehabilitation/ Reconstruction of Roads with Slips, Slope Collapse, and Landslide - Primary Roads": "Asset Preservation Program",
    "Rehabilitation/ Reconstruction of Roads with Slips, Slope Collapse, and Landslide - Secondary Roads": "Asset Preservation Program",
    "Rehabilitation/ Reconstruction of Roads with Slips, Slope Collapse, and Landslide - Tertiary Roads": "Asset Preservation Program",
    "Off-Carriageway Improvement - Primary Roads": "Asset Preservation Program",
    "Off-Carriageway Improvement - Secondary Roads": "Asset Preservation Program",
    "Off-Carriageway Improvement - Tertiary Roads": "Asset Preservation Program",
    "Paving of Unpaved Roads - Primary Roads": "Asset Preservation Program",
    "Paving of Unpaved Roads - Secondary Roads": "Asset Preservation Program",
    "Paving of Unpaved Roads - Tertiary Roads": "Asset Preservation Program",
    "Construction/ Upgrading/ Rehabilitation of Drainage along National Roads - Primary Roads": "Asset Preservation Program",
    "Construction/ Upgrading/ Rehabilitation of Drainage along National Roads - Secondary Roads": "Asset Preservation Program",
    "Construction/ Upgrading/ Rehabilitation of Drainage along National Roads - Tertiary Roads": "Asset Preservation Program",
    "Widening of Permanent Bridges": "Bridge Program",
    "Replacement of Permanent Weak Bridges": "Bridge Program",
    "Construction of New Bridges": "Bridge Program",
    "Rehabilitation/ Major Repair of Permanent Bridges": "Bridge Program",
    "Retrofitting/ Strengthening of Permanent Bridges": "Bridge Program",
    "Replacement of Bridges (Temporary to Permanent)": "Bridge Program",
    "Road Widening - Primary Roads": "Network Development Program",
    "Road Widening - Secondary Roads": "Network Development Program",
    "Road Widening - Tertiary Roads": "Network Development Program",
}
# HOUSE:/PROGRAM:/unclassified buckets map to a synthetic "Unclassified (HB)"


def canon_region(s):
    """Canonical region name shared by the drill-down JSON and the API dump."""
    s = (s or "").strip()
    if not s:
        return "?"
    low = s.lower()
    if low.startswith("region "):
        return "Region " + s.split()[-1]
    return {
        "national capital region": "NCR", "ncr": "NCR",
        "cordillera administrative region": "CAR", "car": "CAR",
        "mimaropa region": "MIMAROPA", "mimaropa": "MIMAROPA",
        "soccsksargen region": "Region XII", "region xii": "Region XII",
        "negros island region": "NIR", "nir": "NIR",
        "negros island region (nir)": "NIR",
        "barmm": "Nationwide",
        "autonomous region in muslim mindanao": "Nationwide",
        "nationwide": "Nationwide",
    }.get(low, s)


def pap2_program(p2):
    """Map NEP pap2 labels onto the report's 8 official programs."""
    p2 = (p2 or "").strip()
    if p2 == "National Building Program":
        return "Local Program"
    if p2.startswith("Basic Infrastructure") or \
       p2.startswith("Construction/ Rehabilitation of Water Supply") or \
       p2.startswith("Construction/Rehabilitation/Improvement of Facilities"):
        return "Convergence and Special Support Program"
    return p2


def build_drilldown(nep, dd):
    """Fold PAP-level and project-level drill-down data into the payload."""
    # program of each pap3 (majority pap2 of its API rows) and of each API row
    prog_votes = defaultdict(lambda: defaultdict(int))
    code2prog = {}
    for i in nep:
        p = pap2_program(i.get("pap2"))
        code2prog[i["code"]] = p
        k = (i.get("pap3") or "").strip()
        if k:
            prog_votes[k][p] += 1
    pap3_prog = {k: max(v.items(), key=lambda kv: kv[1])[0]
                 for k, v in prog_votes.items()}

    RAWPROG = [  # free-text HB program descriptions -> canonical programs
        ("basic infrastructure", "Convergence and Special Support Program"),
        ("flood management", "Flood Management Program"),
        ("asset preservation", "Asset Preservation Program"),
        ("network development", "Network Development Program"),
        ("bridge program", "Bridge Program"),
        ("national building", "Local Program"),
    ]

    def findings_program(rec):
        """Canonical program for a findings row (NEP side authoritative)."""
        p = code2prog.get(rec.get("nep_code"))
        if p:
            return p
        s = (rec.get("hb_program") or "").lower()
        for k, v in RAWPROG:
            if k in s:
                return v
        return "?"

    # ---- level 1: PAP blocks (HB printed headings vs API pap3 groups) -----
    # v3 semantics: hb_local_php is the comparable figure (the NEP API carries
    # no FAP items); delta_php = hb_local - api. FAP-zone money printed under
    # the same label is carried separately as hb_fap_php and never diffed.
    paps = []
    for r in dd.get("matched_paps", []):
        key = r.get("pap3") or (r.get("api_pap3")
                                or (r.get("hb_labels") or ["?"])[0])
        hb_local = r.get("hb_local_php") or 0
        paps.append({
            "label": (r.get("hb_labels") or ["?"])[0],
            "pages": r.get("hb_pages") or [],
            "program": pap3_prog.get(key, "?"),
            "hb_local": hb_local,
            "hb_fap": r.get("hb_fap_php") or 0,
            "api_total": r.get("api_total_php") or 0,
            "api_projects": r.get("api_projects") or 0,
            "delta": r.get("delta_php", hb_local - (r.get("api_total_php")
                                                    or 0)),
            "exact": bool(r.get("total_match")),
            "regions": sorted(
                ({"region": canon_region(x["region"]),
                  "hb": x["hb_php"], "api": x["api_php"],
                  "delta": x["delta_php"]} for x in r.get("region_deltas", [])
                 if x.get("hb_php") or x.get("api_php")),
                key=lambda x: -abs(x["delta"])),
            "region_exact": r.get("regions_exact") or 0,
        })
    paps.sort(key=lambda p: -abs(p["delta"]))

    unmatched = [{"label": b["label"], "total": b["total"],
                  "page": b.get("page"), "zone": b.get("zone") or "?"}
                 for b in (dd.get("unmatched_hb_blocks")
                           or dd.get("hb_only_blocks") or [])]
    unmatched.sort(key=lambda b: -b["total"])

    # ---- level 2: project findings (bucketed, capped for payload size) ----
    FIND_CAP = 800           # max rows embedded per findings bucket
    payload = json.load(open(XRES_PATH, encoding="utf-8"))

    def bucket_program(rec, side):
        if side == "hb":
            return pap3_prog.get((rec.get("hb_subcategory") or "").strip()) \
                or findings_program(rec)
        return pap3_prog.get((rec.get("pap3") or "").strip()) \
            or findings_program(rec)

    findings = {"amount_edited": [], "hb_only": [], "nep_only": [],
                "review": []}
    counts = {"amount_edited": 0, "hb_only": 0, "nep_only": 0, "review": 0}
    totals = {"amount_edited": 0.0, "hb_only": 0.0, "nep_only": 0.0,
              "review": 0.0}
    for r in payload["matched_amount_changed"]:
        counts["amount_edited"] += 1
        totals["amount_edited"] += r.get("delta_thousands") or 0
        if len(findings["amount_edited"]) < FIND_CAP:
            findings["amount_edited"].append({
                "name": r["hb_name"] or r["nep_name"],
                "hb": (r.get("hb_amount_thousands") or 0) * 1000,
                "api": (r.get("nep_amount_thousands") or 0) * 1000,
                "delta": (r.get("delta_thousands") or 0) * 1000,
                "region": canon_region(r.get("hb_region")
                                       or r.get("nep_region")),
                "program": bucket_program(r, "hb")
                or bucket_program(r, "nep") or "?",
                "pass": r.get("match_pass"),
            })
    for r in payload["hb_only_not_in_nep"]:
        counts["hb_only"] += 1
        totals["hb_only"] += r.get("hb_amount_thousands") or 0
        if len(findings["hb_only"]) < FIND_CAP:
            findings["hb_only"].append({
                "name": r["hb_name"], "hb": (r.get("hb_amount_thousands")
                                             or 0) * 1000,
                "region": canon_region(r.get("hb_region")),
                "program": bucket_program(r, "hb") or "?",
            })
    for r in payload["nep_only_not_in_hb"]:
        counts["nep_only"] += 1
        totals["nep_only"] += r.get("nep_amount_thousands") or 0
        if len(findings["nep_only"]) < FIND_CAP:
            findings["nep_only"].append({
                "name": r["nep_name"], "api": (r.get("nep_amount_thousands")
                                               or 0) * 1000,
                "code": r.get("nep_code"),
                "region": canon_region(r.get("nep_region")),
                "program": pap2_program(r.get("pap2")),
            })
    for r in payload["matched_review"]:
        counts["review"] += 1
        totals["review"] += (r.get("delta_thousands")
                             or abs((r.get("hb_amount_thousands") or 0)
                                    - (r.get("nep_amount_thousands") or 0)))
        if len(findings["review"]) < FIND_CAP:
            findings["review"].append({
                "name": r["hb_name"] or r["nep_name"],
                "hb": (r.get("hb_amount_thousands") or 0) * 1000,
                "api": (r.get("nep_amount_thousands") or 0) * 1000,
                "delta": (r.get("delta_thousands") or 0) * 1000,
                "score": r.get("score"),
                "region": canon_region(r.get("hb_region")
                                       or r.get("nep_region")),
                "program": bucket_program(r, "hb")
                or bucket_program(r, "nep") or "?",
            })
    for v in findings.values():
        v.sort(key=lambda x: -(x.get("delta") or x.get("hb")
                               or x.get("api") or 0))

    return {
        "paps": paps,
        "unmatched_hb_blocks": unmatched,
        "family_rollups": dd.get("family_rollups") or [],
        "printed_containers": dd.get("printed_containers") or [],
        "support_blocks": dd.get("support_blocks") or [],
        "findings": findings,
        "findings_counts": counts,
        "findings_totals_thousands": totals,
        "findings_capped_at": FIND_CAP,
    }


def main():
    ref = json.load(open(REF, encoding="utf-8"))
    official = ref["nep_gaa_by_program_fy2018_2027"]["2027"]
    nep = json.load(open(NEP, encoding="utf-8"))["data"]["data"]
    leaves = json.load(open(LEAVES, encoding="utf-8"))["leaves"]
    hier = json.load(open(HIER, encoding="utf-8"))

    # ---- pillar B: NEP API by official program ----------------------------
    api_prog = defaultdict(float)
    api_prog_projects = defaultdict(int)
    for i in nep:
        p2 = i["pap2"].strip()
        if p2 == "National Building Program":
            prog = "Local Program"
        elif p2.startswith("Basic Infrastructure") or \
                p2.startswith("Construction/ Rehabilitation of Water Supply") or \
                p2.startswith("Construction/Rehabilitation/Improvement of Facilities"):
            prog = "Convergence and Special Support Program"
        else:
            prog = p2
        api_prog[prog] += (i["amount"] or 0) * 1000
        api_prog_projects[prog] += 1

    # ---- pillar C: HB corrected leaves by program ------------------------
    # v4 leaves: PAP names repaired; attribute via pap3 (ground truth from
    # the PAP drilldown) with the keyword classifier as fallback
    sys.path.insert(0, "analysis")
    from crosscheck_pap_drilldown import api_groups as _api_groups, \
        match_pap3 as _match_pap3
    pap3s = _api_groups()
    pap3_to_prog = {}
    for k in pap3s:
        p = hb_program({"pap": k, "project": ""}) or \
            hb_program({"pap": "", "project": k})
        pap3_to_prog[k] = p
    hb_prog = defaultdict(float)
    hb_prog_n = defaultdict(int)
    hb_unclassified = 0.0
    hb_unclassified_n = 0
    for l in leaves:
        pap = re.sub(r"<headingless @\d+>\s*", "",
                     (l.get("pap") or "")).replace("\n", " ").strip()
        k = _match_pap3(pap, pap3s)
        prog = pap3_to_prog.get(k) if k else None
        if prog is None:
            mapper = fap_program if l.get("zone") == "fap" else hb_program
            prog = mapper(l)
        if prog is None:
            hb_unclassified += l["amount_php"] or 0
            hb_unclassified_n += 1
        else:
            hb_prog[prog] += l["amount_php"] or 0
            hb_prog_n[prog] += 1

    # ---- printed section control totals (HB PDF) --------------------------
    printed = {}
    for a in hier["alloc_lines"]:
        n = (a.get("name") or "").strip()
        v = a.get("amount_php") or 0
        if n == "MAINTENANCE AND OTHER OPERATING EXPENSES":
            printed.setdefault("MOOE (printed)", v)
        elif n == "GENERAL ADMINISTRATIVE AND SUPPORT":
            printed.setdefault("GAS (printed)", v)
        elif n == "SUPPORT TO OPERATIONS":
            printed.setdefault("S2O (printed)", v)
    for oc in hier["outcomes"]:
        nm = (oc["name"] or "").strip()
        v = oc.get("printed_total_php") or 0
        if nm.startswith("ORGANIZATIONAL OUTCOME 1"):
            printed["Organizational Outcome 1 (printed)"] = v
        elif nm.startswith("GANIZATIONAL OUTCOME 2"):
            printed["Organizational Outcome 2 (printed)"] = v
        elif nm.startswith("OCALLY-FUNDED"):
            printed["Locally-Funded Projects (printed)"] = v
        elif nm.startswith("FOREIGN-ASSISTED"):
            printed["Foreign-Assisted Projects (printed)"] = v
        elif nm == "PERATIONS":
            printed["OPERATIONS (printed rollup)"] = v

    # ---- program crosscheck table -----------------------------------------
    programs = ["Network Development Program", "Asset Preservation Program",
                "Bridge Program", "Flood Management Program",
                "Convergence and Special Support Program", "Local Program"]
    rows = []
    for p in programs:
        off = official.get(p, {}).get("nep") or 0
        api = api_prog.get(p, 0)
        hb = hb_prog.get(p, 0)
        rows.append({
            "program": p,
            "nep_official_php": off,
            "nep_api_php": api,
            "nep_api_projects": api_prog_projects.get(p, 0),
            "hb_leaves_php": hb,
            "hb_leaves_projects": hb_prog_n.get(p, 0),
            "api_gap_php": off - api,          # NEP items missing from API
            "hb_minus_official_php": hb - off,  # House delta vs NEP baseline
            "hb_minus_api_php": hb - api,       # House delta vs API line items
        })

    s2o_gas = {
        "nep_official_s2o_php": official.get("Support to Operations", {}).get("nep") or 0,
        "nep_official_gas_php": official.get("General Administration and Support", {}).get("nep") or 0,
        "hb_printed_mooe_php": printed.get("MOOE (printed)", 0),
        "hb_printed_s2o_php": printed.get("S2O (printed)", 0),
        "hb_printed_gas_php": printed.get("GAS (printed)", 0),
    }
    s2o_gas["nep_official_php"] = (s2o_gas["nep_official_s2o_php"]
                                   + s2o_gas["nep_official_gas_php"])
    s2o_gas["hb_printed_php"] = (s2o_gas["hb_printed_mooe_php"]
                                 + s2o_gas["hb_printed_s2o_php"]
                                 + s2o_gas["hb_printed_gas_php"])

    grand = {
        "nep_official_php": sum(official[p].get("nep") or 0 for p in official),
        "nep_api_php": sum(api_prog.values()),
        "hb_leaves_classified_php": sum(hb_prog.values()),
        "hb_unclassified_php": hb_unclassified,
        "hb_unclassified_projects": hb_unclassified_n,
        "hb_leaves_total_php": sum(l["amount_php"] or 0 for l in leaves),
        "hb_leaves_total_projects": len(leaves),
    }
    # MOOE printed == GAS + S2O exactly (verified), so the House grand adds
    # MOOE once; OPERATIONS rollup kept for the leaf-capture ratio
    grand["hb_mooe_identity_ok"] = (
        s2o_gas["hb_printed_mooe_php"]
        == s2o_gas["hb_printed_gas_php"] + s2o_gas["hb_printed_s2o_php"])
    grand["hb_grand_upper_php"] = (grand["hb_leaves_total_php"]
                                   + s2o_gas["hb_printed_mooe_php"])
    grand["hb_operations_printed_php"] = printed.get(
        "OPERATIONS (printed rollup)", 0)
    grand["hb_leaf_capture_vs_operations"] = (
        grand["hb_leaves_total_php"] / grand["hb_operations_printed_php"]
        if grand["hb_operations_printed_php"] else None)

    out = {
        "meta": {
            "fiscal_year": 2027,
            "hb_source": "HB 10858 VOL I-C (PDF text-layer-verified parse)",
            "nep_official_source": "github.com/ajamontesa/ph-budget-analysis (Compiled_-_DPWH.xlsx)",
            "nep_api_source": "api.dpwh.bettergov.ph/nep/projects?fiscalYear=2027",
            "unit": "PHP pesos",
            "caveats": [
                "NEP/API gap is ₱197.233952B = ₱69.687941B GAS/S2O + ₱117.749011B FAP + ₱9.797B in 23 printed non-FAP allocations. See nep_2027_api_reconciliation.md; API-unmatched findings are not verified insertions/removals.",
                "HB program attribution uses a keyword/canonical-label classifier; ₱18.7B of OCR-damaged rows stay unclassified.",
                "HB printed MOOE (₱24.69B) = GAS + S2O exactly, so the House DPWH grand = OPERATIONS rollup + MOOE.",
                "HB grand = corrected line items + printed MOOE/S2O/GAS control totals (upper bound).",
                "PAP drill-down compares printed PAP block totals (HB PDF) to NEP API pap3 groups; region buckets use canonical region names.",
                "Project findings come from a 3-pass name matcher (raw exact → normalized exact → fuzzy ≥92); HB-only rows mix House insertions with OCR garble and NEP-only rows mix removals with API-side additions.",
            ],
        },
        "grand_totals": grand,
        "s2o_gas": s2o_gas,
        "printed_sections": printed,
        "programs": rows,
        "drilldown": build_drilldown(nep,
                                     json.load(open(DD_PATH,
                                                    encoding="utf-8"))),
    }
    with open(OUT_JSON, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)

    payload = json.dumps(out, ensure_ascii=False).replace("</", "<\\/")
    with open(OUT_HTML, "w", encoding="utf-8") as f:
        f.write(HTML.replace("__DATA__", payload))

    B = 1e9
    print(f"{'Program':<44}{'NEP off':>9}{'NEP API':>9}{'HB leaves':>10}{'HB−off':>9}")
    for r in rows:
        print(f"{r['program'][:43]:<44}{r['nep_official_php']/B:>9.1f}"
              f"{r['nep_api_php']/B:>9.1f}{r['hb_leaves_php']/B:>10.1f}"
              f"{r['hb_minus_official_php']/B:>+9.1f}")
    print(f"\nNEP official grand: {grand['nep_official_php']/B:.1f}B | "
          f"API: {grand['nep_api_php']/B:.1f}B | "
          f"HB leaves: {grand['hb_leaves_total_php']/B:.1f}B | "
          f"HB upper: {grand['hb_grand_upper_php']/B:.1f}B")
    print("wrote", OUT_JSON, OUT_HTML)


HTML = r"""<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>FY2027 Three-Way Crosscheck — HB 10858 vs NEP</title>
<style>
:root{--bg:#0d1117;--panel:#161b22;--line:#2d3646;--txt:#e6edf3;--dim:#8b98a9;
--mono:ui-monospace,Menlo,Consolas,monospace;--red:#f85149;--green:#3fb950;
--amber:#d29922;--blue:#58a6ff}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--bg);color:var(--txt);font:14px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;padding:26px}
.wrap{max-width:1180px;margin:0 auto}
h1{font-size:20px}.sub{color:var(--dim);margin:6px 0 20px;font-size:13px}
table{width:100%;border-collapse:collapse;margin-bottom:26px}
th{font-size:11px;text-transform:uppercase;letter-spacing:.7px;color:var(--dim);text-align:left;padding:8px 10px;border-bottom:1px solid var(--line)}
td{padding:9px 10px;border-bottom:1px solid var(--line);vertical-align:top}
td.num,th.num{font-family:var(--mono);text-align:right;white-space:nowrap}
.pos{color:var(--red)}.neg{color:var(--green)}.dim{color:var(--dim)}
.cardrow{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px;margin-bottom:22px}
.card{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:12px 14px}
.card .k{color:var(--dim);font-size:11px;text-transform:uppercase;letter-spacing:.7px}
.card .v{font-size:19px;font-weight:700;font-family:var(--mono);margin-top:2px}
.card .d{font-size:11px;color:var(--dim);margin-top:2px}
.warn{background:#2e2408;border:1px solid #6b5416;border-radius:10px;padding:12px 16px;color:var(--amber);font-size:13px;margin-bottom:22px;line-height:1.6}
a{color:var(--blue)}
tr.pap{cursor:pointer;user-select:none}
tr.pap:hover td{background:#1c2330}
tr.pap .tw{display:inline-block;width:1.1em;color:var(--dim)}
tr.pap.open .tw{transform:rotate(90deg)}
tr.sub>td{background:var(--panel);padding-top:0;padding-bottom:0;border-bottom:none}
tr.sub table{margin:6px 0 10px}
tr.sub th{font-size:10px;padding:5px 8px}
tr.sub td{padding:5px 8px;font-size:12.5px}
.badge{display:inline-block;font-size:10px;font-weight:600;letter-spacing:.4px;padding:1px 7px;border-radius:9px;border:1px solid var(--line);color:var(--dim);margin-left:6px}
.badge.ok{color:var(--green);border-color:#1d4423}
.badge.warnb{color:var(--amber);border-color:#6b5416}
.pillrow{margin:2px 0 14px}
.pill{display:inline-block;background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:3px 12px;margin:0 6px 6px 0;font-size:12px;cursor:pointer;color:var(--dim)}
.pill:hover{border-color:var(--blue)}
.pill.on{color:var(--txt);border-color:var(--blue);background:#12233c}
.pill b{color:var(--txt);font-family:var(--mono)}
#fcount{color:var(--dim);font-size:12px}
input[type=search]{background:var(--bg);border:1px solid var(--line);border-radius:8px;color:var(--txt);font:inherit;padding:6px 10px;width:280px;margin-right:10px}
input[type=search]:focus{outline:1px solid var(--blue)}
#fwrap{max-height:560px;overflow-y:auto;border:1px solid var(--line);border-radius:10px}
#fwrap table{margin:0}
#fwrap thead th{position:sticky;top:0;background:var(--panel);z-index:1}
.tag{display:inline-block;font-size:10px;letter-spacing:.5px;padding:1px 6px;border-radius:8px}
.tag.up{background:#2a1214;color:var(--red)}
.tag.dn{background:#0f2416;color:var(--green)}
.tag.eq{background:#1c2330;color:var(--dim)}
code{font-family:var(--mono);font-size:12px}
</style></head><body><nav data-historical="true" style="padding:12px 20px;margin-bottom:18px;background:#fff1d9;color:#203147;font:14px/1.5 system-ui"><a href="../site/index.html">All dashboards</a> · Historical House v4b / API artifact. Budget upper-bound and insertion/removal labels below are superseded. <a href="source_comparison_2027.html">Open the current source comparison</a></nav><div class="wrap">
<h1>FY2027 Three-Way Crosscheck — DPWH</h1>
<div class="sub">House Bill 10858 (PDF) · Official NEP (github compilation) · NEP line-item API (bettergov)</div>
<div class="warn">⚠ <b>NEP API is incomplete:</b> line items sum to ₱445.4B while the official FY2027 NEP is ₱642.6B.
The gap reconciles as ₱69.687941B GAS/S2O + ₱117.749011B foreign-assisted projects + ₱9.797B in 23 non-FAP allocations.
House-only/API-only findings below are API comparison outcomes, not verified insertions/removals. See the <a href="nep_2027_api_reconciliation.md">NEP source reconciliation</a> and <a href="FY2027_work_summary.md">current work summary</a>; the displayed findings have not been rematched against the expanded source.</div>
<p style="margin:12px 0">Amounts: 3 decimals · B billion, M million, T thousands. Click column headers to sort the displayed rows. <span class="delta-positive">+ Increased</span> · <span class="delta-negative">− Decreased</span>.</p><div class="cardrow" id="cards"></div>
<h3 style="margin-bottom:8px">Program-level totals (B/M/T)</h3>
<table id="pt"><thead><tr>
<th>Program</th><th class="num">NEP official</th><th class="num">NEP API</th>
<th class="num">HB leaves</th><th class="num">HB projects</th>
<th class="num">API gap</th><th class="num">HB − official</th>
</tr></thead><tbody></tbody></table>
<h3 style="margin-bottom:8px">PAP drill-down — printed HB blocks vs NEP API <span class="dim" style="font-weight:400;font-size:12px">(local zone only — the API carries no FAP items · click a row for regions · sorted by |Δ|)</span></h3>
<div id="paps"></div>
<h3 style="margin-bottom:8px">Project findings explorer <span class="dim" style="font-weight:400;font-size:12px">amount-edited · HB-only · NEP-only · fuzzy-review</span></h3>
<div class="pillrow" id="fpills"></div>
<div style="margin-bottom:10px"><input type="search" id="fq" placeholder="filter by project name, region, program…"><span id="fcount"></span></div>
<div id="fwrap"><table id="ft"><thead><tr>
<th>Project</th><th>Class</th><th class="num">HB ₱</th><th class="num">API ₱</th><th class="num">Δ ₱</th><th>Region</th><th>Program</th>
</tr></thead><tbody></tbody></table></div>
<h3 style="margin-bottom:8px">Grand totals</h3>
<table id="gt"><tbody></tbody></table>
<h3 style="margin-bottom:8px">HB printed section control totals (from the bill itself)</h3>
<table id="sec"><tbody></tbody></table>
<div style="color:var(--dim);font-size:12px;margin-top:18px" id="foot"></div>
</div>
<script src="budget_display.js"></script>
<script>
const D = __DATA__;
const B = 1e9;
const f = BudgetDisplay.amount;
const esc = s => String(s).replace(/</g,"&lt;");
const G = D.grand_totals;
document.getElementById("cards").innerHTML = [
 ["NEP FY2027 official", G.nep_official_php, "github compilation (incl. S2O+GAS)"],
 ["NEP API line items", G.nep_api_php, `${G.hb_leaves_total_projects>0?"11,372":""} rows · S2O/GAS absent`],
 ["HB 10858 line items", G.hb_leaves_total_php, `${G.hb_leaves_total_projects.toLocaleString()} corrected rows`],
 ["HB grand (upper)", G.hb_grand_upper_php, "line items + printed MOOE/S2O/GAS"],
].map(([k,v,d])=>`<div class="card"><div class="k">${k}</div><div class="v">${f(v)}</div><div class="d">${d}</div></div>`).join("");

const tb = document.querySelector("#pt tbody");
tb.innerHTML = D.programs.map(r=>{
 const ap = r.api_gap_php, ho = r.hb_minus_official_php;
 return `<tr><td>${esc(r.program)}</td>
 <td class="num" data-sort-value="${r.nep_official_php}">${f(r.nep_official_php)}</td><td class="num" data-sort-value="${r.nep_api_php}">${f(r.nep_api_php)}</td>
 <td class="num" data-sort-value="${r.hb_leaves_php}">${f(r.hb_leaves_php)}</td><td class="num dim" data-sort-value="${r.hb_leaves_projects}">${r.hb_leaves_projects.toLocaleString()}</td>
 <td data-sort-value="${ap}" class="num ${BudgetDisplay.deltaClass(ap)}">${ap>0?"+":""}${f(Math.abs(ap))} missing</td>
 ${BudgetDisplay.cell(ho,true)}</tr>`;
}).join("");

// ---- PAP drill-down: program -> PAP blocks -> regions --------------------
const DD = D.drilldown;
const fs = BudgetDisplay.amount;
const dd = BudgetDisplay.delta;
const tw = `<span class="tw">▸</span>`;
const progSpan = p => p && p!=="?" ? esc(p) : `<span class="dim">unmapped</span>`;
const PDFURL = "../HB_BUDGET/3%20-%20HB%2010858%20VOL%20IC.pdf";
const papsEl = document.getElementById("paps");
papsEl.innerHTML = `<table><thead><tr><th>PAP (printed HB block)</th><th>Program</th><th class="num">HB ₱ (local)</th><th class="num">API ₱</th><th class="num">Δ (HB−API)</th><th class="num">PDF</th></tr></thead><tbody>`
 + DD.paps.map((p,i)=>{
 const dl = p.delta>0?"pos":p.delta<0?"neg":"dim";
 const flags = p.exact?`<span class="badge ok">✓ exact</span>`:""
  + (p.hb_fap?` <span class="badge" title="FAP-zone money printed under this label; excluded from the delta (no API coverage)">+ ${fs(p.hb_fap)} FAP</span>`:"");
 const regions = p.regions.filter(x=>x.hb||x.api).map(x=>
  `<tr><td>${esc(x.region)}</td><td class="num" data-sort-value="${x.hb}">${fs(x.hb)}</td><td class="num" data-sort-value="${x.api}">${fs(x.api)}</td>${BudgetDisplay.cell(x.delta,true)}</tr>`).join("");
 return `<tr class="pap" data-i="${i}"><td>${tw}${esc(p.label)}${flags}</td>
 <td class="num dim">${progSpan(p.program)}</td>
 <td class="num" data-sort-value="${p.hb_local}">${fs(p.hb_local)}</td><td class="num" data-sort-value="${p.api_total}">${fs(p.api_total)}</td>
 ${BudgetDisplay.cell(p.delta,true)}<td class="num dim">${p.pages.map(pg=>`<a href="${PDFURL}#page=${pg}" target="_blank" rel="noopener">p.${pg}</a>`).join(" · ")}</td></tr>
 <tr class="sub" id="sub-${i}" style="display:none"><td colspan="6"><table>
  <thead><tr><th>Region</th><th class="num">HB ₱</th><th class="num">API ₱</th><th class="num">Δ ₱</th></tr></thead>
  <tbody>${regions||`<tr><td colspan="4" class="dim">no region buckets</td></tr>`}</tbody>
 </table></td></tr>`;
}).join("")
 + (DD.unmatched_hb_blocks.length ? `<tr><td colspan="6" style="padding-top:16px"><span class="dim">${DD.unmatched_hb_blocks.length} printed HB blocks had no NEP pap3 counterpart (no API presence):</span> ${DD.unmatched_hb_blocks.map(b=>`<span class="badge">${esc(b.label.slice(0,58))}${b.zone!=="?"?` · ${b.zone}`:""} · ${fs(b.total)}</span>`).join(" ")}</td></tr>` : "")
 + `</tbody></table>`
 + (DD.family_rollups.length ? `<p class="dim" style="font-size:12px;margin:10px 0 6px">Verified family rollups (intro heading = sum of type-split children): ${DD.family_rollups.map(r=>`${esc(r.family)} ✓ ${fs(r.intro_total_php)}${r.rollup_match?"":" ⚠ MISMATCH"}`).join(" · ")}</p>` : "")
 + (DD.support_blocks.length ? `<p class="dim" style="font-size:12px;margin:6px 0">S2O support blocks (not in NEP API): ${DD.support_blocks.map(b=>`${esc(b.label.replace(/^a\.\s*/,""))} · ${fs(b.total)}`).join(" · ")}</p>` : "");
papsEl.addEventListener("click", e=>{
 const tr = e.target.closest("tr.pap");
 if(!tr) return;
 const sub = document.getElementById("sub-"+tr.dataset.i);
 const open = sub.style.display !== "none";
 sub.style.display = open?"none":"table-row";
 tr.classList.toggle("open", !open);
});

// ---- project findings explorer -------------------------------------------
const F = DD.findings, FC = DD.findings_counts, FT = DD.findings_totals_thousands;
const CAP = DD.findings_capped_at;
const P = BudgetDisplay.amount;
const CLS = {
 amount_edited:{lab:"amount edited", hint:"matched pair, House re-priced"},
 hb_only:{lab:"HB only", hint:"unmatched to API — review expanded NEP source and House OCR"},
 nep_only:{lab:"NEP only", hint:"no HB partner — removal candidate"},
 review:{lab:"fuzzy review", hint:"match confidence 85–92, needs eyes"},
};
const fpills = document.getElementById("fpills");
fpills.innerHTML = Object.entries(CLS).map(([k,c])=>
 `<span class="pill on" data-k="${k}" title="${c.hint}">${c.lab} <b>${FC[k].toLocaleString()}</b>${FC[k]>CAP?` <span class="dim">(top ${CAP})</span>`:""}</span>`).join("")
 + `<span class="pill" id="fpall">all on/off</span>`;
let vis = new Set(Object.keys(CLS)), q = "";
function renderF(){
 const ql = q.toLowerCase();
 const rows = [];
 for(const k of Object.keys(CLS)){
  if(!vis.has(k)) continue;
  for(const r of F[k]){
   if(ql && !((r.name||"").toLowerCase().includes(ql)
     || (r.region||"").toLowerCase().includes(ql)
     || (r.program||"").toLowerCase().includes(ql))) continue;
   rows.push({k, r});
  }
 }
 rows.sort((a,b)=>{
  const av = a.r.delta!=null?Math.abs(a.r.delta):(a.r.hb||a.r.api||0);
  const bv = b.r.delta!=null?Math.abs(b.r.delta):(b.r.hb||b.r.api||0);
  return bv-av;});
 document.querySelector("#ft tbody").innerHTML = rows.slice(0,400).map(({k,r})=>{
  const d = r.delta, cls = k==="hb_only"?"ins":k==="nep_only"?"rem":
   d>0?"up":d<0?"dn":"eq";
  const tag = k==="hb_only"?`<span class="tag up">HB only</span>`
   :k==="nep_only"?`<span class="tag dn">NEP only</span>`
   :k==="review"?`<span class="tag eq">review ${r.score??"…"}</span>`
   :`<span class="tag ${d>0?'up':d<0?'dn':'eq'}">${d>0?"▲":d<0?"▼":"="}</span>`;
  return `<tr><td style="max-width:420px">${esc(r.name||"")}${r.code?` <code class="dim">${esc(r.code)}</code>`:""}</td>
  <td>${tag}</td>
  <td class="num" data-sort-value="${r.hb??''}">${r.hb!=null?P(r.hb):`<span class="dim">—</span>`}</td>
  <td class="num" data-sort-value="${r.api??''}">${r.api!=null?P(r.api):`<span class="dim">—</span>`}</td>
  <td class="num ${BudgetDisplay.deltaClass(r.delta)}" data-sort-value="${r.delta??''}">${r.delta!=null?dd(r.delta):cls==='ins'?"(no match)":cls==='rem'?"(deleted)":"—"}</td>
  <td class="dim">${esc(r.region||"")}</td><td class="dim" style="font-size:11.5px">${progSpan(r.program)}</td></tr>`;
 }).join("") || `<tr><td colspan="7" class="dim">no rows match</td></tr>`;
 document.getElementById("fcount").textContent =
  `${rows.length.toLocaleString()} of ${(FC.amount_edited+FC.hb_only+FC.nep_only+FC.review).toLocaleString()} findings`
  + (rows.length>400?" (showing 400 largest)":"")
  + ` · edited net ${dd(FT.amount_edited*1000)} · HB-only ${fs(FT.hb_only*1000)} · NEP-only ${fs(FT.nep_only*1000)}`;
}
fpills.addEventListener("click", e=>{
 const p = e.target.closest(".pill"); if(!p) return;
 if(p.id==="fpall"){ const all = vis.size===Object.keys(CLS).length;
  vis = all?new Set():new Set(Object.keys(CLS));
  fpills.querySelectorAll(".pill[data-k]").forEach(x=>x.classList.toggle("on",!all));
 } else { const k = p.dataset.k;
  vis.has(k)?vis.delete(k):vis.add(k); p.classList.toggle("on");
 }
 renderF();
});
document.getElementById("fq").addEventListener("input", e=>{q=e.target.value; renderF();});
renderF();

const S = D.s2o_gas;
document.querySelector("#gt tbody").innerHTML = [
 ["NEP official grand (8 programs)", G.nep_official_php],
 ["NEP API project lines", G.nep_api_php],
 ["HB corrected line items", G.hb_leaves_total_php, `${G.hb_leaf_capture_vs_operations?(G.hb_leaf_capture_vs_operations*100).toFixed(1)+"% of printed OPERATIONS rollup":""}`],
 ["…of which classified to programs", G.hb_leaves_classified_php],
 ["…of which unclassified (OCR-damage)", G.hb_unclassified_php],
 ["HB grand upper (items + MOOE)", G.hb_grand_upper_php],
 ["NEP official S2O+GAS", S.nep_official_php],
 ["HB printed MOOE = GAS + S2O (control check)", S.hb_printed_mooe_php,
  `=${f(S.hb_printed_gas_php)} + ${f(S.hb_printed_s2o_php)} — ${G.hb_mooe_identity_ok?"exact match":"MISMATCH"}`],
 ["HB printed S2O+GAS vs NEP S2O+GAS delta", S.hb_printed_php - S.nep_official_php],
].map(([k,v,d])=>`<tr><td>${k}${d?` <span class="dim">${d}</span>`:""}</td><td class="num ${k.toLowerCase().includes('delta')?BudgetDisplay.deltaClass(v):''}" data-sort-value="${v}">${f(v)}</td></tr>`).join("");

document.querySelector("#sec tbody").innerHTML = Object.entries(D.printed_sections)
 .map(([k,v])=>`<tr><td>${esc(k)}</td><td class="num ${k.toLowerCase().includes('delta')?BudgetDisplay.deltaClass(v):''}" data-sort-value="${v}">${f(v)}</td></tr>`).join("");

document.getElementById("foot").innerHTML =
 `<b>Sources</b> — HB: <code>${esc(D.meta.hb_source)}</code> · NEP official: <a href="https://github.com/ajamontesa/ph-budget-analysis">ajamontesa/ph-budget-analysis</a> · NEP API: <code>${esc(D.meta.nep_api_source)}</code><br>`
 + D.meta.caveats.map(c=>"· "+esc(c)).join("<br>");
</script></body></html>
"""

if __name__ == "__main__":
    main()
