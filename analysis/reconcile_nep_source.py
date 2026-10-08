#!/usr/bin/env python3
"""Reconcile FY2027 NEP PDF allocations with API; retain source evidence.

Run from any directory. The external OCR repository is read-only.
Amounts are pesos; PDF pages are one-based. Fuzzy pairs are candidates,
not proof of a project's identity. Source-title presence is not a 1:1 HB match.
"""
import argparse
import copy
import json
import re
import unicodedata
from collections import Counter, defaultdict
from decimal import Decimal
from difflib import SequenceMatcher
from pathlib import Path

import pymupdf

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SOURCE = Path('/mnt/6E9A84429A8408B3/WORK/BetterGovPH/Budget-NEP/NEP_PDF_DATA/paddle_pdf_ocr_v2')
DISASTER = 'Rehabilitation of Disaster-Related Infrastructure and Other Facilities'
PPP = 'Public-Private Partnership Strategic Support Fund (including ROW, Subsidy, and Variations)'


def api_program(row):
    pap2 = row['pap2']
    if pap2 == 'National Building Program':
        return 'Local Program'
    if pap2.startswith(('Basic Infrastructure', 'Construction/ Rehabilitation of Water Supply',
                        'Construction/Rehabilitation/Improvement of Facilities')):
        return 'Convergence and Special Support Program'
    return pap2


def key(text):
    text = unicodedata.normalize('NFKD', text or '').casefold()
    return re.sub(r'[^a-z0-9]', '', text)


def region(text):
    text = unicodedata.normalize('NFKC', text or '').strip()
    aliases = {'National Capital Region': 'NCR', 'Cordillera Administrative Region': 'CAR',
               'MIMAROPA Region': 'MIMAROPA', 'Negros Island Region': 'NIR',
               'BARMM': 'Nationwide'}
    text = aliases.get(text, text)
    return re.sub(r'^(?:egion|Region)\s+', 'Region ', text)


def read(path):
    return json.loads(path.read_text())


def write(name, data):
    (ROOT / 'analysis' / name).write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')


