"""Repair confirmed HB defects from native PDF rows, preserving v4b and audit history.

Only replace source sections whose extracted allocations balance printed controls.
Do not fill remaining deficits with invented residual projects.
"""
import collections
import copy
import hashlib
import json
import re
from pathlib import Path

import pymupdf
import audit_textlayer_v2 as native
from crosscheck_lineitems import reg

BASE = Path(__file__).resolve().parent
ROOT = BASE.parent
PDF = ROOT / 'HB_BUDGET/3 - HB 10858 VOL IC.pdf'


def read(name):
    return json.loads((BASE/name).read_text())


def main():
    old = read('hb_dpwh_leaves_corrected_v4b.json')['leaves']
    audit = {r['md_row']: r for r in read('textlayer_audit_v3.json')['results']}
    doc = pymupdf.open(PDF)
    rows = []
    for page in doc:
        for index, r in enumerate(native.extract_page_rows(page)):
            r.update(pdf_page=page.number+1, source_id=f'pdf:p{page.number+1}:r{index}')
            rows.append(r)
    doc.close()
    edits=[]; removed=[]; added=[]; replacement_ranges=[]
    serial = -1

    def leaf(r, pap, program, region, office='', zone='pap', kind='project'):
        nonlocal serial
        result = {'row':serial,'source_id':r['source_id'], 'pdf_page':r['pdf_page'],
            'source_label':r['label'], 'source_y':r['y'], 'project':r['label'],
            'amount_php':r['amounts'][0],'pap':pap,'program':program,'sub_program':'',
            'org_outcome':'','region':reg(region),'office':office,'zone':zone,
            'allocation_kind':kind,'validation':'native:section_control_balanced'}
        serial -= 1
        return result

    def block(title, end=None):
        start=next(i for i,r in enumerate(rows) if native.nospace(r['label'])==native.nospace(title) and r['bold'])
        if end:
            stop=next(i for i in range(start+1,len(rows)) if native.nospace(rows[i]['label'])==native.nospace(end) and rows[i]['bold'])
        else:
            stop=next(i for i in range(start+1,len(rows)) if rows[i]['bold']
                and not region_row(rows[i]['label']) and not office_row(rows[i]['label']))
        return rows[start],rows[start+1:stop]

    def region_row(label):
        return bool(native.REGION_RX.match(label) or label in ['BARMM','Nationwide'])

    def office_row(label):
        return bool(native.OFFICE_RX.search(label) or re.fullmatch(
            r'(?:NCR|CAR|NIR) Regional Office|Regional Office (?:[IVX]+(?:-A)?|MIMAROPA Region)',label))

    def projects(title, program, end=None):
        head, body = block(title,end)
        output=[]; region=''; office=''
        for r in body:
            label=r['label']
            if region_row(label):region=label;office='';continue
            # Construction titles ending in "Office" are actual project rows.
            if office_row(label) and not re.match(r'Construction|Rehabilitation|Improvement',label):
                office=label;continue
            if r['bold']:continue
            output.append(leaf(r,title,program,region,office))
        assert sum(r['amount_php'] for r in output)==head['amounts'][0], (title,len(output),sum(r['amount_php'] for r in output),head['amounts'][0])
        return output

    def replace(start, stop, new, reason):
        replacement_ranges.append((start,stop))
        added.extend(new)
        prior=[r for r in old if start<=r['row']<stop]
        edits.append({'action':'replace_section','old_row_start':start,'old_row_stop_exclusive':stop,
            'old_rows':len(prior),'old_php':sum(r['amount_php'] for r in prior),
            'new_rows':len(new),'new_php':sum(r['amount_php'] for r in new),
            'pdf_pages':sorted({r['pdf_page'] for r in new}),'reason':reason})

    # Exact OCR hierarchy boundaries, checked against source headings and native controls.
    app='Asset Preservation Program'; conv='Convergence and Special Support Program'
    maintenance=[]
    for title in ['Preventive Maintenance - Primary Roads','Preventive Maintenance - Secondary Roads','Preventive Maintenance - Tertiary Roads']:
        maintenance.extend(projects(title,app))
    assert sum(r['amount_php'] for r in maintenance)==36094823000
    replace(2450,3333,maintenance,'Re-extract all three maintenance PAPs; native controls and family sum agree exactly.')
    paving=[]
    for title in ['Paving of Unpaved Roads - Primary Roads','Paving of Unpaved Roads - Secondary Roads','Paving of Unpaved Roads - Tertiary Roads']:
        paving.extend(projects(title,app))
    assert sum(r['amount_php'] for r in paving)==596021000
    replace(5789,5830,paving,'Keep underlying paving projects once; exclude family/PAP subtotals.')
    # Office-only rainwater allocations must be emitted even though offices normally contain projects.
    title='Rainwater Collector System'
    head, body=block(title,'Rehabilitation of Disaster-Related Infrastructure and Other Facilities')
    rain=[];region=''
    for r in body:
        label=r['label']
        if region_row(label):
            region=label
            if label=='BARMM':rain.append(leaf(r,title,conv,region,kind='region_allocation'))
        elif office_row(label) and label!='Central Office':
            rain.append(leaf(r,title,conv,region,label,kind='office_allocation'))
    assert len(rain)==217 and sum(r['amount_php'] for r in rain)==head['amounts'][0]==1027200000
    septage=projects('Septage and Sewerage',conv)
    replace(9347,9587,septage+rain,'Restore 217 terminal rainwater allocations and correctly attribute Septage.')
    facilities=[]
    for title,end in [('Facilities for Persons with Disabilities (PWD)','Facilities for Elderlies/ Senior Citizen'),
        ('Facilities for Elderlies/ Senior Citizen','Gender-Responsive Facilities'),
        ('Gender-Responsive Facilities','Basic Infrastructure Program (BIP)')]:
        head,body=block(title,end)
        allocations=[leaf(r,title,conv,r['label'],kind='region_allocation') for r in body
            if region_row(r['label']) and r['amounts'][0]!=head['amounts'][0]]
        assert len(allocations)==17 and sum(r['amount_php'] for r in allocations)==head['amounts'][0]
        facilities.extend(allocations)
    replace(9592,9654,facilities,'Replace regional-facility rollups with all 51 printed regional allocations.')
    # Rebuild the local-project section, including construction rows named after offices.
    local=projects('National Building Program','Local Program','FOREIGN-ASSISTED PROJECTS')
    for r in local:r['pap']='Buildings And Other Structures'
    assert sum(r['amount_php'] for r in local)==12875943000
    ppp=next(r for r in rows if r['pdf_page']==927 and r['amounts'][0]==1000000000 and r['label'].startswith('Tarlac-Pangasinan'))
    local.append(leaf(ppp,'Public-Private Partnership Strategic Support Fund (including ROW, Subsidy, and Variations)',
        'Local Program','NCR','Central Office',kind='multi_project_allocation'))
    replace(20703,21003,local,'Local projects are not FAP: drop repeated PPP controls, retain the one printed allocation and all building projects.')
    # FAP projects and their financing are additive at different levels. Store financing as metadata.
    fap=[];current=None;program='';pap=''
    for r in rows:
        if r['pdf_page']<939:continue
        label=re.sub(r'^Loan Proceeds\s*-?\s*','',r['label'])
        if r['bold']:
            match=re.match(r'^[a-c]\. (Asset Preservation Program|Network Development Program|Bridge Program|Flood Management Program)$',label)
            if match:program=match.group(1)
            if 'NATIONAL BUILDING PROGRAM' in label:program='Local Program'
            if re.match(r'^[1-3]\. ',label):pap=re.sub(r'^[1-3]\. ','',label)
            continue
        if re.match(r'^[a-k1]\.\s',label):
            # The second APP subtype is a wrapped bold heading whose label is displaced by the PDF text layer.
            if 'Reconstruction and Development Plan for Greater Marawi' in label:pap='Rehabilitation/ Reconstruction/ Upgrading of Damaged Paved Roads - Tertiary Roads'
            if program=='Flood Management Program':pap='Construction/ Rehabilitation of Flood Mitigation Facilities within Major River Basins and Principal Rivers'
            if program=='Local Program':pap='Buildings And Other Structures'
            current=leaf(r,pap,program,'NCR','Central Office',zone='fap')
            current['project']=re.sub(r'^[a-k1]\.\s','',label)
            current['funding_php']={'GOP':0,'Loan Proceeds':0}
            fap.append(current)
        elif current and r['label'] in ['GOP','Loan Proceeds']:
            current['funding_php'][r['label']]=r['amounts'][0]
    assert len(fap)==29 and sum(r['amount_php'] for r in fap)==44749011000
    assert all(sum(r['funding_php'].values())==r['amount_php'] for r in fap)
    assert sum(r['funding_php']['GOP'] for r in fap)==25190650000
    assert sum(r['funding_php']['Loan Proceeds'] for r in fap)==19558361000
    replace(21003,21061,fap,'Rebuild the true FAP section: 29 projects, control and every funding split balanced.')
    result=[]
    for original in old:
        if any(start<=original['row']<stop for start,stop in replacement_ranges):
            removed.append({'leaf':original,'reason':'source-section replacement'});continue
        if original['amount_php']==0:
            removed.append({'leaf':original,'reason':'zero-amount fragment; retained here as evidence'});continue
        if original['row'] in [4681,20659]:
            removed.append({'leaf':original,'reason':'confirmed region/PAP subtotal, not an additive project'});continue
        r=copy.deepcopy(original)
        r['region']=reg(r.get('region'))
        rec=audit.get(r['row'],{})
        if rec.get('page'):r['pdf_page']=rec['page']
        # Existing amount verification does not establish source attribution.
        r['provenance_status']='inherited_v4b; PAP boundary attribution remains provisional'
        if r.get('validation')=='pdf3:verified_rollup':
            r['validation']='native:printed_project_retained'
            edits.append({'action':'retain_project','row':r['row'],'reason':'This verified-rollup flag labels an actual construction project, not necessarily a subtotal.'})
        result.append(r)
    result.extend(added)
    assert len({r['row'] for r in result})==len(result)
    assert all(r['amount_php']>0 for r in result)
    totals=collections.Counter();counts=collections.Counter();pap_totals=collections.Counter()
    for r in result:totals[r['zone']]+=r['amount_php'];counts[r['zone']]+=1;pap_totals[(r['zone'],r['pap'])]+=r['amount_php']
    assert counts['fap']==29 and totals['fap']==44749011000
    assert sum(r['amount_php'] for r in result if r['program']=='Local Program' and r['zone']=='pap')==13875943000
    controls=[]
    for p in read('hb_json_usability_audit.json')['pap_control_checks']:
        controls.append({'pap':p['pap'],'printed_php':p['drilldown_house_local_php'],
            'v5_leaves_php':pap_totals[('pap',p['pap'])],
            'difference_php':pap_totals[('pap',p['pap'])]-p['drilldown_house_local_php'],
            'source_pages':sorted({h['page'] for h in p['pdf_heading_hits']}),
            'nep_source_php':p['nep_printed_control_php']})
    total=sum(totals.values())
    summary={'old_rows':len(old),'new_rows':len(result),'old_php':sum(r['amount_php'] for r in old),
        'new_php':total,'delta_php':total-sum(r['amount_php'] for r in old),'zones_php':dict(totals),
        'zones_rows':dict(counts),'missing_regions':sum(not r['region'] for r in result),
        'operations_printed_php':586941661000,'operations_net_shortfall_php':586941661000-total,
        'replaced_sections':len(replacement_ranges),'native_added_rows':len(added),
        'removed_old_rows':len(removed),'balanced_pap_controls':sum(p['difference_php']==0 for p in controls)}
    provenance={'base':'hb_dpwh_leaves_corrected_v4b.json','source_pdf':str(PDF.relative_to(ROOT)),
        'source_pdf_sha256':hashlib.sha256(PDF.read_bytes()).hexdigest(),
        'method':'Targeted source-native section replacements, each gated by exact printed-control agreement',
        'limitations':['Remaining inherited project amounts and PAP boundaries are not fully re-extracted.',
            'A balanced total alone does not establish every title or regional attribution is correct.',
            'Do not treat unmatched rows as confirmed House insertions or removals.',
            'Personnel services and GAS/S2O are outside the project table.']}
    (BASE/'hb_dpwh_leaves_corrected_v5.json').write_text(json.dumps({'provenance':provenance,'summary':summary,'leaves':result},indent=2)+'\n')
    (BASE/'hb_known_defect_repairs.json').write_text(json.dumps({'summary':summary,'repairs':edits,
        'removed_rows':removed,'pap_controls':controls,'limitations':provenance['limitations']},indent=2)+'\n')
    lines=['# House known-defect repairs — v5','', 'Original v4b and historical artifacts are preserved. v5 is a repaired candidate, not a complete certified budget.', '',
        '## Results','']+[f'- {k}: {v}' for k,v in summary.items()]+['', '## Source-verified repairs','']
    for e in edits:
        if e['action']=='replace_section':lines.append(f"- {e['reason']} PDF pages {e['pdf_pages']}; {e['old_rows']} → {e['new_rows']} rows; ₱{e['old_php']/1e9:.6f}B → ₱{e['new_php']/1e9:.6f}B.")
    lines += ['', '## PAP control crosscheck','', '| PAP | Printed ₱B | v5 ₱B | v5 − printed ₱B |','|---|---:|---:|---:|']
    for p in controls:lines.append(f"| {p['pap']} | {p['printed_php']/1e9:.6f} | {p['v5_leaves_php']/1e9:.6f} | {p['difference_php']/1e9:+.6f} |")
    lines += ['', '## Remaining work','', '- The overall operations residual is explicitly retained; no invented balancing projects were added.',
        '- Unrepaired PAP boundary attribution, missing project rows, and possible subtotal contamination still require source-section reconstruction.',
        '- Earlier API matching and historical dashboards remain version-specific. Use this source-control crosscheck to assess v5; no earlier matcher claims were relabeled as verified.',
        '- The prior House grand upper-bound claim is invalid. Volume I-B prints ₱654.102015B, comprising ₱586.941661B operations and ₱67.160354B GAS/S2O across expense classes.']
    (BASE/'hb_known_defect_repairs.md').write_text('\n'.join(lines)+'\n')
    print(json.dumps(summary,indent=2))


if __name__=='__main__':main()
