#!/usr/bin/env python3
"""Build an audited cleaned observation release without changing source ledgers."""
from __future__ import annotations

import argparse
from collections import Counter, defaultdict
from contextlib import contextmanager
import csv
import gzip
import hashlib
import io
from itertools import zip_longest
import json
from pathlib import Path
import shutil
import tempfile

from build_location_interpretations import load_profiles
from cleaned_policy import (
    ADOPTION, ENABLED_FLAGS, FLAG_POLICY, SCHEMA, TARGET, clean_observation,
)
from locations import Matcher
from processing_release import load_release
from review_catalog import CATALOG_PATH, load_catalog

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / 'master_list/data'
OUTPUT = DATA / 'cleaned'
ARTIFACTS = ('observations.jsonl.gz', 'observations.csv.gz', 'evidence.jsonl.gz',
             'comparison_groups.jsonl.gz', 'review_catalog.json', 'REPORT.md', 'manifest.json')
CSV_FIELDS = (
    'record_id', 'agency', 'dataset', 'fiscal_year', 'stage', 'record_kind',
    'title_clean', 'title_source', 'amount_php', 'program', 'subprogram',
    'implementing_office', 'source_region', 'comparison_group_id', 'comparison_stage',
    'comparison_partition', 'source_pdf', 'pdf_page', 'source_record_id',
    'location_status', 'location_decision', 'verification_status',
    'selected_psgc_codes', 'selected_location_names', 'selected_location_levels',
    'selected_claim_scopes', 'region_codes', 'province_codes', 'city_municipality_codes',
    'barangay_codes', 'selected_candidate_support', 'unresolved_levels',
    'original_master_score', 'original_master_score_method',
    'candidate_support_method', 'best_candidate_code', 'best_support_score',
    'best_dimensions', 'trial_status', 'review_flag_codes', 'review_flag_labels',
    'review_flag_statuses', 'requested_information',
)


def sha(path):
    with Path(path).open('rb') as stream:
        result = hashlib.file_digest(stream, 'sha256')
    return result.hexdigest()


def read_rows(path):
    with gzip.open(path, 'rt', encoding='utf-8') as stream:
        yield from (json.loads(line) for line in stream)