def extract(base, api):
    tree_path = base / 'output/NEP-2027-VOLUME-2B_OCR/002.40-pap-tree/tree.json'
    nodes = copy.deepcopy(read(tree_path)['nodes'])
    lookup = {n['id']: n for n in nodes}
    names = {key(a['pap3']): a['pap3'] for a in api}
    pap_program = {a['pap3']: api_program(a) for a in api}
    pap_program.update({DISASTER: 'Convergence and Special Support Program', PPP: 'Local Program'})
    names.update({key(DISASTER): DISASTER, key(PPP): PPP})
    controls, rows, pap = {}, [], None
    repairs = []
    for n in nodes:
        pg = n.get('page') or 0
        if not 195 <= pg < 688:
            continue
        label = key(n['label'])
        if n['kind'] == 'group':
            if label in names:
                pap = names[label]
            elif label.startswith(key('Construction of Flyovers/ Interchanges/ Underpasses/ Long Span Bridges')):
                pap = names[key('Construction of Flyovers/ Interchanges/ Underpasses/ Long Span Bridges')]
            elif label == key('BIP - Local Ports and Boat Landing'):
                pap = names[key('BIP - Local Ports and Boat Landings')]
            else:
                continue
            controls[pap] = {'id': n['id'], 'page': pg, 'amount_php': n['total']['value']}
        atomic = n['kind'] == 'project' or (n['kind'] in ('office', 'region') and not n['children'])
        if not atomic or n.get('excluded'):
            continue
        assert pap is not None, n['id']
        # Stop office inference at the closest region: outer Central Office
        # nodes also contain region-direct project branches in the source tree.
        r, office, current = '', '', n
        is_region = region(n['label']) in ('Nationwide', 'NCR', 'CAR', 'NIR', 'MIMAROPA') or bool(re.fullmatch(r'Region [IVX]+(?:-[AB])?', region(n['label'])))
        if is_region:
            r = region(n['label'])
        while current.get('parent'):
            current = lookup[current['parent']]
            if current['kind'] == 'office' and not office:
                office = current['label']
            if current['kind'] == 'region':
                r = r or region(current['label'])
                break
        title = ' '.join((n.get('label_raw') or n['label']).split())
        allocation = 'project'
        is_office = (n['label'].startswith('Regional Office ') or n['label'].endswith(' Regional Office') or n['label'] == 'BARMM'
                     or (n['label'].endswith('Engineering Office') and not re.match(r'Construction|Rehabilitation', n['label'])))
        if is_office:
            office = n['label']
            title = pap + ' - ' + n['label']
            allocation = 'office_allocation'
        elif is_region:
            title = pap + ' - ' + n['label']
            allocation = 'region_allocation'
        record = {'source_id': n['id'], 'pdf_page': pg, 'pap3': pap, 'region': r,
                  'office': office, 'title': title, 'amount_php': n['total']['value'],
                  'allocation_kind': allocation, 'program': pap_program[pap],
                  'zone': 'non_fap', 'source_flags': n['flags']}
        if n['id'] in ('p286:r0', 'p286:r1', 'p286:r2', 'p286:r3'):
            # Native PDF text, p286: OCR moved the common first line across
            # project boundaries. Restore the four printed titles independently
            # of API titles; their amounts and row count remain unchanged.
            suffixes = {
                'p286:r0': 'Brgy. Bolisong Section, Sta. 22+672 - Sta. 23+992, El Salvador City, Misamis Oriental',
                'p286:r1': 'Brgy. Bolisong Section, Sta. 23+992 - Sta. 24+992, El Salvador City, Misamis Oriental',
                'p286:r2': 'Brgy. Pagatpat Section, Sta. 2+680 - Sta. 3+330, Cagayan de Oro City',
                'p286:r3': 'Brgy. Patag Section, Sta. 15+512 - Sta. 16+762, Opol, Misamis Oriental',
            }
            record['extracted_title'] = title
            record['title'] = ('CDO-Opol-El Salvador-Alubijid-Laguindingan Airport '
                               '(Pueblo de Oro/CDO Airport to Jct. BCIR Laguindingan) Mountain Diversion Road, '
                               + suffixes[n['id']])
            repairs.append({'source_id': n['id'], 'pdf_page': 286, 'action': 'restore_cross_row_title',
                            'added_php': 0, 'evidence': 'Native PDF text, first four printed project rows.'})
        if n['id'] == 'p494:r27':
            # The PDF image and native text show two separate rows. OCR joined
            # both titles but retained only Bentigan's 20M amount.
            assert record['amount_php'] == 20_000_000 and 'Bertese' in title
            record['extracted_title'] = title
            record['title'] = 'Construction of Road, Barangay Bentigan Cuyapo to Nampicuan Nueva Ecija'
            extra = dict(record, source_id='p494:r27:split-Bertese',
                         title='Construction of Road, Barangay Bertese, Quezon, Nueva Ecija', amount_php=5_000_000)
            rows.append(extra)
            repairs.append({'source_id': n['id'], 'pdf_page': 494, 'action': 'split_merged_project_rows',
                            'added_php': 5_000_000, 'evidence': 'PDF image and native text, final two rows; API also has both titles.'})
        rows.append(record)
    for n in nodes:
        if n['kind'] != 'project' or (n.get('page') or 0) < 688:
            continue
        ancestor, program = n, None
        program_names = {key(p): p for p in pap_program.values()}
        program_names[key('National Building Program')] = 'Local Program'
        while ancestor.get('parent'):
            ancestor = lookup[ancestor['parent']]
            if key(ancestor['label']) in program_names:
                program = program_names[key(ancestor['label'])]
                break
        assert program is not None, n['id']
        rows.append({'source_id': n['id'], 'pdf_page': n['page'], 'pap3': 'Foreign-assisted projects',
                     'region': 'NCR', 'office': 'Central Office',
                     'title': ' '.join((n.get('label_raw') or n['label']).split()),
                     'amount_php': n['total']['value'], 'allocation_kind': 'project',
                     'zone': 'fap', 'program': program, 'source_flags': n['flags']})
    sums = defaultdict(int)
    for row in rows:
        if row['zone'] == 'non_fap':
            sums[row['pap3']] += row['amount_php']
    assert len(controls) == 45
    for pap, control in controls.items():
        assert sums[pap] == control['amount_php'], (pap, sums[pap], control)
    assert sum(sums.values()) == 455_175_063_000
    assert sum(r['amount_php'] for r in rows if r['zone'] == 'fap') == 117_749_011_000
    return rows, controls, repairs


