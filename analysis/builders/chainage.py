"""Parse road/project titles into title_base + structured chainage spans.

Follows the BetterGov NEP OCR chainage inventory: compact shadow for matching,
letter→digit OCR only inside station tokens, printed title left unchanged.
"""

from __future__ import annotations

import re
import unicodedata
from typing import Any

# Letter→digit inside station numeric runs only (never on road titles).
_STATION_OCR = str.maketrans({
    'O': '0', 'o': '0',
    'I': '1', 'l': '1', '|': '1', '!': '1',
    'S': '5', 's': '5',
    'B': '8',
    'Z': '2',
    'G': '6',
    '?': '7',
})

_DASHES = (
    '\u2022', '\u2219', '\u25cf',  # bullets
    '\u00b7',  # middle dot
    '\u2013', '\u2014', '\u2212',  # en/em/minus
    '\u223c', '~', '\u301c',
)


def preprocess_chainage_text(value: str) -> str:
    """Unify range separators before detection."""
    s = unicodedata.normalize('NFKC', value or '')
    for ch in _DASHES:
        s = s.replace(ch, '-')
    s = re.sub(r'\bto\b', '-', s, flags=re.I)
    s = re.sub(r'\s+', ' ', s).strip()
    return s


def _compact_shadow(value: str) -> tuple[str, list[int]]:
    """Remove whitespace; return compact text and map compact→original index."""
    s = preprocess_chainage_text(value)
    compact: list[str] = []
    mapping: list[int] = []
    for i, ch in enumerate(s):
        if ch.isspace():
            continue
        compact.append(ch)
        mapping.append(i)
    return ''.join(compact), mapping


def _digitize_station_body(body: str) -> str:
    return body.translate(_STATION_OCR)


def _digitize_shadow(compact: str) -> str:
    """Letter→digit only on digit-ish runs so STA/CHAINAGE keywords stay intact."""
    return re.sub(
        r'[0-9OlISBGZ?]{2,}',
        lambda m: m.group(0).translate(_STATION_OCR),
        compact,
    )


# Single listed patch longer than this is almost always OCR (extra km digit,
# mangled offset). Reverse-direction flood-control spans stay under the cap.
_MAX_SPAN_M = 20_000

# Per-span length_review values (None = trusted as printed).
LENGTH_REVIEW_REPAIRED = 'repaired_km_ocr'
LENGTH_REVIEW_ABSURD = 'absurd_unresolved'


def _station_parts(kind: str, token: str) -> tuple[int, float] | None:
    """Return (km, offset_m) for a compact station token."""
    token = token.strip()
    if kind == 'Chainage':
        body = re.sub(r'^chainage', '', token, flags=re.I)
        if re.fullmatch(r'\d+(?:\.\d+)?', body):
            return 0, float(body)
        token = body
    m = re.fullmatch(
        r'(?:KM|K|C[O0]?|STA\.?)?'
        r'(\d+)\+'
        r'(?:\((-?\d+(?:\.\d+)?)\)|(-?\d+(?:\.\d+)?))',
        token,
        flags=re.I,
    )
    if not m:
        return None
    km = int(m.group(1))
    offset = float(m.group(2) if m.group(2) is not None else m.group(3))
    return km, offset


def _station_meters(kind: str, token: str) -> int | None:
    """Convert a compact station token to approximate meters along the road."""
    parts = _station_parts(kind, token)
    if parts is None:
        return None
    km, offset = parts
    return int(round(km * 1000 + offset))


def _rebuild_endpoint(kind: str, token: str, km: int, offset: float) -> str:
    """Rewrite a normalized endpoint with a repaired km (display / audit)."""
    if offset < 0:
        offset_s = f'({offset:g})'
    elif offset != int(offset):
        offset_s = f'{offset:g}'
    else:
        offset_s = f'{int(offset):03d}'
    if kind == 'K':
        width = 4
        m = re.match(r'K(\d+)\+', token, flags=re.I)
        if m:
            width = max(4, len(m.group(1)))
        return f'K{km:0{width}d}+{offset_s}'
    if kind == 'KM':
        return f'KM{km}+{offset_s}'
    if kind == 'Sta':
        return f'{km}+{offset_s}'
    if kind == 'C':
        if token.upper().startswith('C0'):
            return f'C0+{offset_s}'
        return f'C{km}+{offset_s}'
    return token


