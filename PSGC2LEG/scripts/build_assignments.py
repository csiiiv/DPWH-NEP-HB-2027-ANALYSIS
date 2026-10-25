#!/usr/bin/env python3
"""Phase 3: Build PSGC→LEG assignments for the 2025 baseline.

Join strategy:
  - PSGC catalog (canonical codes) x BetterGov municipality→district mapping
    (the only source with per-municipality district labels for all provinces).
  - BetterGov jurisdiction keys map to LEG catalog jurisdictions
    (provinces directly; NCR groupings; nested 'City Of X' entries as cities).
  - Municipality name matching is done WITHIN the parent province/city context,
    never globally by name alone.

Split cities are additionally resolved at barangay level when a retained
barangay roster is available. Taguig uses the original RA 8487 district
composition plus COMELEC Resolution 11069's allocation of the ten EMBO
barangays for the 2025 election.

Outputs:
  data/psgc_leg_assignments.jsonl   municipality/city rows plus resolved
                                    split-city barangays
  data/assignment_report.json       coverage + unmatched + conflicts + splits

Assignment row schema:
  psgc_code             str  municipality/city PSGC code
  name                  str
  level                 'municipality' | 'city' | 'sub_municipality'
  parent_province_code  str|none
  leg_id                str|none     null = unresolved
  assignment_type       'whole_unit' | 'multi_district_city' | 'unmatched'
  verification_status   'cross_checked' (BetterGov+UACS) | 'single_source' | 'provisional'
  sources               [source ids]
"""

from __future__ import annotations

import json
import re
import sys
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "sources" / "raw"
DATA = ROOT / "data"

BG = RAW / "bettergov-districts-generated__districts_generated.json"
UACS = RAW / "uacs-nscb-municipality-leg__NSCB%20-%20Municipality%20with%20Legislative%20Districts.xlsx"


