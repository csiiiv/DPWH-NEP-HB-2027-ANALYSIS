#!/usr/bin/env python3
"""Extract NIA's FY2027 Senate hearing workbook into a retained dataset.

Source: `NIA_DATA/NIA%20FY%202027%20NEP%20OCTOBER%2010%201043PM.xlsx`, sheet
"DETAILS 2027" — NIA's own reconciliation for the Senate floor. Each project
row prints, side by side: the published NEP FY2027 label and amount (left
block, column indent 2–7), the House GAB amount and variance columns (8–15),
NIA's original submission label and amount (right block, 17–23), NIA's edit
acknowledgement (24, "OK") and the justification text (25).

The left block carries a six-level hierarchy absent from both annex PDFs:

    program → sub-program → category → region → province → project

Verified invariants (asserted at build time):

* NEP side: 791 rows with NEP money, summing to ₱17,598,181,000, with all six
  sub-program controls equal to the printed NEP annex controls.
* House side: 828 rows with House money, summing to ₱17,999,305,000, equal to
  the House annex total; the workbook's 937 raw project rows reduce to 828
  House-funded rows once blank-NEP insertions and House-zero rows separate.
* Rows with House money but no NEP money are NIA-acknowledged House
  insertions; rows with NEP money but zero House money are NEP items the
  House removed (or reworded into another line).

Every workbook row is joined one-to-one to the retained NEP and House
ledgers by a deterministic two-pass matcher: exact (sub-program, canonical
label, amount) first, then a maximum-similarity matching inside each
(sub-program, amount) bucket whose multisets balance exactly. Join method
and title similarity are retained per row; labels and amounts are never
rewritten. Unjoined rows keep their null join and are reported.
"""
import argparse
import collections
import csv
import difflib
import hashlib
import json
import re
import sys
import unicodedata
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parents[1]
WORKBOOK = ROOT / 'NIA_DATA' / 'NIA%20FY%202027%20NEP%20OCTOBER%2010%201043PM.xlsx'
OUT = Path(__file__).resolve().parent / 'data'

# Reuse the shared title parsers: gps-analysis for embedded coordinates,
# analysis/builders for station/chainage spans. Prefer the workbook's
# column-V fixed title when present (Senate-updated wording).
sys.path.insert(0, str(ROOT / 'gps-analysis'))
sys.path.insert(0, str(ROOT / 'analysis/builders'))
from scan_gps_inventory import analyze_text  # noqa: E402
from chainage import parse_chainage, total_length_m  # noqa: E402

SHEET = 'DETAILS 2027'
FIRST_DATA_ROW = 9  # rows 2–7 are titles/headers; row 8 is a spacer

# Left-block columns by hierarchy level (project rows carry the deepest indent).
LEVEL_COLUMNS = [('program', 2), ('subprogram', 3), ('category', 4),
                 ('region', 5), ('province', 6), ('project', 7)]
COL_NEP, COL_HGAB = 8, 9
COL_COUNT_NEP, COL_COUNT_HGAB = 13, 14
COL_SUBMIT, COL_EDITED, COL_JUSTIFICATION = 23, 24, 25
RIGHT_PROJECT_COLUMN = 22

SUBPROGRAM_KEYS = {
    'National Irrigation System Sub-Program': 'National Irrigation System',
    'Communal Irrigation System Sub-Program': 'Communal Irrigation System',
    'Other Irrigation System Sub-Program': 'Other Irrigation System',
    'Establishment of Pump Irrigation Sub-Program': 'Establishment of Pump Irrigation',
    'Special Irrigation Sub-Program': 'Special Irrigation',
    'Extension/Expansion of Existing Irrigation System Sub-Program': 'Extension/Expansion',
}
PROGRAM_GROUPS = {
    'National Irrigation System': 'IRRIGATION SYSTEMS RESTORATION PROGRAM',
    'Communal Irrigation System': 'IRRIGATION SYSTEMS RESTORATION PROGRAM',
    'Other Irrigation System': 'IRRIGATION SYSTEMS RESTORATION PROGRAM',
    'Establishment of Pump Irrigation': 'IRRIGATION SYSTEMS DEVELOPMENT PROGRAM',
    'Special Irrigation': 'IRRIGATION SYSTEMS DEVELOPMENT PROGRAM',
    'Extension/Expansion': 'IRRIGATION SYSTEMS DEVELOPMENT PROGRAM',
}
# Workbook region labels are inconsistently cased; canonicalize for grouping
# while keeping the printed label per row.
REGION_CANONICAL = {
    'REGION 3': 'Region 3',
    'Region IV-A': 'Region 4A',
    'Region IV-B': 'Region 4B',
}

