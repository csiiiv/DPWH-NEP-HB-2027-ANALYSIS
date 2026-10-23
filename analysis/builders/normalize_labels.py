"""Single home for label-normalization rules.

Raw extracted titles/offices stay on source records. Builders call
``annotate_source_labels`` to attach derived fields without overwriting print:

- ``title_match_key`` / ``normalized`` — live title keys (Brgy./repeat/places)
- ``office_canonical`` / ``canonical_office`` — DEO / place / punctuation twins
- ``PENDING_TITLE_ABBREVIATIONS`` — mined rules awaiting an explicit promote
"""

from __future__ import annotations

import re
import unicodedata
from difflib import SequenceMatcher

# Already applied by project matching and House reading keys.
# Keys are OCR / abbrev slips; values are House / gazetteer spellings.
LIVE_TITLE_ABBREVIATIONS = {
    'brgy': 'barangay',
    # Place-name OCR slips.
    'marindugue': 'marinduque',
    'siguijor': 'siquijor',
    'oroguieta': 'oroquieta',
    'antigue': 'antique',
    'cauavan': 'cauayan',
    'aborian': 'aborlan',
    'joaguin': 'joaquin',
    'kitoy': 'kiotoy',
    'pasuguin': 'pasuquin',
    'buacan': 'bulacan',
    'galerang': 'gelerang',
    'calabasa': 'kalabasa',
    'franciso': 'francisco',
    'manuyod': 'manjuyod',
    'macauwayan': 'macawayan',
    'purkay': 'purikay',
    'kabitangahan': 'kabitanganan',
    'enrigue': 'enrique',
    # Common word OCR / abbrev slips.
    'bldg': 'building',
    'bidg': 'building',
    'buildingg': 'building',
    'buidling': 'building',
    'bivd': 'blvd',
    'coverd': 'covered',
    'constuction': 'construction',
    'chainaga': 'chainage',
    'inicuding': 'including',
    'komuniudad': 'komunidad',
    'pupose': 'purpose',
    # 2026-10-11 Tier-1 OCR promote (House spelling ← NEP slip).
    'rogue': 'roque',
    'buqac': 'bugac',
    'aguino': 'aquino',
    'siope': 'slope',
    'baquio': 'baguio',
    'duguit': 'duquit',
    'ouezon': 'quezon',
    'citv': 'city',
    'nati': 'natl',
}

# Surface forms for offices (and any non-tokenized label). Keys are the OCR
# slips; values are the printed House / gazetteer spellings.
PLACE_NAME_SPELLINGS = (
    ('Marindugue', 'Marinduque'),
    ('Siguijor', 'Siquijor'),
    # OCR slips inside implementing-office names. These are not cosmetic: an
    # office spelled `Misamis Occidenatal ...` (106 NEP records) lands in a
    # SEPARATE bucket from the correctly spelled office (108 records), so every
    # office filter in the app silently splits one office in two and the
    # DEO -> congressional-district crosswalk cannot match it.
    ('Occidenatal', 'Occidental'),
    ('Batagas', 'Batangas'),
    ('Ilolilo', 'Iloilo'),
)

# Mined / reviewed candidates — not used by matching until explicitly merged
# into LIVE_TITLE_ABBREVIATIONS after a rebuild. Emptied after 2026-10-10 promote.
PENDING_TITLE_ABBREVIATIONS: dict[str, str] = {}

# Closed-class substitutions for mining triage (spelling/abbrev only).
PROMOTE_TITLE_PAIRS = {
    frozenset({'building', 'bldg'}),
    frozenset({'building', 'bidg'}),
    frozenset({'building', 'buildingg'}),
    frozenset({'buidling', 'building'}),
    frozenset({'bivd', 'blvd'}),
    frozenset({'constuction', 'construction'}),
    frozenset({'coverd', 'covered'}),
    frozenset({'marindugue', 'marinduque'}),
    frozenset({'siguijor', 'siquijor'}),
    frozenset({'oroguieta', 'oroquieta'}),
    frozenset({'antigue', 'antique'}),
    frozenset({'cauavan', 'cauayan'}),
    frozenset({'aborian', 'aborlan'}),
    frozenset({'joaguin', 'joaquin'}),
    frozenset({'kitoy', 'kiotoy'}),
    frozenset({'pasuguin', 'pasuquin'}),
    frozenset({'buacan', 'bulacan'}),
    frozenset({'galerang', 'gelerang'}),
    frozenset({'calabasa', 'kalabasa'}),
    frozenset({'franciso', 'francisco'}),
    frozenset({'manuyod', 'manjuyod'}),
    frozenset({'macauwayan', 'macawayan'}),
    frozenset({'purkay', 'purikay'}),
    frozenset({'kabitangahan', 'kabitanganan'}),
    frozenset({'enrigue', 'enrique'}),
    frozenset({'chainaga', 'chainage'}),
    frozenset({'inicuding', 'including'}),
    frozenset({'komuniudad', 'komunidad'}),
    frozenset({'pupose', 'purpose'}),
    frozenset({'rogue', 'roque'}),
    frozenset({'buqac', 'bugac'}),
    frozenset({'aguino', 'aquino'}),
    frozenset({'siope', 'slope'}),
    frozenset({'baquio', 'baguio'}),
    frozenset({'duguit', 'duquit'}),
    frozenset({'ouezon', 'quezon'}),
    frozenset({'citv', 'city'}),
    frozenset({'nati', 'natl'}),
}

REJECT_TITLE_PAIRS = {
    frozenset({'rehabilitation', 'construction'}),
    frozenset({'improvement', 'construction'}),
    frozenset({'completion', 'construction'}),
    frozenset({'bridge', 'footbridge'}),
}

WORK_TYPE_TOKENS = {
    'rehabilitation', 'construction', 'improvement', 'completion',
    'maintenance', 'preventive',
}