def norm(s: str) -> str:
    """Aggressive name normalization for matching."""
    s = unicodedata.normalize("NFKD", s or "")
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = s.upper()
    s = s.replace("Ñ", "N").replace("&", " AND ")
    s = re.sub(r"[^A-Z0-9 ]", " ", s)
    s = re.sub(r"\b(CITY|MUNICIPALITY|OF|THE)\b", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


ORD = {"1ST": 1, "2ND": 2, "3RD": 3, "4TH": 4, "5TH": 5, "6TH": 6, "7TH": 7, "8TH": 8}


def district_key(label: str):
    """'1st District' -> 1, 'Lone District' -> 0, else None."""
    l = (label or "").upper().strip()
    if l.startswith("LONE"):
        return 0
    m = re.match(r"^([1-9])\s*(ST|ND|RD|TH)", l)
    return int(m.group(1)) if m else None


def leg_id_for(jur_slug: str, dk: int) -> str:
    return f"leg:ph:{jur_slug}:{'lone' if dk == 0 else dk}:2025"


def slug(s: str) -> str:
    s = s.lower().replace("ñ", "n").replace("–", "-").replace(" ", "-")
    return re.sub(r"[^a-z0-9-]", "", s)


# Current Taguig barangay allocation. The original barangays follow the two
# districts established by RA 8487; their 2008 child barangays retain the
# parent's district. COMELEC Resolution 11069 assigns the ten EMBO barangays.
TAGUIG_DISTRICTS = {
    1: {
        "Bagumbayan", "Bambang", "Calzada", "Hagonoy", "Ibayo-Tipas",
        "Ligid-Tipas", "Lower Bicutan", "New Lower Bicutan", "Napindan",
        "Palingon", "San Miguel", "Santa Ana", "Tuktukan", "Ususan", "Wawa",
        "Comembo", "Pembo", "Rizal",
    },
    2: {
        "Central Bicutan", "Central Signal Village", "Fort Bonifacio",
        "Katuparan", "Maharlika Village", "North Daang Hari",
        "North Signal Village", "Pinagsama", "South Daang Hari",
        "South Signal Village", "Tanyag", "Upper Bicutan", "Western Bicutan",
        "Cembo", "East Rembo", "Pitogo", "Post Proper Northside",
        "Post Proper Southside", "South Cembo", "West Rembo",
    },
}

# Narrow source-name repairs used only inside a known split city.
SPLIT_BARANGAY_ALIASES = {
    ("Davao City", "KAP TOMAS MONTEVERDE SR"): "KAP TOMAS MONTEVERDE",
    ("Davao City", "LEON GARCIA SR"): "LEON GARCIA",
    ("Valenzuela", "GEN T DE LEON"): "HEN T DE LEON",
}

# BetterGov omits two numbered Manila rows. Their immediately adjacent
# numbered barangays are in the same district, and the retained PSGC catalog
# confirms both are current barangays.
SPLIT_BARANGAY_OVERRIDES = {
    ("Manila", "BARANGAY 10"): 1,
    ("Manila", "BARANGAY 821"): 5,
}


# BetterGov jurisdiction key -> canonical jurisdiction name in LEG catalog
BGKEY_TO_JUR = {
    "Abra": "Abra", "Agusan Del Norte": "Agusan del Norte",
    "Agusan Del Sur": "Agusan del Sur", "Aklan": "Aklan", "Albay": "Albay",
    "Antique": "Antique", "Apayao": "Apayao", "Aurora": "Aurora",
    "Basilan": "Basilan", "Bataan": "Bataan", "Batanes": "Batanes",
    "Batangas": "Batangas", "Benguet": "Benguet", "Biliran": "Biliran",
    "Bohol": "Bohol", "Bukidnon": "Bukidnon", "Bulacan": "Bulacan",
    "Cagayan": "Cagayan", "Camarines Norte": "Camarines Norte",
    "Camarines Sur": "Camarines Sur", "Camiguin": "Camiguin", "Capiz": "Capiz",
    "Catanduanes": "Catanduanes", "Cavite": "Cavite", "Cebu": "Cebu",
    "Cotabato": "Cotabato", "Davao De Oro": "Davao de Oro",
    "Davao Del Norte": "Davao del Norte", "Davao Del Sur": "Davao del Sur",
    "Davao Occidental": "Davao Occidental", "Davao Oriental": "Davao Oriental",
    "Dinagat Islands": "Dinagat Islands", "Eastern Samar": "Eastern Samar",
    "Guimaras": "Guimaras", "Ifugao": "Ifugao", "Ilocos Norte": "Ilocos Norte",
    "Ilocos Sur": "Ilocos Sur", "Iloilo": "Iloilo", "Isabela": "Isabela",
    "Kalinga": "Kalinga", "La Union": "La Union", "Laguna": "Laguna",
    "Lanao Del Norte": "Lanao del Norte", "Lanao Del Sur": "Lanao del Sur",
    "Leyte": "Leyte", "Maguindanao Del Norte": "Maguindanao del Norte",
    "Maguindanao Del Sur": "Maguindanao del Sur", "Marinduque": "Marinduque",
    "Masbate": "Masbate", "Misamis Occidental": "Misamis Occidental",
    "Misamis Oriental": "Misamis Oriental", "Mountain Province": "Mountain Province",
    "Negros Occidental": "Negros Occidental", "Negros Oriental": "Negros Oriental",
    "Northern Samar": "Northern Samar", "Nueva Ecija": "Nueva Ecija",
    "Nueva Vizcaya": "Nueva Vizcaya", "Occidental Mindoro": "Occidental Mindoro",
    "Oriental Mindoro": "Oriental Mindoro", "Palawan": "Palawan",
    "Pampanga": "Pampanga", "Pangasinan": "Pangasinan", "Quezon": "Quezon",
    "Quirino": "Quirino", "Rizal": "Rizal", "Romblon": "Romblon",
    "Samar": "Samar", "Sarangani": "Sarangani", "Siquijor": "Siquijor",
    "Sorsogon": "Sorsogon", "South Cotabato": "South Cotabato",
    "Southern Leyte": "Southern Leyte", "Sultan Kudarat": "Sultan Kudarat",
    "Sulu": "Sulu", "Surigao Del Norte": "Surigao del Norte",
    "Surigao Del Sur": "Surigao del Sur", "Tarlac": "Tarlac",
    "Tawi-Tawi": "Tawi-Tawi", "Zambales": "Zambales",
    "Zamboanga Del Norte": "Zamboanga del Norte",
    "Zamboanga Del Sur": "Zamboanga del Sur",
    "Zamboanga Sibugay": "Zamboanga Sibugay",
}

# NCR groupings: member cities map to their own LEG jurisdictions
# City entities with their OWN Annex A seat line (own LEG jurisdiction),
# nested under province keys in BetterGov ('City Of X'). Cities WITHOUT own
# Annex A lines (Angeles, Olongapo, Lucena, Tacloban, Ozamiz, Puerto Princesa,
# Isabela City) are correctly assigned by BetterGov into province districts
# and must NOT be remapped.
CITY_JURISDICTION_NAMES = {
    "City of Baguio": "Baguio",
    "City of San Jose del Monte": "San Jose del Monte",
    "City of Biñan": "Biñan", "City of Calamba": "Calamba",
    "City of Santa Rosa": "Santa Rosa", "City of Antipolo": "Antipolo",
    "City of Iloilo": "Iloilo City", "City of Bacolod": "Bacolod",
    "City of Cebu": "Cebu City", "City of Lapu-Lapu": "Lapu-Lapu City",
    "City of Mandaue": "Mandaue", "City of Zamboanga": "Zamboanga City",
    "City of Cagayan de Oro": "Cagayan de Oro", "City of Iligan": "Iligan",
    "City of Davao": "Davao City", "City of General Santos": "General Santos",
    "City of Butuan": "Butuan",
}
CITY_JUR_BY_NORM = {norm(k): v for k, v in CITY_JURISDICTION_NAMES.items()}

# Province-scoped municipality aliases: (jurisdiction, BetterGov norm key)
# -> PSGC norm name. Names changed in PSGC after BetterGov snapshot.
SCOPED_ALIASES = {
    ("Davao del Norte", "SAN ISIDRO"): "SAWATA",          # renamed in PSGC 2026
    ("Davao del Norte", "ASUNCION"): "ASUNCION",           # still current
    ("Palawan", "RIZAL"): "DR JOSE P RIZAL",               # renamed in PSGC 2026
    ("Misamis Occidental", "OZAMIS"): "OZAMIZ",
    ("Misamis Occidental", "DON VICTORIANO CHIONGBIAN"): "DON VICTORIANO",
    # Lanao del Sur coverage gaps in BetterGov (keep flagged as manual):
    # Maguing, Tagoloan II, Sultan Dumalondong -> see MANUAL_OVERRIDES
}

# Plain global aliases (norm key -> norm name)
NAME_ALIASES = {}

# Manual overrides for municipalities BetterGov does not cover.
# Provisional: assigned from apportionment-law knowledge, needs citation pass.
MANUAL_OVERRIDES = {
    "0906608000": {"leg_id": "leg:ph:sulu:2:2025", "status": "provisional_name_match",
                   "note": "Pangutaran in Sulu 2nd per Sulu apportionment; BetterGov gap; verify vs RA/lawphil text"},
    "1900712000": {"leg_id": "leg:ph:basilan:lone:2025", "status": "provisional_name_match",
                   "note": "Hadji Muhtamad in Basilan Lone; BetterGov gap; verify"},
    "1903604000": {"leg_id": "leg:ph:lanao-del-sur:2:2025", "status": "provisional_name_match",
                   "note": "Bayang in Lanao del Sur 2nd; BetterGov gap; verify"},
    "1903620000": {"leg_id": "leg:ph:lanao-del-sur:2:2025", "status": "provisional_name_match",
                   "note": "Pagayawan (aka Bacolod-Kalawi) in Lanao del Sur 2nd; BetterGov gap; verify"},
    "1903601000": {"leg_id": "leg:ph:lanao-del-sur:1:2025", "status": "provisional_name_match",
                   "note": "Bacolod-Kalawi in Lanao del Sur 1st; BetterGov gap; verify"},
    "1903634000": {"leg_id": "leg:ph:lanao-del-sur:1:2025", "status": "provisional_name_match",
                   "note": "Maguing in Lanao del Sur 1st; BetterGov gap; verify"},
    "1903638000": {"leg_id": "leg:ph:lanao-del-sur:1:2025", "status": "provisional_name_match",
                   "note": "Tagoloan II in Lanao del Sur 1st; BetterGov gap; verify"},
    "1903640000": {"leg_id": "leg:ph:lanao-del-sur:1:2025", "status": "provisional_name_match",
                   "note": "Sultan Dumalondong in Lanao del Sur 1st; BetterGov gap; verify"},
    # 8 new BARMM municipalities (created 2023-24 from Cotabato SGA barangays,
    # interim province code 19999). They vote under the SGA allocation tied to
    # Maguindanao del Norte per plebiscite ordinances + PSA interim coding.
    "1999901000": {"leg_id": "leg:ph:maguindanao-del-norte:lone:2025", "status": "provisional_name_match",
                   "note": "Kapalawan — new BARMM muni (interim 19999); assigned Maguindanao del Norte lone; verify vs COMELEC"},
    "1999902000": {"leg_id": "leg:ph:maguindanao-del-norte:lone:2025", "status": "provisional_name_match",
                   "note": "Old Kaabakan — new BARMM muni; Maguindanao del Norte lone; verify"},
    "1999903000": {"leg_id": "leg:ph:maguindanao-del-norte:lone:2025", "status": "provisional_name_match",
                   "note": "Kadayangan — new BARMM muni; Maguindanao del Norte lone; verify"},
    "1999904000": {"leg_id": "leg:ph:maguindanao-del-norte:lone:2025", "status": "provisional_name_match",
                   "note": "Nabalawag — new BARMM muni; Maguindanao del Norte lone; verify"},
    "1999905000": {"leg_id": "leg:ph:maguindanao-del-norte:lone:2025", "status": "provisional_name_match",
                   "note": "Pahamuddin — new BARMM muni; Maguindanao del Norte lone; verify"},
    "1999906000": {"leg_id": "leg:ph:maguindanao-del-norte:lone:2025", "status": "provisional_name_match",
                   "note": "Malidegao — new BARMM muni; Maguindanao del Norte lone; verify"},
    "1999907000": {"leg_id": "leg:ph:maguindanao-del-norte:lone:2025", "status": "provisional_name_match",
                   "note": "Ligawasan — new BARMM muni; Maguindanao del Norte lone; verify"},
    "1999908000": {"leg_id": "leg:ph:maguindanao-del-norte:lone:2025", "status": "provisional_name_match",
                   "note": "Tugunan — new BARMM muni; Maguindanao del Norte lone; verify"},
}

NCR_GROUPS = {
    "National Capital Region - Manila": ["Manila"],
    "National Capital Region - Second District": ["Marikina", "Quezon City", "San Juan", "Mandaluyong", "Pasig"],
    "National Capital Region - Third District": ["Caloocan", "Valenzuela", "Malabon", "Navotas"],
    "National Capital Region - Fourth District": ["Makati", "Parañaque", "Las Piñas", "Muntinlupa", "Pasay", "Taguig–Pateros"],
}


def main() -> int:
    psgc = [json.loads(l) for l in (DATA / "psgc_locations.jsonl").open(encoding="utf-8")]
    leg = json.loads((DATA / "legislative_districts.json").read_text(encoding="utf-8"))
    bg = json.loads(BG.read_text(encoding="utf-8"))
    children = defaultdict(list)
    for row in psgc:
        children[row.get("parent_code")].append(row)

    # LEG catalog lookups
    leg_by_jur = defaultdict(dict)  # jurisdiction -> district_no -> district
    for d in leg["districts"]:
        leg_by_jur[d["jurisdiction"]][d["district_no"]] = d
    jur_by_slug = {slug(d["jurisdiction"]): d["jurisdiction"] for d in leg["districts"]}

    # PSGC indexes: municipalities/cities by (parent province norm-name, own norm-name)
    by_province = defaultdict(dict)  # province norm name -> {norm mun name -> loc}
    locs_mc = []
    provinces = [p for p in psgc if p["level"] == "province"]
    prov_by_norm = {norm(p["name"]): p for p in provinces}
    for l in psgc:
        if l["level"] in ("municipality", "city", "sub_municipality"):
            locs_mc.append(l)
            parent = None
            if l["parent_code"]:
                pl = next((p for p in psgc if p["code"] == l["parent_code"]), None)
                if pl and pl["level"] == "province":
                    parent = norm(pl["name"])
            if parent:
                by_province[parent][norm(l["name"])] = l

    # NCR: cities by norm name (region-level parents)
    ncr = next(p for p in psgc if p["level"] == "region" and p["code"].startswith("13"))
    ncr_entities = {}
    for l in locs_mc:
        if l["code"].startswith("13"):
            ncr_entities[norm(l["name"])] = l

    assignments = {}   # psgc_code -> row
    unmatched_bg = []
    multi_district_cities = []
    split_barangay_stats = {}

    def descendant_barangays(city_code: str):
        result, stack = [], [city_code]
        while stack:
            parent = stack.pop()
            for child in children.get(parent, []):
                if child["level"] == "barangay":
                    result.append(child)
                elif child["level"] == "sub_municipality":
                    stack.append(child["code"])
        return result

    def assign_split_barangays(city: dict, jur: str, roster: dict,
                               sources=None, overrides=None):
        """Attach every current barangay in a split city to one LEG seat."""
        roster_by_name = {norm(name): district_key(label)
                          for name, label in roster.items()}
        direct = overrides or {}
        rows, missing = descendant_barangays(city["code"]), []
        for barangay in rows:
            name = norm(barangay["name"])
            source_name = SPLIT_BARANGAY_ALIASES.get((jur, name), name)
            dk = direct.get(name, roster_by_name.get(source_name))
            if dk is None or dk not in leg_by_jur.get(jur, {}):
                missing.append(barangay["name"])
                continue
            district = leg_by_jur[jur][dk]
            assignments[barangay["code"]] = {
                "psgc_code": barangay["code"],
                "name": barangay["name"],
                "level": "barangay",
                "parent_province_code": barangay["parent_code"],
                "leg_id": district["leg_id"],
                "assignment_type": "barangay_split",
                "verification_status": "single_source",
                "sources": sources or ["bettergov-districts-generated"],
            }
        split_barangay_stats[city["code"]] = {
            "name": city["name"], "jurisdiction": jur,
            "catalog_barangays": len(rows), "assigned": len(rows) - len(missing),
            "missing": missing,
        }
        if missing:
            raise ValueError(f"Unassigned split-city barangays for {jur}: {missing}")

    def assign(loc: dict, jur: str, dk: int, label_src: str, extra_sources=None):
        ld = leg_by_jur.get(jur, {}).get(dk)
        row = {
            "psgc_code": loc["code"],
            "name": loc["name"],
            "level": loc["level"],
            "parent_province_code": loc["parent_code"],
            "leg_id": ld["leg_id"] if ld else None,
            "assignment_type": "whole_unit",
            "verification_status": "single_source",
            "sources": ["bettergov-districts-generated", *(extra_sources or [])],
        }
        if ld is None:
            row["assignment_type"] = "unmatched"
            row["review_note"] = f"district {dk} not in LEG catalog for {jur}"
        assignments[loc["code"]] = row
        return row

    def handle_bg_entry(jur: str, mkey: str, val, prov_norm: str | None):
        """Process one BetterGov municipality entry against PSGC."""
        n = norm(mkey)
        # City with own LEG jurisdiction nested under a province key?
        # IMPORTANT: only when BetterGov's key literally names a city ('City Of X'),
        # never on bare-name collisions (e.g. municipality 'Santa Rosa' in Nueva
        # Ecija vs 'City of Santa Rosa' in Laguna).
        city_jur = None
        if re.match(r"(?i)^city\s+of\s+", mkey.strip()):
            city_jur = CITY_JUR_BY_NORM.get(n)
        if city_jur:
            jur = city_jur
            prov_norm = None  # look up globally by unique city name
        # province-scoped alias first, then global alias
        n = SCOPED_ALIASES.get((jur, n), NAME_ALIASES.get(n, n))
        loc = None
        if prov_norm:
            loc = by_province.get(prov_norm, {}).get(n)
            if loc is None and re.match(r"(?i)^city\s+of\s+", mkey.strip()):
                # HUC parented to region in PSGC but voting inside a province
                # district per BetterGov/Annex A — find it globally.
                cand = [l for l in locs_mc if norm(l["name"]) == n and l["level"] == "city"]
                if len(cand) == 1:
                    loc = cand[0]
        else:
            loc = ncr_entities.get(n)
            if loc is None:
                # unique global lookup for city jurisdictions
                cand = [l for l in locs_mc if norm(l["name"]) == n and l["level"] == "city"]
                if len(cand) == 1:
                    loc = cand[0]
        if loc is None:
            unmatched_bg.append({"jurisdiction": jur, "key": mkey, "norm": n})
            return
        if isinstance(val, dict):
            # Keep a city-level marker and publish the actual district
            # assignment on each current barangay beneath it.
            row = {
                "psgc_code": loc["code"],
                "name": loc["name"],
                "level": loc["level"],
                "parent_province_code": loc["parent_code"],
                "leg_id": None,
                "assignment_type": "multi_district_city",
                "verification_status": "provisional",
                "sources": ["bettergov-districts-generated"],
                "review_note": f"split city resolved through {len(val.get('barangays', {}))} retained barangay roster entries",
            }
            assignments[loc["code"]] = row
            multi_district_cities.append({"psgc_code": loc["code"], "name": loc["name"], "jurisdiction": jur})
            overrides = {name: dk for (override_jur, name), dk in
                         SPLIT_BARANGAY_OVERRIDES.items() if override_jur == jur}
            assign_split_barangays(loc, jur, val.get("barangays", {}),
                                   overrides=overrides)
            return
        dk = district_key(val)
        if dk is None:
            unmatched_bg.append({"jurisdiction": jur, "key": mkey, "value": val})
            return
        assign(loc, jur, dk, val)

    for bgkey, munis in bg.items():
        if bgkey in NCR_GROUPS:
            # entries are NCR cities (possibly split-city dicts)
            for mkey, val in munis.items():
                n = norm(mkey)
                # which NCR jurisdiction does this city belong to?
                jur = None
                for cand in NCR_GROUPS[bgkey]:
                    if norm(cand) == n or norm(cand) in n or n in norm(cand):
                        jur = cand
                        break
                if jur is None:
                    # try all NCR jurisdictions
                    for cand in ["Manila", "Quezon City", "Caloocan", "Makati", "Parañaque",
                                 "Valenzuela", "Pasig", "Pasay", "Las Piñas", "Mandaluyong",
                                 "Marikina", "Muntinlupa", "Malabon", "Navotas",
                                 "Taguig–Pateros", "San Juan"]:
                        if norm(cand) == n:
                            jur = cand
                            break
                if jur is None:
                    unmatched_bg.append({"jurisdiction": bgkey, "key": mkey, "norm": n, "reason": "no NCR city match"})
                    continue
                # Taguig/Pateros: BetterGov gives 'Lone District' labels, but the
                # two units form two separate seats (Annex A + Res 11069):
                #   Pateros + Taguig 1st councilor dist barangays -> 1st (w/ Pateros)
                #   Taguig 2nd councilor dist barangays -> 2nd
                if jur == "Taguig–Pateros":
                    if "pateros" in n.lower():
                        loc = ncr_entities.get("PATEROS")
                        if loc:
                            assign(loc, jur, 1, "1st District (Pateros)",
                                   extra_sources=["republic-act-8487", "comelec-res-11069"])
                    else:
                        # Taguig city proper: RA 8487 supplies the original
                        # district composition; COMELEC 11069 supplies the ten
                        # transferred EMBO barangays for the 2025 election.
                        loc = ncr_entities.get("TAGUIG")
                        if loc and isinstance(val, dict):
                            handle_bg_entry(jur, mkey, val, prov_norm=None)
                        elif loc:
                            assignments[loc["code"]] = {
                                "psgc_code": loc["code"], "name": loc["name"],
                                "level": loc["level"], "parent_province_code": loc["parent_code"],
                                "leg_id": None, "assignment_type": "multi_district_city",
                                "verification_status": "provisional",
                                "sources": ["republic-act-8487", "comelec-res-11069"],
                                "review_note": "Taguig split resolved at barangay level from RA 8487 composition and COMELEC Res 11069; Pateros joins 1st",
                            }
                            multi_district_cities.append({"psgc_code": loc["code"],
                                "name": loc["name"], "jurisdiction": jur})
                            direct = {norm(name): dk for dk, names in TAGUIG_DISTRICTS.items()
                                      for name in names}
                            assign_split_barangays(loc, jur, {},
                                sources=["republic-act-8487", "comelec-res-11069",
                                         "psgc-3q2026-bdb-flat"],
                                overrides=direct)
                    continue
                if isinstance(val, dict):
                    handle_bg_entry(jur, mkey, val, prov_norm=None)
                else:
                    loc = ncr_entities.get(n)
                    if loc is None:
                        unmatched_bg.append({"jurisdiction": bgkey, "key": mkey, "reason": "not in PSGC NCR"})
                        continue
                    dk = district_key(val)
                    assign(loc, jur, dk, val)
            continue

        jur = BGKEY_TO_JUR.get(bgkey)
        if jur is None:
            unmatched_bg.append({"jurisdiction": bgkey, "reason": "no jurisdiction mapping"})
            continue
        prov_norm = norm(jur)
        for mkey, val in munis.items():
            if norm(mkey) == prov_norm:
                # e.g., 'City Of Cebu' under 'Cebu' when slug equals province? (guard)
                pass
            handle_bg_entry(jur, mkey, val, prov_norm=prov_norm)

    # ---- cities with own LEG jurisdiction nested under province keys ----
    # Handled inside handle_bg_entry via CITY_JUR_BY_NORM remap.
    CITY_JUR_NORMS = {norm(k): v for k, v in CITY_JURISDICTION_NAMES.items()}

    # ---- Manila sub-municipal districts: multi-district city (6 districts) ----
    for l in locs_mc:
        if l["level"] == "sub_municipality" and l["code"].startswith("13806"):
            assignments[l["code"]] = {
                "psgc_code": l["code"],
                "name": l["name"],
                "level": "sub_municipality",
                "parent_province_code": l["parent_code"],
                "leg_id": None,
                "assignment_type": "multi_district_city",
                "verification_status": "provisional",
                "sources": ["psgc-3q2026-bdb-flat"],
                "review_note": "Manila sub-municipal district; barangay-level split needed to resolve (stretch goal, NCR optional)",
            }

    # ---- manual overrides for BetterGov coverage gaps ----
    for code, ov in MANUAL_OVERRIDES.items():
        l = next((x for x in locs_mc if x["code"] == code), None)
        if l is None:
            continue
        ld = [d for d in leg["districts"] if d["leg_id"] == ov["leg_id"]]
        assignments[code] = {
            "psgc_code": code,
            "name": l["name"],
            "level": l["level"],
            "parent_province_code": l["parent_code"],
            "leg_id": ov["leg_id"],
            "assignment_type": "whole_unit",
            "verification_status": ov["status"],
            "sources": ["manual-override-pending-citation"],
            "review_note": ov["note"],
        }

    # ---- Isabela City special rows ----
    # 0990100000 is the '(Not a Province)' annotation row; real city 0990101000.
    if "0990100000" in assignments:
        del assignments["0990100000"]  # annotation row, not a real entity

    # ---- fill gaps: municipalities with no BetterGov row ----
    # (e.g., new BARMM municipalities) — leave unmatched, flagged.
    missing = [l for l in locs_mc if l["code"] not in assignments and l["code"] != "0990100000"]

    # ---- UACS cross-check (2014 seed) ----
    uacs_check = {"file": UACS.name, "checked": 0, "agree": 0, "disagree": []}
    if UACS.exists():
        import openpyxl
        wb = openpyxl.load_workbook(UACS, read_only=True, data_only=True)
        ws = wb.worksheets[0]
        uacs_map = {}
        for row in ws.iter_rows(min_row=4, values_only=True):
            code = str(row[0] or "").strip()
            # UACS 2014 uses legacy 9-digit RRPPMMBBB (e.g. 012801000 =
            # R01 P28 M01). Modern 10-digit is RR + 0PP + MMM + BB, so
            # conversion: RR + '0' + PP + MM + '00'.
            if re.fullmatch(r"\d{9}", code) and code[4:6] != "00" and code[6:] == "000":
                modern = code[:2] + "0" + code[2:4] + code[4:6] + "0" + "00"  # RR 0PP MM0 00
                uacs_map[modern] = str(row[1] or "").strip()
        by_code9 = {}
        for l in locs_mc:
            by_code9[l["code"]] = l
        for code10, dist_label in uacs_map.items():
            dk = district_key(dist_label)
            if dk is None or code10 not in by_code9:
                continue
            loc = by_code9[code10]
            # find assignment's district number
            row = assignments.get(loc["code"])
            if row and row.get("leg_id"):
                cur = row["leg_id"].rsplit(":", 2)[0].rsplit(":", 1)[1] if False else row["leg_id"].split(":")[3]
                cur = 0 if cur == "lone" else int(cur)
                uacs_check["checked"] += 1
                # UACS is 2014: provinces may have had different district counts.
                # Only flag when jurisdiction matches AND count is comparable.
                if cur != dk:
                    uacs_check["disagree"].append({
                        "psgc": loc["code"], "name": loc["name"],
                        "uacs_2014": dist_label, "current": row["leg_id"],
                    })
                else:
                    uacs_check["agree"] += 1

    # ---- report ----
    types = Counter(r["assignment_type"] for r in assignments.values())
    report = {
        "total_municities_in_psgc": len(locs_mc),
        "assigned": dict(types),
        "multi_district_cities": multi_district_cities,
        "split_city_barangay_assignments": split_barangay_stats,
        "split_city_barangays_assigned": sum(x["assigned"] for x in split_barangay_stats.values()),
        "unmatched_bettergov_entries": unmatched_bg[:40],
        "unmatched_bettergov_count": len(unmatched_bg),
        "psgc_municities_missing_from_bettergov": [
            {"code": l["code"], "name": l["name"], "level": l["level"]} for l in missing
        ][:40],
        "missing_count": len(missing),
        "uacs_cross_check": {k: v for k, v in uacs_check.items() if k != "disagree"},
        "uacs_disagreements_sample": uacs_check["disagree"][:25],
        "uacs_disagreement_count": len(uacs_check["disagree"]),
    }
    DATA.mkdir(exist_ok=True)
    with (DATA / "psgc_leg_assignments.jsonl").open("w", encoding="utf-8") as f:
        for code in sorted(assignments):
            f.write(json.dumps(assignments[code], ensure_ascii=False) + "\n")
    (DATA / "assignment_report.json").write_text(
        json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    print(json.dumps({k: report[k] for k in
                      ("total_municities_in_psgc", "assigned", "missing_count",
                       "unmatched_bettergov_count", "uacs_cross_check")},
                     indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
