#!/usr/bin/env python3
"""Build current source-control dashboards from retained, hashed inputs.

No PDF extraction or network dependency. Project matches are review candidates,
never confirmed additions/removals. Duplicate exact keys remain ambiguous.
"""

import sys
from pathlib import Path as _Path
sys.path[:0] = [str(_Path(__file__).resolve().parents[1]), str(_Path(__file__).resolve().parents[1] / 'builders')]
from paths import ANALYSIS, REPO, DATA, VIEWERS, DOCS, ARCHIVE, EVIDENCE
from house_native import comparison_inputs, office_from_region_parent, validate_native_detail
from chainage import chainage_signature, classify_chainage_amendment
from normalize_labels import (
    annotate_source_labels, diff_tags, digits_omitted, identity_score,
    normalized, raw_normalized, strip_stage_qualifier,
)

import hashlib
import json
import re
import unicodedata
from collections import Counter, defaultdict
from datetime import datetime
from difflib import SequenceMatcher
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = REPO
OUT = DATA
VIEWER_OUT = VIEWERS
INPUTS = ['nep_2027_tree.json', 'nep_2027_tree_validation.json',
          'nep_2027_source_projects.json', 'nep_2027_budget_units.json',
          'nep_2027_native_amount_audit.json', 'nep_2027_native_amount_review.json',
          'hb_dpwh_native_ic_projects.json', 'hb_dpwh_native_ic_rollup_audit.json',
          'hb_dpwh_native_rollup.json', 'hb_native_ib_rollup_audit.json', 'nep_2027_api_reconciliation.json']
METHOD = ('Unique normalized title + canonical region + canonical PAP node ID '
          '(FAP uses program and zone), one-to-one exact candidates. Titles are '
          'normalized token-wise: common abbreviation variants (Brgy./Barangay) '
          'and place-name OCR slips (Marindugue/Marinduque, Siguijor/Siquijor) '
          'expand before matching; structure/road IDs rewrite OCR letter O in '
          'digit runs (Bo0008LB/B00008LB); consecutive repeated tokens collapse. '
          'Titles also parse into title_base + chainage spans (K/Sta/C/Chainage); '
          'unique same-base differing stations attach as chainage matches with '
          'reasons (station-marker adjustment, length change, re-segmentation) '
          'and amount deltas like exact pairs. '
          'Amount does not determine identity. Duplicate keys remain ambiguous. '
          'FAP loans additionally pair across differing program sections '
          '(I-C National Building Program vs NEP Local Program) when the '
          'normalized title, region and funding zone are each unique. '
          'A guarded fallback then pairs remaining rows when titles differ only '
          'by a stage qualifier after the work type (Construction (Completion) '
          'vs Construction) and the stripped key is unique on both sides of the '
          'same scope — dual line items that keep both variants stay unmatched. '
          'Remaining House rows receive up to three fuzzy suggestions within the same '
          'region/PAP/zone, top-20 token-overlap shortlist (ties ordered by source ID), then SequenceMatcher >=0.85; '
          'unique same title_base with different chainage spans (or digit-only title diffs) '
          'attach as chainage matches (consume NEP). '
          'Suggestions do not consume NEP rows. No pair has been manually certified.')


def read(name):
    return json.loads((OUT / name).read_text())


def write(name, data):
    (OUT / name).write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


# Title match keys (Brgy./repeat), office_canonical, and digits_omitted live in
# normalize_labels so matching, mining, and annotate_source_labels share one home.


def fap_control_row(ic, tree, house, nep):
    """Keep the printed FAP control separate from local PAPs and funding parts."""
    from house_native import walk
    h = next(n for n in walk(ic['root']) if n['label'] == 'FOREIGN-ASSISTED PROJECTS')
    n = next(n for n in tree['nodes'] if n['label'] == 'FOREIGN-ASSISTED PROJECTS')
    hr = [r for r in house if r['zone'] == 'fap']
    nr = [r for r in nep if r['zone'] == 'fap']
    extracted = sum(r['amount_php'] for r in hr)
    assert extracted == h['printed_amount_php']
    assert sum(r['amount_php'] for r in nr) == n['amount_php']
    return {'id': n['id'], 'label': 'Foreign-assisted projects (FAP)',
            'program': 'Foreign-assisted projects', 'zone': 'fap',
            'house_printed_php': h['printed_amount_php'], 'house_extracted_php': extracted,
            'nep_printed_php': n['amount_php'], 'coverage_difference_php': 0,
            'api_coverage_php': None, 'source_api_gap_php': None,
            'delta_php': h['printed_amount_php'] - n['amount_php'],
            'comparison_status': 'exact_controls' if h['printed_amount_php'] == n['amount_php'] else 'control_difference',
            'house_pages': [h['source']['pdf_page']], 'nep_page': n['source']['pdf_page'],
            'regions': [{'region': reg,
                         'house_extracted_php': sum(r['amount_php'] for r in hr if r['region'] == reg),
                         'nep_source_php': sum(r['amount_php'] for r in nr if r['region'] == reg)}
                        for reg in sorted({r['region'] for r in hr + nr})]}