# Project-stage qualifier pairs like "Construction (Completion)" vs plain
# "Construction" describe the same delivered structure; the qualifier moves
# between documents. The token is dropped (only directly after the work type)
# for a guarded fallback pairing — never merged into title_match_key, because
# both variants can coexist as distinct line items (completion + fresh start)
# in the same scope.
QUALIFIER_AFTER_WORK_TYPE = {'completion'}


def strip_stage_qualifier(value: str) -> str:
    """Match key with the stage qualifier dropped after the work type.

    ``Construction (Completion) of X`` and ``Construction of X`` share a
    stripped key; ``Completion of X`` (no leading work type) keeps its token.
    Punctuation is irrelevant — tokens split before the check.
    """
    tokens = title_tokens(value)
    kept = []
    for token in tokens:
        if token in QUALIFIER_AFTER_WORK_TYPE and kept and kept[-1] in WORK_TYPE_TOKENS:
            continue
        kept.append(token)
    return ''.join(t for t in kept if t != 'barangay')


# Fuzzy-review taxonomy: classify the residual title-token difference between
# a House row and one of its NEP suggestions. Tags are additive and ordered
# most-specific-first; unclassified substitutions stay 'other_place_or_word'.
FUZZY_DIFF_TAGS = {
    'work_type_change': 'Different work type (construction ↔ rehabilitation…)',
    'stage_qualifier': 'Construction (Completion) ↔ Construction qualifier only',
    'work_phrase_modifier': 'Work phrase / along-at modifier on one side',
    'connector_word': 'at / in / comma phrasing difference',
    'city_suffix': 'City suffix present on one side (Manila ↔ Manila City)',
    'facility_qualifier': 'Facility qualifier on one side (Gym / Gymnasium / Covered Court)',
    'unit_count': 'Unit/phase count on one side (2 units, Phase 2…)',
    'chainage_digit': 'Station/chainage digits differ',
    'structure_id_digit': 'Structure-ID or coordinate digits differ',
    'same_gps_coordinates': 'Same GPS coordinates, different words',
    'different_gps_coordinates': 'Different GPS coordinates',
    'parenthetical_modifier': 'Difference only inside parentheses',
    'different_barangay': 'Different barangay (named or numbered)',
    'different_municipality': 'Different municipality/city in the same province',
    'different_province': 'Different province (same municipality/barangay shell)',
    'different_street': 'Different street / sitio / creek / road section',
    'location_reassignment': 'Same project shell with a relocated place slot (amendment)',
    'point_to_point_barangay': 'Point-to-point barangay corridor endpoint change (amendment)',
    'work_descriptor_change': 'Work scope wording only (Solar, and Utilities…)',
    'spelling_ocr': 'Spelling / OCR slip in a shared token',
    'other_place_or_word': 'Different place or word — needs manual review',
}

# Tokens whose one-sided presence reads as facility scope, not identity.
FACILITY_QUALIFIER_TOKENS = {'gym', 'gymnasium', 'covered', 'court', 'mpb'}
# Pure phrasing connectors that titles use inconsistently.
CONNECTOR_TOKENS = {'at', 'in'}
# Words that form a work-phrase prefix/suffix around a location ("Preventive
# Maintenance along …", "Rehabilitation of …") — their one-sided presence is a
# phrasing difference, not a place change.
WORK_PHRASE_TOKENS = WORK_TYPE_TOKENS | {'along'}

# Master work-descriptor vocabulary: facility/infrastructure nouns and scope
# qualifiers that appear between the work-type verb and the location in PH
# project titles (mined from the 2027 corpus: multi purpose building, road,
# drainage system, flood control structure, bridge, water supply system,
# slope protection, seawall, revetment, box culvert, evacuation center…).
# Used (a) to split titles into work-descriptor vs location zones and (b) to
# classify residual diffs whose changed tokens are all scope wording.
WORK_DESCRIPTOR_TOKENS = {
    # work-type verbs and stage words
    'construction', 'rehabilitation', 'improvement', 'maintenance',
    'preventive', 'completion', 'reconstruction', 'repair', 'replacement',
    'upgrading', 'strengthening', 'retrofitting', 'extension', 'expansion',
    # facilities and structures
    'multi', 'purpose', 'multipurpose', 'building', 'buildings', 'road',
    'roads', 'roadway', 'drainage', 'drainages', 'canal', 'canals', 'flood',
    'control', 'mitigation', 'mitigating', 'structure', 'structures',
    'stucture', 'wall', 'walls', 'floodwall', 'bridge', 'bridges',
    'footbridge', 'water', 'supply', 'suppy', 'system', 'systems', 'sytem',
    'syatem', 'slope', 'protection', 'seawall', 'revetment', 'culvert',
    'box', 'evacuation', 'center', 'covered', 'court', 'gym', 'gymnasium',
    'mpb', 'sidewalk', 'pathway', 'pathwalk', 'walk', 'riverbank',
    'riverwall', 'spillway', 'pumping', 'pump', 'station', 'solar',
    'network', 'networks', 'facility', 'facilities', 'faciliteis',
    'lining', 'lined', 'dike', 'dikes', 'earthdike', 'retaining',
    'retaning', 'retarding', 'detention', 'resettlement', 'ressetlement',
    'relocation', 'bypass', 'diversion', 'circumferential', 'radial',
    'arterial', 'utilities', 'concrete', 'concreting', 'paving', 'paved',
    'shoulders', 'reblocking', 'riprap', 'masonry', 'banks', 'grouted',
    'spur', 'dike', 'dam', 'dams', 'reservoir', 'outfall', 'overflow',
    'sewerage', 'septage', 'waterways', 'waterworks', 'potable', 'level',
    'deepwell', 'spring', 'springs', 'school', 'building', 'hall',
    'barangay',  # 'barangay hall' descriptor when not the address slot
    # scope/measure words that ride along in descriptors
    'units', 'unit', 'phase', 'storey', 'storeybuilding', 'package',
    'component', 'appurtenant', 'apurtenant', 'works', 'project', 'projects',
    'including', 'inc', 'related', 'various', 'existing', 'new', 'other',
    'others', 'additional', 'expanded', 'improved', 'proper',
}
# Function words ignored when testing whether a differing pair is pure scope
# wording.
_DESCRIPTOR_FUNCTION_TOKENS = {'the', 'of', 'and', 'with', 'for', 'a', 'an', 'to'}