# Printed NEP annex controls (see NEP_NIA_EXTRACTION_FINDINGS.md v9).
EXPECTED_NEP_CONTROLS = {
    'National Irrigation System': 4_662_231_000,
    'Communal Irrigation System': 1_620_000_000,
    'Other Irrigation System': 3_000_000_000,
    'Establishment of Pump Irrigation': 7_915_950_000,
    'Special Irrigation': 200_000_000,
    'Extension/Expansion': 200_000_000,
}
EXPECTED_HOUSE_TOTAL = 17_999_305_000
EXPECTED_NEP_TOTAL = 17_598_181_000


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def clean(text):
    if text is None:
        return None
    value = re.sub(r'\s+', ' ', unicodedata.normalize('NFKC', str(text))).strip()
    return value or None


def canonical(text):
    return ''.join(re.findall(r'[a-z0-9]+', clean(text).casefold())) if clean(text) else ''


def similarity(a, b):
    return difflib.SequenceMatcher(None, a, b).ratio()


def number(value):
    if isinstance(value, bool) or value is None:
        return None
    if isinstance(value, (int, float)):
        return int(round(value))
    text = str(value).strip().replace(',', '')
    if not text:
        return None
    return int(text)


def first_level(cells):
    for level, column in LEVEL_COLUMNS:
        label = clean(cells[column].value)
        if label:
            return level, label
    return None, None


def parse_workbook():
    """Return (project rows, subprogram controls, category controls)."""
    sheet = openpyxl.load_workbook(WORKBOOK, data_only=True)[SHEET]
    rows = [tuple(sheet.cell(row=r, column=c) for c in range(2, COL_JUSTIFICATION + 1))
            for r in range(FIRST_DATA_ROW, sheet.max_row + 1)]
    # Re-fetch with absolute column access for clarity.
    projects = []
    subprogram_controls = collections.OrderedDict()
    category_controls = collections.OrderedDict()
    context = {'program': None, 'subprogram': None, 'category': None,
               'region': None, 'province': None}
    for r in range(FIRST_DATA_ROW, sheet.max_row + 1):
        cells = {c: sheet.cell(row=r, column=c) for c in
                 range(2, COL_JUSTIFICATION + 1)}
        level, label = first_level(cells)
        if level is None:
            continue
        if level != 'project':
            context[level] = label
            if level == 'region':
                context['province'] = None
            control = {
                'nep_amount': number(cells[COL_NEP].value),
                'hgab_amount': number(cells[COL_HGAB].value),
                'count_nep': number(cells[COL_COUNT_NEP].value),
                'count_hgab': number(cells[COL_COUNT_HGAB].value),
                'row': r,
            }
            if level == 'subprogram':
                subprogram_controls[label] = control
            elif level == 'category':
                category_controls[label] = control
            continue
        subprogram_label = context['subprogram']
        if subprogram_label not in SUBPROGRAM_KEYS:
            raise ValueError(f'row {r}: project {label!r} outside a known sub-program')
        region = context['region']
        submission_label = clean(cells[RIGHT_PROJECT_COLUMN].value)
        projects.append({
            'id': f'sen:r{r}',
            'row': r,
            'subprogram_label': subprogram_label,
            'subprogram_key': SUBPROGRAM_KEYS[subprogram_label],
            'program': context['program'],
            'category': context['category'],
            'region': region,
            'region_canonical': REGION_CANONICAL.get(region, region),
            'province': context['province'],
            'label': label,
            'nep_amount': number(cells[COL_NEP].value),
            'hgab_amount': number(cells[COL_HGAB].value),
            'submission_label': submission_label,
            'submission_amount': number(cells[COL_SUBMIT].value),
            'submission_edited': clean(cells[COL_EDITED].value),
            'justification': clean(cells[COL_JUSTIFICATION].value),
        })
    return projects, subprogram_controls, category_controls


