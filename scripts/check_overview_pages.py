#!/usr/bin/env python3
"""Check the default Overview, accounting exports, links and recovery on project hosting."""
import csv
from functools import partial
from http.server import ThreadingHTTPServer
from io import StringIO
import json
import os
from pathlib import Path
import re
import tempfile
import threading

from playwright.sync_api import expect, sync_playwright
from serve_pages import RangeHandler, check_widths

ROOT = Path(__file__).resolve().parents[1]


class Quiet(RangeHandler):
    def log_message(self, *args):
        pass


def main():
    data = json.loads((ROOT / '_site/analysis/main_overview_2027.json').read_text())
    screenshots = Path('/tmp/overview-ui-verification'); screenshots.mkdir(exist_ok=True)
    errors, bad = [], []
    with tempfile.TemporaryDirectory() as directory:
        prefix = 'budget-workbenches'
        Path(directory, prefix).symlink_to(ROOT / '_site', target_is_directory=True)
        server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Quiet, directory=directory))
        threading.Thread(target=server.serve_forever, daemon=True).start()
        root = f'http://127.0.0.1:{server.server_port}/{prefix}/'
        base = root + 'app/'
        try:
            with sync_playwright() as p:
                browser = p.chromium.launch(headless=True, executable_path=os.environ.get('CHROME_BIN', '/usr/bin/google-chrome'), args=['--no-sandbox'])
                for width in check_widths():
                    page = browser.new_page(viewport={'width': width, 'height': 1000}, accept_downloads=True)
                    requests = []
                    page.on('pageerror', lambda e: errors.append(str(e)))
                    page.on('response', lambda r: bad.append((r.url,r.status)) if r.status >= 400 else None)
                    page.on('request', lambda r: requests.append(r.url))
                    page.goto(root + '?preview=overview', wait_until='networkidle')
                    assert '/app/?preview=overview#overview' in page.url
                    expect(page.get_by_role('heading', name='Budget allocation overview', exact=True)).to_be_visible()
                    nav = page.get_by_role('navigation', name='Workbench workspaces')
                    assert nav.locator('a').all_text_contents() == ['Overview','DPWH','DA Farm-to-Market Roads','DOH Health Facilities','NIA Irrigation','Geolocation']
                    expect(nav.get_by_role('link',name='Overview',exact=True)).to_have_attribute('aria-current','page')
                    expect(page.get_by_role('navigation',name='Workbench pages')).to_have_count(0)
                    expect(page.locator('.overview-workspace-card')).to_have_count(4)
                    assert not any(name in url for url in requests for name in ['comparison_projects_2027.json','fmr_workbench.json','hfep_workbench.json','nia_workbench.json','gps_workbench.json','pdf.worker'])
                    assert not page.evaluate('document.documentElement.scrollWidth > innerWidth')
                    # click + explicit wait rather than .check(): the checkbox is
                    # React-controlled and its checked prop is derived from the
                    # URL hash, so on a slow runner Playwright's built-in
                    # post-click state verification can race the hashchange
                    # re-render ("Clicking the checkbox did not change its
                    # state") even though the navigation succeeded.
                    page.get_by_label('Show exact pesos',exact=True).click()
                    expect(page).to_have_url(re.compile(r'exact=1'))
                    expect(page.get_by_label('Show exact pesos',exact=True)).to_be_checked()
                    for w in data['workspaces']:
                        card = page.get_by_role('article',name=w['label']+' →',exact=True)
                        expect(card).to_contain_text(f"{w['insertions']['count']:,} {w['count_unit']}")
                        expect(card).to_contain_text(f"₱{w['insertions']['amount_php']:,}")
                        expect(card).to_contain_text(f"₱{w['deletions']['amount_php']:,}")
                        expect(card).to_contain_text(f"{w['adjustments']['count']:,} {w['adjustments']['count_unit']}")
                        for key,label in [('insertions','insertion candidates'),('deletions','deletion candidates')]:
                            expect(card.get_by_role('link',name=w['label']+' '+label,exact=True)).to_have_attribute('href',w['links'][key])
                    hfep = page.get_by_role('article',name='DOH Health Facilities →',exact=True)
                    hfep.locator('summary').click()
                    expect(hfep).to_contain_text('₱140,000')
                    expect(hfep).to_contain_text('House minus NEP')
                    with page.expect_download() as result:
                        page.get_by_role('button',name='Export overview CSV',exact=True).click()
                    exported = list(csv.DictReader(StringIO(Path(result.value.path()).read_text(encoding='utf-8-sig'))))
                    assert len(exported)==4
                    for r,w in zip(exported,data['workspaces']):
                        assert int(r['insertion_records'])==w['insertions']['count']
                        assert int(r['insertion_house_php'])==w['insertions']['amount_php']
                        assert int(r['gross_reduction_php'])==w['adjustments']['reduced_php']
                        assert int(r['house_minus_nep_ledger_php'])==w['delta_php']
                    table = page.get_by_role('region',name='Overview source funding snapshot',exact=True)
                    table.get_by_role('button',name='House − NEP (PHP)',exact=True).click()
                    assert 'sort=delta_php' in page.url
                    page.reload(wait_until='networkidle')
                    expect(page.get_by_label('Show exact pesos',exact=True)).to_be_checked()
                    expect(table.locator('th[aria-sort="ascending"],th[aria-sort="descending"]')).to_have_count(1)
                    page.screenshot(path=str(screenshots / f'overview-{width}.png'),full_page=True)
                    # Summary destinations restore the matching populations and
                    # preserve the new global entry alongside workspace pages.
                    page.get_by_role('link',name='NIA Irrigation insertion candidates',exact=True).click()
                    expect(page.get_by_role('navigation',name='NIA project candidates pages')).to_contain_text('319 rows')
                    nav.get_by_role('link',name='Overview',exact=True).click()
                    expect(page.get_by_role('heading',name='Budget allocation overview',exact=True)).to_be_visible()
                    page.go_back(wait_until='networkidle')
                    expect(page.get_by_role('link',name='Insertions',exact=True)).to_have_attribute('aria-current','page')
                    page.goto(base+'#overview',wait_until='networkidle')
                    page.get_by_role('link',name='DOH Health Facilities deletion candidates',exact=True).click()
                    expect(page.locator('.fmr-stats')).to_contain_text('163')
                    page.goto(base+'#overview',wait_until='networkidle')
                    page.get_by_role('link',name='DPWH insertion candidates',exact=True).click()
                    expect(page.get_by_label('Review flags',exact=True)).to_have_value('house_only')
                    assert 'region_match=ignore' in page.url
                    page.goto(base+'#overview',wait_until='networkidle')
                    nav.get_by_role('link',name='DPWH',exact=True).click()
                    assert page.url.endswith('#home')
                    expect(page.get_by_role('heading',name='Budget stage workbench',exact=True)).to_be_visible()
                    page.goto(base+'#nia/analysis?view=overview',wait_until='networkidle')
                    expect(page.get_by_role('heading',name='NIA allocation analysis',exact=True)).to_be_visible()
                    page.goto(base+'#overview/unknown',wait_until='networkidle')
                    expect(page.get_by_role('heading',name='Unknown Overview view',exact=True)).to_be_visible()
                    page.get_by_role('link',name='Open Overview',exact=True).click()
                    expect(page.get_by_role('heading',name='Budget allocation overview',exact=True)).to_be_visible()
                    # Schema/recovery check uses a synthetic success response;
                    # it should report the invalid summary without a pageerror.
                    page.route('**/main_overview_2027.json',lambda r:r.fulfill(json={'schema_version':99}))
                    page.reload(wait_until='networkidle')
                    expect(page.get_by_role('alert')).to_contain_text('Unsupported Overview summary')
                    page.unroute('**/main_overview_2027.json')
                    page.get_by_role('button',name='Retry summary',exact=True).click()
                    expect(page.locator('.overview-workspace-card')).to_have_count(4)
                    page.close()
                    print(f'{width}px: Overview routing, summaries, export and recovery pass',flush=True)
                browser.close()
            assert not errors, errors
            assert not bad, bad
        finally:
            server.shutdown()
    print('Overview browser checks passed')


if __name__=='__main__':
    main()
