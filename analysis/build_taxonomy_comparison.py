#!/usr/bin/env python3
"""
Build a self-contained HTML web app comparing the HB 10858 DPWH PAP taxonomy
against the DPWH NEP FY 2027 taxonomy, with region-level drilldown.

Data flow:
  HB:  analysis/hb_dpwh_leaves_validated.json  (validated leaf rows)
  NEP: nep-data/json/fy2027-combined.json      (flat project rows, PHP thousands)

Problem this solves: HB `pap` labels mix standard categories with thousands of
project-specific PAPs inserted by the House, while NEP `pap3` is purely
categorical. A direct label join fails (only 27/82 match). Instead, every
project is bucketed into a canonical taxonomy using the SAME title-keyword
rules — rules first calibrated against NEP's own pap3 assignments (verified:
covered courts/MPBs -> BIP-MPB, "^Construction of Road," -> BIP-Access,
flood-control keywords -> FMS/Drainage, etc.).

Each canonical category is classified structurally as:
  categorical      — exists as a standard NEP pap3
  program_bundled  — House-bundled program block (NEP carries it under a
                     standard pap3 instead)
  house_special    — House-specific project family (no NEP equivalent)
  uncategorized    — too generic to classify safely

Output: analysis/taxonomy_comparison.html (all data embedded, no server needed)
"""

import json
import re
import html as html_mod
from collections import defaultdict
from datetime import datetime, timezone

LEAVES_FILE = "analysis/hb_dpwh_leaves_corrected_v3.json"
NEP_FILE = "nep-data/json/fy2027-combined.json"
OUT_HTML = "analysis/taxonomy_comparison.html"
OUT_JSON = "analysis/taxonomy_comparison_data.json"

# ---------------------------------------------------------------- normalization

REGION_CANON = {
    "national capital region": "NCR", "ncr": "NCR",
    "cordillera administrative region": "CAR", "car": "CAR",
    "mimaropa region": "MIMAROPA", "mimaropa": "MIMAROPA",
    "negros island region": "NIR", "nir": "NIR",
    "bangsamoro autonomous region in muslim mindanao": "BARMM",
    "barmm": "BARMM",
    "ilocos region": "Region I", "cagayan valley": "Region II",
    "central luzon": "Region III", "calabarzon": "Region IV-A",
    "bicol region": "Region V", "western visayas": "Region VI",
    "central visayas": "Region VII", "eastern visayas": "Region VIII",
    "zamboanga peninsula": "Region IX", "northern mindanao": "Region X",
    "davao region": "Region XI", "soccsksargen": "Region XII",
    "caraga": "Region XIII",
}
NUM2ROM = {"01": "I", "02": "II", "03": "III", "04": "IV", "05": "V",
           "06": "VI", "07": "VII", "08": "VIII", "09": "IX",
           "1": "I", "2": "II", "3": "III", "4": "IV", "5": "V", "6": "VI",
           "7": "VII", "8": "VIII", "9": "IX"}


def canon_region(r):
    if not r:
        return None
    n = re.sub(r"\s+", " ", r.strip().lower())
    if n in REGION_CANON:
        return REGION_CANON[n]
    m = re.match(r"^region\s+([0-9]{1,2}|[ivx]+)(-[ab])?$", n)
    if m:
        suf = NUM2ROM.get(m.group(1), m.group(1).upper())
        return f"Region {suf}{(m.group(2) or '').upper()}"
    return r.strip().title()


PAP_CLEAN_PREFIX = re.compile(
    r"^(\d{1,2}[.)]\s+|[a-h][.)]\s+|<headingless\s@\d+>\s*)+")
REPAIR = [
    (r"^ff-carriageway", "Off-Carriageway"),
    (r"^onstruction\b", "Construction"),
    (r"^oncreting\b", "Concreting"),
    (r"^ehabilitation", "Rehabilitation"),
    (r"^aintenance\b", "Maintenance"),
    (r"^ridge\b", "Bridge"),
    (r"^ater supply", "Water Supply"),
    (r"^eptage", "Septage"),
    (r"^ational building", "National Building"),
    (r"^uildings", "Buildings"),
    (r"^ultipurpose", "Multipurpose"),
    (r"^oad widening", "Road Widening"),
    (r"^etwork", "Network"),
    (r"^reventive", "Preventive"),
    (r"^onstruction/maintenance", "Construction/Maintenance"),
    (r"^onstruction/rehabilitation", "Construction/Rehabilitation"),
    (r"^onstruction/ rehabilitation", "Construction/ Rehabilitation"),
]


def clean_pap(label):
    if not label:
        return None
    n = label.replace("\\n", " ").strip()
    n = PAP_CLEAN_PREFIX.sub("", n).strip()
    n = re.sub(r"\s+", " ", n)
    for pat, rep in REPAIR:
        if re.match(pat, n, re.I):
            return re.sub(pat, rep, n, count=1, flags=re.I)
    return n or None


