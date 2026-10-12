"""Build the FMR browser dataset from retained, audited source hierarchies.

Project pairings are deterministic candidates, not legislative identities.
Only unique keys within the same printed region can pair across sources.
"""
import argparse
from collections import Counter, defaultdict
import hashlib
import json
from pathlib import Path
import re
import unicodedata

ROOT = Path(__file__).resolve().parent
OUTPUT = ROOT / 'data/fmr_workbench.json'


def canonical_title(text):
    text = unicodedata.normalize('NFKD', text).casefold()
    text = re.sub(r'\bbrgy\b', 'barangay', text)
    return ' '.join(re.findall(r'[a-z0-9]+', text))


def region_key(label):
    label = label.upper()
    if 'CORDILLERA' in label:
        return 'CAR'
    if 'NEGROS ISLAND' in label:
        return 'NIR'
    match = re.match(r'REGION\s+([IVX]+[AB]?)\b', label)
    if not match:
        raise ValueError(f'Unrecognized region: {label}')
    return match[1]


def coordinate_key(project):
    # No proximity matching or matching on flagged numeric repair candidates.
    if project['status'] != 'normalized' or project['review_flags']:
        return None
    points = [pair for segment in project['coordinates'] for pair in segment]
    if not points or any(pair is None or any(v is None for v in pair) for pair in points):
        return None
    # Preserve segment and endpoint order and the full retained precision.
    return json.dumps(project['coordinates'], separators=(',', ':'))


def match_projects(nep, house):
    pending = {'nep': {p['id']: p for p in nep}, 'house': {p['id']: p for p in house}}
    if len(pending['nep']) != len(nep) or len(pending['house']) != len(house):
        raise ValueError('Duplicate project IDs')
    rows = []
    for method in ('title_and_coordinates', 'title', 'coordinates'):
        indexes = {}
        for stage, projects in pending.items():
            index = defaultdict(list)
            for p in projects.values():
                title, coordinates = canonical_title(p['title']), coordinate_key(p)
                key = (title, coordinates) if method == 'title_and_coordinates' and coordinates else title if method == 'title' else coordinates if method == 'coordinates' else None
                if key:
                    index[(p['region_key'], key)].append(p)
            indexes[stage] = index
        for key in indexes['nep'].keys() & indexes['house'].keys():
            n, h = indexes['nep'][key], indexes['house'][key]
            if len(n) == len(h) == 1:
                rows.append({'id': f"pair:{n[0]['id']}:{h[0]['id']}", 'region_key': n[0]['region_key'],
                             'status': 'paired', 'method': method, 'nep_id': n[0]['id'], 'house_id': h[0]['id'],
                             'delta_php': h[0]['amount_php'] - n[0]['amount_php']})
                del pending['nep'][n[0]['id']]
                del pending['house'][h[0]['id']]
    for stage in ('nep', 'house'):
        other = 'house' if stage == 'nep' else 'nep'
        other_titles = {(p['region_key'], canonical_title(p['title'])) for p in pending[other].values()}
        for p in pending[stage].values():
            rows.append({'id': f"{stage}_only:{p['id']}", 'region_key': p['region_key'],
                         'status': f'{stage}_only', 'method': None, f'{stage}_id': p['id'], f'{other}_id': None,
                         'delta_php': None, 'ambiguous_title': (p['region_key'], canonical_title(p['title'])) in other_titles})
    # Set intersection order must never affect the generated artifact.
    return sorted(rows, key=lambda row: row['id'])