def _resolve_span_length(
    kind: str,
    frm: str,
    to: str,
    meters_from: int | None,
    meters_to: int | None,
) -> dict[str, Any]:
    """Compute length; repair absurd OCR km digits and always flag edits.

    Printed ``from`` / ``to`` stay as parsed. When kilometer digits are
    rewritten for a plausible length, ``length_from`` / ``length_to`` hold
    the interpretation and ``length_review`` is ``repaired_km_ocr``. When no
    repair fits, ``length_m`` is null and ``length_review`` is
    ``absurd_unresolved``.
    """
    out: dict[str, Any] = {
        'meters_from': meters_from,
        'meters_to': meters_to,
        'length_m': None,
        'length_review': None,
        'length_from': None,
        'length_to': None,
    }
    if meters_from is None or meters_to is None:
        return out

    raw_length = abs(meters_to - meters_from)
    parts_from = _station_parts(kind, frm)
    parts_to = _station_parts(kind, to)
    if parts_from is None or parts_to is None:
        out['length_m'] = raw_length
        return out

    km_a, off_a = parts_from
    km_b, off_b = parts_to
    if raw_length <= _MAX_SPAN_M:
        out['length_m'] = raw_length
        return out

    candidates: list[tuple[int, str, str, int, int]] = []

    def consider(new_frm: str, new_to: str) -> None:
        mf = _station_meters(kind, new_frm)
        mt = _station_meters(kind, new_to)
        if mf is None or mt is None:
            return
        span = abs(mt - mf)
        if span == 0 or span > _MAX_SPAN_M:
            return
        # Prefer repairs that change an endpoint (not the raw absurd pair).
        if new_frm == frm and new_to == to:
            return
        candidates.append((span, new_frm, new_to, mf, mt))

    consider(_rebuild_endpoint(kind, frm, km_b, off_a), to)
    consider(frm, _rebuild_endpoint(kind, to, km_a, off_b))
    for km_big, km_small, which in ((km_a, km_b, 'from'), (km_b, km_a, 'to')):
        s_big, s_small = str(km_big), str(km_small)
        if len(s_big) <= len(s_small):
            continue
        for i in range(len(s_big)):
            trial = s_big[:i] + s_big[i + 1:]
            if trial.lstrip('0') != s_small.lstrip('0') and trial != s_small:
                continue
            new_km = int(trial or '0')
            if which == 'from':
                consider(_rebuild_endpoint(kind, frm, new_km, off_a), to)
            else:
                consider(frm, _rebuild_endpoint(kind, to, new_km, off_b))

    if candidates:
        candidates.sort(key=lambda t: (t[0], t[3], t[4]))
        span, length_from, length_to, mf, mt = candidates[0]
        out.update({
            'meters_from': mf,
            'meters_to': mt,
            'length_m': span,
            'length_review': LENGTH_REVIEW_REPAIRED,
            'length_from': length_from,
            'length_to': length_to,
        })
        return out

    out['length_review'] = LENGTH_REVIEW_ABSURD
    return out


def _norm_endpoint(kind: str, raw: str) -> str:
    raw = raw.replace(' ', '')
    if kind == 'K':
        raw = re.sub(r'^[Kk][Mm]?', 'K', raw)
        if not raw.upper().startswith('K'):
            raw = 'K' + raw
        return 'K' + _digitize_station_body(raw[1:])
    if kind == 'KM':
        raw = re.sub(r'^[Kk][Mm]', 'KM', raw)
        return 'KM' + _digitize_station_body(raw[2:] if raw.upper().startswith('KM') else raw)
    if kind == 'Sta':
        body = re.sub(r'^sta\.?', '', raw, flags=re.I)
        return _digitize_station_body(body)
    if kind == 'C':
        raw = re.sub(r'^[Cc][Oo0](?=\+)', 'C0', raw)
        raw = re.sub(r'^[Cc](?=\d+\+)', 'C', raw)
        if raw.startswith('C0'):
            return 'C0' + _digitize_station_body(raw[2:])
        if raw.startswith('C'):
            return 'C' + _digitize_station_body(raw[1:])
        return _digitize_station_body(raw)
    if kind == 'Chainage':
        body = re.sub(r'^chainage', '', raw, flags=re.I)
        return 'Chainage' + _digitize_station_body(body)
    return _digitize_station_body(raw)


