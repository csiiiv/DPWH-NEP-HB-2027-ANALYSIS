#!/usr/bin/env python3
"""Verify the four-source flow explorer and all recorded intermediary choices."""
from functools import partial
from http.server import ThreadingHTTPServer
from pathlib import Path
import json
import os
import struct
import tempfile
import threading
import xml.etree.ElementTree as ET
from playwright.sync_api import expect, sync_playwright
from serve_pages import RangeHandler

ROOT = Path(__file__).resolve().parents[1]

class Quiet(RangeHandler):
    def log_message(self, *args):
        pass

def main():
    sources = json.loads((ROOT/'analysis/data/budget_flow_sources_2027.json').read_text())['sources']
    screenshots = Path('/tmp/budget-flow-ui-verification')
    screenshots.mkdir(exist_ok=True)
    errors, bad = [], []
    with tempfile.TemporaryDirectory() as directory:
        Path(directory, 'sources').symlink_to(ROOT/'_site', target_is_directory=True)
        server = ThreadingHTTPServer(('127.0.0.1',0),partial(Quiet,directory=directory))
        threading.Thread(target=server.serve_forever,daemon=True).start()
        try:
            with sync_playwright() as p:
                browser = p.chromium.launch(headless=True,executable_path=os.environ.get('CHROME_BIN','/usr/bin/google-chrome'),args=['--no-sandbox'])
                for width in (390,1440):
                    context = browser.new_context(viewport={'width':width,'height':1000},accept_downloads=True)
                    page = context.new_page()
                    page.on('pageerror',lambda e: errors.append(str(e)))
                    page.on('response',lambda r: bad.append((r.url,r.status)) if r.status >=400 else None)
                    requests=[]
                    page.on('request',lambda r: requests.append(r.url))
                    page.goto(f'http://127.0.0.1:{server.server_port}/sources/app/#experiments?tab=budget',wait_until='domcontentloaded')
                    expect(page.get_by_label('Dataset source',exact=True)).to_have_value('dpwh')
                    expect(page.get_by_label('Intermediary source',exact=True)).to_have_value('category')
                    expect(page.get_by_label('Dataset source',exact=True).locator('option')).to_have_count(4)
                    for source in sources:
                        key=source['dataset']['key']
                        page.get_by_label('Dataset source',exact=True).select_option(key)
                        expect(page.locator('#experiments-budget-heading')).to_have_text(f"{source['dataset']['label']} · five-stage budget flow")
                        expect(page.get_by_label('Intermediary source',exact=True)).to_have_value(source['dataset']['defaultGrouping'])
                        assert page.get_by_label('Intermediary source',exact=True).locator('option').count() == len(source['groupings'])
                        totals=source['stages']
                        for grouping in source['groupings']:
                            page.get_by_label('Intermediary source',exact=True).select_option(grouping)
                            svg=page.locator('.revision-flow-scroll svg')
                            expect(svg).to_be_visible()
                            expected_rows=min(4,len(source['groupings'][grouping]['groups']))
                            expect(page.locator('.bf-group-row')).to_have_count(expected_rows)
                            assert abs(svg.locator('rect[data-stage="A"]').evaluate('el => Number(el.getAttribute("height"))/Number(el.closest("svg").dataset.scale)') - totals['nep']['amount_php']) < .01
                            actual_after=svg.locator('rect[data-stage="E"]').evaluate('el => Number(el.getAttribute("height"))/Number(el.closest("svg").dataset.scale)')
                            assert abs(actual_after-totals['third']['amount_php']) < .01
                            metadata=json.loads(svg.locator('metadata').text_content())
                            assert metadata['dataset']['key']==key and metadata['grouping']['key']==grouping
                            assert metadata['dataset']['count_unit']==source['dataset']['count_unit']
                            assert not page.evaluate('document.documentElement.scrollWidth > innerWidth')
                            # Nodes, bands, and long PAP/facility labels fit the exported figure.
                            assert svg.evaluate('''svg => {
                              const v=svg.viewBox.baseVal;
                              return [...svg.querySelectorAll('path,rect,text')].every(el=>{
                                const r=el.getBBox();return r.x>=-1 && r.y>=-1 && r.x+r.width<=v.width+1 && r.y+r.height<=v.height+1;
                              });
                            }'''), f'{key}/{grouping} SVG clipping'
                        page.reload(wait_until='domcontentloaded')
                        expect(page.get_by_label('Dataset source',exact=True)).to_have_value(key)
                        expect(page.get_by_label('Intermediary source',exact=True)).to_have_value(list(source['groupings'])[-1])
                        page.screenshot(path=str(screenshots/f'flow-source-{key}-{width}.png'),full_page=True)
                        # Choose a cell; source/grouping changes must clear its identity.
                        cell=page.locator('.bf-cell').first
                        cell.focus(); page.keyboard.press('Enter')
                        expect(page.locator('.budget-flow-detail')).to_contain_text(source['dataset']['count_unit'])
                    # New source selection clears a NIA-specific focus and revision.
                    page.get_by_label('Dataset source',exact=True).select_option('hfep')
                    expect(page.get_by_label('Focus facility category',exact=True)).to_have_value('')
                    assert 'group=' not in page.evaluate('location.hash') and 'revision=' not in page.evaluate('location.hash')
                    page.get_by_label('Intermediary source',exact=True).select_option('column')
                    expect(page.locator('.bf-group-row')).to_have_count(3)
                    with page.expect_download() as result:
                        page.get_by_role('button',name='Download SVG',exact=True).click()
                    exported=ET.fromstring(Path(result.value.path()).read_text())
                    metadata=json.loads(exported.find('{http://www.w3.org/2000/svg}metadata').text)
                    assert metadata['dataset']['key']=='hfep' and metadata['grouping']['key']=='column'
                    assert metadata['dataset']['count_unit']=='funding-column records'
                    assert 'DOH Health Facilities' in ''.join(exported.itertext())
                    assert result.value.suggested_filename=='hfep-2027-column-budget-flow.svg'
                    with page.expect_download(timeout=60000) as result:
                        page.get_by_role('button',name='Download section PNG',exact=True).click()
                    png=Path(result.value.path()).read_bytes()
                    assert png[:8]==b'\x89PNG\r\n\x1a\n'
                    w,h=struct.unpack('>II',png[16:24]); assert w==3072 and h>1500
                    assert result.value.suggested_filename=='hfep-2027-column-budget-flow-section.png'
                    Path(screenshots/f'flow-source-hfep-section-{width}.png').write_bytes(png)
                    # Summaries are sufficient to operate all choices, without large workbench loads.
                    assert not any(any(name in url for name in ['comparison_projects_2027.json','fmr_workbench.json','hfep_workbench.json','nia_workbench.json','dpwh_flow_2027.json']) for url in requests)
                    # Invalid combinations recover to supported defaults.
                    page.evaluate("location.hash='experiments?tab=budget&dataset=fmr&intermediary=pap'")
                    expect(page.get_by_label('Dataset source',exact=True)).to_have_value('fmr')
                    expect(page.get_by_label('Intermediary source',exact=True)).to_have_value('region')
                    context.close()
                browser.close()
        finally:
            server.shutdown()
    assert not errors,errors
    assert not bad,bad
    print('Flow source checks passed: four datasets, twelve groupings, desktop/mobile, deep links and exports.')

if __name__=='__main__':
    main()
