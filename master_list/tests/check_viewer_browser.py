#!/usr/bin/env python3
"""Exercise the standalone viewer on file:// and HTTP, desktop and mobile."""
from functools import partial
from http.server import ThreadingHTTPServer
import json
from pathlib import Path
import re
import sys
import threading
from urllib.parse import unquote, urlsplit

from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts'))
from serve_pages import RangeHandler


class Quiet(RangeHandler):
    def log_message(self, *args):
        pass


def main():
    errors = []
    server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Quiet, directory=str(ROOT)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(executable_path='/usr/bin/google-chrome', headless=True, args=['--no-sandbox'])
            page = browser.new_page(viewport={'width': 1440, 'height': 1000})
            page.on('pageerror', lambda error: errors.append(str(error)))
            # No fetch/server is needed to open the list itself.
            page.goto((ROOT / 'master_list/index.html').as_uri())
            expect(page.locator('#search')).to_be_enabled(timeout=60000)
            expect(page.locator('#rows tr')).to_have_count(50)
            expect(page.locator('#summary')).to_contain_text('58,795')
            expect(page.locator('#error')).to_be_hidden()
            page.locator('#next').click()
            expect(page.locator('#summary')).to_contain_text('51–100')
            page.locator('#dataset').select_option('fmr_nep')
            expect(page.locator('#summary')).to_contain_text('704')
            expect(page.locator('#total')).to_contain_text('₱16,000,000,000')
            page.locator('#search').fill('Tubburan Bacarra Rango')
            expect(page.locator('#summary')).to_contain_text('of 1 records')
            expect(page.locator('#rows')).to_contain_text('0102802052')
            pdf = page.locator('#rows td').nth(5).locator('a')
            expect(pdf).to_have_attribute('href', (ROOT / 'dbm-other-nep-line-data/FMR.pdf').as_uri() + '#page=1')
            expect(page.locator('#rows td').nth(4).locator('.score')).to_have_text(re.compile(r'^-?\d+$'))
            expect(page.locator('#rows td').nth(6)).to_contain_text('Printed 1511')
            page.locator('#reset').click()
            page.locator('#dataset').select_option('hfep_nep')
            page.locator('#search').fill('Nacagang')
            expect(page.locator('#rows tr')).to_have_count(1)
            expect(page.locator('#rows td').nth(5).locator('a')).to_have_attribute('href', (ROOT / 'dbm-other-nep-line-data/HFEP_2.pdf').as_uri() + '#page=1')
            page.locator('#reset').click()
            page.locator('#dataset').select_option('dpwh_nep_api')
            expect(page.locator('#rows td').nth(5)).to_contain_text('Not supplied (API listing)')
            page.locator('#reset').click()
            page.locator('#allocations').check()
            expect(page.locator('#summary')).to_contain_text('64,645')
            page.locator('#score').fill('8')
            scores = page.locator('#rows td.evidence .score').all_text_contents()
            assert scores and all(int(score) >= 8 for score in scores)
            page.locator('#reset').click()
            page.locator('#search').fill('nonexistent record xyzq987654')
            expect(page.locator('#summary')).to_have_text('0 matching records')
            expect(page.locator('#next')).to_be_disabled()
            page.locator('#reset').click()
            page.locator('#dataset').select_option('fmr_nep')
            page.locator('button[data-sort=value]').click()
            amounts = page.locator('#rows td.amount').all_text_contents()
            values = [int(s.replace('₱','').replace(',','')) for s in amounts]
            assert values == sorted(values), 'Value sort is not numeric'
            page.locator('button[data-sort=score]').click()
            scores = [int(s) for s in page.locator('#rows td.evidence .score').all_text_contents()]
            assert scores == sorted(scores), 'Evidence-score sort is not numeric'
            page.locator('#category').select_option(index=1)
            page.locator('#review').check()
            assert page.locator('#rows tr').count() > 0
            assert page.locator('#rows td.page').evaluate_all('(cells) => cells.every(cell => cell.scrollWidth <= cell.clientWidth)'), 'Page references are clipped'
            page.screenshot(path='/tmp/master-list-desktop.png', full_page=True)
            page.set_viewport_size({'width': 390, 'height': 844})
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'Unexpected mobile document overflow'
            page.screenshot(path='/tmp/master-list-mobile.png', full_page=True)
            # The same relative links resolve correctly when served from repo root.
            base = f'http://127.0.0.1:{server.server_port}'
            response = page.goto(base + '/master_list/')
            assert response.status == 200
            expect(page.locator('#search')).to_be_enabled(timeout=60000)
            page.locator('#dataset').select_option('dpwh_house_third')
            url = page.locator('#rows td').nth(5).locator('a').get_attribute('href')
            parsed = urlsplit(url)
            assert parsed.fragment.startswith('page=')
            response = page.request.get(url, headers={'Range': 'bytes=0-31'})
            assert response.status == 206 and response.body().startswith(b'%PDF')
            assert unquote(parsed.path).startswith('/HB_BUDGET_3rd_reading/')
            response = page.request.get(base + '/master_list/data/project_list.csv.gz')
            assert response.status == 200
            browser.close()
        assert not errors, errors
        print(json.dumps({'file_open': True, 'search_filters_sort_pagination': True,
                          'pdf_page_links': True, 'csv_download': True,
                          'desktop_mobile': True, 'browser_errors': errors}))
    finally:
        server.shutdown()
        server.server_close()


if __name__ == '__main__':
    main()