def load_ledgers():
    """Load normalized project records from the retained workbench payload.

    The workbench builder already validates both ledgers against their
    controls and assigns stable ids (`nep-nia-p01-y124`, `ib:p896:r2`), so
    the senate join reuses those ids to cross-reference the existing stages.
    """
    payload = json.loads((OUT / 'nia_workbench.json').read_text())
    nep = payload['stages']['nep']['projects']
    house = payload['stages']['house']['projects']
    return nep, house


def join_ledger(projects, ledger, side):
    """Two-pass deterministic one-to-one join; annotates `<side>_join`.

    side='nep' joins NEP money; side='house' joins House (HGAB) money.
    """
    amount_field = 'nep_amount' if side == 'nep' else 'hgab_amount'
    records = []
    for record in ledger:
        records.append({'id': record['id'], 'key': record['subprogram_key'],
                        'title': record['title'],
                        'amount': int(record['amount_php']),
                        'canonical': canonical(record['title'])})
    index = collections.defaultdict(list)
    for record in records:
        index[(record['key'], record['canonical'], record['amount'])].append(record)
    used = set()
    joins = {}
    pending = []
    for project in projects:
        amount = project[amount_field]
        if amount is None or amount <= 0:
            continue
        bucket = index.get((project['subprogram_key'], canonical(project['label']), amount))
        if bucket:
            record = bucket.pop(0)
            joins[project['id']] = {'id': record['id'], 'method': 'exact_label_amount',
                                    'similarity': 1.0}
            used.add(record['id'])
        else:
            pending.append(project)
    # Pass 2: maximum-similarity matching inside balanced (sub-program, amount)
    # buckets. Multiset balance was verified over the full workbook; buckets
    # that do not balance (split/merged rows) fall through unjoined.
    available = collections.defaultdict(list)
    for record in records:
        if record['id'] not in used:
            available[(record['key'], record['amount'])].append(record)
    buckets = collections.defaultdict(list)
    for project in pending:
        buckets[(project['subprogram_key'], project[amount_field])].append(project)
    for bucket_key in sorted(buckets):
        want = buckets[bucket_key]
        have = available.get(bucket_key, [])
        if len(want) != len(have):
            continue  # split/merged rows: no forced pairing
        edges = []
        for pi, project in enumerate(want):
            pcanon = canonical(project['label'])
            for hi, record in enumerate(have):
                score = similarity(pcanon, record['canonical'])
                edges.append((score, pi, hi))
        edges.sort(key=lambda e: (-e[0], e[1], e[2]))
        owner_p, owner_h = {}, {}
        for score, pi, hi in edges:
            if pi in owner_p or hi in owner_h:
                continue
            owner_p[pi] = (hi, score)
            owner_h[hi] = pi
        for pi, (hi, score) in owner_p.items():
            joins[want[pi]['id']] = {'id': have[hi]['id'],
                                     'method': 'bucket_similarity_match',
                                     'similarity': round(score, 4)}
            used.add(have[hi]['id'])
    for project in projects:
        project[f'{side}_join'] = joins.get(project['id'])


def classify(project):
    """Row status from the printed amounts (never from the join)."""
    nep = project['nep_amount'] or 0
    house = project['hgab_amount'] or 0
    if nep > 0 and house > 0:
        return 'both_funded'
    if nep > 0 and house == 0:
        return 'house_zeroed'
    if nep == 0 and house > 0:
        return 'house_insertion'
    return 'unfunded'


def validate(projects, subprogram_controls):
    errors = []
    nep_rows = [p for p in projects if (p['nep_amount'] or 0) > 0]
    house_rows = [p for p in projects if (p['hgab_amount'] or 0) > 0]
    if len(nep_rows) != 791:
        errors.append(f'NEP rows: {len(nep_rows)} != 791')
    if sum(p['nep_amount'] for p in nep_rows) != EXPECTED_NEP_TOTAL:
        errors.append('NEP total does not reconcile')
    if len(house_rows) != 828:
        errors.append(f'House rows: {len(house_rows)} != 828')
    if sum(p['hgab_amount'] for p in house_rows) != EXPECTED_HOUSE_TOTAL:
        errors.append('House total does not reconcile')
    for label, control in subprogram_controls.items():
        key = SUBPROGRAM_KEYS[label]
        want = EXPECTED_NEP_CONTROLS[key]
        if control['nep_amount'] != want:
            errors.append(f'{label}: NEP control {control["nep_amount"]:,} != {want:,}')
        got = sum(p['nep_amount'] for p in nep_rows if p['subprogram_key'] == key)
        if got != want:
            errors.append(f'{label}: NEP row sum {got:,} != control {want:,}')
        got_house = sum(p['hgab_amount'] for p in house_rows if p['subprogram_key'] == key)
        if got_house != control['hgab_amount']:
            errors.append(f'{label}: House row sum {got_house:,} != control {control["hgab_amount"]:,}')
    if errors:
        raise ValueError('; '.join(errors))


