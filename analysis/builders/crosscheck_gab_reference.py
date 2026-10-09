#!/usr/bin/env python3
"""Audit an immutable external GAB release against both native House readings.

Requires duckdb; downloads only hash-pinned Parquet inputs, never executes
external repository code. This creates reference evidence, not website inputs.
"""
import argparse
from collections import Counter, defaultdict
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile

sys.path[:0] = [str(Path(__file__).resolve().parent), str(Path(__file__).resolve().parents[2] / 'scripts')]
from build_current_pages import normalized, region
from house_native import printed_controls, walk
from hb_native_labels import control_key
from validate_current_pages import validate_house_readings

ROOT = Path(__file__).resolve().parents[2]
COMMIT = '1de94242a1342c7174a9efdce71301538dcf43e0'
REPOSITORY = 'https://github.com/kimileeee/gab-fy2027-dataset'
FILES = {
    'appropriations': 'f9edc2aed84610727fcf396e92012608909a2cfda8df8d41a4f7c41291806080',
    'appropriations_compared': '92e6a47c0b6e578b8e5b8976ea5ebe514dca810c008a23969fd3f96d63eb6e8f',
    'drilldown_items': 'a40d863ab2880c2cd231edfd225a654a05faa46f9184769fe9b6e67a50cef0a0',
    'drilldown_coverage': '2a9c5f47ef0d2134ee70d6499b6a3fa24874c425520f6888df961e9d80677bd9',
}


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def inputs(cache):
    cache.mkdir(parents=True, exist_ok=True)
    for name, expected in FILES.items():
        path = cache / (name + '.parquet')
        if not path.exists():
            subprocess.run(['curl', '--fail', '--location', '--silent', '--show-error',
                            '--connect-timeout', '10', '--max-time', '90',
                            f'https://raw.githubusercontent.com/kimileeee/gab-fy2027-dataset/{COMMIT}/release/parquet/{name}.parquet',
                            '-o', str(path)], check=True)
        if digest(path) != expected:
            raise ValueError(f'External input hash mismatch: {path}')


def rows(connection, sql, parameters=()):
    cursor = connection.execute(sql, parameters)
    fields = [c[0] for c in cursor.description]
    return [dict(zip(fields, r)) for r in cursor.fetchall()]


def external_record(r):
    return {'id': r['item_id'], 'title': r['item'], 'amount_php': r['amount'],
            'program': 'Local Program' if r['source'] == 'dpwh_tail' else r['section'],
            'region': region(r['region_printed'] or 'Nationwide'), 'office': r['office'] or '',
            'pdf_page': r['pdf_page'], 'pdf_file': r['pdf_file'], 'source': r['source']}


def key(r):
    return normalized(r['program']), r['region'], normalized(r['title'])


def slim(r):
    return {k: r.get(k) for k in ('id', 'title', 'amount_php', 'program', 'region', 'office', 'pdf_page', 'pdf_file', 'record_kind')}


def compare_projects(native, external):
    """Unique program/region/title pairs; compare amount and office afterwards."""
    groups = [defaultdict(list), defaultdict(list)]
    for records, group in zip((native, external), groups):
        if len({r['id'] for r in records}) != len(records):
            raise ValueError('Duplicate source record ID')
        for r in records:
            group[key(r)].append(r)
    unique = {k for k in groups[0].keys() & groups[1].keys()
              if len(groups[0][k]) == len(groups[1][k]) == 1}
    pairs = [(groups[0][k][0], groups[1][k][0]) for k in sorted(unique)]
    unmatched = [[slim(r) for k in sorted(g) if k not in unique for r in g[k]] for g in groups]
    office_counts = Counter()
    office_disagreements, amount_disagreements = [], []
    for a, b in pairs:
        status = ('external_missing' if not b['office'] else 'native_missing' if not a['office']
                  else 'agrees' if normalized(a['office']) == normalized(b['office']) else 'differs')
        office_counts[status] += 1
        if status == 'differs':
            office_disagreements.append({'native': slim(a), 'external': slim(b)})
        if a['amount_php'] != b['amount_php']:
            amount_disagreements.append({'native': slim(a), 'external': slim(b),
                                         'native_minus_external_php': a['amount_php'] - b['amount_php']})
    totals = [sum(r['amount_php'] for r in rs) for rs in (native, external)]
    unmatched_totals = [sum(r['amount_php'] for r in rs) for rs in unmatched]
    paired_difference = sum(a['amount_php'] - b['amount_php'] for a, b in pairs)
    assert totals[0] - totals[1] == unmatched_totals[0] - unmatched_totals[1] + paired_difference
    assert all(len(pairs) + len(unmatched[i]) == len(rs) for i, rs in enumerate((native, external)))
    return {'native_rows': len(native), 'external_rows': len(external),
            'native_php': totals[0], 'external_php': totals[1], 'native_minus_external_php': totals[0] - totals[1],
            'unique_pairs': len(pairs), 'same_amount_pairs': len(pairs) - len(amount_disagreements),
            'paired_difference_php': paired_difference, 'amount_disagreements': amount_disagreements,
            'office_status_counts': dict(office_counts), 'office_disagreements': office_disagreements,
            'native_unmatched_rows': len(unmatched[0]), 'external_unmatched_rows': len(unmatched[1]),
            'native_unmatched_php': unmatched_totals[0], 'external_unmatched_php': unmatched_totals[1],
            'native_unmatched': unmatched[0], 'external_unmatched': unmatched[1],
            'ambiguous_shared_keys': sum(k in groups[1] and k not in unique for k in groups[0])}