def load_stage(stage, prefix, psgc_points_by_project=None):
    provenance = {}
    psgc_points_by_project = psgc_points_by_project or {}

    def read(suffix):
        path = ROOT / f'data/{prefix}_fmr_{suffix}.json'
        provenance[str(path.relative_to(ROOT))] = hashlib.sha256(path.read_bytes()).hexdigest()
        return json.loads(path.read_text())

    tree, normalized, audit, coordinate_audit = [read(s) for s in ('tree', 'coordinates_normalized', 'audit', 'coordinate_normalization_audit')]
    if not audit['passed'] or not coordinate_audit['passed'] or audit['errors'] or coordinate_audit['errors']:
        raise ValueError(f'{stage}: source audits failed')
    tree_hash = provenance[f'data/{prefix}_fmr_tree.json']
    if any(d['metadata']['source_tree_sha256'] != tree_hash for d in (normalized, coordinate_audit)):
        raise ValueError(f'{stage}: stale normalization')
    for field in ('source', 'cross_volume_source'):
        pdf = ROOT.parent / tree['metadata'][f'{field}_pdf']
        if hashlib.sha256(pdf.read_bytes()).hexdigest() != tree['metadata'][f'{field}_sha256']:
            raise ValueError(f'{stage}: source PDF changed: {pdf}')
    if any(d['metadata']['source_pdf_sha256'] != tree['metadata']['source_sha256'] for d in (normalized, coordinate_audit)):
        raise ValueError(f'{stage}: normalization references a different source PDF')
    nodes = {n['id']: n for n in tree['nodes']}
    if len(nodes) != len(tree['nodes']):
        raise ValueError(f'{stage}: duplicate hierarchy IDs')
    root = nodes[tree['root_id']]
    point_fields = ('id', 'role', 'longitude', 'latitude', 'rules', 'issues',
                    'source_fragment_raw', 'source_fragment_interpreted',
                    'station_raw', 'trailing_annotation_raw')
    projects = []
    for p in normalized['projects']:
        node = nodes[p['project_id']]
        if node['kind'] != 'project' or p['amount_php'] != node['printed_amount_php'] or p['title'] != node['label'] or p['source'] != node['source']:
            raise ValueError(f'{stage}: inconsistent source row {p["project_id"]}')
        psgc_bundle = psgc_points_by_project.get(p['project_id'])
        # Keep the full coordinate provenance chain in the browser dataset:
        # original extraction flags → interpretation rules → remaining flags,
        # plus per-point source fragments and resulting lon/lat.
        projects.append({'id': p['project_id'], 'stage': stage, 'region_key': region_key(p['region']),
                         **{k: p[k] for k in ('title', 'region', 'amount_php', 'source', 'coordinates_raw', 'coordinates', 'segment_count', 'point_count', 'status', 'review_flags', 'normalization_rules', 'original_review_flags', 'segments')},
                         'coordinates_interpreted': p.get('coordinates_interpreted', p['coordinates_raw']),
                         'coordinate_text_basis': p.get('coordinate_text_basis') or 'original_ocr',
                         'points': [{k: pt.get(k) for k in point_fields} for pt in p.get('points') or []],
                         'image_review': p.get('image_review'), 'path_labels': node['path_labels']})
        if psgc_bundle:
            # Whole-corpus PSGC from the final datasets, plus any flagged repair
            # candidates from the triage validator.
            projects[-1]['psgc'] = psgc_bundle['points']
            projects[-1]['location_agreement'] = psgc_bundle['location_agreement']
            projects[-1]['title_locality'] = psgc_bundle['title_locality']
    project_ids = {p['id'] for p in projects}
    if len(project_ids) != len(projects) or project_ids != {n['id'] for n in tree['nodes'] if n['kind'] == 'project'}:
        raise ValueError(f'{stage}: project coverage mismatch')
    # Independently check every additive control; segments never receive money.
    for n in tree['nodes']:
        if n['child_ids'] and sum(nodes[c]['printed_amount_php'] for c in n['child_ids']) != n['printed_amount_php']:
            raise ValueError(f'{stage}: control does not balance: {n["id"]}')
    if sum(p['amount_php'] for p in projects) != root['printed_amount_php']:
        raise ValueError(f'{stage}: ledger does not balance')
    controls = {n['id'] for n in tree['nodes'] if n['child_ids']}
    control_checks = [c for c in audit['cross_volume_checks'] if c['role'] != 'office_control_echo']
    if Counter(c['annex_node_id'] for c in control_checks) != Counter(controls):
        raise ValueError(f'{stage}: independent control coverage mismatch')
    for c in audit['cross_volume_checks']:
        if not c['passed'] or c['total_php'] != nodes[c['annex_node_id']]['printed_amount_php']:
            raise ValueError(f'{stage}: independent control mismatch')
    summary = coordinate_audit['summary']
    expected = {'projects':len(projects), 'project_total_php':sum(p['amount_php'] for p in projects),
                'projects_needing_review':sum(p['status'] == 'needs_review' for p in projects),
                'multi_segment_projects':sum(p['segment_count'] > 1 for p in projects)}
    if any(summary[k] != value for k, value in expected.items()):
        raise ValueError(f'{stage}: normalization summary mismatch')
    regions = [{'id': n['id'], 'key': region_key(n['label']), 'label': n['label'], 'amount_php': n['printed_amount_php'],
                'project_ids': n['child_ids'], 'source': n['source']} for n in tree['nodes'] if n['kind'] == 'region_control']
    return {'key': stage, 'label': 'DBM NEP' if stage == 'nep' else 'House GAB',
            'metadata': tree['metadata'], 'root': root, 'regions': regions, 'projects': projects,
            'summary': coordinate_audit['summary'], 'audit_summary': audit['summary'],
            'control_checks': audit['cross_volume_checks'], 'provenance': provenance}