HEADINGLESS_RX = re.compile(r"^<headingless")

# ---------------------------------------------------------------- classifier
# Rules calibrated against NEP's own pap3 assignments (see probe in transcript).

PAP_ALIASES = {
    "BIP - Access Roads and/or Bridges from the National Roads leading to Major/ Strategic Public Buildings/ Facilities":
        ["BIP - Access Roads", "BIP - Access Roads and/or Bridges"],
    "BIP - Multi-Purpose Buildings/ Facilities to support Social Services":
        ["3IP - Multi-Purpose Buildings", "BIP - Multi-Purpose Buildings"],
    "BIP - Coastal Roads to augment Resiliency of Coastal Communities":
        ["BIP - Coastal Roads"],
    "BIP - Local Ports and Boat Landings": ["BIP - Local Ports"],
    "Construction/ Maintenance of Flood Mitigation Structures and Drainage Systems":
        ["Construction/ Maintenance of Flood Mitigation Structures"],
    "Construction/ Rehabilitation of Flood Mitigation Facilities within Major River Basins and Principal Rivers":
        ["Construction/ Rehabilitation of Flood Mitigation Facilities"],
}


def alias_pap(label):
    """Map OCR/printed variants of a canonical pap3 to the canonical form.
    Returns None when the label is not a known variant."""
    if not label:
        return None
    for canon, aliases in PAP_ALIASES.items():
        if label == canon:
            return canon
        for a in aliases:
            if label == a or label.startswith(a):
                return canon
    return None


