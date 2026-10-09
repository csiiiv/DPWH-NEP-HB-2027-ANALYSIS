#!/usr/bin/env python3
"""Build Transparency NEP → Official NEP → House candidate stage trace.

Chains retained API↔NEP reconciliation pairs with the House native I-C / NEP candidate
matcher. Amount deltas and presence gaps are review candidates, never certified
additions, removals, or policy cuts.
"""

from __future__ import annotations

import hashlib
import json
import sys
from collections import Counter
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

sys.path[:0] = [str(Path(__file__).resolve().parents[1]),
                str(Path(__file__).resolve().parents[1] / 'builders')]
from paths import DATA, REPO, VIEWERS  # noqa: E402

INPUTS = [
    'source_comparison_2027.json',
    'comparison_manifest.json',
    'nep_2027_api_reconciliation.json',
    'dpwh_transparency_nep_tree.json',
]
METHOD = (
    'Stage 1: retained API↔Official NEP pairs from nep_2027_api_reconciliation '
    '(equal PAP + amount; exact_title_amount or ocr_title_candidate). FAP and the '
    '23 documented non-FAP omissions are outside the Transparency listing. '
    'Stage 2: House project extract ↔ Official NEP exact/fuzzy/ambiguous/unmatched '
    'candidates from source_comparison_2027. Amount does not establish identity. '
    'No pair is manually certified. Unmatched rows are not certified insertions or removals.'
)


def read(name: str):
    return json.loads((DATA / name).read_text())


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def slim(side: dict | None) -> dict | None:
    if not side:
        return None
    keep = ('id', 'title', 'amount_php', 'program', 'pap', 'pap_id', 'zone',
            'region', 'office', 'pdf_page', 'evidence')
    return {k: side.get(k) for k in keep}


def api_side(pair: dict) -> dict:
    return {
        'id': pair['api_code'],
        'title': pair['api_title'],
        'amount_php': pair['amount_php'],
        'pap': pair['pap3'],
        'region': pair['api_region'],
        'office': pair['api_office'],
        'pair_kind': pair['kind'],
        'score': pair.get('score'),
    }


def classify(row: dict) -> str:
    status = row['house_match']
    api_presence = row['api_presence']
    if status == 'exact_candidate':
        delta = row['house_minus_nep_php']
        if api_presence == 'nep_not_in_transparency':
            base = 'transparency_gap_then_'
        elif api_presence == 'outside_api_scope':
            base = 'outside_api_then_'
        else:
            base = ''
        if delta == 0:
            return base + 'amount_same'
        if delta > 0:
            return base + 'candidate_increase'
        return base + 'candidate_decrease'
    if status == 'fuzzy_candidate':
        return 'fuzzy_candidate'
    if status == 'ambiguous':
        return 'ambiguous'
    if status == 'house_unmatched':
        return 'house_only_candidate'
    if status == 'nep_unmatched':
        if api_presence == 'nep_not_in_transparency':
            return 'transparency_gap_nep_only'
        if api_presence == 'outside_api_scope':
            return 'outside_api_nep_only'
        return 'nep_only_candidate'
    return status


def build_rows(comparison: dict, reconciliation: dict) -> list[dict]:
    api_by_source = {p['source_id']: p for p in reconciliation['api_pairs']}
    unpaired = {u['source_id']: u for u in reconciliation['unpaired_source']}
    rows = []
    for record in comparison['projects']:
        nep = slim(record.get('nep'))
        house = slim(record.get('house'))
        api = None
        api_presence = 'no_nep_anchor'
        if nep:
            if nep['id'] in api_by_source:
                api = api_side(api_by_source[nep['id']])
                api_presence = 'paired'
            elif nep['id'] in unpaired:
                api_presence = 'nep_not_in_transparency'
            elif nep['zone'] == 'fap':
                api_presence = 'outside_api_scope'
            else:
                api_presence = 'unexpected_missing_api'
        house_minus_nep = None
        if record['status'] == 'exact_candidate' and house and nep:
            house_minus_nep = house['amount_php'] - nep['amount_php']
        primary = house or nep
        row = {
            'trace': classify({
                'house_match': record['status'],
                'api_presence': api_presence,
                'house_minus_nep_php': house_minus_nep or 0,
            }),
            'house_match': record['status'],
            'api_presence': api_presence,
            'confidence': record.get('confidence'),
            'house_minus_nep_php': house_minus_nep,
            'title': primary['title'] if primary else '',
            'program': primary.get('program') if primary else '',
            'pap': primary.get('pap') if primary else '',
            'region': primary.get('region') if primary else '',
            'zone': primary.get('zone') if primary else '',
            'api': api,
            'nep': nep,
            'house': house,
            'suggestions': [
                {'confidence': c['confidence'], 'nep': slim(c['nep'])}
                for c in record.get('candidates') or []
            ],
            'reason': record.get('reason'),
        }
        if api_presence == 'nep_not_in_transparency' and nep:
            gap = unpaired[nep['id']]
            row['transparency_gap'] = {
                'allocation_kind': gap.get('allocation_kind'),
                'native_pdf_evidence': bool(gap.get('native_pdf_evidence')),
            }
        rows.append(row)
    return rows


def pap_stage_rows(comparison: dict) -> list[dict]:
    rows = []
    for pap in comparison['paps']:
        rows.append({
            'id': pap['id'],
            'label': pap['label'],
            'program': pap['program'],
            'api_php': pap['api_coverage_php'],
            'nep_php': pap['nep_printed_php'],
            'house_control_php': pap['house_printed_php'],
            'house_extract_php': pap['house_extracted_php'],
            'api_to_nep_php': pap['source_api_gap_php'],
            'nep_to_house_control_php': pap['delta_php'],
            'house_coverage_difference_php': pap['coverage_difference_php'],
            'comparison_status': pap['comparison_status'],
            'house_pages': pap['house_pages'],
            'nep_page': pap['nep_page'],
        })
    return rows


