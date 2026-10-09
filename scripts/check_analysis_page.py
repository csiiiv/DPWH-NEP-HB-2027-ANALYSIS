#!/usr/bin/env python3
"""Check Analysis headlines, sharing and evidence links under a project prefix."""
from pathlib import Path
import sys,threading,tempfile,json
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
                office=page.get_by_role('region',name='Central Office vs DEOs',exact=True)
                expect(office).to_contain_text(f"{data['sources']['third']['offices']['Central Office']['records']:,}")
                expect(office).to_contain_text('No recorded office')
                expect(page.get_by_role('region',name='Records by program',exact=True)).to_contain_text('FAPs')
                assert not any('comparison_projects_2027.json' in url for url in requests)
                assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
                page.screenshot(path=f'/tmp/analysis-{width}.png')
                page.get_by_label('Analysis candidate group',exact=True).select_option('third_only')
                expect(page.get_by_role('region',name='Top insertion candidates',exact=True).locator('tbody tr')).to_have_count(5)
                page.reload(wait_until='networkidle')
                expect(page.get_by_label('Analysis candidate group',exact=True)).to_have_value('third_only')
                link=page.get_by_role('link',name='Review comparison',exact=True).first
                href=link.get_attribute('href');assert 'record=' in href and 'region_match=ignore' in href
                link.click()
                expect(page.get_by_role('region',name='Project tree paths',exact=True)).to_be_visible(timeout=60000)
                page.goto(base+'#analysis?source=nep&ranking=unresolved',wait_until='networkidle')
                expect(page.get_by_label('Analysis budget source',exact=True)).to_have_value('nep')
                expect(page.get_by_label('Analysis candidate group',exact=True)).to_have_value('unresolved')
                assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
                page.close()
            browser.close()
        assert not errors,errors
        print(json.dumps({'widths':[390,1440],'source_counts':True,'candidate_groups':True,'share_and_evidence_links':True,'overview_only':True,'errors':errors}))
    finally:server.shutdown()