def region(value):
    value = unicodedata.normalize('NFKC', value or '').strip()
    aliases = {'national capital region': 'NCR', 'ncr': 'NCR',
               'cordillera administrative region': 'CAR', 'car': 'CAR',
               'mimaropa region': 'MIMAROPA', 'mimaropa': 'MIMAROPA',
               'negros island region': 'NIR', 'negros island region (nir)': 'NIR',
               'nir': 'NIR', 'nationwide': 'Nationwide',
               'barmm': 'Nationwide', 'bangsamoro autonomous region in muslim mindanao': 'Nationwide'}
    if value.casefold() in aliases:
        return aliases[value.casefold()]
    return re.sub(r'^(?:egion|region)\s+', 'Region ', value, flags=re.I)


def scope_key(row):
    return row['zone'], row['pap_id'] if row['zone'] == 'local' else row['program'], row['region']


def _span_center(ch: dict) -> float | None:
    if ch.get('meters_from') is not None and ch.get('meters_to') is not None:
        return (ch['meters_from'] + ch['meters_to']) / 2
    return None


def _chainage_proximity(house_row, nep_row) -> tuple[int, int]:
    """Rank candidates by chainage-span proximity, then amount closeness.

    Returns (span_distance_m, amount_distance_php) — smaller sorts first.
    Span distance is the minimum center-to-center distance between the two
    rows' station spans; falls back to a large constant when meters are
    missing so chainage-bearing candidates rank ahead of span-less ones.
    """
    h_centers = [c for c in (_span_center(x) for x in house_row.get('chainages') or []) if c is not None]
    n_centers = [c for c in (_span_center(x) for x in nep_row.get('chainages') or []) if c is not None]
    if h_centers and n_centers:
        span_distance = int(min(abs(a - b) for a in h_centers for b in n_centers))
    else:
        span_distance = 10**9
    ha, na = house_row.get('amount_php'), nep_row.get('amount_php')
    amount_distance = abs((ha or 0) - (na or 0)) if ha is not None and na is not None else 10**15
    return span_distance, amount_distance


def _title_key(row):
    return row.get('title_match_key') or normalized(row['title'])


def _base_key(row):
    return row.get('title_base_match_key') or _title_key(row)


def _chainage_amendment_reason(house_row, nep_row):
    """Classify same-base chainage diffs; fall back to legacy digits_omitted."""
    h_ch = house_row.get('chainages') or []
    n_ch = nep_row.get('chainages') or []
    if h_ch and n_ch:
        detail = classify_chainage_amendment(h_ch, n_ch)
        return (
            f'Same road title_base with differing chainage ({detail}). '
            'Possible coverage amendment, not a new insertion.'
        )
    if digits_omitted(house_row['title']) == digits_omitted(nep_row['title']):
        return (
            'Same title with only chainage or station numbers differing; '
            'possible re-segmentation or coverage amendment, not a new insertion.'
        )
    return None


def _is_chainage_pair(house_row, nep_row):
    """True when titles share a road base but differ only in chainage/stations."""
    h_ch = house_row.get('chainages') or []
    n_ch = nep_row.get('chainages') or []
    if _base_key(house_row) == _base_key(nep_row) and h_ch and n_ch:
        return chainage_signature(h_ch) != chainage_signature(n_ch)
    h_digits = digits_omitted(house_row['title'])
    return bool(h_digits) and h_digits == digits_omitted(nep_row['title'])


def _attach_chainage(house_row, nep_row, confidence=1.0):
    return {
        'status': 'chainage_candidate',
        'confidence': confidence,
        'house': house_row,
        'nep': nep_row,
        'delta_php': house_row['amount_php'] - nep_row['amount_php'],
        'reason': _chainage_amendment_reason(house_row, nep_row),
    }


_LOCATION_AMENDMENT_TAGS = frozenset({
    'location_reassignment', 'point_to_point_barangay',
})


def _location_amendment_tags(suggestion):
    return [t for t in (suggestion.get('diff_tags') or []) if t in _LOCATION_AMENDMENT_TAGS]


def _location_amendment_reason(house_row, nep_row, tags):
    if 'point_to_point_barangay' in tags:
        return (
            'Same road project shell with a point-to-point barangay corridor '
            'change (endpoint added, dropped, or reassigned). Treat as a '
            'location amendment, not a new insertion.'
        )
    if 'location_reassignment' in tags:
        detail = diff_tags(house_row['title'], nep_row['title'])
        moved = [t for t in detail if t.startswith('different_')]
        which = ', '.join(moved) if moved else 'place slot'
        return (
            f'Same project shell with a relocated {which.replace("different_", "")}. '
            'Possible location reassignment amendment, not a new insertion.'
        )
    return (
        'Same project shell with a relocated place slot. Possible location '
        'amendment, not a new insertion.'
    )


