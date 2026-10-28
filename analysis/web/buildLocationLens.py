#!/usr/bin/env python3
"""Location district lens builder — the #congress workspace's second view.

Attribution chain (analysis/docs/location_district_lens_method.md):
  1 clean title PSGC + (usable DEO, coordinate, or positive title context) -> one legislative district
  2 otherwise one-to-one DEO -> its legislative district
  3 otherwise multi-district DEO -> the DEO's own undivided card
  4 no DEO -> region
  5 no region -> unassigned catch-all

Disagreement flags (never silently reconciled):
  title_gps_conflict, district_boundary_conflict  — demote to fallback chain
  office_location_mismatch                        — keeps located tier, flags both readings

Output schema mirrors buildCongressIndex.mjs (cards/districts/reconciliation)
so CongressApp renders both lenses with one card component. The DEO index
stays the authority for representative rosters and district descriptors; this
builder reuses them verbatim.

Usage:
  python3 analysis/web/buildLocationLens.py            # build
  python3 analysis/web/buildLocationLens.py --check    # verify counts against committed output
"""

import gzip
import hashlib
import json
import re
import sys
import unicodedata
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / 'analysis' / 'data'
OUT = DATA / 'location_district_index_2027.json'
MAP_OUT = DATA / 'congress_district_map_2027.json'

INPUTS = {
    'cleaned': ROOT / 'master_list/data/cleaned/observations.jsonl.gz',
    'assignments': ROOT / 'PSGC2LEG/data/psgc_leg_assignments.jsonl',
    'districts': ROOT / 'PSGC2LEG/data/legislative_districts.json',
    'geojson': ROOT / 'PSGC2LEG/viz/leg_districts.geojson',
    'crosswalk': ROOT / 'DEO2LEG/outputs/deo_leg_crosswalk.json',
    'comparison': DATA / 'comparison_projects_2027.json',
    'deo_index': DATA / 'congress_district_index_2027.json',
    'named_sites': DATA / 'location_named_sites_2027.json',
}

# Stage preference when several readings locate one group. HGAB3 is the latest
# House stage; the API corroborates identity but is never a stage.
SIDE_PRIORITY = ['house_third', 'house_second', 'nep', 'nep_api']
OFFICE_TYPES = {'district_engineering_office', 'sub_district_engineering_office'}
# Ordinal vocabulary the DEO crosswalk prints, keyed by PSGC2LEG district_no
# ('0' codes a lone district).
ORD = {'1': '1st', '2': '2nd', '3': '3rd', '4': '4th', '5': '5th',
       '6': '6th', '7': '7th', '8': '8th', '0': 'lone'}
# Folded jurisdiction aliases: HUCs the DEO registry spells with a "City"
# suffix the PSGC2LEG list omits, plus the lone-district spelled pair.
CITY_ALIAS = {
    'baguio': 'baguiocity', 'caloocan': 'caloocancity', 'makati': 'makaticity',
    'malabon': 'malaboncity', 'mandaluyong': 'mandaluyongcity', 'marikina': 'marikinacity',
    'muntinlupa': 'muntinlupacity', 'navotas': 'navotascity', 'pasay': 'pasaycity',
    'pasig': 'pasigcity', 'sanjuan': 'sanjuancity', 'valenzuela': 'valenzuelacity',
    'bacolod': 'bacolodcity', 'cagayandeoro': 'cagayandeorocity', 'iligan': 'iligancity',
    'generalsantos': 'generalsantoscity', 'sanjosedelmonte': 'sanjosedelmontecity',
    'antipolo': 'antipolocity', 'calamba': 'calambacity', 'santarosa': 'santarosacity',
    'mandaue': 'mandauecity', 'laspinas': 'laspinascity', 'paranaque': 'paranaquecity',
    'binan': 'binancity', 'taguigpateros': 'taguigcitypateros',
}
ROW_BUCKET_KEYS = ['insertions', 'deletions', 'increased', 'reduced', 'unchanged', 'scope_review']


def fail(message):
    raise SystemExit(f'Location lens: {message}')


