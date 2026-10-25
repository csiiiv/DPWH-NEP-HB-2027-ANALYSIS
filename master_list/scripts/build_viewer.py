#!/usr/bin/env python3
"""Generate a plain CSV and a standalone HTML table from the retained master list."""
import argparse
import base64
from collections import Counter
import csv
import gzip
import hashlib
import io
import json
from pathlib import Path
import re
import tempfile
import shutil

from locations import SCORE_METHOD


def compressed_text(path):
    return io.TextIOWrapper(gzip.GzipFile(filename='', mode='wb', fileobj=path.open('wb'), mtime=0),
                            encoding='utf-8', newline='')

ROOT = Path(__file__).resolve().parents[2]
MASTER = ROOT / 'master_list'
RECORDS = MASTER / 'data/projects.jsonl.gz'
TEMPLATE = MASTER / 'viewer/template.html'
CATALOG = ROOT / 'PSGC2LEG/data/psgc_locations.jsonl'
DATASETS = {
    'dpwh_nep_pdf': 'DPWH · NEP PDF',
    'dpwh_house_second': 'DPWH · House second reading',
    'dpwh_house_third': 'DPWH · House third reading',
    'dpwh_nep_api': 'DPWH · NEP Transparency API',
    'fmr_nep': 'FMR · NEP', 'fmr_hgab': 'FMR · House working copy',
    'hfep_nep': 'HFEP · NEP', 'hfep_hgab': 'HFEP · House working copy',
    'nia_nep': 'NIA · NEP', 'nia_hgab': 'NIA · House working copy',
}
# The extraction stores an old absolute path for DPWH and the OCR JSON path
# for HFEP. These are the corresponding retained PDFs, with the same page basis.
PDF_ALIASES = {
    'dpwh_nep_pdf': 'dbm-nep-data/NEP-2027-VOLUME-2B_OCR.pdf',
    'hfep_nep': 'dbm-other-nep-line-data/HFEP_2.pdf',
}
CSV_FIELDS = ['record_id', 'dataset', 'title', 'category', 'value_php',
              'psgc_locations', 'psgc_codes', 'location_score', 'score_method',
              'location_status', 'needs_review', 'candidate_psgc_locations',
              'candidate_psgc_codes', 'suggested_psgc_locations',
              'suggested_psgc_codes', 'suggestion_support_scores',
              'reference_pdf', 'pdf_page', 'printed_page', 'record_kind', 'source_dataset']


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def reference(row):
    if row['dataset'] == 'dpwh_nep_api':
        return None, None, None
    source = row['source']
    pdf = PDF_ALIASES.get(row['dataset']) or row.get('source_pdf') or source.get('source_pdf')
    page = source.get('pdf_page', source.get('page'))
    if not pdf or not pdf.endswith('.pdf') or not (ROOT / pdf).is_file():
        raise ValueError(f'Missing retained PDF: {row["record_id"]}: {pdf}')
    if not isinstance(page, int) or page < 1:
        raise ValueError(f'Invalid PDF page: {row["record_id"]}: {page}')
    return pdf, page, source.get('printed_page')


def category(row):
    if row['dataset'].startswith('hfep_'):
        path = row.get('source_path', [])
        if len(path) > 3:
            # Some categories go directly to region without a subcategory.
            labels = [path[1]]
            if re.match(r'^\d+\.', path[2]):
                labels.append(path[2])
            return ' / '.join(labels)
    if row['subprogram'] or row['program']:
        return row['subprogram'] or row['program']
    for ancestor in reversed(row.get('source_path', [])):
        if isinstance(ancestor, dict) and ancestor['kind'] in {'activity', 'section', 'expense_class'}:
            return ancestor['label']
    return 'Other allocation'


def place_view(loc):
    ancestry = loc['ancestry']
    parent_names = [ancestry[level]['name'] for level in
                    ['barangay', 'sub_municipality', 'municipality', 'city', 'province', 'region']
                    if level in ancestry and ancestry[level]['code'] != loc['psgc_code']]
    return {'name': loc['name'], 'code': loc['psgc_code'],
            'level': loc['level'], 'parents': ' · '.join(parent_names)}


def catalog_place(code, catalog):
    row = catalog[code]
    ancestry, parent = {}, code
    while parent:
        item = catalog[parent]
        ancestry[item['level']] = {'code': parent, 'name': item['name']}
        parent = item['parent_code']
    return place_view({'psgc_code': code, 'name': row['name'],
                       'level': row['level'], 'ancestry': ancestry})


def table_row(row, catalog):
    pdf, page, printed = reference(row)
    locations = []
    for loc in row['location']['locations']:
        locations.append(place_view(loc))
    assigned = {loc['code'] for loc in locations}
    candidates = [catalog_place(code, catalog) for code in row['location']['candidate_codes']
                  if code not in assigned]
    suggestions = []
    for suggestion in row['location'].get('suggestions', []):
        view = place_view(suggestion['location'])
        view.update(supportScore=suggestion['support_score'],
                    factors=suggestion['factors'], conflicts=suggestion['conflicts'])
        suggestions.append(view)
    return {'id': row['record_id'], 'dataset': row['dataset'], 'title': row['title'],
            'category': category(row), 'value': row['amount_php'], 'locations': locations,
            'candidates': candidates, 'suggestions': suggestions,
            'score': row['location']['score'],
            'scoreMethod': row['location']['score_method'],
            'scoreFactors': row['location']['score_factors'],
            'status': row['location']['status'], 'review': row['location']['needs_review'],
            'flags': row['location']['review_flags'], 'pdf': pdf, 'page': page, 'printed': printed,
            'kind': row['record_kind'], 'source': row['source_dataset']}


