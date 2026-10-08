#!/usr/bin/env python3
"""
Parse DPWH project-level line items from HB 10858 (House budget proposal, FY 2027)
Volume I-C markdown (PaddleOCR output).

VOL IC = "Details of DPWH's Programs/Projects" — the project-level appropriation
detail that corresponds to the DPWH NEP proposal list.

UNITS: VOL IC project tables are printed in PESOS. The NEP API `amount` field is
in THOUSANDS of pesos (e.g. 33,000 = P33M). Both are stored here for parity.

Classification:
  - header rows (program / PAP / region / office / aggregate captions) are
    kept with is_header=True (they carry printed subtotals);
  - project-like rows = leaf rows that are neither headers nor aggregate
    captions. Heuristics:
      * region / office / program detectors;
      * explicit aggregate-caption regexes;
      * location-marker heuristic (projects normally name a road, barangay,
        city, street, bridge id, chainage, etc. — pure program captions do not).
"""

import sys
from pathlib import Path as _Path
sys.path[:0] = [str(_Path(__file__).resolve().parents[1]), str(_Path(__file__).resolve().parents[1] / 'builders')]
from paths import ANALYSIS, REPO, DATA, VIEWERS, DOCS, ARCHIVE, EVIDENCE

import re
import json
import html
import os

BASE = str(ANALYSIS)
MD_FILE = os.path.join(BASE, "..", "HB_BUDGET", "3 - HB 10858 VOL IC.pdf_by_PaddleOCR-VL-1.6.md")
OUT = os.path.join(str(ARCHIVE), "hb_dpwh_items.json")  # historical v0 output

REGION_TOKENS = [
    "national capital region", "cordillera administrative region",
    "region i", "region ii", "region iii", "region iv-a", "region iv-b",
    "region v", "region vi", "region vii", "region viii",
    "region ix", "region x", "region xi", "region xii", "region xiii",
    "mimaropa region", "negros island region", "barmm",
]

PROGRAM_MARKERS = [
    "asset preservation program",
    "network development program",
    "bridge program",
    "flood management program",
    "convergence and special support program",
    "basic infrastructure program",
    "local infrastructure program",
]

MAX_PROGRAM_LEN = 400

HEADER_RX = [
    re.compile(r"^[a-z0-9]+\s*-\s*(bip|3ip|lip)\b", re.I),
    re.compile(r"foreign[\s-]assisted", re.I),
    re.compile(r"^organizational outcome|^ganizational outcome", re.I),
    re.compile(r"^(national building program|water supply|septage|sewerage)", re.I),
    re.compile(r"^(maintenance and other operating|general administrative|support to operations)\b", re.I),
    re.compile(r"^general management and supervision", re.I),
    re.compile(r"infrastructure planning, design, construction", re.I),
    re.compile(r"^pre-feasibility study|^pre-feasibility studies", re.I),
    re.compile(r"^(payments? of|payment of) (right-of-way|contractual)", re.I),
    re.compile(r"^(various completed|various ongoing|right-of-way claims)", re.I),
    re.compile(r"ppp projects under trb", re.I),
    re.compile(r"^preventive maintenance is a sub-program", re.I),
    re.compile(r"^the program aims", re.I),
    re.compile(r"^equipment procurement program", re.I),
    re.compile(r"^regionwide / nationwide|^nationwide/ central office", re.I),
    re.compile(r"^(highways, flood control)", re.I),
    re.compile(r"^detailed engineering|^preliminary engineering", re.I),
    re.compile(r"^(routine|preventive) maintenance( -| of|$)", re.I),
    re.compile(r"^repair and maintenance of road safety", re.I),
    re.compile(r"^flood control projects for pre-investment", re.I),
    re.compile(r"^maintenance, repair and rehabilitation of infrastructure", re.I),
    re.compile(r"^multipurpose / facilities|^facilities for persons with disabilities", re.I),
    re.compile(r"^buildings and other structures", re.I),
    re.compile(r"^5\. maintenance, repair and rehabilitation", re.I),
    re.compile(r"construction/maintenance of flood mitigation", re.I),
    re.compile(r"^construction of by-pass(es)?(/| and) diversion roads$", re.I),
    re.compile(r"rehabilitation/ reconstruction/ upgrading of damaged paved roads$", re.I),
    re.compile(r"^construction of missing links/ new roads$", re.I),
    re.compile(r"of flood mitigation facilities within major river", re.I),
    re.compile(r"^off-carriageway improvement$", re.I),
    re.compile(r"^widening of permanent bridges$", re.I),
    re.compile(r"^management of construction and maintenance equipment", re.I),
    re.compile(r"(weighbridge|automated traffic data collection|axle load survey) program", re.I),
    re.compile(r"(operation of weighbridge|gender and development|environmental management conservation)", re.I),
    re.compile(r"(consultancy services|consulting services|preparatory survey|conceptual design|value engineering|anti-truck overloading|geotechnical investigation|standard plans|standardized dpwh libraries|indigenous people and development plan|disability affairs|right-of-way action plan|action plan \(rap\))", re.I),
    re.compile(r"(master plan|feasibility stud|mp/fs)", re.I),
    re.compile(r"(machinery and equipment outlay|ict equipment|laboratory/ non-destructive|engineering survey equipment|service vehicles)", re.I),
    re.compile(r"(hydrological data collection|newly converted national roads)", re.I),
    re.compile(r"(interlink|expressway \(mqlex\)|viaduct)", re.I),
    re.compile(r"^\d{1,2}\. bangsamoro autonomous region", re.I),
]

