#!/usr/bin/env python3
"""Build a document-native House tree: recursive drill-down from the printed root.

The tree follows the bill's own printed hierarchy (VOL I-C), carrying v5's
repaired allocations and attaching printed subtotals from the old strict
hierarchy where their row sets exactly equal the corresponding v5 group:

  root ₱654,102,015,000 (VOL I-B p.9: GAS + S2O + Operations)
  ├─ GAS ₱18.078B / S2O ₱49.082B          — printed VOL I-B controls (control-only)
  └─ Operations ₱586,941,661,000 (row 2444)
      ├─ OO1 ₱209,746,642,000 (row 2445) = APP + Network Dev + Bridge controls
      ├─ OO2 ₱87,187,778,000 (row 6979)  = Flood Management Program
      ├─ Locally-Funded Projects ₱13,875,943,000 (row 20662)
      │    ├─ PPP Strategic Support Fund ₱1B (row 20663)
      │    └─ National Building Program ₱12,875,943,000 (row 20669) → BOS PAP
      ├─ Foreign-Assisted Projects ₱44,749,011,000 (row 20962)
      │    └─ FAP-OO1 (row 20967) → programs → sub-PAPs → projects → GOP/Loan
      │       FAP-OO2 (row 21000/21001), FAP-NBP (row 21016)
      └─ Convergence ₱231,382,287,000 — derived residual, never printed in VOL I-C

Under each local PAP: region → office → project (v5 attribution; printed
office/region subtotals attached where validated). The four documented
unresolved PAPs are the only permitted control mismatches; anything else fails.
"""

import sys
from pathlib import Path as _Path
sys.path[:0] = [str(_Path(__file__).resolve().parents[1]), str(_Path(__file__).resolve().parents[1] / 'builders')]
from paths import ANALYSIS, REPO, DATA, VIEWERS, DOCS, ARCHIVE, EVIDENCE

import hashlib
import json
import pickle
import re
import html as htmllib
from collections import Counter, defaultdict
from pathlib import Path

from build_current_pages import region as regnorm

A = DATA
ROOT = REPO
IC_MD = ROOT / 'HB_BUDGET' / '3 - HB 10858 VOL IC.pdf_by_PaddleOCR-VL-1.6.md'

GRAND = 654_102_015_000
OPS_PRINTED = 586_941_661_000
OO1 = 209_746_642_000
OO2 = 87_187_778_000
LFP_TOTAL = 13_875_943_000
FAP_TOTAL = 44_749_011_000
PPP_FUND = 1_000_000_000
NBP_LFP = LFP_TOTAL - PPP_FUND            # 12,875,943,000
CONVERGENCE = OPS_PRINTED - OO1 - OO2 - LFP_TOTAL - FAP_TOTAL  # 231,382,287,000
FAP_OO1_TOTAL = 35_712_554_000
FAP_OO2_TOTAL = 8_853_487_000
FAP_NBP_TOTAL = 182_970_000

KNOWN_MISMATCH_PAPS = {
    'BIP - Access Roads and/or Bridges from the National Roads leading to Major/ Strategic Public Buildings/ Facilities',
    'BIP - Multi-Purpose Buildings/ Facilities to support Social Services',
    'Water Supply System',
    'BIP - Coastal Roads to augment Resiliency of Coastal Communities',
}

INPUTS = {
    'v5': 'hb_dpwh_leaves_corrected_v5.json',
    'repairs': 'hb_known_defect_repairs.json',
    'audit': 'hb_json_usability_audit.json',
    'controls': 'current_pap_controls.json',
    'hierarchy': 'hb_dpwh_pap_hierarchy.json',
}


def read(name):
    return json.loads((A / name).read_text())


