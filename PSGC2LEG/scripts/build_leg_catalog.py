#!/usr/bin/env python3
"""Phase 2: Build the canonical 2025 LEG catalog (geographic legislative
districts of the House of Representatives, 20th Congress).

Method:
  1. Start from BetterGov 20th Congress roster (district representatives only).
  2. Apply documented exclusions/normalizations (non-district rows, Taguig/Pateros).
  3. Assign each jurisdiction to its COMELEC region using Annex A region
     subtotals (extracted from Res 11050) as the reconciliation frame.
  4. Validate: unique seats == 254 (COMELEC Res 11050 Annex A baseline).

Output: data/legislative_districts.json
Schema per district:
  leg_id            'leg:ph:<jurisdiction-slug>:<district-key>:2025'
  jurisdiction      province or city name (as used by COMELEC)
  jurisdiction_type province | city | city_pair
  district_label    'Lone District' | '1st District' | ... | '2nd District (Pateros)'
  district_no       0 (lone) | 1..n
  region            COMELEC region name
  congress          20
  election_year     2025
  representative    name from roster (corroboration only; not identity)
  source_refs       [comelec-res-11050, bettergov-roster]
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "sources" / "raw"
DATA = ROOT / "data"

ROSTER = RAW / "bettergov-20th-congress-roster__20th_congress_representatives.json"

# ---- COMELEC region assignment (from Annex A structure) ----
REGION_OF_JURISDICTION = {
    # NCR (33)
    "Manila": "NCR", "Quezon City": "NCR", "Caloocan": "NCR", "Makati": "NCR",
    "Parañaque": "NCR", "Valenzuela": "NCR", "Pasig": "NCR", "Pasay": "NCR",
    "Las Piñas": "NCR", "Mandaluyong": "NCR", "Marikina": "NCR",
    "Muntinlupa": "NCR", "Malabon": "NCR", "Navotas": "NCR",
    "Taguig–Pateros": "NCR", "San Juan": "NCR",
    # CAR (7)
    "Abra": "CAR", "Apayao": "CAR", "Benguet": "CAR", "Baguio": "CAR",
    "Ifugao": "CAR", "Kalinga": "CAR", "Mountain Province": "CAR",
    # Region I (12)
    "Ilocos Norte": "R1", "Ilocos Sur": "R1", "La Union": "R1", "Pangasinan": "R1",
    # Region II (12)
    "Batanes": "R2", "Cagayan": "R2", "Isabela": "R2",
    "Nueva Vizcaya": "R2", "Quirino": "R2",
    # Region III (24)
    "Bataan": "R3", "Bulacan": "R3", "San Jose del Monte": "R3",
    "Nueva Ecija": "R3", "Pampanga": "R3", "Tarlac": "R3", "Zambales": "R3",
    "Aurora": "R3",
    # Region IV-A (31)
    "Batangas": "R4A", "Cavite": "R4A", "Laguna": "R4A", "Biñan": "R4A",
    "Calamba": "R4A", "Santa Rosa": "R4A", "Quezon": "R4A", "Rizal": "R4A",
    "Antipolo": "R4A",
    # Region IV-B (8)
    "Marinduque": "R4B", "Occidental Mindoro": "R4B", "Oriental Mindoro": "R4B",
    "Palawan": "R4B", "Romblon": "R4B",
    # Region V (16)
    "Albay": "R5", "Camarines Norte": "R5", "Camarines Sur": "R5",
    "Catanduanes": "R5", "Masbate": "R5", "Sorsogon": "R5",
    # Region VI (16)
    "Aklan": "R6", "Antique": "R6", "Capiz": "R6", "Guimaras": "R6",
    "Iloilo": "R6", "Iloilo City": "R6",
    # NIR (11)
    "Negros Occidental": "NIR", "Bacolod": "NIR", "Negros Oriental": "NIR",
    "Siquijor": "NIR",
    # Region VII (11)
    "Bohol": "R7", "Cebu": "R7", "Cebu City": "R7", "Lapu-Lapu City": "R7",
    "Mandaue": "R7",
    # Region VIII (13)
    "Biliran": "R8", "Eastern Samar": "R8", "Leyte": "R8",
    "Northern Samar": "R8", "Samar": "R8", "Southern Leyte": "R8",
    # Region IX (9)
    "Zamboanga del Norte": "R9", "Zamboanga del Sur": "R9",
    "Zamboanga City": "R9", "Zamboanga Sibugay": "R9",
    # Region X (14)
    "Bukidnon": "R10", "Camiguin": "R10", "Misamis Occidental": "R10",
    "Misamis Oriental": "R10", "Cagayan de Oro": "R10",
    "Lanao del Norte": "R10", "Iligan": "R10",
    # Region XI (11)
    "Davao de Oro": "R11", "Davao del Norte": "R11", "Davao Occidental": "R11",
    "Davao del Sur": "R11", "Davao City": "R11", "Davao Oriental": "R11",
    # Region XII (10)
    "Sarangani": "R12", "Cotabato": "R12", "Sultan Kudarat": "R12",
    "South Cotabato": "R12", "General Santos": "R12",
    # BARMM (8)
    "Basilan": "BARMM", "Lanao del Sur": "BARMM",
    "Maguindanao del Norte": "BARMM", "Maguindanao del Sur": "BARMM",
    "Sulu": "BARMM", "Tawi-Tawi": "BARMM",
    # Caraga (10)
    "Agusan del Norte": "Caraga", "Butuan": "Caraga", "Agusan del Sur": "Caraga",
    "Surigao del Norte": "Caraga", "Surigao del Sur": "Caraga",
    "Dinagat Islands": "Caraga",
}

REGION_NAMES = {
    "NCR": "National Capital Region", "CAR": "Cordillera Administrative Region",
    "R1": "Region I (Ilocos)", "R2": "Region II (Cagayan Valley)",
    "R3": "Region III (Central Luzon)", "R4A": "Region IV-A (CALABARZON)",
    "R4B": "Region IV-B (MIMAROPA)", "R5": "Region V (Bicol)",
    "R6": "Region VI (Western Visayas)", "NIR": "Negros Island Region",
    "R7": "Region VII (Central Visayas)", "R8": "Region VIII (Eastern Visayas)",
    "R9": "Region IX (Zamboanga Peninsula)", "R10": "Region X (Northern Mindanao)",
    "R11": "Region XI (Davao)", "R12": "Region XII (SOCCSKSARGEN)",
    "BARMM": "Bangsamoro Autonomous Region in Muslim Mindanao",
    "Caraga": "Caraga",
}

# Annex A per-region seat subtotals (COMELEC Res 11050), reconciled against
# per-jurisdiction rows; sum = 254
ANNEX_A_REGION_SEATS = {
    "NCR": 33, "CAR": 7, "R1": 12, "R2": 12, "R3": 24, "R4A": 31, "R4B": 8,
    "R5": 16, "R6": 12, "NIR": 11, "R7": 14, "R8": 13, "R9": 9, "R10": 14,
    "R11": 11, "R12": 10, "BARMM": 8, "Caraga": 9,
}

# Roster rows that are not geographic legislative districts
EXCLUDE = {
    "Chairman", "District", "Marie Josephine Diana Calatrava",
    "Senate Electoral Tribunal",
}

# Roster label -> canonical jurisdiction
JURISDICTION_FIXES = {
    "Taguig": "Taguig–Pateros",          # roster splits; Annex A models
    "Taguig-Pateros": "Taguig–Pateros",  # as 2 seats under Taguig/Pateros
    "Cebu City": "Cebu City",
    "Zamboanga City": "Zamboanga City",
    "Cotabato": "Cotabato",  # North Cotabato province
}

ORDINALS = {"1st": 1, "2nd": 2, "3rd": 3, "4th": 4, "5th": 5, "6th": 6,
            "7th": 7, "8th": 8}


def slug(s: str) -> str:
    s = s.lower().replace("ñ", "n").replace("–", "-").replace(" ", "-")
    return re.sub(r"[^a-z0-9-]", "", s)


def main() -> int:
    roster = json.loads(ROSTER.read_text(encoding="utf-8"))

    districts = []
    problems = []
    for r in roster:
        prov, dist, rep = r.get("province", ""), r.get("district", ""), r.get("representative", "")
        if not dist or prov in EXCLUDE:
            continue
        if "party-list" in prov.lower() or "party list" in prov.lower():
            continue
        # Taguig special case: roster carries two 'Lone' rows, but Annex A
        # allocates 2 seats: 'City of Taguig (2nd councilor district)' and
        # 'City of Taguig (1st councilor district) - Pateros'. Per Res 11069
        # and the roster's own reps (Cruz = Taguig-Pateros 1st; Bocobo = 2nd):
        if prov == "Taguig–Pateros":
            jur, dno, label = "Taguig–Pateros", 1, "1st District (Pateros)"
        elif prov == "Taguig":
            jur, dno, label = "Taguig–Pateros", 2, "2nd District"
        else:
            jur = JURISDICTION_FIXES.get(prov, prov)
        region_key = REGION_OF_JURISDICTION.get(jur)
        if region_key is None:
            problems.append({"row": r, "reason": "no region assignment"})
            continue
        d = dist.strip()
        m = re.match(r"^([1-9][a-z]{1,2})\b", d, re.I)
        if jur == "Taguig–Pateros":
            pass  # handled above
        elif d.lower().startswith("lone"):
            dno, label = 0, "Lone District"
        elif m and m.group(1).lower() in ORDINALS:
            dno = ORDINALS[m.group(1).lower()]
            label = f"{dno}{'st' if dno==1 else 'nd' if dno==2 else 'rd' if dno==3 else 'th'} District"
        else:
            problems.append({"row": r, "reason": f"unparsed district {d!r}"})
            continue
        jtype = "city_pair" if jur == "Taguig–Pateros" else ("city" if jur in CITY_JURISDICTIONS else "province")
        districts.append({
            "leg_id": f"leg:ph:{slug(jur)}:{'lone' if dno==0 else dno}:2025",
            "jurisdiction": jur,
            "jurisdiction_type": jtype,
            "district_label": label,
            "district_no": dno,
            "region_key": region_key,
            "region": REGION_NAMES[region_key],
            "congress": 20,
            "election_year": 2025,
            "representative": rep,
            "source_refs": ["comelec-res-11050", "bettergov-20th-congress-roster", "comelec-res-11069"],
        })

    # dedupe (Taguig rows collapse)
    by_leg = {}
    for d in districts:
        if d["leg_id"] in by_leg:
            # merge Pateros annotation
            if "(Pateros)" in d["district_label"]:
                by_leg[d["leg_id"]]["district_label"] = d["district_label"]
            continue
        by_leg[d["leg_id"]] = d
    districts = sorted(by_leg.values(), key=lambda d: (d["region_key"], d["jurisdiction"], d["district_no"]))

    # validations
    n = len(districts)
    region_counts = {}
    for d in districts:
        region_counts.setdefault(d["region_key"], []).append(d)
    region_check = {rk: {"catalog": len(v), "annex_a": ANNEX_A_REGION_SEATS[rk]}
                    for rk, v in sorted(region_counts.items())}

    out = {
        "source_refs": {
            "seat_baseline": "COMELEC Resolution No. 11050 (4 Sep 2024) Annex A — 254 districts",
            "roster": "BetterGov 20th Congress representatives (representative names corroboration only)",
        },
        "district_count": n,
        "expected_count": 254,
        "region_seat_check": region_check,
        "districts": districts,
        "problems": problems,
    }
    DATA.mkdir(exist_ok=True)
    (DATA / "legislative_districts.json").write_text(
        json.dumps(out, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    print(f"districts: {n} (expect 254)")
    mismatches = {rk: v for rk, v in region_check.items() if v["catalog"] != v["annex_a"]}
    print("region mismatches:", json.dumps(mismatches, indent=1) if mismatches else "none")
    if problems:
        print(f"{len(problems)} problems:")
        for p in problems[:10]:
            print("  ", p)
    return 0


CITY_JURISDICTIONS = {
    "Manila", "Quezon City", "Caloocan", "Makati", "Parañaque", "Valenzuela",
    "Pasig", "Pasay", "Las Piñas", "Mandaluyong", "Marikina", "Muntinlupa",
    "Malabon", "Navotas", "Taguig–Pateros", "San Juan",
    "Baguio", "San Jose del Monte", "Biñan", "Calamba", "Santa Rosa",
    "Antipolo", "Iloilo City", "Bacolod", "Cebu City", "Lapu-Lapu City",
    "Mandaue", "Zamboanga City", "Cagayan de Oro", "Iligan", "Davao City",
    "General Santos", "Butuan", "Dinagat Islands",
}
# NOTE: Dinagat Islands is a province — remove from city set
CITY_JURISDICTIONS.discard("Dinagat Islands")


if __name__ == "__main__":
    sys.exit(main())