def enrich_title_parses(projects):
    """Attach normalized coordinates and chainage spans parsed from titles.

    Prefers the workbook's column-V fixed/submission title when present —
    that is the Senate-updated wording — and falls back to the NEP-print
    label. Titles and amounts are never rewritten; parsers only annotate.
    """
    for project in projects:
        if project.get('submission_label'):
            source, title = 'submission_label', project['submission_label']
        else:
            source, title = 'label', project['label']
        gps = analyze_text(title)
        points = []
        status = None
        if gps:
            status = gps.get('status')
            for point in gps.get('points') or []:
                if point.get('latitude') is None or point.get('longitude') is None:
                    continue
                points.append({
                    'latitude': point['latitude'],
                    'longitude': point['longitude'],
                    'role': point.get('role') if point.get('role') not in (None, 'unspecified') else None,
                    'issues': point.get('issues') or [],
                })
        chain = parse_chainage(title)
        spans = chain.get('chainages') or []
        compact_spans = [{
            'kind': span.get('kind'),
            'from': span.get('from'),
            'to': span.get('to'),
            'length_m': span.get('length_m'),
            'length_review': span.get('length_review'),
            'point': bool(span.get('point')),
        } for span in spans]
        project['title_parse'] = {
            'source': source,
            'coordinates': {
                'status': status,
                'points': points,
            } if points or status else None,
            'chainage': {
                'spans': compact_spans,
                'length_m': total_length_m(spans),
                'incomplete': bool(chain.get('incomplete')),
                'title_base': chain.get('title_base') or None,
            } if compact_spans else None,
        }


def build():
    projects, subprogram_controls, category_controls = parse_workbook()
    validate(projects, subprogram_controls)
    nep_ledger, house_ledger = load_ledgers()
    join_ledger(projects, nep_ledger, 'nep')
    join_ledger(projects, house_ledger, 'house')

    for project in projects:
        project['program_group'] = PROGRAM_GROUPS[project['subprogram_key']]
        project['status'] = classify(project)
    enrich_title_parses(projects)

    nep_joined = sum(1 for p in projects if p.get('nep_join'))
    house_joined = sum(1 for p in projects if p.get('house_join'))
    nep_pending = [p for p in projects if (p['nep_amount'] or 0) > 0]
    house_pending = [p for p in projects if (p['hgab_amount'] or 0) > 0]
    insertions = [p for p in projects if p['status'] == 'house_insertion']
    zeroed = [p for p in projects if p['status'] == 'house_zeroed']
    edited = [p for p in projects if p['submission_edited']]
    justified = [p for p in projects if p['justification']]
    with_coords = sum(1 for p in projects if (p.get('title_parse') or {}).get('coordinates', {})
                      and (p['title_parse']['coordinates'] or {}).get('points'))
    with_chainage = sum(1 for p in projects if (p.get('title_parse') or {}).get('chainage'))

    dataset = {
        'schema_version': 1,
        'meta': {
            'source_workbook': 'NIA_DATA/NIA%20FY%202027%20NEP%20OCTOBER%2010%201043PM.xlsx',
            'source_sha256': sha(WORKBOOK),
            'sheet': SHEET,
            'description': (
                'NIA Senate hearing reconciliation workbook: published NEP detail, '
                'House GAB amounts, NIA original submission, edit acknowledgements '
                'and justifications, with a six-level hierarchy (program, '
                'sub-program, category, region, province, project). Title-embedded '
                'coordinates and chainage are parsed from the column-V fixed title '
                'when present (else the NEP-print label) using the shared gps-analysis '
                'and chainage builders; titles are never rewritten.'),
            'counts': {
                'rows': len(projects),
                'nep_funded': len(nep_pending),
                'house_funded': len(house_pending),
                'house_insertions': len(insertions),
                'house_zeroed': len(zeroed),
                'submission_edited': len(edited),
                'justified': len(justified),
                'nep_joined': nep_joined,
                'house_joined': house_joined,
                'with_coordinates': with_coords,
                'with_chainage': with_chainage,
            },
            'totals': {
                'nep_php': sum(p['nep_amount'] for p in nep_pending),
                'house_php': sum(p['hgab_amount'] for p in house_pending),
                'insertions_php': sum(p['hgab_amount'] for p in insertions),
                'zeroed_php': sum(p['nep_amount'] for p in zeroed),
            },
            'all_controls_reconciled': True,
            'join_note': (
                'One-to-one joins use exact (sub-program, canonical label, amount) '
                'then maximum-similarity matching inside exactly balanced '
                '(sub-program, amount) buckets; similarity is retained per row. '
                'Labels and amounts are never rewritten.'),
        },
        'subprogram_controls': [
            {'label': label, 'key': SUBPROGRAM_KEYS[label],
             'program_group': PROGRAM_GROUPS[SUBPROGRAM_KEYS[label]], **control}
            for label, control in subprogram_controls.items()
        ],
        'category_controls': [
            {'label': label, **control} for label, control in category_controls.items()
        ],
        'projects': projects,
    }
    return dataset


