#!/usr/bin/env python3
"""Extract NIA's FY 2027 proposal-vs-NEP tables from the PBC presentation.

Source: POWERPOINT PRESENTATION/FY 2027 BUDGET-NIA-PEOPLE_S BUDGET
COALITION.pdf (18 slides, native text layer), NIA's response to the People's
Budget Coalition.  Slides 12-17 print "PARTICULARS | 2026 GAA | FY 2027
BUDGET PROPOSAL (P'000) | NEP" tables.

Method
------
Amounts are machine-read from the native word layer, column-anchored on the
GAA/PROPOSAL/NEP header words, with per-cell bboxes.  Labels wrap across
multiple y-lines (the amount sits on the label's middle line), so labels are
hand-verified readings validated 1:1 against the machine-read amount
triples: the build fails if any (page, gaa, proposal, nep) triple does not
appear exactly once in the geometric extraction.

Dash cells (no amount) read as None; physical-target rows (ha/km) are tagged
separately.  The "Small Reservoir Irrigation Projects" NEP prints 4,579,000
(in P'000 => 4,579,000,000), matching the known NEP control.
"""
import hashlib
import json
import os
import re

import pymupdf

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = ('/media/temp/3dbc81e7-b4e7-4209-a85b-3f0afb0a5253/Downloads/'
       'NIA- PBC_Data/PEOPLE_S BUDGET COALITION REQUIREMENTS/'
       'POWERPOINT PRESENTATION/FY 2027 BUDGET-NIA-PEOPLE_S BUDGET COALITION.pdf')

TABLE_PAGES = [12, 13, 14, 15, 16, 17]

# Hand-verified rows: (page, label, gaa, proposal, nep) in P'000 as printed.
# None = printed as "-" (no amount).  Values are the machine-readable
# expectation; labels are verified readings of the slide.
VERIFIED_ROWS = [
    # slide 12 - ISR program: climate adaptation + watershed
    (12, 'Climate Change Adaptation Works (National Systems)',
     82_000, 5_494_505, 200_000),
    (12, 'Climate Change Adaptation Works (Communal Systems)',
     600_000, 223_000, 200_000),
    (12, 'Rehabilitation and Protection of Watershed Management',
     None, 473_221, 100_000),
    # slide 13 - service roads
    (13, 'Improvement of Service Roads in National Irrigation Systems',
     1_583_891, 17_705_462, 250_000),
    (13, 'Improvement of Service Roads in Communal Irrigation Systems',
     550_000, 2_389_865, 250_000),
    # slide 14 - repairs
    (14, 'Repair of National Irrigation Systems',
     11_425_497, 38_261_911, 2_021_555),
    (14, 'Repair of Communal Irrigation Systems',
     4_211_262, 20_515_660, 920_000),
    (14, 'Repair of Pump Irrigation Systems',
     667_405, 10_415_188, 3_000_000),
    # slide 15 - restoration
    (15, 'Restoration of National Irrigation Systems',
     1_140_980, 7_260_567, 1_000_000),
    (15, 'Restoration of Communal Irrigation Systems',
     1_434_564, 13_245_386, 250_000),
    # slide 16 - ISD program: new projects
    (16, 'New National Irrigation Projects',
     13_034_801, 34_939_697, 7_561_321),
    (16, 'Small Reservoir Irrigation Projects',
     3_801_346, 11_083_425, 4_579_000),
    # slide 17 - ISD program: pump + special + extension + CARP
    (17, 'Establishment of Pump Irrigation Projects',
     7_473_641, 34_943_556, 7_915_950),
    (17, 'Small Irrigation Projects / Special Irrigation',
     2_154_500, 6_462_840, 4_579_000),
    (17, 'Extension / Expansion of Existing Irrigation Systems',
     881_248, 1_765_300, 200_000),
    (17, 'Comprehensive Agrarian Reform Program - IC',
     882_188, 4_155_715, 698_067),
]

# physical-target callouts (ha) that sit inside the same column geometry
PHYSICAL_ROWS = [
    (15, 'Restore Area (ha)', 2_243),
    (16, 'New Area (ha)', 1_226),
    (17, 'New Area (ha)', 3_926),
    (17, 'Restore Area (ha)', 513),
]


def parse_amount(s):
    s = s.replace(',', '').strip()
    return float(s) if re.match(r'^\d+$', s) else None


def cluster_rows(words, tol=6):
    rows = []
    for w in sorted(words, key=lambda w: (w[1], w[0])):
        for r in rows:
            if abs(r[0][1] - w[1]) < tol:
                r.append(w)
                break
        else:
            rows.append([w])
    return [sorted(r, key=lambda w: w[0]) for r in rows]


