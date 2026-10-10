#!/usr/bin/env python3
"""Check filtered-result analytics and modal interaction in the packaged app."""
from pathlib import Path
from functools import partial
from http.server import ThreadingHTTPServer
import sys, tempfile, threading, json
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
from serve_pages import RangeHandler

class Quiet(RangeHandler):
    def log_message(self, *args):
        pass

with tempfile.TemporaryDirectory() as folder:
    prefix = 'DPWH-NEP-HB-2027-ANALYSIS'
    Path(folder, prefix).symlink_to(ROOT / '_site', target_is_directory=True)
    server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Quiet, directory=folder))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    errors = []
    base = f'http://127.0.0.1:{server.server_port}/{prefix}/app/'
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(executable_path='/usr/bin/google-chrome', headless=True, args=['--no-sandbox'])
            for width in [390, 1440]:
                page = browser.new_page(viewport={'width': width, 'height': 1000})
                page.on('pageerror', lambda e: errors.append(str(e)))
                page.goto(base + '#compare?view=projects&page=2', wait_until='networkidle')
                button = page.get_by_role('button', name='Show analytics', exact=True)
                expect(button).to_be_enabled(timeout=60000)
                button.click()
                dialog = page.get_by_role('dialog', name='Project result analytics')
                expect(dialog).to_be_visible()
                total=len(json.loads((ROOT/'analysis/data/comparison_projects_2027.json').read_text())['projects'])
                expect(dialog).to_contain_text(f'{total:,} filtered comparison rows')
                expect(dialog).to_contain_text('₱134.000M')
                expect(dialog).to_contain_text('₱587.076B')
                assert dialog.evaluate('e=>e.scrollWidth<=e.clientWidth+1')
                assert dialog.locator('.analytics-content').evaluate('e=>e.scrollWidth<=e.clientWidth+1')
                expect(dialog.get_by_role('tab', name='Overview', exact=True)).to_have_attribute('aria-selected','true')
                expect(dialog.locator('.analytics-summary-cards').first).to_contain_text('₱587.076B')
                expect(dialog.locator('.analytics-summary-cards').first).to_contain_text('₱572.924B')
                dialog.get_by_role('tab', name='Changes & matches', exact=True).click()
                help_button=dialog.get_by_role('button',name='About HGAB3 only',exact=True)
                help_button.click()
                expect(help_button).to_have_attribute('aria-expanded','true')
                expect(dialog).to_contain_text('This is a reading difference, not proof of absence from NEP.')
                page.screenshot(path=f'/tmp/analytics-status-{width}.png')
                help_button.click()
                expect(help_button).to_have_attribute('aria-expanded','false')
                dialog.get_by_role('tab', name='Review flags', exact=False).click()
                dialog.get_by_role('button',name='About Different source regions',exact=True).click()
                expect(dialog).to_contain_text('document organization rather than the project’s physical location')
                dialog.get_by_role('tab', name='Overview', exact=True).click()
                page.screenshot(path=f'/tmp/analytics-overview-{width}.png')
                page.keyboard.press('Escape')
                expect(dialog).to_have_count(0)
                expect(button).to_be_focused()
                page.goto(base + '#compare?view=projects&q=4432-PHI', wait_until='networkidle')
                expect(page.locator('.comparison-table tbody tr')).to_have_count(1, timeout=60000)
                button.click()
                expect(dialog).to_contain_text('1 filtered comparison rows')
                expect(dialog).to_contain_text('₱22.494B')
                expect(dialog).to_contain_text('₱8.494B')
                dialog.get_by_role('tab',name='Distribution',exact=True).click()
                region = dialog.locator('section').filter(has=page.get_by_role('heading', name='Region distribution', exact=True))
                expect(region).to_contain_text('House · HGAB3')
                expect(region).to_contain_text('DBM NEP')
                # Retained Central Office echo attribution puts both amounts in
                # NCR on the single strict-matched row.
                ncr = region.locator('li').filter(has_text='NCR').first
                expect(ncr).to_contain_text('HB ₱8.494B')
                expect(ncr).to_contain_text('NEP ₱22.494B')
                page.get_by_role('button', name='Close analytics').click()
                expect(dialog).to_have_count(0)
                page.get_by_label('Search', exact=True).fill('nonexistent project 9f87xyz')
                expect(page.locator('.result-count')).to_contain_text('0 of', timeout=60000)
                expect(button).to_be_disabled()
                page.close()
            browser.close()
        assert not errors, errors
        print(json.dumps({'widths': [390, 1440], 'full_filtered_scope': True, 'hero_source_totals': True, 'paired_house_nep_distribution': True, 'modal_focus_and_escape': True, 'errors': errors}))
    finally:
        server.shutdown()
        server.server_close()
