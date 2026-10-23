#!/usr/bin/env python3
"""
Build the DEO<->Legislative-District crosswalk (schema 2.1.0).

Outputs
-------
1. deo_leg_crosswalk.json        Clean, reusable mapping graph. NO amounts.
2. evidence/source_amounts.json  Every allocation row with amount + provenance.

Sources (all vendored under DEO2LEG/, all checked in for reproducible rebuilds)
-------------------------------------------------------------------------------
PRIMARY   DPWH_per_district_extracted.{csv,json}
          Complete transcription of "DPWH per district.pdf": 264 rows, 200 offices,
          254 districts, with a Region column the earlier subset lacked.
          Independently extracted; validated in validate_sources.py to reproduce
          all 106 numeric BetterGov rows exactly.

CODES     sources/dpwh-project-code-mapping@38fe1cf2.json
          Official DPWH project-code registry (182 DEO codes, 19 regions).
          Used ONLY for codes and legacy aliases -- never to infer relationships.

CORROBORATION  sources/deoLegRows@26b3f3f2.json
          BetterGov's 108-row subset. Retained purely as a cross-check.

ROSTER    sources/official_house_roster_2026-10-22.json
          congress.gov.ph 20th Congress directory. Representative names.

Run:  python DEO2LEG/build_mapping.py
"""

import csv
import json
import re
import unicodedata
from collections import Counter, defaultdict
from datetime import date
from pathlib import Path

from join_districts import (
    RosterIndex,
    canon_jurisdiction,
    parse_dpwh_district,
    parse_roster_seat,
)
from leg_profiles import ProfileIndex

HERE = Path(__file__).parent
SRC = HERE / "sources"

FULL_CSV = HERE / "DPWH_per_district_extracted.csv"
FULL_JSON = HERE / "DPWH_per_district_extracted.json"
PROJECT_CODE_REGISTRY = SRC / "dpwh-project-code-mapping@38fe1cf2.json"
BETTERGOV_ROWS = SRC / "deoLegRows@26b3f3f2.json"
OFFICIAL_ROSTER = SRC / "official_house_roster_2026-10-22.json"

RETRIEVED_DATE = "2026-10-22"
SCHEMA_VERSION = "2.1.0"


# ── identifiers ─────────────────────────────────────────────────────────────

def slug(text):
    """Accent-insensitive, ID-safe slug."""
    t = unicodedata.normalize("NFKD", text)
    t = "".join(c for c in t if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]+", "-", t.lower()).strip("-")


def office_id(name):
    return f"office:{slug(name)}"


def leg_id(jurisdiction, ordinal):
    return f"leg:{slug(jurisdiction)}:{slug(ordinal or 'lone')}"


def fold(text):
    """Accent-insensitive comparison key (does NOT collapse distinct names)."""
    t = unicodedata.normalize("NFKD", text)
    return "".join(c for c in t if not unicodedata.combining(c)).lower()


# ── legacy registry names ───────────────────────────────────────────────────
#
# 13 registry names do not appear in the allocation table. Auto-fuzzy-matching
# them is UNSAFE: substring matching wrongly links "Cotabato City DEO" to the
# *North* Cotabato offices and "Southern Leyte DEO" to *Leyte* offices. Each
# entry below is therefore hand-curated with an explicit status and rationale.
#
# status:
#   superseded_by_split  registry predates the office being split into N DEOs.
#                        'candidates' lists the plausible successors but the
#                        assignment is UNVERIFIED -- no relationship is created.
#   renamed_province     province itself was renamed by law.
#   spelling_variant     same office, different spelling. Safe alias.
#   numbering_variant    table drops the ordinal for the first-numbered office.
#   registry_only        office absent from the allocation table entirely.