# A real project line almost always names a place or a physical asset:
LOCATION_RX = re.compile(
    r",|\b(brgy|barangay|city|sitio|purok|municipality|province|avenue|ave\b|blvd|boulevard|"
    r"highway|h-way|street|st\b|road\b|rd\b|drive|k\d{1,4}|sta\.|chainage|spine|airport|seaport|wharf|"
    r"bridge\b|br\.|school|hospital|market|building|floodgate|pumping|dike|dam\b|waterworks|revetment|"
    r"river|creek|canal)\b",
    re.I,
)


def strip_tags(s: str) -> str:
    s = re.sub(r"<[^>]+>", " ", s)
    return re.sub(r"\s+", " ", html.unescape(s)).strip()


def is_amount(t: str) -> bool:
    t2 = t.replace(",", "").replace("P", "").strip()
    return bool(re.fullmatch(r"[\d.]+", t2)) and any(c.isdigit() for c in t)


def to_number(amount_str: str):
    try:
        return int(round(float(amount_str.replace(",", "").replace("P", "").strip())))
    except ValueError:
        return None


def norm_region(t: str):
    low = t.lower().strip()
    if re.match(r"^\d{1,2}\.\s+", low):
        low = re.sub(r"^\d{1,2}\.\s+", "", low)
    if low in REGION_TOKENS:
        return t.strip()
    return None


def norm_office(t: str):
    low = t.lower().strip()
    if ("district engineering office" in low or "regional office" in low
            or low == "central office"):
        return t.strip()
    return None


def looks_like_program(t: str) -> bool:
    low = t.lower()
    if len(t) > MAX_PROGRAM_LEN:
        return False
    return any(m in low for m in PROGRAM_MARKERS)


def is_header(name: str) -> bool:
    if looks_like_program(name):
        return True
    if norm_region(name) or norm_office(name):
        return True
    return any(rx.search(name) for rx in HEADER_RX)


def is_project_like(name: str) -> bool:
    low = name.strip().lower()
    if is_header(name):
        return False
    if re.match(r"^(total|subtotal|new appropriations|sum|grand total)", low):
        return False
    if not LOCATION_RX.search(name):
        return False
    return len(name) >= 25


