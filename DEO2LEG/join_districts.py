#!/usr/bin/env python3
"""
Shared district-name normalisation + representative join.

The source PDF uses DPWH's official district labels:
    CITY OF LAS PIÑAS (LONE DISTRICT)
    NORTH COTABATO (FIRST DISTRICT)
    LAPU-LAPU CITY (OPON) (LONE DISTRICT)

The congress.gov.ph roster uses seat labels:
    Las Piñas City, Lone District
    Cotabato, 1st District
    Lapu-Lapu City, Lone District

This module bridges the two forms.

CRITICAL: 'city' is a DISTINCTIVE token and must NOT be stripped. An earlier
version stripped it, which wrongly merged "Quezon City" (NCR, 6 districts)
with "Quezon" province (Region IV-A, 4 districts), and "Cebu City" with
"Cebu" province -- producing 14 bogus "ambiguous" matches.
"""

import re
import unicodedata
from collections import Counter, defaultdict

ORD_WORD_TO_NUM = {
    "FIRST": "1st", "SECOND": "2nd", "THIRD": "3rd", "FOURTH": "4th",
    "FIFTH": "5th", "SIXTH": "6th", "SEVENTH": "7th", "EIGHTH": "8th",
    "LONE": "Lone",
}
ORD_NUM_TO_WORD = {v.lower(): k.title() for k, v in ORD_WORD_TO_NUM.items()}
ORD_NUM_TO_WORD["lone"] = "Lone"

# Spanish-abbreviation expansions used by DPWH labels
ABBR_EXPAND = {
    "sta.": "santa",
    "sto.": "santo",
    "gral.": "general",
    "gen.": "general",
    "sgt.": "sergeant",
    "del.": "del",
}

# Explicit jurisdiction aliases: DPWH label -> roster jurisdiction.
# Only for forms that normalisation alone cannot resolve. Keep narrow and
# documented; every entry must be justified by an official source.
JURISDICTION_ALIASES = {
    # DPWH prints the pre-2019 name; the House seat is "Cotabato".
    "north cotabato": "cotabato",
    # congress.gov.ph spells most seats "X City" but drops "City" for these two
    # ("Manila, 1st District", "Butuan, Lone District"). Neither jurisdiction has
    # a same-named province, so the alias is unambiguous.
    "manila city": "manila",
    "butuan city": "butuan",
}

# Corrections to the official roster's OWN seat labels, where congress.gov.ph is
# internally inconsistent and an independent source resolves it.
# Key: (roster_canon_jurisdiction, roster_ordinal) -> corrected (jurisdiction, ordinal)
ROSTER_SEAT_CORRECTIONS = {
    # congress.gov.ph groups Kathryn Joyce Gorriceta under "Iloilo City,
    # 2nd District". But Iloilo City is a LONE district (Julienne Baronda), so a
    # 2nd Iloilo City seat cannot exist. The Wikipedia 20th Congress table places
    # Gorriceta at "Iloilo, 2nd" (province). The PDF's "ILOILO (SECOND DISTRICT)"
    # is therefore correct and the roster label is the error.
    ("iloilo city", "2nd"): {
        "jurisdiction": "iloilo",
        "ordinal": "2nd",
        "note": ("congress.gov.ph mislabels this seat 'Iloilo City, 2nd District'; "
                 "Iloilo City is a lone district. Corrected to Iloilo province 2nd "
                 "(Kathryn Joyce Gorriceta) per Wikipedia 20th Congress table."),
    },
}

# Whole-district overrides where boundaries changed between the PDF's vintage
# and the 20th Congress. Keyed by (dpwh_jurisdiction_canon, ordinal).
# NOTE: 'jurisdiction' values are passed through canon_jurisdiction() so they
# must be written in the SAME canonical form the roster index uses.
DISTRICT_OVERRIDES = {
    # Taguig was reapportioned. The PDF's "TAGUIG CITY (FIRST DISTRICT)"
    # corresponds to the seat officially titled "Taguig City-Pateros, Lone
    # District" (Pateros + eastern Taguig barangays).
    # Source: RA 8487 / congress.gov.ph 20th Congress directory.
    ("taguig city", "1st"): {
        "jurisdiction": "Taguig City-Pateros",
        "ordinal": "lone",
        "note": ("PDF 'TAGUIG CITY (FIRST DISTRICT)' = seat 'Taguig City-Pateros, "
                 "Lone District' (Pateros + eastern Taguig). Reapportionment form change."),
    },
}


def strip_accents(s):
    s = unicodedata.normalize("NFKD", s)
    return "".join(c for c in s if not unicodedata.combining(c))