LEGACY_REGISTRY_ENTRIES = {
    "Cavite DEO": {
        "status": "superseded_by_split",
        "candidates": ["Cavite 1st DEO", "Cavite 2nd DEO", "Cavite 3rd DEO"],
        "note": "Registry holds a single undivided Cavite office; the table shows three.",
    },
    "Cavite Sub DEO": {
        "status": "superseded_by_split",
        "candidates": ["Cavite 1st DEO", "Cavite 2nd DEO", "Cavite 3rd DEO"],
        "note": "Legacy 'Sub DEO' designation; no counterpart in the allocation table.",
    },
    "Compostela Valley DEO": {
        "status": "renamed_province",
        "candidates": ["Davao de Oro 1st DEO", "Davao de Oro 2nd DEO"],
        "note": "Compostela Valley was renamed Davao de Oro (RA 11297, 2019) and the "
                "table shows two successor offices. Which one inherits the old code is unverified.",
        "law": "RA 11297",
    },
    "Cotabato City DEO": {
        "status": "registry_only",
        "candidates": [],
        "note": "Cotabato City is a BARMM city and appears nowhere in the allocation table. "
                "NOT the same as the North Cotabato (Region XII) offices -- do not conflate.",
    },
    "Davao del Sur 1st DEO": {
        "status": "superseded_by_split",
        "candidates": ["Davao del Sur DEO", "Davao Occidental DEO"],
        "note": "Davao Occidental was carved out of Davao del Sur (RA 10360); the table "
                "shows one consolidated Davao del Sur DEO plus a separate Davao Occidental DEO.",
        "law": "RA 10360",
    },
    "Davao del Sur 2nd DEO": {
        "status": "superseded_by_split",
        "candidates": ["Davao del Sur DEO", "Davao Occidental DEO"],
        "note": "As above; successor assignment unverified.",
        "law": "RA 10360",
    },
    "Dinagat Island DEO": {
        "status": "spelling_variant",
        "candidates": ["Dinagat Islands DEO"],
        "note": "Singular/plural spelling variant of the same office.",
    },
    "Mt. Province DEO": {
        "status": "superseded_by_split",
        "candidates": ["Mountain Province 1st DEO", "Mountain Province 2nd DEO"],
        "note": "'Mt.' abbreviation plus a pre-split single office; the table shows two.",
    },
    "Sorsogon 1st DEO": {
        "status": "numbering_variant",
        "candidates": ["Sorsogon DEO"],
        "note": "Table names the first office 'Sorsogon DEO' and numbers only the second "
                "('Sorsogon 2nd DEO'). Inferred equivalent; treat as provisional.",
    },
    "South Cotabato DEO": {
        "status": "superseded_by_split",
        "candidates": ["South Cotabato 1st DEO", "South Cotabato 2nd DEO"],
        "note": "Undivided legacy office; the table shows two successors.",
    },
    "Southern Leyte DEO": {
        "status": "superseded_by_split",
        "candidates": ["Southern Leyte 1st DEO", "Southern Leyte 2nd DEO"],
        "note": "Undivided legacy office; the table shows two successors. "
                "NOT related to the Leyte 1st-5th DEOs.",
    },
    "Tarlac 1st DEO": {
        "status": "numbering_variant",
        "candidates": ["Tarlac DEO"],
        "note": "Table names the first office 'Tarlac DEO' and numbers only the second "
                "('Tarlac 2nd DEO'). Inferred equivalent; treat as provisional.",
    },
    "Zamboanga City DEO": {
        "status": "superseded_by_split",
        "candidates": ["Zamboanga City 1st DEO", "Zamboanga City 2nd DEO"],
        "note": "Undivided legacy office; the table shows two successors.",
    },
}

# Offices whose registry code may be attached as an alias (safe, exact-after-folding).
OFFICE_TYPE_OVERRIDES = {
    # BARMM rows in the table are a regional grouping, not a single engineering office.
    "BARMM": "regional_group",
    # Explicitly a sub-office in the source.
    "Camarines Norte Sub-DEO": "sub_district_engineering_office",
}


# ── source loading ──────────────────────────────────────────────────────────

def load_full_table():
    """Load the complete 264-row allocation table (CSV is authoritative)."""
    rows = []
    with open(FULL_CSV, newline="", encoding="utf-8-sig") as f:
        for i, r in enumerate(csv.DictReader(f), start=1):
            amt = r["Amount (PHP '000)"].strip()
            rows.append({
                "sourceRow": i,
                "region": r["Region"].strip(),
                "officeName": r["DEO"].strip(),
                "districtLabel": r["Legislative District"].strip(),
                "amountThousandsPHP": None if amt in ("-", "—", "") else int(amt.replace(",", "")),
                "dashInSource": amt in ("-", "—"),
                "sourcePage": int(r["Source Page"]),
                "rowOnPage": int(r["Row on Page"]),
            })
    return rows


def load_registry():
    """name -> {regionCode, projectCode, regionName}"""
    reg = json.loads(PROJECT_CODE_REGISTRY.read_text(encoding="utf-8"))
    out = {}
    for region_code, rv in reg.items():
        for project_code, name in rv["districts"].items():
            out[name] = {
                "regionCode": region_code,
                "projectCode": project_code,
                "regionName": rv.get("region_name", ""),
            }
    return out


def match_registry(registry, office_name):
    """
    Strict accent-insensitive EXACT match only.

    Deliberately rejects substring matching, which produced false positives such
    as 'South Cotabato 1st DEO' -> 'Cotabato 1st DEO' (different provinces).
    """
    key = fold(office_name)
    hits = [n for n in registry if fold(n) == key]
    if len(hits) == 1:
        return hits[0]
    return None


# ── build offices ───────────────────────────────────────────────────────────

