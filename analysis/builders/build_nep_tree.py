#!/usr/bin/env python3
"""Build a source-only FY2027 DPWH NEP tree and validate every rollup.

Inputs: retained PAP/operating-unit OCR trees and their source PDF. No API
rows, API matches, or House data determine amounts, labels, or parenting.
Run from any directory; --source-dir overrides the external source location.
"""

import sys
from pathlib import Path as _Path
sys.path[:0] = [str(_Path(__file__).resolve().parents[1]), str(_Path(__file__).resolve().parents[1] / 'builders')]
from paths import ANALYSIS, REPO, DATA, VIEWERS, DOCS, ARCHIVE, EVIDENCE

import argparse
import copy
import hashlib
import json
import re
from collections import Counter, defaultdict
from pathlib import Path

import pymupdf
from nep_amount_columns import annotate_amount_columns, inside_column

ROOT = REPO
OUT = DATA
VIEWER_OUT = VIEWERS
DEFAULT_SOURCE = Path('/mnt/6E9A84429A8408B3/WORK/BetterGovPH/Budget-NEP/NEP_PDF_DATA/paddle_pdf_ocr_v2')
GRAND = 642_612_015_000
PS_TOTAL = 14_922_297_000


def read(path):
    return json.loads(path.read_text())


def digest(path):
    h = hashlib.sha256()
    with path.open('rb') as f:
        for block in iter(lambda: f.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


def native_amount(text):
    text = text.translate(str.maketrans({'S':'5','s':'5','O':'0','o':'0','I':'1','l':'1'}))
    return int(re.sub(r'[^0-9]','',text) or '0')


def native_row(pdf, page, word):
    words = pdf[page-1].get_text('words')
    anchor = next(w for w in words if word in w[4])
    y = (anchor[1]+anchor[3])/2
    line = [w for w in words if abs((w[1]+w[3])/2-y)<4]
    bbox = [0,min(w[1] for w in line)-1,720,max(w[3] for w in line)+1]
    return bbox, ' '.join(w[4] for w in line), [w[4] for w in line if (w[0]+w[2])/2>580]


def source_ref(n, table, amount_role=None):
    return {'table': table, 'source_id': n['id'], 'pdf_page': n.get('page'),
            'row': n.get('row_section_id'), 'bbox': n.get('bbox'),
            'amount_role': amount_role, 'source_flags': n.get('flags', [])}


def normalized(n, table, amount=None, amount_role=None, id_prefix=''):
    total = n.get('total') or {}
    value = total.get('value') if amount is None else amount
    if value is not None and not isinstance(value, int):
        raise ValueError(f"Non-integer peso amount: {n['id']} {value}")
    return {'id': id_prefix+n['id'], 'parent': id_prefix+n['parent'] if n.get('parent') else None,
            'kind': n['kind'], 'source_kind': n['kind'],
            'label': ' '.join((n.get('label_raw') or n['label']).split()),
            'printed_amount_php': value, 'additive': not n.get('excluded', False),
            'children': [], 'source': source_ref(n, table, amount_role),
            'original_parent': n.get('parent')}


def rebuild(nodes):
    for n in nodes.values():
        n['children'] = []
    for n in nodes.values():
        if n['parent']:
            if n['parent'] not in nodes:
                raise ValueError(f"Missing parent {n['parent']} for {n['id']}")
            nodes[n['parent']]['children'].append(n['id'])
    for n in nodes.values():
        n['children'].sort(key=lambda c: (nodes[c]['source'].get('pdf_page') or 0,
                                          nodes[c]['source'].get('row') or 0, c))


def repair_pap(raw, pdf):
    nodes = {n['id']: normalized(n, 'pap') for n in raw}
    if len(nodes) != len(raw):
        raise ValueError('Duplicate PAP source IDs')
    edits = []

    def move(id, parent, reason):
        n = nodes[id]
        old = n['parent']
        if old == parent:
            return
        n['parent'] = parent
        edits.append({'action': 'reparent', 'node': id, 'old_parent': old, 'new_parent': parent,
                      'reason': reason, 'pdf_page': n['source']['pdf_page']})

    for id in ['p115:r7', 'p143:r14', 'p143:r15']:
        move(id, 'p115:r6', 'Central Office is the container for S2O maintenance activities; do not add it beside its details.')
    move('p144:r30', 'p144:r29', 'CAR subtotal belongs to the permanent truck-weighing-machine category.')
    for id in ['p145:r0', 'p145:r1']:
        move(id, 'p144:r33', 'Both 3M portable-weighing-machine projects belong to the printed 6M NCR subtotal.')
    for n in raw:
        if n['parent']=='p144:r28' and n['kind']=='region' and (n['id'].startswith('p145:') or n['id'] in ['p146:r1','p146:r4']):
            move(n['id'], 'p144:r32', 'Continuation regions belong to the 81M portable-weighing-machine category.')
    move('p146:r7', 'p146:r6', 'Region V 600K belongs to the trailer-type ATOME category.')
    for id in ['p146:r11', 'p146:r13']:
        move(id, 'p146:r10', 'Two 7M region allocations belong to the 14M new ATOME station category.')
    move('p146:r14', 'p146:r13', 'Zaragoza project belongs to Region III, not CAR.')
    move('p146:r27', 'p146:r26', 'NCR is the detail of the pre-feasibility/engineering control, not a second additive control.')
    move('p688:r1', 'p688:r0', 'NCR/Central Office details the FAP control, preventing duplicate FAP funding at Operations.')
    families = {'p195:r3':['p195:r4','p205:r0','p217:r0'],
                'p224:r0':['p224:r1','p230:r0','p238:r0'],
                'p243:r0':['p243:r1','p245:r0','p251:r0'],
                'p255:r0':['p255:r1','p258:r0','p261:r0'],
                'p262:r1':['p262:r2','p266:r0','p275:r0'],
                'p302:r9':['p302:r10','p305:r0','p308:r0'],
                'p310:r0':['p310:r1','p310:r6','p310:r14']}
    for parent, children in families.items():
        nodes[parent]['kind'] = 'family_rollup'
        for id in children:
            move(id, parent, 'Type-split PAP controls are children of their printed family rollup, not additive siblings.')
    # Independently verified native text and source image, final two rows p494.
    n = nodes['p494:r27']
    if n['printed_amount_php'] != 20_000_000 or 'Bertese' not in n['label']:
        raise ValueError('Merged Bentigan/Bertese source row changed; re-review the source.')
    n['original_label'] = n['label']
    n['label'] = 'Construction of Road, Barangay Bentigan Cuyapo to Nampicuan Nueva Ecija'
    bentigan_bbox, bentigan_text, bentigan_money = native_row(pdf,494,'Bentigan')
    assert any(native_amount(v)==20_000_000 for v in bentigan_money)
    n['source'].update(original_bbox=n['source']['bbox'],bbox=bentigan_bbox,native_text=bentigan_text)
    extra = copy.deepcopy(n)
    extra.update(id='p494:r27:split-Bertese', label='Construction of Road, Barangay Bertese, Quezon, Nueva Ecija', printed_amount_php=5_000_000)
    bertese_bbox, bertese_text, bertese_money = native_row(pdf,494,'Bertese')
    assert any(native_amount(v)==5_000_000 for v in bertese_money)
    extra['source'].update(source_id='p494:r27:split-Bertese',row=27.5,bbox=bertese_bbox,native_text=bertese_text)
    nodes[extra['id']] = extra
    edits.append({'action':'split_merged_project_rows','node':n['id'],'added_node':extra['id'],
                  'added_php':5_000_000,'pdf_page':494,
                  'reason':'Native PDF and rendered image show Bentigan 20M and Bertese 5M on separate final rows.'})
    prefix = 'CDO-Opol-El Salvador-Alubijid-Laguindingan Airport (Pueblo de Oro/CDO Airport to Jct. BCIR Laguindingan) Mountain Diversion Road, '
    suffixes = {'p286:r0':'Brgy. Bolisong Section, Sta. 22+672 - Sta. 23+992, El Salvador City, Misamis Oriental',
                'p286:r1':'Brgy. Bolisong Section, Sta. 23+992 - Sta. 24+992, El Salvador City, Misamis Oriental',
                'p286:r2':'Brgy. Pagatpat Section, Sta. 2+680 - Sta. 3+330, Cagayan de Oro City',
                'p286:r3':'Brgy. Patag Section, Sta. 15+512 - Sta. 16+762, Opol, Misamis Oriental'}
    for id, suffix in suffixes.items():
        nodes[id]['original_label'] = nodes[id]['label']
        nodes[id]['label'] = prefix+suffix
        edits.append({'action':'restore_cross_row_title','node':id,'pdf_page':286,
                      'reason':'Restore the common first line to each project using native PDF text.'})
    # Source kind recognition does not determine amounts or hierarchy.
    for n in nodes.values():
        if n['kind'] in ['office','region'] and re.match(r'Construction|Rehabilitation|Tarlac-Pangasinan', n['label']):
            n['kind'] = 'project'
        if n['kind']=='funding' and n['id'] not in ['p688:r3','p688:r4']:
            n['additive'] = True
            if n['label']=='GOP Loan Proceeds':
                # These five source rows print the value beside GOP; Loan
                # Proceeds is a following blank row. Verify the native crop.
                original = next(x for x in raw if x['id']==n['id'])
                text = pdf[n['source']['pdf_page']-1].get_text(clip=pymupdf.Rect(original['bbox']))
                words = pdf[n['source']['pdf_page']-1].get_text('words',clip=pymupdf.Rect(original['bbox']))
                gop = next(w for w in words if w[4]=='GOP')
                y = (gop[1]+gop[3])/2
                money = [w[4] for w in words if (w[0]+w[2])/2>580 and abs((w[1]+w[3])/2-y)<4]
                assert any(native_amount(v)==n['printed_amount_php'] for v in money), (n['id'],money)
                n['label'] = 'GOP'
                n['source']['native_funding_text'] = text
                edits.append({'action':'separate_merged_funding_label','node':n['id'],
                              'pdf_page':n['source']['pdf_page'],
                              'reason':'Value is printed on the GOP line; following Loan Proceeds line has no amount.'})
    rebuild(nodes)
    return nodes, edits


def add_ps(nodes, raw):
    lookup = {n['id']:n for n in raw}
    roots = ['p13:r0','p23:r6']

    def copy_ps(id):
        n = lookup[id]
        if n['kind'] in ('subtotal','grand_total') or n.get('excluded'):
            return None
        children = [c for c in (copy_ps(i) for i in n['children']) if c]
        amounts = n.get('amounts') or {}
        role = 'PS' if 'PS' in amounts else 'Amount 1'
        amount = (amounts.get(role) or {}).get('value',0) if amounts else None
        child_sum = sum(c['amount_php'] for c in children)
        if amount is not None and children and amount != child_sum:
            raise ValueError(f'Personnel Services child mismatch {id}: {amount} != {child_sum}')
        value = child_sum if amount is None else amount
        if not value:
            return None
        result = normalized(n, 'by_ou', amount=value, amount_role=role, id_prefix='ps:')
        if not amounts:
            result['printed_amount_php'] = None
            result['derived_reason'] = 'Source PREXC grouping has no printed PS control; sum of child PS controls.'
        result['amount_php'] = value
        result['children'] = [c['id'] for c in children]
        nodes[result['id']] = result
        return result

    root = {'id':'ps','parent':'root','kind':'expense_class','label':'Personnel Services',
            'printed_amount_php':PS_TOTAL,'additive':True,'children':[],
            'source':{'table':'summary','pdf_page':8,'amount_role':'PS'}}
    nodes['ps'] = root
    for id in roots:
        n = copy_ps(id)
        n['parent'] = 'ps'
        n['source']['printed_section_total_php'] = lookup[id]['total']['value']
        root['children'].append(n['id'])


def validate(nodes, strict=True):
    checks, order, active, seen = [], [], set(), set()

    def visit(id):
        if id in active:
            raise ValueError(f'Cycle at {id}')
        if id in seen:
            raise ValueError(f'Multiple traversal paths to {id}')
        active.add(id)
        n = nodes[id]
        for child in n['children']:
            if nodes[child]['parent']!=id:
                raise ValueError(f'Inconsistent parent/child link {id} {child}')
            visit(child)
        additive = [nodes[c] for c in n['children'] if nodes[c]['additive']]
        child_sum = sum(c['amount_php'] for c in additive)
        printed = n['printed_amount_php']
        n['amount_php'] = printed if printed is not None else child_sum
        n['children_sum_php'] = child_sum if additive else None
        difference = printed-child_sum if printed is not None and additive else None
        if not n['additive']:
            status = 'non_additive_reference'
        elif printed is None:
            status = 'derived'
        elif not additive:
            status = 'leaf'
        elif difference == 0:
            status = 'pass'
        else:
            status = 'mismatch'
        n['validation'] = status
        n['difference_php'] = difference
        if additive:
            checks.append({'id':id,'label':n['label'],'pdf_page':n['source'].get('pdf_page'),
                           'printed_amount_php':printed,'children_sum_php':child_sum,
                           'difference_php':difference,'status':status,'children':len(additive)})
        active.remove(id)
        seen.add(id)
        order.append(id)
    visit('root')
    if set(nodes)!=seen:
        raise ValueError(f'Unreachable nodes: {sorted(set(nodes)-seen)[:10]}')
    mismatches = [c for c in checks if c['status']=='mismatch']
    if mismatches and strict:
        raise ValueError(json.dumps(mismatches[:10],indent=2))
    return checks


def audit_native_amounts(nodes, pdf):
    """Independent text-layer evidence; nearby agreements are alignment hints only.

    Never replace an OCR amount from this audit. The native layer is itself OCR
    and some bounding boxes cover the wrong row or multiple rows.
    """
    cache, records = {}, []
    for n in nodes.values():
        s = n['source']
        page, bbox, expected = s.get('pdf_page'), s.get('bbox'), n['printed_amount_php']
        if bbox is None or page is None or expected is None:
            continue
        polygon = s.get('amount_column_polygon')
        if not polygon:
            raise ValueError(f'Missing page-specific amount column: {n["id"]}')
        key = (page, tuple(tuple(p) for p in polygon))
        if key not in cache:
            money_words = []
            for w in pdf[page-1].get_text('words'):
                x = (w[0]+w[2])/2
                y = (w[1]+w[3])/2
                if (inside_column(polygon, x, y)
                        and re.fullmatch(r'[0-9SOIlso,.;]+',w[4])):
                    money_words.append(w)
            rows = []
            for w in sorted(money_words,key=lambda w:((w[1]+w[3])/2,w[0])):
                y = (w[1]+w[3])/2
                if rows and abs(rows[-1][0]-y)<3:
                    rows[-1][1].append(w)
                else:
                    rows.append([y,[w]])
            cache[key] = [{'y':y,'amount_php':native_amount(''.join(w[4] for w in sorted(ws,key=lambda w:w[0]))),
                           'text':' '.join(w[4] for w in sorted(ws,key=lambda w:w[0]))} for y,ws in rows]
        direct = [r for r in cache[key] if bbox[1]-3<=r['y']<=bbox[3]+3]
        nearby = [r for r in cache[key] if bbox[1]-30<=r['y']<=bbox[3]+30]
        matches = any(r['amount_php']==expected for r in direct)
        status = ('native_row_ambiguity' if matches and len(direct)>1
                  else 'within_bbox_agreement' if matches
                  else 'nearby_alignment_candidate' if any(r['amount_php']==expected for r in nearby)
                  else 'native_text_review')
        n['native_amount_status'] = status
        records.append({'id':n['id'],'label':n['label'],'pdf_page':page,'source_bbox':bbox,
                        'printed_amount_php':expected,'status':status,
                        'amount_basis':n.get('amount_basis'), 'amount_role':s.get('amount_role'),
                        'amount_column_polygon':polygon,
                        'within_bbox_candidates':direct,
                        'nearby_candidates':nearby if status!='within_bbox_agreement' else []})
    counts = dict(Counter(r['status'] for r in records))
    return {'policy':'Each printed row is checked in its page-specific amount column. Multiple amount lines in one extraction area require row-identity review. Text-layer comparison is evidence, not image verification. Common S/O/I/l substitutions are normalized. Nearby matching amounts only suggest coordinate drift; all other discrepancies require source-image review. No amount is changed by this audit.',
            'summary':{'checked':len(records),'not_checked':len(nodes)-len(records),'status_counts':counts,
                       'review_candidates':sum(r['status']!='within_bbox_agreement' for r in records)},
            'records':records}


def report(summary, audit):
    counts = audit['summary']['status_counts']
    rows = '\n'.join(f"| {p} | ₱{a:,} |" for p,a in summary['program_totals_php'].items())
    return f"""# FY2027 DPWH NEP source tree

The complete **new-appropriations** tree totals **₱{GRAND:,}**. All {summary['rollup_checks']:,} additive rollups balance exactly; {summary['atomic_budget_units']:,} atomic budget units reproduce the root without double counting. Automatic appropriations are outside this scope.

| Program | Allocation |
|---|---:|
{rows}

## Source and construction

Run `python analysis/builders/build_nep_tree.py` to rebuild. Inputs are the retained PAP tree, operating-unit tree (Personnel Services), and `NEP-2027-VOLUME-2B_OCR.pdf`. The tree records input SHA-256 hashes, page references, full OCR titles, original parents, and a repair ledger. No API or House rows determine this tree.

The expense-class root is PS ₱14,922,297,000 + MOOE ₱24,685,746,000 + CO ₱603,003,972,000. The program view links disjoint branches across expense classes and is independently checked against printed section/program controls. Two PREXC groupings have no printed PS total and are explicitly derived. Project GOP/loan details partition project totals; the two overall financing reference rows are non-additive.

There are {summary['repairs']} documented repairs, primarily hierarchy corrections. One merged Bentigan/Bertese row omitted a separately printed ₱5,000,000 Bertese project on PDF page 494; native text and the rendered page confirm the split. Four titles on page 286 and five merged funding labels were also restored. No balancing amount was invented.

## Recursive validation and OCR limits

Each printed control is compared with its immediate additive children, bottom-up, at zero-peso tolerance. A mismatching branch is localized below that control; an ancestor can balance even when two lower errors offset. `validate(nodes, strict=False)` returns every branch check for diagnosis; the production build refuses any mismatch. Structural checks reject cycles, orphan nodes, repeated paths, and inconsistent parent links. The atomic-unit ledger provides an independent counting check.

Arithmetic balance does **not** prove every OCR amount is correct: equal and opposite errors among siblings can cancel. The reassessed native-text audit uses each page's column polygon and rejects ambiguous multi-line row areas. It checked {audit['summary']['checked']:,} source rows: {counts.get('within_bbox_agreement',0):,} have the expected amount within their recorded bounding box, {counts.get('nearby_alignment_candidate',0):,} have a nearby match suggesting coordinate drift, {counts.get('native_row_ambiguity',0):,} contain multiple amount lines and need row-identity review, and {counts.get('native_text_review',0):,} need further text/image review. The remaining {audit['summary']['not_checked']} nodes lack a comparable printed row/bounding box. Native text is another OCR layer; agreement is supporting evidence, not definitive image verification. Bounding boxes can span multiple amounts, so even within-box agreements are not a guarantee of row identity.

All {audit['summary']['review_candidates']} non-direct agreements remain in `nep_2027_native_amount_review.json`. They are review candidates, **not confirmed amount errors**. Sample image checks on pages 205, 228, and 347 show correct amounts on adjacent rows despite shifted native coordinates. No native-audit discrepancy silently changes a budget amount.

This is an arithmetically validated comparison baseline with explicit source-review limits. Complete the image review queue before claiming every amount is independently verified.

## Artifacts

- [Interactive drilldown](nep_2027_tree.html): expense or program view, search, page references, printed/child totals.
- [Canonical tree](../data/nep_2027_tree.json): hierarchy, validation status, provenance, native-audit status.
- [Rollup checks and repairs](../data/nep_2027_tree_validation.json).
- [Atomic budget units](../data/nep_2027_budget_units.json): paths and funding partitions.
- [Native amount audit](../data/nep_2027_native_amount_audit.json): all checked rows and candidate amounts.
- [Source-image review queue](../data/nep_2027_native_amount_review.json).

Next, inspect the review queue against rendered PDF pages, then compare API and House rows against these source branches. Preserve unverified labels and ambiguous row matches as explicit uncertainties.
"""


def indices(nodes):
    """Index actual budget units; funding details partition their project."""
    units = []

    def visit(id, path, expense):
        n = nodes[id]
        if not n['additive']:
            return
        path = path+[id]
        expense = n['label'] if n['kind']=='expense_class' else expense
        children = [nodes[c] for c in n['children'] if nodes[c]['additive']]
        if not children or all(c['kind']=='funding' for c in children):
            units.append({'id':id,'label':n['label'],'amount_php':n['amount_php'],
                          'expense_class':expense,'path':path,'source':n['source'],
                          'funding':{c['label']:c['amount_php'] for c in children}})
        else:
            for c in children:
                visit(c['id'],path,expense)
    visit('root',[],None)
    if sum(n['amount_php'] for n in units)!=GRAND:
        raise ValueError('Atomic budget unit ledger does not reproduce the grand total')
    return units


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-dir',type=Path,default=DEFAULT_SOURCE)
    args = parser.parse_args()
    run = args.source_dir/'output/NEP-2027-VOLUME-2B_OCR'
    pdf_path = args.source_dir/'pdfs/NEP-2027-VOLUME-2B_OCR.pdf'
    pap_path = run/'002.40-pap-tree/tree.json'
    ou_path = run/'002.30-by-ou-tree/tree.json'
    pdf = pymupdf.open(pdf_path)
    nodes, repairs = repair_pap(read(pap_path)['nodes'],pdf)
    nodes['root'].update(label='DPWH FY2027 NEP — New Appropriations',kind='agency',
                         printed_amount_php=GRAND,source={'table':'summary','pdf_page':8,'amount_role':'Total'})
    ou_raw = read(ou_path)['nodes']
    add_ps(nodes,ou_raw)
    rebuild(nodes)
    nodes['root']['children'] = ['ps','p115:r0','p144:r0']
    columns_audit = annotate_amount_columns(nodes, ou_raw, run/'002.20-table-structure/pages')
    checks = validate(nodes)
    units = indices(nodes)
    funding = defaultdict(int)
    for unit in units:
        for label, amount in unit['funding'].items():
            funding[label] += amount
    if dict(funding) != {'GOP':44_690_650_000,'Loan Proceeds':73_058_361_000}:
        raise ValueError(f'Funding totals mismatch: {dict(funding)}')
    program_sources = {
        'General Administration and Support':['ps:p13:r0','p115:r1','p144:r1'],
        'Support to Operations':['ps:p23:r6','p115:r4','p146:r25'],
        'Asset Preservation Program':['p195:r2','p688:r6'],
        'Network Development Program':['p262:r0','p688:r15'],
        'Bridge Program':['p312:r0','p689:r14'],
        'Flood Management Program':['p347:r1','p689:r26'],
        'Convergence and Special Support Program':['p404:r0'],
        'Local Program':['p678:r0','p690:r5'],
    }
    programs = [{'label':p,'amount_php':sum(nodes[c]['amount_php'] for c in cs),'source_nodes':cs}
                for p,cs in program_sources.items()]
    assert sum(p['amount_php'] for p in programs)==GRAND
    summary_text = re.sub(r'\s+','',pdf[7].get_text())
    for p in programs[2:]:
        assert f"{p['amount_php']:,}" in summary_text, p
    for p in programs[:2]:
        assert p['amount_php']==nodes[p['source_nodes'][0]]['source']['printed_section_total_php']
    summary = {'nodes':len(nodes),'atomic_budget_units':len(units),'total_php':GRAND,
               'validation_counts':dict(Counter(n['validation'] for n in nodes.values())),
               'rollup_checks':len(checks),'repairs':len(repairs),
               'expense_classes':{nodes[c]['label']:nodes[c]['amount_php'] for c in nodes['root']['children']},
               'fap_funding_php':dict(funding),'program_totals_php':{p['label']:p['amount_php'] for p in programs}}
    audit = audit_native_amounts(nodes,pdf)
    summary['native_amount_audit'] = audit['summary']
    columns_audit['native_amount_audit'] = audit['summary']
    columns_audit['records'] = [{k:r[k] for k in ('id','label','pdf_page','printed_amount_php','status','amount_basis','amount_role')} for r in audit['records']]
    provenance = {'fiscal_year':2027,'scope':'DPWH new appropriations; automatic appropriations excluded',
                  'unit':'PHP pesos, integers','inputs':{'pdf':str(pdf_path),'pap_tree':str(pap_path),'by_ou_tree':str(ou_path)},
                  'sha256':{'pdf':digest(pdf_path),'pap_tree':digest(pap_path),'by_ou_tree':digest(ou_path)},
                  'api_dependency':False,'house_dependency':False,
                  'validation_policy':'Zero tolerance. Printed amounts stay distinct from derived grouping totals. Each additive branch and the atomic ledger must balance; no balancing plugs.',
                  'source_pdf_pages':{'summary':8,'personnel_services':[13,28],'pap':[115,690]}}
    tree = {'schema_version':1,'provenance':provenance,'summary':summary,'root':'root','program_index':programs,'nodes':list(nodes.values())}
    columns_audit['tree_sha256'] = hashlib.sha256((json.dumps(tree,ensure_ascii=False,indent=2)+'\n').encode()).hexdigest()
    columns_audit['provenance'] = provenance
    for name,data in [('nep_2027_amount_column_reassessment.json',columns_audit), ('nep_2027_tree.json',tree),
                      ('nep_2027_tree_validation.json',{'summary':summary,'checks':checks,'repairs':repairs,'summary_page_text':pdf[7].get_text()}),
                      ('nep_2027_budget_units.json',{'provenance':provenance,'summary':summary,'units':units}),
                      ('nep_2027_native_amount_audit.json',audit),
                      ('nep_2027_native_amount_review.json',{'policy':audit['policy'],'summary':audit['summary'],
                          'records':[r for r in audit['records'] if r['status']!='within_bbox_agreement']})]:
        (OUT/name).write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
    template = (VIEWER_OUT/'nep_tree_viewer.template.html').read_text()
    embedded = json.dumps(tree,ensure_ascii=False,separators=(',',':')).replace('<','\\u003c')
    evidence = json.dumps({'review':[r for r in audit['records'] if r['status']!='within_bbox_agreement'], 'repairs':repairs},ensure_ascii=False,separators=(',',':')).replace('<','\\u003c')
    (VIEWER_OUT/'nep_2027_tree.html').write_text(template.replace('__TREE_DATA__',embedded).replace('__EVIDENCE_DATA__',evidence))
    (VIEWER_OUT/'nep_2027_tree.md').write_text(report(summary,audit))
    print(json.dumps(summary,indent=2))


if __name__=='__main__':
    main()