def build(out):
    audit = json.loads((MASTER / 'data/audit.json').read_text())
    catalog = {row['code']: row for row in
               (json.loads(line) for line in CATALOG.read_text().splitlines())}
    source_hash = digest(RECORDS)
    if source_hash != audit['output_sha256']['projects.jsonl.gz']:
        raise ValueError('Master records differ from the retained audit; rebuild the master list first.')
    rows, counts, sums, references, scores = [], Counter(), Counter(), Counter(), Counter()
    # The plain CSV exceeds Git's 100 MiB blob limit, so the retained export is
    # the deterministic project_list.csv.gz. The build still writes a plain
    # untracked copy for direct local spreadsheet use.
    plain = (out / 'project_list.csv').open('w', encoding='utf-8-sig', newline='')
    compressed = compressed_text(out / 'project_list.csv.gz')
    writer = csv.DictWriter(plain, fieldnames=CSV_FIELDS)
    writer.writeheader()
    compressed_writer = csv.DictWriter(compressed, fieldnames=CSV_FIELDS)
    compressed_writer.writeheader()
    with gzip.open(RECORDS, 'rt', encoding='utf-8') as stream:
        for line in stream:
            original = json.loads(line)
            r = table_row(original, catalog)
            rows.append(r)
            counts[r['dataset']] += 1
            sums[r['dataset']] += r['value']
            references['pdf' if r['pdf'] else 'api_without_pdf'] += 1
            scores[r['score']] += 1
            flat_row = dict(record_id=r['id'], dataset=r['dataset'], title=r['title'],
                category=r['category'], value_php=r['value'],
                psgc_locations=' | '.join(l['name'] + ' (' + l['parents'] + ')' for l in r['locations']),
                psgc_codes='|'.join(l['code'] for l in r['locations']), location_status=r['status'],
                location_score=r['score'], score_method=r['scoreMethod'],
                needs_review=r['review'], reference_pdf=r['pdf'] or '', pdf_page=r['page'] or '',
                candidate_psgc_locations=' | '.join(
                    l['name'] + ' [' + l['level'] + '] (' + l['parents'] + ')' for l in r['candidates']),
                candidate_psgc_codes='|'.join(l['code'] for l in r['candidates']),
                suggested_psgc_locations=' | '.join(
                    l['name'] + ' [' + l['level'] + '] (' + l['parents'] + ')' for l in r['suggestions']),
                suggested_psgc_codes='|'.join(l['code'] for l in r['suggestions']),
                suggestion_support_scores='|'.join(str(l['supportScore']) for l in r['suggestions']),
                printed_page=r['printed'] or '', record_kind=r['kind'], source_dataset=r['source'])
            writer.writerow(flat_row)
            compressed_writer.writerow(flat_row)
    plain.close()
    compressed.close()
    if len(rows) != audit['records']:
        raise ValueError('Viewer count differs from master audit')
    for dataset, item in audit['datasets'].items():
        if counts[dataset] != item['records'] or sums[dataset] != item['amount_php']:
            raise ValueError(f'Viewer ledger differs from master: {dataset}')
    payload = {'datasets': DATASETS, 'rows': rows}
    packed = base64.b64encode(gzip.compress(json.dumps(payload, ensure_ascii=False,
        separators=(',', ':')).encode(), mtime=0)).decode()
    template = TEMPLATE.read_text()
    if template.count('__MASTER_DATA_BASE64__') != 1:
        raise ValueError('Expected exactly one viewer data placeholder')
    (out / 'index.html').write_text(template.replace('__MASTER_DATA_BASE64__', packed), encoding='utf-8')
    manifest = {'schema_version': 3, 'records': len(rows), 'datasets': dict(counts),
                'references': dict(references),
                'score_method': SCORE_METHOD,
                'location_score_distribution': {str(score): count for score, count in sorted(scores.items())},
                'reference_policy': 'PDF pages are 1-based file pages. API records have no asserted PDF reference. HFEP OCR JSON points to the corresponding retained HFEP_2.pdf.',
                'input_sha256': {str(p.relative_to(ROOT)): digest(p) for p in
                    [RECORDS, MASTER / 'data/audit.json', CATALOG, TEMPLATE, Path(__file__)]},
                'output_sha256': {p.name: digest(p) for p in
                    sorted(out.iterdir()) if p.name != 'project_list.csv'}}
    (out / 'viewer_manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    return manifest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    with tempfile.TemporaryDirectory(prefix='master-viewer-') as temp:
        out = Path(temp)
        manifest = build(out)
        targets = {'index.html': MASTER / 'index.html',
                   'project_list.csv.gz': MASTER / 'data/project_list.csv.gz',
                   'viewer_manifest.json': MASTER / 'data/viewer_manifest.json'}
        if args.check:
            stale = [name for name, target in targets.items()
                     if not target.exists() or digest(target) != digest(out / name)]
            if stale:
                raise SystemExit('Stale viewer outputs: ' + ', '.join(stale))
            print(f'Viewer check passed: {manifest["records"]:,} rows.')
        else:
            for name, target in targets.items():
                shutil.copyfile(out / name, target)
            shutil.copyfile(out / 'project_list.csv', MASTER / 'data/project_list.csv')
            print(f'Generated {manifest["records"]:,} rows: master_list/index.html, '
                  'data/project_list.csv.gz (retained) and data/project_list.csv (local plain copy)')


if __name__ == '__main__':
    main()