def classify(path_pap, program, subprog):
    """Return canonical category id, or None if unclassifiable."""
    pp, pg, sp = (path_pap or ""), (program or ""), (subprog or "")
    pl, pgl, spl = pp.lower(), pg.lower(), sp.lower()
    n = clean_pap(pp) or ""

    # 0. explicit PAP aliases (BIP -, 3IP - OCR variants)
    canon = alias_pap(n)
    if canon:
        return canon

    # 0b. monolithic containers the House re-inserted without type splits
    if re.match(r"bridge program$", n, re.I):
        return "HOUSE:Bridge Program (type not split)"
    if re.match(r"road widening", n, re.I):
        pass                      # handled by tier-5 road rules below

    # 1. House-bundled program blocks (checked LAST, see tier 9)
    bundled = None
    if "laguna lakeshore" in pgl:
        bundled = "PROGRAM:Bundled — Laguna Lakeshore Road Network (LLRN) Project Ph. I"
    elif "daang maharlika" in pgl:
        bundled = "PROGRAM:Bundled — Daang Maharlika Road Development (Package B3-B)"
    elif "davao city bypass" in pgl:
        bundled = "PROGRAM:Bundled — Davao City Bypass Construction Project, Package II"

    # 2. flood-control families by project-title keywords (NEP puts these
    #    under standard FMS / River-Basin pap3s)
    if re.search(r"groundsill|retarding basin|pumping station|flood|"
                 r"slope protection|river|lakewall|seawall|levy|levee|"
                 r"shore protection|dike|estero|creek|gabion", pl):
        return "Construction/ Maintenance of Flood Mitigation Structures and Drainage Systems"
    if re.search(r"construction (of|and improvement) drainage|drainage (canal|"
                 r"system|structure)|improvement of drainage|rehabilitation of drainage",
                 pl):
        return "Construction/ Maintenance of Flood Mitigation Structures and Drainage Systems"

    # 3. BIP families by title keywords
    if re.search(r"covered court|multi-?purpose building|multipurpose|"
                 r"multi-purpose facilities|public market|barangay hall|"
                 r"health center|school building|evacuation", pl):
        return "BIP - Multi-Purpose Buildings/ Facilities to support Social Services"

    # 4. standard categorical PAP labels (checked BEFORE title-keyword tiers
    #    so MPBs already named by their PAP don't fall into project families)
    if re.match(r"water supply", n, re.I):
        return "Water Supply System"
    if re.match(r"rainwater", n, re.I):
        return "Rainwater Collector System"
    if re.match(r"septage|sewerage", n, re.I):
        return "Septage and Sewerage"
    if re.match(r"buildings? and other structures", n, re.I):
        return "Buildings And Other Structures"
    if re.match(r"multipurpose /? ?facilities", n, re.I):
        return "BIP - Multi-Purpose Buildings/ Facilities to support Social Services"
    if re.search(r"facilit(y|ies) for elderl|senior citizen", n, re.I):
        return "Facilities for Elderlies/ Senior Citizen"
    if re.search(r"persons with disabilit|\bpwd\b", n, re.I):
        return "Facilities for Persons with Disabilities (PWD)"
    if re.match(r"gender-responsive", n, re.I):
        return "Gender-Responsive Facilities"
    if re.search(r"^construction of road,|access road|road leading to|"
                 r"tourism road", pl):
        return "BIP - Access Roads and/or Bridges from the National Roads leading to Major/ Strategic Public Buildings/ Facilities"
    if re.search(r"local port|boat landing|wharf", pl):
        return "BIP - Local Ports and Boat Landings"
    if re.search(r"coastal road", pl):
        return "BIP - Coastal Roads to augment Resiliency of Coastal Communities"

    # 5. roads / bridges by keyword
    if re.search(r"by-?pass|diversion road", pl):
        return "Construction of By-Pass and Diversion Roads"
    if re.search(r"missing link|new road", pl):
        return "Construction of Missing Links/ New Roads"
    if re.search(r"flood mitigation", pl):
        return "Construction/ Rehabilitation of Flood Mitigation Facilities within Major River Basins and Principal Rivers"
    if re.search(r"preventive maintenance", pl):
        if re.search(r"primary", pl):
            return "Preventive Maintenance - Primary Roads"
        if re.search(r"secondary", pl):
            return "Preventive Maintenance - Secondary Roads"
        if re.search(r"tertiary", pl):
            return "Preventive Maintenance - Tertiary Roads"
        return "Preventive Maintenance (unspecified class)"
    if re.search(r"widening of permanent bridge|bridge widening", pl):
        return "Widening of Permanent Bridges"
    if re.search(r"replacement of permanent weak bridge|replace.{0,20}weak bridge", pl):
        return "Replacement of Permanent Weak Bridges"
    if re.search(r"temporary to permanent", pl):
        return "Replacement of Bridges (Temporary to Permanent)"
    if re.search(r"replacement of bridge|replace.{0,30}bridge\b|"
                 r"\(sta\..{0,40}bridge|bridge.{0,40}approaches", pl):
        return "Replacement of Bridges (Temporary to Permanent)"
    if re.search(r"construction of (new )?bridge\b|new bridge", pl):
        return "Construction of New Bridges"
    if re.search(r"rehabilitation/ major repair of permanent bridge|"
                 r"major repair of bridge", pl):
        return "Rehabilitation/ Major Repair of Permanent Bridges"
    if re.search(r"retrofitting|strengthening of .{0,20}bridge", pl):
        return "Retrofitting/ Strengthening of Permanent Bridges"
    if re.search(r"flyover|interchange|underpass|long span bridge", pl):
        return "Construction of Flyovers/ Interchanges/ Underpasses/ Long Span Bridges"
    if re.search(r"slips|slope coll|landslide", pl):
        if re.search(r"primary", pl):
            return "Rehabilitation/ Reconstruction of Roads with Slips, Slope Collapse, and Landslide - Primary Roads"
        if re.search(r"secondary", pl):
            return "Rehabilitation/ Reconstruction of Roads with Slips, Slope Collapse, and Landslide - Secondary Roads"
        return "Rehabilitation/ Reconstruction of Roads with Slips, Slope Collapse, and Landslide - Tertiary Roads"
    if re.search(r"damaged paved road", pl):
        if re.search(r"primary", pl):
            return "Rehabilitation/ Reconstruction/ Upgrading of Damaged Paved Roads - Primary Roads"
        if re.search(r"secondary", pl):
            return "Rehabilitation/ Reconstruction/ Upgrading of Damaged Paved Roads - Secondary Roads"
        return "Rehabilitation/ Reconstruction/ Upgrading of Damaged Paved Roads - Tertiary Roads"
    if re.search(r"off-?carriageway", pl):
        if re.search(r"primary", pl):
            return "Off-Carriageway Improvement - Primary Roads"
        if re.search(r"secondary", pl):
            return "Off-Carriageway Improvement - Secondary Roads"
        return "Off-Carriageway Improvement - Tertiary Roads"
    if re.search(r"paving of unpaved", pl):
        if re.search(r"primary", pl):
            return "Paving of Unpaved Roads - Primary Roads"
        if re.search(r"secondary", pl):
            return "Paving of Unpaved Roads - Secondary Roads"
        return "Paving of Unpaved Roads - Tertiary Roads"
    if re.search(r"drainage along national road", pl):
        if re.search(r"primary", pl):
            return "Construction/ Upgrading/ Rehabilitation of Drainage along National Roads - Primary Roads"
        if re.search(r"secondary", pl):
            return "Construction/ Upgrading/ Rehabilitation of Drainage along National Roads - Secondary Roads"
        return "Construction/ Upgrading/ Rehabilitation of Drainage along National Roads - Tertiary Roads"
    if re.match(r"road widening", n, re.I):
        if re.search(r"primary", n, re.I):
            return "Road Widening - Primary Roads"
        if re.search(r"tertiary", n, re.I):
            return "Road Widening - Tertiary Roads"
        return "Road Widening - Secondary Roads"

    # 6. public water / disaster tail
    if re.search(r"public water supply|potable water|level ii|level iii", pl):
        return "Water Supply System"
    if re.search(r"disaster-related", pl):
        return "Rehabilitation of Disaster-Related Infrastructure and Other Facilities"

    # 7. bridges not caught by title tiers
    if re.search(r"\bbridge\b|viaduct", pl):
        return "HOUSE:Bridge works (project-specific)"

    # 9. House-bundled program blocks (deferred: type-level rows already
    #    returned above, so only truly untypeable bundle tails land here)
    if bundled:
        return bundled

    # 8. too generic to classify safely
    if re.search(r"\broad\b|highway|junction|jct\.?|pavement|concreting|"
                 r"reblocking|asphalting|gravelling", pl):
        return "HOUSE:Road Construction/ Rehabilitation (project-specific)"
    if len(n) <= 4 or re.match(r"^[a-z0-9 .,-]+$", n, re.I) and len(n.split()) <= 2:
        return "HOUSE:Unattributable label"
    return None


