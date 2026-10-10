#!/usr/bin/env python3
"""Check Analysis subtabs, headlines, sharing and evidence links under a project prefix."""
from pathlib import Path
import sys,threading,tempfile,json,re
from functools import partial
from http.server import ThreadingHTTPServer
from playwright.sync_api import sync_playwright,expect
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))
from serve_pages import RangeHandler
class Quiet(RangeHandler):
    def log_message(self,*args):pass
with tempfile.TemporaryDirectory() as folder:
    Path(folder,'project').symlink_to(ROOT/'_site',target_is_directory=True)
    server=ThreadingHTTPServer(('127.0.0.1',0),partial(Quiet,directory=folder))
    threading.Thread(target=server.serve_forever,daemon=True).start()
    errors=[]
    data=json.loads((ROOT/'analysis/data/comparison_overview_2027.json').read_text())['headlines']
    base=f'http://127.0.0.1:{server.server_port}/project/app/'
    try:
        with sync_playwright() as p:
            browser=p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox'])
            for width in [390,1440]:
                page=browser.new_page(viewport={'width':width,'height':1000});page.on('pageerror',lambda e:errors.append(str(e)))
                requests=[];page.on('request',lambda r:requests.append(r.url))
                page.goto(base+'#analysis',wait_until='networkidle')
                expect(page.get_by_role('heading',name='Analysis',exact=True)).to_be_visible()
                expect(page.get_by_role('link',name='Analysis',exact=True)).to_have_attribute('aria-current','page')
                for tab in ['Overview','Insertions','Deletions','Adjustments','Chainage','Statistics']:
                    expect(page.get_by_role('tab',name=tab,exact=True)).to_be_visible()
                office=page.get_by_role('region',name='Central Office vs DEOs',exact=True)
                expect(office).to_contain_text(f"{data['sources']['third']['offices']['Central Office']['records']:,}")
                expect(office).to_contain_text('No recorded office')
                # Column sorting: click Category for ascending, again for
                # descending, again to clear back to the default order.
                office.get_by_role('button',name='Category',exact=True).click()
                expect(office.locator('tbody th').first).to_have_text('Central Office')
                expect(office.locator('thead th').first).to_have_attribute('aria-sort','ascending')
                office.get_by_role('button',name='Category',exact=True).click()
                expect(office.locator('tbody th').first).not_to_have_text('Central Office')
                expect(office.locator('thead th').first).to_have_attribute('aria-sort','descending')
                office.get_by_role('button',name='Category',exact=True).click()
                expect(office.locator('thead th').first).to_have_attribute('aria-sort','none')
                office.get_by_role('button',name='Allocation (PHP)',exact=True).click()
                expected_office=max(data['sources']['third']['offices'].items(),key=lambda item:item[1]['amount_php'])[0]
                expect(office.locator('tbody th').first).to_have_text(expected_office)
                descending=office.locator('tbody th').all_text_contents()
                office.get_by_role('button',name='Allocation (PHP)',exact=True).click()
                expect(office.locator('thead th').last).to_have_attribute('aria-sort','ascending')
                # Echo attribution gives every House record an office, so the
                # two residual buckets tie at PHP 0; the stable sort keeps tied
                # rows in input order in BOTH directions, so ascending is the
                # reverse of descending only outside the tied group.
                amounts={k:v['amount_php'] for k,v in data['sources']['third']['offices'].items()}
                descending_amounts=[amounts[name] for name in descending]
                ascending=office.locator('tbody th').all_text_contents()
                assert [amounts[name] for name in ascending]==list(reversed(descending_amounts))
                assert sorted(ascending)==sorted(descending)
                office.get_by_role('button',name='Allocation (PHP)',exact=True).click()
                expect(office.locator('thead th').last).to_have_attribute('aria-sort','none')
                expect(page.get_by_role('region',name='Records by program',exact=True)).to_contain_text('FAPs')
                compare=page.get_by_role('region',name='NEP to HGAB3 by Region',exact=True)
                expect(compare.locator('thead tr.band-row')).to_contain_text('Records')
                expect(compare.locator('thead tr.band-row')).to_contain_text('Allocations')
                expect(compare.get_by_role('columnheader',name='NEP records',exact=True)).to_be_visible()
                expect(compare.get_by_role('columnheader',name='HGAB3 records',exact=True)).to_be_visible()
                expect(compare.get_by_role('columnheader',name='Records change',exact=True)).to_be_visible()
                expect(compare.get_by_role('columnheader',name='% records change',exact=True)).to_be_visible()
                expect(compare.get_by_role('columnheader',name='NEP allocation',exact=True)).to_be_visible()
                expect(compare.get_by_role('columnheader',name='HGAB3 allocation',exact=True)).to_be_visible()
                expect(compare.get_by_role('columnheader',name='Allocation change',exact=True)).to_be_visible()
                expect(compare.get_by_role('columnheader',name='% allocation change',exact=True)).to_be_visible()
                expect(compare).to_contain_text('National Capital Region')
                # Grand totals live in the section blurb above the sortable table.
                overview=page.locator('section.analysis-section').filter(has=page.get_by_role('heading',name=re.compile(r'^NEP')))
                expect(overview).to_contain_text(f"{data['sources']['nep']['records']:,}")
                expect(overview).to_contain_text(f"{data['sources']['third']['records']:,}")
                dims=page.get_by_role('group',name='Break down by',exact=True)
                dims.get_by_role('button',name='Category',exact=True).click()
                expect(page.get_by_role('region',name='NEP to HGAB3 by Category',exact=True)).to_contain_text('FAPs')
                dims.get_by_role('button',name='Region',exact=True).click()
                # Overview must stay light: no lazy detail fetch on this view.
                assert not any('comparison_projects_2027.json' in url for url in requests),requests
                assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
                page.screenshot(path=f'/tmp/analysis-overview-{width}.png')
                # Insertions subtab: dimension chips, candidate groups, review links.
                page.get_by_role('tab',name='Insertions',exact=True).click()
                page.get_by_label('Analysis candidate group',exact=True).select_option('third_only')
                expect(page.get_by_role('region',name='Top insertion candidates',exact=True).locator('tbody tr')).to_have_count(5)
                page.get_by_role('button',name='PAP',exact=True).click()
                expect(page.get_by_role('region',name='Totals by PAP',exact=True)).to_contain_text('BIP')
                page.get_by_role('button',name='Region',exact=True).click()
                expect(page.get_by_role('region',name='Totals by region',exact=True)).to_contain_text('National Capital Region')
                page.get_by_role('region',name='Totals by region',exact=True).get_by_role('button',name=re.compile(r'^Show ')).first.click()
                dialog=page.get_by_role('dialog')
                expect(dialog.get_by_role('heading')).to_contain_text('National Capital Region',timeout=60000)
                expect(dialog.get_by_role('region',name='Group project records',exact=True).locator('tbody tr').first).to_be_visible()
                dialog.get_by_role('button',name='Close group records',exact=True).click()
                expect(dialog).to_have_count(0)
                expect(page.get_by_role('button',name='District office',exact=True)).to_be_visible()
                page.reload(wait_until='networkidle')
                expect(page.get_by_role('tab',name='Insertions',exact=True)).to_have_attribute('aria-selected','true')
                expect(page.get_by_label('Analysis candidate group',exact=True)).to_have_value('third_only')
                link=page.get_by_role('link',name='Review comparison',exact=True).first
                href=link.get_attribute('href');assert 'record=' in href and 'region_match=ignore' in href
                link.click()
                expect(page.get_by_role('region',name='Project tree paths',exact=True)).to_be_visible(timeout=60000)
                # Deletions subtab: NEP-only items split by replacement suggestion.
                page.goto(base+'#analysis?view=deletions',wait_until='networkidle')
                expect(page.get_by_label('Analysis deletion group',exact=True)).to_have_value('no_suggestion')
                del_groups=data['deletions']
                top=page.get_by_role('region',name='Top deletion candidates',exact=True)
                expect(top.locator('tbody tr')).to_have_count(100)
                expect(page.locator('.analysis-section .muted').first).to_contain_text(f"{del_groups['no_suggestion']['comparison_rows']:,} comparison rows")
                page.get_by_label('Analysis deletion group',exact=True).select_option('suggested')
                expect(page.locator('.analysis-section .muted').first).to_contain_text(f"{del_groups['suggested']['comparison_rows']:,} comparison rows")
                expect(page.get_by_role('columnheader',name=re.compile('Referring House rows'))).to_be_visible()
                page.get_by_role('button',name='Region',exact=True).click()
                by_region=page.get_by_role('region',name='Totals by region',exact=True)
                expect(by_region).to_contain_text('National Capital Region')
                by_region.get_by_role('button',name=re.compile(r'^Show ')).first.click()
                dialog=page.get_by_role('dialog')
                expect(dialog.get_by_role('heading')).to_be_visible(timeout=60000)
                expect(dialog.get_by_role('region',name='Group project records',exact=True).locator('tbody tr').first).to_be_visible()
                review=dialog.get_by_role('link',name='Open closest filtered view in Compare stages →',exact=True)
                href=review.get_attribute('href');assert 'flag=nep_only_suggested' in href and 'region_match=ignore' in href,(href,)
                dialog.get_by_role('button',name='Close group records',exact=True).click()
                expect(dialog).to_have_count(0)
                page.reload(wait_until='networkidle')
                expect(page.get_by_role('tab',name='Deletions',exact=True)).to_have_attribute('aria-selected','true')
                expect(page.get_by_label('Analysis deletion group',exact=True)).to_have_value('suggested')
                page.screenshot(path=f'/tmp/analysis-deletions-{width}.png')
                # Adjustments subtab: reading ledger plus cross-document differences (lazy detail).
                page.goto(base+'#analysis?view=adjustments',wait_until='networkidle')
                expect(page.get_by_role('region',name='Reading adjustments',exact=True).locator('tbody tr')).to_have_count(5)
                expect(page.get_by_role('region',name='Top House vs NEP differences',exact=True).locator('tbody tr').first).to_be_visible(timeout=60000)
                differences=page.get_by_role('region',name='Top House vs NEP differences',exact=True)
                expect(differences.get_by_role('columnheader',name='House − NEP',exact=True)).to_have_attribute('aria-sort','descending')
                expect(differences.get_by_role('columnheader',name='% change',exact=True)).to_be_visible()
                differences.get_by_role('button',name='House',exact=True).click()
                expect(differences.get_by_role('columnheader',name='House',exact=True)).to_have_attribute('aria-sort','descending')
                house_values=differences.locator('tbody tr td:first-of-type').evaluate_all("cells => cells.map(c => Number(c.querySelector('[title]').title.replace(/[^0-9.-]/g, '')))")
                assert house_values==sorted(house_values,reverse=True),house_values
                page.get_by_label('Revision direction',exact=True).select_option('reduced')
                expect(differences.get_by_role('columnheader',name='House − NEP',exact=True)).to_have_attribute('aria-sort','ascending')
                page.get_by_role('button',name='Region',exact=True).click()
                by_region=page.get_by_role('region',name='Differences by region',exact=True)
                expect(by_region.get_by_role('columnheader',name='Total increased',exact=True)).to_be_visible()
                expect(by_region.get_by_role('columnheader',name='Total decreased',exact=True)).to_be_visible()
                expect(by_region.get_by_role('columnheader',name='Total change',exact=True)).to_be_visible()
                by_region.get_by_role('button',name=re.compile(r'^Show ')).first.click()
                dialog=page.get_by_role('dialog')
                expect(dialog.get_by_role('heading')).to_be_visible(timeout=60000)
                expect(dialog.get_by_role('region',name='Group project records',exact=True).locator('tbody tr').first).to_be_visible()
                expect(dialog.get_by_role('link',name='Open closest filtered view in Compare stages →',exact=True)).to_be_visible()
                dialog.get_by_role('button',name='Close group records',exact=True).click()
                expect(dialog).to_have_count(0)
                assert any('comparison_projects_2027.json' in url for url in requests)
                page.screenshot(path=f'/tmp/analysis-adjustments-{width}.png')
                # Chainage subtab: compact NEP/HGAB columns, Δ columns, red flags, distribution bins.
                page.get_by_role('tab',name='Chainage',exact=True).click()
                expect(page.get_by_role('heading',name='Chainage amendments',exact=True)).to_be_visible(timeout=60000)
                chainage_region=page.get_by_role('region',name='Chainage amendments',exact=True)
                expect(chainage_region.get_by_role('columnheader',name='NEP',exact=True)).to_be_visible()
                expect(chainage_region.get_by_role('columnheader',name='HGAB',exact=True)).to_be_visible()
                expect(chainage_region.get_by_role('columnheader',name='Δ price/km',exact=True)).to_be_visible()
                expect(chainage_region.get_by_role('columnheader',name='Δ length',exact=True)).to_be_visible()
                expect(chainage_region.get_by_role('columnheader',name='Δ amount',exact=True)).to_be_visible()
                expect(chainage_region).to_contain_text('km')
                # Hero red-flag card and 25-point distribution bins carry allocations.
                expect(page.get_by_role('heading',name='Price/km red flags',exact=True)).to_be_visible()
                expect(page.locator('h3').filter(has_text='price/km distribution')).to_be_visible()
                distribution=page.get_by_role('region',name='Price per km change bins',exact=True)
                expect(distribution.get_by_role('columnheader',name='Records',exact=True)).to_be_visible()
                expect(distribution.get_by_role('columnheader',name='NEP allocation',exact=True)).to_be_visible()
                expect(distribution.get_by_role('columnheader',name='HGAB allocation',exact=True)).to_be_visible()
                expect(distribution.locator('tbody tr')).to_have_count(9)
                expect(distribution).to_contain_text('200%+')
                expect(page.get_by_label('Chainage focus',exact=True)).to_be_visible()
                page.get_by_label('Chainage focus',exact=True).select_option('review')
                page.screenshot(path=f'/tmp/analysis-chainage-{width}.png')
                page.get_by_label('Chainage focus',exact=True).select_option('all')
                # Statistics subtab: descriptive lenses render from the same lazy payload.
                page.get_by_role('tab',name='Statistics',exact=True).click()
                expect(page.get_by_role('heading',name='Benford first-digit',exact=True)).to_be_visible(timeout=60000)
                expect(page.get_by_role('heading',name='Rounding pattern',exact=True)).to_be_visible()
                expect(page.get_by_role('region',name='Rounding pattern',exact=True)).to_contain_text('₱1.000M')
                exact=page.get_by_role('region',name='Exact repeated amounts',exact=True)
                expect(exact.locator('thead th').nth(3)).to_contain_text('Total allocation')
                expect(exact.locator('tbody tr').first.locator('td').nth(2)).to_be_visible()
                assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
                page.screenshot(path=f'/tmp/analysis-statistics-{width}.png')
                # Deep-link state restore on a non-default source.
                page.goto(base+'#analysis?source=nep&view=insertions&ranking=unresolved',wait_until='networkidle')
                expect(page.get_by_label('Analysis budget source',exact=True)).to_have_value('nep')
                expect(page.get_by_label('Analysis candidate group',exact=True)).to_have_value('unresolved')
                assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
                page.close()
            browser.close()
        assert not errors,errors
        print(json.dumps({'widths':[390,1440],'subtabs':['overview','insertions','deletions','adjustments','chainage','statistics'],'source_counts':True,'candidate_groups':True,'deletion_groups':True,'share_and_evidence_links':True,'lazy_detail':True,'chainage':True,'statistics':True,'errors':errors}))
    finally:server.shutdown()
