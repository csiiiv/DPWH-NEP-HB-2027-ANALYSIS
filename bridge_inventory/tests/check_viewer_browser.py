#!/usr/bin/env python3
"""Check the standalone bridge table on desktop and mobile without a server."""
import json
from pathlib import Path

from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[2]


def main():
    errors = []
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path='/usr/bin/google-chrome', headless=True,
                                    args=['--no-sandbox'], timeout=20000)
        try:
            page = browser.new_page(viewport={'width': 1440, 'height': 1000})
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.goto((ROOT / 'bridge_inventory/index.html').as_uri())
            expect(page.locator('#search')).to_be_enabled(timeout=60000)
            expect(page.locator('#rows tr')).to_have_count(50)
            expect(page.locator('#summary')).to_contain_text('8,752 bridges')
            expect(page.locator('#error')).to_be_hidden()
            page.locator('#next').click()
            expect(page.locator('#summary')).to_contain_text('51–100')
            page.locator('#projects').select_option('matched')
            expect(page.locator('#summary')).to_contain_text('498 bridges')
            page.locator('#review').select_option('flagged')
            expect(page.locator('#summary')).to_contain_text('288 bridges')
            page.locator('#review').select_option('clear')
            expect(page.locator('#summary')).to_contain_text('210 bridges')
            page.locator('#review').select_option('unresolved')
            expect(page.locator('#summary')).to_contain_text('32 bridges')
            page.locator('#reset').click()
            page.locator('#search').fill('B00664LZ')
            expect(page.locator('#summary')).to_have_text('1–1 of 1 bridges')
            expect(page.locator('#rows')).to_contain_text('Busilac')
            expect(page.locator('#rows')).to_contain_text('0103306022')
            expect(page.locator('#rows td').nth(2)).to_contain_text('Lat 16.895928')
            expect(page.locator('#rows td').nth(2)).to_contain_text('Lon 120.407326')
            expect(page.get_by_role('link', name='Open map')).to_have_attribute(
                'href', 'https://www.google.com/maps?q=16.89592829887061%2C120.40732567402226')
            page.get_by_text('View observations', exact=True).click()
            expect(page.locator('#rows td').nth(5)).to_contain_text('dpwh_nep_pdf:p312:r11')
            page.get_by_text('All inventory fields', exact=True).click()
            expect(page.locator('#rows td').first).to_contain_text('BRIDGE_ID')
            page.locator('#search').fill('B00532LZ')
            expect(page.locator('#rows tr')).to_have_count(1)
            expect(page.locator('#rows td').first).to_contain_text('Bocal')
            page.get_by_text('Review evidence', exact=True).click()
            expect(page.locator('#rows td').last).to_contain_text('Inventory: Estancia')
            expect(page.locator('#rows td').last).to_contain_text('Polygon: Susugaen')
            expect(page.locator('#rows td').last).to_contain_text("DPWH name differs from point's polygon")
            page.locator('#reset').click()
            page.locator('#review').select_option('no-hit')
            expect(page.locator('#summary')).to_contain_text('9 bridges')
            page.locator('#search').fill('B04691LZ')
            expect(page.locator('#summary')).to_have_text('1–1 of 1 bridges')
            expect(page.locator('#rows td').nth(3)).to_contain_text('No polygon hit')
            page.get_by_text('Nearest 3 barangay edges', exact=True).click()
            nearby = page.locator('.nearest-edges')
            expect(nearby.locator('.detail-item')).to_have_count(3)
            expect(nearby).to_contain_text('Bulabog')
            expect(nearby).to_contain_text('3.54 m')
            expect(nearby).to_contain_text('Bucalbucalan')
            expect(nearby).to_contain_text('4.19 m')
            expect(page.locator('#rows td').nth(4)).to_have_text('Unresolved')
            page.locator('#reset').click()
            page.locator('#province').select_option('Ilocos Norte')
            assert page.locator('#rows tr').count() > 0
            assert page.locator('#rows td:nth-child(2)').evaluate_all(
                '(cells)=>cells.every(c=>c.textContent.includes("Ilocos Norte"))')
            page.locator('#reset').click()
            page.locator('button[data-sort=projectCount]').click()
            page.locator('button[data-sort=projectCount]').click()
            counts = [int(n.replace(',', '')) for n in
                      page.locator('#rows td:nth-child(6) > .badge').all_text_contents()]
            assert counts == sorted(counts, reverse=True), counts
            page.locator('#page-size').select_option('25')
            expect(page.locator('#rows tr')).to_have_count(25)
            page.locator('.table-wrap').evaluate('(node)=>node.scrollLeft=0')
            page.screenshot(path='/tmp/bridge-inventory-desktop.png', full_page=True)
            page.set_viewport_size({'width': 390, 'height': 844})
            page.locator('.table-wrap').evaluate('(node)=>node.scrollLeft=0')
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'Mobile document overflow'
            page.screenshot(path='/tmp/bridge-inventory-mobile.png', full_page=True)
            page.locator('#search').fill('no-such-bridge-xyz98765')
            expect(page.locator('#summary')).to_have_text('0 matching bridges')
            expect(page.locator('#next')).to_be_disabled()
            expect(page.locator('#previous')).to_be_disabled()
            expect(page.locator('#rows')).to_contain_text('No bridges match')
            page.locator('#reset').click()
            expect(page.locator('#summary')).to_contain_text('8,752 bridges')
            download = page.locator('#download').get_attribute('href')
            assert (ROOT / 'bridge_inventory' / download).is_file()
            assert not errors, errors
            print(json.dumps({'file_open': True, 'search_filter_sort_pagination': True,
                              'source_evidence': True, 'mobile': True, 'browser_errors': errors}))
        finally:
            browser.close()


if __name__ == '__main__':
    main()