def canon_jurisdiction(name):
    """
    Normalise a jurisdiction name for joining.

    Preserves 'city' as a distinctive token. Expands Spanish abbreviations.
    """
    s = strip_accents(name).lower().strip()
    for abbr, full in ABBR_EXPAND.items():
        s = s.replace(abbr, full)
    # 'CITY OF X' -> 'X city'
    m = re.match(r"^city of (.+)$", s)
    if m:
        s = m.group(1).strip() + " city"
    # Drop trailing parenthetical qualifiers like '(opon)'
    s = re.sub(r"\s*\([^)]*\)\s*$", "", s).strip()
    s = re.sub(r"[^a-z0-9 ]+", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return JURISDICTION_ALIASES.get(s, s)


DISTRICT_RE = re.compile(
    r"^(?P<jur>.*?)\s*\(\s*(?P<ord>FIRST|SECOND|THIRD|FOURTH|FIFTH|SIXTH|"
    r"SEVENTH|EIGHTH|LONE)\s+DISTRICT\s*\)\s*$",
    re.I,
)
DISTRICT_NOPAREN_RE = re.compile(
    r"^(?P<jur>.*?)\s+(?P<ord>FIRST|SECOND|THIRD|FOURTH|FIFTH|SIXTH|"
    r"SEVENTH|EIGHTH|LONE)\s+DISTRICT\s*$",
    re.I,
)


def parse_dpwh_district(label):
    """
    'CITY OF LAS PIÑAS (LONE DISTRICT)' -> {jurisdiction, ordinal, canonJurisdiction, displayName}

    Returns None when the label cannot be parsed.
    """
    raw = label.strip().lstrip("|").strip()
    for rx in (DISTRICT_RE, DISTRICT_NOPAREN_RE):
        m = rx.match(raw)
        if m:
            jur_raw = m.group("jur").strip()
            # Strip a trailing parenthetical qualifier on the jurisdiction,
            # e.g. 'LAPU-LAPU CITY (OPON)'
            jur_raw = re.sub(r"\s*\([^)]*\)\s*$", "", jur_raw).strip()
            ordinal = ORD_WORD_TO_NUM[m.group("ord").upper()]
            canon = canon_jurisdiction(jur_raw)
            override = DISTRICT_OVERRIDES.get((canon, ordinal.lower()))
            if override:
                # Canonicalise the override target so it is in the SAME form the
                # roster index keys use. Without this, 'Taguig City-Pateros'
                # would never match the index's 'taguig city pateros'.
                return {
                    "displayName": raw,
                    "jurisdiction": jur_raw,
                    "ordinal": ordinal,
                    "canonJurisdiction": canon_jurisdiction(override["jurisdiction"]),
                    "joinOrdinal": override["ordinal"],
                    "overrideNote": override["note"],
                }
            return {
                "displayName": raw,
                "jurisdiction": jur_raw,
                "ordinal": ordinal,
                "canonJurisdiction": canon,
                "joinOrdinal": ordinal.lower(),
                "overrideNote": None,
            }
    return None


def parse_roster_seat(seat):
    """'Taguig City, 2nd District' -> ('taguig city', '2nd')."""
    if "," not in seat:
        return canon_jurisdiction(seat), None
    jur, _, dist = seat.rpartition(", ")
    dist = re.sub(r"\s*District$", "", dist.strip(), flags=re.I).strip()
    return canon_jurisdiction(jur), dist.lower()


class RosterIndex:
    """Indexes the official House roster for representative lookup."""

    def __init__(self, entries):
        self.entries = entries
        self.by_seat = defaultdict(list)
        self.appliedCorrections = []
        for e in entries:
            if e.get("kind") != "District Representative":
                continue
            jur, ordinal = parse_roster_seat(e["seat"])
            key = (jur, ordinal)
            # Apply documented corrections to the roster's OWN seat labels where
            # congress.gov.ph is internally inconsistent (see ROSTER_SEAT_CORRECTIONS).
            corr = ROSTER_SEAT_CORRECTIONS.get(key)
            if corr:
                key = (canon_jurisdiction(corr["jurisdiction"]), corr["ordinal"])
                self.appliedCorrections.append({
                    "representative": e["representative"],
                    "originalSeat": e["seat"],
                    "correctedKey": key,
                    "note": corr["note"],
                })
                e = dict(e)
                e["seatCorrected"] = True
                e["originalSeat"] = e["seat"]
            self.by_seat[key].append(e)

    def find(self, canon_jur, join_ordinal):
        """
        Return (status, payload).

        status: 'unique' | 'ambiguous' | 'not_found'
        """
        hits = self.by_seat.get((canon_jur, join_ordinal), [])
        if len(hits) == 1:
            return "unique", hits[0]
        if len(hits) > 1:
            return "ambiguous", hits
        return "not_found", []

    def seat_count(self):
        return len(self.by_seat)


def report_join(pdf_rows, roster_index):
    """Join every distinct PDF district to the roster; return a diagnostic dict."""
    stats = Counter()
    problems = defaultdict(list)
    joins = {}

    seen = set()
    for r in pdf_rows:
        label = r["district"]
        if label in seen:
            continue
        seen.add(label)

        parsed = parse_dpwh_district(label)
        if parsed is None:
            stats["parse_fail"] += 1
            problems["parse_fail"].append(label)
            continue

        status, payload = roster_index.find(
            parsed["canonJurisdiction"], parsed["joinOrdinal"])
        stats[status] += 1

        if status == "unique":
            joins[label] = {
                "parsed": parsed,
                "representative": payload["representative"],
                "seat": payload["seat"],
                "leadershipRoles": payload.get("leadershipRoles", []),
            }
        elif status == "ambiguous":
            joins[label] = {
                "parsed": parsed,
                "representative": None,
                "candidates": [p["representative"] for p in payload],
                "seat": payload[0]["seat"],
            }
            problems["ambiguous"].append(
                (label, parsed["canonJurisdiction"], parsed["joinOrdinal"],
                 [p["representative"] for p in payload]))
        else:
            joins[label] = {"parsed": parsed, "representative": None, "candidates": []}
            problems["not_found"].append(
                (label, parsed["canonJurisdiction"], parsed["joinOrdinal"]))

    return {"stats": dict(stats), "problems": dict(problems), "joins": joins,
            "distinctDistricts": len(seen)}