_GPS_RE = re.compile(r'\d{1,3}\s*\.\s*\d{3,}')
_PAREN_RE = re.compile(r'\([^)]*\)')
# Prepositions act as soft commas between the work phrase and the location
# ("Construction of X at/along/in Barangay Y"); splitting on them aligns
# titles that phrase the same address differently.
_SEGMENT_SPLIT_RE = re.compile(r',|\b(?:along|at|in|near)\b', re.I)
_STATION_TOKEN_RE = re.compile(r'(?:sta|k?\d+(?:\.\d+)?|to|km)')
_ZONE_TOKEN_RE = re.compile(r'(?:zone|purok|district|barangay|bgy|brgy|[0-9]+|[ivx]+)')


def _gps_coordinates(value: str) -> list[str]:
    """Normalized GPS coordinate strings (decimal point, no spaces)."""
    return [m.replace(' ', '') for m in _GPS_RE.findall(value or '')]


def _prep_tokens(value: str) -> list[str]:
    kept = []
    for token in title_tokens(value):
        if token in QUALIFIER_AFTER_WORK_TYPE and kept and kept[-1] in WORK_TYPE_TOKENS:
            continue
        kept.append(token)
    return kept


def _segments(value: str) -> list[list[str]]:
    """Comma segments of a cleaned title as token lists (GPS + parens removed)."""
    cleaned = _GPS_RE.sub(' ', _PAREN_RE.sub(' ', value or ''))
    return [title_tokens(part) for part in cleaned.split(',') if part.strip()]


def _slots(value: str) -> list[list[str]]:
    """Address slots: split on commas AND location prepositions.

    "Construction of MPB at Barangay X, Municipality, Province" yields
    [work phrase, "barangay x", municipality, province] on both sides even
    when one title phrases the address with "along"/"in" instead of a comma
    or "at". GPS coordinates and parentheticals are removed first.
    """
    cleaned = _GPS_RE.sub(' ', _PAREN_RE.sub(' ', value or ''))
    return [title_tokens(part) for part in _SEGMENT_SPLIT_RE.split(cleaned) if part.strip()]


def _station_run(tokens: list[str]) -> bool:
    """True when the slot is a station/chainage run (Sta. 1+234 - Sta. 2+345)."""
    return bool(tokens) and all(_STATION_TOKEN_RE.fullmatch(t) for t in tokens) \
        and any(t in ('sta', 'km') or t.startswith('k') for t in tokens)


def _zone_run(tokens: list[str]) -> bool:
    """True when the slot is a zone/purok/district/numbered-barangay run."""
    return bool(tokens) and all(_ZONE_TOKEN_RE.fullmatch(t) for t in tokens) \
        and any(t in ('zone', 'purok', 'district') for t in tokens)


def _first_differing_slot(a: list[list[str]], b: list[list[str]], tail: int):
    """Index of the first non-equal slot before the shared tail, else None."""
    limit = min(len(a), len(b)) - tail
    for i in range(max(limit, 0)):
        if a[i] != b[i]:
            return i
    return None


# --- Parse-then-compare title model -----------------------------------------
#
# Opcodes (difflib alignment) proved unreliable for place classification:
# token runs merge across slot boundaries and paren tokens desync positions.
# Instead each title is parsed into named slots using PH title conventions,
# then compared role-to-role. Slots are identified contextually, not by
# position: a run starting with the 'barangay' marker is the barangay slot
# wherever it appears; a station run (Sta./K… + digits) is chainage; a run
# introduced by 'along/at/in/near' or a comma after the work phrase is the
# location zone.

_SLOT_MARKERS = {
    'barangay': 'barangay', 'brgy': 'barangay', 'bgy': 'barangay',
    'purok': 'purok', 'sitio': 'sitio', 'zone': 'zone',
    'district': 'district',
}


def parse_title_slots(value: str) -> dict[str, list[str]]:
    """Parse a PH project title into named address/work slots.

    Returns a dict of slot name → token list. Slot names: 'work' (leading
    work phrase), 'street' (location introduced by along/at/in/near without
    a barangay/zone marker), 'barangay', 'zone', 'purok', 'sitio',
    'municipality', 'province', 'chainage' (station runs), 'parens'
    (parentheticals), 'gps' (decimal coordinates), and 'other' (unplaced
    comma segments). Positions are contextual, so a barangay slot found
    anywhere in the title fills 'barangay' regardless of index.
    """
    text = value or ''
    parens = _PAREN_RE.findall(text)
    gps = _gps_coordinates(text)
    cleaned = _GPS_RE.sub(' ', _PAREN_RE.sub(' ', text))
    slots: dict[str, list[str]] = {'parens': [t for p in parens for t in title_tokens(p)],
                                   'gps': gps}
    segs = [title_tokens(part) for part in _SEGMENT_SPLIT_RE.split(cleaned) if part.strip()]
    if not segs:
        return slots
    # First segment (before any comma/preposition) is the work phrase.
    slots['work'] = segs[0]
    place_segs = segs[1:]
    # Walk place segments from the right: province, municipality, then
    # barangay/street/zone/station by marker.
    roles: dict[str, list[str]] = {}
    n = len(place_segs)
    for i, seg in enumerate(place_segs):
        from_right = n - i
        # Partial station runs (Section I: Sta. 11+640 …) still count as
        # chainage when a station marker is present.
        has_station = any(t in ('sta', 'km') or t.startswith('k') and t[1:].isdigit()
                          for t in seg)
        if _station_run(seg) or (has_station and from_right > 2):
            roles.setdefault('chainage', seg)
        elif seg and seg[0] in _SLOT_MARKERS:
            roles.setdefault(_SLOT_MARKERS[seg[0]], seg)
        elif from_right == 1:
            # "Valenzuela City" / "Manila City" with no separate province →
            # treat as municipality (city is the locality, not a province).
            street_markers = {'street', 'st', 'avenue', 'ave', 'boulevard',
                              'blvd', 'drive', 'lane', 'creek', 'river',
                              'sitio', 'road', 'rd', 'extension'}
            if seg and seg[-1] == 'city' and n == 2:
                roles.setdefault('municipality', seg)
            elif n == 1 and (set(seg) & street_markers):
                # Single place segment with a street marker (road-only titles
                # with no municipality/province) → street, not province.
                roles.setdefault('street', seg)
            else:
                roles.setdefault('province', seg)
        elif from_right == 2:
            roles.setdefault('municipality', seg)
        else:
            # Location without an explicit marker between the work phrase and
            # the municipality: street/road/creek/section name.
            roles.setdefault('street', seg)
    for role, seg in roles.items():
        slots[role] = seg
    # Comma segments not consumed by a role (extra middle segments).
    consumed = {id(s) for s in roles.values()}
    leftover = [s for s in place_segs if id(s) not in consumed]
    if leftover:
        slots['other'] = [t for s in leftover for t in s]
    return slots