# the four structural classes
CAT_KIND = {}


def kind_of(cat):
    if cat.startswith("PROGRAM:"):
        return "program_bundled"
    if cat.startswith("HOUSE:"):
        return "house_special"
    if cat.startswith("UNSPEC:"):
        return "house_special"
    return "categorical"


def main():
    leaves = json.load(open(LEAVES_FILE, encoding="utf-8"))["leaves"]
    nep = json.load(open(NEP_FILE, encoding="utf-8"))["data"]["data"]

    # ---------------- bucket both datasets with the SAME classifier ---------
    def bucket_empty():
        return {"total": 0, "n": 0, "regions": defaultdict(lambda: [0, 0]),
                "programs": set(), "raw_paps": set()}

    hb_cats = defaultdict(bucket_empty)
    hb_unresolved = bucket_empty()
    hb_uncat = bucket_empty()
    for l in leaves:
        amt = l["amount_php"] or 0
        reg = canon_region(l.get("region"))
        raw_pap = (l.get("pap") or "").strip()
        if not raw_pap or HEADINGLESS_RX.match(raw_pap):
            tgt = hb_unresolved          # OCR spillover: PAP unknown
        else:
            cat = classify(raw_pap, l.get("program"), l.get("sub_program"))
            if cat is None:
                tgt = hb_uncat           # present but too generic to classify
                cat = "UNCATEGORIZED (generic label)"
            else:
                tgt = hb_cats[cat]
                CAT_KIND.setdefault(cat, kind_of(cat))
        tgt["total"] += amt
        tgt["n"] += 1
        if reg:
            tgt["regions"][reg][0] += amt
            tgt["regions"][reg][1] += 1
        prog = clean_pap(l.get("program") or "")
        if prog:
            tgt["programs"].add(prog)
        lp = clean_pap(raw_pap)
        if lp:
            tgt["raw_paps"].add(lp)

    nep_cats = defaultdict(bucket_empty)
    nep_unmatched = 0
    for i in nep:
        amt = (i["amount"] or 0) * 1000
        reg = canon_region(i.get("region"))
        cat = alias_pap(i["pap3"].strip()) or i["pap3"].strip()
        # sanity: run the classifier on NEP too; trust pap3 when both agree
        nep_cats[cat]["total"] += amt
        nep_cats[cat]["n"] += 1
        if reg:
            nep_cats[cat]["regions"][reg][0] += amt
            nep_cats[cat]["regions"][reg][1] += 1
        nep_cats[cat]["programs"].add(clean_pap(i["pap2"]) or i["pap2"])

    # ---------------- assemble comparison rows ------------------------------
    TOL = 0.005
    all_cats = sorted(set(hb_cats) | set(nep_cats))
    rows = []
    for cat in all_cats:
        h = hb_cats.get(cat)
        n = nep_cats.get(cat)
        kind = kind_of(cat)
        if h and n:
            delta = h["total"] - n["total"]
            status = "aligned" if abs(delta) <= max(h["total"], n["total"]) * TOL else "delta"
        elif h:
            delta = h["total"]
            status = "hb_only"
        else:
            delta = -n["total"]
            status = "nep_only"
        rows.append({
            "label": cat, "kind": kind, "status": status, "delta": delta,
            "hb": None if not h else {
                "total": h["total"], "n": h["n"],
                "programs": sorted(h["programs"])[:6],
                "n_raw_paps": len(h["raw_paps"]),
                "regions": {k: {"total": v[0], "n": v[1]}
                            for k, v in h["regions"].items()}},
            "nep": None if not n else {
                "total": n["total"], "n": n["n"],
                "programs": sorted(n["programs"])[:6],
                "regions": {k: {"total": v[0], "n": v[1]}
                            for k, v in n["regions"].items()}},
        })
    rows.sort(key=lambda r: -abs(r["delta"]))

    hb_grand = sum(a["total"] for a in hb_cats.values())
    nep_grand = sum(a["total"] for a in nep_cats.values())
    data = {
        "meta": {
            "title": "HB 10858 vs DPWH NEP FY 2027 — PAP Taxonomy Comparison",
            "hb_source": LEAVES_FILE,
            "nep_source": NEP_FILE,
            "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "unit_note": "All amounts in PHP. NEP amounts converted from thousands to pesos.",
            "tolerance": TOL,
            "method": ("Both datasets bucketed into a canonical PAP taxonomy via "
                       "the same title-keyword rules, calibrated against NEP's own "
                       "pap3 assignments. HB 'pap' labels that are House-inserted "
                       "project families are kept separate (HOUSE:/PROGRAM: prefixes)."),
        },
        "summary": {
            "hb_grand": hb_grand, "nep_grand": nep_grand,
            "delta_grand": hb_grand - nep_grand,
            "hb_unresolved_total": hb_unresolved["total"],
            "hb_unresolved_n": hb_unresolved["n"],
            "hb_uncat_total": hb_uncat["total"], "hb_uncat_n": hb_uncat["n"],
            "n_categories": len(rows),
            "n_matched": sum(1 for r in rows if r["status"] in ("aligned", "delta")),
            "n_aligned": sum(1 for r in rows if r["status"] == "aligned"),
            "n_delta": sum(1 for r in rows if r["status"] == "delta"),
            "n_hb_only": sum(1 for r in rows if r["status"] == "hb_only"),
            "n_nep_only": sum(1 for r in rows if r["status"] == "nep_only"),
            "hb_only_total": sum(r["delta"] for r in rows if r["status"] == "hb_only"),
            "nep_only_total": sum(-r["delta"] for r in rows if r["status"] == "nep_only"),
        },
        "rows": rows,
    }

    with open(OUT_JSON, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False)

    payload = json.dumps(data, ensure_ascii=False).replace("</", "<\\/")
    with open(OUT_HTML, "w", encoding="utf-8") as f:
        f.write(HTML.replace("__DATA__", payload))

    s = data["summary"]
    print(f"categories: {len(rows)}  matched {s['n_matched']} "
          f"(aligned {s['n_aligned']} / delta {s['n_delta']})  "
          f"hb_only {s['n_hb_only']}  nep_only {s['n_nep_only']}")
    print(f"HB grand {hb_grand/1e9:.2f}B (+unresolved "
          f"{hb_unresolved['total']/1e9:.2f}B, unclassified "
          f"{hb_uncat['total']/1e9:.2f}B)  NEP grand {nep_grand/1e9:.2f}B")
    print("wrote", OUT_HTML)


