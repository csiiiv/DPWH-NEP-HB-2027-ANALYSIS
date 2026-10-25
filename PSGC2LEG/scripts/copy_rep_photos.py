#!/usr/bin/env python3
"""Copy district-representative photos into viz/photos/ and emit a manifest.

Joins DEO2LEG/legislative_profiles/profiles.json (congress.gov.ph scrape)
to data/legislative_districts.json on (jurisdiction, district_no).

Two join hazards this script accounts for (both hit during development):

1. Name collision: congress.gov.ph spells cities differently from our
   catalog ("Manila City" vs "City of Manila", "Taguig City" vs
   "Taguig–Pateros") AND has provinces with city namesakes (Quezon,
   Cebu). Naive normalization ("strip 'city'") merges Quezon province
   with Quezon City and puts the wrong representative's photo on 8
   districts. The fix: an explicit jurisdiction alias table + Taguig
   special case, never stripping the word "city".

2. Duplicate profiles: the scrape contains a few 19th-Congress leftovers
   sharing an area with the 20th-Congress winner (two Acops in Antipolo
   2nd, two Barzagas in Cavite 4th, etc.). When a key has multiple
   candidates, the one whose surname matches our catalog's
   `representative` field wins.

Outputs:
  viz/photos/<file>.jpg      (verbatim copies)
  viz/rep_photos.json        {leg_id: {name, photo, area, detail_url}}
"""
from __future__ import annotations

import json
import re
import shutil
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
REPO = ROOT.parent
PROFILES = REPO / "DEO2LEG" / "legislative_profiles" / "profiles.json"
PHOTO_DIR = REPO / "DEO2LEG" / "legislative_profiles" / "photos"
LEG = ROOT / "data" / "legislative_districts.json"

OUT_PHOTOS = ROOT / "viz" / "photos"
OUT_MANIFEST = ROOT / "viz" / "rep_photos.json"

WORD = {"lone": 0}
for _i, _w in enumerate(
    ["first", "second", "third", "fourth", "fifth", "sixth", "seventh",
     "eighth", "ninth", "tenth"], 1):
    WORD[_w] = _i

# Explicit alias table: our jurisdiction -> congress.gov.ph area prefix.
# Built by hand from the two name lists; anything absent must match
# exactly (which most do) and is reported if not found.
ALIASES = {
    "City of Manila": "Manila City",
    "City of Caloocan": "Caloocan City",
    "City of Makati": "Makati City",
    "City of Marikina": "Marikina City",
    "City of Parañaque": "Parañaque City",
    "City of Taguig": "Taguig City",
    "City of Valenzuela": "Valenzuela City",
    "City of Antipolo": "Antipolo City",
    "City of Cebu": "Cebu City",
    "City of Zamboanga": "Zamboanga City",
    "City of Cagayan De Oro": "Cagayan De Oro City",
    "City of Davao": "Davao City",
    # NOTE: no "Taguig–Pateros" alias — its norm ("taguig-pateros") must
    # equal the SPECIAL-transformed profile keys below.
    # NOTE: no "Butuan" alias — congress.gov.ph lists "Butuan, Lone District"
    # without the "City" suffix.
    "Pasay": "Pasay City",
    "Pasig": "Pasig City",
    "Las Piñas": "Las Piñas City",
    "Malabon": "Malabon City",
    "Mandaluyong": "Mandaluyong City",
    "Muntinlupa": "Muntinlupa City",
    "Navotas": "Navotas City",
    "San Juan": "San Juan City",
    "San Jose del Monte": "San Jose Del Monte City",
    "Biñan": "Biñan City",
    "Calamba": "Calamba City",
    "Santa Rosa": "Santa Rosa City",
    "Iloilo City": "Iloilo City",
    "Lapu-Lapu City": "Lapu-Lapu City",
    "Mandaue": "Mandaue City",
    "Iligan": "Iligan City",
    "General Santos": "General Santos City",
    "Bacolod": "Bacolod City",
    "Baguio": "Baguio City",
    "Davao City": "Davao City",
    "Zamboanga City": "Zamboanga City",
    "Cebu City": "Cebu City",
    "Cagayan de Oro": "Cagayan De Oro City",
    "Quezon City": "Quezon City",
    "Antipolo": "Antipolo City",
    "Caloocan": "Caloocan City",
    "Makati": "Makati City",
    "Marikina": "Marikina City",
    "Parañaque": "Parañaque City",
    "Valenzuela": "Valenzuela City",
}


def norm(s: str) -> str:
    """Light normalization that NEVER removes the word 'city'."""
    s = s.lower().replace("city of ", "cityof")
    s = (s.replace("ñ", "n").replace("–", "-").replace("—", "-")
          .replace("pateros", "pateros"))
    return re.sub(r"[^a-z0-9-]", "", s)