def _slot_tokens_equal(a: list[str] | None, b: list[str] | None) -> bool:
    """Equality with trailing 'city' normalized away (Manila ↔ Manila City)."""
    if a is None and b is None:
        return True
    if not a or not b:
        return a == b
    def strip(tokens):
        return tokens[:-1] if tokens and tokens[-1] == 'city' else tokens
    return strip(a) == strip(b)


def _near_spelling(a: list[str], b: list[str]) -> bool:
    """True when two token lists differ only by a high-ratio OCR/spelling slip.

    Requires same token length and exactly one differing token with a high
    character ratio (San Roque ↔ San Rogue). Rejects whole-token insertions
    and multi-token place swaps (Lim Extension ↔ Lapu-Lapu Extension,
    Singay ↔ Badiangan) even when joined-string ratios look high.
    """
    from difflib import SequenceMatcher
    if not a or not b:
        return False
    # Drop shared markers (barangay/zone/purok) and compare the residue.
    markers = set(_SLOT_MARKERS)
    ha = [t for t in a if t not in markers]
    nb = [t for t in b if t not in markers]
    if not ha or not nb or len(ha) != len(nb):
        return False
    diffs = [(x, y) for x, y in zip(ha, nb) if x != y]
    if not diffs:
        return True
    if len(diffs) != 1:
        return False
    x, y = diffs[0]
    if min(len(x), len(y)) < 4:
        return False
    return SequenceMatcher(None, x, y).ratio() >= .8


def _barangay_has_corridor(slots: dict[str, list[str]]) -> bool:
    """True when the barangay slot names a point-to-point corridor (… to …)."""
    return 'to' in (slots.get('barangay') or [])


def _work_shell_equal(house_slots: dict[str, list[str]],
                      nep_slots: dict[str, list[str]]) -> bool:
    """Same leading work phrase after dropping stage/facility noise tokens."""
    noise = {'completion'} | FACILITY_QUALIFIER_TOKENS
    h = [t for t in (house_slots.get('work') or []) if t not in noise]
    n = [t for t in (nep_slots.get('work') or []) if t not in noise]
    return bool(h) and h == n


def _place_residue_related(a: list[str] | None, b: list[str] | None) -> bool:
    """True when two place slots look like variants of the same name.

    Shared residue tokens (G./MH Del Pilar) or a single-token OCR slip count;
    unrelated names (Wakas ↔ Opias, Alpha ↔ Beta) do not.
    """
    markers = set(_SLOT_MARKERS) | {'to'}
    ha = [t for t in (a or []) if t not in markers]
    nb = [t for t in (b or []) if t not in markers]
    if not ha or not nb:
        return False
    if set(ha) & set(nb):
        return True
    return _near_spelling(a or [], b or [])


def _province_reassignment(a: list[str] | None, b: list[str] | None) -> bool:
    """True when provinces look like a printed reassignment, not a new place.

    Requires a shared administrative tail (… del Norte / … del Sur) or an
    OCR-grade token slip — not merely any trailing locality string.
    """
    ha, nb = list(a or []), list(b or [])
    if len(ha) >= 2 and len(nb) >= 2 and ha[-2:] == nb[-2:]:
        return True
    return _near_spelling(ha, nb)


def _amendment_place_tags(house_slots: dict[str, list[str]],
                          nep_slots: dict[str, list[str]],
                          place_tags: list[str],
                          house_title: str,
                          nep_title: str) -> list[str]:
    """Overlay tags for place-slot amendments (reassignment / corridor).

    These mark House↔NEP pairs that share the project shell but relocate a
    place role — review as amendments, not new insertions. Requires high
    title-key similarity so unrelated nearby barangays stay hard mismatches.
    """
    from difflib import SequenceMatcher
    place_change = set(place_tags) & {
        'different_barangay', 'different_municipality',
        'different_province', 'different_street',
    }
    if not place_change or not _work_shell_equal(house_slots, nep_slots):
        return []
    muni_same = _slot_tokens_equal(house_slots.get('municipality'),
                                   nep_slots.get('municipality'))
    # Point-to-point corridor endpoint change inside the same municipality
    # (Agmanaphao→Singay ↔ Agmanaphao→Badiangan; Singay→Mina East ↔ Singay).
    if 'different_barangay' in place_change and muni_same \
            and (_barangay_has_corridor(house_slots)
                 or _barangay_has_corridor(nep_slots)):
        return ['point_to_point_barangay']
    # Location reassignment: same municipality shell, one place role moved,
    # titles nearly identical (Carmen Agusan↔Lanao; Lim↔Lapu-Lapu Extension).
    key_h = title_match_key(house_title)
    key_n = title_match_key(nep_title)
    if not key_h or not key_n:
        return []
    if SequenceMatcher(None, key_h, key_n, autojunk=False).ratio() < .92:
        return []
    if not muni_same and 'different_province' not in place_change:
        return []
    # Province swap keeps barangay+municipality and a shared admin tail
    # (… del Norte). Street/barangay swap keeps municipality and requires
    # related place-name residue so Wakas↔Opias stays a hard mismatch.
    if 'different_province' in place_change:
        if house_slots.get('barangay') == nep_slots.get('barangay') and muni_same \
                and _province_reassignment(house_slots.get('province'),
                                           nep_slots.get('province')):
            return ['location_reassignment']
        return []
    if not muni_same:
        return []
    if 'different_street' in place_change and _place_residue_related(
            house_slots.get('street'), nep_slots.get('street')):
        return ['location_reassignment']
    if 'different_barangay' in place_change and _place_residue_related(
            house_slots.get('barangay'), nep_slots.get('barangay')):
        return ['location_reassignment']
    return []


