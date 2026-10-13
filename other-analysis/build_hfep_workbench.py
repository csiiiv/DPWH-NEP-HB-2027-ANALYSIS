"""Build the HFEP browser dataset from retained, audited source hierarchies.

Two per-document stages (House Volume I-B annex; NEP executive-proposal annex)
are joined into one payload, plus a reviewable cross-document comparison. The
stages are never merged row-to-row: the House annex covers only LGU-side
capital outlays while the NEP annex covers all capital outlays, so the
comparison section offers (a) per-column printed-control reconciliation and
(b) title-similarity pairs (>=0.95 within the same region and province) that
are suggestions for human review (see analysis-hfep/README.md). The workbench
presents each stage's own controls and evidence; missing counterparts stay
unavailable rather than zero.

Invariants enforced with raise (all re-verified by --check):
  * exact partition of every source facility into the payload ledger;
  * printed control == sum of children for every node and funding column,
    except the documented NEP ₱140,000 Metro Manila printed defect chain;
  * the HFEP annex totals reconcile to the agency capital-outlay control
    (₱10,021,659,000 House; ₱14,472,659,000 NEP) — capital outlays only, never
    the wider allocation that also includes MOOE;
  * comparison pairs are unique on both sides, reference real rows, and the
    matched/unmatched accounting adds up to both stage populations.
"""
import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path

HFEP_ROOT = Path(__file__).resolve().parent.parent / 'analysis-hfep'
OUTPUT = Path(__file__).resolve().parent / 'data/hfep_workbench.json'

FUND_COLUMNS = ('infrastructure', 'medical_equipment', 'motor_vehicle', 'total')
# The only accepted printed-vs-children differences: the published NEP annex
# omits one ₱140,000 Metro Manila health-center row that its controls still
# count (metro_manila_med_overhang_140000). Every other difference is an error.
NEP_PRINTED_DEFECT = {
    'node_ids': ['nep_hfep:p2:r47', 'nep_hfep:p2:r46', 'nep_hfep:p2:r45', 'nep_hfep:p1:r3', 'nep_hfep:p1:title'],
    'columns': {'medical_equipment': 140000, 'total': 140000},
    'id': 'metro_manila_med_overhang_140000',
}
HOUSE_ANNEX_CONTROL_TOTAL = 10_021_659_000
NEP_ANNEX_CONTROL_TOTAL = 14_472_659_000
# Extraction runs on the 13-page standalone annex (HFEP_2.pdf); the workbench
# preview opens the canonical Volume II-A OCR PDF at the matching pages.
# HFEP_2 p.N == Volume II-A p.(N+726) == printed page (N+718).
NEP_VOLUME_PDF = 'dbm-nep-data/NEP-2027-VOLUME-2A_OCR.pdf'
NEP_STANDALONE_TO_VOLUME_PAGE = 726


def _sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _read(path):
    return json.loads(path.read_text())


def _column(amounts, key):
    value = amounts.get(key)
    # Printed blank cells stay null: a blank is a printing statement, not zero.
    return value if value is not None else None


def _sum_column(nodes, key):
    return sum(_column(node['printed_amounts_php'], key) or 0 for node in nodes)


