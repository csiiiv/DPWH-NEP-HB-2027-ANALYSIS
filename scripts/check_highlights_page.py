#!/usr/bin/env python3
"""Check Highlights tables, evidence navigation and sharing on desktop/mobile."""
import json
import re
import sys
import tempfile
import threading
from functools import partial
from http.server import ThreadingHTTPServer
from pathlib import Path

from playwright.sync_api import expect, sync_playwright
from serve_pages import RangeHandler

ROOT = Path(__file__).resolve().parents[1]


class Quiet(RangeHandler):
    def log_message(self, *args):
        pass


def check(base):
    data = json.loads((ROOT / 'analysis/data/comparison_overview_2027.json').read_text())['highlights']
    errors = []
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        for width in [390, 1440]:
            page = browser.new_page(viewport={'width': width, 'height': 1000})
            page.on('pageerror', lambda e: errors.append(str(e)))
            requests = []
            page.on('request', lambda r: requests.append(r.url))
            page.goto(base + '#highlights', wait_until='networkidle')
            expect(page.get_by_role('heading', name='Highlights', exact=True)).to_be_visible()
            expect(page.get_by_role('link', name='Highlights', exact=True)).to_have_attribute('aria-current', 'page')
            coverage = page.get_by_role('region', name='Budget coverage table', exact=True)
            changes = page.get_by_role('region', name='HGAB 3rd versus NEP candidate changes', exact=True)
            expect(coverage.locator('tbody tr')).to_have_count(5)
            expect(changes.locator('tbody tr')).to_have_count(5)
            for side in ['nep', 'second', 'third']:
                expect(coverage.locator('tbody tr').first).to_contain_text(f"{data['sources'][side]['records']:,} allocation records")
            for index, key in enumerate(['insertions', 'deletions', 'increased', 'decreased']):
                expect(changes.locator('tbody tr').first.locator('td').nth(index)).to_contain_text(f"{data['changes'][key]['records']:,} allocation records")
            expect(coverage.locator('.highlights-unavailable')).to_have_count(9)
            expect(changes.locator('.highlights-unavailable')).to_have_count(15)
            expect(page.locator('.highlights-stories > li')).to_have_count(10)
            expect(page.get_by_text('Total · DPWH coverage only', exact=True)).to_have_count(2)
            assert not any('comparison_projects_2027.json' in url for url in requests)
            assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth'), 'Page overflows viewport'
            assert coverage.evaluate('(el) => el.scrollWidth > el.clientWidth') == (width == 390)
            assert page.locator('.highlights-stories').evaluate('(el) => getComputedStyle(el).display') == 'grid'
            assert len(page.locator('.highlights-stories').evaluate('(el) => getComputedStyle(el).gridTemplateColumns').split()) == (1 if width == 390 else 2)
            page.screenshot(path=f'/tmp/highlights-{width}.png', full_page=True)
            # A shared story survives refresh and highlights the target.
            page.locator('#highlight-shorter-works').get_by_role('link', name='Link to this highlight').click()
            expect(page).to_have_url(base + '#highlights?story=shorter-works')
            page.reload(wait_until='networkidle')
            expect(page.locator('#highlight-shorter-works')).to_have_class('highlight-selected')
            expect(page.locator('#highlight-shorter-works').get_by_role('link', name='NEP PDF p.291')).to_have_attribute('href', re.compile(r'#page=291$'))
            # Candidate tables open the exact filters, including suggested deletions and FAP deltas.
            page.goto(base + '#highlights', wait_until='networkidle')
            for index, query in [(1, 'flag=nep_only_all'), (3, 'flag=amount_decrease')]:
                href = page.get_by_role('region', name='HGAB 3rd versus NEP candidate changes').locator('tbody tr').first.locator('td').nth(index).locator('a').get_attribute('href')
                assert query in href
                assert 'region_match=ignore' in href
            page.get_by_role('region', name='HGAB 3rd versus NEP candidate changes').locator('tbody tr').first.locator('td').nth(1).locator('a').click()
            expect(page.locator('.result-count')).to_contain_text(f"{data['changes']['deletions']['comparison_rows']:,} of", timeout=30000)
            expect(page.get_by_role('button', name='Remove flag filter')).to_contain_text('NEP only · all candidates')
            page.go_back(wait_until='networkidle')
            page.get_by_role('link', name='Analysis', exact=True).click()
            expect(page.get_by_role('heading', name='Analysis', exact=True)).to_be_visible()
            page.go_back(wait_until='networkidle')
            expect(page.get_by_role('heading', name='Highlights', exact=True)).to_be_visible()
            page.close()
        browser.close()
    assert not errors, errors
    print(json.dumps({'widths': [390, 1440], 'stories': 10, 'tables': 2, 'lazy_overview_only': True, 'sharing_and_navigation': True, 'errors': errors}))


if __name__ == '__main__':
    if len(sys.argv) > 1:
        check(sys.argv[1].rstrip('/') + '/')
    else:
        with tempfile.TemporaryDirectory() as folder:
            Path(folder, 'project').symlink_to(ROOT / '_site', target_is_directory=True)
            server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Quiet, directory=folder))
            threading.Thread(target=server.serve_forever, daemon=True).start()
            try:
                check(f'http://127.0.0.1:{server.server_port}/project/app/')
            finally:
                server.shutdown()
