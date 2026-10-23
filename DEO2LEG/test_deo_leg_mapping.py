#!/usr/bin/env python3
"""
Invariant tests for the DEO<->LEG crosswalk.

These lock in the guarantees established during the v2 rebuild. Every test is a
regression guard against a specific defect that was actually found and fixed:

  test_city_province_not_merged     canon() used to strip 'city', merging Quezon
                                    City with Quezon province (14 bogus matches).
  test_no_substring_registry_match  fuzzy matching linked South Cotabato 1st DEO
                                    to 'Cotabato 1st DEO' -- different provinces.
  test_isabela_6th_present          roster parser dropped leadership-prefixed
                                    seats, silently losing Isabela 6th.
  test_iloilo_correction            congress.gov.ph mislabels Iloilo province 2nd.
  test_taguig_override              post-2024 Taguig-Pateros reapportionment.
  test_legacy_offices_unlinked      legacy registry names must never gain links.
  test_amounts_not_in_graph         fiscal values belong only in the sidecar.

Run: pytest DEO2LEG/test_deo_leg_mapping.py -v
"""

import json
import sys
import time
from pathlib import Path

import pytest

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE))

from build_mapping import (  # noqa: E402
    build_relationships,
    fold,
    leg_id,
    load_full_table,
    load_registry,
    match_registry,
    office_id,
)
from join_districts import (  # noqa: E402
    RosterIndex,
    canon_jurisdiction,
    parse_dpwh_district,
    parse_roster_seat,
)

CROSSWALK = HERE / "deo_leg_crosswalk.json"
SIDECAR = HERE / "evidence" / "source_amounts.json"
ROSTER = HERE / "sources" / "official_house_roster_2026-10-22.json"