def _attach_location_amendment(house_row, nep_row, suggestion):
    tags = _location_amendment_tags(suggestion)
    return {
        'status': 'location_amendment_candidate',
        'confidence': suggestion.get('confidence', 1.0),
        'house': house_row,
        'nep': nep_row,
        'delta_php': house_row['amount_php'] - nep_row['amount_php'],
        'diff_tags': suggestion.get('diff_tags') or [],
        'identity_score': suggestion.get('identity_score'),
        'reason': _location_amendment_reason(house_row, nep_row, tags),
    }


def _is_soft_attach(suggestion):
    """Tier-1 OCR/punct or Tier-2 facility-only pairs eligible for soft attach.

    Requires equal amounts. Provenance stays on the attached record via
    ``diff_tags``, ``identity_score``, and a typed ``reason`` — never a
    silent exact match.
    """
    tags = set(suggestion.get('diff_tags') or []) - {'identical'}
    score = suggestion.get('identity_score') or 0
    ar = suggestion.get('amount_ratio')
    if ar != 1.0:
        return False
    if tags <= {'spelling_ocr'} and score >= 0.95:
        return True
    if tags == {'facility_qualifier'} and score >= 0.94:
        return True
    # Empty tags: punctuation / LD suffix / sub-barangay detail that the slot
    # model does not hard-flag (e.g. Purok 4-A added, Sitio Cumbahan added).
    if not tags and score >= 0.95:
        return True
    return False


def _soft_match_reason(suggestion):
    tags = [t for t in (suggestion.get('diff_tags') or []) if t != 'identical']
    score = suggestion.get('identity_score')
    score_bit = f' identity_score={score:.2f}.' if score is not None else ''
    if tags == ['facility_qualifier']:
        return (
            'Same project shell; titles differ only by a facility qualifier '
            '(Gym / Gymnasium / Covered Court). Soft-attached after review; '
            f'tag=facility_qualifier.{score_bit}'
        )
    if tags == ['spelling_ocr']:
        return (
            'Same project shell; residual difference is a spelling/OCR slip. '
            'Soft-attached after review; tag=spelling_ocr. Printed titles stay '
            f'as extracted.{score_bit}'
        )
    if not tags:
        return (
            'Same project shell; titles agree after normalize/identity scoring '
            'with no hard place mismatch (punctuation, legislative-district '
            'suffix, or sub-barangay detail). Soft-attached after review; '
            f'tags=[].{score_bit}'
        )
    return (
        f'Same project shell soft-attached after review; tags={tags}.{score_bit}'
    )


def _attach_soft_match(house_row, nep_row, suggestion):
    return {
        'status': 'soft_match_candidate',
        'confidence': suggestion.get('confidence', 1.0),
        'house': house_row,
        'nep': nep_row,
        'delta_php': house_row['amount_php'] - nep_row['amount_php'],
        'diff_tags': suggestion.get('diff_tags') or [],
        'identity_score': suggestion.get('identity_score'),
        'reason': _soft_match_reason(suggestion),
    }


# Soft scope tags eligible for Tier-3 scope-amendment attachment. Hard place
# mismatches (different_* / other_place_or_word / work_type_change /
# different_gps) never attach here.
_SCOPE_SOFT_TAGS = frozenset({
    'spelling_ocr', 'same_gps_coordinates', 'chainage_digit',
    'structure_id_digit', 'unit_count', 'facility_qualifier',
    'parenthetical_modifier', 'work_descriptor_change',
    'work_phrase_modifier', 'connector_word', 'city_suffix',
    'stage_qualifier',
})


def _is_scope_amendment(suggestion):
    """Tier-3 scope-amendment pairs: high identity, soft tags, any amount.

    Amount deltas are allowed (unit-count splits, re-scoped chainage) and stay
    visible on the attached row. Provenance is always carried via
    ``diff_tags``/``identity_score`` and a typed ``reason``.
    """
    tags = set(suggestion.get('diff_tags') or []) - {'identical'}
    if not tags <= _SCOPE_SOFT_TAGS:
        return False
    score = suggestion.get('identity_score') or 0
    if score < 0.90:
        return False
    return suggestion.get('amount_ratio') is not None