def area_key(area: str):
    """'Lanao del Sur, 1st District' -> (juris_norm, dno)."""
    m = re.match(r"(.+?),\s*(\w+)\.?\s+District", area)
    if not m:
        return ("RAW", norm(area))
    w = m.group(2).lower().rstrip("stndrh")
    if w.isdigit():
        return (norm(m.group(1)), int(w))
    return (norm(m.group(1)), WORD.get(w, -1))


# congress.gov.ph lists Taguig as "Taguig City, 2nd District" plus
# "Taguig City-Pateros, Lone District". Our catalog: Taguig–Pateros 1st
# (Pateros included, rep Cruz) and 2nd. Map both explicitly. NOTE norm()
# keeps hyphens, so these keys must be written as norm() produces them.
SPECIAL = {
    ("taguigcity", 2): ("taguig-pateros", 2),
    ("taguigcity-pateros", 0): ("taguig-pateros", 1),
}

# congress.gov.ph mislabels the Iloilo province 2nd district rep as
# "Iloilo City, 2nd District" (there is no such district; Iloilo City is
# lone). Gorriceta sits in the provincial 2nd — remap explicitly.
CROSSWALK_FIXES = {
    ("taguigcity-pateros", 0): ("taguig-pateros", 1),  # (alias of SPECIAL)
    ("iloilocity", 2): ("iloilo", 2),
}


def surname(name: str) -> str:
    """'Acop, Philip Conrad' -> 'acop'; 'Romeo Acop' -> 'acop'."""
    if "," in name:
        return norm(name.split(",")[0])
    parts = name.split()
    return norm(parts[-1]) if parts else ""


def name_tokens(name: str) -> set[str]:
    """All alphabetic tokens, nicknames stripped of quotes included."""
    return {t for t in re.split(r"[^a-zñ]+", name.lower()) if len(t) > 1
            and t not in {"jr", "sr", "dr", "rep", "atty", "md"}}


def main() -> int:
    profiles = json.loads(PROFILES.read_text(encoding="utf-8"))
    districts = json.loads(LEG.read_text(encoding="utf-8"))["districts"]

    # group profiles by key (usually 1; a few 19th-Congress leftovers share)
    prof_by_key = defaultdict(list)
    for r in profiles:
        if r.get("position_type") == "Party-list Representative":
            continue
        k = area_key(r["area"])
        k = SPECIAL.get(k, k)
        k = CROSSWALK_FIXES.get(k, k)
        prof_by_key[k].append(r)

    OUT_PHOTOS.mkdir(parents=True, exist_ok=True)
    manifest, copied, unmatched, ambiguous = {}, 0, [], []

    for d in districts:
        our_name = d["jurisdiction"]
        prof_name = ALIASES.get(our_name, our_name)
        k = (norm(prof_name), d["district_no"])
        cands = prof_by_key.get(k, [])
        if not cands:
            unmatched.append((our_name, d["district_label"]))
            continue
        chosen = None
        if len(cands) == 1:
            chosen = cands[0]
        else:
            # disambiguate against our catalog's `representative` string:
            # first by surname, then by token-subset (handles father/son or
            # same-surname pairs like the two Acops in Antipolo 2nd)
            want_sur = surname(d.get("representative") or "")
            want_tok = name_tokens(d.get("representative") or "")
            matches = [c for c in cands if surname(c["name"]) == want_sur]
            if len(matches) == 1:
                chosen = matches[0]
            else:
                sub = [c for c in matches
                       if want_tok and want_tok <= name_tokens(c["name"])]
                if len(sub) == 1:
                    chosen = sub[0]
                elif want_tok:
                    # fallback: any shared token
                    anytok = [c for c in matches
                              if want_tok & name_tokens(c["name"])]
                    if len(anytok) == 1:
                        chosen = anytok[0]
            if chosen is None:
                ambiguous.append((our_name, d["district_label"],
                                  [c["name"] for c in cands]))
                continue
        src = PHOTO_DIR / chosen["photo_file"]
        if not src.exists():
            unmatched.append((our_name, d["district_label"], "NO PHOTO FILE"))
            continue
        shutil.copy2(src, OUT_PHOTOS / chosen["photo_file"])
        copied += 1
        manifest[d["leg_id"]] = {
            "name": chosen["name"],
            "photo": "photos/" + chosen["photo_file"],
            "area": chosen["area"],
            "detail_url": chosen.get("detail_url", ""),
        }

    OUT_MANIFEST.write_text(
        json.dumps(manifest, indent=1, ensure_ascii=False), encoding="utf-8")

    print(f"districts: {len(districts)}  copied: {copied}  "
          f"unmatched: {len(unmatched)}  ambiguous: {len(ambiguous)}")
    for u in unmatched:
        print("   UNMATCHED:", u)
    for a in ambiguous:
        print("   AMBIGUOUS:", a)
    return 0


if __name__ == "__main__":
    sys.exit(main())