def load_stage(stage_key, prefix):
    tree = _read(HFEP_ROOT / f'data/{prefix}_hfep_tree.json')
    audit = _read(HFEP_ROOT / f'data/{prefix}_hfep_audit.json')
    if not audit['passed'] or audit['errors']:
        raise ValueError(f'{stage_key}: source audit did not pass')

    nodes = {node['id']: node for node in tree['nodes']}
    if len(nodes) != len(tree['nodes']):
        raise ValueError(f'{stage_key}: duplicate hierarchy IDs')
    root = nodes[tree['root_id']]

    # Exact partition: every facility enters the ledger exactly once.
    facilities = [n for n in tree['nodes'] if n['kind'] == 'facility']
    facility_ids = [f['id'] for f in facilities]
    if len(set(facility_ids)) != len(facility_ids):
        raise ValueError(f'{stage_key}: duplicate facility IDs')
    if any(node.get('child_ids') for node in facilities):
        raise ValueError(f'{stage_key}: facility with children')

    # Facilities attach to their printed province (the leaf parent control).
    provinces = [n for n in tree['nodes'] if n['kind'] == 'province_control']
    province_index = {p['id']: p for p in provinces}
    orphan = [f for f in facilities if f['parent_id'] not in province_index]
    if orphan:
        raise ValueError(f'{stage_key}: facility not under a province control: {orphan[0]["id"]}')
    facility_by_parent = {}
    for f in facilities:
        facility_by_parent.setdefault(f['parent_id'], []).append(f)
    if sum(len(v) for v in facility_by_parent.values()) != len(facilities):
        raise ValueError(f'{stage_key}: facility parent assignment lost rows')

    # Row money identity: components sum to total on every facility row
    # (extraction already asserts this; the workbench re-proves it).
    for f in facilities:
        amounts = f['printed_amounts_php']
        components = sum(_column(amounts, key) or 0
                         for key in ('infrastructure', 'medical_equipment', 'motor_vehicle'))
        if components != (_column(amounts, 'total') or 0):
            raise ValueError(f'{stage_key}: row identity failed: {f["id"]}')

    # Printed control == sum of children, per column, for every structural
    # control — checked both against immediate children and against recursive
    # facility leaves. The annex program's children include the grand-total
    # echo, so its control is the category sum. The single documented NEP
    # printed defect (metro_manila_med_overhang_140000) is the only accepted
    # difference: the published Metro Manila block omits one ₱140,000 row that
    # its controls still count, and the overhang propagates up the chain.
    def leaf_facilities(node_id):
        node = nodes[node_id]
        if node['kind'] == 'facility':
            return [node]
        collected = []
        for child in node['child_ids']:
            if nodes[child]['kind'] != 'grand_total':
                collected.extend(leaf_facilities(child))
        return collected

    defect_nodes = set(NEP_PRINTED_DEFECT['node_ids']) if stage_key == 'nep' else set()
    defect_columns = NEP_PRINTED_DEFECT['columns'] if stage_key == 'nep' else {}
    control_checks = []
    for node in tree['nodes']:
        if not node.get('child_ids') or node['kind'] == 'facility':
            continue
        if node['kind'] == 'annex_program' and not node['printed_amounts_php']:
            # The House root prints no amounts of its own; its derived control
            # is the category sum and is verified via the grand-total row.
            continue
        children = [nodes[c] for c in node['child_ids'] if nodes[c]['kind'] != 'grand_total']
        leaves = leaf_facilities(node['id'])
        for column in FUND_COLUMNS:
            printed = _column(node['printed_amounts_php'], column) or 0
            child_sum = _sum_column(children, column)
            leaf_sum = _sum_column(leaves, column)
            # Immediate-child arithmetic holds everywhere except the defect
            # origin; recursive arithmetic holds everywhere except the chain.
            defect = defect_columns.get(column, 0) if node['id'] in defect_nodes else 0
            child_defect = defect if node['id'] == 'nep_hfep:p2:r47' else 0
            if printed - child_sum != child_defect:
                raise ValueError(
                    f'{stage_key}: control does not balance against children: '
                    f'{node["id"]} {column} printed={printed} children={child_sum}')
            if printed - leaf_sum != defect:
                raise ValueError(
                    f'{stage_key}: control does not balance against facilities: '
                    f'{node["id"]} {column} printed={printed} facilities={leaf_sum}')
            if node['id'] == 'nep_hfep:p1:title' or node['kind'] != 'annex_program':
                if defect:
                    control_checks.append({
                        'node_id': node['id'], 'label': node['label'], 'column': column,
                        'printed_php': printed, 'facility_sum_php': leaf_sum,
                        'difference_php': defect, 'documented_defect': NEP_PRINTED_DEFECT['id'],
                    })
    if stage_key == 'nep' and len(control_checks) != 2 * len(NEP_PRINTED_DEFECT['node_ids']):
        # 2 affected columns (medical_equipment, total) × 5 defect-chain nodes.
        raise ValueError('nep: expected the single documented ₱140,000 defect chain')
    if stage_key == 'house' and control_checks:
        raise ValueError('house: no printed defects are documented for this annex')

    # Ledger total: every facility counted once, per column.
    ledger = {column: _sum_column(facilities, column) for column in FUND_COLUMNS}
    grand_total = next(n for n in tree['nodes'] if n['kind'] == 'grand_total')
    annex_control = {column: _column(grand_total['printed_amounts_php'], column) or 0
                     for column in FUND_COLUMNS}
    # House: ledger == printed grand total exactly. NEP: the facility ledger is
    # ₱140,000 below the printed grand total on medical equipment/total only.
    defect_gap = NEP_PRINTED_DEFECT['columns'] if stage_key == 'nep' else {'medical_equipment': 0, 'total': 0}
    for column in FUND_COLUMNS:
        gap = defect_gap.get(column, 0)
        if annex_control[column] - ledger[column] != gap:
            raise ValueError(
                f'{stage_key}: ledger {column} {ledger[column]:,} does not reconcile with the '
                f'printed annex control {annex_control[column]:,} (gap {gap:,})')

    # Independent rollup cross-check from the audit: its rollup coverage must
    # match exactly the population checked above. The NEP root prints its own
    # amounts and is audited (347 checks); the House root prints none and is
    # verified only via the grand-total row (311 checks without it).
    audit_rollups = {c['node_id']: c for c in audit['rollup_checks']}
    structural_controls = [n for n in tree['nodes']
                           if n.get('child_ids') and n['kind'] != 'facility'
                           and not (n['kind'] == 'annex_program' and not n['printed_amounts_php'])]
    if Counter(audit_rollups.keys()) != Counter(c['id'] for c in structural_controls):
        raise ValueError(f'{stage_key}: audit rollup coverage mismatch')
    for check in audit['rollup_checks']:
        if not check['passed']:
            raise ValueError(f'{stage_key}: audit rollup failed: {check["node_id"]}')

    # Source-PDF page offsets are per annex and must not drift (HFEP +20).
    metadata = tree['metadata']
    offset = 20 if stage_key == 'house' else 718
    for node in tree['nodes']:
        source = node['source']
        if stage_key == 'house':
            actual = source['pdf_page'] - source['printed_page']
        else:
            actual = source['printed_page'] - source['pdf_page']
        if actual != offset:
            raise ValueError(f'{stage_key}: page offset drifted: {node["id"]}')

    # Provenance hashing: the payload records which layers it was built from.
    files = {'tree': f'data/{prefix}_hfep_tree.json', 'audit': f'data/{prefix}_hfep_audit.json'}
    provenance = {rel: _sha256(HFEP_ROOT / rel) for rel in files.values()}

    return {'tree': tree, 'audit': audit, 'nodes': nodes, 'root': root, 'facilities': facilities,
            'provinces': provinces, 'facility_by_parent': facility_by_parent, 'ledger': ledger,
            'annex_control': annex_control, 'control_checks': control_checks, 'metadata': metadata,
            'grand_total': grand_total, 'provenance': provenance}


