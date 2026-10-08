#!/usr/bin/env python3
"""Build the FY2027 DPWH Transparency NEP API hierarchy from retained listings.

API amounts are thousands of PHP. Groups are derived from distinct project
records; the PDF source hierarchy remains a separate dataset. No network calls.
"""
from collections import Counter
from decimal import Decimal
import hashlib
import json
from pathlib import Path

from build_source_verification import audit_hierarchy

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'dpwh-transparency-nep-data/json/fy2027-combined.json'
DATA = ROOT / 'analysis/data'


def pesos(value):
    d = Decimal(str(value)) * 1000
    if not d.is_finite() or d != d.to_integral_value() or d < 0:
        raise ValueError(f'Invalid thousand-peso amount: {value}')
    return int(d)


def validate_records(records):
    codes, ids = set(), set()
    for r in records:
        if r.get('fiscalYear') != 2027: raise ValueError(f'Unexpected fiscal year: {r.get("code")}')
        if not r.get('code') or r['code'] in codes: raise ValueError(f'Missing/duplicate project code: {r.get("code")}')
        if r.get('id') is None or r['id'] in ids: raise ValueError(f'Missing/duplicate project ID: {r.get("id")}')
        codes.add(r['code']);ids.add(r['id']);pesos(r['amount'])
    return codes


def build():
    body = json.loads(SOURCE.read_text(), parse_float=Decimal)
    if body.get('code') != 'SUCCESS': raise ValueError('Unsuccessful combined snapshot')
    records = body['data']['data']; codes = validate_records(records)
    nodes, groups, missing = [], {}, Counter()
    root = dict(id='dpwh-nep-api:root', parent=None, kind='snapshot', label='DPWH Transparency NEP FY2027 — retained project listings',
                amount=0, printed=None, additive=True, children=[], source={'table':'dpwh_nep_api'})
    nodes.append(root)
    for index, r in enumerate(records):
        parent=root;path=()
        amount=pesos(r['amount']);root['amount']+=amount
        for field,kind in [('pap1','pap1'),('pap2','program'),('pap3','pap'),('region','region'),('office','office')]:
            label=str(r.get(field) or '').strip() or 'Unspecified'
            if label=='Unspecified':missing[field]+=1
            path+=(label,)
            if path not in groups:
                n=dict(id='api:'+hashlib.sha256(json.dumps(path).encode()).hexdigest()[:20],parent=parent['id'],
                       kind=kind,label=label,amount=0,printed=None,additive=True,children=[],source={'table':'dpwh_nep_api','group_field':field})
                groups[path]=n;nodes.append(n);parent['children'].append(n['id'])
            parent=groups[path];parent['amount']+=amount
        n=dict(id=r['code'],parent=parent['id'],kind='project',label=r['projectName'],amount=amount,
               printed=None,additive=True,children=[],source={'table':'dpwh_nep_api','source_row':index,
               'project_code':r['code'],'project_id':r['id'],'fiscal_year':r['fiscalYear'],
               'amount_thousands':str(r['amount']),'document_count':r.get('documentCount',0)})
        nodes.append(n);parent['children'].append(n['id'])
    audit=audit_hierarchy(nodes,root['id'])
    summary={'fiscal_year':2027,'projects':len(records),'group_nodes':len(groups)+1,'nodes':len(nodes),
             'rollup_checks':audit['internal_checks'],'failed_checks':len(audit['failures']),
             'total_php':root['amount'],'reported_projects':body['data']['summary']['totalProjects'],
             'reported_total_php':pesos(body['data']['summary']['totalAmount']), 'missing_metadata':dict(missing)}
    if audit['failures'] or summary['projects']!=summary['reported_projects'] or summary['total_php']!=summary['reported_total_php']:
        raise ValueError('NEP API snapshot summary does not reconcile')
    pages=[]; listing_dir=SOURCE.parent/'fy2027'
    all_rows=[]
    for f in sorted(listing_dir.glob('dump-page-*.json')):
        d=json.loads(f.read_text(),parse_float=Decimal)['data']
        pages.append({'file':f.name,'sha256':hashlib.sha256(f.read_bytes()).hexdigest(),
                      'page':d['pagination']['page'],'total_pages':d['pagination']['totalPages'],
                      'records':len(d['data']),'reported_projects':d['summary']['totalProjects'],
                      'reported_total_php':pesos(d['summary']['totalAmount'])})
        all_rows.extend(d['data'])
    if pages:
        pages.sort(key=lambda p:p['page'])
        expected=pages[0]['total_pages']
        if [p['page'] for p in pages]!=list(range(1,expected+1)):raise ValueError('Missing/duplicate listing pages')
        validate_records(all_rows)
        if {r['code']:r for r in all_rows}!={r['code']:r for r in records}:raise ValueError('Combined snapshot differs from original listing pages')
        if any(p['reported_projects']!=len(records) or p['reported_total_php']!=root['amount'] for p in pages):raise ValueError('Original API listing summaries do not reconcile')
    detail={'available':False}
    detail_dir=SOURCE.parent/'fy2027-details'
    if detail_dir.exists():
        by_code={r['code']:r for r in records};seen=set();mismatches=[];invalid=[];documents=0
        for f in sorted(detail_dir.glob('*.json')):
            d=json.loads(f.read_text(),parse_float=Decimal);r=d.get('data',{})
            if d.get('code')!='SUCCESS' or not isinstance(r,dict) or r.get('code')!=f.stem:
                invalid.append(f.name);continue
            seen.add(r['code']);documents+=len(r.get('documents',[]))
            fields=['id','code','fiscalYear','region','office','projectName','pap1','pap2','pap3','amount']
            if r['code'] not in by_code or any(r.get(k)!=by_code[r['code']].get(k) for k in fields):mismatches.append(r['code'])
        detail={'available':True,'successful_files':len(seen),'documents':documents,'missing_codes':sorted(codes-seen),
                'extra_codes':sorted(seen-codes),'invalid_files':invalid,'listing_detail_mismatches':mismatches}
    provenance={'source':str(SOURCE.relative_to(ROOT)),'source_sha256':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
                'builder_sha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
                'endpoint':'https://api.dpwh.bettergov.ph/nep/projects',
                'source_identity':'DPWH Transparency NEP project data retained through the BetterGov-hosted API endpoint',
                'hierarchy':'pap1 → pap2 → pap3 → region → office → project code',
                'source_amount_unit':'thousands of PHP','normalized_amount_unit':'integer PHP',
                'control_policy':'Group totals are derived. API listing summary is a snapshot control, not a PDF printed control. No HB/PDF-source rows fill gaps.'}
    tree={'schema_version':1,'scale':1,'root':root['id'],'nodes':nodes,'summary':summary,'provenance':provenance}
    report={'summary':summary,'provenance':provenance,'checks':audit['checks'],'original_listing_pages':pages,
            'detail_files':detail,'remaining_gaps':['Snapshot arithmetic and API listing coverage are checked. This does not certify the API as the complete printed NEP budget.',
            'Source-label/document review and amendment/release coverage require separate confirmation before comparison.']}
    for name,d in [('dpwh_transparency_nep_tree.json',tree),('dpwh_transparency_nep_tree_validation.json',report)]:
        (DATA/name).write_text(json.dumps(d,ensure_ascii=False,indent=2,default=str)+'\n')
    print(json.dumps(summary,indent=2));print(json.dumps(detail,indent=2))


if __name__=='__main__':build()
