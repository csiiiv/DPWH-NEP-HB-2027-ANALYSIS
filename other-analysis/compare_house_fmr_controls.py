"""Compare printed FMR controls in the supplied and named third-reading copies.

Uses the verified native table profile in memory. Does not publish a separate
third-reading project extract or authenticate the supplied copy's reading.
"""
import argparse
import json
from pathlib import Path

import pymupdf
import extract_hgab_fmr as extractor

HERE = Path(__file__).resolve().parent
COPIES = {
    'second_working_copy': ('HB_BUDGET/2 - HB 10858 VOL IB.pdf', 'HB_BUDGET/1 - HB 10858 VOL IA.pdf'),
    'third_named_copy': ('HB_BUDGET_3rd_reading/2- HB 10858 FOR 3RD READING VOL I-B.pdf', 'HB_BUDGET_3rd_reading/1- HB 10858 FOR 3RD READING VOL I-A.pdf'),
}


def build():
    sources, texts = {}, {}
    original_ib, original_ia = extractor.IB, extractor.IA
    try:
        for key, (ib, ia) in COPIES.items():
            extractor.IB, extractor.IA = extractor.ROOT / ib, extractor.ROOT / ia
            with pymupdf.open(extractor.IB) as doc:
                rows, pages = extractor.extract_rows(doc)
                texts[key] = [doc[p['pdf_page'] - 1].get_text() for p in pages]
            tree = extractor.build_tree(rows)
            checks = extractor.cross_volume_controls(tree)
            nodes = {n['id']: n for n in tree['nodes']}
            if any(not c['passed'] for c in checks):
                raise ValueError(f'{key}: independent agency controls disagree')
            controls = [n for n in tree['nodes'] if n['kind'] != 'project']
            if any(sum(nodes[c]['printed_amount_php'] for c in n['child_ids']) != n['printed_amount_php'] for n in controls):
                raise ValueError(f'{key}: printed control does not equal its children')
            sources[key] = {'annex_pdf': ib, 'annex_sha256': extractor.sha(extractor.IB),
                            'agency_pdf': ia, 'agency_sha256': extractor.sha(extractor.IA),
                            'annex_pdf_pages': [667,726], 'annex_printed_pages': [651,710],
                            'agency_pdf_pages': [137,138], 'agency_printed_pages': [127,128],
                            'project_rows_observed': sum(n['kind']=='project' for n in tree['nodes']),
                            'controls': [{k:n[k] for k in ('id','kind','label','printed_amount_php','source')} for n in controls],
                            'independent_checks': checks}
    finally:
        extractor.IB, extractor.IA = original_ib, original_ia
    left, right = (sources[k]['controls'] for k in COPIES)
    index = lambda controls: {' '.join(n['label'].upper().split()):n for n in controls}
    a,b = index(left),index(right)
    if len(a)!=len(left) or len(b)!=len(right):
        raise ValueError('Duplicate control labels')
    comparison=[]
    for label in dict.fromkeys([*a,*b]):
        x,y=a.get(label),b.get(label)
        comparison.append({'label':label, 'kind':(x or y)['kind'],
                           'second_working_php': x['printed_amount_php'] if x else None,
                           'third_named_php': y['printed_amount_php'] if y else None,
                           'difference_php': y['printed_amount_php']-x['printed_amount_php'] if x and y else None,
                           'second_source':x['source'] if x else None,'third_source':y['source'] if y else None})
    changed_pages=[667+i for i,(x,y) in enumerate(zip(*texts.values())) if x!=y]
    return {'schema_version':1, 'scope':'FMR annex printed program/regional controls and independent I-A corroboration',
            'reading_status':'HB_BUDGET is the second-reading working copy; its legislative stage remains independently unauthenticated. Third copy is explicitly named FOR 3RD READING.',
            'sources':sources,'comparison':comparison,
            'summary':{'matched_controls':sum(r['difference_php'] is not None for r in comparison),
                       'controls_with_differences':sum(r['difference_php']!=0 for r in comparison),
                       'regional_controls':sum(r['kind']=='region_control' for r in comparison),
                       'agency_checks_per_copy':{k:len(v['independent_checks']) for k,v in sources.items()},
                       'annex_pages_with_different_extracted_text':changed_pages,
                       'all_60_annex_page_texts_identical':not changed_pages and all(len(t)==60 for t in texts.values())},
            'limits':'A quick control comparison and page-text screen, not a separately retained/normalized third-reading project dataset or a certification of cross-reading identities.'}


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check',action='store_true')
    args=parser.parse_args()
    data=build()
    path=HERE/'data/hgab_fmr_printed_control_comparison.json'
    content=json.dumps(data,ensure_ascii=False,indent=2)+'\n'
    if args.check:
        if not path.exists() or path.read_text()!=content:
            raise SystemExit('Printed control comparison is missing or stale')
    else:
        path.write_text(content)
    print(json.dumps(data['summary'],indent=2))


if __name__=='__main__':
    main()
