#!/usr/bin/env python3
"""Pre-generate readable titles and retain the existing comparison partitions.

No PDF extraction, rematching, location inference or bridge feedback. Four
workbench JSONs supply comparison groups and enriched stage records. The
existing source adapters supply independent ledger coverage, raw provenance,
and the House GAS/S2O observations outside the operations comparisons.
"""
from __future__ import annotations

import argparse
from collections import Counter
import gzip
import io
import json
from pathlib import Path
import shutil
import tempfile

from build_master_list import ROOT, observations, sha
from readable_titles import TITLE_CLEAN_METHOD, annotate_titles, readable_title

OUTPUT = ROOT / 'master_list/data/processing'
PRIMARY = {
    'dpwh': 'analysis/data/comparison_projects_2027.json',
    'fmr': 'other-analysis/data/fmr_workbench.json',
    'hfep': 'other-analysis/data/hfep_workbench.json',
    'nia': 'analysis-nia/data/nia_workbench.json',
}
ARTIFACTS = ('observations.jsonl.gz', 'comparison_groups.jsonl.gz',
             'outside_comparison.jsonl.gz', 'audit.json', 'REPORT.md')


def require(condition, message):
    if not condition:
        raise ValueError(message)


def read(path):
    return json.loads((ROOT / path).read_text(encoding='utf-8'))


