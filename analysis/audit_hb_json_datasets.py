"""Read-only comparison of saved House datasets; writes separate audit artifacts."""
import collections
import hashlib
import importlib.util
import json
import pathlib
import re
import unicodedata

BASE = pathlib.Path(__file__).resolve().parent
ROOT = BASE.parent


def read(name):
    return json.loads((BASE / name).read_text())


def norm(s):
    return re.sub(r'[^a-z0-9]', '', unicodedata.normalize('NFKC', s or '').lower())


def module(name):
    spec = importlib.util.spec_from_file_location(name, BASE / (name + '.py'))
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def main():
    import pymupdf
    native = module('audit_textlayer_v2')
    pdf = pymupdf.open(ROOT / 'HB_BUDGET/3 - HB 10858 VOL IC.pdf')
    printed = collections.defaultdict(list)
    for page in pdf:
        for r in native.extract_page_rows(page):
            printed[(norm(r['label']), r['amounts'][0])].append({
                'pdf_page': page.number + 1, 'heading': native.is_heading(r['label'], r['bold'])})
    pdf.close()
    summary_pdf = pymupdf.open(ROOT / 'HB_BUDGET/2 - HB 10858 VOL IB.pdf')
    text = summary_pdf[8].get_text()
    controls = {'new_appropriations': 654102015000, 'personnel_services': 14922297000,
                'mooe': 24685746000, 'capital_outlays': 614493972000,
                'gas_total': 18078293000, 's2o_total': 49082061000,
                'regular_operations': 528316707000, 'local_projects': 13875943000,
                'foreign_assisted_projects': 44749011000, 'operations_including_projects': 586941661000}
    for key in ['new_appropriations', 'personnel_services', 'mooe', 'capital_outlays',
                'gas_total', 's2o_total', 'regular_operations', 'local_projects', 'foreign_assisted_projects']:
        assert f"{controls[key]:,}" in text, key
    assert controls['new_appropriations'] == sum(controls[k] for k in ['personnel_services','mooe','capital_outlays'])
    assert controls['new_appropriations'] == sum(controls[k] for k in ['gas_total','s2o_total','operations_including_projects'])
    summary_pdf.close()
    names = ['hb_dpwh_items.json', 'hb_dpwh_leaves_validated.json',
             'hb_dpwh_leaves_corrected.json', 'hb_dpwh_leaves_corrected_v2.json',
             'hb_dpwh_leaves_corrected_v3.json', 'hb_dpwh_leaves_corrected_v4.json',
             'hb_dpwh_leaves_corrected_v4b.json']
    source = read('nep_2027_source_projects.json')
    source_index = collections.defaultdict(list)
    for p in source['projects']:
        source_index[(norm(p['pap3']), norm(p['title']), p['amount_php'])].append(p)
    metrics = []
    rowmaps = {}
    for name in names:
        d = read(name)
        rows = d.get('leaves', d.get('items', []))
        amount = lambda r: r.get('amount_php', r.get('amount_pesos', 0)) or 0
        title = lambda r: r.get('project', r.get('name', ''))
        stats = {'file': name, 'rows': len(rows), 'total_php': sum(map(amount, rows)),
                 'scope': 'mixed MOOE/support/projects' if 'items' in d else 'operations candidate leaves',
                 'sha256': hashlib.sha256((BASE/name).read_bytes()).hexdigest(),
                 'missing_region': sum(not r.get('region') for r in rows),
                 'missing_office': sum(not r.get('office') for r in rows),
                 'validation_counts': dict(collections.Counter(r.get('validation','none') for r in rows)),
                 'zones': {}, 'native_exact_title_amount': 0, 'native_exact_project_only': 0,
                 'native_heading_only': 0, 'native_no_exact_title_amount': 0,
                 'retained_verified_rollups': [], 'pap_sums_php': {},
                 'nep_exact_pap_title_amount_candidates': 0}
        pap_sums = collections.Counter()
        for r in rows:
            a = amount(r)
            z = r.get('zone','mixed')
            zs = stats['zones'].setdefault(z, {'rows':0,'php':0})
            zs['rows'] += 1; zs['php'] += a
            pap_sums[r.get('pap') or '<empty>'] += a
            hits = printed.get((norm(title(r)),a),[])
            if hits:
                stats['native_exact_title_amount'] += 1
                if any(not h['heading'] for h in hits): stats['native_exact_project_only'] += 1
                else: stats['native_heading_only'] += 1
            else: stats['native_no_exact_title_amount'] += 1
            if r.get('validation') == 'pdf3:verified_rollup':
                stats['retained_verified_rollups'].append({'row':r['row'],'title':title(r),'php':a,'native_hits':hits})
            if source_index.get((norm(r.get('pap')), norm(title(r)), a)):
                stats['nep_exact_pap_title_amount_candidates'] += 1
        stats['pap_sums_php'] = dict(pap_sums)
        if 'leaves' in d:
            stats['operations_net_shortfall_php'] = controls['operations_including_projects'] - stats['total_php']
            rowmaps[name] = {r['row']:r for r in rows}
        metrics.append(stats)
    baseline = rowmaps['hb_dpwh_leaves_validated.json']
    structural_checks = []
    for name, rootkey, statuskey in [('hb_dpwh_pap_hierarchy.json','outcomes','arithmetic'),
                                     ('hb_block_tree.json','roots','status')]:
        nodes=[]; projects=[]
        def walk(obj):
            if isinstance(obj,dict):
                if 'kind' in obj:nodes.append(obj)
                projects.extend(obj.get('projects',[]))
                for k,v in obj.items():
                    if k!='projects':walk(v)
            elif isinstance(obj,list):
                for v in obj:walk(v)
        walk(read(name)[rootkey])
        record={'file':name,'nodes':len(nodes),
            'statuses':dict(collections.Counter(n.get(statuskey) for n in nodes)),
            'project_rows':len(projects),'embedded_project_sum_php':sum(p['amount_php'] for p in projects)}
        if projects:
            record['same_original_row_amounts']=all(p['row'] in baseline and p['amount_php']==baseline[p['row']]['amount_php'] for p in projects)
        structural_checks.append(record)
    for m in metrics:
        if m['file'] not in rowmaps:continue
        rows = rowmaps[m['file']]
        m['versus_original'] = {'same_row_ids':set(rows)==set(baseline),
            'amount_changes':sum(r['amount_php']!=baseline[k]['amount_php'] for k,r in rows.items()),
            'pap_changes':sum(r.get('pap')!=baseline[k].get('pap') for k,r in rows.items()),
            'region_changes':sum(r.get('region')!=baseline[k].get('region') for k,r in rows.items())}
    # The PAP drilldown is read separately: its totals come from native PDF rows.
    drill = read('crosscheck_2027_pap_drilldown.json')
    drmodule = module('crosscheck_pap_drilldown')
    pdf = pymupdf.open(ROOT/'HB_BUDGET/3 - HB 10858 VOL IC.pdf')
    pap_checks = []
    current = next(m for m in metrics if m['file'].endswith('v4b.json'))
    for p in drill['matched_paps']:
        heading_hits = []
        for page in p['hb_pages']:
            rows = drmodule.page_rows(pdf[page-1])
            for label, amounts, bold in rows:
                if bold and any(norm(label)==norm(h) or (len(norm(label))>30 and norm(h).startswith(norm(label))) for h in p['hb_labels']):
                    for a in amounts:
                        if re.fullmatch(r'\d{1,3}(?:,\d{3})+',a):heading_hits.append({'page':page,'label':label,'php':int(a.replace(',',''))})
        nep_controls = [v['amount_php'] for k,v in source['pap_controls'].items() if norm(k)==norm(p['pap3'])]
        pap_checks.append({'pap':p['pap3'], 'drilldown_house_local_php':p['hb_local_php'],
            'pdf_heading_hits':heading_hits,
            'native_heading_agrees':any(h['php']==p['hb_local_php'] for h in heading_hits),
            'nep_printed_control_php':nep_controls[0] if len(nep_controls)==1 else None,
            'v4b_exact_label_php':current['pap_sums_php'].get(p['pap3'],0),
            'house_minus_nep_control_php':p['hb_local_php']-nep_controls[0] if len(nep_controls)==1 else None})
    pdf.close()
    current['missing_region_by_zone']=dict(collections.Counter(r.get('zone') for r in rowmaps[current['file']].values() if not r.get('region')))
    program_crosscheck=[]
    local_controls={'Asset Preservation Program':79720290000,'Network Development Program':92435879000,
        'Bridge Program':37590473000,'Flood Management Program':87187778000,
        'Convergence and Special Support Program':231382287000,'Local Program':13875943000}
    source_nonfap=collections.Counter()
    for p in source['projects']:
        if p['zone']=='non_fap':source_nonfap[p['program']]+=p['amount_php']
    for program,house in local_controls.items():
        nep=source_nonfap[program]
        program_crosscheck.append({'program':program,'house_local_control_php':house,
            'nep_non_fap_source_php':nep,'delta_php':house-nep})
    assert sum(local_controls.values())+controls['foreign_assisted_projects']==controls['operations_including_projects']
    inventory=[]
    for path in sorted(BASE.glob('*.json')):
        if path.name.startswith('hb_json_usability_audit'):continue
        d=json.loads(path.read_text())
        if 'hb' in path.name or path.name.startswith(('crosscheck_','textlayer_audit','pdf_verification','family_blocks','page_family_map','taxonomy_comparison','report_highlights')):
            inventory.append({'file':path.name,'bytes':path.stat().st_size,'keys':list(d) if isinstance(d,dict) else None,'list_rows':len(d) if isinstance(d,list) else None})
    output={'scope':'Saved FY2027 House JSON audit; original datasets unchanged',
        'limitations':['Native exact checks are conservative global title/amount presence checks, not one-to-one page-scoped verification.',
            'NEP candidate checks require equal PAP/title/amount; title or amount changes remain unresolved, not proven insertions.',
            'PAP heading checks use native PDF fonts/rows; failure to match is an extraction limitation, not proof a heading is absent.',
            'Printed controls are from local PDFs; plenary amendment inclusion is not established.'],
        'pdf_controls_php':controls,'inventory':inventory,'datasets':metrics,
        'structural_checks':structural_checks,'program_crosscheck':program_crosscheck,'pap_control_checks':pap_checks}
    (BASE/'hb_json_usability_audit.json').write_text(json.dumps(output,indent=2)+'\n')
    lines=['# House JSON usability audit — FY2027 DPWH','',
        'All saved House datasets and related crosscheck/validation JSONs were inventoried. Originals were not modified.', '',
        '## Recommendation','',
        'Use native PDF summary controls for grand/program totals, `crosscheck_2027_pap_drilldown.json` for PAP controls after the page checks below, and `hb_dpwh_leaves_corrected_v4b.json` as the best existing candidate project table. No existing project table is complete or safe to sum as a certified budget.', '',
        '`hb_dpwh_leaves_corrected_v3.json` and `textlayer_audit_v3.json` are the amount-repair/provenance baseline. v4/v4b retain the same amounts; their improvements are attribution. The hierarchy and block tree retain pre-repair amounts and damaged heading controls.', '',
        '## Dataset comparison','',
        '| File | Rows | Total ₱B | Missing region | Exact native title+amount | Heading-only exact hits |',
        '|---|---:|---:|---:|---:|---:|']
    for m in metrics:lines.append(f"| {m['file']} | {m['rows']:,} | {m['total_php']/1e9:.6f} | {m['missing_region']:,} | {m['native_exact_title_amount']:,} | {m['native_heading_only']:,} |")
    lines += ['', 'Exact native presence does not establish completeness, uniqueness, correct attribution, or valid additive status. Office allocation rows can legitimately be budget units even when classified as headings.', '',
        '## Printed controls and coverage','',
        '- Volume I-B PDF page 9: new appropriations ₱654.102015B = PS ₱14.922297B + MOOE ₱24.685746B + CO ₱614.493972B.',
        '- Operations including local/FAP projects: ₱586.941661B. Current candidate leaves: ₱520.651663B; net coverage shortfall ₱66.289998B. This is a net reconciliation gap, not a quantified list of missing projects.',
        '- GAS and S2O combined: ₱67.160354B. Thus ₱586.941661B + ₱67.160354B = ₱654.102015B. Leaves plus MOOE is not a grand-total upper bound.',
        f"- Missing regions in v4b: {current['missing_region_by_zone']}. This contradicts the previous summary claim of zero region-less leaves; any filtered matcher counts must be distinguished from full-table coverage.",
        f"- v4b retains {len(current['retained_verified_rollups'])} rows tagged `pdf3:verified_rollup`, totaling ₱{sum(r['php'] for r in current['retained_verified_rollups'])/1e9:.6f}B. Review additive status; do not automatically delete all of them.", '',
        '## Program crosscheck — local operations excluding FAP','',
        '| Program | House printed ₱B | NEP source ₱B | House − NEP ₱B |',
        '|---|---:|---:|---:|']
    for p in program_crosscheck:lines.append(f"| {p['program']} | {p['house_local_control_php']/1e9:.6f} | {p['nep_non_fap_source_php']/1e9:.6f} | {p['delta_php']/1e9:+.6f} |")
    lines += ['', 'House local operations sum to ₱542.192650B versus NEP non-FAP operations ₱455.175063B: +₱87.017587B. House FAP ₱44.749011B versus NEP FAP ₱117.749011B: −₱73B. Operations therefore increase ₱14.017587B; GAS/S2O decline ₱2.527587B, giving the printed total increase of ₱11.49B.', '',
        '## PAP crosscheck','',
        '| PAP | House native control ₱B | NEP source control ₱B | v4b exact-label sum ₱B | Native heading agrees |',
        '|---|---:|---:|---:|---|']
    for p in pap_checks:
        nep=f"{p['nep_printed_control_php']/1e9:.6f}" if p['nep_printed_control_php'] is not None else 'unmapped'
        lines.append(f"| {p['pap']} | {p['drilldown_house_local_php']/1e9:.6f} | {nep} | {p['v4b_exact_label_php']/1e9:.6f} | {p['native_heading_agrees']} |")
    lines += ['', '## Known defects and downstream use','',
        '- All 42 saved PAP local controls agree with native PDF heading amounts on their referenced pages and map to audited NEP PAP controls. This checks printed controls, not completeness of project rows or all regional subtotals.',
        '- Secondary-road paving: PDF page 255 prints ₱21.992M; v4b retains that subtotal plus all three projects, totaling ₱43.984M. Confirmed double count.',
        '- Rainwater: PDF page 401 prints ₱1.0272B; the dedicated region/office crosscheck balances, but v4b captures only ₱99M under that label.',
        '- Preventive Maintenance Primary: PDF page 110 prints ₱14.395583B. The OCR hierarchy and v4b validation use ₱12.353654B, which is the following NCR subtotal. Their reported parser gap uses the wrong control.',
        '- `crosscheck_2027_lineitems.json` uses the incomplete v4b local table against the incomplete API, not the complete audited NEP source. Matches are candidates and unmatched rows are not established additions/deletions.',
        '- `nep_2027_hb_only_reassessment.json` improves source-presence review but covers only the old API-unmatched pool and is not a full House–NEP rematch.',
        '- `hb_dpwh_items.json`, `crosscheck_results.json`, and `crosscheck_summary.json` reflect older mixed-scope/raw extraction and should not supply current conclusions.',
        '- `crosscheck_2027_v4b_validation.json` is diagnostic only: stale OCR controls and parent/child scope mismatches make some gaps misleading.', '',
        '## Structural files','']
    for s in structural_checks:lines.append(f"- `{s['file']}`: {s['nodes']:,} nodes; statuses {s['statuses']}; {s['project_rows']:,} embedded projects, ₱{s['embedded_project_sum_php']/1e9:.6f}B. Original amounts agree: {s.get('same_original_row_amounts','not applicable — no embedded project rows')}.")
    lines += ['',
        '## Method limits',''] + ['- '+s for s in output['limitations']]
    (BASE/'hb_json_usability_audit.md').write_text('\n'.join(lines)+'\n')
    print(json.dumps({'inventory_files':len(inventory),'datasets':[{k:v for k,v in m.items() if k in ['file','rows','total_php','missing_region','native_exact_title_amount','native_heading_only','versus_original']} for m in metrics],
        'pap_native_control_agreements':sum(p['native_heading_agrees'] for p in pap_checks),'pap_checks':len(pap_checks)},indent=2))


if __name__ == '__main__':main()