def build() -> dict:
    comparison = read('source_comparison_2027.json')
    reconciliation = read('nep_2027_api_reconciliation.json')
    api_tree = read('dpwh_transparency_nep_tree.json')
    rows = build_rows(comparison, reconciliation)
    paps = pap_stage_rows(comparison)
    s = comparison['summary']
    api_summary = reconciliation['summary']
    counts = Counter(r['trace'] for r in rows)
    exact = [r for r in rows if r['house_match'] == 'exact_candidate']
    amount_same = sum(1 for r in exact if r['house_minus_nep_php'] == 0)
    amount_up = [r for r in exact if (r['house_minus_nep_php'] or 0) > 0]
    amount_down = [r for r in exact if (r['house_minus_nep_php'] or 0) < 0]
    summary = {
        'stages': {
            'transparency_nep': {
                'label': 'DPWH Transparency NEP',
                'projects': api_summary['api_rows'],
                'php': api_summary['api_php'],
                'grain': 'Named FY2027 project listing; no PS/MOOE/CO split',
            },
            'official_nep': {
                'label': 'Official NEP (PDF source)',
                'projects': api_summary['non_fap_rows'] + api_summary['fap_rows'],
                'operations_php': api_summary['operations_php'],
                'new_appropriations_php': s['nep_printed_php'],
                'grain': 'Printed new appropriations; operations project comparison below',
            },
            'house': {
                'label': 'House HB 10858',
                'allocations': s['house_allocations'],
                'extracted_php': s['house_extracted_php'],
                'printed_new_appropriations_php': s['house_printed_php'],
                'grain': 'Native I-C operations allocations; project matches remain provisional',
            },
        },
        'transparency_to_official': {
            'paired_rows': api_summary['api_pairs'],
            'pair_kinds': api_summary['api_pair_kinds'],
            'nep_not_in_transparency_rows': api_summary['unpaired_source_rows'],
            'nep_not_in_transparency_php': api_summary['unpaired_source_php'],
            'unpaired_api_rows': api_summary['unpaired_api_rows'],
            'note': 'Paired rows share PAP and amount; Transparency→Official amount deltas are not expected on pairs.',
        },
        'official_to_house': {
            'match_counts': s['match_counts'],
            'exact_amount_same': amount_same,
            'exact_candidate_increase_n': len(amount_up),
            'exact_candidate_increase_php': sum(r['house_minus_nep_php'] for r in amount_up),
            'exact_candidate_decrease_n': len(amount_down),
            'exact_candidate_decrease_php': sum(r['house_minus_nep_php'] for r in amount_down),
            'printed_house_minus_nep_php': s['printed_delta_php'],
            'reviewed_pairs': s['reviewed_pairs'],
        },
        'trace_counts': dict(counts),
        'records': len(rows),
        'api_tree_total_php': api_tree['summary']['total_php'],
        'caveat': (
            'Candidate vocabulary only. Exact title pairs and amount deltas require '
            'manual certification. Unmatched or fuzzy rows do not establish insertions, '
            'removals, or final House amendments. Transparency omissions are documented '
            'API coverage gaps, not Official NEP deletions.'
        ),
    }
    assert summary['api_tree_total_php'] == api_summary['api_php']
    assert sum(counts.values()) == len(rows)
    assert api_summary['unpaired_api_rows'] == 0
    unexpected = [r for r in rows if r['api_presence'] == 'unexpected_missing_api']
    assert not unexpected, f'Unexpected NEP rows without API mapping: {len(unexpected)}'

    manifest = {
        'schema_version': 1,
        'fiscal_year': 2027,
        'built_at': datetime.now(ZoneInfo('Asia/Manila')).isoformat(timespec='seconds'),
        'pipeline': ['DPWH Transparency NEP', 'Official NEP PDF source', 'House HB 10858'],
        'units': 'Integer Philippine pesos',
        'matching_method': METHOD,
        'comparison_ready': False,
        'generator': {
            'path': 'analysis/builders/build_stage_trace.py',
            'sha256': digest(Path(__file__)),
        },
        'inputs': {name: digest(DATA / name) for name in INPUTS},
        'upstream_comparison_built_at': comparison['manifest']['built_at'],
        'source_documents': comparison['manifest']['source_documents'],
        'api_snapshot': comparison['manifest']['api_snapshot'],
    }
    payload = {
        'manifest': manifest,
        'summary': summary,
        'paps': paps,
        'unresolved_paps': comparison['unresolved_paps'],
        'transparency_gaps': reconciliation['unpaired_source'],
        'projects': rows,
    }
    (DATA / 'stage_trace_2027.json').write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + '\n')
    embedded = json.dumps(payload, ensure_ascii=False, separators=(',', ':')).replace('<', '\\u003c')
    template = (VIEWERS / 'stage_trace.template.html').read_text()
    (VIEWERS / 'stage_trace_2027.html').write_text(template.replace('__PAYLOAD__', embedded))
    print(json.dumps({
        'records': summary['records'],
        'trace_counts': summary['trace_counts'],
        'exact_candidate_increase_n': summary['official_to_house']['exact_candidate_increase_n'],
        'exact_candidate_decrease_n': summary['official_to_house']['exact_candidate_decrease_n'],
        'transparency_gaps': summary['transparency_to_official']['nep_not_in_transparency_rows'],
    }, ensure_ascii=False, indent=2))
    return payload


if __name__ == '__main__':
    build()