def build_offices(rows, registry):
    office_to_districts = defaultdict(list)
    office_region = {}
    for r in rows:
        office_to_districts[r["officeName"]].append(r["districtLabel"])
        office_region.setdefault(r["officeName"], r["region"])

    offices = {}
    registry_matched = {}

    for name in sorted(office_to_districts):
        labels = office_to_districts[name]
        parsed = [parse_dpwh_district(l) for l in labels]
        district_ids = []
        for p in parsed:
            if p is None:
                continue
            lid = leg_id(p["canonJurisdiction"], p["joinOrdinal"])
            if lid not in district_ids:
                district_ids.append(lid)

        reg_name = match_registry(registry, name)
        reg_meta = registry.get(reg_name) if reg_name else None
        if reg_meta:
            registry_matched[name] = reg_name

        aliases = [name]
        if reg_name and reg_name != name:
            aliases.append(reg_name)

        offices[office_id(name)] = {
            "name": name,
            "type": OFFICE_TYPE_OVERRIDES.get(name, "district_engineering_office"),
            "region": office_region[name],
            "legislativeDistrictIds": district_ids,
            "regionCode": reg_meta["regionCode"] if reg_meta else None,
            "projectCode": reg_meta["projectCode"] if reg_meta else None,
            "aliases": aliases,
            "evidence": {
                "inAllocationTable": True,
                "allocationTableRowCount": len(labels),
                "registryMatch": reg_name,
                "registryMatchType": "exact_accent_insensitive" if reg_name else None,
            },
        }

    # Legacy registry-only names: recorded, flagged, and never used to create
    # relationships. Attaching their project codes to current offices would
    # assert an unverified succession.
    legacy_added = 0
    for reg_name in sorted(registry):
        if reg_name in registry_matched.values() or reg_name in registry_matched:
            continue
        meta = registry[reg_name]
        legacy = LEGACY_REGISTRY_ENTRIES.get(reg_name, {
            "status": "registry_only",
            "candidates": [],
            "note": "No curated explanation recorded; treated as registry-only.",
        })
        oid = office_id(reg_name)
        if oid in offices:
            continue
        offices[oid] = {
            "name": reg_name,
            "type": "district_engineering_office",
            "region": meta["regionName"],
            "legislativeDistrictIds": [],
            "regionCode": meta["regionCode"],
            "projectCode": meta["projectCode"],
            "aliases": [reg_name],
            "legacy": {
                "status": legacy["status"],
                "candidateSuccessors": legacy["candidates"],
                "note": legacy["note"],
                **({"law": legacy["law"]} if "law" in legacy else {}),
            },
            "evidence": {
                "inAllocationTable": False,
                "registryMatch": reg_name,
                "registryMatchType": "exact",
            },
        }
        legacy_added += 1

    return offices, legacy_added


# ── build districts ─────────────────────────────────────────────────────────

def build_districts(rows, offices, roster_index, profile_index=None):
    """One node per distinct district, keyed on the canonical roster identity."""
    by_key = {}
    for r in rows:
        p = parse_dpwh_district(r["districtLabel"])
        if p is None:
            continue
        key = (p["canonJurisdiction"], p["joinOrdinal"])
        by_key.setdefault(key, {
            "parsed": p,
            "labels": [],
            "region": r["region"],
            "offices": [],
        })
        if r["districtLabel"] not in by_key[key]["labels"]:
            by_key[key]["labels"].append(r["districtLabel"])

    districts = {}
    unresolved = []
    corrections_applied = []
    profile_stats = Counter()

    def attach_profile(rep):
        """
        Enrich a representative block with scraped profile data.

        Joins on the exact (seat, name) pair. Never joins on name alone: several
        members share a name across a party-list and a district seat (Mendoza is
        party-list TUCP, not Southern Leyte 1st).
        """
        if profile_index is None or not profile_index.available():
            return
        seat, name = rep.get("officialSeat"), rep.get("name")
        if not seat or not name:
            # Ambiguous or unresolved seats carry no single name to join on.
            profile_stats["skipped_no_single_name"] += 1
            return
        prof = profile_index.find(seat, name)
        if prof is None:
            profile_stats["no_profile_found"] += 1
            rep["profile"] = None
            rep["profileNote"] = (
                "No scraped profile matched this (seat, name) pair. Does not imply "
                "the member has no profile.")
            return
        rep["profile"] = profile_index.describe(prof)
        profile_stats["matched"] += 1

    for (canon_jur, ordinal), info in sorted(by_key.items()):
        p = info["parsed"]
        lid = leg_id(canon_jur, ordinal)
        status, payload = roster_index.find(canon_jur, ordinal)

        if status == "unique":
            rep = {
                "name": payload["representative"],
                "officialSeat": payload["seat"],
                "leadershipRoles": payload.get("leadershipRoles", []),
                # Confirmed against the official directory. NOT independent verification:
                # the roster and the scraped profiles both read congress.gov.ph, so a
                # site error would appear in both. See leg_profiles.py docstring.
                "verifiedAgainstOfficialDirectory": True,
                "verificationSource": "congress.gov.ph/house-members",
                "verifiedDate": RETRIEVED_DATE,
                "resolutionStatus": "resolved",
            }
            if payload.get("seatCorrected"):
                rep["seatCorrectionNote"] = (
                    f"congress.gov.ph lists this seat as '{payload['originalSeat']}'; "
                    "corrected -- see ROSTER_SEAT_CORRECTIONS in join_districts.py")
                corrections_applied.append(rep["seatCorrectionNote"])
            if p["overrideNote"]:
                rep["districtOverrideNote"] = p["overrideNote"]
            attach_profile(rep)
        elif status == "ambiguous":
            names = [e["representative"] for e in payload]
            rep = {
                "name": None,
                "officialSeat": payload[0]["seat"],
                "candidates": names,
                "verifiedAgainstOfficialDirectory": False,
                "verificationSource": "congress.gov.ph/house-members",
                "verifiedDate": RETRIEVED_DATE,
                "resolutionStatus": "ambiguous_multiple_listed",
                "note": (
                    "congress.gov.ph lists more than one representative for this seat "
                    "(succession or election protest). Left unresolved deliberately -- "
                    "picking one would assert an outcome this dataset cannot verify."),
            }
            # Attach a profile per candidate rather than choosing one.
            if profile_index is not None and profile_index.available():
                seat = payload[0]["seat"]
                cand_profiles = []
                for cand in names:
                    prof = profile_index.find(seat, cand)
                    cand_profiles.append({
                        "name": cand,
                        **(profile_index.describe(prof) if prof else {"profile": None}),
                    })
                rep["candidateProfiles"] = cand_profiles
                profile_stats["ambiguous_with_candidate_profiles"] += 1
            unresolved.append({"districtId": lid, "seat": payload[0]["seat"],
                               "candidates": names, "reason": "multiple_reps_listed"})
        else:
            rep = {
                "name": None,
                "officialSeat": None,
                "verifiedAgainstOfficialDirectory": False,
                "verificationSource": None,
                "verifiedDate": None,
                "resolutionStatus": "not_found_in_roster",
                "note": "District present in the allocation table but not matched in the "
                        "official roster. Does NOT imply the seat is vacant.",
            }
            unresolved.append({"districtId": lid, "seat": p["displayName"],
                               "candidates": [], "reason": "not_found_in_roster"})

        # Reverse links from offices
        office_ids = [oid for oid, o in offices.items()
                      if lid in o.get("legislativeDistrictIds", [])]

        districts[lid] = {
            "jurisdiction": p["jurisdiction"],
            "canonicalJurisdiction": canon_jur,
            "districtLabel": ordinal,
            "displayName": p["displayName"],
            "sourceLabels": info["labels"],
            "region": info["region"],
            "representative": rep,
            "officeIds": sorted(office_ids),
        }

    return districts, unresolved, corrections_applied, dict(profile_stats)


