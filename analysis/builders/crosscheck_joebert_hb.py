#!/usr/bin/env python3
"""Crosscheck latest House DPWH baselines against joebert_data dumps.

Compares:
  - native I-B control tree (office grain) × Joebert DPWH candidates
  - v5 project-title leaves (I-C grain) × Joebert DPWH candidates
  - DA / HFEP / NIA Joebert dumps × native DPWH names (expect zero)

Writes analysis/data/joebert_hb_crosscheck.json
"""
from __future__ import annotations

import json
import re
import unicodedata
from collections import defaultdict
from pathlib import Path

import sys
from pathlib import Path as _Path

sys.path[:0] = [
    str(_Path(__file__).resolve().parents[1]),
    str(_Path(__file__).resolve().parents[1] / 'builders'),
]
from paths import DATA, JOEBERT, REPO  # noqa: E402

NATIVE_PATH = DATA / 'hb_dpwh_native_tree.json'
V5_PATH = DATA / 'hb_dpwh_leaves_corrected_v5.json'
REPAIRS_PATH = DATA / 'hb_known_defect_repairs.json'
JOEBERT_DPWH = JOEBERT / 'hb10858_projects.json'
OUT = DATA / 'joebert_hb_crosscheck.json'

OPS_PRINTED = 586_941_661_000
FAP_PRINTED = 44_749_011_000
BIG = 1_000_000_000


def norm(s: str) -> str:
    s = unicodedata.normalize('NFKC', s or '')
    s = s.lower()
    s = re.sub(r'[^a-z0-9]+', ' ', s)
    return re.sub(r'\s+', ' ', s).strip()


def walk(nodes):
    for n in nodes:
        yield n
        kids = n.get('children') or []
        if kids:
            yield from walk(kids)


def soft_office_hit(nname: str, j_offices: set[str]) -> bool:
    if nname in j_offices:
        return True
    for jo in j_offices:
        if nname and jo and (nname in jo or jo in nname):
            return True
    return False


