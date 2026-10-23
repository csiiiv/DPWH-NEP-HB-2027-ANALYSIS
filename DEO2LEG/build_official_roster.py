#!/usr/bin/env python3
"""
Build the official House roster from the congress.gov.ph directory dump.

Input : sources/house_members_dump_2026-10-22.txt (vendored text dump of
        https://www.congress.gov.ph/house-members, retrieved 2026-10-22)
Output: sources/official_house_roster_2026-10-22.json

Usage: python DEO2LEG/build_official_roster.py [<dump.txt>]

Two independent representations exist inside the dump:

  1. A STRUCTURED MEMBER TABLE, repeated three times:
         | | Abante, Bienvenido Jr. M. | District | Manila, 6th District |
     This is authoritative for (name, kind, seat) and is the PRIMARY source.

  2. PROSE HEADINGS, one per member:
         ###### Dy, Faustino "Bojie" III G.
         Speaker of the House District Representative Isabela, 6th District
     Used only to recover leadershipRoles, which the table does not carry.

Why not parse the prose for seats?
---------------------------------
Two earlier versions did, and both were wrong.

  v1 anchored on "District Representative" and silently dropped seats carrying a
     leadership-role prefix, losing Isabela 6th (Bojie Dy, the House Speaker).

  v2 fixed that but searched a fixed 400-character window ahead of each heading.
     Exactly one heading in the dump has no seat line in its own block --
     'Mendoza, Raymond Democrito C.' -- so v2 borrowed the NEXT member's seat and
     fabricated a second representative for Southern Leyte 1st District. Mendoza is
     in fact a TUCP party-list member, which the structured table states plainly.
     v3 scopes the prose search to the heading's own block and, more importantly,
     no longer takes seats from prose at all.

The structured table also reveals that only 2 seats are genuinely ambiguous
(Antipolo City 2nd, Cavite 4th), not 3 as v2 reported.
"""

import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

HERE = Path(__file__).parent
DEFAULT_DUMP = HERE / "sources" / "house_members_dump_2026-10-22.txt"
OUT = HERE / "sources" / "official_house_roster_2026-10-22.json"

# ── 1. structured member table (PRIMARY) ────────────────────────────────────
# "| | Name | District | Seat |"  or  "| | Name | Party-list | Org |"
TABLE_ROW_RE = re.compile(
    r"^\|\s*\|?\s*(?P<name>[^|]+?)\s*\|\s*"
    r"(?P<kind>District|Party-list)\s*\|\s*"
    r"(?P<seat>[^|]+?)\s*\|\s*$",
    re.MULTILINE,
)

# ── 2. prose headings (leadership roles only) ───────────────────────────────
ROLE_PREFIXES = [
    "Speaker of the House",
    "Senior Deputy Majority Leader",
    "Deputy Majority Leader",
    "Deputy Minority Leader",
    "Assistant Majority Leader",
    "Assistant Minority Leader",
    "Deputy Speaker",
    "Majority Leader",
    "Minority Leader",
    "Majority Whip",
    "Minority Whip",
]
ROLE_ALT = "|".join(re.escape(r) for r in sorted(ROLE_PREFIXES, key=len, reverse=True))

PROSE_SEAT_LINE_RE = re.compile(
    rf"^((?:(?:{ROLE_ALT})\s+)*)\s*(District|Party-list)\s+Representative\s+(.+?)\s*$",
    re.MULTILINE,
)


def norm_name(name):
    """Collapse whitespace for cross-representation name matching.

    The dump prints some names with double spaces ('Tan, Reynolds  Michael T.'),
    so raw equality would fail between the table and the prose headings.
    """
    return re.sub(r"\s+", " ", name).strip()


def split_roles(raw):
    """Greedily split stacked role prefixes."""
    roles, rest = [], raw.strip()
    while rest:
        best = next((r for r in sorted(ROLE_PREFIXES, key=len, reverse=True)
                     if rest.startswith(r)), None)
        if not best:
            break
        roles.append(best)
        rest = rest[len(best):].strip()
    return roles


def parse_table(text):
    """Authoritative (name, kind, seat) triples. The table repeats 3x; dedupe.

    One row carries a leadership role as a NAME SUFFIX rather than in a separate
    column:

        | | Dy, Faustino "Bojie" III G. Speaker of the House | District | Isabela, 6th District |

    Such suffixes are stripped into leadershipRoles so the name stays clean and
    joins correctly against the prose headings. Verified: exactly one row in this
    dump is affected.
    """
    seen, entries = set(), []
    for m in TABLE_ROW_RE.finditer(text):
        raw_name = norm_name(m.group("name"))
        kind = m.group("kind")
        seat = norm_name(m.group("seat"))

        # Strip a trailing role suffix, if present.
        name, name_roles = raw_name, []
        for role in sorted(ROLE_PREFIXES, key=len, reverse=True):
            if name.endswith(role):
                name_roles = split_roles(name)
                name = norm_name(name[: -len(role)])
                break

        key = (name, kind, seat)
        if key in seen:
            continue
        seen.add(key)
        entries.append({
            "representative": name,
            "kind": f"{kind} Representative",
            "seat": seat,
            "_tableRoles": name_roles,
        })
    return entries