def main():
    with open(MD_FILE, encoding="utf-8") as f:
        content = f.read()

    cells = [(m.start(), strip_tags(m.group(1)))
             for m in re.finditer(r"<td[^>]*>(.*?)</td>", content, re.S)]

    events = []
    i = 0
    n = len(cells)
    while i < n:
        pos, t = cells[i]

        # shape A: empty cell + amount  -> subtotal for enclosing header (skip)
        if t == "" and i + 1 < n and is_amount(cells[i + 1][1]):
            i += 2
            continue

        if i + 1 < n:
            nxt = cells[i + 1][1]
            if t and is_amount(nxt) and not is_amount(t):
                # shape B: label + amount + amount (label row + trailing subtotal)
                if i + 2 < n and is_amount(cells[i + 2][1]):
                    events.append(("row", pos, t, to_number(nxt)))
                    i += 3
                    continue
                events.append(("row", pos, t, to_number(nxt)))
                i += 2
                continue

        if t and t not in ("AMOUNT (Php)", "PROGRAMS / ACTIVITIES / PROJECTS", "AMOUNT") and not is_amount(t):
            events.append(("label", pos, t))
        i += 1

    items = []
    ctx_program = ctx_pap = ctx_region = ctx_office = ctx_subcat = None

    for ev in events:
        kind = ev[0]
        if kind == "label":
            t = ev[2]
            if looks_like_program(t):
                ctx_program = t
                ctx_pap = ctx_region = ctx_office = ctx_subcat = None
            elif norm_region(t):
                ctx_region = norm_region(t)
                ctx_office = ctx_subcat = None
            elif norm_office(t):
                ctx_office = norm_office(t)
                ctx_subcat = None
            else:
                if len(t) > MAX_PROGRAM_LEN:
                    continue
                if ctx_program is None:
                    ctx_pap = t
                else:
                    ctx_subcat = t
            continue

        _, pos, name, amount = ev
        if is_header(name):
            if looks_like_program(name):
                ctx_program = name
                ctx_pap = ctx_region = ctx_office = ctx_subcat = None
            elif norm_region(name):
                ctx_region = norm_region(name)
                ctx_office = ctx_subcat = None
            elif norm_office(name):
                ctx_office = norm_office(name)
                ctx_subcat = None
            elif any(rx.search(name) for rx in HEADER_RX):
                ctx_pap = name
            items.append({
                "name": name,
                "amount_pesos": amount,
                "amount_thousands": round(amount / 1000, 3) if amount is not None else None,
                "program": ctx_program,
                "pap": ctx_pap,
                "region": ctx_region,
                "office": ctx_office,
                "subcategory": ctx_subcat,
                "char_pos": pos,
                "is_header": True,
            })
            continue
        items.append({
            "name": name,
            "amount_pesos": amount,
            "amount_thousands": round(amount / 1000, 3) if amount is not None else None,
            "program": ctx_program,
            "pap": ctx_pap,
            "region": ctx_region,
            "office": ctx_office,
            "subcategory": ctx_subcat,
            "char_pos": pos,
            "is_header": False,
        })

    projects = [it for it in items if not it.get("is_header") and is_project_like(it["name"])]

    with open(OUT, "w", encoding="utf-8") as f:
        json.dump({
            "source": os.path.basename(MD_FILE),
            "bill": "HB 10858 (House budget proposal FY 2027) - Volume I-C",
            "note": ("amount_pesos is native (VOL IC prints pesos). "
                     "amount_thousands = pesos/1000 for NEP-API comparability. "
                     "is_header rows (kept separately) carry printed subtotals."),
            "total_leaf_rows": len(items),
            "project_like_rows": len(projects),
            "items": projects,
        }, f, ensure_ascii=False, indent=1)

    print(f"Parsed {len(items)} leaf rows; kept {len(projects)} project-like items")
    tot = sum(p["amount_pesos"] or 0 for p in projects)
    print(f"Sum of project rows (pesos): {tot:,}  (~P{tot/1e9:,.1f}B)")


if __name__ == "__main__":
    main()