def _slot_pair_tags(house_slots: dict[str, list[str]], nep_slots: dict[str, list[str]]) -> list[str]:
    """Role-to-role place tags from two parsed titles (no opcodes)."""
    tags: list[str] = []
    # Sub-barangay markers (barangay / zone / purok / sitio) — any mismatch
    # among them is a different_barangay signal, unless the residue is an
    # OCR/spelling slip (San Roque ↔ San Rogue) which the opcode loop tags.
    for role in ('barangay', 'zone', 'purok', 'sitio'):
        h, n = house_slots.get(role), nep_slots.get(role)
        if h != n and h and n and not _near_spelling(h, n):
            tags.append('different_barangay')
            break
        if role == 'barangay' and ((h and not n) or (n and not h)):
            tags.append('different_barangay')
            break
    if not _slot_tokens_equal(house_slots.get('municipality'), nep_slots.get('municipality')) \
            and house_slots.get('municipality') and nep_slots.get('municipality'):
        tags.append('different_municipality')
    if house_slots.get('province') and nep_slots.get('province') \
            and not _slot_tokens_equal(house_slots.get('province'),
                                       nep_slots.get('province')) \
            and not _near_spelling(house_slots.get('province') or [],
                                   nep_slots.get('province') or []):
        tags.append('different_province')
    if house_slots.get('street') != nep_slots.get('street') \
            and (house_slots.get('street') or nep_slots.get('street')) \
            and not _near_spelling(house_slots.get('street') or [],
                                   nep_slots.get('street') or []):
        tags.append('different_street')
    if house_slots.get('chainage') != nep_slots.get('chainage') \
            and house_slots.get('chainage') and nep_slots.get('chainage'):
        tags.append('chainage_digit')
    return tags


def _classify_place_tokens(house_tokens: list[str], nep_tokens: list[str],
                           tail: int, seg_h: list[list[str]], seg_n: list[list[str]]) -> str | None:
    """Name what changed between two differing token runs in a location slot.

    Works on the opcode's own changed tokens (plus their shared context
    markers) so a work-scope word inside a slot with station drift still
    classifies as scope wording. Returns a fine-grained place tag or None.
    """
    hs, ns = set(house_tokens), set(nep_tokens)
    changed = hs ^ ns
    # Pure work-scope wording ("and Utilities", "Solar", "Isla-" prefix):
    # every changed token belongs to the descriptor vocabulary.
    if changed and changed <= WORK_DESCRIPTOR_TOKENS | _DESCRIPTOR_FUNCTION_TOKENS:
        return 'work_descriptor_change'
    # Numbered barangay ↔ named barangay (Barangay 8 ↔ Barangay Payompon)
    # or Zone III ↔ Zone IV.
    if 'barangay' in hs & ns or (hs & ns) & {'zone', 'purok', 'district'}:
        return 'different_barangay'
    if _zone_run(house_tokens) and _zone_run(nep_tokens):
        return 'different_barangay'
    # Station/section runs on the same road → station/section difference.
    if _station_run(house_tokens) or _station_run(nep_tokens):
        return 'different_street'
    # Street-type markers shared by both runs (Ilang-Ilang Street ↔ M.
    # Delos Reyes St.) → street name difference.
    street_markers = {'street', 'st', 'avenue', 'ave', 'road', 'rd',
                      'boulevard', 'blvd', 'drive', 'dr', 'lane', 'ln',
                      'creek', 'river', 'sitio', 'extension', 'ext'}
    if (hs | ns) & street_markers:
        return 'different_street'
    # Differing slot sits where a barangay/street normally sits (second slot,
    # before a shared municipality tail) and is not scope wording → street or
    # sitio/creek/section name.
    if tail >= 1 and min(len(seg_h), len(seg_n)) >= 2:
        return 'different_street'
    return None


def _tail_equal_segments(a: list[list[str]], b: list[list[str]]) -> int:
    """Count of equal trailing comma segments (municipality/province anchor)."""
    equal = 0
    for sa, sb in zip(reversed(a), reversed(b)):
        if sa == sb:
            equal += 1
        else:
            break
    return equal