def _facility_payload(f, province, stage, *, pdf_page_offset=0, preview_pdf=None):
    flags = []
    for flag in (f.get('provenance') or {}).get('flags', []):
        if isinstance(flag, dict):
            flags.append({'flag': flag.get('flag'), 'id': flag.get('id'),
                          'note': flag.get('note'), 'columns': flag.get('columns')})
        else:
            flags.append({'flag': flag})
    return {
        'id': f['id'],
        'stage': stage,
        'title': f['label'],
        'title_raw': f['label_raw'],
        'path_labels': f['path_labels'],
        'parent_id': f['parent_id'],
        'amounts_php': {column: _column(f['printed_amounts_php'], column) for column in FUND_COLUMNS},
        'amounts_raw': f.get('printed_amounts_raw') or {},
        'source': _source_payload(f['source'], pdf_page_offset=pdf_page_offset, preview_pdf=preview_pdf),
        'flags': flags,
        'normalizations': [{'type': n.get('type'), 'from': n.get('from'), 'to': n.get('to')}
                           if isinstance(n, dict) else {'type': n}
                           for n in (f.get('provenance') or {}).get('normalizations', [])],
        'amount_lineage': (f.get('provenance') or {}).get('amount_lineage', []),
    }


def _source_payload(source, *, pdf_page_offset=0, preview_pdf=None):
    # preview_pdf rewrites OCR-JSON provenance to the human-readable annex PDF
    # the workbench opens (Volume II-A for NEP). Extraction artifacts keep the
    # JSON path; the browser payload should not.
    payload = {
        'source_pdf': preview_pdf or source['source_pdf'],
        'row_id': source.get('row_id'),
        'pdf_page': source['pdf_page'] + pdf_page_offset,
        'printed_page': source['printed_page'],
    }
    # Row locator is band (native-text extractor) or table_row (OCR extractor).
    if source.get('band') is not None:
        payload['band'] = source['band']
    if source.get('table_row') is not None:
        payload['table_row'] = source['table_row']
    return payload