def _scope_amendment_reason(suggestion, house_row, nep_row):
    tags = [t for t in (suggestion.get('diff_tags') or []) if t != 'identical']
    score = suggestion.get('identity_score')
    score_bit = f' identity_score={score:.2f}.' if score is not None else ''
    delta = house_row.get('amount_php', 0) - (nep_row.get('amount_php') or 0)
    delta_bit = ''
    if delta:
        delta_bit = (f' Amount delta ₱{delta:+,} applies and is flagged for '
                     'review, not silently absorbed.')
    detail = {
        'same_gps_coordinates':
            'same site confirmed by matching GPS coordinates despite wording '
            'differences',
        'chainage_digit':
            'same road with re-surveyed or re-segmented station digits',
        'structure_id_digit':
            'same structure with differing ID/coordinate digits',
        'unit_count':
            'scope unit/phase count changed (e.g. 2 units ↔ 1 unit)',
        'facility_qualifier':
            'facility qualifier differs (Gym / Gymnasium / Covered Court)',
        'parenthetical_modifier':
            'scope parenthetical added or changed',
        'work_descriptor_change':
            'work-scope wording changed (Solar, Bridge ↔ Footbridge, '
            'and Utilities…)',
        'spelling_ocr':
            'residual spelling/OCR drift',
    }
    which = '; '.join(detail[t] for t in tags if t in detail) or \
        'soft scope differences only'
    return (
        f'Same project shell attached as a scope amendment after Tier-3 '
        f'review: {which}.{score_bit}{delta_bit}'
    )


def _attach_scope_amendment(house_row, nep_row, suggestion):
    return {
        'status': 'scope_amendment_candidate',
        'confidence': suggestion.get('confidence', 1.0),
        'house': house_row,
        'nep': nep_row,
        'delta_php': house_row['amount_php'] - nep_row['amount_php'],
        'diff_tags': suggestion.get('diff_tags') or [],
        'identity_score': suggestion.get('identity_score'),
        'reason': _scope_amendment_reason(suggestion, house_row, nep_row),
    }


def _pick_unique_unused_suggestion(suggestions, source, matched_n, house_row,
                                   predicate):
    """Pick one unused NEP suggestion matching ``predicate``, or None.

    Prefers equal-amount, else a single unused hit, else an identity leader
    ≥0.15 ahead of the next unused hit.
    """
    hits = [s for s in suggestions if predicate(s)]
    if not hits:
        return None

    def nep_idx(suggestion):
        return next(j for j, r in enumerate(source) if r is suggestion['nep'])

    unused = [s for s in hits if nep_idx(s) not in matched_n]
    if len(unused) == 1:
        return unused[0], nep_idx(unused[0])
    if len(unused) > 1:
        equal = [s for s in unused
                 if house_row.get('amount_php') is not None
                 and s['nep'].get('amount_php') == house_row.get('amount_php')]
        if len(equal) == 1:
            return equal[0], nep_idx(equal[0])
        ranked = sorted(unused, key=lambda s: (
            -s.get('identity_score', 0), -s.get('confidence', 0),
            s['nep']['id']))
        if (ranked[0].get('identity_score') or 0) - (
                ranked[1].get('identity_score') or 0) >= 0.15:
            return ranked[0], nep_idx(ranked[0])
    return None