def build(cache):
    import duckdb
    inputs(cache)
    own = validate_house_readings()
    connection = duckdb.connect()
    for name in FILES:
        connection.read_parquet(str(cache / (name + '.parquet'))).create_view(name)
    # Verify the agency selection rather than relying on a guessed UACS code.
    agencies = rows(connection, "SELECT DISTINCT agency_id FROM appropriations WHERE dept_printed ILIKE '%PUBLIC WORKS%'")
    if len(agencies) != 1 or agencies[0]['agency_id'] != '18-001':
        raise ValueError('Unexpected DPWH agency identity')
    controls, detail, programs, source_hashes = [], {}, [], {}
    category_keys = {'General Administration and Support': 'gas_total', 'Support to Operations': 's2o_total',
                     'Operations': 'regular_operations', 'Locally-Funded Projects': 'local_projects',
                     'Foreign-Assisted Projects': 'foreign_assisted_projects'}
    for side, stage, suffix in [('second', 'GAB_2R', ''), ('third', 'GAB_3R', '_3rd_reading')]:
        ib_path = ROOT / f'analysis/data/hb_dpwh_native_rollup{suffix}.json'
        ib = json.loads(ib_path.read_text())
        source_hashes.update(ib['provenance_sha256'])
        native_controls = printed_controls(ib)
        native_controls['payments_right_of_way'] = next(n['printed_amount_php'] for n in walk(ib['root']) if n['label'] == 'Payments of Right-of-Way (ROW)')
        lines = rows(connection, 'SELECT * FROM appropriations WHERE agency_id=? AND stage=?', ['18-001', stage])
        observations = {'new_appropriations': sum(r['amount'] for r in lines),
                        'personnel_services': sum(r['ps'] or 0 for r in lines),
                        'mooe': sum(r['mooe'] or 0 for r in lines),
                        'capital_outlays': sum(r['co'] or 0 for r in lines)}
        for category, field in category_keys.items():
            observations[field] = sum(r['amount'] for r in lines if r['category'] == category)
        observations['payments_right_of_way'] = sum(r['amount'] for r in lines if r['pap'] == 'Payments of Right-of-Way (ROW)')
        observations['operations_including_projects'] = sum(observations[k] for k in ('regular_operations', 'local_projects', 'foreign_assisted_projects'))
        for field, value in observations.items():
            controls.append({'stage': stage, 'control': field, 'native_php': native_controls[field],
                             'external_php': value, 'difference_php': native_controls[field] - value})
        native = [r for pair in own['projects'] if pair[side] for r in pair[side]['records'] if r['zone'] == 'local']
        external = [external_record(r) for r in rows(connection, "SELECT * FROM drilldown_items WHERE stage=? AND source IN ('dpwh_vol_ic', 'dpwh_tail')", [stage])]
        detail[stage] = compare_projects(native, external)
        coverage = rows(connection, "SELECT * FROM drilldown_coverage WHERE stage=? AND source IN ('dpwh_vol_ic', 'dpwh_tail')", [stage])
        for r in coverage:
            program = 'Local Program' if r['source'] == 'dpwh_tail' else r['description']
            native_total = sum(n['amount_php'] for n in native if normalized(n['program']) == normalized(program))
            programs.append({'stage': stage, 'program': program, 'native_php': native_total,
                             'external_parent_php': r['parent_amount'], 'external_detail_php': r['drilldown_amount'],
                             'parent_difference_php': native_total - r['parent_amount'],
                             'detail_gap_php': native_total - r['drilldown_amount']})
    # The same third-reading PDFs enable exact page and source-file verification.
    third_hashes = {
        'HB10858_3R_VOL_I-B.pdf': '4cc0f17e472d1af380ea6d3972561f6bb241137826fd85ed7e7e70bcd92986b9',
        'HB10858_3R_VOL_I-C.pdf': '48cb7a11e391bd4da89d4f47cf39a2eba8fe9bfe636dba101c8284b224ac1b1b'}
    paths = {'HB10858_3R_VOL_I-B.pdf': 'HB_BUDGET_3rd_reading/2- HB 10858 FOR 3RD READING VOL I-B.pdf',
             'HB10858_3R_VOL_I-C.pdf': 'HB_BUDGET_3rd_reading/3- HB 10858 FOR 3RD READING VOL I-C .pdf'}
    for name, path in paths.items():
        if digest(ROOT / path) != third_hashes[name]:
            raise ValueError('Third-reading source PDF differs from external published hash')
    corroborations = []
    external_third = [external_record(r) for r in rows(connection, "SELECT * FROM drilldown_items WHERE stage='GAB_3R' AND source LIKE 'dpwh%'")]
    external_second = [external_record(r) for r in rows(connection, "SELECT * FROM drilldown_items WHERE stage='GAB_2R' AND source LIKE 'dpwh%'")]
    for pair in own['projects']:
        if pair['trace'] != 'third_only':
            continue
        native = pair['third']
        candidates = [r for r in external_third if normalized(r['title']) == normalized(native['title']) and normalized(r['program']) == normalized(native['program'])]
        prior = [r for r in external_second if normalized(r['title']) == normalized(native['title']) and normalized(r['program']) == normalized(native['program'])]
        corroborations.append({'native': slim(native), 'external_candidates': [slim(r) for r in candidates],
                               'external_second_title_count': len(prior),
                               'unique_title_amount_office_page_agree': len(candidates) == 1 and not prior
                                   and candidates[0]['amount_php'] == native['amount_php']
                                   and normalized(candidates[0]['office']) == normalized(native['office'])
                                   and candidates[0]['pdf_page'] == native['pdf_page'],
                               'region_agrees': len(candidates) == 1 and candidates[0]['region'] == native['region']})
    changes = rows(connection, "SELECT category,program,pap,SUM(delta)::BIGINT AS delta_php FROM appropriations_compared WHERE agency_id='18-001' AND comparison='GAB_2R_to_GAB_3R' AND delta<>0 GROUP BY ALL ORDER BY category,program,pap")
    for change in changes:
        if change['pap'] == 'Payments of Right-of-Way (ROW)':
            amounts = {r['stage']: r['native_php'] for r in controls if r['control'] == 'payments_right_of_way'}
            delta = amounts['GAB_3R'] - amounts['GAB_2R']
        else:
            matches = [r for r in own['paps'] if control_key(r['label']) == control_key(change['pap'])]
            if len(matches) != 1:
                raise ValueError('Ambiguous native change control')
            delta = matches[0]['delta_php']
        change['native_delta_php'] = delta
        change['difference_php'] = delta - change['delta_php']
    return {'provenance': {'repository': REPOSITORY, 'commit': COMMIT, 'files_sha256': FILES,
                           'generator_sha256': digest(Path(__file__)),
                           'native_reading_comparison_sha256': digest(ROOT / 'analysis/data/house_reading_changes_2027.json'),
                           'native_ib_artifacts_sha256': {str(p.relative_to(ROOT)): digest(p) for p in
                               (ROOT / 'analysis/data/hb_dpwh_native_rollup.json', ROOT / 'analysis/data/hb_dpwh_native_rollup_3rd_reading.json')},
                           'third_reading_pdf_hashes': third_hashes,
                           'native_ib_sources_sha256': source_hashes},
            'method': 'Unique normalized program + canonical region + normalized title. Amount and office are checked after pairing. Duplicate keys are left unmatched. Missing rows do not establish new/removed projects. Five known third-only records also have a separate title/program comparison with region disagreements preserved. Project detail excludes FAP, GAS and S2O on both sides.',
            'scope': 'External GAB_2R and GAB_3R vs native House 2nd and 3rd readings; GAB_FILED is not a House second-reading baseline.',
            'controls': controls, 'control_disagreements': sum(r['difference_php'] != 0 for r in controls),
            'program_checks': programs, 'projects': detail, 'third_only_corroborations': corroborations,
            'external_appropriation_changes': changes,
            'limits': ['Independent extraction of common source documents, not an independent legislative source.',
                       'External project detail excludes FAP; only the appropriation controls corroborate FAP.',
                       'External validation documentation references retired v5, not the current native House extraction.',
                       'Office and region metadata differences are retained, not silently repaired.']}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--cache-dir', type=Path, default=Path(tempfile.gettempdir()) / 'gab-fy2027-crosscheck')
    parser.add_argument('--out', type=Path, default=ROOT / 'analysis/data/gab_reference_crosscheck.json')
    args = parser.parse_args()
    data = build(args.cache_dir)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'controls_checked': len(data['controls']), 'control_disagreements': data['control_disagreements'],
                      'projects': {stage: {k: r[k] for k in ('unique_pairs', 'same_amount_pairs', 'native_minus_external_php', 'office_status_counts')}
                                   for stage, r in data['projects'].items()},
                      'third_only_records_corroborated': sum(r['unique_title_amount_office_page_agree'] for r in data['third_only_corroborations'])}, indent=2))


if __name__ == '__main__':
    main()