def parse_prose_roles(text):
    """Leadership roles per member, from prose headings scoped to their own block."""
    roles_by_name = defaultdict(set)
    headings = list(re.finditer(r"^######\s+(.+?)\s*$", text, re.MULTILINE))
    for i, m in enumerate(headings):
        name = norm_name(m.group(1))
        # Search ONLY within this heading's own block, never the next member's.
        block_end = headings[i + 1].start() if i + 1 < len(headings) else len(text)
        sm = PROSE_SEAT_LINE_RE.search(text[m.end():block_end])
        if not sm:
            continue
        for role in split_roles(sm.group(1)):
            roles_by_name[name].add(role)
    return {k: sorted(v) for k, v in roles_by_name.items()}


def split_seat(seat):
    """'Taguig City, 2nd District' -> ('Taguig City', '2nd')."""
    if "," not in seat:
        return seat.strip(), None
    jur, _, dist = seat.rpartition(", ")
    dist = re.sub(r"\s*District$", "", dist.strip(), flags=re.I).strip()
    return jur.strip(), dist


def main():
    dump = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_DUMP
    if not dump.exists():
        print(f"dump not found: {dump}")
        return 1

    text = dump.read_text(encoding="utf-8")
    entries = parse_table(text)
    roles_by_name = parse_prose_roles(text)

    for e in entries:
        table_roles = e.pop("_tableRoles")
        # Union of roles from both representations; the table suffix and the
        # prose prefix should agree, but take the union so neither is lost.
        e["leadershipRoles"] = sorted(
            set(table_roles) | set(roles_by_name.get(e["representative"], [])))
        if e["kind"] == "District Representative":
            jur, ordinal = split_seat(e["seat"])
            e["jurisdiction"], e["districtOrdinal"] = jur, ordinal

    district = [e for e in entries if e["kind"] == "District Representative"]
    partylist = [e for e in entries if e["kind"] == "Party-list Representative"]

    seats = Counter(e["seat"] for e in district)
    seat_names = defaultdict(set)
    for e in district:
        seat_names[e["seat"]].add(e["representative"])
    ambiguous = {s: sorted(n) for s, n in seat_names.items() if len(n) > 1}
    leaders = [e for e in entries if e["leadershipRoles"]]
    # A seat listing more than one DISTINCT name is genuine ambiguity (a
    # succession or protest case). The same name appearing twice for one seat
    # would be a dedupe failure -- only that is a defect.
    real_dupes = {s for s, names in seat_names.items()
                  if sum(1 for e in district if e["seat"] == s) > len(names)}

    print(f"source dump        : {dump.name}")
    print(f"total entries      : {len(entries)}")
    print(f"  district reps    : {len(district)}")
    print(f"  party-list reps  : {len(partylist)}")
    print(f"  unique dist seats: {len(seats)}")
    print(f"  dedupe failures  : {len(real_dupes)} (must be 0)")
    print(f"  ambiguous seats  : {len(ambiguous)}")
    for s, n in sorted(ambiguous.items()):
        print(f"     {s}: {n}")
    print(f"  with leadership  : {len(leaders)}")
    for e in leaders:
        print(f"     {e['representative']:<38} {', '.join(e['leadershipRoles']):<24} {e['seat']}")

    # ── regression guards for the two parser defects this rewrite fixes ──
    isabela6 = [e for e in district if e["seat"] == "Isabela, 6th District"]
    assert isabela6, "REGRESSION: Isabela 6th District missing (leadership-prefix drop)"
    assert "Speaker of the House" in isabela6[0]["leadershipRoles"], \
        "REGRESSION: Bojie Dy's speakership not captured"

    sl1 = sorted(e["representative"] for e in district
                 if e["seat"] == "Southern Leyte, 1st District")
    assert sl1 == ["Mercado, Roger Gaviola"], \
        f"REGRESSION: Southern Leyte 1st must have exactly one rep, got {sl1}"
    mendoza = [e for e in entries if e["representative"].startswith("Mendoza, Raymond")]
    assert mendoza and mendoza[0]["kind"] == "Party-list Representative", \
        "REGRESSION: Mendoza must be party-list, not a district rep"
    assert mendoza[0]["seat"] == "TUCP", f"Mendoza seat wrong: {mendoza[0]['seat']}"

    assert len(seats) == 254, f"expected 254 unique district seats, got {len(seats)}"
    assert len(ambiguous) == 2, f"expected 2 ambiguous seats, got {len(ambiguous)}"
    assert not real_dupes, f"dedupe failure -- same name twice for one seat: {real_dupes}"
    assert len(entries) == 324, f"expected 324 members, got {len(entries)}"
    # No name may still carry a role suffix after stripping.
    suffix_leftovers = [e["representative"] for e in entries
                        if any(e["representative"].endswith(r) for r in ROLE_PREFIXES)]
    assert not suffix_leftovers, f"role suffix not stripped from: {suffix_leftovers}"

    print("\nregression checks  : Isabela 6th present + speakership captured")
    print("                     Southern Leyte 1st has exactly one rep (Mercado)")
    print("                     Mendoza recorded as party-list TUCP, not a district rep")
    print("                     254 unique seats, 2 ambiguous seats, 0 dedupe failures")
    print("                     no role suffixes left in any name")

    OUT.write_text(json.dumps(entries, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"\nwrote {OUT} ({len(entries)} entries)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