def build():
    house = load_stage('house', 'hgab')
    nep = load_stage('nep', 'nep')

    stages = {}
    for stage_key, stage, label, control_total in (
        ('house', house, 'House GAB · Volume I-B annex', HOUSE_ANNEX_CONTROL_TOTAL),
        ('nep', nep, 'DBM NEP · Volume II-A annex', NEP_ANNEX_CONTROL_TOTAL),
    ):
        # NEP evidence opens Volume II-A (same document the agency PAP cites);
        # House already opens Volume I-B. Standalone HFEP_2 page numbers are
        # remapped so the PDF viewer lands on the Volume II-A page.
        page_offset = NEP_STANDALONE_TO_VOLUME_PAGE if stage_key == 'nep' else 0
        preview_pdf = NEP_VOLUME_PDF if stage_key == 'nep' else stage['metadata']['source_pdf']
        # NEP rows rewrite source_pdf to Volume II-A; House keeps Volume I-B.
        source_preview = NEP_VOLUME_PDF if stage_key == 'nep' else None
        src = lambda source: _source_payload(
            source, pdf_page_offset=page_offset, preview_pdf=source_preview)

        facilities_payload = [
            _facility_payload(f, None, stage_key, pdf_page_offset=page_offset,
                              preview_pdf=source_preview)
            for f in stage['facilities']]
        if stage_key == 'nep':
            for f in facilities_payload:
                # Volume II-A PDF page = printed page + 8 (printed 719 → p.727).
                if f['source']['pdf_page'] != f['source']['printed_page'] + 8:
                    raise ValueError(f'nep: volume page remap drifted on {f["id"]}')
                if not 727 <= f['source']['pdf_page'] <= 739:
                    raise ValueError(f'nep: volume page out of HFEP annex range: {f["id"]}')
                if f['source']['source_pdf'] != NEP_VOLUME_PDF:
                    raise ValueError(f'nep: source_pdf must be Volume II-A: {f["id"]}')

        provinces_payload = [{
            'id': p['id'], 'label': p['label'], 'parent_id': p['parent_id'],
            'amounts_php': {column: _column(p['printed_amounts_php'], column) for column in FUND_COLUMNS},
            'facility_ids': stage['facility_by_parent'].get(p['id'], []) and
                            [f['id'] for f in stage['facility_by_parent'][p['id']]],
            'source': src(p['source']),
        } for p in stage['provinces']]
        regions = [{
            'id': n['id'], 'label': n['label'], 'parent_id': n['parent_id'],
            'amounts_php': {column: _column(n['printed_amounts_php'], column) for column in FUND_COLUMNS},
            'child_ids': n['child_ids'], 'source': src(n['source']),
        } for n in stage['tree']['nodes'] if n['kind'] == 'region_control']
        subcategories = [{
            'id': n['id'], 'label': n['label'], 'parent_id': n['parent_id'],
            'amounts_php': {column: _column(n['printed_amounts_php'], column) for column in FUND_COLUMNS},
            'child_ids': n['child_ids'], 'source': src(n['source']),
        } for n in stage['tree']['nodes'] if n['kind'] == 'subcategory_control']
        categories = [{
            'id': n['id'], 'label': n['label'],
            'amounts_php': {column: _column(n['printed_amounts_php'], column) for column in FUND_COLUMNS},
            'child_ids': n['child_ids'], 'source': src(n['source']),
        } for n in stage['tree']['nodes'] if n['kind'] == 'category_control']

        if stage_key == 'nep':
            root_amounts = dict(stage['root']['printed_amounts_php'])
        else:
            # The House root prints no amounts; the annex control is the
            # grand-total row (₱10,021,659,000 = capital outlays only).
            root_amounts = dict(stage['grand_total']['printed_amounts_php'])
        root_amounts['total'] = control_total
        if root_amounts['total'] != stage['annex_control']['total']:
            raise ValueError(f'{stage_key}: annex control mismatch')

        stages[stage_key] = {
            'key': stage_key,
            'label': label,
            'document': stage['metadata']['document'],
            'legislative_stage': stage['metadata']['legislative_stage'],
            'scope': stage['metadata']['scope'],
            'preview_pdf': preview_pdf,
            'root': {
                'id': stage['root']['id'],
                'label': stage['root']['label'],
                'amounts_php': root_amounts,
                'source': src(stage['root']['source']),
            },
            'grand_total': {
                'id': stage['grand_total']['id'],
                'label': stage['grand_total']['label'],
                'amounts_php': {column: _column(stage['grand_total']['printed_amounts_php'], column)
                                for column in FUND_COLUMNS},
                'source': src(stage['grand_total']['source']),
            },
            'categories': categories,
            'subcategories': subcategories,
            'regions': regions,
            'provinces': provinces_payload,
            'facilities': facilities_payload,
            'facility_ledger': stage['ledger'],
            'annex_control': stage['annex_control'],
            'printed_defects': stage['control_checks'],
            'audit_summary': stage['audit']['summary'],
            'agency_check': stage['audit']['agency_check'],
            'provenance': stage['provenance'],
        }

        # Exact partition re-verified on the payload itself.
        if len(facilities_payload) != len(stage['facilities']):
            raise ValueError(f'{stage_key}: payload facility count drifted')
        if sum(f['amounts_php']['total'] or 0 for f in facilities_payload) != stage['ledger']['total']:
            raise ValueError(f'{stage_key}: payload ledger total drifted')

    payload = {
        'schema_version': 1,
        'fiscal_year': 2027,
        'program': 'Health Facilities Enhancement Program (HFEP), Department of Health',
        'funding_columns': list(FUND_COLUMNS),
        'matching_note': (
            'Per-document stages with a reviewable cross-document comparison. The House Volume I-B '
            'annex covers LGU-side HFEP capital outlays while the NEP Volume II-A annex covers all '
            'HFEP capital outlays (national and LGU); the populations are complementary, not paired, '
            'so rows are matched only as reviewable title-similarity suggestions and never merged.'),
        'compare_note': (
            'Column reconciliation compares printed per-column annex controls (always meaningful). '
            'Line-item pairs are suggestions for human review: similarity >= 0.95 on normalized '
            'titles within the same region and province. Per-column deltas on pairs are shown as '
            'printed; unmatched rows stay unmatched rather than zero.'),
        'comparison': build_comparison(stages['house'], stages['nep']),
        'stages': stages,
    }
    return payload