def build() -> dict:
    native = json.loads(NATIVE_PATH.read_text())
    v5 = json.loads(V5_PATH.read_text())
    jmeta = json.loads(JOEBERT_DPWH.read_text())
    jrows = jmeta['data']['data']
    repairs = json.loads(REPAIRS_PATH.read_text())

    other = {}
    for name in (
        'hb10858_agency_projects',
        'hb10858_hfep_projects',
        'hb10858_nia_projects',
    ):
        other[name] = json.loads((JOEBERT / f'{name}.json').read_text())['data']['data']

    tops = native['tree']
    fap_root = next(
        (
            n
            for n in tops
            if 'foreign-assisted' in n['text'].lower()
            or 'foreign assisted' in n['text'].lower()
        ),
        None,
    )
    if fap_root is None:
        fap_root = next(
            (n for n in tops if n.get('page', 0) >= 105 and n.get('children')),
            None,
        )

    local_paps = []
    for n in tops:
        if n is fap_root:
            continue
        pg = n.get('page', 0)
        if pg < 26:
            continue
        if fap_root and pg >= fap_root.get('page', 105):
            continue
        if n.get('children'):
            local_paps.append(n)

    fap_projects = list(fap_root.get('children') or []) if fap_root else []

    office_amounts: dict[str, int] = defaultdict(int)
    office_pap_cells = []
    for pap in local_paps:
        for n in walk([pap]):
            if n is pap or n.get('children'):
                continue
            on = norm(n['text'])
            office_amounts[on] += n['amount']
            office_pap_cells.append((norm(pap['text']), on, n['amount']))

    j_sum = sum(r['amountPesos'] for r in jrows)
    j_offices = {norm(r['office']) for r in jrows if r.get('office')}
    native_office_names = set(office_amounts)
    covered_offices = native_office_names & j_offices
    soft_covered = {o for o in native_office_names if soft_office_hit(o, j_offices)}
    cells_covered = [c for c in office_pap_cells if soft_office_hit(c[1], j_offices)]
    cells_peso = sum(c[2] for c in cells_covered)
    cells_total = sum(c[2] for c in office_pap_cells)

    control_amounts: dict[int, list] = {}
    for p in local_paps:
        control_amounts.setdefault(p['amount'], []).append(('pap', p['text'], p['page']))
    if fap_root:
        control_amounts.setdefault(fap_root['amount'], []).append(
            ('fap_grand', fap_root['text'], fap_root['page'])
        )
    for p in fap_projects:
        control_amounts.setdefault(p['amount'], []).append(('fap_proj', p['text'], p['page']))
    for pc in repairs.get('pap_controls', []):
        a = pc.get('printed_php') or pc.get('printed_amount_php') or pc.get('control_php')
        if a:
            control_amounts.setdefault(int(a), []).append(
                ('repair_pap', pc.get('pap') or pc.get('label'), None)
            )

    control_hits = []
    for r in jrows:
        a = r['amountPesos']
        if a >= BIG and a in control_amounts:
            control_hits.append(
                {
                    'joebert_id': r['id'],
                    'amount_php': a,
                    'page': r['sourcePage'],
                    'projectName': r['projectName'],
                    'office': r['office'],
                    'region': r['region'],
                    'matched_controls': control_amounts[a][:3],
                }
            )

    fap_name_matched = 0
    for p in fap_projects:
        pn = norm(p['text'])
        if any(
            norm(r['projectName']) == pn
            or (pn and norm(r['projectName']).startswith(pn[:40]))
            or (pn and pn[:50] in norm(r['projectName']))
            for r in jrows
        ):
            fap_name_matched += 1

    key_pages: dict[tuple, list] = defaultdict(list)
    for r in jrows:
        key_pages[(norm(r['projectName']), r['amountPesos'])].append(r['sourcePage'])
    dup_keys = {k: v for k, v in key_pages.items() if len(v) > 1}
    extra_rows = sum(len(v) - 1 for v in dup_keys.values())
    extra_php = sum(k[1] * (len(v) - 1) for k, v in dup_keys.items())
    consec = consec_php = 0
    for (_name, amt), pages in dup_keys.items():
        sp = sorted(set(pages))
        for i in range(len(sp) - 1):
            if sp[i + 1] - sp[i] == 1:
                consec += 1
                consec_php += amt

    known_big = {FAP_PRINTED}
    for pc in repairs.get('pap_controls', []):
        for key in ('printed_php', 'printed_amount_php', 'control_php', 'amount_php'):
            if key in pc and pc[key]:
                known_big.add(int(pc[key]))
    leak2 = [r for r in jrows if r['amountPesos'] in known_big and r['amountPesos'] >= BIG]
    leak2_ids = {r['id'] for r in leak2}

    seen: set[tuple] = set()
    cleaned = []
    for r in sorted(jrows, key=lambda x: (x['sourcePage'], x['id'])):
        if r['id'] in leak2_ids:
            continue
        k = (norm(r['projectName']), r['amountPesos'])
        if k in seen:
            continue
        seen.add(k)
        cleaned.append(r)

    v5_leaves = [l for l in v5['leaves'] if (l.get('amount_php') or 0) > 0]
    v5_sum = sum(l['amount_php'] for l in v5_leaves)
    v5_by_ta: dict[tuple, list] = defaultdict(list)
    for l in v5_leaves:
        v5_by_ta[(norm(l['project']), l['amount_php'])].append(l)
    j_by_ta: dict[tuple, list] = defaultdict(list)
    for r in jrows:
        j_by_ta[(norm(r['projectName']), r['amountPesos'])].append(r)
    exact_ta_keys = set(v5_by_ta) & set(j_by_ta)
    unique_exact = [
        k for k in exact_ta_keys if len(v5_by_ta[k]) == 1 and len(j_by_ta[k]) == 1
    ]

    v5_by_t: dict[str, list] = defaultdict(list)
    for l in v5_leaves:
        v5_by_t[norm(l['project'])].append(l)
    j_by_t: dict[str, list] = defaultdict(list)
    for r in jrows:
        j_by_t[norm(r['projectName'])].append(r)
    title_keys = set(v5_by_t) & set(j_by_t)
    title_shared_any_amt = sum(
        1
        for t in title_keys
        if set(x['amount_php'] for x in v5_by_t[t])
        & set(x['amountPesos'] for x in j_by_t[t])
    )

    v5_by_rta = {
        (norm(l.get('region')), norm(l['project']), l['amount_php']) for l in v5_leaves
    }
    j_by_rta = {
        (norm(r.get('region')), norm(r['projectName']), r['amountPesos']) for r in jrows
    }
    v5_by_ota = {
        (norm(l.get('office')), norm(l['project']), l['amount_php']) for l in v5_leaves
    }
    j_by_ota = {
        (norm(r.get('office')), norm(r['projectName']), r['amountPesos']) for r in jrows
    }

    v5_matched_ta = sum(
        1 for l in v5_leaves if (norm(l['project']), l['amount_php']) in j_by_ta
    )
    v5_matched_php = sum(
        l['amount_php']
        for l in v5_leaves
        if (norm(l['project']), l['amount_php']) in j_by_ta
    )
    j_matched_ta = sum(
        1 for r in jrows if (norm(r['projectName']), r['amountPesos']) in v5_by_ta
    )
    j_matched_php = sum(
        r['amountPesos']
        for r in jrows
        if (norm(r['projectName']), r['amountPesos']) in v5_by_ta
    )

    c_by_ta = {(norm(r['projectName']), r['amountPesos']) for r in cleaned}
    v5_in_cleaned = sum(
        1 for l in v5_leaves if (norm(l['project']), l['amount_php']) in c_by_ta
    )
    v5_in_cleaned_php = sum(
        l['amount_php']
        for l in v5_leaves
        if (norm(l['project']), l['amount_php']) in c_by_ta
    )
    j_in_v5_cleaned = sum(
        1 for r in cleaned if (norm(r['projectName']), r['amountPesos']) in v5_by_ta
    )
    j_in_v5_cleaned_php = sum(
        r['amountPesos']
        for r in cleaned
        if (norm(r['projectName']), r['amountPesos']) in v5_by_ta
    )

    native_texts = {norm(n['text']) for n in walk(native['tree'])}
    other_hits = {}
    for name, rows in other.items():
        hits = sum(
            1
            for r in rows
            if (pn := norm(r.get('projectName') or r.get('name') or ''))
            and pn in native_texts
        )
        other_hits[name] = {'rows': len(rows), 'exact_name_hits_vs_native': hits}

    j_region: dict[str, int] = defaultdict(int)
    for r in jrows:
        j_region[r.get('region') or '(blank)'] += r['amountPesos']

    peso_agree = sum(
        1
        for o in covered_offices
        if sum(r['amountPesos'] for r in jrows if norm(r['office']) == o)
        == office_amounts[o]
    )

    return {
        'schema_version': 1,
        'fiscal_year': 2027,
        'built_for': 'House DPWH latest baselines × joebert_data',
        'inputs': {
            'native': str(NATIVE_PATH.relative_to(REPO)),
            'v5': str(V5_PATH.relative_to(REPO)),
            'joebert_dpwh': str(JOEBERT_DPWH.relative_to(REPO)),
            'repairs': str(REPAIRS_PATH.relative_to(REPO)),
        },
        'headline': {
            'native_ops_printed_php': OPS_PRINTED,
            'native_local_office_leaves_n': len(office_pap_cells),
            'native_local_office_leaves_php': cells_total,
            'native_local_pap_parents_n': len(local_paps),
            'native_fap_projects_n': len(fap_projects),
            'native_fap_php': sum(p['amount'] for p in fap_projects) or FAP_PRINTED,
            'v5_positive_leaves_n': len(v5_leaves),
            'v5_php': v5_sum,
            'joebert_rows_n': len(jrows),
            'joebert_gross_php': j_sum,
            'joebert_cleaned_rows_n': len(cleaned),
            'joebert_cleaned_php': sum(r['amountPesos'] for r in cleaned),
        },
        'native_office_coverage': {
            'native_distinct_offices': len(native_office_names),
            'exact_office_name_in_joebert': len(covered_offices),
            'soft_office_name_in_joebert': len(soft_covered),
            'office_pap_cells': len(office_pap_cells),
            'cells_with_soft_office_in_joebert': len(cells_covered),
            'cells_coverage_pct': round(100 * len(cells_covered) / len(office_pap_cells), 2),
            'cells_php_covered': cells_peso,
            'cells_php_total': cells_total,
            'common_offices_peso_exact_agree': peso_agree,
        },
        'joebert_defects': {
            'control_amount_hits_ge_1b': control_hits,
            'known_big_control_rows_n': len(leak2),
            'known_big_control_php': sum(r['amountPesos'] for r in leak2),
            'duplicate_title_amount_keys': len(dup_keys),
            'duplicate_extra_rows': extra_rows,
            'duplicate_extra_php': extra_php,
            'consecutive_page_dup_pairs': consec,
            'consecutive_page_dup_php_approx': consec_php,
            'non_thousand_amount_rows': sum(1 for r in jrows if r['amountPesos'] % 1000),
            'blank_office_rows': sum(1 for r in jrows if not r.get('office')),
            'empty_pap3_rows': sum(1 for r in jrows if not r.get('pap3')),
            'fap_projects_name_matched': fap_name_matched,
            'fap_projects_total': len(fap_projects),
        },
        'v5_title_overlap': {
            'exact_title_amount_keys': len(exact_ta_keys),
            'unique_1to1_title_amount_keys': len(unique_exact),
            'unique_1to1_php': sum(k[1] for k in unique_exact),
            'v5_rows_with_title_amount_in_joebert': v5_matched_ta,
            'v5_php_with_title_amount_in_joebert': v5_matched_php,
            'joebert_rows_with_title_amount_in_v5': j_matched_ta,
            'joebert_php_with_title_amount_in_v5': j_matched_php,
            'exact_region_title_amount_keys': len(v5_by_rta & j_by_rta),
            'exact_office_title_amount_keys': len(v5_by_ota & j_by_ota),
            'shared_normalized_titles': len(title_keys),
            'shared_titles_with_any_common_amount': title_shared_any_amt,
            'after_clean_v5_rows_matched': v5_in_cleaned,
            'after_clean_v5_php_matched': v5_in_cleaned_php,
            'after_clean_joebert_rows_matched': j_in_v5_cleaned,
            'after_clean_joebert_php_matched': j_in_v5_cleaned_php,
            'v5_recall_rows_pct': round(100 * v5_matched_ta / len(v5_leaves), 2),
            'v5_recall_php_pct': round(100 * v5_matched_php / v5_sum, 2),
            'joebert_precision_rows_pct': round(100 * j_matched_ta / len(jrows), 2),
            'joebert_precision_php_pct': round(100 * j_matched_php / j_sum, 2),
        },
        'other_agency_dumps_vs_native_dpwh': other_hits,
        'joebert_region_rollup_php': dict(
            sorted(j_region.items(), key=lambda kv: -kv[1])[:20]
        ),
    }


def main() -> None:
    summary = build()
    OUT.write_text(json.dumps(summary, ensure_ascii=False, indent=2) + '\n')
    h = summary['headline']
    v = summary['v5_title_overlap']
    print(
        f"Joebert {h['joebert_rows_n']:,} rows / ₱{h['joebert_gross_php']/1e9:.3f}B · "
        f"v5 recall {v['v5_recall_rows_pct']}% rows / {v['v5_recall_php_pct']}% ₱ · "
        f"office cells {summary['native_office_coverage']['cells_coverage_pct']}% · "
        f"wrote {OUT.relative_to(REPO)}"
    )


if __name__ == '__main__':
    main()
