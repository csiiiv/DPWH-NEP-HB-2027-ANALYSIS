#!/usr/bin/env python3
"""Browser verification of the packaged standalone NIA app.

Serves dist/ on a local port and checks the tab shell, data load, senate
crosstab checksums, the map view, and the PDF viewer. Mirrors the main
workbench's scripts/check_nia_pages.py contract, scoped to this app.
"""
import json
import re
import sys
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from socketserver import ThreadingMixIn

from playwright.sync_api import expect, sync_playwright

DIST = Path(__file__).resolve().parents[1] / 'dist'


class Quiet(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(DIST), **kwargs)

    def log_message(self, *args):
        pass


class Server(ThreadingHTTPServer):
    daemon_threads = True


def main():
    if not (DIST / 'index.html').is_file():
        raise SystemExit('dist/index.html missing — run npm run build && npm run package first')
    server = Server(('127.0.0.1', 0), Quiet)
    port = server.server_address[1]
    base = f'http://127.0.0.1:{port}/'
    import threading
    threading.Thread(target=server.serve_forever, daemon=True).start()
    errors = []
    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch()
            page = browser.new_page(viewport={'width': 1440, 'height': 1000})
            page.on('pageerror', lambda e: errors.append(str(e)))

            # Home loads data and renders the hero.
            page.goto(base + '#nia/home')
            expect(page.locator('h1').first).to_be_visible(timeout=30000)
            expect(page.get_by_role('status').filter(has_text='Loading')).to_have_count(0)

            # Tab shell matches the NIA workspace page list.
            tabs = page.get_by_role('navigation', name='NIA browser pages')
            assert tabs.locator('a').all_text_contents() == [
                'Home', 'Highlights', 'Compare stages', 'Analysis', 'Map', 'House GAB', 'DBM NEP']
            tabs.get_by_role('link', name='Analysis').click()
            expect(page.locator('#table-overview-comparison-subprogram')).to_be_visible(timeout=30000)

            # Senate crosstab: 15 categories, per-row checksums, House total.
            page.goto(base + '#nia/analysis?view=senate')
            table = page.locator('#table-senate-category-reconciliation')
            expect(table).to_be_visible(timeout=30000)
            # 15 hierarchy categories + a pinned totals footer row.
            expect(table.locator('tbody tr')).to_have_count(16)
            expect(table.locator('tbody tr.table-totals')).to_have_count(1)
            money = lambda s: int(m.group(1).replace(',', '')) if (m := re.search(r'₱([\d,]+)', s)) else 0
            rows = page.evaluate("""() => [...document.querySelectorAll(
                '#table-senate-category-reconciliation tbody tr:not(.table-totals)')].map(tr => {
                const grab = label => tr.querySelector(`td[data-label="${label}"]`)?.textContent || '';
                return {i: grab('Unsupported insertions'), d: grab('Deletions'), u: grab('Unchanged'),
                        inc: grab('Increased'), dec: grab('Decreased'), h: grab('House ledger (PHP)')};
            })""")
            for row in rows:
                assert money(row['h']) == money(row['i']) + money(row['u']) + money(row['inc']) + money(row['dec']), row
            total = sum(money(row['h']) for row in rows)
            assert total == 17999305000, total

            # Map renders a real WebGL canvas with the layers panel.
            page.goto(base + '#nia/map')
            expect(page.get_by_role('region', name='NIA project location map')).to_be_visible(timeout=60000)
            expect(page.locator('.nia-map-panel')).to_be_visible()
            expect(page.get_by_role('checkbox', name='Title GPS', exact=True)).to_be_checked()
            expect(page.get_by_role('checkbox', name='PSGC centroid (fallback)', exact=True)).to_be_checked()
            page.get_by_role('button', name='Full window ⤢', exact=True).click()
            expect(page.get_by_role('dialog', name='NIA project map, full window')).to_be_visible()
            page.get_by_role('button', name='Exit full window ✕', exact=True).click()
            page.wait_for_timeout(2000)
            assert page.locator('.maplibregl-canvas').count(), 'no map canvas'

            # PDF viewer: deep link to a project node with its source page —
            # the same URL shape the in-app Source buttons emit.
            page.goto(base + '#nia/nep?node=nep-nia-p01-y124&pdf=dbm-other-nep-line-data%2FNIA.pdf&pdfPage=1')
            expect(page.locator('dialog canvas').first).to_be_visible(timeout=60000)

            page.screenshot(path='/tmp/pbc-nia-home.png')
            browser.close()
    finally:
        server.shutdown()
        server.server_close()
    if errors:
        print('PAGE ERRORS:\n' + '\n'.join(errors))
        sys.exit(1)
    print('Standalone NIA browser checks passed (tabs, data, crosstab, map, PDF)')


if __name__ == '__main__':
    main()