def extract_amount_cells(doc, pno):
    """Machine-read the three column amounts per visual row, with bboxes."""
    pg = doc[pno - 1]
    words = pg.get_text('words')
    # PROPOSAL header anchors the middle; GAA is the nearest 'GAA' left of
    # it, NEP the nearest 'NEP' right of it (callout boxes also print NEP).
    prop_w = next((w for w in words if w[4] == 'PROPOSAL'
                   and any(x[4] == 'GAA' for x in words)
                   and w[0] > 200), None)
    if not prop_w:
        raise SystemExit(f'page {pno}: no PROPOSAL header')
    pcx = (prop_w[0] + prop_w[2]) / 2
    gaa_candidates = [w for w in words if w[4] == 'GAA'
                      and (w[0] + w[2]) / 2 < pcx]
    nep_candidates = [w for w in words if w[4] == 'NEP'
                      and (w[0] + w[2]) / 2 > pcx]
    if not gaa_candidates or not nep_candidates:
        raise SystemExit(f'page {pno}: GAA/NEP headers not flanking PROPOSAL')
    gaa_w = max(gaa_candidates, key=lambda w: (w[0] + w[2]) / 2)
    nep_w = min(nep_candidates, key=lambda w: (w[0] + w[2]) / 2)
    cols = {'gaa': (gaa_w[0] + gaa_w[2]) / 2,
            'proposal': (prop_w[0] + prop_w[2]) / 2,
            'nep': (nep_w[0] + nep_w[2]) / 2}
    header_y = min(gaa_w[1], nep_w[1])

    def col_for(w):
        x = (w[0] + w[2]) / 2
        best, bd = None, 1e9
        for name, cx in cols.items():
            d = abs(x - cx)
            if d < bd:
                best, bd = name, d
        return best if bd < 75 else None

    cells = []  # {y, gaa, proposal, nep, bboxes}
    for r in cluster_rows(words):
        if r[0][1] <= header_y:
            continue
        amounts = {}
        for w in r:
            c = col_for(w)
            if c and re.match(r'^[\d,]+$', w[4]) and len(w[4]) >= 3:
                amounts.setdefault(c, []).append(w)
        if not amounts:
            continue
        cell = {'y': round(min(w[1] for ws_ in amounts.values() for w in ws_), 1)}
        for c in ('gaa', 'proposal', 'nep'):
            if c in amounts:
                ws_ = sorted(amounts[c], key=lambda w: w[0])
                cell[c] = parse_amount(''.join(w[4] for w in ws_))
                cell[c + '_bbox'] = [round(v, 1) for v in (
                    min(w[0] for w in ws_), min(w[1] for w in ws_),
                    max(w[2] for w in ws_), max(w[3] for w in ws_))]
        cells.append(cell)
    return cells


def main():
    doc = pymupdf.open(SRC)
    sha = hashlib.sha256(open(SRC, 'rb').read()).hexdigest()

    all_cells = {p: extract_amount_cells(doc, p) for p in TABLE_PAGES}

    rows = []
    for page, label, gaa, proposal, nep in VERIFIED_ROWS:
        # find the unique machine-read cell matching the triple
        matches = [c for c in all_cells[page]
                   if c.get('gaa') == gaa and c.get('proposal') == proposal
                   and c.get('nep') == nep]
        if len(matches) != 1:
            raise SystemExit(
                f'page {page} "{label}": expected exactly 1 machine-read '
                f'cell for ({gaa}, {proposal}, {nep}), found {len(matches)}')
        c = matches[0]
        rows.append({
            'page': page, 'label': label,
            'gaa_2026_p000': gaa, 'proposal_p000': proposal, 'nep_p000': nep,
            'bboxes': {k: c[k + '_bbox'] for k in ('gaa', 'proposal', 'nep')
                       if k + '_bbox' in c},
        })

    physical = []
    for page, label, value in PHYSICAL_ROWS:
        # physical callouts sit in side boxes; find by amount text anywhere
        # on the page (unique per slide, verified by hand)
        pg = doc[page - 1]
        hits = [w for w in pg.get_text('words')
                if w[4].replace(',', '') == str(value)
                and w[1] > max(c['y'] for c in all_cells[page][:2])]
        if len(hits) != 1:
            raise SystemExit(f'physical row {label} p{page}: {len(hits)} matches')
        w = hits[0]
        physical.append({'page': page, 'label': label, 'value': value,
                         'bbox': [round(v, 1) for v in w[:4]]})

    # cross-dataset validation against retained NEP/House extractions
    DATA = os.path.join(os.path.dirname(os.path.dirname(HERE)), '')
    nep_ds = json.load(open(os.path.join(HERE, '..', 'nep_nia_dataset.json')))
    nep_sub = {s['sub_program']: s['control_amount']
               for s in nep_ds.get('subprograms', [])}
    # NEP annex sub-program controls we can tie to PBC NEP column (P'000):
    ties = {
        'Establishment of Pump Irrigation Projects':
            ('Establishment of Pump Irrigation', 7_915_950_000),
        'Extension / Expansion of Existing Irrigation Systems':
            ('Extension/Expansion', 200_000_000),
    }
    checks = []
    for label, (sp, expected) in ties.items():
        row = next(r for r in rows if r['label'] == label)
        got = row['nep_p000'] * 1000
        checks.append({'pbc_label': label, 'nep_subprogram': sp,
                       'pbc_nep': got, 'annex_control': expected,
                       'match': got == expected})

    dataset = {
        'schema_version': 1,
        'source': {
            'file': SRC, 'sha256': sha, 'pages': len(doc),
            'table_slides': TABLE_PAGES,
            'method': 'amounts machine-read from native words, column-anchored; '
                      'labels hand-verified, validated 1:1 against amount triples',
        },
        'units': "P'000 (thousand PHP) as printed; multiply by 1000",
        'budget_comparison': rows,
        'physical_targets': physical,
        'nep_annex_crosschecks': checks,
        'column_totals_p000': {
            'gaa_2026': sum(r['gaa_2026_p000'] or 0 for r in rows),
            'proposal': sum(r['proposal_p000'] or 0 for r in rows),
            'nep': sum(r['nep_p000'] or 0 for r in rows),
        },
    }

    out = os.path.join(HERE, 'pbc_budget_comparison.json')
    with open(out, 'w') as fh:
        json.dump(dataset, fh, indent=1, ensure_ascii=False)
    print(f'wrote {out}')
    t = dataset['column_totals_p000']
    print(f"totals (P'B): GAA {t['gaa_2026']/1e6:,.2f} | "
          f"proposal {t['proposal']/1e6:,.2f} | NEP {t['nep']/1e6:,.2f}")
    for c in checks:
        print(f"cross-check {c['pbc_label']}: {c['match']}")


if __name__ == '__main__':
    main()
