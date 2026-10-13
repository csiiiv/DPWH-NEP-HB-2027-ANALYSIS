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
    details = json.loads((ROOT / 'analysis/data/highlights_details_2027.json').read_text())
    subjects = {
        'funding-shift': 'Agency change and operations reconciliation',
        'multi-purpose': 'Multi-purpose buildings by recorded region',
        'caloocan': 'Where the reading amendment balances',
        'flood-priorities': 'Flood funding categories, including FAP',
        'house-only': 'House-only allocations by program',
        'groupings': 'Corridors and place groups with unmatched HGAB2 allocations',
        'regional-gains': 'Regional allocations outside FAP',
        'office-capacity': 'Central Office, DEOs and other office categories',
        'shorter-works': 'Unchanged-amount candidates with shorter listed coverage',
        'rainwater': 'Repeated rainwater allocation amounts',
    }
    errors = []
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        for width in [390, 1440]:
            page = browser.new_page(viewport={'width': width, 'height': 1000}, accept_downloads=True)
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
            expect(page.locator('#highlight-transparency-gaps')).to_have_count(0)
            expect(page.get_by_text('Total · DPWH coverage only', exact=True)).to_have_count(2)
            assert not any('comparison_projects_2027.json' in url for url in requests)
            assert not any('highlights_details_2027.json' in url for url in requests)
            assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth'), 'Page overflows viewport'
            assert coverage.evaluate('(el) => el.scrollWidth > el.clientWidth') == (width == 390)
            assert page.locator('.highlights-stories').evaluate('(el) => getComputedStyle(el).display') == 'grid'
            assert len(page.locator('.highlights-stories').evaluate('(el) => getComputedStyle(el).gridTemplateColumns').split()) == (1 if width == 390 else 2)
            page.screenshot(path=f'/tmp/highlights-{width}.png', full_page=True)
            # Each story has custom hero figures and its own evidence tables.
            for story, table in subjects.items():
                trigger = page.locator(f'#highlight-{story}').get_by_role('button', name='Explore this highlight')
                trigger.click()
                dialog = page.locator('dialog.highlight-dialog').filter(has=page.locator('#highlight-dialog-title'))
                expect(dialog).to_be_visible()
                expect(dialog.locator('.hi-hero-metrics article')).to_have_count(3)
                expect(dialog.get_by_role('region', name=table, exact=True)).to_be_visible(timeout=30000)
                assert dialog.evaluate('(el) => el.scrollWidth <= el.clientWidth'), 'Dialog overflows viewport'
                assert page.evaluate('document.body.style.overflow') == 'hidden'
                if story == 'funding-shift':
                    expect(dialog).to_contain_text('₱73.000B')
                    source = dialog.get_by_role('link', name='NEP p.8', exact=True)
                    expect(source).to_have_attribute('aria-haspopup', 'dialog')
                    source.click()
                    pdf = page.get_by_role('dialog', name=re.compile('^PDF source:'))
                    expect(pdf).to_be_visible()
                    expect(pdf.locator('canvas')).to_be_visible(timeout=60000)
                    expect(pdf.get_by_role('status')).to_contain_text('Page 8 of 722', timeout=60000)
                    assert len(browser.contexts[0].pages) == 1, 'Source opened a new tab'
                    pdf.get_by_role('combobox', name='PDF page').select_option('9')
                    expect(pdf.get_by_role('status')).to_contain_text('Page 9 of 722', timeout=30000)
                    pdf.get_by_role('button', name='Zoom in', exact=True).click()
                    expect(pdf.get_by_role('spinbutton', name='Zoom percent')).to_have_value('110')
                    page.screenshot(path=f'/tmp/pdf-source-modal-{width}.png')
                    page.keyboard.press('Escape')
                    expect(pdf).to_have_count(0)
                    expect(dialog).to_be_visible()
                    expect(source).to_be_focused()
                    assert page.evaluate('document.body.style.overflow') == 'hidden'
                if story == 'caloocan':
                    expect(dialog.get_by_role('region', name='The third-reading additions')).to_contain_text('Caloocan')
                    expect(dialog.locator('.hi-hero-metrics article').last).to_contain_text('₱0')
                if story == 'groupings':
                    expect(page.locator('.hi-detail-dialog')).to_have_count(0)
                    expect(dialog.locator('.hi-drill[aria-pressed]')).to_have_count(0)
                    expect(dialog.get_by_role('heading', name=re.compile('^Group members:'))).to_have_count(0)
                    group_trigger = dialog.get_by_role('region', name=table, exact=True).locator('tbody button').first
                    expect(group_trigger).to_have_attribute('aria-haspopup', 'dialog')
                    group_trigger.click()
                    child = page.get_by_role('dialog', name=re.compile('^Group members: Metro Cebu'))
                    expect(child).to_be_visible()
                    expect(child.locator('.hi-hero-metrics article')).to_have_count(3)
                    expect(child.locator('.hi-hero')).to_contain_text('620.000M')
                    expect(child.get_by_role('region', name='Allocation members', exact=True).locator('tbody tr')).to_have_count(3)
                    if width == 1440:
                        source = child.get_by_role('link', name=re.compile('^HGAB2 p\\.')).first
                        source.click()
                        pdf = page.get_by_role('dialog', name=re.compile('^PDF source:'))
                        expect(pdf.get_by_role('status')).to_contain_text('Page ', timeout=60000)
                        expect(pdf.locator('canvas')).to_be_visible()
                        expect(page.locator('dialog[open]')).to_have_count(3)
                        page.keyboard.press('Escape')
                        expect(pdf).to_have_count(0)
                        expect(child).to_be_visible()
                        expect(source).to_be_focused()
                    page.screenshot(path=f'/tmp/highlight-group-detail-{width}.png')
                    page.keyboard.press('Escape')
                    expect(child).to_have_count(0)
                    expect(dialog).to_be_visible()
                    expect(group_trigger).to_be_focused()
                    assert page.evaluate('document.body.style.overflow') == 'hidden'
                if story == 'regional-gains':
                    expect(page.locator('.hi-detail-dialog')).to_have_count(0)
                    expect(dialog.locator('.hi-drill[aria-pressed]')).to_have_count(0)
                    expect(dialog.get_by_role('heading', name=re.compile('^PAP changes:'))).to_have_count(0)
                    region_trigger = dialog.get_by_role('region', name=table, exact=True).get_by_role('button', name='Region IV-A · CALABARZON', exact=False)
                    expect(region_trigger).to_have_attribute('aria-haspopup', 'dialog')
                    region_trigger.click()
                    child = page.get_by_role('dialog', name='PAP changes: Region IV-A · CALABARZON', exact=True)
                    expect(child).to_be_visible()
                    expect(child.locator('.hi-hero-metrics article')).to_have_count(3)
                    expect(child.get_by_role('region', name='PAP allocation changes', exact=True)).to_contain_text('BIP - Multi-Purpose')
                    page.screenshot(path=f'/tmp/highlight-region-detail-{width}.png')
                    child.get_by_role('button', name='Close detail', exact=True).click()
                    expect(child).to_have_count(0)
                    expect(dialog).to_be_visible()
                    expect(region_trigger).to_be_focused()
                    assert page.evaluate('document.body.style.overflow') == 'hidden'
                if story == 'shorter-works':
                    panel = dialog.locator('section.hi-panel').filter(has=page.get_by_role('heading', name=table, exact=True))
                    expect(panel.locator('.hi-pagination')).to_contain_text(f"of {len(details['stories'][story]['rows']):,} rows")
                    panel.get_by_role('textbox', name='Search these records').fill('Panitan')
                    expect(panel.locator('.hi-pagination')).to_contain_text('of 1 rows')
                    with page.expect_download() as download:
                        panel.get_by_role('button', name='Export CSV').click()
                    path = download.value.path()
                    text = Path(path).read_text()
                    assert '50000000' in text and '477' in text and '132' in text
                    assert len(text.splitlines()) == 2
                if story == 'rainwater':
                    expect(dialog.locator('.hi-hero')).to_contain_text('₱1.0272B')
                    expect(dialog.get_by_role('region', name='Rainwater Collector System across budget stages', exact=True).locator('tbody td').last).to_contain_text('₱0')
                    bands = dialog.get_by_role('region', name=table, exact=True)
                    expect(bands).to_contain_text('199')
                    expect(bands).to_contain_text('17')
                    expect(bands).to_contain_text('₱38.400M')
                    records = dialog.locator('section.hi-panel').filter(has=page.get_by_role('heading', name='All rainwater office allocation records', exact=True))
                    expect(records.locator('.hi-pagination')).to_contain_text('of 217 rows')
                    records.get_by_role('textbox', name='Search these records').fill('BARMM')
                    expect(records.locator('.hi-pagination')).to_contain_text('of 1 rows')
                    if width == 1440:
                        source = dialog.get_by_role('link', name='HGAB3 p.401', exact=True).first
                        source.click()
                        pdf = page.get_by_role('dialog', name=re.compile('^PDF source:'))
                        expect(pdf.get_by_role('status')).to_contain_text('Page 401 of', timeout=60000)
                        expect(pdf.locator('canvas')).to_be_visible()
                        pdf.get_by_role('button', name='Close PDF viewer').click()
                        expect(source).to_be_focused()
                page.screenshot(path=f'/tmp/highlight-modal-{story}-{width}.png')
                # Back closes some dialogs; Escape closes the rest and restores focus.
                if story == 'funding-shift':
                    page.go_back(wait_until='networkidle')
                else:
                    page.keyboard.press('Escape')
                    expect(trigger).to_be_focused()
                expect(page.get_by_role('dialog')).to_have_count(0)
                assert page.evaluate('document.body.style.overflow') == ''
            assert len([url for url in requests if 'highlights_details_2027.json' in url]) == 1
            assert not any('comparison_projects_2027.json' in url for url in requests)
            # A shared story now opens the dialog directly and survives refresh.
            page.locator('#highlight-shorter-works').get_by_role('link', name='Link to this highlight').click()
            expect(page).to_have_url(base + '#highlights?story=shorter-works')
            page.reload(wait_until='networkidle')
            expect(page.locator('#highlight-shorter-works')).to_have_class('highlight-selected')
            expect(page.get_by_role('dialog').get_by_role('heading', name='Worked example:', exact=False)).to_be_visible(timeout=30000)
            expect(page.get_by_role('dialog').get_by_role('link', name='NEP p.291').first).to_have_attribute('href', re.compile(r'#page=291$'))
            page.get_by_role('button', name='Close highlight').click()
            expect(page.get_by_role('dialog')).to_have_count(0)
            # Standalone sources and retained controller anchors share the same viewer.
            page.get_by_role('link', name='Resources', exact=True).click()
            page.get_by_role('link', name='House GAB 2nd reading · Volume I-B', exact=True).click()
            pdf = page.get_by_role('dialog', name=re.compile('^PDF source:'))
            expect(pdf.get_by_role('status')).to_contain_text('Page 1 of', timeout=60000)
            expect(pdf.locator('canvas')).to_be_visible()
            page.keyboard.press('Escape')
            assert page.evaluate('document.body.style.overflow') == ''
            page.goto(base + '#house-nep', wait_until='networkidle')
            page.get_by_role('link', name='House summary PDF, page 9', exact=True).click()
            pdf = page.get_by_role('dialog', name=re.compile('^PDF source:'))
            expect(pdf.get_by_role('status')).to_contain_text('Page 9 of', timeout=60000)
            page.keyboard.press('Escape')
            # Hash navigation closes both stacked dialogs and restores scrolling.
            page.goto(base + '#highlights?story=funding-shift', wait_until='networkidle')
            page.get_by_role('dialog').get_by_role('link', name='NEP p.8', exact=True).click()
            expect(page.get_by_role('dialog')).to_have_count(2)
            page.evaluate("window.location.hash = '#highlights'")
            expect(page.get_by_role('dialog')).to_have_count(0)
            assert page.evaluate('document.body.style.overflow') == ''
            # Headline drilldowns reproduce each published candidate subset,
            # keeping unresolved insertion/deletion counterparts held out.
            page.goto(base + '#highlights', wait_until='networkidle')
            for index, query in [(0, 'match=no_match'), (1, 'flag=nep_only'), (3, 'flag=amount_decrease')]:
                href = page.get_by_role('region', name='HGAB 3rd versus NEP candidate changes').locator('tbody tr').first.locator('td').nth(index).locator('a').get_attribute('href')
                assert query in href
                assert 'region_match=ignore' in href
            for index, key in enumerate(['insertions', 'deletions', 'increased', 'decreased']):
                page.get_by_role('region', name='HGAB 3rd versus NEP candidate changes').locator('tbody tr').first.locator('td').nth(index).locator('a').click()
                expect(page.locator('.result-count')).to_contain_text(f"{data['changes'][key]['comparison_rows']:,} of", timeout=30000)
                if key == 'deletions':
                    expect(page.get_by_role('button', name='Remove flag filter')).to_contain_text('NEP only candidate')
                page.go_back(wait_until='networkidle')
            page.get_by_role('link', name='Analysis', exact=True).click()
            expect(page.get_by_role('heading', name='Analysis', exact=True)).to_be_visible()
            page.go_back(wait_until='networkidle')
            expect(page.get_by_role('heading', name='Highlights', exact=True)).to_be_visible()
            page.close()
        browser.close()
    assert not errors, errors
    print(json.dumps({'widths': [390, 1440], 'stories': 10, 'custom_dialogs': 10, 'tables': 2, 'lazy_cached_evidence': True, 'csv': True, 'pdf_modals': True, 'sharing_and_navigation': True, 'errors': errors}))


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