def diff_tags(house_title: str, nep_title: str) -> list[str]:
    """Classify residual differences between a House title and a NEP title.

    Operates on the same normalized tokens as matching (abbrev expansion,
    repeat collapse, stage-qualifier strip), then tags each opcode from the
    token alignment. Returns a de-duplicated tag list for review UI/mining.
    """
    from difflib import SequenceMatcher

    a, b = _prep_tokens(house_title or ''), _prep_tokens(nep_title or '')

    # Whole-title signals, most specific first:
    # 1. GPS coordinates present on both sides decide same/different site.
    gps_h, gps_n = _gps_coordinates(house_title or ''), _gps_coordinates(nep_title or '')
    gps_tag = None
    if gps_h and gps_n:
        # Compare to 4 decimals (~10 m): same site vs genuinely different point.
        if [g[:g.index('.') + 4] for g in gps_h] == [g[:g.index('.') + 4] for g in gps_n]:
            gps_tag = 'same_gps_coordinates'
        else:
            gps_tag = 'different_gps_coordinates'
    # 2. Parenthetical-only differences (outside tokens equal, paren content
    # differs). Facility qualifiers keep their more specific tag; GPS parens
    # were already handled above; stage-qualifier parens like (Completion)
    # normalize away before the comparison.
    if _PAREN_RE.search(house_title or '') or _PAREN_RE.search(nep_title or ''):
        stripped_h = _prep_tokens(_PAREN_RE.sub(' ', house_title or ''))
        stripped_n = _prep_tokens(_PAREN_RE.sub(' ', nep_title or ''))
        paren_h = set(_prep_tokens(' '.join(_PAREN_RE.findall(house_title or '')))) - WORK_TYPE_TOKENS
        paren_n = set(_prep_tokens(' '.join(_PAREN_RE.findall(nep_title or '')))) - WORK_TYPE_TOKENS
        if stripped_h == stripped_n and paren_h != paren_n \
                and not ((paren_h | paren_n) & FACILITY_QUALIFIER_TOKENS) \
                and not gps_tag:
            return ['parenthetical_modifier']
    seg_h, seg_n = _segments(house_title or ''), _segments(nep_title or '')
    tail = _tail_equal_segments(seg_h, seg_n)
    # Parse-then-compare: place differences come from role-to-role slot
    # comparison (contextual markers), never from opcode alignment.
    parsed_h = parse_title_slots(house_title or '')
    parsed_n = parse_title_slots(nep_title or '')
    place_tags = _slot_pair_tags(parsed_h, parsed_n)
    amend_tags = _amendment_place_tags(
        parsed_h, parsed_n, place_tags, house_title or '', nep_title or '')
    # Corridor endpoint amendments supersede the hard barangay mismatch tag so
    # identity ranking stays usable for attachment.
    if 'point_to_point_barangay' in amend_tags:
        place_tags = [t for t in place_tags if t != 'different_barangay']
    place_tags = place_tags + amend_tags

    matcher = SequenceMatcher(None, a, b, autojunk=False)
    tags: list[str] = []
    for tag, i1, i2, j1, j2 in matcher.get_opcodes():
        if tag == 'equal':
            continue
        hseg, nseg = a[i1:i2], b[j1:j2]
        changed_tokens = set(hseg) ^ set(nseg)
        # Stage-qualifier diffs were already folded by prep; a completion-only
        # opcode here means the qualifier moved without a work-type lead.
        if set(hseg) | set(nseg) <= {'completion'}:
            tags.append('stage_qualifier')
            continue
        if set(hseg) | set(nseg) <= CONNECTOR_TOKENS:
            tags.append('connector_word')
            continue
        if (not hseg or not nseg) and (set(hseg) | set(nseg)) == {'city'}:
            tags.append('city_suffix')
            continue
        if set(hseg) | set(nseg) <= FACILITY_QUALIFIER_TOKENS:
            tags.append('facility_qualifier')
            continue
        if (set(hseg) & WORK_TYPE_TOKENS) and (set(nseg) & WORK_TYPE_TOKENS) \
                and not set(hseg) & set(nseg):
            tags.append('work_type_change')
            continue
        # Mixed opcodes difflib merges across a station boundary decompose
        # into their parts: scope-wording tokens and station tokens tag
        # separately ("… Access Roads, Sta. 27+861" ↔ "… and Utilities, Sta.
        # 28+904" aligns as ['sta','27','861'] ↔ ['and','utilities']).
        # Unit/phase counts keep their more specific tag.
        if not ((not hseg or not nseg) and all(
                re.fullmatch(r'(?:phase[0-9ivx]*|purok|unit|units|[0-9]+)', t)
                for t in (hseg or nseg))):
            scope_tokens = [t for t in hseg + nseg
                            if t in WORK_DESCRIPTOR_TOKENS | _DESCRIPTOR_FUNCTION_TOKENS]
            station_tokens = [t for t in hseg + nseg
                              if re.fullmatch(r'\d+|k\d+|sta|to', t)]
            if scope_tokens and station_tokens and len(scope_tokens) + len(station_tokens) == len(hseg) + len(nseg):
                tags.append('work_descriptor_change')
                tags.append('chainage_digit')
                continue
        # Work-phrase modifier: one side carries work words + "along" around
        # the same location ("Preventive Maintenance along Calapan North Rd").
        if (not hseg or not nseg) and (set(hseg) | set(nseg)) <= WORK_PHRASE_TOKENS \
                and len(set(hseg) | set(nseg)) > 1:
            tags.append('work_phrase_modifier')
            continue
        if all(re.fullmatch(r'\d+|k\d+|sta|to', t) for t in hseg + nseg if t):
            context = (a[i1 - 1] if i1 > 0 else '') or (b[j1 - 1] if j1 > 0 else '')
            if any(t.startswith('k') or t == 'sta' for t in hseg + nseg) \
                    or re.fullmatch(r'k\d+|sta', context or ''):
                tags.append('chainage_digit')
            else:
                tags.append('structure_id_digit')
            continue
        if (not hseg or not nseg) and all(
                re.fullmatch(r'(?:phase[0-9ivx]*|purok|unit|units|[0-9]+)', t)
                for t in (hseg or nseg)):
            tags.append('unit_count')
            continue
        if len(hseg) == 1 and len(nseg) == 1:
            ha, na = hseg[0], nseg[0]
            if min(len(ha), len(na)) >= 4 and SequenceMatcher(None, ha, na).ratio() >= .8:
                tags.append('spelling_ocr')
                continue
        # Place tokens are already classified role-to-role; skip them here so
        # opcodes that land on barangay/street/municipality names don't get a
        # second (wrong) tag. Scope-vocabulary rewording still tags.
        place_tokens = set()
        for role in ('barangay', 'municipality', 'province', 'street', 'zone',
                     'purok', 'sitio', 'chainage'):
            place_tokens.update(parsed_h.get(role) or [])
            place_tokens.update(parsed_n.get(role) or [])
        if changed_tokens and changed_tokens <= place_tokens:
            continue
        if changed_tokens and changed_tokens <= WORK_DESCRIPTOR_TOKENS | _DESCRIPTOR_FUNCTION_TOKENS:
            tags.append('work_descriptor_change')
            continue
        tags.append('other_place_or_word')
    # A whole-title GPS verdict subsumes coordinate-digit token diffs.
    if gps_tag:
        return [gps_tag]
    # Place tags from the slot model lead; opcode tags follow.
    combined = place_tags + tags
    # De-duplicate, keep first-seen order.
    seen: set[str] = set()
    ordered = [t for t in combined if not (t in seen or seen.add(t))]
    return ordered or (['identical'] if a == b else [])


