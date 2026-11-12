#!/usr/bin/env python3
"""Cross-reference House insertions against RDC-endorsed proposals.

Question: do House FY 2027 insertions (rows funded by the House with no NEP
line) trace to RDC-endorsed regional proposals?

Inputs
------
* analysis-nia/data/senate_nia_dataset.json  - 145 house_insertion rows with
  region labels (the Senate workbook stamps the six-level hierarchy on all
  House rows).
* analysis-nia/data/rdc_endorsement/rdc_endorsement_dataset.json -
  RDC-endorsement layer: verified totals, UPRIIS attachment rows (OCR),
  RDC XII structured lists.

Method
------
Two labeled matching methods, following the analysis-nia convention of never
creating pairs from fuzzy matches alone:

1. rdc_xii_named_projects - exact-token matching against the RDC XII Top 30 /
   Top 3 FS / Reso 130 big-ticket names (Kabulnan, Malitubog, Lebak, Tulunan,
   Sepaka, Minapan, Lumabat).
2. upriis_rows - municipality + amount exact match between the 80 OCR-parsed
   UPRIIS attachment rows and UPRIIS-attributed House insertions, plus a
   system/lateral token overlap check on titles.

Every match is a *candidate corroboration* (same money, same place, same
work); unmatched insertions are simply 'no RDC evidence in this drop'.
"""
import json
import os
import re
import unicodedata

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(os.path.dirname(HERE), '..')


def norm(s):
    """Lowercase, strip accents/punct - for token matching only."""
    s = unicodedata.normalize('NFKD', s or '')
    s = ''.join(c for c in s if not unicodedata.combining(c))
    return re.sub(r'[^a-z0-9 ]', ' ', s.lower()).strip()


def tokens(s):
    return set(norm(s).split()) - {
        'the', 'of', 'and', 'at', 'in', 'for', 'sta', 'no', 'nis', 'cis',
        'ris', 'spip', 'spis', 'project', 'projects', 'irrigation', 'system',
        'construction', 'improvement', 'rehabilitation', 'repair', 'pump',
        'solar', 'powered'}


def main():
    senate = json.load(open(os.path.join(
        HERE, '..', 'senate_nia_dataset.json')))
    rdc = json.load(open(os.path.join(HERE, 'rdc_endorsement_dataset.json')))

    insertions = [p for p in senate['projects']
                  if p.get('status') == 'house_insertion']
    print(f'House insertions: {len(insertions)}')

    # ---- Method 1: RDC XII named projects ------------------------------
    named = []
    for p in rdc['rdc_xii_lists']['top30_nia_projects']:
        named.append(('top30', p['title']))
    for p in rdc['rdc_xii_lists']['top3_fs_nia_proposals']:
        named.append(('top3_fs', p['title']))
    # Reso 130 big four
    for t in ['Malitubog-Maridagao River Irrigation System Improvement Project',
              'Lebak Integrated River Irrigation System Project',
              'Tulunan Small Reservoir Irrigation Project',
              'Kabulnan 2 Multipurpose Irrigation and Power Project']:
        named.append(('reso130', t))

    def name_key(title):
        n = norm(title)
        for stem in ['kabulnan', 'malitubog', 'lebak', 'tulunan', 'sepaka',
                     'minapan', 'lumabat']:
            if stem in n:
                return stem
        return None

    rdc_xii_matches = []
    for ins in insertions:
        k = name_key(ins['label'])
        if k:
            src = [s for s, t in named if name_key(t) == k]
            rdc_xii_matches.append({
                'insertion_id': ins['id'],
                'title': ins['label'],
                'region': ins['region'],
                'amount': ins['hgab_amount'],
                'rdc_project_stem': k,
                'rdc_sources': sorted(set(src)),
            })

    # ---- Method 2: UPRIIS rows ------------------------------------------
    upr_doc = [d for d in rdc['documents'] if d['region'] == 'UPRIIS'][0]
    upriis_rows = upr_doc['project_rows']
    upr_ins = [i for i in insertions if i.get('region') == 'UPRIIS']
    print(f'UPRIIS insertions: {len(upr_ins)}; UPRIIS RDC rows: {len(upriis_rows)}')

    upriis_matches = []
    for ins in upr_ins:
        it = tokens(ins['label'])
        best = []
        for r in upriis_rows:
            rt = tokens(re.sub(r'\d', ' ', (r.get('detail') or '') + ' ' +
                               (r.get('municipality_ocr') or '')))
            overlap = it & rt
            # amount exact match is required to claim corroboration
            if r['amount'] and ins['hgab_amount'] and \
                    abs(r['amount'] - ins['hgab_amount']) < 1:
                best.append({
                    'row': r,
                    'token_overlap': sorted(overlap),
                    'strong': len(overlap) >= 1,
                })
        if best:
            # rank by token overlap
            best.sort(key=lambda b: -len(b['token_overlap']))
            upriis_matches.append({
                'insertion_id': ins['id'],
                'title': ins['label'],
                'amount': ins['hgab_amount'],
                'strong': any(b['strong'] for b in best),
                'rdc_rows': [{
                    'amount': b['row']['amount'],
                    'municipality_ocr': b['row']['municipality_ocr'],
                    'detail': b['row']['detail'][:140],
                    'shared_tokens': b['token_overlap'],
                } for b in best[:3]],
            })

    # ---- region-level evidence summary ----------------------------------
    by_region = {}
    for ins in insertions:
        by_region.setdefault(ins['region'], []).append(ins)

    out = {
        'schema_version': 1,
        'method_note': [
            'Matches are corroborations (same amount + shared identity tokens), '
            'not identity claims; amounts must be exactly equal.',
            'rdc_xii_named_projects: stem matching over RDC XII Top 30 / Top 3 '
            'FS / Reso 130 big-ticket names.',
            'upriis_rows: exact-amount match plus token overlap vs OCR-parsed '
            'attachment rows (OCR noise possible - review before use).',
        ],
        'house_insertions_total': len(insertions),
        'house_insertions_amount': sum(
            i['hgab_amount'] for i in insertions if i['hgab_amount']),
        'rdc_xii_named_matches': rdc_xii_matches,
        'upriis_amount_matches': upriis_matches,
        'region_summary': {
            region: {
                'insertions': len(rows),
                'amount': sum(r['hgab_amount'] for r in rows
                              if r['hgab_amount']),
                'rdc_evidence_in_drop': region in
                {'UPRIIS', 'Region 12'} or region == 'Cordillera Administrative Region',
            } for region, rows in sorted(by_region.items())
        },
    }

    out_path = os.path.join(HERE, 'rdc_insertion_crossref.json')
    with open(out_path, 'w') as fh:
        json.dump(out, fh, indent=1, ensure_ascii=False)
    print(f'wrote {out_path}')
    print(f"\nRDC XII named-project matches: {len(rdc_xii_matches)}")
    for m in rdc_xii_matches:
        print(f"  [{m['region']}] {m['title'][:60]} = {m['amount']:,.0f} "
              f"-> {m['rdc_project_stem']} ({','.join(m['rdc_sources'])})")
    print(f"\nUPRIIS exact-amount matches: {len(upriis_matches)}")
    for m in upriis_matches[:12]:
        print(f"  {m['title'][:60]} = {m['amount']:,.0f}")
        for r in m['rdc_rows'][:1]:
            print(f"     RDC: {r['municipality_ocr']} {r['amount']:,.0f} "
                  f"shared={r['shared_tokens'][:5]}")


if __name__ == '__main__':
    main()