# Compact patterns (no spaces). Order: longer / more specific first.
_RANGE_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ('K', re.compile(
        r'K\d{2,5}\+(?:\(-?\d+(?:\.\d+)?\)|-?\d+(?:\.\d+)?)'
        r'-K\d{2,5}\+(?:\(-?\d+(?:\.\d+)?\)|-?\d+(?:\.\d+)?)',
        re.I,
    )),
    ('KM', re.compile(
        r'KM\d{1,5}\+(?:\(-?\d+(?:\.\d+)?\)|-?\d+(?:\.\d+)?)'
        r'-KM\d{1,5}\+(?:\(-?\d+(?:\.\d+)?\)|-?\d+(?:\.\d+)?)',
        re.I,
    )),
    ('Sta', re.compile(
        r'STA\.?\d+(?:\.\d+)?\+(?:\(-?\d+(?:\.\d+)?\)|-?\d+(?:\.\d+)?)'
        r'-STA\.?\d+(?:\.\d+)?\+(?:\(-?\d+(?:\.\d+)?\)|-?\d+(?:\.\d+)?)',
        re.I,
    )),
    ('Sta', re.compile(
        r'STA\.?\d+(?:\.\d+)?\+(?:\(-?\d+(?:\.\d+)?\)|-?\d+(?:\.\d+)?)'
        r'-\d+(?:\.\d+)?\+(?:\(-?\d+(?:\.\d+)?\)|-?\d+(?:\.\d+)?)',
        re.I,
    )),
    ('C', re.compile(
        r'C[O0]?\d*\+(?:\(-?\d+(?:\.\d+)?\)|-?\d+(?:\.\d+)?)'
        r'-C[O0]?\d*\+(?:\(-?\d+(?:\.\d+)?\)|-?\d+(?:\.\d+)?)',
        re.I,
    )),
    ('Chainage', re.compile(
        r'CHAINAGE\d+(?:\.\d+)?(?:\+\d+(?:\.\d+)?)?-CHAINAGE\d+(?:\.\d+)?(?:\+\d+(?:\.\d+)?)?',
        re.I,
    )),
    ('Chainage', re.compile(
        r'CHAINAGE\d+(?:\.\d+)?(?:\+\d+(?:\.\d+)?)?-\d+(?:\.\d+)?(?:\+\d+(?:\.\d+)?)?',
        re.I,
    )),
]

# Single station points (bridge markers, etc.) — only used where no range matched.
_POINT_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ('K', re.compile(
        r'K\d{2,5}\+(?:\(-?\d+(?:\.\d+)?\)|-?\d+(?:\.\d+)?)',
        re.I,
    )),
    ('KM', re.compile(
        r'KM\d{1,5}\+(?:\(-?\d+(?:\.\d+)?\)|-?\d+(?:\.\d+)?)',
        re.I,
    )),
    ('Sta', re.compile(
        r'STA\.?\d+(?:\.\d+)?\+(?:\(-?\d+(?:\.\d+)?\)|-?\d+(?:\.\d+)?)',
        re.I,
    )),
    ('C', re.compile(
        r'C[O0]?\d*\+(?:\(-?\d+(?:\.\d+)?\)|-?\d+(?:\.\d+)?)',
        re.I,
    )),
    ('Chainage', re.compile(
        r'CHAINAGE\d+(?:\.\d+)?(?:\+\d+(?:\.\d+)?)?',
        re.I,
    )),
]

_INCOMPLETE = re.compile(
    r'(?:K\d{2,5}\+|STA\.?\d+\+|CHAINAGE\d+-CHAINAGE?|CHAINAGE\d+)$',
    re.I,
)


def _split_range(kind: str, matched: str) -> tuple[str, str] | None:
    """Split on the range dash between endpoints (not inside parentheses)."""
    depth = 0
    cut = None
    for i, ch in enumerate(matched):
        if ch == '(':
            depth += 1
        elif ch == ')':
            depth = max(0, depth - 1)
        elif ch == '-' and depth == 0 and i > 0:
            cut = i
            break
    if cut is None:
        return None
    left, right = matched[:cut], matched[cut + 1:]
    if kind == 'Sta' and not re.match(r'sta', right, flags=re.I):
        right = 'Sta.' + right
    if kind == 'Chainage' and not re.match(r'chainage', right, flags=re.I):
        right = 'Chainage' + right
    return left, right