# ── build relationships ─────────────────────────────────────────────────────

def build_relationships(rows, offices, districts):
    """One relationship per allocation-table row. No amounts -- those go to evidence."""
    rels = []
    seen = set()
    for r in rows:
        p = parse_dpwh_district(r["districtLabel"])
        if p is None:
            continue
        oid = office_id(r["officeName"])
        lid = leg_id(p["canonJurisdiction"], p["joinOrdinal"])
        key = (oid, lid)
        if key in seen:
            continue
        seen.add(key)
        rels.append({
            "officeId": oid,
            "legislativeDistrictId": lid,
            "region": r["region"],
            "evidence": [{
                "type": "allocation_table_row",
                "sourceRow": r["sourceRow"],
                "sourcePage": r["sourcePage"],
                "underlyingDocumentFiscalYear": None,
                "note": "Undated budget allocation row. Establishes only that the source "
                        "table linked this office to this district -- NOT geographic "
                        "boundaries, project ownership, or legislative sponsorship.",
            }],
        })
    return rels


# ── corroboration against BetterGov subset ─────────────────────────────────

def corroborate_against_bettergov(rows):
    """Verify every BetterGov numeric row appears in the full table with the same amount."""
    if not BETTERGOV_ROWS.exists():
        return {"available": False}
    bg = json.loads(BETTERGOV_ROWS.read_text(encoding="utf-8"))["rows"]

    full_by_amount = defaultdict(list)
    for r in rows:
        if r["amountThousandsPHP"] is not None:
            full_by_amount[r["amountThousandsPHP"]].append(r)

    matched = unmatched = dashes = 0
    unmatched_rows = []
    for b in bg:
        if isinstance(b, dict):
            office, leg, amount = b.get("office", ""), b.get("leg", ""), b.get("amount", 0)
        else:
            office, leg, amount = b[0], b[1], (b[2] if len(b) > 2 else 0)
        if not amount:
            dashes += 1
            continue
        hits = [r for r in full_by_amount.get(amount, []) if fold(r["officeName"]) == fold(office)]
        if hits:
            matched += 1
        else:
            unmatched += 1
            unmatched_rows.append({"office": office, "leg": leg, "amount": amount})

    return {
        "available": True,
        "betterGovRows": len(bg),
        "numericRowsMatchedOnOfficeAndAmount": matched,
        "dashRows": dashes,
        "unmatched": unmatched,
        "unmatchedRows": unmatched_rows,
    }


# ── main mapping ────────────────────────────────────────────────────────────