def pair_api(rows, api):
    """Exact first; then retain conservative same-amount OCR candidates."""
    indices = defaultdict(list)
    for i, a in enumerate(api):
        indices[(key(a['pap3']), a['amount_php'])].append(i)
    used, pairs = set(), {}
    for i, row in enumerate(rows):
        candidates = [a for a in indices[(key(row['pap3']), row['amount_php'])]
                      if a not in used and key(row['title']) == key(api[a]['projectName'])]
        candidates.sort(key=lambda a: (region(api[a]['region']) != row['region'],
                                      key(api[a]['office']) != key(row['office']), a))
        if candidates:
            ai = candidates[0]
            pairs[i] = {'api_index': ai, 'kind': 'exact_title_amount', 'score': 1}
            used.add(ai)
    candidates = []
    for i, row in enumerate(rows):
        if i in pairs:
            continue
        for ai in indices[(key(row['pap3']), row['amount_php'])]:
            if ai in used or row['region'] != region(api[ai]['region']):
                continue
            score = SequenceMatcher(None, key(row['title']), key(api[ai]['projectName']), autojunk=False).ratio()
            if score >= .84:
                candidates.append((score, i, ai))
    for score, i, ai in sorted(candidates, reverse=True):
        if i not in pairs and ai not in used:
            pairs[i] = {'api_index': ai, 'kind': 'ocr_title_candidate', 'score': round(score, 5)}
            used.add(ai)
    return pairs, used


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-dir', type=Path, default=DEFAULT_SOURCE)
    args = parser.parse_args()
    api = read(ROOT / 'nep-data/json/fy2027-combined.json')['data']['data']
    for a in api:
        a['amount_php'] = int(Decimal(str(a['amount'])) * 1000)
    rows, controls, repairs = extract(args.source_dir, api)
    source_programs = defaultdict(int)
    for row in rows:
        source_programs[row['program']] += row['amount_php']
    official = read(ROOT/'analysis/reference_official_compilation.json')['nep_gaa_by_program_fy2018_2027']['2027']
    assert len(source_programs)==6
    for program, value in source_programs.items():
        assert value==int(official[program]['nep']), (program,value,official[program])
    local = [r for r in rows if r['zone'] == 'non_fap']
    pairs, used = pair_api(local, api)
    missing = [r for i, r in enumerate(local) if i not in pairs]
    unmatched_api = [a for i, a in enumerate(api) if i not in used]
    pap_api = defaultdict(int)
    for a in api:
        pap_api[a['pap3']] += a['amount_php']
    pap_checks = [dict(pap3=p, source_php=c['amount_php'], api_php=pap_api[p],
                       gap_php=c['amount_php']-pap_api[p], pdf_page=c['page']) for p,c in controls.items()]
    assert len(missing) == 23 and not unmatched_api
    assert sum(r['amount_php'] for r in missing) == 9_797_000_000
    for check in pap_checks:
        assert sum(r['amount_php'] for r in missing if r['pap3']==check['pap3']) == check['gap_php']
    # Independently check each omission amount in its native PDF row crop.
    source_nodes = {n['id']: n for n in read(args.source_dir / 'output/NEP-2027-VOLUME-2B_OCR/002.40-pap-tree/tree.json')['nodes']}
    pdf = pymupdf.open(args.source_dir / 'pdfs/NEP-2027-VOLUME-2B_OCR.pdf')
    for r in missing:
        node = source_nodes[r['source_id']]
        snippet = pdf[r['pdf_page']-1].get_text(clip=pymupdf.Rect(node['bbox']))
        assert f"{r['amount_php']:,}" in snippet, (r['source_id'], snippet)
        r['native_pdf_evidence'] = {'row_bbox': node['bbox'], 'text': snippet, 'amount_present': True}
    # Reassess prior HB-only records as evidence of title presence, without
    # claiming a new greedy 1:1 match or silently consuming duplicates.
    by_title = defaultdict(list)
    global_title = defaultdict(list)
    for r in rows:
        by_title[(r['region'], key(r['title']))].append(r)
        global_title[key(r['title'])].append(r)
    old = read(ROOT / 'analysis/crosscheck_2027_lineitems.json')
    reassessed = []
    headings = {key(c['pap3']) for c in pap_checks}
    headings.update(key(r['title']) for r in rows if r['allocation_kind'] != 'project')
    headings.update(key(n['label']) for n in source_nodes.values()
                    if 195 <= (n.get('page') or 0) < 688 and n['kind'] in ('group','program'))
    missing_ids = {r['source_id'] for r in missing}
    for h in old['hb_only_items']:
        candidates = by_title[(region(h['region']), key(h['title']))]
        entry = dict(h)
        if not candidates and global_title[key(h['title'])]:
            candidates = global_title[key(h['title'])]
            entry['assessment'] = 'source_title_present_region_conflict'
        elif candidates:
            entry['assessment'] = 'nep_source_title_present'
        if candidates:
            entry['source_matches'] = [dict(source_id=c['source_id'], pdf_page=c['pdf_page'],
                                           amount_php=c['amount_php'], pap3=c['pap3'],
                                           source_region=c['region'], api_omission=c['source_id'] in missing_ids,
                                           amount_equal=c['amount_php']==h['php']) for c in candidates]
        elif key(h['title']) in headings:
            entry['assessment'] = 'possible_heading_or_allocation_row'
        else:
            entry['assessment'] = 'unresolved_no_exact_source_title_match'
        reassessed.append(entry)
    summary = {'non_fap_rows': len(local), 'non_fap_php': sum(r['amount_php'] for r in local),
               'fap_rows': len(rows)-len(local), 'fap_php': sum(r['amount_php'] for r in rows if r['zone']=='fap'),
               'operations_php': sum(r['amount_php'] for r in rows),
               'api_rows': len(api), 'api_php': sum(a['amount_php'] for a in api),
               'pap_controls_passed': len(controls), 'api_pairs': len(pairs),
               'api_pair_kinds': dict(Counter(p['kind'] for p in pairs.values())),
               'unpaired_source_rows': len(missing), 'unpaired_source_php': sum(r['amount_php'] for r in missing),
               'unpaired_api_rows': len(unmatched_api), 'unpaired_api_php': sum(a['amount_php'] for a in unmatched_api),
               'hb_only_reassessment': dict(Counter(h['assessment'] for h in reassessed))}
    present = [h for h in reassessed if h['assessment']=='nep_source_title_present']
    omitted_hb = [h for h in present if any(m['api_omission'] for m in h['source_matches'])]
    summary['hb_source_present_php'] = sum(h['php'] for h in present)
    summary['hb_api_omission_subset_n'] = len(omitted_hb)
    summary['hb_api_omission_subset_php'] = sum(h['php'] for h in omitted_hb)
    manifest = {'source_dir': str(args.source_dir), 'source_pdf': str(args.source_dir/'pdfs/NEP-2027-VOLUME-2B_OCR.pdf'),
                'scope': 'FY2027 DPWH operations only; GAS/S2O excluded', 'repairs': repairs,
                'program_totals_php': dict(source_programs), 'summary': summary}
    write('nep_2027_source_projects.json', dict(manifest, projects=rows, pap_controls=controls))
    write('nep_2027_api_reconciliation.json', dict(manifest, pap_checks=pap_checks,
          api_pairs=[dict(source_id=local[i]['source_id'], api_code=api[p['api_index']]['code'],
                          source_title=local[i]['title'], api_title=api[p['api_index']]['projectName'],
                          pap3=local[i]['pap3'], pdf_page=local[i]['pdf_page'],
                          source_region=local[i]['region'], api_region=region(api[p['api_index']]['region']),
                          source_office=local[i]['office'], api_office=api[p['api_index']]['office'],
                          amount_php=local[i]['amount_php'], **p) for i,p in pairs.items()],
          unpaired_source=missing, unpaired_api=unmatched_api))
    write('nep_2027_hb_only_reassessment.json', {'method': 'Exact normalized title within region; source presence only, not a 1:1 HB comparison.',
                                             'summary': summary['hb_only_reassessment'], 'items': reassessed})
    report = ['# FY2027 NEP–API reconciliation and House-only reassessment', '',
              'Date: October 8, 2026. Scope: DPWH FY2027 only. PDF pages are one-based file pages.', '',
              '## Result', '',
              '**The ₱9.797B non-FAP gap is fully accounted for by 23 printed NEP allocations absent from the saved API.** Their amounts reproduce every PAP gap exactly; each amount also appears in the native PDF row crop retained in the reconciliation JSON.', '',
              'The normalized source reference contains **11,395 non-FAP allocations (₱455.175063B)** and **25 FAP projects (₱117.749011B)**, totaling the printed **₱572.924074B operations budget**. All 45 non-FAP PAP controls and all six operations program totals reconcile exactly.', '',
              '**₱197.233952B total gap = ₱69.687941B GAS/S2O + ₱117.749011B FAP + ₱9.797B non-FAP allocations.**', '',
              '## PAP gaps', '', '| PAP | Missing PHP | NEP heading page |', '|---|---:|---:|']
    for c in pap_checks:
        if c['gap_php']:
            report.append(f"| {c['pap3']} | ₱{c['gap_php']:,} | {c['pdf_page']} |")
    report += ['', '## Allocation and office evidence', '',
               '**17 Nationwide allocations total ₱6.688B; six NCR/Central Office allocations total ₱3.109B.** The Nationwide rows do not identify a separate DEO. The office column preserves that limitation instead of inventing an office assignment.', '',
               '| PDF page | Printed allocation | Scope / office | PHP |', '|---:|---|---|---:|']
    for r in missing:
        office = 'Nationwide; no separate DEO specified' if r['region']=='Nationwide' else 'NCR / Central Office'
        title = PPP if r['pap3']==PPP else r['title']
        report.append(f"| {r['pdf_page']} | {title} | {office} | ₱{r['amount_php']:,} |")
    report += ['', '## Source extraction repairs and validation', '',
               '- PDF page 494: split the final two merged OCR project titles. Bentigan is ₱20M; Bertese is ₱5M. The added ₱5M makes BIP Access Roads and its Nueva Ecija 1st DEO subtotal balance. Both printed titles and amounts were checked against the PDF image and native text.',
               '- PDF page 286: restore four CDO diversion-road titles whose common first line drifted across OCR row boundaries. Amounts and row count are unchanged; repairs use the PDF text independently of API titles.',
               '- Preserve `label_raw` chainages rather than using the shortened road-name label. Normalize standalone regional/office allocations into comparable titles. Stop office inference at the nearest region to avoid assigning outer Central Office headings to every regional project.',
               f"- API comparison pairs all {len(api):,} rows by equal PAP and amount: **{summary['api_pair_kinds'].get('exact_title_amount',0):,} normalized exact titles** plus **{summary['api_pair_kinds'].get('ocr_title_candidate',0)} OCR-title candidates**. The latter remain review candidates. Aggregate and PAP arithmetic balances independently of whether every candidate identity is correct.",
               '- No API, House leaf dataset, or external OCR repository was overwritten.', '',
               '## Reassessment of previously House-only items', '',
               f"Of the previous 6,073 API-unmatched House rows, **{len(present)} rows totaling ₱{summary['hb_source_present_php']:,} have an exact normalized NEP source title in the same region**. Of these, **{len(omitted_hb)} rows totaling ₱{summary['hb_api_omission_subset_php']:,} correspond to the 23 API omissions**. These are evidence of existing NEP allocations, not proof of insertion.", '',
               '| Assessment | Rows | Parsed House PHP |', '|---|---:|---:|']
    for assessment, count in summary['hb_only_reassessment'].items():
        report.append(f"| {assessment} | {count:,} | ₱{sum(h['php'] for h in reassessed if h['assessment']==assessment):,} |")
    report += ['', '**This is a source-presence audit, not a rerun of the complete HB matcher.** Region conflicts, possible heading rows, repeated titles, and unresolved OCR titles still require review. Printed Central Office allocation regions can differ from API/House project geography, so a region conflict does not itself establish incorrect House attribution. Do not subtract every flagged amount from an insertion total or treat every unresolved title as a new project.', '',
               'Key corrected findings:', '',
               '- Disaster-Related Infrastructure: the NEP already appropriates ₱1B (page 430), matching the parsed House amount. Its omission is in the API.',
               '- Quirino K0264+968–K0281+198: NEP page 225 and the API both have ₱1.392209B. The current v4b line-item artifact already marks this as an exact, amount-equal House/API match. The earlier segment-insertion narrative was stale.',
               '- Nationwide Primary Roads and bridge allocations illustrate the opposite direction to an insertion: several parsed House amounts are ₱200M against printed NEP ₱500M. House PDF verification remains necessary before declaring final cuts.', '',
               '## Reproduce and review', '',
               'Run `python analysis/reconcile_nep_source.py` from any working directory; use `--source-dir` if the source repository moves.', '',
               '- `nep_2027_source_projects.json`: operations reference with source IDs, page references, repairs, and PAP controls.',
               '- `nep_2027_api_reconciliation.json`: PAP checks, 23 omitted allocations with native PDF row evidence, exact pairs and OCR candidate pairs.',
               '- `nep_2027_hb_only_reassessment.json`: all 6,073 previous House-only rows with assessment and source matches.', '',
               'Next: review the region conflicts and high-value possible heading rows against the House PDF, then validate the 173 OCR candidate pairs before rerunning a full source-based House comparison.']
    (ROOT/'analysis/nep_2027_api_reconciliation.md').write_text('\n'.join(report)+'\n')
    print(json.dumps(summary, indent=2))
    print('Unpaired source rows:')
    for r in missing:
        print(r['source_id'], r['pdf_page'], r['pap3'], r['region'], r['amount_php'], r['title'])
    print('Unpaired API rows:')
    for a in unmatched_api:
        print(a['code'], a['pap3'], a['region'], a['amount_php'], a['projectName'])


if __name__ == '__main__':
    main()
