"""Single home for label-normalization rules.

Raw extracted titles/offices stay on source records. Builders call
``annotate_source_labels`` to attach derived fields without overwriting print:

- ``title_match_key`` / ``normalized`` — live title keys (Brgy./repeat/places)
- ``office_canonical`` / ``canonical_office`` — DEO / place / punctuation twins
- ``PENDING_TITLE_ABBREVIATIONS`` — mined rules not yet wired into matching
"""

from __future__ import annotations

import re
import unicodedata
from difflib import SequenceMatcher

# Already applied by project matching and House reading keys.
LIVE_TITLE_ABBREVIATIONS = {
    'brgy': 'barangay',
    # Place-name OCR slips (NEP) → House / gazetteer spelling.
    'marindugue': 'marinduque',
    'siguijor': 'siquijor',
}

# Surface forms for offices (and any non-tokenized label). Keys are the OCR
# slips; values are the printed House / gazetteer spellings.
PLACE_NAME_SPELLINGS = (
    ('Marindugue', 'Marinduque'),
    ('Siguijor', 'Siquijor'),
)

# Mined / reviewed candidates — not used by matching until explicitly merged
# into LIVE_TITLE_ABBREVIATIONS after a rebuild.
PENDING_TITLE_ABBREVIATIONS = {
    'bldg': 'building',
    'bidg': 'building',  # OCR slip for Bldg.
}

# Closed-class substitutions for mining triage (spelling/abbrev only).
PROMOTE_TITLE_PAIRS = {
    frozenset({'building', 'bldg'}),
    frozenset({'building', 'bidg'}),
    frozenset({'buidling', 'building'}),
    frozenset({'constuction', 'construction'}),
    frozenset({'coverd', 'covered'}),
    frozenset({'marindugue', 'marinduque'}),
    frozenset({'siguijor', 'siquijor'}),
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

    Tokens are split on non-alphanumeric boundaries first, so Brgy. expands
    inside hyphenated compounds (e.g. Estrella-Brgy. Pamosaingan). Spacing
    variants like K0001+000 / K0001 + 000 normalize alike. Repeated consecutive
    words (Sta. Sta. Maria) collapse so keys do not fuse to stasta. Structure
    IDs also rewrite OCR ``O`` in digit runs (``Bo0008LB`` → ``b00008lb``).
    """
    abbrev = abbreviations if abbreviations is not None else LIVE_TITLE_ABBREVIATIONS
    value = _nfkc(value).casefold().replace('\n', ' ')
    tokens: list[str] = []
    for token in re.split(r'[^a-z0-9]+', value):
        if expand:
            token = abbrev.get(token, token)
            token = normalize_structure_id_token(token)
        if token and (not tokens or tokens[-1] != token):
            tokens.append(token)
    return tokens


def title_match_key(value: str, *, abbreviations: dict[str, str] | None = None) -> str:
    """Derived match key — do not replace the printed title."""
    return ''.join(title_tokens(value, expand=True, abbreviations=abbreviations))


# Back-compat alias used throughout builders/tests.
normalized = title_match_key


def annotate_source_labels(row: dict) -> dict:
    """Attach derived label fields; keep printed title/office.

    Adds ``title_match_key``, ``office_canonical``, and when chainage parses:
    ``title_base``, ``title_base_match_key``, ``chainages``, ``chainage_incomplete``.
    House reading keys still use raw ``office`` + full ``title_match_key``.
    """
    from chainage import parse_chainage

    title = row.get('title') or ''
    office = row.get('office') or ''
    row['title_match_key'] = title_match_key(title)
    row['office_canonical'] = canonical_office(office)
    parsed = parse_chainage(title)
    row['title_base'] = parsed['title_base'] or title
    row['chainages'] = parsed['chainages']
    row['chainage_incomplete'] = parsed['incomplete']
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