# Identity-score weights for fuzzy suggestion ranking. Hard place mismatches
# (different barangay / municipality) dominate; soft phrasing diffs barely
# move the needle. Amount agreement is a weak supporting signal only —
# amounts never establish identity on their own.
_IDENTITY_PENALTIES = {
    'different_barangay': 0.45,
    'different_municipality': 0.40,
    'different_province': 0.40,
    'different_gps_coordinates': 0.40,
    'different_street': 0.25,
    'other_place_or_word': 0.20,
    'work_type_change': 0.15,
    # Corridor endpoint amendments are softer than a hard barangay swap —
    # the shared origin/municipality still anchors identity.
    'point_to_point_barangay': 0.12,
    'work_descriptor_change': 0.08,
    'chainage_digit': 0.05,
    'structure_id_digit': 0.05,
    'unit_count': 0.04,
    'facility_qualifier': 0.03,
    'city_suffix': 0.02,
    'connector_word': 0.01,
    'work_phrase_modifier': 0.01,
    'stage_qualifier': 0.0,
    'parenthetical_modifier': 0.02,
    'spelling_ocr': 0.0,
    'location_reassignment': 0.0,  # overlay; underlying place tags penalize
    'same_gps_coordinates': -0.05,  # bonus: same site
}


def identity_score(house_title: str, nep_title: str,
                   house_amount: float | None = None,
                   nep_amount: float | None = None,
                   text_similarity: float | None = None) -> dict:
    """Compose a reviewable identity score for a House↔NEP fuzzy pair.

    Returns ``{'score': float 0..1, 'text_similarity': float, 'diff_tags': [...],
    'penalties': {tag: amount}, 'amount_ratio': float|None}``.

    Score starts at text similarity (or 1.0 when not supplied) and subtracts
    per-tag penalties. Different barangay / municipality hard-penalize so a
    high text-similarity pair in different barangays ranks below a lower-
    similarity pair that shares the address. Same GPS coordinates give a
    small bonus. Amount agreement (ratio of smaller to larger) can add up
    to +0.05 when amounts are within 20%, or subtract up to 0.05 when they
    differ by more than 5× — never enough to overturn a place mismatch.
    """
    from difflib import SequenceMatcher
    tags = diff_tags(house_title, nep_title)
    if text_similarity is None:
        a, b = _prep_tokens(house_title or ''), _prep_tokens(nep_title or '')
        text_similarity = SequenceMatcher(None, a, b, autojunk=False).ratio() if a or b else 1.0
    penalties = {}
    score = float(text_similarity)
    for tag in tags:
        if tag in _IDENTITY_PENALTIES:
            penalties[tag] = _IDENTITY_PENALTIES[tag]
            score -= _IDENTITY_PENALTIES[tag]
    amount_ratio = None
    if house_amount and nep_amount and house_amount > 0 and nep_amount > 0:
        amount_ratio = min(house_amount, nep_amount) / max(house_amount, nep_amount)
        if amount_ratio >= 0.8:
            score += 0.05
        elif amount_ratio < 0.2:
            score -= 0.05
    score = max(0.0, min(1.0, round(score, 4)))
    return {
        'score': score,
        'text_similarity': round(float(text_similarity), 4),
        'diff_tags': tags,
        'penalties': penalties,
        'amount_ratio': None if amount_ratio is None else round(amount_ratio, 4),
    }


def _nfkc(value: str) -> str:
    return unicodedata.normalize('NFKC', value or '').strip()


def apply_place_spellings(value: str) -> str:
    """Rewrite known place-name OCR slips to gazetteer spelling."""
    s = value or ''
    for wrong, right in PLACE_NAME_SPELLINGS:
        s = re.sub(re.escape(wrong), right, s, flags=re.I)
    return s


def canonical_office(office: str) -> str:
    """Collapse DEO / regional-office OCR and punctuation twins."""
    if not office:
        return office or ''
    s = re.sub(r'\s+', ' ', _nfkc(office))
    prev = None
    while prev != s:
        prev = s
        s = re.sub(r'(\w)\s*ñ\s*(\w)', r'\1ñ\2', s, flags=re.UNICODE)
    if re.search(r'District Engineering Office$', s, re.I):
        s = re.sub(r'\s*-\s*', ' ', s)
        s = re.sub(r'\s+', ' ', s)
    s = re.sub(
        r'^(Regional Office )([IVXLC]+)([AB])$',
        lambda m: f'{m.group(1)}{m.group(2).upper()}-{m.group(3).upper()}',
        s,
        flags=re.I,
    )
    return apply_place_spellings(s)


def normalize_structure_id_token(token: str) -> str:
    """Rewrite OCR letter-O inside structure/road ID digit runs to zero.

    Patterns like ``Bo0008LB`` / ``FB6oo03LZ`` become ``b00008lb`` /
    ``fb60003lz``. Requires a short letter prefix, a digit/O run of length
    ≥3 that already contains a real digit, and an optional letter suffix —
    so place names like ``Looc`` are left alone.
    """
    m = re.fullmatch(r'([a-z]{1,3}?)([0-9o]{3,})([a-z]{0,4})', token)
    if not m:
        return token
    prefix, num, suffix = m.group(1), m.group(2), m.group(3)
    if 'o' not in num or not re.search(r'\d', num):
        return token
    return prefix + num.replace('o', '0') + suffix