def build_clean_mapping():
    rows = load_full_table()
    registry = load_registry()
    roster = json.loads(OFFICIAL_ROSTER.read_text(encoding="utf-8"))
    roster_index = RosterIndex(roster)

    # Optional: scraped member profiles (member_code, detail_url, photo).
    profile_index = ProfileIndex()
    if not profile_index.available():
        print("note: legislative_profiles/profiles.json absent -- skipping profile enrichment")
        profile_index = None

    offices, legacy_added = build_offices(rows, registry)
    districts, unresolved, corrections, profile_stats = build_districts(
        rows, offices, roster_index, profile_index)
    relationships = build_relationships(rows, offices, districts)
    corroboration = corroborate_against_bettergov(rows)

    table_offices = {r["officeName"] for r in rows}
    table_districts = {r["districtLabel"] for r in rows}
    multi_office_districts = {
        lid: d["officeIds"] for lid, d in districts.items() if len(d["officeIds"]) > 1
    }
    multi_district_offices = {
        oid: o["legislativeDistrictIds"] for oid, o in offices.items()
        if len(o.get("legislativeDistrictIds", [])) > 1
    }

    mapping = {
        "schemaVersion": SCHEMA_VERSION,
        "buildDate": date.today().isoformat(),
        "status": "complete_table_provisional_verification",
        "description": (
            "A general-purpose many-to-many mapping connecting DPWH District Engineering "
            "Offices (DEOs) to Philippine legislative districts (LEGs) for reuse across "
            "projects, tools and dashboards. Contains no monetary amounts; those live in "
            "evidence/source_amounts.json. Does NOT assign projects, allocate budgets, or "
            "establish legislative representation."
        ),
        "breakingChangesFrom_1_0_0": [
            "Primary source is now the COMPLETE 264-row allocation table, not BetterGov's "
            "108-row multi-link subset. Coverage rises from 108 to 264 rows.",
            "District node ids are keyed on the canonical official-roster jurisdiction "
            "(e.g. leg:cotabato:1st, not leg:north-cotabato:1st), so some ids changed.",
            "Offices gained a 'region' field from the table's Region column.",
            "Legacy registry-only offices are now flagged with a 'legacy' block instead of "
            "being silently emitted as unlinked offices.",
            "Representative lookups now surface ambiguity explicitly rather than picking one.",
        ],
        "metadata": {
            "completeness": (
                "Covers every row of the source allocation table (264 rows, 200 offices, "
                "254 distinct districts). Missing DEO-district pairs do NOT imply absence of "
                "a real-world relationship; they only mean the table did not record one."
            ),
            "relationshipMeaning": (
                "Each relationship records that the source allocation table linked an office "
                "to a legislative district. It does NOT prove geographic boundaries, project "
                "ownership, legislative sponsorship, or current validity."
            ),
            "manyToManyEvidence": {
                "districtsServedByMultipleOffices": len(multi_office_districts),
                "officesSpanningMultipleDistricts": len(multi_district_offices),
                "note": (
                    "The mapping is genuinely many-to-many. Examples of districts served by "
                    "more than one office: Manila 6th (North + South Manila DEO), Mountain "
                    "Province Lone (1st + 2nd DEO), Basilan Lone (BARMM + Isabela City DEO). "
                    "Examples of offices spanning several districts: Bulacan 1st DEO (1st, 2nd, "
                    "5th), Cavite 1st DEO (1st, 3rd, 6th, 7th)."
                ),
            },
            "sources": {
                "allocationTable": {
                    "role": "PRIMARY",
                    "file": "DPWH_per_district_extracted.csv / .json",
                    "underlyingDocument": (
                        "DPWH per district.pdf -- 9-page scanned allocation schedule "
                        "(PCIJ-sourced; fiscal year NOT stated in the document)"
                    ),
                    "rowCount": len(rows),
                    "extractionNote": (
                        "Independently transcribed from the scan. Validated against BetterGov's "
                        "separate 108-row transcription: all 106 numeric rows reproduce exactly "
                        "(see validate_sources.py). A third, independent local OCR pass disagreed "
                        "on 8 amounts; every disagreement traced to a leading-digit OCR error in "
                        "the local pass (1 misread as 4), confirming this extraction."
                    ),
                    "retrievedDate": RETRIEVED_DATE,
                },
                "betterGovSubset": {
                    "role": "CORROBORATION",
                    "repository": "bettergovph/open-data-visualization",
                    "commitSha": "7d8700fe9627d496794aba38478e4ea0649af51f",
                    "file": "static/nep-preview/congress.html",
                    "gitBlobSha": "26b3f3f25370b5d5ed19d63a096b6e48282d193c",
                    "vendorFile": "sources/deoLegRows@26b3f3f2.json",
                    "rowCount": 108,
                    "note": (
                        "BetterGov transcribed only the multi-link subset of the same scan "
                        "(29.8% of its total allocation value). Used here solely to corroborate "
                        "the primary extraction, never as a mapping source."
                    ),
                },
                "projectCodeRegistry": {
                    "role": "CODES_AND_ALIASES_ONLY",
                    "repository": "bettergovph/open-data-visualization",
                    "file": "database/dpwh-project-code-mapping.json",
                    "gitBlobSha": "38fe1cf25f9d9e2dfb9f0eafa9b2ce5ee5056f43",
                    "vendorFile": "sources/dpwh-project-code-mapping@38fe1cf2.json",
                    "registryOfficeCount": len(registry),
                    "note": (
                        "Official DPWH project-code to DEO-name mapping (19 regions). Vintage "
                        "predates several office splits and contains no BARMM entries. Matched "
                        "to the allocation table by accent-insensitive EXACT name only; "
                        "substring matching was rejected because it produced false positives "
                        "(e.g. 'South Cotabato 1st DEO' -> 'Cotabato 1st DEO'). "
                        "Legacy names are flagged, never used to create relationships."
                    ),
                },
                "representativeRoster": {
                    "role": "REPRESENTATIVE_NAMES",
                    "source": "congress.gov.ph/house-members (official 20th Congress directory)",
                    "retrievedDate": RETRIEVED_DATE,
                    "vendorFile": "sources/official_house_roster_2026-10-22.json",
                    "districtEntries": sum(
                        1 for e in roster if e.get("kind") == "District Representative"),
                    "uniqueDistrictSeats": len({
                        e["seat"] for e in roster
                        if e.get("kind") == "District Representative"}),
                    "partyListEntries": sum(
                        1 for e in roster if e.get("kind") == "Party-list Representative"),
                    "extractionNote": (
                        "Rebuilt by build_official_roster.py from the directory's STRUCTURED "
                        "MEMBER TABLE ('| Name | District | Seat |', repeated 3x in the dump), "
                        "which is authoritative for (name, kind, seat). Leadership roles are "
                        "taken from the prose headings and one table name suffix. Two earlier "
                        "extractions parsed the prose for seats and were both wrong: v1 dropped "
                        "seats carrying a leadership-role prefix (losing Isabela 6th); v2 searched "
                        "a fixed character window ahead of each heading, so the one heading with no "
                        "seat line of its own borrowed the NEXT member's seat and fabricated a "
                        "second representative for Southern Leyte 1st. Both defects are gone and "
                        "asserted against in the builder."
                    ),
                    "knownRosterDefects": [
                        "congress.gov.ph mislabels Iloilo province 2nd district as "
                        "'Iloilo City, 2nd District' (Kathryn Joyce Gorriceta). Iloilo City is a "
                        "lone district, so a 2nd Iloilo City seat cannot exist. Corrected here; "
                        "see ROSTER_SEAT_CORRECTIONS in join_districts.py.",
                        "Two seats list two representatives each (Antipolo City 2nd: Acop, Philip "
                        "Conrad 'Dok Bong' M. / Acop, Romeo M.; Cavite 4th: Austria-Barzaga, "
                        "Jennifer / Barzaga, Francisco 'Kiko' A.). Left unresolved rather than "
                        "guessed, and both candidates' profiles are attached for each.",
                        "A third seat appeared ambiguous only because of the v2 prose-parser defect "
                        "described above. Southern Leyte 1st has a single representative, Mercado, "
                        "Roger Gaviola. The name previously attached to it, Mendoza, Raymond "
                        "Democrito C., is a TUCP party-list member holding no district.",
                        "Counts are internal to this scrape and not reconciled against any stated "
                        "House total: the dump itself declares no member count. 324 distinct "
                        "people = 256 district entries spanning 254 unique seats + 68 party-list.",
                    ],
                },
                "legislativeProfiles": {
                    "role": "PROFILE_ENRICHMENT",
                    "source": "congress.gov.ph/house-members (scraped member directory + portraits)",
                    "retrievedDate": RETRIEVED_DATE,
                    "vendorFile": "legislative_profiles/profiles.json",
                    "photoDir": "legislative_profiles/photos/",
                    "enabled": profile_index is not None,
                    "joinNote": (
                        "Adds member_code, detail_url and a locally scraped portrait per "
                        "representative. Joined on the exact (seat, name) pair with whitespace "
                        "normalised -- never on name alone, because the same name can appear on a "
                        "party-list seat and a district seat. Ambiguous seats receive one profile "
                        "per candidate rather than a single chosen rep. Party-list members are "
                        "present in the scrape but are out of scope for this district crosswalk."
                    ),
                },
                "statutoryReferences": [
                    {"law": "RA 11080 (2018)", "effect": "Reapportioned Isabela into six districts"},
                    {"law": "RA 11297 (2019)", "effect": "Renamed Compostela Valley to Davao de Oro"},
                    {"law": "RA 10360 (2013)", "effect": "Created Davao Occidental from Davao del Sur"},
                    {"law": "RA 8487 (1998)", "effect": "Taguig-Pateros districting"},
                ],
            },
            "warnings": [
                "The underlying scan states NO fiscal year. Amounts must not be assumed to be "
                "FY2027 or any other year.",
                "Allocation rows do not establish project attribution or sponsorship.",
                "BARMM appears as an office-like label but is a regional grouping, not a single "
                "engineering office.",
                "Legacy registry offices carry project codes but zero districts by design.",
                "65 rows show a DEO ordinal differing from the district ordinal (e.g. Pangasinan "
                "4th DEO serves PANGASINAN (THIRD DISTRICT)). This is genuine in the source, "
                "not an error, but means office numbers cannot be used to infer districts.",
            ],
        },
        "summary": {
            "totalOffices": len(offices),
            "officesFromAllocationTable": len(table_offices),
            "legacyRegistryOnlyOffices": legacy_added,
            "totalLegislativeDistricts": len(districts),
            "distinctDistrictLabelsInTable": len(table_districts),
            "totalRelationships": len(relationships),
            "fullyLinkedOffices": sum(
                1 for o in offices.values() if o.get("legislativeDistrictIds")),
            "unlinkedOffices": sum(
                1 for o in offices.values() if not o.get("legislativeDistrictIds")),
            "representativesResolved": sum(
                1 for d in districts.values()
                if d["representative"]["resolutionStatus"] == "resolved"),
            "representativesAmbiguous": sum(
                1 for d in districts.values()
                if d["representative"]["resolutionStatus"] == "ambiguous_multiple_listed"),
            "representativesNotFound": sum(
                1 for d in districts.values()
                if d["representative"]["resolutionStatus"] == "not_found_in_roster"),
            "districtsServedByMultipleOffices": len(multi_office_districts),
            "officesSpanningMultipleDistricts": len(multi_district_offices),
            "totalAllocationThousandsPHP": sum(
                r["amountThousandsPHP"] for r in rows if r["amountThousandsPHP"] is not None),
            "dashRows": sum(1 for r in rows if r["dashInSource"]),
            # Scraped-profile enrichment coverage (member_code, detail_url, photo).
            "representativesWithProfile": sum(
                1 for d in districts.values() if d["representative"].get("profile")),
            "representativesWithoutProfile": sum(
                1 for d in districts.values()
                if d["representative"]["resolutionStatus"] == "resolved"
                and not d["representative"].get("profile")),
            "ambiguousSeatsWithCandidateProfiles": profile_stats.get(
                "ambiguous_with_candidate_profiles", 0),
        },
        "validation": {
            "betterGovCorroboration": corroboration,
            "unresolvedRepresentatives": unresolved,
            "rosterSeatCorrectionsApplied": corrections,
            "profileEnrichment": {
                "enabled": profile_index is not None,
                "joinKey": "(officialSeat, representative name), whitespace-normalised",
                "stats": profile_stats,
                **({"sourceStats": profile_index.stats()} if profile_index else {}),
            },
            "registryLegacyStatusCounts": dict(Counter(
                o["legacy"]["status"] for o in offices.values() if "legacy" in o)),
        },
        "offices": offices,
        "legislativeDistricts": districts,
        "relationships": relationships,
    }

    out = HERE / "deo_leg_crosswalk.json"
    out.write_text(json.dumps(mapping, ensure_ascii=False, indent=2), encoding="utf-8")
    return mapping, rows