def packed(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'), allow_nan=False)


@contextmanager
def zipped_text(path):
    with Path(path).open('wb') as raw:
        with gzip.GzipFile(filename='', mode='wb', fileobj=raw, mtime=0, compresslevel=6) as zipped:
            with io.TextIOWrapper(zipped, encoding='utf-8', newline='') as stream:
                yield stream


def csv_row(row, catalog):
    result = {k: row.get(k) for k in CSV_FIELDS if k in row}
    loc, support = row['location_resolution'], row['candidate_support']
    selected = loc['selected_locations']
    result.update(location_status=loc['status'], location_decision=loc['decision'],
                  verification_status=loc['verification_status'],
                  comparison_partition=row['comparison']['partition'],
                  pdf_page=row.get('source', {}).get('pdf_page'),
                  candidate_support_method=support['method'],
                  best_candidate_code=support['best_candidate_code'],
                  best_support_score=support['best_support_score'], trial_status=support['trial_status'])
    for field, values in (
        ('selected_psgc_codes', [p['psgc_code'] for p in selected]),
        ('selected_location_names', [p['name'] for p in selected]),
        ('selected_location_levels', [p['level'] for p in selected]),
        ('selected_claim_scopes', [p['claim_scope'] for p in selected]),
        ('selected_candidate_support', [p['candidate_support'] for p in selected]),
        ('unresolved_levels', loc['unresolved_levels']),
        ('best_dimensions', support['best_dimensions']),
        ('review_flag_codes', [f['code'] for f in row['review_flags']]),
        ('review_flag_labels', [catalog['flags'][f['code']]['label'] for f in row['review_flags']]),
        ('review_flag_statuses', [f['status'] for f in row['review_flags']]),
        ('requested_information', [catalog['flags'][f['code']]['requested_information'] for f in row['review_flags']]),
    ):
        result[field] = packed(values)
    for field, levels in (
        ('region_codes', ('region',)), ('province_codes', ('province',)),
        ('city_municipality_codes', ('city', 'municipality')),
        ('barangay_codes', ('barangay',)),
    ):
        result[field] = packed(sorted({p['ancestry'][level]['code'] for p in selected
                                       for level in levels if level in p['ancestry']}))
    return result


def comparison_index(groups):
    metadata, membership, amounts = {}, {}, {}
    for group in groups:
        gid = group['id']
        if gid in metadata:
            raise ValueError('Duplicate comparison group')
        metadata[gid] = {k: v for k, v in group.items() if k != 'stages'}
        for stage, entry in group['stages'].items():
            amounts[(gid, stage)] = entry['amount_php']
            for rid in entry['observation_ids']:
                if rid in membership:
                    raise ValueError('Reused comparison observation')
                membership[rid] = (gid, stage)
    return metadata, membership, amounts


def materialize(directory, sources, masters, profiles, coordinates, groups, matcher, catalog):
    """Streaming join, rejecting coverage, membership and source-value changes."""
    metadata, membership, stage_amounts = comparison_index(groups)
    actual_amounts = Counter()
    counts, decisions, statuses, flags, partitions = Counter(), Counter(), Counter(), Counter(), Counter()
    datasets = defaultdict(lambda: {'records': 0, 'amount_php': 0})
    seen = set()
    sentinel = object()
    with zipped_text(directory / ARTIFACTS[0]) as observations, \
            zipped_text(directory / ARTIFACTS[1]) as csv_stream, \
            zipped_text(directory / ARTIFACTS[2]) as evidence:
        writer = csv.DictWriter(csv_stream, fieldnames=CSV_FIELDS, lineterminator='\n')
        writer.writeheader()
        for source, master, profile in zip_longest(sources, masters, profiles, fillvalue=sentinel):
            if any(item is sentinel for item in (source, master, profile)):
                raise ValueError('Source/master/profile coverage differs')
            rid = source['record_id']
            if rid in seen:
                raise ValueError('Duplicate source observation')
            seen.add(rid)
            if master['record_id'] != rid or profile['record_id'] != rid:
                raise ValueError('Source/master/profile order or identity differs')
            if any(k not in master or master[k] != value for k, value in source.items()):
                raise ValueError(f'Master changed a processing source value: {rid}')
            if type(source['amount_php']) is not int:
                raise ValueError('Source amount must be integer PHP')
            gid, stage = source.get('comparison_group_id'), source.get('comparison_stage')
            if gid is None:
                if source.get('partition') != 'not_compared' or stage is not None or rid in membership:
                    raise ValueError('Unexplained outside-comparison observation')
                comparison = {k: source.get(k) for k in ('partition', 'scope_reason', 'comparison_scope')}
            else:
                if membership.pop(rid, None) != (gid, stage):
                    raise ValueError('Comparison membership differs from source')
                group = metadata[gid]
                comparison = {'partition': group['partition'], 'group_id': gid, 'stage': stage,
                              'upstream': group.get('upstream', {}),
                              'presence_by_house_reading': group.get('presence_by_house_reading')}
                actual_amounts[(gid, stage)] += source['amount_php']
            coordinate = coordinates.pop(rid, None)
            row, companion = clean_observation(master, profile, coordinate, comparison, matcher, catalog)
            for k, value in source.items():
                if row.get(k) != value:
                    raise ValueError(f'Cleaned row changed a source value: {rid}.{k}')
            observations.write(packed(row) + '\n')
            evidence.write(packed(companion) + '\n')
            writer.writerow(csv_row(row, catalog))
            counts['records'] += 1
            counts['with_review_questions'] += bool(row['review_flags'])
            counts['selected_locations'] += len(row['location_resolution']['selected_locations'])
            decisions[row['location_resolution']['decision']] += 1
            statuses[row['location_resolution']['status']] += 1
            flags.update(f['code'] for f in row['review_flags'])
            partitions[row['comparison']['partition']] += 1
            datasets[row['dataset']]['records'] += 1
            datasets[row['dataset']]['amount_php'] += row['amount_php']
    if coordinates or membership:
        raise ValueError('Orphan coordinate or comparison observations')
    if dict(actual_amounts) != stage_amounts:
        raise ValueError('Comparison stage amounts differ from source sums')
    return {'counts': dict(counts), 'location_decisions': dict(decisions),
            'location_statuses': dict(statuses),
            'review_flags': {code: flags[code] for code in catalog['flags']},
            'observation_partitions': dict(partitions), 'datasets': dict(datasets)}


def build(directory):
    directory.mkdir(parents=True, exist_ok=True)
    inputs = {}
    processing = load_release(inputs)
    profiles, profile_audit = load_profiles()
    master_audit = json.loads((DATA / 'audit.json').read_text())
    if sha(DATA / 'projects.jsonl.gz') != master_audit['output_sha256']['projects.jsonl.gz']:
        raise ValueError('Master records differ from their audit')
    for name, info in master_audit['input_files'].items():
        if sha(ROOT / name) != info['sha256']:
            raise ValueError(f'Stale master input: {name}')
    for name, expected in master_audit['builder_sha256'].items():
        if sha(Path(__file__).with_name(name)) != expected:
            raise ValueError(f'Stale master builder: {name}')
    coord_audit = json.loads((DATA / 'coordinate_psgc_audit.json').read_text())
    processing_path = DATA / 'processing/observations.jsonl.gz'
    if (coord_audit['input']['path'] != str(processing_path.relative_to(ROOT))
            or coord_audit['input']['sha256'] != sha(processing_path)
            or coord_audit['output_sha256']['coordinate_psgc.jsonl.gz'] != sha(DATA / 'coordinate_psgc.jsonl.gz')):
        raise ValueError('Coordinate evidence differs from processing release or audit')
    coordinates = {}
    for row in read_rows(DATA / 'coordinate_psgc.jsonl.gz'):
        if row['record_id'] in coordinates:
            raise ValueError('Duplicate coordinate observation')
        coordinates[row['record_id']] = row
    if len(coordinates) != coord_audit['records_with_points']:
        raise ValueError('Coordinate count differs from audit')
    catalog = load_catalog()
    catalog_path = ROOT / 'PSGC2LEG/data/psgc_locations.jsonl'
    pinned = [DATA / name for name in ('projects.jsonl.gz', 'audit.json',
              'location_interpretations.jsonl.gz', 'location_interpretations_audit.json',
              'coordinate_psgc.jsonl.gz', 'coordinate_psgc_audit.json')]
    pinned += [DATA / 'processing/comparison_groups.jsonl.gz', catalog_path, CATALOG_PATH,
               Path(__file__), Path(__file__).with_name('cleaned_policy.py'),
               Path(__file__).with_name('review_catalog.py')]
    inputs.update({str(p.relative_to(ROOT)): {'sha256': sha(p)} for p in pinned})
    matcher = Matcher([json.loads(line) for line in catalog_path.read_text().splitlines()])
    result = materialize(directory, read_rows(processing_path), read_rows(DATA / 'projects.jsonl.gz'),
                         profiles, coordinates, read_rows(DATA / 'processing/comparison_groups.jsonl.gz'),
                         matcher, catalog)
    if result['counts']['records'] != processing['source_observations'] or result['counts']['records'] != profile_audit['records']:
        raise ValueError('Cleaned coverage differs from audited inputs')
    if result['observation_partitions'].get('not_compared', 0) != processing['not_compared_observations']:
        raise ValueError('Outside-comparison coverage differs')
    for dataset, expected in master_audit['datasets'].items():
        actual = result['datasets'].get(dataset)
        if actual is None or actual['records'] != expected['records'] or actual['amount_php'] != expected['amount_php']:
            raise ValueError(f'Cleaned dataset totals differ: {dataset}')
    shutil.copyfile(CATALOG_PATH, directory / 'review_catalog.json')
    shutil.copyfile(DATA / 'processing/comparison_groups.jsonl.gz', directory / 'comparison_groups.jsonl.gz')
    report = [
        '# Cleaned source observations', '',
        f"{result['counts']['records']:,} observations; `{SCHEMA}`.", '',
        'Every source observation, title, amount and comparison attachment is preserved. '
        'Candidate selections are provisional and limited to their declared scope. '
        'Existing master and applied ledgers are unchanged. Do not sum across source datasets.', '',
        '| Location decision | Observations |', '|---|---:|',
        *[f'| {key} | {value:,} |' for key, value in sorted(result['location_decisions'].items())], '',
        '| Location status | Observations |', '|---|---:|',
        *[f'| {key} | {value:,} |' for key, value in sorted(result['location_statuses'].items())], '',
        '| Clarification question | Observations |', '|---|---:|',
        *[f"| {catalog['flags'][key]['label']} | {value:,} |" for key, value in result['review_flags'].items()], '',
        'Questions can overlap. Empty flags mean no question generated, not verified correctness. '
        'Coverage, description and relationship questions are reserved until specific evidence and task requirements support them. '
        'Responses and human review events have not been imported.', '',
        'The target is city/municipality identification. Finer barangay evidence is retained without '
        'requiring it for every observation. GPS selections describe observed points; full project extent and '
        'coordinate-reference freshness remain unassessed. No new legislative districts are derived.', '',
        'Evidence IDs resolve within the matching record in `evidence.jsonl.gz`. '
        'Shared flag labels are in `review_catalog.json`; CSV expands them for review. '
        'Full comparison groups and their stage-scoped annotations are retained separately in `comparison_groups.jsonl.gz`. '
        'See [release contract](../../docs/CLEANED_DATASET.md).',
    ]
    (directory / 'REPORT.md').write_text('\n'.join(report) + '\n', encoding='utf-8')
    for name, info in inputs.items():
        if sha(ROOT / name) != info['sha256']:
            raise ValueError(f'Input changed during cleaned build: {name}')
    manifest = {
        'schema_version': SCHEMA, 'adoption_policy': ADOPTION, 'flag_policy': FLAG_POLICY,
        'review_catalog': {'path': 'review_catalog.json', 'version': catalog['version'],
                           'sha256': sha(directory / 'review_catalog.json')},
        'reference_collections': {
            'evidence': {'path': 'evidence.jsonl.gz', 'key': 'record_id', 'local_items': 'items'},
            'comparison_groups': {'path': 'comparison_groups.jsonl.gz', 'key': 'id',
                                  'records': processing['comparison_groups']},
        },
        'task': {'purpose': 'Identify project localities for later geographic processing',
                 'target_level': TARGET, 'whole_project_extent_required': False,
                 'legislative_district_derivation': 'deferred'},
        'policy': {'enabled_flags': list(ENABLED_FLAGS), 'initial_review_status': 'open',
                   'candidate_support_method': profile_audit['context_scoring']['method'],
                   'selection': 'Pinned ready_for_trial proposal, passing retained gates; otherwise retain master interpretation.',
                   'verification': 'provisional', 'score_change_on_adoption': 0,
                   'legacy_legislative_district': 'Preserved only; not recomputed from cleaned locations.',
                   'coordinate_reference_freshness': 'not_assessed'},
        **result, 'input_files': inputs,
        'output_sha256': {name: sha(directory / name) for name in ARTIFACTS if name != 'manifest.json'},
    }
    (directory / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True) + '\n', encoding='utf-8')
    return manifest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out', type=Path, default=OUTPUT)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    with tempfile.TemporaryDirectory(prefix='cleaned-observations-') as tmp:
        directory = Path(tmp)
        manifest = build(directory)
        if args.check:
            stale = [name for name in ARTIFACTS if not (args.out / name).is_file()
                     or sha(args.out / name) != sha(directory / name)]
            if stale:
                raise SystemExit('Stale cleaned outputs: ' + ', '.join(stale))
        else:
            args.out.mkdir(parents=True, exist_ok=True)
            for name in ARTIFACTS:
                shutil.copyfile(directory / name, args.out / name)
        print(f"{'Checked' if args.check else 'Built'}: {manifest['counts']['records']:,} cleaned observations; "
              f"{manifest['location_decisions'].get('adopted_candidate', 0):,} provisional candidate selections.")


if __name__ == '__main__':
    main()