def write_outputs(dataset):
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / 'senate_nia_dataset.json').write_text(
        json.dumps(dataset, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    with open(OUT / 'senate_nia_projects.csv', 'w', newline='', encoding='utf-8') as handle:
        writer = csv.writer(handle)
        writer.writerow([
            'id', 'row', 'subprogram_key', 'program_group', 'category', 'region',
            'region_canonical', 'province', 'label', 'status', 'nep_amount',
            'hgab_amount', 'submission_label', 'submission_amount',
            'submission_edited', 'justification', 'title_parse_source',
            'coordinates', 'coordinate_status', 'chainages', 'chainage_length_m',
            'nep_join_id', 'nep_join_method', 'nep_join_similarity',
            'house_join_id', 'house_join_method', 'house_join_similarity',
        ])
        for p in dataset['projects']:
            nep_join = p.get('nep_join') or {}
            house_join = p.get('house_join') or {}
            parse = p.get('title_parse') or {}
            coords = (parse.get('coordinates') or {}).get('points') or []
            chain = parse.get('chainage') or {}
            spans = chain.get('spans') or []
            coord_text = '; '.join(
                f"{pt['latitude']},{pt['longitude']}"
                + (f" ({pt['role']})" if pt.get('role') else '')
                for pt in coords)
            chain_parts = []
            for span in spans:
                frm, to = span.get('from') or '', span.get('to') or ''
                if span.get('point') or (frm and to and frm == to):
                    chain_parts.append(frm or to)
                elif frm and to:
                    chain_parts.append(f'{frm} – {to}')
                elif frm or to:
                    chain_parts.append(frm or to)
            chain_text = '; '.join(p for p in chain_parts if p)
            writer.writerow([
                p['id'], p['row'], p['subprogram_key'], p['program_group'],
                p['category'], p['region'], p['region_canonical'], p['province'],
                p['label'], p['status'], p['nep_amount'], p['hgab_amount'],
                p['submission_label'], p['submission_amount'],
                p['submission_edited'], p['justification'],
                parse.get('source', ''), coord_text,
                (parse.get('coordinates') or {}).get('status') or '',
                chain_text, chain.get('length_m') if chain else '',
                nep_join.get('id', ''), nep_join.get('method', ''),
                nep_join.get('similarity', ''),
                house_join.get('id', ''), house_join.get('method', ''),
                house_join.get('similarity', ''),
            ])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true',
                        help='Validate without writing outputs')
    args = parser.parse_args()
    dataset = build()
    counts = dataset['meta']['counts']
    print(f"rows={counts['rows']} nep_funded={counts['nep_funded']} "
          f"house_funded={counts['house_funded']} insertions={counts['house_insertions']} "
          f"zeroed={counts['house_zeroed']} edited={counts['submission_edited']} "
          f"justified={counts['justified']} "
          f"coords={counts['with_coordinates']} chainage={counts['with_chainage']} "
          f"nep_joined={counts['nep_joined']}/{counts['nep_funded']} "
          f"house_joined={counts['house_joined']}/{counts['house_funded']}")
    if not args.check:
        write_outputs(dataset)
        print(f'wrote {OUT / "senate_nia_dataset.json"}')


if __name__ == '__main__':
    main()