# ── evidence sidecar ────────────────────────────────────────────────────────

def build_evidence_sidecar(rows):
    """All 264 allocation rows with amounts. Isolated from the mapping graph."""
    out_rows = []
    for r in rows:
        amt = r["amountThousandsPHP"]
        out_rows.append({
            "sourceRow": r["sourceRow"],
            "sourcePage": r["sourcePage"],
            "rowOnPage": r["rowOnPage"],
            "region": r["region"],
            "officeName": r["officeName"],
            "legislativeDistrictLabel": r["districtLabel"],
            "amountThousandsPHP": amt,
            "dashInSource": r["dashInSource"],
            "millionPesoDisplay": f"{amt / 1000:,.1f}M" if amt is not None else "-",
            "notes": ("Null amount = dash in the source scan, NOT a confirmed zero allocation."
                      if r["dashInSource"] else None),
        })

    by_region = defaultdict(lambda: {"rows": 0, "thousandsPHP": 0})
    for r in rows:
        e = by_region[r["region"]]
        e["rows"] += 1
        if r["amountThousandsPHP"] is not None:
            e["thousandsPHP"] += r["amountThousandsPHP"]

    sidecar = {
        "schemaVersion": SCHEMA_VERSION,
        "buildDate": date.today().isoformat(),
        "description": (
            "Allocation-table evidence sidecar. Holds every transcribed amount from the "
            "undated 'DPWH per district.pdf', with page/row provenance and an audit trail. "
            "Kept separate from deo_leg_crosswalk.json so the mapping graph stays free of "
            "transient fiscal values. These amounts must NEVER be read as project "
            "attribution or as current budget allocations."
        ),
        "amountUnit": "thousand_PHP (null = dash in source; NOT a confirmed zero allocation)",
        "underlyingDocument": {
            "file": "DPWH per district.pdf",
            "pages": 9,
            "provenance": "PCIJ-sourced scan provided by BetterGov",
            "fiscalYear": None,
            "fiscalYearNote": "The document states no fiscal year. Do not assume one.",
        },
        "extractionProvenance": {
            "primary": "DPWH_per_district_extracted.csv (independent transcription)",
            "corroboratedBy": "BetterGov deoLegRows 108-row subset -- all 106 numeric rows match",
            "crossCheckedAgainst": "a third local OCR pass; all 8 disagreements were OCR errors "
                                   "in the local pass (leading 1 misread as 4)",
            "validator": "DEO2LEG/validate_sources.py",
        },
        "summary": {
            "totalRows": len(out_rows),
            "nonDashRows": sum(1 for r in out_rows if r["amountThousandsPHP"] is not None),
            "dashRows": sum(1 for r in out_rows if r["dashInSource"]),
            "totalThousandsPHP": sum(
                r["amountThousandsPHP"] for r in out_rows if r["amountThousandsPHP"] is not None),
            "distinctOffices": len({r["officeName"] for r in out_rows}),
            "distinctDistrictLabels": len({r["legislativeDistrictLabel"] for r in out_rows}),
        },
        "totalsByRegion": {k: v for k, v in sorted(by_region.items())},
        "rows": out_rows,
    }

    evidence_dir = HERE / "evidence"
    evidence_dir.mkdir(exist_ok=True)
    out = evidence_dir / "source_amounts.json"
    out.write_text(json.dumps(sidecar, ensure_ascii=False, indent=2), encoding="utf-8")
    return sidecar