def title_tokens(value: str, *, expand: bool = True, abbreviations: dict[str, str] | None = None) -> list[str]:
    """Tokenize a title; expand abbreviations and collapse consecutive repeats.

    Spaced-ñ OCR (``Las Pi ñ as City``, ``Pe ñ abatan``) collapses before
    split, same as offices. Tokens are split on non-alphanumeric boundaries,
    so Brgy. expands inside hyphenated compounds (e.g. Estrella-Brgy.
    Pamosaingan). Spacing variants like K0001+000 / K0001 + 000 normalize
    alike. Repeated consecutive words (Sta. Sta. Maria) collapse so keys do
    not fuse to stasta. Structure IDs also rewrite OCR ``O`` in digit runs
    (``Bo0008LB`` → ``b00008lb``).
    """
    abbrev = abbreviations if abbreviations is not None else LIVE_TITLE_ABBREVIATIONS
    value = collapse_spaced_n_tilde(value).casefold().replace('\n', ' ')
    tokens: list[str] = []
    for token in re.split(r'[^a-z0-9]+', value):
        if expand:
            token = abbrev.get(token, token)
            token = normalize_structure_id_token(token)
        if token and (not tokens or tokens[-1] != token):
            tokens.append(token)
    return tokens


def title_match_key(value: str, *, abbreviations: dict[str, str] | None = None) -> str:
    """Derived match key — do not replace the printed title.

    Optional ``barangay`` / ``brgy`` label tokens are omitted so
    ``… Blvd. Brgy Pulo …`` and ``… Blvd. Pulo …`` share a key after
    abbreviation expansion.
    """
    return ''.join(
        t for t in title_tokens(value, expand=True, abbreviations=abbreviations)
        if t != 'barangay'
    )


# Back-compat alias used throughout builders/tests.
normalized = title_match_key


def annotate_source_labels(row: dict) -> dict:
    """Attach derived label fields; keep printed title/office.

    Adds ``title_match_key``, ``office_canonical``, and when chainage parses:
    ``title_base``, ``title_base_match_key``, ``chainages``,
    ``chainage_incomplete``, ``chainage_length_review`` (worst span flag).
    House reading keys still use raw ``office`` + full ``title_match_key``.
    """
    from chainage import (
        LENGTH_REVIEW_ABSURD,
        LENGTH_REVIEW_REPAIRED,
        parse_chainage,
    )

    title = row.get('title') or ''
    office = row.get('office') or ''
    row['title_match_key'] = title_match_key(title)
    row['office_canonical'] = canonical_office(office)
    parsed = parse_chainage(title)
    row['title_base'] = parsed['title_base'] or title
    row['chainages'] = parsed['chainages']
    row['chainage_incomplete'] = parsed['incomplete']
    reviews = {c.get('length_review') for c in parsed['chainages'] if c.get('length_review')}
    if LENGTH_REVIEW_ABSURD in reviews:
        row['chainage_length_review'] = LENGTH_REVIEW_ABSURD
    elif LENGTH_REVIEW_REPAIRED in reviews:
        row['chainage_length_review'] = LENGTH_REVIEW_REPAIRED
    else:
        row['chainage_length_review'] = None
    row['title_base_match_key'] = title_match_key(row['title_base'])
    return row


def raw_normalized(value: str) -> str:
    """Baseline without abbreviation expansion or repeat collapse.

    Exact pairs whose raw titles differ under this baseline matched only
    because of the live normalization rules; they carry a review reason.
    """
    value = _nfkc(value).casefold().replace('\n', ' ')
    return re.sub(r'[^a-z0-9]', '', value)


def digits_omitted(value: str) -> str:
    """Same road with different chainage/station numbers."""
    return re.sub(r'\d+', '', title_match_key(value))


def collapse_spaced_n_tilde(value: str) -> str:
    """Apply the same spaced-ñ collapse used for offices to any label."""
    s = re.sub(r'\s+', ' ', _nfkc(value))
    prev = None
    while prev != s:
        prev = s
        s = re.sub(r'(\w)\s*ñ\s*(\w)', r'\1ñ\2', s, flags=re.UNICODE)
    return s


def classify_title_substitution(house_seg: tuple[str, ...], nep_seg: tuple[str, ...]) -> str:
    """Return promote | reject | review for one aligned token substitution."""
    if not house_seg and not nep_seg:
        return 'reject'
    if _all_digits(house_seg) or _all_digits(nep_seg):
        return 'reject'
    h = frozenset(house_seg)
    n = frozenset(nep_seg)
    pair = h | n
    if pair in PROMOTE_TITLE_PAIRS:
        return 'promote'
    live_and_pending = {**LIVE_TITLE_ABBREVIATIONS, **PENDING_TITLE_ABBREVIATIONS}
    if len(house_seg) == 1 and len(nep_seg) == 1:
        a, b = house_seg[0], nep_seg[0]
        if frozenset({a, b}) in REJECT_TITLE_PAIRS:
            return 'reject'
        if a in WORK_TYPE_TOKENS and b in WORK_TYPE_TOKENS and a != b:
            return 'reject'
        if a in live_and_pending and live_and_pending[a] == b:
            return 'promote'
        if b in live_and_pending and live_and_pending[b] == a:
            return 'promote'
        if min(len(a), len(b)) >= 5 and SequenceMatcher(None, a, b).ratio() >= 0.85:
            if not (a in WORK_TYPE_TOKENS or b in WORK_TYPE_TOKENS):
                return 'promote'
    return 'review'


def _all_digits(seg: tuple[str, ...]) -> bool:
    return bool(seg) and all(t.isdigit() or re.fullmatch(r'k\d+', t) for t in seg)