def build():
    psgc = load_psgc_evidence()
    stages = {s: load_stage(s, p, psgc['points_by_project']) for s, p in (('house', 'hgab'), ('nep', 'nep'))}
    rows = match_projects(stages['nep']['projects'], stages['house']['projects'])
    for stage in stages:
        ids = [r[f'{stage}_id'] for r in rows if r[f'{stage}_id']]
        if Counter(ids) != Counter(p['id'] for p in stages[stage]['projects']):
            raise ValueError('Comparison does not partition every source row exactly once')
    lookup = {s: {p['id']: p for p in stages[s]['projects']} for s in stages}
    delta = stages['house']['root']['printed_amount_php'] - stages['nep']['root']['printed_amount_php']
    paired_delta = sum(r['delta_php'] for r in rows if r['status'] == 'paired')
    house_only = sum(lookup['house'][r['house_id']]['amount_php'] for r in rows if r['status'] == 'house_only')
    nep_only = sum(lookup['nep'][r['nep_id']]['amount_php'] for r in rows if r['status'] == 'nep_only')
    if paired_delta + house_only - nep_only != delta:
        raise ValueError('Comparison money reconciliation failed')
    regions = []
    for n in stages['nep']['regions']:
        h = next(r for r in stages['house']['regions'] if r['key'] == n['key'])
        regions.append({'id': n['key'], 'label': n['label'], 'nep_php': n['amount_php'], 'house_php': h['amount_php'],
                        'delta_php': h['amount_php'] - n['amount_php'], 'nep_count': len(n['project_ids']), 'house_count': len(h['project_ids']),
                        'nep_source': n['source'], 'house_source': h['source']})
    return {'schema_version': 1, 'fiscal_year': 2027, 'stages': stages, 'comparison': rows, 'regions': regions,
            'psgc_validation': psgc['metadata'] | {'summary': psgc['summary']},
            'comparison_summary': {'counts': dict(Counter(r['status'] for r in rows)), 'methods': dict(Counter(r['method'] for r in rows if r['method'])),
                                   'delta_php': delta, 'paired_delta_php': paired_delta, 'house_only_php': house_only, 'nep_only_php': nep_only,
                                   'changed_pairs': sum(r['status'] == 'paired' and r['delta_php'] != 0 for r in rows)},
            'matching_note': 'Unique, one-to-one candidates within the same region: canonical title + exact clean coordinates, then title, then exact clean coordinates. No fuzzy or distance matching. Source-only rows are unmatched observations, not certified insertions or deletions.'}


def _format_psgc_where(psgc):
    if not psgc:
        return None
    parts = [p for p in (psgc.get('municipality'), psgc.get('province')) if p]
    where = ', '.join(parts) if parts else None
    if psgc.get('barangay'):
        where = f"{where} / Brgy. {psgc['barangay']}" if where else f"Brgy. {psgc['barangay']}"
    return where