def sha(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for block in iter(lambda: f.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


def ocr_rows():
    """(label, amount) for every VOL I-C OCR table row."""
    content = IC_MD.read_text(encoding='utf-8')
    raw = re.findall(r"<tr[^>]*>(.*?)</tr>", content, re.S)
    out = []
    for r in raw:
        texts = []
        for _a, body in re.findall(r"<td([^>]*)>(.*?)</td>", r, re.S):
            t = re.sub(r"<[^>]+>", " ", body)
            texts.append(re.sub(r"\s+", " ", htmllib.unescape(t)).strip())
        if not texts:
            out.append(('', None))
            continue
        amount = None
        for t in texts[1:]:
            if t and re.fullmatch(r'[\d,]{4,}', t):
                amount = int(t.replace(',', ''))
                break
        label = texts[0] if texts else ''
        out.append((' '.join(label.replace('\\n', ' ').split()), amount))
    return out


# ------------------------------------------------------------------ node core

class Tree:
    def __init__(self):
        self.nodes = []
        self.by_id = {}
        self.seq = 0

    def node(self, label, kind, parent, printed=None, row=None, **extra):
        self.seq += 1
        n = dict(id=f'n{self.seq}', parent_id=parent['id'] if parent else None, label=label, kind=kind,
                 printed_amount_php=printed, source_row=row, children=[], **extra)
        self.nodes.append(n)
        self.by_id[n['id']] = n
        if parent:
            parent['children'].append(n['id'])
        return n

    def project(self, leaf, parent, row_page, with_funding=False):
        page = leaf.get('pdf_page') or (row_page.get(leaf['row']) if leaf['row'] >= 0 else None)
        p = self.node(' '.join(leaf['project'].replace('\\n', ' ').split()), 'project', parent,
                      row=leaf['row'] if leaf['row'] >= 0 else None,
                      amount_php=leaf['amount_php'],
                      source_id=leaf.get('source_id'), pdf_page=page,
                      evidence='native_section' if leaf['row'] < 0 else 'inherited_v4b',
                      extraction_status=leaf.get('validation'), zone=leaf['zone'])
        if with_funding and leaf.get('funding_php'):
            assert sum(leaf['funding_php'].values()) == leaf['amount_php'], leaf['source_id']
            for flabel, famount in sorted(leaf['funding_php'].items()):
                self.node(flabel, 'funding', p, amount_php=famount,
                          coverage_note='Funding partition of the parent project; not a separate allocation.')
        return p


# ------------------------------------------------------------------ subtotal attach

def collect_subtotal_attachments(v5_inh, hierarchy, in_replaced):
    """Old printed office/region subtotals whose row set == a v5 (PAP, region[, office]) group."""
    def deep_rows(n):
        rows = [p['row'] for p in n.get('projects', []) or []]
        for c in n.get('children', []) or []:
            rows += deep_rows(c)
        return rows

    def walk_parent(n, parent):
        yield n, parent
        for c in n.get('children', []) or []:
            yield from walk_parent(c, n)

    by_office = defaultdict(set)
    by_region = defaultdict(set)
    for r, l in v5_inh.items():
        if l['zone'] != 'pap':
            continue
        reg = regnorm(l['region'])
        by_region[(l['pap'], reg)].add(r)
        if l.get('office'):
            by_office[(l['pap'], reg, ' '.join(l['office'].split()))].add(r)

    attach_office, attach_region = {}, {}
    for o in hierarchy['outcomes']:
        for n, parent in walk_parent(o, None):
            if n.get('row') is not None and in_replaced(n['row']):
                continue
            rows = deep_rows(n)
            if not rows or any(r not in v5_inh for r in rows):
                continue
            paps = {v5_inh[r]['pap'] for r in rows}
            regs = {regnorm(v5_inh[r]['region']) for r in rows}
            if len(paps) != 1 or len(regs) != 1:
                continue
            pap, reg = next(iter(paps)), next(iter(regs))
            s = sum(v5_inh[r]['amount_php'] for r in rows)
            total = n.get('printed_total_php')
            if total is None or total != s:
                continue
            if n['kind'] == 'office':
                key = (pap, reg, ' '.join(n['name'].replace('\\n', ' ').split()))
                if by_office.get(key) == set(rows):
                    attach_office[key] = total
            elif n['kind'] == 'region':
                if by_region.get((pap, reg)) == set(rows):
                    attach_region[(pap, reg)] = total
    return attach_office, attach_region


# ------------------------------------------------------------------ main build

def build():
    v5 = read(INPUTS['v5'])
    repairs = read(INPUTS['repairs'])
    controls = read(INPUTS['controls'])
    hierarchy = read(INPUTS['hierarchy'])
    audit = read(INPUTS['audit'])
    with open(DATA / 'row_page_interp.pkl', 'rb') as f:
        row_page = pickle.load(f)

    v5_inh = {l['row']: l for l in v5['leaves'] if l['row'] >= 0}
    ranges = [(x['old_row_start'], x['old_row_stop_exclusive'])
              for x in repairs['repairs'] if x['action'] == 'replace_section']

    def in_replaced(row):
        return any(a <= row < b for a, b in ranges)

    rows = ocr_rows()
    # verify document anchors
    anchors = {2444: ('PERATIONS', OPS_PRINTED), 2445: ('OUTCOME 1', OO1),
               6979: ('UTCOME 2', OO2), 20662: ('OCALLY-FUNDED', LFP_TOTAL),
               20962: ('FOREIGN-ASSISTED', FAP_TOTAL), 20967: ('OUTCOME 1', FAP_OO1_TOTAL),
               21000: ('rogram', FAP_OO2_TOTAL), 21016: ('UILDING', FAP_NBP_TOTAL)}
    edits = []
    for i, (frag, amt) in anchors.items():
        label, got = rows[i]
        assert frag in label and got == amt, f'Anchor row {i} changed: {label!r} {got}'
    # program control anchors
    prog_anchor = {2446: ('Asset Preservation Program', 79_720_290_000),
                   5811: ('Bridge Program', 37_590_473_000),
                   6980: ('Flood Management Program', OO2),
                   20663: ('Public-Private Partnership', PPP_FUND),
                   20669: ('National Building Program', NBP_LFP),
                   20670: ('Buildings And Other Structures', NBP_LFP)}
    for i, (frag, amt) in prog_anchor.items():
        label, got = rows[i]
        assert frag in label and got == amt, f'Program anchor row {i} changed: {label!r} {got}'

    attach_office, attach_region = collect_subtotal_attachments(v5_inh, hierarchy, in_replaced)

    t = Tree()
    root = t.node('DPWH FY2027 — House Bill 10858 new appropriations', 'agency', None,
                  GRAND, source_doc='house_summary', pdf_page=9,
                  basis='VOL I-B p.9: GAS 18,078,293,000 + S2O 49,082,061,000 + Operations 586,941,661,000.')
    printed = audit['pdf_controls_php']
    for key, label in [('gas_total', 'General Administration and Support'), ('s2o_total', 'Support to Operations')]:
        t.node(label, 'summary_control', root, printed[key], source_doc='house_summary', pdf_page=9,
               coverage_note='Printed VOL I-B control; detailed GAS/S2O allocations are outside the v5 project table.')
    ops = t.node('Operations (VOL I-C details)', 'operations', root, OPS_PRINTED, row=2444,
                 source_doc='house_details', basis='Printed OCR row 2444.')

    # -- sections --
    oo1 = t.node('Organizational Outcome 1 — Ensure Safe and Reliable National Road System', 'outcome',
                 ops, OO1, row=2445, source_doc='house_details',
                 basis='Printed OCR row 2445; equals APP + Network Development + Bridge program controls exactly.')
    oo2 = t.node('Organizational Outcome 2 — Protect Lives and Properties Against Major Floods', 'outcome',
                 ops, OO2, row=6979, source_doc='house_details',
                 basis='Printed OCR row 6979; equals the Flood Management Program control.')
    lfp = t.node('Locally-Funded Projects', 'section', ops, LFP_TOTAL, row=20662, source_doc='house_details',
                 basis='Printed OCR row 20662 = PPP fund + National Building Program.')
    fap = t.node('Foreign-Assisted Projects', 'section', ops, FAP_TOTAL, row=20962, source_doc='house_details',
                 basis='Printed OCR row 20962; FAP-OO1 + FAP-OO2 + FAP-NBP.')
    conv = t.node('Convergence and Special Support Program', 'section', ops, CONVERGENCE, row=None,
                  source_doc='derived',
                  basis='Residual: Operations − OO1 − OO2 − LFP − FAP. The Convergence total never prints in VOL I-C.',
                  derived_reason='Section total is an arithmetic residual of printed controls; individual PAP controls still printed.')

    prog_ctrl = {p['program']: p for p in controls['programs']}
    pap_controls = {p['pap']: p for p in repairs['pap_controls']}
    canonical = {p['label']: p for p in controls['paps']}

    def add_program(parent, program, row):
        c = prog_ctrl[program]
        return t.node(program, 'program', parent, c['house_local_control_php'], row=row,
                      source_doc='house_details',
                      nep_total_control_php=c['nep_total_control_php'],
                      delta_vs_nep_php=c['house_local_control_php'] - c['nep_local_control_php'])

    def add_pap_zone(parent, pap_label):
        ctrl = pap_controls.get(pap_label)
        canon = canonical.get(pap_label)
        extra = {}
        if ctrl:
            extra.update(pdf_pages=ctrl['source_pages'])
        else:
            extra.update(derived_reason='No printed PAP control retained for this section; sum of v5 allocations.')
        if canon:
            extra.update(canonical_nep_pap_id=canon['id'], nep_printed_php=canon['nep_printed_php'])
            if ctrl and canon['nep_printed_php'] is not None:
                extra.update(delta_vs_nep_php=ctrl['printed_php'] - canon['nep_printed_php'])
        pn = t.node(pap_label, 'pap', parent, ctrl['printed_php'] if ctrl else None, **extra)
        leaves = [l for l in v5['leaves'] if l['zone'] == 'pap' and l['pap'] == pap_label]
        regions = {}
        for l in sorted(leaves, key=lambda x: (regnorm(x['region']), x.get('office') or '', -(x['row']))):
            reg = regnorm(l['region'])
            office = ' '.join((l.get('office') or 'Office not recorded').split())
            if reg not in regions:
                printed_region = attach_region.get((pap_label, reg))
                regions[reg] = t.node(reg, 'region', pn, printed_region,
                                       **({} if printed_region is not None else
                                          {'derived_reason': 'Regional grouping from v5 attribution; no validated printed subtotal.'}))
            offices = regions[reg].setdefault('_offices', {})
            if office not in offices:
                printed_office = attach_office.get((pap_label, reg, office))
                offices[office] = t.node(office, 'office', regions[reg], printed_office,
                                         **({} if printed_office is not None else
                                            {'derived_reason': 'Office grouping from v5 attribution; no validated printed subtotal.'}))
            t.project(l, offices[office], row_page)
        for reg_node in regions.values():
            reg_node.pop('_offices', None)
        return pn

    # OO1 programs
    add_pap_zone_to = {}
    p_app = add_program(oo1, 'Asset Preservation Program', 2446)
    p_ndp = add_program(oo1, 'Network Development Program', 4448)
    p_bp = add_program(oo1, 'Bridge Program', 5811)
    p_fmp = add_program(oo2, 'Flood Management Program', 6980)

    for program, pn in [('Asset Preservation Program', p_app), ('Network Development Program', p_ndp),
                        ('Bridge Program', p_bp), ('Flood Management Program', p_fmp)]:
        for pap_label in sorted({l['pap'] for l in v5['leaves'] if l['zone'] == 'pap' and l['program'] == program}):
            add_pap_zone(pn, pap_label)

    # LFP: PPP fund + National Building Program → BOS
    ppp = t.node('Public-Private Partnership Strategic Support Fund (including ROW, Subsidy, and Variations)',
                 'pap', lfp, PPP_FUND, row=20663, source_doc='house_details', basis='Printed OCR row 20663.')
    ppp_leaf = next(l for l in v5['leaves'] if l['zone'] == 'pap' and 'Public-Private' in l['pap'])
    t.project(ppp_leaf, ppp, row_page)
    nbp = t.node('National Building Program', 'program', lfp, NBP_LFP, row=20669, source_doc='house_details',
                 basis='Printed OCR row 20669; equals the Local Program pap-zone control (LFP − PPP).')
    add_pap_zone(nbp, 'Buildings And Other Structures')

    # Convergence PAPs
    for pap_label in sorted({l['pap'] for l in v5['leaves'] if l['zone'] == 'pap'
                             and l['program'] == 'Convergence and Special Support Program'}):
        add_pap_zone(conv, pap_label)

    # -- FAP tail --
    fap_leaves = [l for l in v5['leaves'] if l['zone'] == 'fap']
    fap_oo1 = t.node('Organizational Outcome 1 — FAP', 'outcome', fap, FAP_OO1_TOTAL, row=20967,
                     source_doc='house_details', basis='Printed OCR row 20967.')
    fap_oo2 = t.node('Organizational Outcome 2 — FAP', 'outcome', fap, FAP_OO2_TOTAL, row=21000,
                     source_doc='house_details', basis='Printed OCR row 21000.')
    fap_nbp = t.node('National Building Program — FAP', 'section', fap, FAP_NBP_TOTAL, row=21016,
                     source_doc='house_details', basis='Printed OCR row 21016.')
    prog_sum = defaultdict(int)
    for l in fap_leaves:
        prog_sum[l['program']] += l['amount_php']
    # Printed controls in the FAP tail (verified against v5 sums at build time):
    fap_printed = {
        ('program', 'Asset Preservation Program'): (20968, 2_832_301_000),
        ('pap', 'Preventive Maintenance - Primary Roads'): (20969, 1_711_754_000),
        ('pap', 'Rehabilitation/ Reconstruction/ Upgrading of Damaged Paved Roads - Tertiary Roads'): (20973, 1_120_547_000),
        ('pap', 'Construction of By-Passes/Diversion Roads'): (20977, 27_384_818_000),
    }
    for program in ['Asset Preservation Program', 'Network Development Program', 'Bridge Program']:
        pc = fap_printed.get(('program', program))
        fp = t.node(program, 'program', fap_oo1, prog_sum[program], row=pc[0] if pc else None,
                    **({} if pc else {'derived_reason': 'FAP tail prints no program control; sum of attributed FAP projects.'}))
        if pc:
            assert prog_sum[program] == pc[1], f'FAP program control mismatch {program}'
        for pap_label in sorted({l['pap'] for l in fap_leaves if l['program'] == program}):
            group = [l for l in fap_leaves if l['pap'] == pap_label]
            s = sum(l['amount_php'] for l in group)
            pp = fap_printed.get(('pap', pap_label))
            if pp:
                assert s == pp[1], f'FAP sub-PAP control mismatch {pap_label}: {s} vs {pp[1]}'
            fpn = t.node(pap_label, 'pap', fp, pp[1] if pp else None, row=pp[0] if pp else None,
                         **({} if pp else {'derived_reason': 'Sum of projects under this sub-PAP heading; the tail prints no standalone control for this grouping.'}))
            for l in group:
                t.project(l, fpn, row_page, with_funding=True)
    fap_oo2_pap = t.node('Construction/ Rehabilitation of Flood Mitigation Facilities within Major River Basins and Principal Rivers',
                         'pap', fap_oo2, FAP_OO2_TOTAL, row=21001, source_doc='house_details',
                         basis='Printed OCR row 21001.')
    for l in [l for l in fap_leaves if l['program'] == 'Flood Management Program']:
        t.project(l, fap_oo2_pap, row_page, with_funding=True)
    # FAP-NBP: printed sub-PAP control row 21018
    fap_nbp_pap = t.node('Philippines Seismic Risk Reduction and Resilience Project (PSRRRP)', 'pap', fap_nbp,
                         FAP_NBP_TOTAL, row=21018, source_doc='house_details', basis='Printed OCR row 21018.')
    for l in [l for l in fap_leaves if l['program'] == 'Local Program']:
        t.project(l, fap_nbp_pap, row_page, with_funding=True)

    return t, root, dict(v5=v5, repairs=repairs, controls=controls, hierarchy=hierarchy, audit=audit,
                         row_page=row_page, attach_office=attach_office, attach_region=attach_region, edits=edits)


# ------------------------------------------------------------------ rollup & validation

def rollup(t):
    by_id = t.by_id
    for n in reversed(t.nodes):
        children = [by_id[c] if isinstance(c, str) else c for c in n['children']]
        child_sum = sum(c['amount_php'] for c in children)
        if n['kind'] in ('project', 'funding'):
            n['amount_php'] = n.get('amount_php') or child_sum
            n['extracted_php'] = n['amount_php'] if n['kind'] == 'project' else None
            n['allocation_count'] = int(n['kind'] == 'project')
            n['validation'] = 'allocation' if n['kind'] == 'project' else (
                'funding_balanced' if children and child_sum == n['amount_php'] else 'partition')
        else:
            n['amount_php'] = n['printed_amount_php'] if n['printed_amount_php'] is not None else child_sum
            values = [c['extracted_php'] for c in children if c.get('extracted_php') is not None]
            n['extracted_php'] = sum(values) if values else None
            n['allocation_count'] = sum(c['allocation_count'] for c in children)
            if n['printed_amount_php'] is None:
                n['validation'] = 'derived'
            elif not children:
                n['validation'] = 'control_only'
            elif child_sum == n['printed_amount_php']:
                n['validation'] = 'balanced'
            else:
                n['validation'] = 'mismatch'
        n['children_sum_php'] = child_sum if children else None
        n['difference_php'] = child_sum - n['amount_php'] if children else None


def validate(t, known_mismatches):
    """Zero-tolerance structural + control check. Only documented PAP mismatches allowed."""
    by_id = t.by_id
    # structural: every child listed once, parents consistent, single root
    roots = [n for n in t.nodes if n['parent_id'] is None]
    assert len(roots) == 1 and roots[0]['kind'] == 'agency', 'Multiple roots'
    for n in t.nodes:
        for c in n['children']:
            assert by_id[c]['parent_id'] == n['id'], f'Inconsistent link {n["id"]}->{c}'
    seen = set()

    def visit(id):
        assert id not in seen, f'Multiple paths to {id}'
        seen.add(id)
        for c in by_id[id]['children']:
            visit(c)
    visit(roots[0]['id'])
    assert seen == set(by_id), f'Unreachable nodes: {sorted(set(by_id) - seen)[:5]}'
    # controls: root and operations sections must balance; only documented PAP mismatches
    assert roots[0]['difference_php'] == 0, 'Root does not balance'
    ops = by_id[roots[0]['children'][2]]
    assert ops['difference_php'] == 0 and ops['validation'] == 'balanced'
    for section in ops['children']:
        sn = by_id[section]
        assert sn['difference_php'] == 0, f'Section mismatch: {sn["label"]}'
    mismatches = [n for n in t.nodes if n['validation'] == 'mismatch']
    assert all(n['kind'] == 'pap' for n in mismatches), f'Non-PAP mismatch: {[(n["kind"], n["label"]) for n in mismatches if n["kind"] != "pap"]}'
    assert {n['label'] for n in mismatches} <= known_mismatches, \
        f'Undocumented mismatch: {[(n["label"], n["difference_php"]) for n in mismatches if n["label"] not in known_mismatches][:5]}'
    # v5 reproduction
    return mismatches


def report(tree, summary):
    s = summary
    mismatch_rows = '\n'.join(f"| {m['label']} | {'+' if -m['difference_php'] > 0 else ''}{-m['difference_php']:,} |"
                              for m in s['mismatched_paps'])
    return f"""# FY2027 DPWH House (HB 10858) document-native tree

The tree drills the printed **₱{s['total_php']:,}** House total down the document's own hierarchy: Operations (OCR row 2444) → Organizational Outcomes, Locally-Funded Projects, Foreign-Assisted Projects, and Convergence → programs → PAPs → regions → offices → projects, with GOP/loan partitions inside every FAP project. **{s['balanced_controls']} printed controls balance exactly** ({s['balanced_paps']} PAPs, {s['balanced_offices']} office subtotals, {s['balanced_regions']} region subtotals, plus programs, outcomes, and sections). The only mismatches are the four documented unresolved PAPs.

| Unresolved PAP control | Printed − extracted (₱) |
|---|---:|
{mismatch_rows}

## Document structure and anchors

VOL I-C prints the DPWH operations section as **OO1 ₱209,746,642,000 = APP + Network Development + Bridge** program controls exactly; **OO2 = Flood Management Program**; **Locally-Funded Projects ₱13,875,943,000 = PPP fund ₱1B + National Building Program ₱12,875,943,000**; and the **FAP tail (rows 20962–21042): FAP-OO1 ₱35,712,554,000 + FAP-OO2 ₱8,853,487,000 + FAP-NBP ₱182,970,000**, each with printed sub-PAP controls that v5 reproduces exactly. The Convergence total never prints in VOL I-C; it is the exact residual of the Operations control minus the four printed sections (₱{s['convergence_php']:,}) and is marked derived.

## Construction

Run `python analysis/builders/build_hb_source_tree.py`. Inputs: House v5 allocations, the audited printed controls, the canonical PAP mapping, the old strict hierarchy (printed office/region subtotals), and the OCR row→page map. Document anchor rows (2444, 2445, 2446, 5811, 6979, 6980, 20662–20670, 20962–21016) are asserted at build time — if the OCR changes, the build fails. Region/office groupings use v5 attribution; printed office subtotals are attached only when the old block's row set exactly equals the v5 group and the sum matches ({s['attached_office_subtotals']} offices, {s['attached_region_subtotals']} regions). No subtotal or hierarchy amount is invented.

## Limits

This is a recursive *extraction* baseline, not a certification. {s['inherited_allocations']:,} of {s['allocations']:,} allocations inherit v4b amounts and attribution; the four unresolved sections remain open; balanced office subtotals validate arithmetic, not title or attribution correctness; regional groupings without printed subtotals are v5-derived. GAS/S2O details are outside the VOL I-C project table. Unmatched rows across sources are review candidates, never confirmed insertions or removals.

## Artifacts

- [Interactive drilldown](hb_2027_source_tree.html): document view with row/page references, printed vs extracted amounts, funding partitions.
- [Canonical tree](../data/hb_2027_source_tree.json): hierarchy, validation status, provenance, anchors.
- [Validation ledger](../data/hb_2027_source_tree_validation.json): every printed control check, attachments, anchor rows.
- Regression tests: `python -m unittest discover -s analysis/tests -p 'test_hb_source_tree.py' -v`.

Next: resolve the four unresolved sections against the source PDF; extend office-subtotal attachment to the replaced sections' native subtotals.
"""


def main():
    t, root, ctx = build()
    rollup(t)
    known = {p['pap'] for p in ctx['repairs']['pap_controls'] if p['difference_php']}
    mismatches = validate(t, known)

    by_id = t.by_id
    kinds = Counter(n['kind'] for n in t.nodes)
    balanced = [n for n in t.nodes if n['validation'] == 'balanced' and n['kind'] not in ('project', 'funding')]
    v5 = ctx['v5']
    summary = dict(
        total_php=root['printed_amount_php'],
        operations_php=B_OPS,
        nodes=len(t.nodes),
        allocations=len(v5['leaves']),
        inherited_allocations=sum(1 for l in v5['leaves'] if l['row'] >= 0),
        native_allocations=sum(1 for l in v5['leaves'] if l['row'] < 0),
        balanced_controls=len(balanced),
        balanced_paps=sum(1 for n in balanced if n['kind'] == 'pap'),
        balanced_offices=sum(1 for n in balanced if n['kind'] == 'office'),
        balanced_regions=sum(1 for n in balanced if n['kind'] == 'region'),
        checked_paps=len(ctx['repairs']['pap_controls']),
        mismatched_paps=[{'label': n['label'], 'difference_php': n['difference_php']} for n in mismatches],
        convergence_php=CONVERGENCE,
        attached_office_subtotals=len(ctx['attach_office']),
        attached_region_subtotals=len(ctx['attach_region']),
        node_kinds=dict(kinds),
        arithmetic_statuses=dict(Counter(n['validation'] for n in t.nodes)),
    )
    assert sum(n['amount_php'] for n in t.nodes if n['kind'] == 'project') == sum(l['amount_php'] for l in v5['leaves'])

    provenance = {
        'method': 'Document-native recursive tree from printed VOL I-C section anchors and v5 repaired allocations. '
                  'Region→office→project under each PAP from v5 attribution; printed office/region subtotals attached only when the old strict-hierarchy row set exactly equals the v5 group with equal sum. '
                  'Convergence is the exact residual of printed controls. Zero invented amounts.',
        'inputs': {k: f'analysis/data/{v}' for k, v in INPUTS.items()},
        'inputs_sha256': {f'analysis/data/{v}': sha(A / v) for v in INPUTS.values()},
        'source_documents': {'house_summary': '../HB_BUDGET/2%20-%20HB%2010858%20VOL%20IB.pdf',
                             'house_details': '../HB_BUDGET/3%20-%20HB%2010858%20VOL%20IC.pdf'},
        'anchor_rows': ANCHORS,
        'validation_policy': 'Root, Operations, all sections, programs, outcomes must balance at zero tolerance; '
                             'only the four documented unresolved PAPs may mismatch; structural checks reject multiple paths, orphan nodes, and inconsistent links.',
    }
    tree = dict(schema_version=1, fiscal_year=2027, house_version='v5+document-native',
                provenance=provenance, summary=summary, root='n1', nodes=t.nodes,
                limitations=v5['provenance']['limitations'], repairs=ctx['repairs']['repairs'],
                attached_office_subtotals=sorted([{'pap': k[0], 'region': k[1], 'office': k[2], 'subtotal_php': v}
                                                  for k, v in ctx['attach_office'].items()], key=lambda x: (x['pap'], x['region'], x['office'])),
                attached_region_subtotals=sorted([{'pap': k[0], 'region': k[1], 'subtotal_php': v}
                                                  for k, v in ctx['attach_region'].items()], key=lambda x: (x['pap'], x['region'])))
    checks = [{'id': n['id'], 'kind': n['kind'], 'label': n['label'], 'source_row': n.get('source_row'),
               'printed_amount_php': n['printed_amount_php'], 'children_sum_php': n['children_sum_php'],
               'difference_php': n['difference_php'], 'status': n['validation']}
              for n in t.nodes if n['printed_amount_php'] is not None]
    validation = dict(summary=summary, checks=checks,
                      mismatched_controls=[c for c in checks if c['status'] == 'mismatch'],
                      provenance=provenance, limitations=v5['provenance']['limitations'])

    (DATA / 'hb_2027_source_tree.json').write_text(json.dumps(tree, ensure_ascii=False, indent=2) + '\n')
    (DATA / 'hb_2027_source_tree_validation.json').write_text(json.dumps(validation, ensure_ascii=False, indent=2) + '\n')
    (VIEWERS / 'hb_2027_source_tree.md').write_text(report(tree, summary))
    embedded = json.dumps(tree, ensure_ascii=False, separators=(',', ':')).replace('<', '\\u003c')
    (VIEWERS / 'hb_2027_source_tree.html').write_text(
        (VIEWERS / 'hb_source_tree_viewer.template.html').read_text().replace('__HB_TREE_DATA__', embedded))
    print(json.dumps(summary, indent=2))
    return tree


B_OPS = OPS_PRINTED
ANCHORS = {'operations_total': 2444, 'oo1': 2445, 'app': 2446, 'bridge': 5811, 'oo2': 6979, 'fmp': 6980,
           'lfp': 20662, 'ppp': 20663, 'nbp': 20669, 'bos': 20670, 'fap': 20962, 'fap_oo1': 20967,
           'fap_oo2': 21000, 'fap_oo2_pap': 21001, 'fap_nbp': 21016}


if __name__ == '__main__':
    main()