def build_comparison(house, nep):
    """Cross-document comparison: column reconciliation plus reviewable pairs.

    The two annexes cover different scopes (House: LGU-side capital outlays;
    NEP: all capital outlays), so rows are never auto-merged. Instead:
      * column_controls: per-column printed-control gaps (always meaningful);
      * pairs: title-matched House↔NEP rows at >=0.95 similarity within the
        same (region, province) block, each carrying the similarity score and
        the match rule, so every pairing is auditable;
      * unmatched counts on both sides with no implied pairing.
    Matching is deterministic: normalized-title SequenceMatcher ratio, block
    by (region, province), best-pair-greedy with stable ordering.
    """
    import re
    from difflib import SequenceMatcher

    def normalize(title):
        text = title.lower()
        text = re.sub(r'\b(municipality of|city of|municipality|city)\b', ' ', text)
        text = re.sub(r'\bbarangay health station(s)?\b', 'bhs', text)
        text = re.sub(r'\b(rural health unit|health unit)\b', 'rhu', text)
        text = re.sub(r'\bbrgy\.?\b', 'brgy', text)
        text = re.sub(r'[^a-z0-9 ]', ' ', text)
        return re.sub(r'\s+', ' ', text).strip()

    def scope_of(facility):
        # path: root › category [› subcategory] › region › province › facility.
        # NEP categories without a subcategory print a 5-label path; indexing
        # from the tail keeps (region, province) stable across both shapes.
        labels = facility['path_labels']
        return (labels[-3], labels[-2])

    nep_blocks = {}
    for f in nep['facilities']:
        nep_blocks.setdefault(scope_of(f), []).append(f)

    pairs, used_nep = [], set()
    for h in house['facilities']:
        candidates = [c for c in nep_blocks.get(scope_of(h), []) if c['id'] not in used_nep]
        if not candidates:
            continue
        best, best_score = None, 0.0
        for c in candidates:
            score = SequenceMatcher(None, normalize(h['title']), normalize(c['title'])).ratio()
            if score > best_score:
                best, best_score = c, score
        if best is not None and best_score >= 0.95:
            used_nep.add(best['id'])
            pairs.append({'house_id': h['id'], 'nep_id': best['id'], 'similarity': round(best_score, 4)})
    pairs.sort(key=lambda p: (p['similarity'], p['house_id']), reverse=True)

    column_totals = {}
    for column in FUND_COLUMNS:
        house_value = _column(house['annex_control'], column) or 0
        nep_value = _column(nep['annex_control'], column) or 0
        column_totals[column] = {
            'house_php': house_value,
            'nep_php': nep_value,
            'difference_php': nep_value - house_value,
        }

    matched_house = {p['house_id'] for p in pairs}
    matched_nep = {p['nep_id'] for p in pairs}
    comparison = {
        'column_totals': column_totals,
        'counts': {
            'pairs': len(pairs),
            'house_only': len(house['facilities']) - len(matched_house),
            'nep_only': len(nep['facilities']) - len(matched_nep),
        },
        'pairs': pairs,
        'pairs_note': (
            'Pairs are title-similarity suggestions for review, not asserted identities. '
            'Similarity is computed on normalized titles within the same (region, province) '
            'block; every pair carries its score and both source row ids. Rows may be the '
            'same facility with OCR label variants, and House rows without an NEP '
            'counterpart typically reflect the two annexes recording different grains, '
            'not omissions.'),
    }
    # Invariants: pairs are unique on both sides and reference real rows.
    house_ids = {f['id'] for f in house['facilities']}
    nep_ids = {f['id'] for f in nep['facilities']}
    if len({p['house_id'] for p in pairs}) != len(pairs) or len({p['nep_id'] for p in pairs}) != len(pairs):
        raise ValueError('comparison: duplicate row in pairs')
    if not all(p['house_id'] in house_ids and p['nep_id'] in nep_ids for p in pairs):
        raise ValueError('comparison: pair references unknown row')
    if comparison['counts']['house_only'] + comparison['counts']['pairs'] != len(house['facilities']):
        raise ValueError('comparison: house accounting drifted')
    if comparison['counts']['nep_only'] + comparison['counts']['pairs'] != len(nep['facilities']):
        raise ValueError('comparison: nep accounting drifted')
    return comparison


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true',
                        help='re-verify invariants without writing the payload')
    args = parser.parse_args()
    payload = build()
    content = json.dumps(payload, ensure_ascii=False, separators=(',', ':')) + '\n'
    if args.check:
        if not OUTPUT.exists() or OUTPUT.read_text() != content:
            raise SystemExit('HFEP workbench data is missing or stale; run the builder')
    else:
        OUTPUT.write_text(content)
    print(f'HFEP workbench {"verified" if args.check else "built"}: {OUTPUT}')
    for key, stage in payload['stages'].items():
        print(f"  {key}: {len(stage['facilities'])} facilities · "
              f"annex control ₱{stage['annex_control']['total']:,}")


if __name__ == '__main__':
    main()