def json_text(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'))


def write_jsonl(path, rows):
    with path.open('wb') as raw, gzip.GzipFile(filename='', mode='wb', fileobj=raw, mtime=0) as zipped:
        with io.TextIOWrapper(zipped, encoding='utf-8', newline='\n') as stream:
            for row in rows:
                stream.write(json_text(row) + '\n')


def hydrate_side(row, side):
    """Mirror the compact DPWH payload's explicit per-side inherit contract."""
    source = row.get(side)
    if source is None:
        return None
    inherited = source.get('inherit', [])
    require(all(key in row for key in inherited), f'Missing inherited DPWH fields: {row.get("id")}')
    return {**{key: row[key] for key in inherited},
            **{key: value for key, value in source.items() if key != 'inherit'}}


class ProcessingDataset:
    def __init__(self, records):
        self.records = {}
        for record in records:
            rid = record['record_id']
            require(rid not in self.records, f'Duplicate source observation: {rid}')
            self.records[rid] = {**record, **readable_title(record['title']),
                                 'comparison_group_id': None, 'comparison_stage': None}
        self.groups = []
        self.group_ids = set()

    def add_group(self, domain, original, stage_records, stage_ids, primary_path):
        gid = f'{domain}:{original["id"]}'
        require(gid not in self.group_ids, f'Duplicate comparison group: {gid}')
        self.group_ids.add(gid)
        stages = {}
        for stage, payload in stage_records.items():
            ids = stage_ids[stage]
            require(bool(ids), f'Empty comparison stage: {gid}:{stage}')
            require(len(ids) == len(set(ids)), f'Duplicate stage members: {gid}:{stage}')
            members = []
            for rid in ids:
                require(rid in self.records, f'Unknown source observation: {gid}:{rid}')
                record = self.records[rid]
                require(record['comparison_group_id'] is None, f'Reused source observation: {rid}')
                record.update(comparison_group_id=gid, comparison_stage=stage)
                members.append(record)
            amount = payload.get('amount_php')
            if amount is None:
                amount = payload.get('amounts_php', {}).get('total')
            require(type(amount) is int, f'Missing integer stage amount: {gid}:{stage}')
            require(sum(r['amount_php'] for r in members) == amount,
                    f'Stage amount differs from source ledger: {gid}:{stage}')
            stage_payload = annotate_titles(payload)
            stage_payload.update(observation_ids=ids, amount_php=amount)
            stages[stage] = stage_payload
            # A genuinely grouped side has aggregate features. Keep those on
            # the group, not on every member as if individually established.
            if len(members) == 1:
                members[0]['analysis_record'] = stage_payload

        nep = bool(stages.get('nep'))
        house = any(stage in stages for stage in ('house', 'second', 'third'))
        partition = ('matched' if nep and house else 'nep_only' if nep else
                     'house_only' if house else 'api_only')
        primary_stage = next(stage for stage in ('third', 'second', 'house', 'nep', 'api')
                             if stage in stages)
        primary = stages[primary_stage]
        group = {'id': gid, 'domain': domain, 'partition': partition,
                 'title_source_stage': primary_stage, **readable_title(primary['title']),
                 'source_dataset': primary_path, 'stages': stages,
                 'upstream': annotate_titles(original)}
        if domain == 'dpwh':
            # Overall membership preserves both House readings. A distinct
            # per-reading presence avoids interpreting a historical-only
            # House row as present in the other reading.
            group['presence_by_house_reading'] = {
                stage: ('both' if nep and stage in stages else 'nep_only' if nep else
                        'house_only' if stage in stages else 'neither')
                for stage in ('second', 'third')}
        self.groups.append(group)


def add_dpwh(result, data):
    for row in data['projects']:
        stages, ids = {}, {}
        for stage, dataset in [('api', 'dpwh_nep_api'), ('nep', 'dpwh_nep_pdf'),
                               ('second', 'dpwh_house_second'), ('third', 'dpwh_house_third')]:
            side = hydrate_side(row, stage)
            if side is None:
                continue
            members = side.get('records') or [side]
            source_ids = []
            for member in members:
                native = member.get('native_node_id') if stage in ('second', 'third') else member.get('id')
                require(bool(native), f'Missing DPWH native ID: {row["id"]}:{stage}')
                source_ids.append(f'{dataset}:{native}')
            stages[stage], ids[stage] = side, source_ids
        metadata = {key: value for key, value in row.items()
                    if key not in ('api', 'nep', 'second', 'third')}
        result.add_group('dpwh', metadata, stages, ids, PRIMARY['dpwh'])


def add_annex(result, domain, data):
    key = 'facilities' if domain == 'hfep' else 'projects'
    lookup = {}
    for stage in ('nep', 'house'):
        rows = data['stages'][stage][key]
        lookup[stage] = {p['id']: p for p in rows}
        require(len(lookup[stage]) == len(rows), f'Duplicate {domain} source IDs: {stage}')
    if domain == 'hfep':
        rows = []
        used = {stage: set() for stage in lookup}
        for pair in data['comparison']['pairs']:
            for stage in used:
                require(pair[f'{stage}_id'] not in used[stage], f'Reused HFEP pair: {pair}')
                used[stage].add(pair[f'{stage}_id'])
            rows.append({**pair, 'id': f'pair:{pair["nep_id"]}:{pair["house_id"]}',
                         'status': 'paired', 'method': 'title_similarity_candidate'})
        for stage in lookup:
            for pid in sorted(lookup[stage].keys() - used[stage]):
                rows.append({'id': f'{stage}_only:{pid}', 'status': f'{stage}_only',
                             f'{stage}_id': pid})
    else:
        rows = data['comparison']
    for row in rows:
        stages, ids = {}, {}
        for stage in ('nep', 'house'):
            pid = row.get(f'{stage}_id')
            if pid is None:
                continue
            require(pid in lookup[stage], f'Unknown {domain} counterpart: {pid}')
            stages[stage] = lookup[stage][pid]
            dataset = f'{domain}_{"hgab" if stage == "house" else "nep"}'
            ids[stage] = [f'{dataset}:{pid}']
        result.add_group(domain, row, stages, ids, PRIMARY[domain])


def outside_scope(record):
    """Only the independently identified House GAS/S2O leaves may be outside."""
    require(record['dataset'] in ('dpwh_house_second', 'dpwh_house_third')
            and record['record_kind'] == 'allocation',
            f'Unexpected source observation outside comparisons: {record["record_id"]}')
    sections = {p['label'] for p in record.get('source_path', [])
                if isinstance(p, dict) and p.get('kind') == 'section'}
    scope = next((section for section in ('GENERAL ADMINISTRATIVE AND SUPPORT', 'SUPPORT TO OPERATIONS')
                  if section in sections), None)
    require(scope is not None, f'Unexplained comparison exclusion: {record["record_id"]}')
    return {'partition': 'not_compared', 'comparison_scope': scope,
            'scope_reason': 'House GAS/S2O MOOE/CO leaf; outside the operations comparison. '
                            'No NEP counterpart comparison was performed.'}


def validate_coverage(result, payloads):
    """Require all compared source records once, not merely balanced group sums."""
    for dataset in {r['dataset'] for r in result.records.values()}:
        uncovered = [r for r in result.records.values()
                     if r['dataset'] == dataset and r['comparison_group_id'] is None]
        for record in uncovered:
            record.update(outside_scope(record))
    for domain in ('fmr', 'nia'):
        expected = payloads[domain]['comparison_summary']['counts']
        got = Counter(g['partition'] for g in result.groups if g['domain'] == domain)
        require(got == Counter({'matched': expected['paired'], 'house_only': expected['house_only'],
                                'nep_only': expected['nep_only']}), f'{domain}: partition accounting differs')
    expected = payloads['hfep']['comparison']['counts']
    got = Counter(g['partition'] for g in result.groups if g['domain'] == 'hfep')
    require(got == Counter({'matched': expected['pairs'], 'house_only': expected['house_only'],
                            'nep_only': expected['nep_only']}), 'HFEP: partition accounting differs')


def build(directory):
    directory.mkdir(parents=True, exist_ok=True)
    inputs = {}
    result = ProcessingDataset(observations(inputs))
    payloads = {}
    for domain, path in PRIMARY.items():
        require((ROOT / path).is_file(), f'Missing {path}; generate the existing comparison/workbench inputs first')
        payloads[domain] = read(path)
        require(payloads[domain].get('schema_version') == 1, f'Unsupported {domain} workbench schema')
        inputs[path] = {'sha256': sha(ROOT / path), 'role': 'primary_comparison'}
    # Validate the compact payload's direct generation inputs as well as its
    # members against the independent source ledgers below.
    for filename, expected in payloads['dpwh']['input_sha256'].items():
        path = ROOT / 'analysis/data' / filename
        require(sha(path) == expected, f'Stale DPWH compact input: {filename}')
        inputs[str(path.relative_to(ROOT))] = {'sha256': expected, 'role': 'dpwh_comparison_dependency'}
    add_dpwh(result, payloads['dpwh'])
    for domain in ('fmr', 'hfep', 'nia'):
        add_annex(result, domain, payloads[domain])
    validate_coverage(result, payloads)

    records = sorted(result.records.values(), key=lambda r: r['record_id'])
    groups = sorted(result.groups, key=lambda g: g['id'])
    outside = [r for r in records if r['comparison_group_id'] is None]
    write_jsonl(directory / ARTIFACTS[0], records)
    write_jsonl(directory / ARTIFACTS[1], groups)
    write_jsonl(directory / ARTIFACTS[2], outside)
    dataset_checks = {}
    for dataset in sorted({r['dataset'] for r in records}):
        rows = [r for r in records if r['dataset'] == dataset]
        compared = [r for r in rows if r['comparison_group_id'] is not None]
        remainder = [r for r in rows if r['comparison_group_id'] is None]
        dataset_checks[dataset] = {
            'source_observations': len(rows), 'compared_observations': len(compared),
            'not_compared_observations': len(remainder), 'source_amount_php': sum(r['amount_php'] for r in rows),
            'compared_amount_php': sum(r['amount_php'] for r in compared),
            'not_compared_amount_php': sum(r['amount_php'] for r in remainder),
            'title_clean_changed': sum(r['title_source'] != r['title_clean'] for r in rows)}
    source_notes = {
        'dpwh': 'Partitions retain both House readings; source scope is operations. See per-reading presence and upstream review status.',
        'fmr': payloads['fmr']['matching_note'],
        'hfep': payloads['hfep']['comparison']['pairs_note'],
        'nia': payloads['nia']['matching_note'],
    }
    partition_counts = {domain: dict(Counter(g['partition'] for g in groups if g['domain'] == domain))
                        for domain in PRIMARY}
    audit = {
        'schema_version': 1, 'title_clean_method': TITLE_CLEAN_METHOD,
        'scope': 'Existing FY2027 comparison partitions plus separately retained House GAS/S2O observations. '
                 'Not every agency budget; amounts remain separate by source and stage.',
        'partition_definition': 'matched = NEP and at least one House side attached in an upstream comparison group, '
                                'not a certified unique physical project. Suggestions alone never consume records.',
        'source_observations': len(records), 'comparison_groups': len(groups),
        'compared_observations': len(records) - len(outside), 'not_compared_observations': len(outside),
        'partitions': partition_counts, 'dataset_checks': dataset_checks,
        'outside_comparison_sections': dict(Counter(r['comparison_scope'] for r in outside)),
        'title_clean_rules': dict(Counter(rule for r in records for rule in r['title_clean_rules'])),
        'title_clean_examples': [{k: r[k] for k in ('record_id', 'title_source', 'title_clean', 'title_clean_rules')}
                                 for r in records if 'split_enye_joined' in r['title_clean_rules']][:10],
        'matching_notes': source_notes,
        'source_discrepancies': {'hfep_nep': read('analysis-hfep/data/nep_hfep_audit.json')['summary']['ledger_vs_grand_total_gap_php']},
        'input_files': inputs,
        'builder_sha256': {name: sha(Path(__file__).parent / name) for name in
                           ('build_processing_dataset.py', 'readable_titles.py', 'build_master_list.py')},
        'output_sha256': {name: sha(directory / name) for name in ARTIFACTS[:3]},
    }
    # The HFEP control discrepancy is an audit input, not a balancing plug.
    path = 'analysis-hfep/data/nep_hfep_audit.json'
    inputs[path] = {'sha256': sha(ROOT / path), 'role': 'source_control_discrepancy'}
    (directory / 'audit.json').write_text(json.dumps(audit, ensure_ascii=False, sort_keys=True, indent=2) + '\n')
    lines = ['# Readable processing dataset', '',
             f'{len(groups):,} comparison groups cover {len(records) - len(outside):,} source observations. '
             f'Another {len(outside):,} House GAS/S2O observations are explicitly not compared. '
             f'All {len(records):,} source observations are retained.', '',
             '| Domain | Matched | House only | NEP only | API only |', '|---|---:|---:|---:|---:|']
    for domain, counts in partition_counts.items():
        lines.append(f'| {domain} | ' + ' | '.join(f'{counts.get(k, 0):,}' for k in
                     ('matched', 'house_only', 'nep_only', 'api_only')) + ' |')
    lines += ['', 'Matched means an upstream comparison attachment, not certified project identity. '
              'Scope-review pairs, repeated-key groups, fuzzy suggestions, strict/corrected statuses and '
              'stage-specific data remain available. No rematching is performed.', '',
              'Readable titles preserve the original title and record conservative whitespace, Unicode, '
              'entity and split-ñ repairs. Matching abbreviations, numbers and geographic guesses are not rewritten.', '',
              'See [the processing schema](../../docs/PROCESSING_DATASET.md) and audit.json for coverage, '
              'stage amounts, input hashes, source discrepancies and title examples.']
    (directory / 'REPORT.md').write_text('\n'.join(lines) + '\n')
    return audit


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true', help='Regenerate temporarily and compare retained outputs')
    parser.add_argument('--out', type=Path, default=OUTPUT)
    args = parser.parse_args()
    with tempfile.TemporaryDirectory(prefix='readable-processing-') as temp:
        directory = Path(temp)
        audit = build(directory)
        if args.check:
            stale = [name for name in ARTIFACTS if not (args.out / name).is_file()
                     or sha(directory / name) != sha(args.out / name)]
            require(not stale, 'Stale processing outputs: ' + ', '.join(stale))
        else:
            args.out.mkdir(parents=True, exist_ok=True)
            for name in ARTIFACTS:
                shutil.copyfile(directory / name, args.out / name)
        print(f'{"Checked" if args.check else "Built"}: {audit["comparison_groups"]:,} comparison groups, '
              f'{audit["not_compared_observations"]:,} outside-scope observations; '
              f'{audit["source_observations"]:,} total source observations retained.')


if __name__ == '__main__':
    main()
