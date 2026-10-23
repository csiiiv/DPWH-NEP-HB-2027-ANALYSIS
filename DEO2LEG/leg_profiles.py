#!/usr/bin/env python3
"""
Legislative profile lookup: scraped congress.gov.ph member profiles.

Source: DEO2LEG/legislative_profiles/profiles.json + photos/, scraped from
https://www.congress.gov.ph/house-members/ by scrape.py / scrape_cdp.py behind a
Cloudflare gate (gate.py). Captured 2026-10-22.

What it adds beyond the roster
------------------------------
The official roster (sources/official_house_roster_2026-10-22.json) gives name,
seat and leadership roles. The profiles add:
  * member_code   -- the site's stable member key (e.g. 'E003')
  * detail_url    -- canonical profile page
  * photo_file    -- locally scraped portrait

Joining
-------
Both representations come from the same website, so they are joined on the exact
pair (seat, name) after whitespace normalisation. The scrape prints some names
with doubled internal spaces ('Tan, Reynolds  Michael T.'), so raw string
equality would fail; norm_name() collapses whitespace on both sides.

This module does NOT join on name alone. Several members share a surname or even
a full name across a party-list seat and a district seat (Mendoza is party-list
TUCP, not Southern Leyte 1st), so seat must always be part of the key.
"""

import json
import re
from pathlib import Path

HERE = Path(__file__).parent
LP = HERE / "legislative_profiles"
PROFILES_JSON = LP / "profiles.json"
PHOTOS_DIR = LP / "photos"

CAPTURE_DATE = "2026-10-22"


def norm_name(name):
    """Collapse internal whitespace so doubled spaces still join."""
    return re.sub(r"\s+", " ", name).strip()


def norm_seat(seat):
    """Normalise a seat label for joining ('area' in profiles, 'seat' in roster)."""
    return re.sub(r"\s+", " ", seat).strip()


class ProfileIndex:
    """Indexes scraped member profiles for lookup by (seat, name)."""

    def __init__(self, profiles_path=PROFILES_JSON, photos_dir=PHOTOS_DIR):
        self.profiles_path = Path(profiles_path)
        self.photos_dir = Path(photos_dir)
        self.entries = json.loads(self.profiles_path.read_text(encoding="utf-8"))

        self.by_seat_name = {}
        self.by_seat = {}
        for p in self.entries:
            seat = norm_seat(p["area"])
            name = norm_name(p["name"])
            self.by_seat_name[(seat, name)] = p
            self.by_seat.setdefault(seat, []).append(p)

        self.district = [p for p in self.entries
                         if p["position_type"] == "District Representative"]
        self.partylist = [p for p in self.entries
                          if p["position_type"] == "Party-list Representative"]

    def available(self):
        """True when the scrape artifacts are present."""
        return self.profiles_path.exists()

    def find(self, seat, name):
        """Return the profile for (seat, name), or None."""
        return self.by_seat_name.get((norm_seat(seat), norm_name(name)))

    def find_all_for_seat(self, seat):
        """All profiles listing this seat (used for ambiguous seats)."""
        return self.by_seat.get(norm_seat(seat), [])

    def photo_path(self, profile):
        """Repository-relative path to the local photo, or None if absent."""
        if not profile.get("photo_file"):
            return None
        local = self.photos_dir / profile["photo_file"]
        if not local.exists():
            return None
        try:
            return str(local.relative_to(HERE))
        except ValueError:
            return str(local)

    def describe(self, profile):
        """Serialise a profile into the crosswalk's representative block."""
        return {
            "memberCode": profile["member_code"],
            "officialName": profile["name"],
            "detailUrl": profile["detail_url"],
            "photoFile": profile["photo_file"],
            "photoPath": self.photo_path(profile),
            "positionType": profile["position_type"],
            "source": "congress.gov.ph/house-members (scraped member directory)",
            "capturedDate": CAPTURE_DATE,
        }

    def stats(self):
        """Coverage diagnostics."""
        codes = [p["member_code"] for p in self.entries]
        photos_present = sum(1 for p in self.entries if self.photo_path(p))
        return {
            "totalProfiles": len(self.entries),
            "districtProfiles": len(self.district),
            "partyListProfiles": len(self.partylist),
            "uniqueMemberCodes": len(set(codes)),
            "photosPresentLocally": photos_present,
            "photosMissing": len(self.entries) - photos_present,
        }