def parse_chainage(title: str) -> dict[str, Any]:
    """Return title_base, chainages[], incomplete for one printed title."""
    original = unicodedata.normalize('NFKC', title or '').strip()
    if not original:
        return {'title_base': '', 'chainages': [], 'incomplete': False}

    compact, mapping = _compact_shadow(original)
    shadow = _digitize_shadow(compact)

    spans: list[tuple[int, int, dict[str, Any]]] = []
    incomplete = bool(_INCOMPLETE.search(shadow))
    for kind, pattern in _RANGE_PATTERNS:
        for m in pattern.finditer(shadow):
            pair = _split_range(kind, m.group(0))
            if not pair:
                continue
            left, right = pair
            frm = _norm_endpoint(kind, left)
            to = _norm_endpoint(kind, right)
            if kind == 'Sta':
                frm = re.sub(r'^sta\.?', '', frm, flags=re.I)
                to = re.sub(r'^sta\.?', '', to, flags=re.I)
            meters_from = _station_meters(kind, frm)
            meters_to = _station_meters(kind, to)
            resolved = _resolve_span_length(kind, frm, to, meters_from, meters_to)
            if resolved.get('length_review'):
                incomplete = True
            entry = {
                'kind': kind,
                'from': frm,
                'to': to,
                'meters_from': resolved['meters_from'],
                'meters_to': resolved['meters_to'],
                'length_m': resolved['length_m'],
                'length_review': resolved['length_review'],
                'length_from': resolved['length_from'],
                'length_to': resolved['length_to'],
                'point': False,
            }
            spans.append((m.start(), m.end(), entry))

    # Point stations only where a range did not already claim the text.
    occupied_ranges = [(a, b) for a, b, _ in spans]
    for kind, pattern in _POINT_PATTERNS:
        for m in pattern.finditer(shadow):
            start, end = m.start(), m.end()
            if any(not (end <= a or start >= b) for a, b in occupied_ranges):
                continue
            token = _norm_endpoint(kind, m.group(0))
            if kind == 'Sta':
                token = re.sub(r'^sta\.?', '', token, flags=re.I)
            meters = _station_meters(kind, token)
            entry = {
                'kind': kind,
                'from': token,
                'to': token,
                'meters_from': meters,
                'meters_to': meters,
                'length_m': None,
                'length_review': None,
                'length_from': None,
                'length_to': None,
                'point': True,
            }
            spans.append((start, end, entry))
            occupied_ranges.append((start, end))

    if not spans:
        return {'title_base': original, 'chainages': [], 'incomplete': incomplete}

    # Drop overlapping shorter matches; keep earliest-longest.
    spans.sort(key=lambda t: (t[0], -(t[1] - t[0])))
    kept: list[tuple[int, int, dict[str, Any]]] = []
    occupied: list[tuple[int, int]] = []
    for start, end, entry in spans:
        if any(not (end <= a or start >= b) for a, b in occupied):
            continue
        kept.append((start, end, entry))
        occupied.append((start, end))
    kept.sort(key=lambda t: t[0])

    # Build title_base by removing matched spans from the original (via mapping).
    remove: list[tuple[int, int]] = []
    for start, end, _ in kept:
        if start >= len(mapping) or end - 1 >= len(mapping):
            continue
        remove.append((mapping[start], mapping[end - 1] + 1))
    remove.sort()
    merged: list[list[int]] = []
    for a, b in remove:
        if merged and a <= merged[-1][1]:
            merged[-1][1] = max(merged[-1][1], b)
        else:
            merged.append([a, b])

    preprocessed = preprocess_chainage_text(original)
    parts: list[str] = []
    cursor = 0
    for a, b in merged:
        parts.append(preprocessed[cursor:a])
        cursor = b
    parts.append(preprocessed[cursor:])
    base = ' '.join(p.strip(' ,;-') for p in parts if p.strip(' ,;-'))
    base = re.sub(r'\s+,', ',', base)
    base = re.sub(r',\s*', ', ', base)
    base = re.sub(r'\s+', ' ', base).strip(' ,;-')
    base = re.sub(r'\(\s*\)', '', base).strip(' ,;-')
    if not base:
        base = original

    return {
        'title_base': base,
        'chainages': [e for _, _, e in kept],
        'incomplete': incomplete,
    }


def total_length_m(chainages: list[dict[str, Any]]) -> int | None:
    lengths = [c['length_m'] for c in chainages if c.get('length_m') is not None]
    if not lengths:
        return None
    return sum(lengths)


def chainage_signature(chainages: list[dict[str, Any]]) -> str:
    if not chainages:
        return ''
    return '|'.join(f"{c['kind']}:{c.get('from','')}-{c.get('to','')}" for c in chainages)


def classify_chainage_amendment(
    house_chainages: list[dict[str, Any]],
    nep_chainages: list[dict[str, Any]],
) -> str:
    """Explain how two same-base chainage sets differ."""
    if chainage_signature(house_chainages) == chainage_signature(nep_chainages):
        return 'same chainage after normalization'
    h_len = total_length_m(house_chainages)
    n_len = total_length_m(nep_chainages)
    if h_len is not None and n_len is not None and h_len and n_len:
        delta = h_len - n_len
        # Small relative length change with different endpoints → marker shift.
        if abs(delta) <= max(20, 0.05 * max(h_len, n_len)):
            return 'adjustment of station markers'
        if delta > 0:
            return 'increased project length'
        if delta < 0:
            return 'decreased project length'
    if len(house_chainages) != len(nep_chainages):
        return 're-segmentation'
    return 'adjustment of station markers'