def sha256(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def fold(s):
    s = unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode().lower()
    return ''.join(ch for ch in s if ch.isalnum())


def office_join_key(value):
    """Python twin of project_offices.mjs::officeJoinKey."""
    s = unicodedata.normalize('NFKC', str(value or '')).strip()
    s = ' '.join(s.split())
    previous = None
    while previous != s:
        previous = s
        s = re.sub(r'(\w)\s*ñ\s*(\w)', r'\1ñ\2', s, flags=re.IGNORECASE)
    for wrong, right in (('Marindugue', 'Marinduque'), ('Siguijor', 'Siquijor'),
                         ('Occidenatal', 'Occidental'), ('Batagas', 'Batangas'),
                         ('Ilolilo', 'Iloilo')):
        s = re.sub(wrong, right, s, flags=re.IGNORECASE)
    s = re.sub(r'\bsub[\s-]*deo\b', 'sub district engineering office', s, flags=re.IGNORECASE)
    s = re.sub(r'\bdeo\b', 'district engineering office', s, flags=re.IGNORECASE)
    s = re.sub(r'[-\u2010-\u2015]', ' ', s)
    return ' '.join(s.lower().split())


def load_named_sites(path, assign, bridge):
    """Load reviewed facility/campus phrases that refine a multi-district city.

    These entries are deliberately separate from the general PSGC alias parser:
    a named site needs retained sources and an exact conjunction of title
    phrases. Its PSGC code must already have a legislative assignment.
    """
    data = json.load(open(path))
    if data.get('schema_version') != 1 or not isinstance(data.get('sites'), list):
        fail('invalid named-site registry schema')
    seen, sites = set(), []
    for site in data['sites']:
        sid, code = site.get('id'), site.get('psgc_code')
        if not sid or sid in seen:
            fail(f'invalid or duplicate named site id: {sid}')
        seen.add(sid)
        phrases = [fold(p) for p in site.get('match_all') or []]
        if not phrases or any(not p for p in phrases):
            fail(f'named site {sid} has no usable match phrases')
        assignment = assign.get(code)
        district_id = bridge.get(assignment) or assignment
        if not district_id:
            fail(f'named site {sid} PSGC {code} has no legislative assignment')
        if not site.get('sources') or not site.get('evidence_note'):
            fail(f'named site {sid} lacks retained evidence')
        sites.append({**site, '_phrases': phrases, 'district_id': district_id})
    return sites


def named_site_for_title(title, sites):
    key = fold(title or '')
    hits = [site for site in sites if all(phrase in key for phrase in site['_phrases'])]
    if len(hits) > 1:
        fail(f'title matches multiple named sites: {title}')
    return hits[0] if hits else None


def named_site_detail(site):
    """Project the registry entry into the row_psgc reporting shape."""
    return {
        'level': site['level'], 'psgc_code': site['psgc_code'], 'name': site['name'],
        'support_score': None, 'barangay': site['name'], 'barangay_code': site['psgc_code'],
        'municipality': site['municipality'], 'municipality_code': site['municipality_code'],
        'province': None, 'province_code': None, 'region_code': site['region_code'],
        'source_stage': 'named_site_registry', 'district_id': site['district_id'],
        'coordinate_corroborated': False, 'clean_coordinate_points': 0,
        'title_context_corroborated': True, 'text_support': 0, 'context_support': 0,
        'named_site_id': site['id'], 'named_site_sources': site['sources'],
        'named_site_evidence': site['evidence_note'],
    }


def build_deo_registry(crosswalk):
    """Every real, allocation-table DEO keyed by normalized printed names."""
    by_key = defaultdict(list)
    groups = {}
    for office_id, office in crosswalk['offices'].items():
        if office.get('type') not in OFFICE_TYPES or not (office.get('evidence') or {}).get('inAllocationTable'):
            continue
        district_ids = tuple(sorted(office.get('legislativeDistrictIds') or ()))
        if not district_ids:
            continue
        group_id = f"office-group:{'+'.join(district_ids)}"
        group = groups.setdefault(group_id, {'id': group_id, 'district_ids': list(district_ids), 'offices': []})
        group['offices'].append({'id': office_id, 'name': office['name'], 'type': office['type'],
                                 'region': office.get('region')})
        for name in [office.get('name'), *(office.get('aliases') or [])]:
            key = office_join_key(name)
            if key and group_id not in by_key[key]:
                by_key[key].append(group_id)
    return by_key, groups


def printed_deo_evidence(row, by_key, groups):
    """Find DEOs on every linked source; Central/Regional Office are retained
    as readings but do not satisfy the DEO gate."""
    readings, group_ids = [], set()
    for stage in ('second', 'third', 'house', 'nep', 'api'):
        side = row.get(stage)
        if not side:
            continue
        records = side.get('records') or [side]
        for record in records:
            office = record.get('office_canonical') or record.get('office')
            if not office:
                continue
            hits = by_key.get(office_join_key(office), [])
            readings.append({'stage': stage, 'record_id': record.get('id'), 'office': office,
                             'deo_group_ids': hits})
            group_ids.update(hits)
    return readings, groups[next(iter(group_ids))] if len(group_ids) == 1 else None, sorted(group_ids)


def build_psgc_to_deo_bridge(crosswalk, districts):
    """Verified 254/254 bijection PSGC2LEG leg_id -> DEO2LEG leg_id."""
    deo_map = {}
    for did, info in crosswalk['legislativeDistricts'].items():
        deo_map[(info['canonicalJurisdiction'].replace(' ', ''), info['districtLabel'])] = did
    bridge = {}
    for d in districts['districts']:
        jur = fold(d['jurisdiction'])
        label = ORD.get(str(d.get('district_no')), str(d.get('district_no')))
        hit = deo_map.get((jur, label)) or deo_map.get((CITY_ALIAS.get(jur, jur), label))
        if not hit and jur == 'tawitawi':
            hit = deo_map.get(('tawitawi', 'lone'))
        # Taguig–Pateros is a special pair: the 2025 split kept Pateros with
        # Taguig 1st as the historical lone district; Taguig 2nd stands alone.
        if not hit and jur == 'taguigpateros':
            hit = {'1st': 'leg:taguig-city-pateros:lone', '2nd': 'leg:taguig-city:2nd'}.get(label)
        if not hit:
            fail(f'district bridge gap: {d["leg_id"]}')
        if hit in bridge.values():
            fail(f'district bridge collision on {hit}')
        bridge[d['leg_id']] = hit
    if len(bridge) != 254:
        fail(f'district bridge covers {len(bridge)}/254')
    return bridge


def load_group_extras(path, assign, bridge):
    """Select a clean title PSGC reading without treating every road-name
    endpoint as funded-section coverage.

    Within each source, specificity, ancestry depth and support rank the
    selected locations. A top tie across districts is not clean. Across linked
    sources, all clean readings must agree on one district. This makes Opol win
    over the Iligan/Cagayan de Oro road-name endpoints in the Nangcaon example.
    """
    stage_candidates = defaultdict(lambda: defaultdict(list))
    with gzip.open(path, 'rt') as f:
        for line in f:
            r = json.loads(line)
            if r.get('record_kind') not in ('project', 'facility', 'fap_project'):
                continue
            gid = r.get('comparison_group_id')
            if not gid:
                continue
            for s in (r.get('location_resolution') or {}).get('selected_locations') or []:
                rank = {'barangay': 3, 'sub_municipality': 3, 'municipality': 2,
                        'city': 2, 'province': 1}.get(s.get('level'), 0)
                chain = s.get('ancestry') or {}
                depth = sum(1 for lvl in ('barangay', 'municipality', 'province')
                            if (chain.get(lvl) or {}).get('name'))
                support = (s.get('candidate_support') or {}).get('support_score') or 0
                dimensions = (s.get('candidate_support') or {}).get('dimensions') or {}
                clean_points = [p for p in (r.get('title_coordinate_evidence') or {}).get('points') or []
                                if not p.get('issues')]
                assignment = assign.get(s.get('psgc_code'))
                if not assignment and s.get('level') == 'barangay':
                    for lvl in ('sub_municipality', 'municipality', 'city'):
                        parent = (chain.get(lvl) or {}).get('code')
                        if parent and parent in assign:
                            assignment = assign[parent]
                            break
                detail = {
                    'level': s.get('level'), 'psgc_code': s.get('psgc_code'), 'name': s.get('name'),
                    'support_score': support,
                    'barangay': (chain.get('barangay') or {}).get('name'),
                    'barangay_code': (chain.get('barangay') or {}).get('code'),
                    'municipality': (chain.get('municipality') or (chain.get('city') or {})).get('name'),
                    'municipality_code': (chain.get('municipality') or (chain.get('city') or {})).get('code'),
                    'province': (chain.get('province') or {}).get('name'),
                    'province_code': (chain.get('province') or {}).get('code'),
                    'region_code': (chain.get('region') or {}).get('code'),
                    'source_stage': r.get('stage'),
                    'district_id': bridge.get(assignment) or assignment,
                    'coordinate_corroborated': bool(clean_points and (dimensions.get('spatial') or 0) > 0),
                    'clean_coordinate_points': len(clean_points),
                    # A direct title place with a supported hierarchy is usable
                    # without a DEO or coordinate. Direct text must be present
                    # and the context score must not argue against it. This
                    # excludes registry-only bridge guesses (text=0) and
                    # negatively contextualized names, while admitting
                    # explicit forms such as "Barangay Mandangoa, Balingasag,
                    # Misamis Oriental" even when the context scorer is neutral.
                    'title_context_corroborated': bool(
                        (dimensions.get('text') or 0) > 0 and
                        (dimensions.get('context') or 0) >= 0),
                    'text_support': dimensions.get('text') or 0,
                    'context_support': dimensions.get('context') or 0,
                }
                stage_candidates[gid][r.get('stage')].append(((rank, depth, support), detail))

    psgc, title_district = {}, {}
    for gid, stages in stage_candidates.items():
        clean = []
        for stage in SIDE_PRIORITY:
            candidates = stages.get(stage) or []
            if not candidates:
                continue
            top_score = max(score for score, _ in candidates)
            winners = [detail for score, detail in candidates if score == top_score]
            districts = {d['district_id'] for d in winners if d.get('district_id')}
            if len(districts) == 1:
                clean.append((stage, next(iter(districts)), winners[0]))
        if clean:
            districts = {district for _, district, _ in clean}
            # Source-to-source disagreement is not a clean title resolution.
            if len(districts) == 1:
                title_district[gid] = next(iter(districts))
                chosen = dict(clean[0][2])
                chosen['coordinate_corroborated'] = any(
                    detail.get('coordinate_corroborated') for _, _, detail in clean)
                chosen['clean_coordinate_points'] = sum(
                    detail.get('clean_coordinate_points', 0) for _, _, detail in clean)
                chosen['title_context_corroborated'] = any(
                    detail.get('title_context_corroborated') for _, _, detail in clean)
                chosen['text_support'] = max(
                    detail.get('text_support', 0) for _, _, detail in clean)
                chosen['context_support'] = max(
                    detail.get('context_support', 0) for _, _, detail in clean)
                psgc[gid] = chosen
            else:
                psgc[gid] = clean[0][2]
        else:
            # Reporting can still show the strongest unresolved title reading.
            all_candidates = [item for candidates in stages.values() for item in candidates]
            if all_candidates:
                psgc[gid] = max(all_candidates, key=lambda item: item[0])[1]
    return psgc, title_district


def partition_summary(rows):
    """partition() from overviewSummary.js, replicated field-for-field.
    Count follows the members convention: a side carrying grouped `records`
    counts each member, otherwise the row counts once. Amounts stay row-level
    (the grouped money reconciles inside the row's amount_php)."""
    third = lambda r: r.get('third')
    nep = lambda r: r.get('nep')
    members = lambda s: len(s['records']) if isinstance(s.get('records'), list) and s['records'] else 1
    sources = {}
    for side, key in ((third, 'house'), (nep, 'nep')):
        member_rows = [(side(r), r) for r in rows if (side(r))]
        sources[key] = {'count': sum(members(s) for s, _ in member_rows),
                        'amount_php': sum(s['amount_php'] for s, _ in member_rows)}
    inserted = [r for r in rows if third(r) and not nep(r)]
    deleted = [r for r in rows if nep(r) and not third(r)]
    paired = [r for r in rows if third(r) and nep(r)]
    segment_scope = [r for r in paired
                     if r.get('house_match') == 'segment_scope_candidate'
                     or 'segment_scope_review' in str(r.get('trace', ''))]
    adjusted = [r for r in paired if r not in segment_scope]
    increased = [r for r in adjusted if r['third']['amount_php'] > r['nep']['amount_php']]
    reduced = [r for r in adjusted if r['third']['amount_php'] < r['nep']['amount_php']]
    unchanged = [r for r in adjusted if r['third']['amount_php'] == r['nep']['amount_php']]

    def population(rows_, getter):
        return {'count': sum(members(getter(r)) for r in rows_), 'comparison_rows': len(rows_),
                'amount_php': sum(getter(r)['amount_php'] for r in rows_)}

    inc_h = sum(r['third']['amount_php'] for r in increased)
    inc_n = sum(r['nep']['amount_php'] for r in increased)
    red_h = sum(r['third']['amount_php'] for r in reduced)
    red_n = sum(r['nep']['amount_php'] for r in reduced)
    sc_h = sum(r['third']['amount_php'] for r in segment_scope)
    sc_n = sum(r['nep']['amount_php'] for r in segment_scope)
    summary = {
        'sources': sources,
        'insertions': population(inserted, third),
        'deletions': population(deleted, nep),
        'unchanged': population(unchanged, third),
        'paired_comparison_rows': len(paired),
        'adjustments': {'count': len(increased) + len(reduced),
                        'count_unit': 'changed candidate pairs',
                        'increased_count': len(increased), 'reduced_count': len(reduced),
                        'increased_php': inc_h - inc_n, 'reduced_php': red_n - red_h,
                        'net_php': (inc_h - inc_n) - (red_n - red_h),
                        'increased_nep_php': inc_n, 'increased_house_php': inc_h,
                        'reduced_nep_php': red_n, 'reduced_house_php': red_h},
        'scope_review': {'count': len(segment_scope),
                         'count_unit': 'same-road pairs with non-overlapping segments',
                         'house_php': sc_h, 'nep_php': sc_n, 'net_php': sc_h - sc_n,
                         'note': 'Different segments of the same road attached for scope review; amount deltas are deliberately not booked as same-project adjustments.'},
        'delta_php': sources['house']['amount_php'] - sources['nep']['amount_php'],
    }
    if summary['delta_php'] != (summary['insertions']['amount_php']
                                - summary['deletions']['amount_php']
                                + summary['adjustments']['net_php']
                                + summary['scope_review']['net_php']):
        fail('funding bridge does not reconcile')
    return summary


def bucket_row_ids(rows):
    ids = {k: [] for k in ROW_BUCKET_KEYS}
    for row in rows:
        segment_scope = row.get('house_match') == 'segment_scope_candidate' \
            or 'segment_scope_review' in str(row.get('trace', ''))
        if row.get('third') and not row.get('nep'):
            ids['insertions'].append(row['id'])
        elif row.get('nep') and not row.get('third'):
            ids['deletions'].append(row['id'])
        elif segment_scope:
            ids['scope_review'].append(row['id'])
        elif row['third']['amount_php'] > row['nep']['amount_php']:
            ids['increased'].append(row['id'])
        elif row['third']['amount_php'] < row['nep']['amount_php']:
            ids['reduced'].append(row['id'])
        else:
            ids['unchanged'].append(row['id'])
    if sum(len(v) for v in ids.values()) != len(rows):
        fail('row buckets lost rows')
    return ids


def numeric_leaves(obj, prefix=''):
    out = {}
    if isinstance(obj, dict):
        for k, v in obj.items():
            out.update(numeric_leaves(v, f'{prefix}.{k}' if prefix else k))
    elif isinstance(obj, (int, float)) and not isinstance(obj, bool):
        out[prefix] = obj
    return out


def sum_parts(parts):
    total = defaultdict(int)
    for part in parts:
        for path, value in numeric_leaves(part).items():
            total[path] += value
    return dict(total)


PARTITION_FIELDS = ['sources', 'insertions', 'deletions', 'unchanged', 'paired_comparison_rows',
                    'adjustments', 'scope_review', 'delta_php']


def assert_ties(whole, parts, label):
    total = sum_parts(parts)
    whole_leaves = numeric_leaves({k: whole[k] for k in PARTITION_FIELDS})
    drift = [k for k in whole_leaves if whole_leaves[k] != total.get(k, 0)]
    if drift:
        fail(f'{label}: {drift[:5]} do not tie out')
    return len(whole_leaves)


def build_map_artifact(geojson, bridge, index, deo_cards_by_district, mismatch_districts):
    """Join the 254 district polygons to per-district lens figures.

    Emits congress_district_map_2027.json: one FeatureCollection whose
    properties carry both lenses' numbers (DEO-attributed vs located), keyed
    by the lens's DEO2LEG id so the map, the cards and the grid share one
    vocabulary. The geometry is passed through verbatim from the PSGC2LEG viz
    build — no re-projection, no simplification, no color baking (colors are
    runtime maplibre expressions over the metric, so a metric switch never
    needs a rebuild).
    """
    features = []
    for f in geojson['features']:
        p = f['properties']
        deo_id = bridge[p['leg_id']]
        # DEO lens figures: money on the DEO card(s) naming this district.
        deo_cards = deo_cards_by_district.get(deo_id, [])
        deo_house = sum(c['summary']['sources']['house']['amount_php'] for c in deo_cards)
        deo_rows = sum(c['rows'] for c in deo_cards)
        # District-assigned figures can arrive through title PSGC or a
        # one-to-one DEO fallback. Keep both bases, without combining their cards.
        loc_cards = index.get(deo_id, [])
        props = {
            'district_id': deo_id,
            'psgc_leg_id': p['leg_id'],
            'jurisdiction': p['jurisdiction'],
            'district_label': p['district_label'],
            'region': p['region'],
            'representative': p.get('representative'),
            'geometry_sources': p.get('geometry_sources'),
            'deo_house_php': deo_house,
            'deo_rows': deo_rows,
            'deo_card_ids': [c['id'] for c in deo_cards],
            'located_house_php': sum(c['summary']['sources']['house']['amount_php'] for c in loc_cards),
            'located_rows': sum(c['rows'] for c in loc_cards),
            'location_card_id': loc_cards[0]['id'] if len(loc_cards) == 1 else None,
            'location_card_ids': [c['id'] for c in loc_cards],
            'mismatch_rows': len(mismatch_districts.get(deo_id, [])),
        }
        features.append({'type': 'Feature', 'properties': props, 'geometry': f['geometry']})
    return {
        'type': 'FeatureCollection',
        'features': features,
    }


def main():
    check_only = '--check' in sys.argv
    provenance = {name: {'path': str(p.relative_to(ROOT)), 'sha256': sha256(p)}
                  for name, p in INPUTS.items()}

    deo = json.load(open(INPUTS['deo_index']))
    districts_meta = json.load(open(INPUTS['districts']))
    geojson = json.load(open(INPUTS['geojson']))
    crosswalk = json.load(open(INPUTS['crosswalk']))
    bridge = build_psgc_to_deo_bridge(crosswalk, districts_meta)
    assign = {}
    with open(INPUTS['assignments']) as f:
        for line in f:
            a = json.loads(line)
            if a.get('psgc_code') and a.get('leg_id'):
                assign[a['psgc_code']] = a['leg_id']

    comparison = json.load(open(INPUTS['comparison']))['projects']
    by_row = {p['id']: p for p in comparison}
    deo_names, deo_groups = build_deo_registry(crosswalk)
    named_sites = load_named_sites(INPUTS['named_sites'], assign, bridge)

    # ---- classify every comparison row through the chain ----
    group_psgc, title_districts = load_group_extras(INPUTS['cleaned'], assign, bridge)
    tiers = Counter()
    row_flags = defaultdict(set)
    mismatch_detail = {}
    row_psgc = {}
    row_resolution = {}
    placement = {}
    for p in comparison:
        rid = p['id']
        gid = f'dpwh:{rid}'
        readings, deo_group, deo_group_ids = printed_deo_evidence(p, deo_names, deo_groups)
        distinct_offices = {office_join_key(r['office']) for r in readings}
        if len(distinct_offices) > 1:
            row_flags[rid].add('changed_office')
        if len(deo_group_ids) > 1:
            row_flags[rid].add('deo_office_conflict')
        if gid in group_psgc:
            row_psgc[rid] = group_psgc[gid]

        title_district = title_districts.get(gid)
        named_site = named_site_for_title(p.get('title'), named_sites)
        if named_site:
            if title_district and title_district != named_site['district_id']:
                fail(f'named site {named_site["id"]} conflicts with title PSGC for {rid}')
            title_district = named_site['district_id']
            row_psgc[rid] = named_site_detail(named_site)
        title_detail = row_psgc.get(rid)
        title_gate = ('named_site' if named_site else
                      'printed_deo' if deo_group else
                      'coordinate' if title_detail and title_detail.get('coordinate_corroborated') else
                      'title_context' if title_detail and title_detail.get('title_context_corroborated') else
                      None)
        if title_district and title_gate:
            basis, key = 'title_psgc', title_district
            office_districts = set(deo_group['district_ids']) if deo_group else set()
            if deo_group and title_district not in office_districts:
                row_flags[rid].add('office_location_mismatch')
                mismatch_detail[rid] = {
                    'office_group': deo_group['id'],
                    'office_districts': sorted(office_districts),
                    'located_district': title_district,
                }
        elif deo_group and len(deo_group['district_ids']) == 1:
            basis, key = 'deo_to_leg', deo_group['district_ids'][0]
        elif deo_group:
            basis, key = 'deo', deo_group['id']
        elif p.get('region'):
            basis, key = 'region', p['region']
        else:
            basis, key = 'unassigned', 'unassigned'
        tiers[basis] += 1
        placement[rid] = (basis, key)
        row_resolution[rid] = {
            'basis': basis,
            'target_id': key,
            'title_psgc': row_psgc.get(rid),
            'title_gate': title_gate,
            'named_site_id': named_site['id'] if named_site else None,
            'printed_offices': readings,
            'deo_group_ids': deo_group_ids,
        }

    # ---- assemble cards ----
    district_desc = {}
    for c in deo['cards']:
        for d in c['districts']:
            district_desc.setdefault(d['id'], d)

    card_rows = defaultdict(list)         # card key -> [comparison rows]
    for rid, (tier, key) in placement.items():
        card_rows[(tier, key)].append(by_row[rid])

    cards, region_cards = [], []
    for (tier, key), rows_list in card_rows.items():
        summary = partition_summary(rows_list)
        row_ids = bucket_row_ids(rows_list)
        if tier in ('title_psgc', 'deo_to_leg'):
            # The printed implementing DEOs on this card's rows — the offices
            # the budget documents themselves name. Feeds the card's DEO line,
            # the drawer's "records printed by" attribution and DEO search.
            deo_printed = sorted({reading['office'] for row in rows_list
                                  for reading in (row_resolution.get(row['id'], {})
                                                  .get('printed_offices') or [])
                                  if reading.get('deo_group_ids')})
            cards.append({
                'id': f'location:{tier}:{key}',
                'tier': 'A',
                'location_tier': tier,
                'undivided': False,
                'offices': [], 'ledger_names': deo_printed,
                'districts': [district_desc[key]],
                'representative': district_desc[key]['representative'],
                'region': district_desc[key]['region'],
                'rows': len(rows_list), 'summary': summary, 'row_ids': row_ids,
                'tier_note': ('A printed DEO exists and the funded section title resolves cleanly through '
                              'PSGC to this legislative district.' if tier == 'title_psgc' else
                              'The title location did not resolve cleanly; the printed DEO maps one-to-one '
                              'to this legislative district.'),
            })
        elif tier == 'deo':
            group = deo_groups[key]
            names = [o['name'] for o in group['offices']]
            members = [district_desc[did] for did in group['district_ids']
                       if did in district_desc]
            reps = [d['representative'] for d in members if d.get('representative')]
            cards.append({
                'id': f'location:deo:{key}',
                'tier': 'deo',
                'location_tier': 'deo',
                'undivided': True,
                'offices': group['offices'], 'ledger_names': names,
                'card_label': ' / '.join(names),
                'districts': members,
                'representative': ({'multiple': True, 'count': len(reps), 'names': reps}
                                   if len(reps) > 1 else (reps[0] if reps else None)),
                'region': next((o.get('region') for o in group['offices'] if o.get('region')), None),
                'rows': len(rows_list), 'summary': summary, 'row_ids': row_ids,
                'tier_note': 'The title location did not resolve cleanly and this DEO serves multiple '
                             'legislative districts. The full allocation stays on the DEO card.',
            })
        elif tier in ('region', 'unassigned'):
            region_cards.append({
                'id': f'location-{tier}:{key}',
                'tier': tier,
                'location_tier': tier,
                'undivided': False,
                'offices': [], 'ledger_names': [],
                'card_label': key if tier == 'region' else 'Unassigned',
                'districts': [], 'representative': None,
                'region': key if tier == 'region' else None,
                'rows': len(rows_list), 'summary': summary, 'row_ids': row_ids,
                'tier_note': ('No printed DEO was found across the linked sources; assigned at region '
                              'grain.' if tier == 'region' else
                              'No printed DEO or region was available; retained on the unassigned catch-all.'),
            })

    def card_sort_key(card):
        return (-card['summary']['sources']['house']['amount_php'],
                card['districts'][0]['displayName'] if card['districts']
                else card.get('card_label', card['id']))
    cards.sort(key=card_sort_key)
    region_cards.sort(key=lambda c: -c['summary']['sources']['house']['amount_php'])

    # ---- invariants ----
    if sum(tiers.values()) != len(comparison):
        fail(f"row tie-out: {sum(tiers.values())} tiered vs {len(comparison)} comparison rows")
    whole = partition_summary(comparison)
    tie = assert_ties(whole, [c['summary'] for c in cards + region_cards],
                      'cards + region cards vs whole ledger')
    seen = Counter()
    for c in cards + region_cards:
        for bucket_ids in c['row_ids'].values():
            for rid in bucket_ids:
                seen[rid] += 1
    if set(seen) != set(by_row) or set(seen.values()) != {1}:
        dupes = [r for r, n in seen.items() if n > 1]
        missing = set(by_row) - set(seen)
        fail(f'row placement broken: {len(dupes)} duplicated, {len(missing)} unplaced')

    flag_vocab = ('changed_office', 'deo_office_conflict', 'office_location_mismatch')
    flag_counts = Counter({f: sum(1 for fl in row_flags.values() if f in fl) for f in flag_vocab})
    district_cards = [c for c in cards if c['location_tier'] in ('title_psgc', 'deo_to_leg')]
    located_house = sum(c['summary']['sources']['house']['amount_php'] for c in district_cards)

    out = {
        'schema_version': 1,
        'fiscal_year': 2027,
        'built_at': datetime.now().astimezone().isoformat(timespec='seconds'),
        'lens': {
            'name': 'DPWH location district lens',
            'authority': 'analysis/docs/location_district_lens_method.md',
            'grouping_unit': 'One linked project group resolved through printed DEO, funded-section '
                             'title PSGC, DEO-to-LEG, region and unassigned layers.',
            'grain': 'One printed DPWH allocation record; grouped House members counted individually.',
            'stages': 'House 2nd/3rd readings, DBM NEP and DPWH Transparency API all contribute printed '
                      'office evidence; House/NEP remain the amount stages.',
            'tiers': {
                'title_psgc': 'A printed DEO exists and the funded-section title PSGC maps cleanly to one district.',
                'deo_to_leg': 'Title PSGC is not clean; the printed DEO maps one-to-one to a district.',
                'deo': 'The printed DEO serves multiple districts; allocation stays intact on the DEO.',
                'region': 'No printed DEO; assigned to the available region.',
                'unassigned': 'No printed DEO or region; retained on a visible catch-all.',
            },
            'not_claimed': 'Nothing here establishes that a representative requested, sponsored, or '
                           'controlled any project or amount. A card reports where the budget documents '
                           'place the work.',
            'regional_groups_excluded': [],
        },
        'datasets': deo['datasets'],
        'reconciliation': {
            'whole': whole,
            'cards_total': sum_parts([c['summary'] for c in cards + region_cards]),
            'tied_numeric_fields': tie,
            'row_counts': {'total': len(comparison),
                           'cards': sum(c['rows'] for c in cards + region_cards),
                           'residual': 0, 'office_change': 0},
        },
        'counts': {
            'cards': len(cards),
            'region_cards': len(region_cards),
            'districts': 254,
            'districts_with_location': len({c['districts'][0]['id'] for c in district_cards}),
            'title_psgc_rows': tiers['title_psgc'],
            'deo_to_leg_rows': tiers['deo_to_leg'],
            'deo_rows': tiers['deo'],
            'region_rows': tiers['region'],
            'unassigned_rows': tiers['unassigned'],
            'located_rows': tiers['title_psgc'] + tiers['deo_to_leg'],
            'located_house_php': located_house,
            'flags': dict(flag_counts),
        },
        'cards': cards,
        'region_cards': region_cards,
        'districts': deo['districts'],
        'row_flags': {rid: sorted(flags) for rid, flags in row_flags.items() if flags},
        # Best resolved PSGC chain per row. Deepest selected location wins:
        # barangay > mun/city > province. This is the master_list pipeline's
        # own derivation, kept verbatim; it supplies the step-1 title evidence
        # and powers the explorer's "Title PSGC location" column.
        'row_psgc': row_psgc,
        'row_resolution': row_resolution,
        'office_location_mismatch_detail': mismatch_detail,
        'input_provenance': provenance,
    }

    if check_only:
        committed = json.load(open(OUT))
        for key in ('counts',):
            if committed.get(key) != out[key]:
                fail(f'--check drift in {key}')
        print(f'location lens --check OK ({len(comparison)} rows, {len(cards)} cards, '
              f'{len(region_cards)} region cards)')
        return

    # ---- map artifact: polygons joined to both lenses' figures ----
    deo_cards_by_district = defaultdict(list)
    for c in deo['cards']:
        for d in c['districts']:
            deo_cards_by_district[d['id']].append(c)
    mismatch_districts = defaultdict(list)
    for rid, detail in mismatch_detail.items():
        mismatch_districts[detail['located_district']].append(rid)
    loc_cards_by_district = defaultdict(list)
    for c in district_cards:
        loc_cards_by_district[c['districts'][0]['id']].append(c)
    map_artifact = build_map_artifact(geojson, bridge, loc_cards_by_district,
                                      deo_cards_by_district, mismatch_districts)
    # Invariant: every polygon feature carries a lens district id that exists
    # in the index's districts map, and the feature count is exactly 254.
    lens_district_ids = set(out['districts'].keys())
    for feat in map_artifact['features']:
        if feat['properties']['district_id'] not in lens_district_ids:
            fail(f"map feature {feat['properties']['psgc_leg_id']} bridges to unknown lens id "
                 f"{feat['properties']['district_id']}")
    if len(map_artifact['features']) != 254:
        fail(f'map artifact carries {len(map_artifact["features"])} features, expected 254')
    MAP_OUT.write_text(json.dumps(map_artifact, sort_keys=True) + '\n')
    print(f'  map artifact: {MAP_OUT.name} '
          f'({sum(1 for f in map_artifact["features"] if f["properties"]["located_rows"]) } '
          f'districts with located rows, '
          f'{sum(1 for f in map_artifact["features"] if f["properties"]["mismatch_rows"])} flagged)')

    OUT.write_text(json.dumps(out, indent=1, sort_keys=True) + '\n')
    print(f'location lens built: {len(comparison)} rows -> {OUT.name}')
    print(f'  tiers: {dict(tiers)}')
    print(f'  cards: {len(cards)} ({out["counts"]["districts_with_location"]} district-assigned, '
          f'{sum(1 for c in cards if c["location_tier"] == "deo")} DEO cards) '
          f'+ {len(region_cards)} catch-all cards')
    print(f'  flags: {dict(flag_counts)}')


if __name__ == '__main__':
    main()