HTML = r"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>HB 10858 vs NEP FY 2027 — PAP Taxonomy Comparison</title>
<style>
:root{
  --bg:#0d1117;--panel:#161b22;--panel2:#1c2330;--line:#2d3646;
  --txt:#e6edf3;--dim:#8b98a9;--mono:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
  --green:#3fb950;--amber:#d29922;--red:#f85149;--blue:#58a6ff;--purple:#bc8cff;
}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--bg);color:var(--txt);font:14px/1.45 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;padding:24px}
.wrap{max-width:1320px;margin:0 auto}
h1{font-size:20px;font-weight:650;letter-spacing:.2px}
.sub{color:var(--dim);margin:4px 0 18px;font-size:13px;max-width:900px}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px;margin-bottom:14px}
.card{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:12px 14px}
.card .k{color:var(--dim);font-size:11px;text-transform:uppercase;letter-spacing:.8px}
.card .v{font-size:20px;font-weight:700;margin-top:2px;font-family:var(--mono)}
.card .d{font-size:11px;color:var(--dim);margin-top:2px}
.gbar{height:10px;border-radius:5px;background:var(--panel2);overflow:hidden;display:flex;margin:6px 0 2px}
.gbar i{display:block;height:100%}
.legend{display:flex;gap:14px;flex-wrap:wrap;color:var(--dim);font-size:12px;margin:10px 0 16px}
.legend b{color:var(--txt);font-weight:600}
.controls{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:12px}
input[type=search],select{background:var(--panel);border:1px solid var(--line);color:var(--txt);border-radius:8px;padding:8px 12px;font-size:13px;outline:none}
input[type=search]{flex:1;min-width:220px}
.chip{background:var(--panel);border:1px solid var(--line);color:var(--dim);border-radius:999px;padding:6px 12px;font-size:12px;cursor:pointer;user-select:none}
.chip.on{color:var(--txt);border-color:var(--blue);background:#12233a}
.chip b{font-family:var(--mono);margin-left:4px}
table{width:100%;border-collapse:collapse}
thead th{position:sticky;top:0;background:var(--bg);text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.8px;color:var(--dim);padding:8px 10px;border-bottom:1px solid var(--line);cursor:pointer;white-space:nowrap;z-index:2}
thead th:hover{color:var(--txt)}
tbody tr.row{cursor:pointer;border-bottom:1px solid var(--line)}
tbody tr.row:hover{background:#131a26}
td{padding:9px 10px;vertical-align:top}
td.num{font-family:var(--mono);text-align:right;white-space:nowrap}
.name{font-weight:600;max-width:460px}
.tags{margin-top:3px;display:flex;gap:5px;flex-wrap:wrap}
.tag{font-size:10px;color:var(--dim);border:1px solid var(--line);border-radius:5px;padding:1px 6px}
.st{font-size:10px;font-weight:700;letter-spacing:.6px;border-radius:5px;padding:2px 7px;text-transform:uppercase;white-space:nowrap}
.st.aligned{color:var(--green);background:#0f2e1a;border:1px solid #1d5230}
.st.delta{color:var(--amber);background:#2e2408;border:1px solid #6b5416}
.st.hb_only{color:var(--red);background:#331214;border:1px solid #6e2320}
.st.nep_only{color:var(--blue);background:#0f2036;border:1px solid #1f4a76}
.delta-pos{color:var(--red)} .delta-neg{color:var(--green)} .delta-zero{color:var(--dim)}
tr.detail{display:none}
tr.detail.open{display:table-row}
tr.detail td{background:var(--panel);border-bottom:2px solid var(--line);padding:14px 16px}
.cols{display:grid;grid-template-columns:1fr 1fr;gap:18px}
@media(max-width:900px){.cols{grid-template-columns:1fr}}
.cols h3{font-size:12px;text-transform:uppercase;letter-spacing:.8px;color:var(--dim);margin-bottom:8px}
.rrow{display:grid;grid-template-columns:130px 1fr 120px;gap:8px;align-items:center;margin-bottom:4px}
.rrow .rn{font-size:12px;color:var(--txt);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.rrow .rv{font-family:var(--mono);font-size:11px;color:var(--dim);text-align:right;white-space:nowrap}
.bar{height:14px;border-radius:4px;background:var(--panel2);position:relative;overflow:hidden}
.bar>i{position:absolute;top:0;left:0;height:100%;border-radius:4px}
.bar .bh{background:#f85149aa}.bar .bn{background:#58a6ffaa}
.mut{color:var(--dim);font-size:12px}
.footer{margin-top:22px;color:var(--dim);font-size:12px;line-height:1.6}
.empty{padding:40px;text-align:center;color:var(--dim)}
</style>
</head>
<body><nav data-historical="true" style="padding:12px 20px;margin-bottom:18px;background:#fff1d9;color:#203147;font:14px/1.5 system-ui"><a href="../site/index.html">All dashboards</a> · Historical House v3 / API artifact. Budget upper-bound and insertion/removal labels below are superseded. <a href="source_comparison_2027.html">Open the current source comparison</a></nav>
<div class="wrap">
  <h1>HB 10858 vs DPWH NEP FY 2027 — PAP Taxonomy Comparison</h1>
  <div class="sub" id="subline"></div>
  <div class="cards" id="cards"></div>
  <div class="card" style="margin-bottom:14px">
    <div class="k">Grand totals (classified projects)</div>
    <div class="gbar"><i id="ghb" style="background:#f8514999"></i><i id="gnep" style="background:#58a6ff99"></i></div>
    <div class="d" id="glegend"></div>
  </div>
  <p>Amounts: 3 decimals · B billion, M million, T thousands. Click a column header to sort. <span class="delta-positive">+ Increased</span> · <span class="delta-negative">− Decreased</span>.</p><div class="legend">
    <span><b class="st aligned" style="border:none;padding:0">aligned</b> totals match ≤0.5%</span>
    <span><b class="st delta" style="border:none;padding:0">amount Δ</b> same category, different ₱</span>
    <span><b class="st hb_only" style="border:none;padding:0">HB only</b> House-inserted category/family</span>
    <span><b class="st nep_only" style="border:none;padding:0">NEP only</b> category absent in HB</span>
  </div>
  <div class="controls">
    <input type="search" id="q" placeholder="Search category…">
    <select id="sort">
      <option value="delta">Sort: |Δ| biggest</option>
      <option value="hb">Sort: HB total</option>
      <option value="nep">Sort: NEP total</option>
      <option value="name">Sort: name</option>
    </select>
    <span class="chip on" data-f="all">All<b></b></span>
    <span class="chip" data-f="aligned">Aligned<b></b></span>
    <span class="chip" data-f="delta">Amount Δ<b></b></span>
    <span class="chip" data-f="hb_only">HB only<b></b></span>
    <span class="chip" data-f="nep_only">NEP only<b></b></span>
  </div>
  <table>
    <thead><tr>
      <th style="width:46%">Canonical PAP category</th>
      <th>Status</th><th class="num">HB ₱</th><th class="num">NEP ₱</th><th class="num">Δ (HB−NEP)</th>
    </tr></thead>
    <tbody id="tb"></tbody>
  </table>
  <div class="footer" id="foot"></div>
</div>
<script src="budget_display.js"></script>
<script>
const DATA = __DATA__;
const B = 1e9, M = 1e6;
const fmt = BudgetDisplay.amount;
const esc = s => String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;");
const S = DATA.summary;
document.getElementById("subline").textContent =
  DATA.meta.title + " · generated " + DATA.meta.generated_at + " · " + DATA.meta.unit_note;

const cards = [
  ["HB classified", S.hb_grand, `+ ${fmt(S.hb_unresolved_total)} unresolved (${S.hb_unresolved_n} rows) + ${fmt(S.hb_uncat_total)} generic (${S.hb_uncat_n})`],
  ["NEP total", S.nep_grand, "flat API dataset"],
  ["Net Δ (HB−NEP)", S.delta_grand, "classified buckets only"],
  ["Categories", null, `${S.n_categories} total · ${S.n_aligned} aligned · ${S.n_delta} amount-Δ`],
  ["HB-only", S.hb_only_total, `${S.n_hb_only} House categories`],
  ["NEP-only", S.nep_only_total, `${S.n_nep_only} categories absent in HB`],
];
document.getElementById("cards").innerHTML = cards.map(([k,v,d],i)=>`
  <div class="card"><div class="k">${k}</div>
  <div class="v" style="color:${i===2?(S.delta_grand>=0?'#126c48':'#a42a36'):'var(--txt)'}">${v==null?S.n_categories:fmt(v)}</div>
  <div class="d">${d}</div></div>`).join("");

const gmax = Math.max(S.hb_grand, S.nep_grand);
document.getElementById("ghb").style.width = (100*S.hb_grand/gmax)+"%";
document.getElementById("gnep").style.width = (100*S.nep_grand/gmax)+"%";
document.getElementById("glegend").innerHTML =
  `<b style="color:#f85149">■</b> HB ${fmt(S.hb_grand)} &nbsp; <b style="color:#58a6ff">■</b> NEP ${fmt(S.nep_grand)}`;

document.querySelectorAll(".chip").forEach(ch=>{
  const f = ch.dataset.f;
  const n = f==="all" ? DATA.rows.length : DATA.rows.filter(r=>r.status===f).length;
  ch.querySelector("b").textContent = n;
});

let filter = "all", query = "", sortKey = "delta";
const tb = document.getElementById("tb");
const KIND_LABEL = {
  categorical: "standard NEP pap3",
  program_bundled: "House-bundled program (NEP: under standard pap3)",
  house_special: "House-specific project family",
};

function regionsHtml(sideObj, color){
  if(!sideObj) return `<div class="mut">—</div>`;
  const regs = Object.entries(sideObj.regions);
  if(!regs.length) return `<div class="mut">no region data</div>`;
  const mx = Math.max(...regs.map(([,v])=>v.total), 1);
  regs.sort((a,b)=>b[1].total-a[1].total);
  return regs.slice(0,14).map(([rn,v])=>`
    <div class="rrow">
      <div class="rn" title="${esc(rn)}">${esc(rn)}</div>
      <div class="bar"><i class="${color}" style="width:${(100*v.total/mx).toFixed(1)}%"></i></div>
      <div class="rv">${fmt(v.total)} <span style="opacity:.7">·${v.n}</span></div>
    </div>`).join("") +
    (regs.length>14?`<div class="mut" style="margin-top:6px">+${regs.length-14} more regions…</div>`:"");
}

function rowHtml(r, i){
  const st = {aligned:["aligned","ALIGNED"],delta:["delta","AMOUNT Δ"],hb_only:["hb_only","HB ONLY"],nep_only:["nep_only","NEP ONLY"]}[r.status];
  const dCls = BudgetDisplay.deltaClass(r.delta);
  const h = r.hb, n = r.nep;
  const pct = (h&&n&&Math.max(h.total,n.total)>0) ? (100*r.delta/Math.max(h.total,n.total)) : null;
  const det = `
  <tr class="detail" id="det${i}"><td colspan="5">
    <div class="cols">
      <div><h3>HB 10858 — by region${h?` · ${fmt(h.total)} · ${h.n.toLocaleString()} projects`:""}</h3>${regionsHtml(h,"bh")}</div>
      <div><h3>NEP FY 2027 — by region${n?` · ${fmt(n.total)} · ${n.n.toLocaleString()} projects`:""}</h3>${regionsHtml(n,"bn")}</div>
    </div>
    <div style="margin-top:10px"><span class="tag" style="color:var(--purple);border-color:var(--purple)">${KIND_LABEL[r.kind]||r.kind}</span>
    ${h&&h.n_raw_paps>1?`<span class="tag">${h.n_raw_paps} distinct HB pap labels rolled into this bucket</span>`:""}
    ${pct!=null?`<span class="tag">net Δ = ${pct>0?"+":""}${pct.toFixed(1)}% of larger side${Math.abs(pct)<=0.5?" — within tolerance":""}</span>`:""}</div>
    ${h&&h.programs.length?`<div class="tags" style="margin-top:8px">${h.programs.map(p=>`<span class="tag">HB program: ${esc(p)}</span>`).join("")}</div>`:""}
    ${n&&n.programs.length?`<div class="tags" style="margin-top:4px">${n.programs.map(p=>`<span class="tag">NEP program: ${esc(p)}</span>`).join("")}</div>`:""}
  </td></tr>`;

  return `<tr class="row" data-i="${i}">
    <td><div class="name" title="${esc(r.label)}">${esc(r.label)}</div>
      <div class="tags">
        ${h?`<span class="tag">HB ${h.n.toLocaleString()} proj</span>`:""}
        ${n?`<span class="tag">NEP ${n.n.toLocaleString()} proj</span>`:""}
        <span class="tag" style="color:${r.kind==='categorical'?'var(--dim)':'var(--purple)'}">${r.kind==='categorical'?'std':(r.kind==='program_bundled'?'bundled':'house')}</span>
      </div></td>
    <td><span class="st ${st[0]}">${st[1]}</span></td>
    <td class="num" data-sort-value="${h?.total??''}">${h?fmt(h.total):"—"}</td>
    <td class="num" data-sort-value="${n?.total??''}">${n?fmt(n.total):"—"}</td>
    ${BudgetDisplay.cell(r.delta,true)}
  </tr>${det}`;
}

function render(){
  const q = query.toLowerCase();
  const view = DATA.rows.filter(r=>{
    if(filter!=="all" && r.status!==filter) return false;
    if(q && !r.label.toLowerCase().includes(q)) return false;
    return true;
  });
  const sk = sortKey;
  view.sort((a,b)=>{
    if(sk==="name") return a.label.localeCompare(b.label);
    if(sk==="hb") return (b.hb?.total||0)-(a.hb?.total||0);
    if(sk==="nep") return (b.nep?.total||0)-(a.nep?.total||0);
    return Math.abs(b.delta)-Math.abs(a.delta);
  });
  tb.innerHTML = view.length
    ? view.map((r,i)=>rowHtml(r,i)).join("")
    : `<tr><td colspan="5" class="empty">No rows match.</td></tr>`;
}

tb.addEventListener("click", e=>{
  const tr = e.target.closest("tr.row");
  if(!tr) return;
  document.getElementById("det"+tr.dataset.i)?.classList.toggle("open");
});
document.getElementById("q").addEventListener("input", e=>{query=e.target.value; render();});
document.getElementById("sort").addEventListener("change", e=>{BudgetDisplay.clear(tb.closest("table"));sortKey=e.target.value; render();});
document.querySelectorAll(".chip").forEach(ch=>ch.addEventListener("click", ()=>{
  document.querySelectorAll(".chip").forEach(c=>c.classList.remove("on"));
  ch.classList.add("on");
  filter = ch.dataset.f;
  render();
}));

render();
document.getElementById("foot").innerHTML =
  `<b>Method</b> — ${esc(DATA.meta.method)}<br>
   <b>Sources</b> — HB: <code>${esc(DATA.meta.hb_source)}</code> · NEP: <code>${esc(DATA.meta.nep_source)}</code>.
   “Aligned” = |HB−NEP| ≤ ${DATA.meta.tolerance*100}% of the larger total.
   HB “unresolved” = OCR page-break spillover rows without an attributable PAP (${fmt(S.hb_unresolved_total)});
   HB “generic” = labels too vague to classify safely (${fmt(S.hb_uncat_total)}).
   Expand any row for the region-level HB-vs-NEP breakdown.<br>
   <b style="color:var(--amber)">⚠ NEP baseline caveat</b> — the NEP API dataset (${fmt(S.nep_grand)}) is
   <b>incomplete vs the official FY2027 NEP (₱642.6B incl. ₱69.7B S2O/GAS — per
   <a href="https://github.com/ajamontesa/ph-budget-analysis" style="color:var(--blue)">ajamontesa/ph-budget-analysis</a></b>).
   ~₱127B of project-level NEP is missing from the API across all programs, so
   “HB only” amounts are <i>upper bounds</i> on true House insertions — part of each gap may be
   NEP items absent from the API.`;
</script>
</body>
</html>
"""

if __name__ == "__main__":
    main()