def project_matches(house, source):
    hi, ni = defaultdict(list), defaultdict(list)
    for i, r in enumerate(house):
        hi[(*scope_key(r), _title_key(r))].append(i)
    for i, r in enumerate(source):
        ni[(*scope_key(r), _title_key(r))].append(i)
    matched_h, matched_n, records = set(), set(), []
    for k in sorted(hi):
        if len(hi[k]) == len(ni.get(k, [])) == 1:
            h, n = hi[k][0], ni[k][0]
            # Audit trail: keep normalization-dependent exact matches visible.
            # If the raw titles are not normalized-equal without abbreviation
            # expansion and repeated-token collapse, the pairing depends on
            # those rules and stays reviewable.
            raw_equal = raw_normalized(house[h]['title']) == raw_normalized(source[n]['title'])
            records.append({'status': 'exact_candidate', 'confidence': 1,
                            'house': house[h], 'nep': source[n],
                            'delta_php': house[h]['amount_php'] - source[n]['amount_php'],
                            'reason': None if raw_equal else
                                      'Titles match only after abbreviation/repeat '
                                      'normalization; raw spellings differ.'})
            matched_h.add(h)
            matched_n.add(n)
    # FAP loan titles are unique documents-wide. When House and NEP list the
    # same loan under different program sections (I-C "National Building
    # Program" vs NEP "Local Program"), pair a unique normalized title in the
    # same region and funding zone across programs.
    for zone in ('fap',):
        remaining_h = [i for i, r in enumerate(house)
                       if i not in matched_h and r['zone'] == zone]
        remaining_n = [i for i, r in enumerate(source)
                       if i not in matched_n and r['zone'] == zone]
        by_title_n = defaultdict(list)
        for i in remaining_n:
            by_title_n[(zone, source[i]['region'], _title_key(source[i]))].append(i)
        by_title_h = defaultdict(list)
        for i in remaining_h:
            by_title_h[(zone, house[i]['region'], _title_key(house[i]))].append(i)
        for k in sorted(by_title_h):
            if len(by_title_h[k]) == len(by_title_n.get(k, [])) == 1:
                h, n = by_title_h[k][0], by_title_n[k][0]
                records.append({'status': 'exact_candidate', 'confidence': 1,
                                'house': house[h], 'nep': source[n],
                                'delta_php': house[h]['amount_php'] - source[n]['amount_php'],
                                'reason': 'FAP loan listed under different program sections in '
                                          'House I-C and the NEP; unique normalized title + '
                                          'region + funding zone pairs the loan documents.'})
                matched_h.add(h)
                matched_n.add(n)
    # Stage-qualifier bridge: Construction (Completion) ↔ Construction when the
    # stripped key is unique on both sides. Dual line items that keep both
    # variants in the same scope stay unmatched (would not be unique).
    stripped_h, stripped_n = defaultdict(list), defaultdict(list)
    for i, r in enumerate(house):
        if i not in matched_h:
            stripped_h[(*scope_key(r), strip_stage_qualifier(r['title']))].append(i)
    for i, r in enumerate(source):
        if i not in matched_n:
            stripped_n[(*scope_key(r), strip_stage_qualifier(r['title']))].append(i)
    for k in sorted(stripped_h):
        if len(stripped_h[k]) == len(stripped_n.get(k, [])) == 1:
            h, n = stripped_h[k][0], stripped_n[k][0]
            # Skip when titles already share a full match key (would have paired
            # above, or are duplicate-key ambiguous). Only bridge true qualifier diffs.
            if _title_key(house[h]) == _title_key(source[n]):
                continue
            records.append({
                'status': 'exact_candidate', 'confidence': 1,
                'house': house[h], 'nep': source[n],
                'delta_php': house[h]['amount_php'] - source[n]['amount_php'],
                'reason': 'Titles match after dropping the stage qualifier '
                          '(Construction (Completion) ↔ Construction); unique '
                          'stripped key in the same region/PAP/zone.',
            })
            matched_h.add(h)
            matched_n.add(n)
    # Token index narrows suggestions without ranking by amount or claiming identity.
    tokens = defaultdict(set)
    for i, r in enumerate(source):
        if i not in matched_n:
            for tok in set(re.findall(r'[a-z0-9]{3,}', r['title'].casefold())):
                tokens[(*scope_key(r), tok)].add(i)
    for i, h in enumerate(house):
        if i in matched_h:
            continue
        k = (*scope_key(h), _title_key(h))
        duplicates = ni.get(k, [])
        if duplicates:
            records.append({'status': 'ambiguous', 'house': h,
                            'candidates': [{'nep': source[n], 'confidence': 1} for n in duplicates],
                            'reason': 'Duplicate exact title/region/PAP key; no automatic pairing.'})
            continue
        counts = Counter()
        for tok in set(re.findall(r'[a-z0-9]{3,}', h['title'].casefold())):
            counts.update(tokens.get((*scope_key(h), tok), ()))
        suggestions = []
        for n, _ in sorted(counts.items(), key=lambda pair: (-pair[1], source[pair[0]]['id']))[:20]:
            score = SequenceMatcher(None, _title_key(h), _title_key(source[n]), autojunk=False).ratio()
            if score >= .85:
                identity = identity_score(
                    h['title'], source[n]['title'],
                    h.get('amount_php'), source[n].get('amount_php'),
                    text_similarity=score,
                )
                suggestions.append({
                    'nep': source[n],
                    'confidence': round(score, 4),
                    'identity_score': identity['score'],
                    'amount_ratio': identity['amount_ratio'],
                    'diff_tags': identity['diff_tags'],
                })
        # Rank by identity score (place-aware), then text similarity, then id.
        suggestions.sort(key=lambda r: (-r['identity_score'], -r['confidence'], r['nep']['id']))
        # Unique same-base chainage hit → attach (matched); else location
        # reassignment / point-to-point barangay amendment; else fuzzy suggestions.
        chainage_hits = [s for s in suggestions if _is_chainage_pair(h, s['nep'])]
        # Closest-first: nearest chainage span, then nearest amount, then id.
        chainage_hits.sort(key=lambda s: (*_chainage_proximity(h, s['nep']), s['nep']['id']))
        unused_chainage = [s for s in chainage_hits
                           if next(j for j, r in enumerate(source) if r is s['nep']) not in matched_n]
        if len(unused_chainage) >= 1:
            nep_row = unused_chainage[0]['nep']
            n_idx = next(j for j, r in enumerate(source) if r is nep_row)
            records.append(_attach_chainage(h, source[n_idx], unused_chainage[0]['confidence']))
            matched_h.add(i)
            matched_n.add(n_idx)
            continue
        # Location reassignment / point-to-point corridor amendments.
        picked = _pick_unique_unused_suggestion(
            suggestions, source, matched_n, h,
            lambda s: bool(_location_amendment_tags(s)))
        if picked is not None:
            chosen, n_idx = picked
            records.append(_attach_location_amendment(h, source[n_idx], chosen))
            matched_h.add(i)
            matched_n.add(n_idx)
            continue
        # Tier-1 OCR/punct and Tier-2 facility soft attaches (equal amount,
        # high identity). Always carry reason + diff_tags + identity_score.
        picked = _pick_unique_unused_suggestion(
            suggestions, source, matched_n, h, _is_soft_attach)
        if picked is not None:
            chosen, n_idx = picked
            records.append(_attach_soft_match(h, source[n_idx], chosen))
            matched_h.add(i)
            matched_n.add(n_idx)
            continue
        # Tier-3 scope amendments (identity ≥ 0.90, soft tags, any amount):
        # GPS-confirmed scope change, chainage/unit re-scope, facility or
        # parenthetical scope, Solar/Footbridge wording. Amount deltas apply
        # and stay visible; provenance is always carried.
        picked = _pick_unique_unused_suggestion(
            suggestions, source, matched_n, h, _is_scope_amendment)
        if picked is not None:
            chosen, n_idx = picked
            records.append(_attach_scope_amendment(h, source[n_idx], chosen))
            matched_h.add(i)
            matched_n.add(n_idx)
            continue
        if suggestions:
            records.append({'status': 'fuzzy_candidate', 'house': h,
                            'candidates': suggestions[:3]})
        else:
            records.append({'status': 'house_unmatched', 'house': h})
    # Unique title_base among still-unmatched chainage rows (fuzzy shortlist miss).
    house_by_id = {r.get('id'): i for i, r in enumerate(house)}
    unmatched_house = []
    for rec in records:
        if rec.get('status') != 'house_unmatched':
            continue
        idx = house_by_id.get(rec['house'].get('id'))
        if idx is not None and (house[idx].get('chainages') or []):
            unmatched_house.append((idx, rec))
    base_n = defaultdict(list)
    for i, r in enumerate(source):
        if i in matched_n or not (r.get('chainages') or []):
            continue
        base_n[(*scope_key(r), _base_key(r))].append(i)
    for idx, rec in unmatched_house:
        if idx in matched_h:
            continue
        key = (*scope_key(house[idx]), _base_key(house[idx]))
        ns = [i for i in base_n.get(key, []) if i not in matched_n]
        if not ns:
            continue
        # Closest-first fallback as well: nearest span, then nearest amount.
        ns.sort(key=lambda j: (*_chainage_proximity(house[idx], source[j]), source[j]['id']))
        n = ns[0]
        if not _is_chainage_pair(house[idx], source[n]):
            continue
        attached = _attach_chainage(house[idx], source[n])
        rec.clear()
        rec.update(attached)
        matched_h.add(idx)
        matched_n.add(n)
    for i, n in enumerate(source):
        if i not in matched_n:
            records.append({'status': 'nep_unmatched', 'nep': n})
    return records