def main():
    mapping, rows = build_clean_mapping()
    sidecar = build_evidence_sidecar(rows)

    s = mapping["summary"]
    v = mapping["validation"]
    print(f"schema {mapping['schemaVersion']}  status {mapping['status']}")
    print(f"\nrows in table      : {len(rows)}")
    print(f"offices            : {s['totalOffices']} "
          f"({s['officesFromAllocationTable']} in table + {s['legacyRegistryOnlyOffices']} legacy)")
    print(f"districts          : {s['totalLegislativeDistricts']} "
          f"(from {s['distinctDistrictLabelsInTable']} distinct labels)")
    print(f"relationships      : {s['totalRelationships']}")
    print(f"  linked offices   : {s['fullyLinkedOffices']}  unlinked: {s['unlinkedOffices']}")
    print(f"representatives    : {s['representativesResolved']} resolved, "
          f"{s['representativesAmbiguous']} ambiguous, {s['representativesNotFound']} not found")
    print(f"many-to-many       : {s['districtsServedByMultipleOffices']} districts w/ >1 office, "
          f"{s['officesSpanningMultipleDistricts']} offices w/ >1 district")
    print(f"total allocation   : Php {s['totalAllocationThousandsPHP'] / 1e6:,.2f}B "
          f"({s['dashRows']} dash rows)")

    bg = v["betterGovCorroboration"]
    if bg.get("available"):
        print(f"\nBetterGov corroboration: {bg['numericRowsMatchedOnOfficeAndAmount']} matched, "
              f"{bg['unmatched']} unmatched, {bg['dashRows']} dash rows")
        assert bg["unmatched"] == 0, "BetterGov rows failed to corroborate"

    print(f"legacy registry statuses: {v['registryLegacyStatusCounts']}")
    if v["rosterSeatCorrectionsApplied"]:
        print(f"roster corrections applied: {len(v['rosterSeatCorrectionsApplied'])}")
    for u in v["unresolvedRepresentatives"]:
        print(f"  UNRESOLVED {u['districtId']}: {u['reason']} {u['candidates']}")

    pe = v["profileEnrichment"]
    if pe["enabled"]:
        ss = pe["sourceStats"]
        print(f"\nprofile enrichment : {s['representativesWithProfile']}/"
              f"{s['representativesResolved']} resolved districts matched")
        print(f"  scrape totals    : {ss['totalProfiles']} profiles "
              f"({ss['districtProfiles']} district, {ss['partyListProfiles']} party-list), "
              f"{ss['uniqueMemberCodes']} unique member codes")
        print(f"  photos           : {ss['photosPresentLocally']} present, "
              f"{ss['photosMissing']} missing")
        print(f"  ambiguous seats w/ per-candidate profiles: "
              f"{s['ambiguousSeatsWithCandidateProfiles']}")
        if pe["stats"].get("no_profile_found"):
            print(f"  WARNING {pe['stats']['no_profile_found']} resolved reps had NO profile match")
        assert s["representativesWithoutProfile"] == 0, \
            "resolved districts lacking profile data"
        assert ss["photosMissing"] == 0, "scraped profiles missing local photos"
    else:
        print("\nprofile enrichment : disabled (legislative_profiles/profiles.json absent)")

    print(f"\nevidence sidecar   : {sidecar['summary']['totalRows']} rows, "
          f"Php {sidecar['summary']['totalThousandsPHP'] / 1e6:,.2f}B")
    print("wrote deo_leg_crosswalk.json and evidence/source_amounts.json")


if __name__ == "__main__":
    main()