@pytest.fixture(scope="module")
def mapping():
    return json.loads(CROSSWALK.read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def sidecar():
    return json.loads(SIDECAR.read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def rows():
    return load_full_table()


# ── source completeness ─────────────────────────────────────────────────────

def test_full_table_row_count(rows):
    """The complete table has 264 rows; BetterGov's subset had only 108."""
    assert len(rows) == 264


def test_full_table_has_region_column(rows):
    """Region is new in the full table and must be populated on every row."""
    assert all(r["region"] for r in rows)
    assert len({r["region"] for r in rows}) == 17


def test_dash_rows_are_null_not_zero(rows):
    """A dash means 'not stated', never a zero allocation."""
    dashes = [r for r in rows if r["dashInSource"]]
    assert len(dashes) == 2
    assert all(r["amountThousandsPHP"] is None for r in dashes)
    # And no row encodes a dash as 0
    assert all(r["amountThousandsPHP"] != 0 for r in rows)


# ── normalisation regressions ───────────────────────────────────────────────

@pytest.mark.parametrize("city,province", [
    ("QUEZON CITY (FIRST DISTRICT)", "QUEZON (FIRST DISTRICT)"),
    ("CEBU CITY (FIRST DISTRICT)", "CEBU (FIRST DISTRICT)"),
    ("ILOILO CITY (LONE DISTRICT)", "ILOILO (FIRST DISTRICT)"),
])
def test_city_province_not_merged(city, province):
    """
    REGRESSION: stripping 'city' wrongly merged distinct jurisdictions.
    'city' is a distinctive token and must survive canonicalisation.
    """
    assert canon_jurisdiction(city.split(" (")[0]) != canon_jurisdiction(province.split(" (")[0])


def test_city_token_preserved():
    # 'city' is distinctive and must survive canonicalisation...
    assert canon_jurisdiction("Quezon City") == "quezon city"
    assert canon_jurisdiction("Quezon") == "quezon"
    # ...except where a documented alias exists, because congress.gov.ph spells
    # these two seats without 'City' ("Manila, 1st District", "Butuan, Lone
    # District"). Neither has a same-named province, so the alias is unambiguous.
    assert canon_jurisdiction("CITY OF MANILA") == "manila"
    assert canon_jurisdiction("MANILA CITY") == "manila"
    assert canon_jurisdiction("BUTUAN CITY") == "butuan"
    # Sanity: the alias must not leak onto other cities
    assert canon_jurisdiction("Cebu City") == "cebu city"
    assert canon_jurisdiction("Iloilo City") == "iloilo city"


def test_abbreviation_expansion():
    assert canon_jurisdiction("Sta. Rosa City") == "santa rosa city"
    assert canon_jurisdiction("CITY OF STA. ROSA") == "santa rosa city"


def test_parenthetical_qualifier_stripped():
    """'LAPU-LAPU CITY (OPON)' must join to the roster's 'Lapu-Lapu City'."""
    p = parse_dpwh_district("LAPU-LAPU CITY (OPON) (LONE DISTRICT)")
    assert p["canonJurisdiction"] == "lapu lapu city"
    assert p["joinOrdinal"] == "lone"


def test_north_cotabato_alias():
    """DPWH prints the pre-2019 name; the House seat is 'Cotabato'."""
    p = parse_dpwh_district("NORTH COTABATO (FIRST DISTRICT)")
    assert p["canonJurisdiction"] == "cotabato"


def test_no_parens_form_parses():
    """Some labels lack parentheses, e.g. 'MAGUINDANAO DEL NORTE LONE DISTRICT'."""
    p = parse_dpwh_district("MAGUINDANAO DEL NORTE LONE DISTRICT")
    assert p is not None
    assert p["ordinal"] == "Lone"


def test_every_table_district_parses(rows):
    labels = {r["districtLabel"] for r in rows}
    failed = [l for l in labels if parse_dpwh_district(l) is None]
    assert not failed, f"unparseable district labels: {failed}"


# ── registry matching safety ────────────────────────────────────────────────

@pytest.fixture(scope="module")
def registry():
    return load_registry()


@pytest.mark.parametrize("wrong_pair", [
    # These MUST NOT match: substring fuzzy matching linked them once.
    ("South Cotabato 1st DEO", "Cotabato 1st DEO"),
    ("Southern Leyte 1st DEO", "Leyte 1st DEO"),
    ("Southern Leyte 2nd DEO", "Leyte 2nd DEO"),
    ("Cotabato City DEO", "Cotabato 1st DEO"),
    ("Davao del Norte DEO", "Davao del Norte 2nd DEO"),
    ("Zamboanga del Norte 3rd DEO", "Zamboanga del Norte 4th DEO"),
])
def test_no_substring_registry_match(registry, wrong_pair):
    """
    REGRESSION: substring matching produced false positives across genuinely
    different provinces/offices. Only exact accent-folded matches are allowed.
    """
    a, b = wrong_pair
    assert match_registry(registry, a) != b
    assert match_registry(registry, b) != a


def test_accent_only_match_is_allowed(registry):
    """The one legitimate non-identical match: an accent difference only."""
    assert match_registry(registry, "Las Piñas-Muntinlupa DEO") == "Las Pinas-Muntinlupa DEO"


def test_fold_does_not_collapse_distinct_names():
    assert fold("South Cotabato") != fold("Cotabato")
    assert fold("Las Piñas") == fold("Las Pinas")


# ── roster parser regressions ───────────────────────────────────────────────

@pytest.fixture(scope="module")
def roster():
    return json.loads(ROSTER.read_text(encoding="utf-8"))


def test_isabela_6th_present(roster):
    """
    REGRESSION: seats carrying a leadership-role prefix were silently dropped,
    losing Isabela 6th (Bojie Dy, who is also House Speaker).
    """
    district = [e for e in roster if e.get("kind") == "District Representative"]
    assert any(e["seat"] == "Isabela, 6th District" for e in district)
    speaker = [e for e in district if "Speaker of the House" in e.get("leadershipRoles", [])]
    assert speaker, "leadership role was not captured as structured metadata"


def test_roster_unique_seat_count(roster):
    """254 unique district seats must equal the 254 districts in the table."""
    seats = {e["seat"] for e in roster if e.get("kind") == "District Representative"}
    assert len(seats) == 254


def test_iloilo_seat_correction(roster):
    """
    congress.gov.ph mislabels Iloilo province 2nd as 'Iloilo City, 2nd District'.
    Iloilo City is a lone district, so a 2nd Iloilo City seat cannot exist.
    """
    idx = RosterIndex(roster)
    status, payload = idx.find("iloilo", "2nd")
    assert status == "unique"
    assert "Gorriceta" in payload["representative"]
    assert idx.appliedCorrections, "no roster seat correction was recorded"
    # The bogus label must no longer resolve as an Iloilo City seat
    assert idx.find("iloilo city", "2nd")[0] == "not_found"
    # ...while the real Iloilo City lone seat is untouched
    assert idx.find("iloilo city", "lone")[0] == "unique"


def test_taguig_reapportionment_override(roster):
    """
    The PDF's 'TAGUIG CITY (FIRST DISTRICT)' corresponds to the official seat
    'Taguig City-Pateros, Lone District' after the reapportionment.
    """
    p = parse_dpwh_district("TAGUIG CITY (FIRST DISTRICT)")
    assert p["canonJurisdiction"] == "taguig city pateros"
    assert p["joinOrdinal"] == "lone"
    assert p["overrideNote"]
    idx = RosterIndex(roster)
    status, payload = idx.find(p["canonJurisdiction"], p["joinOrdinal"])
    assert status == "unique"
    assert "Cruz" in payload["representative"]
    # Taguig 2nd stays a distinct Taguig City seat
    p2 = parse_dpwh_district("TAGUIG CITY (SECOND DISTRICT)")
    assert p2["canonJurisdiction"] == "taguig city"
    assert idx.find("taguig city", "2nd")[0] == "unique"


# ── crosswalk structural invariants ─────────────────────────────────────────

def test_coverage_expanded(mapping):
    s = mapping["summary"]
    assert s["totalRelationships"] == 264
    assert s["totalLegislativeDistricts"] == 254
    assert s["officesFromAllocationTable"] == 200
    assert s["legacyRegistryOnlyOffices"] == 13
    assert s["totalOffices"] == 213


def test_referential_integrity(mapping):
    off, dist, rel = mapping["offices"], mapping["legislativeDistricts"], mapping["relationships"]
    for r in rel:
        assert r["officeId"] in off, f"dangling officeId {r['officeId']}"
        assert r["legislativeDistrictId"] in dist, f"dangling legId {r['legislativeDistrictId']}"


def test_bidirectional_links_consistent(mapping):
    off, dist = mapping["offices"], mapping["legislativeDistricts"]
    for oid, o in off.items():
        for lid in o.get("legislativeDistrictIds", []):
            assert lid in dist, f"{oid} -> missing district {lid}"
            assert oid in dist[lid]["officeIds"], f"{oid} -> {lid} not back-linked"
    for lid, d in dist.items():
        for oid in d["officeIds"]:
            assert oid in off, f"{lid} -> missing office {oid}"
            assert lid in off[oid]["legislativeDistrictIds"], f"{lid} -> {oid} not forward-linked"


def test_relationship_set_matches_link_set(mapping):
    off = mapping["offices"]
    rels = {(r["officeId"], r["legislativeDistrictId"]) for r in mapping["relationships"]}
    links = {(oid, lid) for oid, o in off.items() for lid in o.get("legislativeDistrictIds", [])}
    assert rels == links


def test_no_duplicate_relationships(mapping):
    keys = [(r["officeId"], r["legislativeDistrictId"]) for r in mapping["relationships"]]
    assert len(keys) == len(set(keys))


def test_relationships_reproducible(mapping, rows):
    """Rebuilding relationships from source must reproduce the committed graph."""
    rebuilt = build_relationships(rows, mapping["offices"], mapping["legislativeDistricts"])
    assert {(r["officeId"], r["legislativeDistrictId"]) for r in rebuilt} == \
           {(r["officeId"], r["legislativeDistrictId"]) for r in mapping["relationships"]}


def test_legacy_offices_unlinked(mapping):
    """
    Legacy registry names carry project codes but must NOT gain districts.
    Inventing links would assert an unverified office succession.
    """
    legacy = {oid: o for oid, o in mapping["offices"].items() if "legacy" in o}
    assert len(legacy) == 13
    for oid, o in legacy.items():
        assert o["legislativeDistrictIds"] == [], f"{oid} illegally gained districts"
        assert o["evidence"]["inAllocationTable"] is False
        assert o["legacy"]["status"], f"{oid} missing legacy status"
        assert o["legacy"]["note"], f"{oid} missing rationale"


def test_cotabato_city_not_conflated(mapping):
    """'Cotabato City DEO' (BARMM) must stay separate from North Cotabato offices."""
    o = mapping["offices"].get(office_id("Cotabato City DEO"))
    assert o is not None
    assert o["legacy"]["status"] == "registry_only"
    assert o["legislativeDistrictIds"] == []
    # North Cotabato offices are a distinct set
    assert mapping["offices"][office_id("Cotabato 1st DEO")]["legislativeDistrictIds"]


def test_amounts_not_in_graph(mapping):
    """Fiscal values must live only in the evidence sidecar."""
    graph = {
        "offices": mapping["offices"],
        "legislativeDistricts": mapping["legislativeDistricts"],
        "relationships": mapping["relationships"],
    }
    blob = json.dumps(graph).lower()
    assert "amount" not in blob
    assert "php" not in blob
    assert "'000" not in blob


def test_ids_are_stable_and_slug_safe(mapping):
    for oid in mapping["offices"]:
        assert oid.startswith("office:")
        assert oid == f"office:{oid.split(':', 1)[1]}"
        assert oid == oid.lower()
        assert " " not in oid and "_" not in oid
    for lid in mapping["legislativeDistricts"]:
        assert lid.startswith("leg:")
        assert lid == lid.lower()
        # leg id must be exactly leg:<jurisdiction>:<ordinal>
        assert lid.count(":") == 2, f"leg id must be leg:<jur>:<ordinal>, got {lid}"
        assert all(" " not in part and part for part in lid.split(":"))


# ── many-to-many structure ──────────────────────────────────────────────────

def test_many_to_many_is_real(mapping):
    s = mapping["summary"]
    assert s["districtsServedByMultipleOffices"] == 10
    assert s["officesSpanningMultipleDistricts"] == 33


@pytest.mark.parametrize("lid,expected_offices", [
    ("leg:manila:6th", {"North Manila DEO", "South Manila DEO"}),
    ("leg:mountain-province:lone", {"Mountain Province 1st DEO", "Mountain Province 2nd DEO"}),
    ("leg:basilan:lone", {"BARMM", "Isabela City DEO"}),
    ("leg:benguet:lone", {"Benguet 1st DEO", "Benguet 2nd DEO"}),
    ("leg:leyte:1st", {"Leyte 1st DEO", "Tacloban City DEO"}),
])
def test_districts_with_multiple_offices(mapping, lid, expected_offices):
    d = mapping["legislativeDistricts"].get(lid)
    assert d, f"{lid} missing"
    names = {mapping["offices"][oid]["name"] for oid in d["officeIds"]}
    assert names == expected_offices


def test_barmm_is_regional_group(mapping):
    o = mapping["offices"][office_id("BARMM")]
    assert o["type"] == "regional_group"


def test_sub_deo_typed(mapping):
    o = mapping["offices"][office_id("Camarines Norte Sub-DEO")]
    assert o["type"] == "sub_district_engineering_office"
    assert o["legislativeDistrictIds"] == [leg_id("camarines norte", "2nd")]


# ── representative resolution ───────────────────────────────────────────────

def test_representative_resolution_counts(mapping):
    """
    252 resolved + 2 ambiguous = 254 districts.

    Earlier builds reported 251/3. The third 'ambiguous' seat, Southern Leyte 1st,
    was a roster PARSER artifact: a heading with no seat line of its own borrowed
    the next member's seat, fabricating a second representative. The roster is now
    built from the directory's structured member table, which names Mercado, Roger
    Gaviola as the sole holder. See build_official_roster.py.
    """
    s = mapping["summary"]
    assert s["representativesResolved"] == 252
    assert s["representativesAmbiguous"] == 2
    assert s["representativesNotFound"] == 0
    assert s["representativesResolved"] + s["representativesAmbiguous"] + \
        s["representativesNotFound"] == s["totalLegislativeDistricts"]


@pytest.mark.parametrize("lid", [
    "leg:antipolo-city:2nd",
    "leg:cavite:4th",
])
def test_ambiguous_seats_not_guessed(mapping, lid):
    """
    congress.gov.ph lists two representatives for these seats. The builder must
    surface both and pick neither.
    """
    rep = mapping["legislativeDistricts"][lid]["representative"]
    assert rep["resolutionStatus"] == "ambiguous_multiple_listed"
    assert rep["name"] is None, "a representative was guessed for an ambiguous seat"
    assert len(rep["candidates"]) == 2
    assert not rep["verifiedAgainstOfficialDirectory"]


def test_southern_leyte_1st_is_resolved_not_ambiguous(mapping):
    """
    Regression guard for the roster parser defect. Southern Leyte 1st must resolve
    to Mercado, Roger Gaviola -- the directory's structured table lists him as the
    only holder. It must NOT carry a phantom second representative.

    The name previously attached to this seat, 'Mendoza, Raymond Democrito C.', is
    a TUCP party-list member and holds no district.
    """
    rep = mapping["legislativeDistricts"]["leg:southern-leyte:1st"]["representative"]
    assert rep["resolutionStatus"] == "resolved"
    assert rep["name"] == "Mercado, Roger Gaviola"
    assert rep["verifiedAgainstOfficialDirectory"] is True
    assert "candidates" not in rep
    assert "Mendoza" not in json.dumps(rep, ensure_ascii=False)


def test_resolved_reps_are_verified(mapping):
    for lid, d in mapping["legislativeDistricts"].items():
        rep = d["representative"]
        if rep["resolutionStatus"] == "resolved":
            assert rep["name"], f"{lid} resolved without a name"
            assert rep["verifiedAgainstOfficialDirectory"] is True
            assert rep["verificationSource"] == "congress.gov.ph/house-members"
            assert rep["verifiedDate"]


def test_isabela_6th_resolved_in_mapping(mapping):
    rep = mapping["legislativeDistricts"]["leg:isabela:6th"]["representative"]
    assert rep["resolutionStatus"] == "resolved"
    assert "Dy" in rep["name"]
    assert rep["leadershipRoles"] == ["Speaker of the House"]


# ── legislative profile enrichment ──────────────────────────────────────────

def test_profile_enrichment_coverage(mapping):
    """Every resolved district must carry a profile; none may be silently absent."""
    s = mapping["summary"]
    assert s["representativesWithProfile"] == s["representativesResolved"]
    assert s["representativesWithoutProfile"] == 0

    resolved = [d for d in mapping["legislativeDistricts"].values()
                if d["representative"]["resolutionStatus"] == "resolved"]
    missing = [d["displayName"] for d in resolved if not d["representative"].get("profile")]
    assert not missing, f"resolved districts without profile: {missing}"


def test_profile_block_shape(mapping):
    """Profile blocks carry the join keys and a resolvable photo path."""
    for lid, d in mapping["legislativeDistricts"].items():
        prof = d["representative"].get("profile")
        if not prof:
            continue
        assert prof["memberCode"], f"{lid}: empty memberCode"
        assert prof["detailUrl"].startswith("https://www.congress.gov.ph/house-members/view/"), \
            f"{lid}: unexpected detailUrl {prof['detailUrl']}"
        assert prof["photoFile"], f"{lid}: empty photoFile"
        assert prof["photoPath"], f"{lid}: photoPath not resolved on disk"
        assert prof["positionType"] == "District Representative", \
            f"{lid}: party-list profile joined onto a district"
        assert (HERE / prof["photoPath"]).exists(), f"{lid}: photo missing {prof['photoPath']}"


def test_member_codes_unique_across_districts(mapping):
    """One member_code per district seat; a shared code means the join collapsed."""
    codes = {}
    for lid, d in mapping["legislativeDistricts"].items():
        prof = d["representative"].get("profile")
        if not prof:
            continue
        assert prof["memberCode"] not in codes, \
            f"member_code {prof['memberCode']} reused by {codes[prof['memberCode']]} and {lid}"
        codes[prof["memberCode"]] = lid


def test_profile_joined_on_seat_not_name(mapping):
    """
    The profile's own seat must agree with the district's official seat.

    Joining on name alone would misattach a party-list member who shares a name
    with a district rep -- the exact failure mode behind the Southern Leyte 1st
    defect. This asserts the seat was part of the key.
    """
    from leg_profiles import ProfileIndex, norm_name, norm_seat

    pi = ProfileIndex()
    if not pi.available():
        pytest.skip("profiles.json absent")

    for lid, d in mapping["legislativeDistricts"].items():
        rep = d["representative"]
        prof = rep.get("profile")
        if not prof:
            continue
        matched = pi.find(rep["officialSeat"], rep["name"])
        assert matched is not None, f"{lid}: profile does not reproduce from (seat, name)"
        assert matched["member_code"] == prof["memberCode"]
        assert norm_seat(matched["area"]) == norm_seat(rep["officialSeat"])
        assert norm_name(matched["name"]) == norm_name(rep["name"])


def test_ambiguous_seats_carry_per_candidate_profiles(mapping):
    """
    Ambiguous seats must not pick a winner, but SHOULD profile both candidates.
    """
    for lid, d in mapping["legislativeDistricts"].items():
        rep = d["representative"]
        if rep["resolutionStatus"] != "ambiguous_multiple_listed":
            continue
        assert "profile" not in rep or rep.get("profile") is None, \
            f"{lid}: ambiguous seat was given a single chosen profile"
        cands = rep["candidateProfiles"]
        assert len(cands) == len(rep["candidates"]) == 2
        for c in cands:
            assert c["name"] in rep["candidates"]
            assert c["memberCode"], f"{lid}: candidate {c['name']} has no memberCode"
        codes = {c["memberCode"] for c in cands}
        assert len(codes) == 2, f"{lid}: both candidates share one memberCode"


def test_scrape_agrees_with_roster_on_every_seat_and_name():
    """
    Two extraction pipelines over the same directory must agree exactly.

    The roster comes from build_official_roster.py (structured table in the text
    dump); profiles.json comes from the Playwright scrape. Agreement on all 324
    (seat, name) pairs catches drift in either parser.

    NOTE: this is cross-pipeline agreement, NOT independent verification. Both
    read https://www.congress.gov.ph/house-members, so a site error would appear
    in both. That is why the crosswalk still labels the source
    'congress.gov.ph/house-members' rather than claiming an outside authority.
    """
    from leg_profiles import ProfileIndex, norm_name, norm_seat

    pi = ProfileIndex()
    if not pi.available():
        pytest.skip("profiles.json absent")

    roster = json.loads(ROSTER.read_text(encoding="utf-8"))

    def pairs(kind_roster, kind_profile):
        r = {(norm_seat(e["seat"]), norm_name(e["representative"]))
             for e in roster if e["kind"] == kind_roster}
        p = {(norm_seat(x["area"]), norm_name(x["name"]))
             for x in pi.entries if x["position_type"] == kind_profile}
        return r, p

    dr, dp = pairs("District Representative", "District Representative")
    assert dr == dp, (
        f"district mismatch; roster-only={sorted(dr - dp)[:5]} "
        f"scrape-only={sorted(dp - dr)[:5]}")

    pr, pp = pairs("Party-list Representative", "Party-list Representative")
    assert pr == pp, (
        f"party-list mismatch; roster-only={sorted(pr - pp)[:5]} "
        f"scrape-only={sorted(pp - pr)[:5]}")

    assert len(dr) == 256, f"expected 256 district entries, got {len(dr)}"
    assert len(pr) == 68, f"expected 68 party-list entries, got {len(pr)}"
    assert len({s for s, _ in dr}) == 254, "expected 254 unique district seats"


# ── sidecar ─────────────────────────────────────────────────────────────────

def test_sidecar_has_every_row(sidecar, rows):
    assert sidecar["summary"]["totalRows"] == len(rows) == 264
    assert sidecar["summary"]["dashRows"] == 2
    assert sidecar["summary"]["nonDashRows"] == 262


def test_sidecar_totals_match_table(sidecar, rows):
    total = sum(r["amountThousandsPHP"] for r in rows if r["amountThousandsPHP"] is not None)
    assert sidecar["summary"]["totalThousandsPHP"] == total


def test_sidecar_page_provenance(sidecar):
    """Every row must carry page/row provenance for auditability."""
    for r in sidecar["rows"]:
        assert isinstance(r["sourcePage"], int) and 1 <= r["sourcePage"] <= 9
        assert isinstance(r["rowOnPage"], int) and r["rowOnPage"] >= 1


def test_sidecar_has_no_fiscal_year_claim(sidecar):
    """The scan states no fiscal year; the sidecar must not invent one."""
    assert sidecar["underlyingDocument"]["fiscalYear"] is None


def test_sidecar_rows_align_with_relationships(sidecar, mapping):
    """
    Each sidecar row must correspond to a relationship in the graph, so the
    evidence layer can be joined back without amounts leaking in.
    """
    rels = {(r["officeId"], r["legislativeDistrictId"]) for r in mapping["relationships"]}
    covered = set()
    for r in sidecar["rows"]:
        p = parse_dpwh_district(r["legislativeDistrictLabel"])
        key = (office_id(r["officeName"]), leg_id(p["canonJurisdiction"], p["joinOrdinal"]))
        assert key in rels, f"sidecar row {r['sourceRow']} has no relationship: {key}"
        covered.add(key)
    assert covered == rels


# ── corroboration ───────────────────────────────────────────────────────────

def test_bettergov_fully_corroborated(mapping):
    """
    All 106 numeric BetterGov rows reproduce exactly in the full table. This is
    what licenses the full table as the primary source.
    """
    bg = mapping["validation"]["betterGovCorroboration"]
    assert bg["available"] is True
    assert bg["unmatched"] == 0
    assert bg["numericRowsMatchedOnOfficeAndAmount"] == 106
    assert bg["betterGovRows"] == 108


def test_bettergov_was_a_subset(mapping):
    s = mapping["summary"]
    assert s["totalRelationships"] > 108, "mapping is still limited to the BetterGov subset"


# ── published outputs/ ──────────────────────────────────────────────────────

OUTPUTS = HERE / "outputs"
MANIFEST = OUTPUTS / "MANIFEST.json"


def _sha256(path):
    import hashlib
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


@pytest.fixture(scope="module")
def manifest():
    if not MANIFEST.exists():
        pytest.skip("outputs/MANIFEST.json absent -- run publish_outputs.py")
    return json.loads(MANIFEST.read_text(encoding="utf-8"))


def test_outputs_are_byte_identical_to_canonical(manifest):
    """
    The published copies must be byte-identical to the canonical build.

    Byte-identity is what makes MANIFEST hashes meaningful and lets a consumer
    diff outputs/ against the build root and see nothing. It is also why photoPath
    is NOT rewritten to be outputs-relative.
    """
    import publish_outputs

    for rec in manifest["files"]:
        canonical = HERE / rec["canonicalPath"]
        published = OUTPUTS / rec["file"]
        assert published.exists(), f"missing published copy: {rec['file']}"
        assert canonical.exists(), f"missing canonical: {rec['canonicalPath']}"
        assert _sha256(published) == _sha256(canonical), \
            f"{rec['file']} drifted from canonical build"
        assert _sha256(published) == rec["sha256"], \
            f"{rec['file']} does not match its manifest sha256"
        assert published.stat().st_size == rec["bytes"]
        assert rec["byteIdenticalToCanonical"] is True
    # Guard the guard: publish_outputs must list exactly the two artifacts.
    assert {f["file"] for f in manifest["files"]} == \
        {"deo_leg_crosswalk.json", "source_amounts.json"}
    assert publish_outputs.check() == [], publish_outputs.check()


def test_manifest_schema_agrees_with_artifacts(manifest, mapping, sidecar):
    """Manifest metadata must describe the files it actually shipped."""
    by_name = {f["file"]: f for f in manifest["files"]}
    assert by_name["deo_leg_crosswalk.json"]["schemaVersion"] == mapping["schemaVersion"]
    assert by_name["source_amounts.json"]["schemaVersion"] == sidecar["schemaVersion"]

    cc = manifest["crossChecks"]
    assert cc["rowsMatch"] is True
    assert cc["relationshipCount"] == mapping["summary"]["totalRelationships"]
    assert cc["sidecarRowCount"] == sidecar["summary"]["totalRows"]
    assert cc["relationshipCount"] == cc["sidecarRowCount"] == 264
    assert cc["districtCount"] == mapping["summary"]["totalLegislativeDistricts"]
    assert cc["amountsAbsentFromGraph"] is True


def test_manifest_declares_path_resolution_base(manifest, mapping):
    """
    photoPath resolves from the DEO2LEG root, NOT from outputs/.

    This is the one real trap in consuming the copy, so the manifest must state it
    and the paths must actually resolve from HERE.
    """
    pr = manifest["pathResolution"]
    assert pr["base"].startswith("DEO2LEG/")

    profiles = [d["representative"]["profile"]
                for d in mapping["legislativeDistricts"].values()
                if d["representative"].get("profile")]
    assert profiles, "no profiles to check"
    for p in profiles:
        # relative to DEO2LEG root: resolves
        assert (HERE / p["photoPath"]).exists(), p["photoPath"]
        # relative to outputs/: does NOT resolve -- the documented caveat
        assert not (OUTPUTS / p["photoPath"]).exists(), \
            "photoPath unexpectedly resolves from outputs/; update the docs"


def test_manifest_documents_what_is_not_published(manifest):
    """Exclusions must be explicit, including the credential leak we gitignored."""
    excluded = {e["path"] for e in manifest["notPublished"]}
    assert "legislative_profiles/photos/" in excluded
    assert "deo_leg_crosswalk_draft(1).json" in excluded
    for e in manifest["notPublished"]:
        assert e["reason"], f"exclusion without a reason: {e['path']}"


def test_published_outputs_not_gitignored():
    """
    outputs/ is a tracked deliverable. If it ever gets gitignored the published
    copies would silently vanish from the repo.
    """
    import subprocess
    repo_root = HERE.parent
    for name in ("deo_leg_crosswalk.json", "source_amounts.json", "MANIFEST.json",
                 "README.md"):
        p = OUTPUTS / name
        if not p.exists():
            continue
        r = subprocess.run(["git", "check-ignore", "-q", str(p)],
                           cwd=repo_root, capture_output=True)
        assert r.returncode != 0, f"outputs/{name} is gitignored"


def test_publish_check_detects_drift(tmp_path, monkeypatch):
    """
    Prove --check actually fails on a drifted copy. A guard that never fires is
    not a guard.

    INPUTS is emptied so staleness cannot interfere; that guard has its own test.
    """
    import importlib
    import shutil
    import publish_outputs

    mod = importlib.reload(publish_outputs)
    real_out = mod.OUT
    fake_out = tmp_path / "outputs"
    fake_out.mkdir()
    monkeypatch.setattr(mod, "OUT", fake_out)
    monkeypatch.setattr(mod, "INPUTS", [])
    try:
        problems = mod.check()
        assert any("MANIFEST.json absent" in p for p in problems), problems
        assert any("published copy missing" in p for p in problems), problems

        # Now stage a full, untampered publish and confirm it verifies clean.
        shutil.copyfile(mod.HERE / "deo_leg_crosswalk.json",
                        fake_out / "deo_leg_crosswalk.json")
        shutil.copyfile(mod.HERE / "evidence" / "source_amounts.json",
                        fake_out / "source_amounts.json")
        manifest = {
            "files": [
                {"file": "deo_leg_crosswalk.json",
                 "sha256": mod.sha256(fake_out / "deo_leg_crosswalk.json")},
                {"file": "source_amounts.json",
                 "sha256": mod.sha256(fake_out / "source_amounts.json")},
            ],
        }
        (fake_out / "MANIFEST.json").write_text(json.dumps(manifest))
        assert mod.check() == [], mod.check()

        # Tamper one byte of a published copy: both drift guards must fire.
        target = fake_out / "source_amounts.json"
        target.write_text(target.read_text(encoding="utf-8") + "\n", encoding="utf-8")
        problems = mod.check()
        assert any("DRIFTED" in p for p in problems), problems
        assert any("MANIFEST sha256" in p for p in problems), problems
        # The untampered file must still verify.
        assert not any("deo_leg_crosswalk.json DRIFTED" in p for p in problems), problems
    finally:
        mod.OUT = real_out


def test_publish_check_reports_all_problems_at_once(tmp_path, monkeypatch):
    """
    A missing manifest must not short-circuit the other checks. Earlier, check()
    returned immediately on a missing manifest and so never reported staleness --
    a caller would have had to fix problems one at a time.
    """
    import importlib
    import os
    import publish_outputs

    mod = importlib.reload(publish_outputs)
    real_out = mod.OUT
    fake_out = tmp_path / "outputs"
    fake_out.mkdir()

    fresh_input = tmp_path / "fresh_input.py"
    fresh_input.write_text("# newer than the build\n", encoding="utf-8")
    os.utime(fresh_input, (time.time() + 600, time.time() + 600))

    monkeypatch.setattr(mod, "OUT", fake_out)
    monkeypatch.setattr(mod, "INPUTS", [fresh_input])
    try:
        problems = mod.check()
        # No manifest AND no copies AND stale -- all reported in one pass.
        assert any("MANIFEST.json absent" in p for p in problems), problems
        assert any("published copy missing" in p for p in problems), problems
        assert any("STALE" in p for p in problems), problems
        assert len(problems) >= 4, f"expected all problems at once, got {problems}"
    finally:
        mod.OUT = real_out


def test_publish_refuses_stale_artifacts(tmp_path, monkeypatch):
    """
    Prove both guards fire when a build input is newer than the canonical output,
    so a stale copy can never be published (or pass --check) as current.
    """
    import importlib
    import os
    import publish_outputs

    mod = importlib.reload(publish_outputs)
    real_out = mod.OUT
    fake_out = tmp_path / "outputs"
    fake_out.mkdir()
    mod.OUT = fake_out

    # A synthetic input dated in the future: newer than any real build output.
    fresh_input = tmp_path / "fresh_input.py"
    fresh_input.write_text("# newer than the build\n", encoding="utf-8")
    os.utime(fresh_input, (time.time() + 600, time.time() + 600))
    monkeypatch.setattr(mod, "INPUTS", list(mod.INPUTS) + [fresh_input])

    try:
        stale = mod.find_stale(mod.HERE / "deo_leg_crosswalk.json")
        assert "fresh_input.py" in stale, f"staleness not detected: {stale}"

        rc = mod.publish()
        assert rc == 1, "publish() must refuse a stale artifact"
        assert not (fake_out / "deo_leg_crosswalk.json").exists(), \
            "publish() wrote a copy despite refusing"

        problems = mod.check()
        assert any("STALE" in p for p in problems), problems
    finally:
        mod.OUT = real_out


def test_publish_is_idempotent(tmp_path, monkeypatch):
    """
    Republishing an unchanged build must produce byte-identical copies and stable
    hashes, so republishing cannot introduce spurious churn.

    INPUTS is emptied to isolate idempotency from staleness detection, which has
    its own test.
    """
    import importlib
    import publish_outputs

    mod = importlib.reload(publish_outputs)
    real_out = mod.OUT
    real_manifest = HERE / "outputs" / "MANIFEST.json"
    before = _sha256(real_manifest) if real_manifest.exists() else None
    fake_out = tmp_path / "outputs"
    monkeypatch.setattr(mod, "OUT", fake_out)
    monkeypatch.setattr(mod, "INPUTS", [])
    try:
        assert mod.publish() == 0
        first = {f["file"]: f["sha256"]
                 for f in json.loads(mod.manifest_path().read_text())["files"]}
        assert mod.publish() == 0
        second = {f["file"]: f["sha256"]
                  for f in json.loads(mod.manifest_path().read_text())["files"]}
        assert first == second, "republish changed artifact hashes"
        assert mod.check() == [], mod.check()
        assert mod.manifest_path() == fake_out / "MANIFEST.json", \
            "manifest_path() did not follow the redirected OUT"
    finally:
        mod.OUT = real_out
    # The real outputs/ must be untouched by this test.
    if before is not None:
        assert _sha256(real_manifest) == before, \
            "idempotency test wrote to the real outputs/MANIFEST.json"


# ── documentation consistency ───────────────────────────────────────────────

def _pytest_collected_count(path):
    """
    Authoritative collected-test count, taken from pytest's own collector.

    Not derived from this module's own arithmetic, so it cannot be circular.
    """
    class _Counter:
        def __init__(self):
            self.n = 0

        def pytest_collection_modifyitems(self, items):
            self.n = len(items)

    counter = _Counter()
    rc = pytest.main(["--collect-only", "-q", "--no-header", "-p", "no:cacheprovider",
                      str(path)], plugins=[counter])
    assert rc in (0, pytest.ExitCode.OK), f"pytest collection failed: {rc}"
    return counter.n


def _expanded_function_count(module):
    """Collected count computed from the module, expanding @parametrize."""
    total = 0
    for name, obj in vars(module).items():
        if not name.startswith("test_") or not callable(obj):
            continue
        mult = 1
        for mark in getattr(obj, "pytestmark", []):
            if mark.name == "parametrize":
                _, argvalues = mark.args
                mult *= len(argvalues)
        total += mult
    return total


def test_documented_test_counts_match_reality():
    """
    Several docs hardcode the test count, and it has gone stale repeatedly
    (55 -> 61 -> 70) as tests were added. A wrong count quietly undermines the
    "every number here is verified" claim, so assert each citation matches
    pytest's actual collected count.

    A bare function count would be wrong -- parametrised tests collect more than
    once -- so the expected value comes from pytest's collector and is
    cross-checked against the expansion arithmetic.
    """
    import re
    import test_deo_leg_mapping as mod

    from_pytest = _pytest_collected_count(HERE / "test_deo_leg_mapping.py")
    from_arith = _expanded_function_count(mod)
    assert from_pytest == from_arith, (
        f"collector says {from_pytest}, expansion says {from_arith}; "
        f"the doc guard's arithmetic is wrong")
    assert from_pytest > 0

    # Every phrasing the docs use for a test count.
    pattern = (r"(\d+)\s+invariant tests|(\d+)\s+regression tests"
               r"|\((\d+)\s+tests\)|→\s*(\d+)\s+passed|Each of the\s+(\d+)\s+tests")
    docs = [
        HERE / "README.md",
        HERE / "outputs" / "README.md",
        HERE.parent / "README.md",
        HERE / "DEO_LEG_Mapping_Methodology.md",
        HERE.parent / "analysis" / "web" / "src" / "sourcesCatalog.js",
    ]

    stale, checked = [], 0
    for doc in docs:
        if not doc.exists():
            stale.append(f"{doc.name}: MISSING")
            continue
        text = doc.read_text(encoding="utf-8")
        found = [int(g) for m in re.finditer(pattern, text)
                 for g in m.groups() if g]
        if not found:
            stale.append(f"{doc.name}: no test-count citation found")
        checked += len(found)
        wrong = sorted({n for n in found if n != from_pytest})
        if wrong:
            stale.append(f"{doc.name}: cites {wrong}, pytest collects {from_pytest}")

    assert checked >= 5, f"only {checked} citations found; the pattern is stale"
    assert not stale, "documented test counts are stale:\n  " + "\n  ".join(stale)


def test_documented_counts_match_manifest_and_artifacts(manifest, mapping, sidecar):
    """
    Counts and totals cited in prose must match the artifacts actually shipped.
    Guards the documentation the way the other tests guard the data.
    """
    import re

    s = mapping["summary"]
    doc = (HERE / "outputs" / "README.md").read_text(encoding="utf-8")
    version = mapping["schemaVersion"]

    # Figures the consumer guide states outright.
    expectations = [
        (str(s["totalRelationships"]), "relationships"),
        (str(s["totalLegislativeDistricts"]), "districts"),
        (str(s["representativesResolved"]), "resolved"),
        (str(s["representativesAmbiguous"]), "ambiguous"),
        (str(s["totalOffices"]), "offices"),
        (f"{s['totalAllocationThousandsPHP']:,}", "total allocation (thousands)"),
        (version, "schema version"),
    ]
    missing = [label for value, label in expectations if value not in doc]
    assert not missing, f"outputs/README.md omits: {missing}"

    # The coverage table rows must carry the right numbers, not just any mention.
    table_rows = dict(re.findall(r"^\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*$", doc,
                                 re.MULTILINE))
    for label, key in (("Allocation rows / relationships", "totalRelationships"),
                       ("Legislative districts", "totalLegislativeDistricts"),
                       ("Representatives resolved", "representativesResolved"),
                       ("Representatives ambiguous", "representativesAmbiguous")):
        if label in table_rows:
            assert str(s[key]) in table_rows[label], \
                f"coverage table row {label!r} says {table_rows[label]!r}, " \
                f"summary says {s[key]}"

    # Graph and sidecar must agree.
    assert sidecar["summary"]["totalRows"] == s["totalRelationships"]
    assert sidecar["summary"]["dashRows"] == s["dashRows"]
    assert manifest["crossChecks"]["rowsMatch"] is True

    # Schema version cited consistently across manifest and docs.
    assert manifest["canonicalBuild"]["schemaVersion"] == version
    for rec in manifest["files"]:
        assert rec["schemaVersion"] == version, f"{rec['file']} schema mismatch"
    for path in (HERE / "README.md", HERE / "DEO_LEG_Mapping_Methodology.md"):
        assert version in path.read_text(encoding="utf-8"), \
            f"{path.name} does not cite schema {version}"


def test_no_stray_test_module_at_repo_root():
    """
    A test module accidentally written to the repo root would SHADOW this one on
    sys.path and be picked up by a bare `pytest` run, silently changing what the
    suite covers. This happened once via a heredoc run from the wrong cwd.
    """
    root = HERE.parent
    stray = root / "test_deo_leg_mapping.py"
    assert not stray.exists(), (
        f"{stray} exists and shadows DEO2LEG/test_deo_leg_mapping.py -- remove it")


# ── DEO lens policy invariants ──────────────────────────────────────────────
#
# The crosswalk authorizes exactly one project-level use: the office lens
# (group source records by the office the source printed, list the districts
# associated with that office). README.md § "The one authorized project-level
# use: the DEO lens" states four mandatory conditions. These tests guard the
# crosswalk facts those conditions depend on, so a build that regresses them
# fails here rather than silently mis-attributing money to a representative.

def test_tier_census_matches_summary(mapping):
    """
    Tier A = office serves exactly one district (attributable alone).
    Tier B = office serves two or more (undivided range). The census over the
    200 in-table offices must reconcile with the published summary counts.
    """
    offices = [o for o in mapping["offices"].values()
               if o["evidence"].get("inAllocationTable")]
    spans = [len(o["legislativeDistrictIds"]) for o in offices]
    tier_a = sum(1 for s in spans if s == 1)
    tier_b = sum(1 for s in spans if s >= 2)
    assert tier_b == mapping["summary"]["officesSpanningMultipleDistricts"]
    assert tier_a + tier_b == mapping["summary"]["officesFromAllocationTable"]
    assert 0 not in spans, "an in-table office linked to no district"


def test_barmm_is_never_counted_as_a_district_office(mapping):
    """
    BARMM is type 'regional_group', not an office. A card loop iterating
    offices without checking type would book a regional grouping as a
    district-level actor. It must carry the regional_group type and link 6
    districts, and it must NOT be counted in the office tier census above.
    """
    barmm = mapping["offices"][office_id("BARMM")]
    assert barmm["type"] == "regional_group"
    assert len(barmm["legislativeDistrictIds"]) == 6
    # It is deliberately excluded from officesFromAllocationTable-based tiers
    # by being a regional_group; assert the type is the discriminator a
    # consumer must branch on.
    assert barmm["type"] != "district_engineering_office"


def test_no_district_is_orphaned(mapping):
    """Every district has at least one serving office, so the lens always has a
    source to name. A district with no office would render a blank card."""
    orphans = [lid for lid, d in mapping["legislativeDistricts"].items()
               if not d["officeIds"]]
    assert not orphans, f"districts with no serving office: {orphans}"


def test_shared_office_districts_are_named_on_both_sides(mapping):
    """
    Tier B condition: an office's money is undivided and shared with named
    co-served districts. For every office spanning 2+ districts, each of those
    districts must link back to the office, so a card can always list its
    co-served districts rather than showing a lone attributed figure.
    """
    districts = mapping["legislativeDistricts"]
    for oid, o in mapping["offices"].items():
        legs = o["legislativeDistrictIds"]
        if len(legs) < 2:
            continue
        for lid in legs:
            assert oid in districts[lid]["officeIds"], \
                f"{o['name']} serves {lid} but the district does not link back"


def test_ambiguous_seats_choose_no_representative(mapping):
    """
    The 2 ambiguous seats must keep name=null and list both candidates, so a
    card doing rep.name renders an explicit ambiguity, never a chosen winner
    paired with a money figure.
    """
    amb = [d for d in mapping["legislativeDistricts"].values()
           if d["representative"]["resolutionStatus"] == "ambiguous_multiple_listed"]
    assert len(amb) == mapping["summary"]["representativesAmbiguous"]
    for d in amb:
        assert d["representative"]["name"] is None
        assert len(d["representative"]["candidates"]) == 2


def test_readme_authorizes_only_the_tier_labelled_lens():
    """
    The amended README must still forbid per-representative totals and Tier B
    division, and must state the tier-label / residual / annotation conditions.
    Guards against the authorization being quietly broadened back into the old
    unrestricted "assign projects to districts" reading.
    """
    doc = (HERE / "README.md").read_text(encoding="utf-8")
    assert "The one authorized project-level use: the DEO lens" in doc
    # Still-prohibited framings must remain present.
    for phrase in ("claim legislative sponsorship or control",
                   "Never divide Tier B",
                   "per-representative totals"):
        assert phrase.lower() in doc.lower(), f"README dropped guard: {phrase!r}"
    # The tier vocabulary the lens must label with.
    for tier in ("Tier A", "Tier B"):
        assert tier in doc


def test_outputs_readme_cross_references_the_lens():
    """outputs/README.md is the consumer entry point; it must point at the
    authorization rather than repeating a now-narrowed flat prohibition."""
    doc = (HERE / "outputs" / "README.md").read_text(encoding="utf-8")
    assert "office lens" in doc.lower()
    assert "undivided" in doc.lower()