def build():
    tree, source, hb, ib, audit = [read(n) for n in
        ['nep_2027_tree.json', 'nep_2027_source_projects.json',
         'hb_dpwh_native_ic_projects.json', 'hb_dpwh_native_rollup.json', 'hb_dpwh_native_ic_rollup_audit.json']]
    validate_native_detail(hb, audit, ROOT)
    assert hb['audit_summary'] == audit['summary']
    assert all(audit['summary'][k] == 0 for k in ('failed_nodes', 'failed_closing_controls',
                                                'unexplained_amount_rows', 'crossvolume_disagreements'))
    nodes = {n['id']: n for n in tree['nodes']}
    controls = source['pap_controls']
    pap_programs = {r['pap3']: r['program'] for r in source['projects'] if r['zone'] == 'non_fap'}
    for name, c in controls.items():
        assert c['amount_php'] == nodes[c['id']]['amount_php'], name
    nep = []
    for r in source['projects']:
        n = nodes[r['source_id']]
        assert r['amount_php'] == n['amount_php'] and n['additive'], r['source_id']
        # Project total stays a single record; GOP/loan children are not projects.
        reg = region(r['region'])
        office = r.get('office', '')
        if not office:
            current, nearest_office, central = n, '', False
            while current.get('parent'):
                current = nodes[current['parent']]
                if current['kind'] == 'office':
                    if current['label'] == 'Central Office':
                        central = True
                    elif not nearest_office:
                        nearest_office = current['label']
                elif (current['kind'] == 'region' and region(current['label']) == 'NCR'
                      and reg and reg != 'NCR'):
                    central = True
            office = nearest_office or office_from_region_parent('', reg, central_office=central)
        nep.append({'id': r['source_id'], 'title': n['label'], 'amount_php': n['amount_php'],
                    'program': r['program'], 'pap': r['pap3'],
                    'pap_id': controls[r['pap3']]['id'] if r['zone'] == 'non_fap' else 'fap:' + r['program'],
                    'zone': 'local' if r['zone'] == 'non_fap' else 'fap',
                    'region': reg, 'office': office,
                    'pdf_page': r['pdf_page'], 'bbox': n['source'].get('bbox'),
                    'evidence': n.get('native_amount_status', 'not_checked'),
                    'funding_php': {nodes[c]['label']: nodes[c]['amount_php'] for c in n['children'] if nodes[c]['kind'] == 'funding'}})
    house, hb_paps, printed = comparison_inputs(hb, ib, controls, pap_programs, region)
    for row in house:
        annotate_source_labels(row)
    for row in nep:
        annotate_source_labels(row)
    api_checks = {r['pap3']: r for r in read('nep_2027_api_reconciliation.json')['pap_checks']}
    programs = []
    for p in sorted(set(pap_programs.values()) | {n['program'] for n in nep if n['zone'] == 'fap'}):
        nlocal = sum(n['amount_php'] for n in nep if n['zone'] == 'local' and n['program'] == p)
        programs.append({'program': p,
                         'house_local_control_php': sum(c['printed_php'] for name, c in hb_paps.items() if pap_programs[name] == p),
                         'nep_local_control_php': nlocal,
                         'api_coverage_php': sum(api_checks[name]['api_php'] for name in controls if pap_programs[name] == p),
                         'house_local_extracted_php': sum(h['amount_php'] for h in house if h['zone'] == 'local' and h['program'] == p),
                         'house_fap_extracted_php': sum(h['amount_php'] for h in house if h['zone'] == 'fap' and h['program'] == p),
                         'nep_fap_control_php': sum(n['amount_php'] for n in nep if n['zone'] == 'fap' and n['program'] == p),
                         'nep_total_control_php': tree['summary']['program_totals_php'][p]})
    paps = []
    for name, control in controls.items():
        h = hb_paps.get(name)
        extracted = sum(r['amount_php'] for r in house if r['zone'] == 'local' and r['pap'] == name)
        assert sum(r['amount_php'] for r in nep if r['zone'] == 'local' and r['pap'] == name) == control['amount_php']
        if h:
            assert extracted == h['extracted_php']
        regions = []
        for reg in sorted({r['region'] for r in house + nep if r['zone'] == 'local' and r['pap'] == name}):
            regions.append({'region': reg,
                            'house_extracted_php': sum(r['amount_php'] for r in house if r['zone'] == 'local' and r['pap'] == name and r['region'] == reg),
                            'nep_source_php': sum(r['amount_php'] for r in nep if r['zone'] == 'local' and r['pap'] == name and r['region'] == reg)})
        delta = h['printed_php'] - control['amount_php'] if h else None
        paps.append({'id': control['id'], 'label': name, 'program': pap_programs[name],
                     'house_printed_php': h['printed_php'] if h else None,
                     'house_extracted_php': extracted, 'nep_printed_php': control['amount_php'],
                     'coverage_difference_php': h['difference_php'] if h else None,
                     'api_coverage_php': api_checks[name]['api_php'],
                     'source_api_gap_php': control['amount_php'] - api_checks[name]['api_php'],
                     'delta_php': delta,
                     'comparison_status': 'unmapped_control' if h is None else 'exact_controls' if delta == 0 else 'within_tolerance' if abs(delta) <= .005 * max(h['printed_php'], control['amount_php']) else 'control_difference',
                     'house_pages': h['source_pages'] if h else [], 'nep_page': control['page'], 'regions': regions})
    paps.append(fap_control_row(hb, tree, house, nep))
    assert sum(p['house_printed_php'] or 0 for p in paps) == printed['operations_including_projects']
    assert sum(p['nep_printed_php'] for p in paps) == sum(r['amount_php'] for r in nep)
    assert all(api_checks[name]['source_php'] == c['amount_php'] for name, c in controls.items())
    records = project_matches(house, nep)
    # Only the source/API coverage fields rendered by the current comparison.
    # Historical House-only reassessment figures refer to retired OCR candidates.
    api_summary = read('nep_2027_api_reconciliation.json')['summary']
    api_coverage = {key: api_summary[key] for key in
                    ('api_rows', 'api_php', 'unpaired_source_rows', 'unpaired_source_php')}

    summary = {'nep_printed_php': tree['summary']['total_php'],
               'house_printed_php': printed['new_appropriations'],
               'printed_delta_php': printed['new_appropriations'] - tree['summary']['total_php'],
               'house_operations_printed_php': printed['operations_including_projects'],
               'nep_operations_printed_php': sum(n['amount_php'] for n in nep),
               'house_gas_s2o_printed_php': printed['gas_total'] + printed['s2o_total'],
               'nep_gas_s2o_printed_php': sum(tree['summary']['program_totals_php'][p] for p in ['General Administration and Support', 'Support to Operations']),
               'house_extracted_php': sum(h['amount_php'] for h in house),
               'house_allocations': len(house), 'house_local_extracted_php': sum(h['amount_php'] for h in house if h['zone'] == 'local'),
               'house_fap_php': sum(h['amount_php'] for h in house if h['zone'] == 'fap'),
               'nep_fap_php': source['summary']['fap_php'],
               'house_operations_gap_php': printed['operations_including_projects'] - sum(h['amount_php'] for h in house),
               'house_balanced_paps': sum(p['coverage_difference_php'] == 0 for p in paps if p.get('zone') != 'fap'),
               'house_checked_paps': len(hb_paps), 'house_fap_projects': sum(h['zone'] == 'fap' for h in house), 'nep_evidence': tree['summary']['native_amount_audit'],
               'match_counts': dict(Counter(r['status'] for r in records)),
               'reviewed_pairs': 0, 'api': api_coverage}
    assert summary['house_printed_php'] == summary['house_operations_printed_php'] + summary['house_gas_s2o_printed_php']
    assert summary['nep_printed_php'] == summary['nep_operations_printed_php'] + summary['nep_gas_s2o_printed_php']
    assert summary['house_balanced_paps'] == len(hb_paps)
    assert all(sum(r['funding_php'].values()) == r['amount_php'] for r in house if r['zone'] == 'fap')
    assert sum(sum(r['funding_php'].values()) for r in house if r['zone'] == 'fap') == summary['house_fap_php']
    manifest = {'schema_version': 2, 'fiscal_year': 2027,
                'built_at': datetime.now(ZoneInfo('Asia/Manila')).isoformat(timespec='seconds'),
                'stages': {'nep': 'Executive NEP proposal', 'house': 'HB 10858 supplied source documents; amendment completeness not certified'},
                'house_version': 'native_ic_v2', 'comparison_ready': False, 'nep_version': tree['schema_version'],
                'scope': 'New appropriations excluding automatic appropriations; operations project comparison; local and FAP separated',
                'units': 'Integer Philippine pesos', 'matching_method': METHOD,
                'generator': {'path': 'analysis/builders/build_current_pages.py', 'sha256': digest(Path(__file__))},
                'generator_dependencies': {name: digest(ROOT / name) for name in
                    ('analysis/builders/house_native.py',
                     'analysis/builders/normalize_labels.py',
                     'analysis/builders/chainage.py',
                     'scripts/hb_native_labels.py')},
                'inputs': {n: digest(OUT / n) for n in INPUTS},
                'api_snapshot': {'path': 'dpwh-transparency-nep-data/json/fy2027-combined.json', 'sha256': digest(ROOT / 'dpwh-transparency-nep-data/json/fy2027-combined.json')},
                'source_documents': {key: {'path': str(path.relative_to(ROOT)), 'sha256': digest(path)} for key, path in [('house_summary', ROOT / 'HB_BUDGET/2 - HB 10858 VOL IB.pdf'), ('house_details', ROOT / 'HB_BUDGET/3 - HB 10858 VOL IC.pdf')]},
                'source_pdf_sha256': {'house': hb['provenance_sha256']['HB_BUDGET/3 - HB 10858 VOL IC.pdf'], 'nep': tree['provenance']['sha256']['pdf']}}
    payload = {'manifest': manifest, 'summary': summary, 'programs': programs, 'paps': paps,
               'unresolved_paps': [p for p in paps if p['coverage_difference_php'] not in (None, 0)],
               'projects': records, 'house_repairs': audit['repairs']}
    write('comparison_manifest.json', manifest)
    write('source_comparison_2027.json', payload)
    write('current_pap_controls.json', {k: v for k, v in payload.items() if k != 'projects'})
    template = (VIEWERS / 'current_dashboard.template.html').read_text()
    embedded = json.dumps(payload, ensure_ascii=False, separators=(',', ':')).replace('<', '\\u003c')
    (VIEWERS / 'source_comparison_2027.html').write_text(template.replace('__PAYLOAD__', embedded))
    evidence = {'review': read('nep_2027_native_amount_review.json')['records'],
                'repairs': read('nep_2027_tree_validation.json')['repairs']}
    def embed(d):
        return json.dumps(d, ensure_ascii=False, separators=(',', ':')).replace('<', '\\u003c')
    (VIEWERS / 'nep_2027_tree.html').write_text((VIEWERS / 'nep_tree_viewer.template.html').read_text()
        .replace('__TREE_DATA__', embed(tree)).replace('__EVIDENCE_DATA__', embed(evidence)))
    # The homepage now verifies three independent sources before comparisons.
    from build_source_verification import build as build_verification
    build_verification()
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    build()