def load_psgc_evidence():
    """Attach whole-corpus PSGC from the final datasets, plus flagged repairs.

    `*_fmr_final_dataset.json` geocodes every printed endpoint against PSA 2023
    PSGC shapefiles and records title-locality agreement. The separate
    `fmr_psgc_validation.json` triage layer still supplies authored candidate
    repairs for needs_review rows. Stale final-dataset layer hashes fail the build.
    """
    repo = ROOT.parent
    triage_path = ROOT / 'data/fmr_psgc_validation.json'
    triage = json.loads(triage_path.read_text())
    if not triage.get('passed'):
        raise ValueError('PSGC validation did not pass')
    for layer_key in ('nep_layer', 'hgab_layer'):
        layer_path = repo / triage['metadata'][layer_key]
        if not layer_path.is_file():
            raise ValueError(f'PSGC evidence references missing layer: {layer_path}')
        expected = triage['metadata'][f'{layer_key}_sha256']
        actual = hashlib.sha256(layer_path.read_bytes()).hexdigest()
        if expected != actual:
            raise ValueError(f'PSGC evidence is stale against {layer_key}; rerun validate_fmr_coordinates_psgc.py')

    repairs_by_project = defaultdict(list)
    for point in triage['points']:
        if point.get('kind') == 'candidate_repair':
            repairs_by_project[point['project_id']].append(point)

    by_project = {}
    agreement_counts = Counter()
    for prefix in ('hgab', 'nep'):
        path = ROOT / f'data/{prefix}_fmr_final_dataset.json'
        if not path.is_file():
            raise ValueError(f'Missing whole-corpus PSGC dataset: {path.name}; run build_fmr_final_dataset.py')
        final = json.loads(path.read_text())
        layer_meta = final['metadata']['normalized_layer']
        layer_path = repo / layer_meta['path']
        if hashlib.sha256(layer_path.read_bytes()).hexdigest() != layer_meta['sha256']:
            raise ValueError(f'Final PSGC dataset is stale against {layer_meta["path"]}; rerun build_fmr_final_dataset.py')
        for project in final['projects']:
            points = []
            verdicts = project.get('point_verdicts') or []
            for index, pt in enumerate(project.get('points') or []):
                verdict = verdicts[index] if index < len(verdicts) else ('NO_MATCH' if not pt.get('psgc') else 'AGREE')
                points.append({
                    'project_id': project['project_id'],
                    'point_id': pt['point_id'],
                    'kind': 'printed',
                    'role': pt.get('role'),
                    'coordinates': pt.get('coordinates'),
                    'verdict': verdict,
                    'where': _format_psgc_where(pt.get('psgc')),
                    'psgc': pt.get('psgc'),
                    'note': pt.get('psgc_note'),
                    'title_barangay_match': None,
                })
            points.extend(repairs_by_project.get(project['project_id'], []))
            agreement = project.get('location_agreement') or 'NO_POINTS'
            agreement_counts[agreement] += 1
            by_project[project['project_id']] = {
                'location_agreement': agreement,
                'title_locality': project.get('title_locality'),
                'points': points,
            }

    return {
        'summary': {
            **triage['summary'],
            'projects_with_psgc': len(by_project),
            'location_agreement': dict(agreement_counts),
        },
        'metadata': {
            'psgc_shapefiles_source': triage['metadata']['psgc_shapefiles_source'],
            'generated_date': triage['metadata']['generated_date'],
            'disposition': ('whole-corpus PSGC from final datasets; flagged candidate '
                            'repairs retained from the triage validator; normalized '
                            'layers and source text are not modified'),
            'coverage': 'all projects',
        },
        'points_by_project': by_project,
    }


def fmr_summary(data):
    """Tiny cross-workspace summary for the DPWH Highlights coverage row.

    Only build-time aggregates — counts and printed controls — travel across.
    The FMR workspace itself stays the authority for pairing and evidence.
    """
    counts = data['comparison_summary']['counts']
    return {
        'schema_version': 1,
        'nep': {
            'records': len(data['stages']['nep']['projects']),
            'amount_php': data['stages']['nep']['root']['printed_amount_php'],
        },
        'house': {
            # Labelled "supplied House copy": the 2nd-reading annex whose FMR
            # text is identical to the 3rd reading, not an independently
            # extracted third-reading stage.
            'records': len(data['stages']['house']['projects']),
            'amount_php': data['stages']['house']['root']['printed_amount_php'],
            'note': 'Supplied House copy · 2nd reading annex, text-identical FMR pages',
        },
        'candidates': {
            'paired': counts['paired'],
            'house_only': counts['house_only'],
            'nep_only': counts['nep_only'],
        },
        'workspace_href': '#fmr',
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    data = build()
    content = json.dumps(data, ensure_ascii=False, separators=(',', ':')) + '\n'
    summary = json.dumps(fmr_summary(data), ensure_ascii=False, separators=(',', ':')) + '\n'
    if args.check:
        if not OUTPUT.exists() or OUTPUT.read_text() != content:
            raise SystemExit('FMR workbench data is missing or stale; run the builder')
        summary_path = ROOT / 'data/fmr_summary.json'
        if not summary_path.exists() or summary_path.read_text() != summary:
            raise SystemExit('FMR summary is missing or stale; run the builder')
    else:
        OUTPUT.write_text(content)
        (ROOT / 'data/fmr_summary.json').write_text(summary)
    print(f'FMR workbench {"verified" if args.check else "built"}: {OUTPUT}')


if __name__ == '__main__':
    main()
