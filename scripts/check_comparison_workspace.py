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
    projects = json.loads((ROOT / 'analysis/data/comparison_projects_2027.json').read_text())['projects']
    total = len(projects)
    total_label = f'{total:,}'
    # NEP-only split: plain vs House-referred (same rules as suggestedCounterparts.js).
    by_nep = {}
    for row in projects:
        for suggestion in row.get('suggestions') or []:
            nep = suggestion.get('nep') or {}
            nep_id = nep.get('native_node_id') or nep.get('id')
            if not nep_id:
                continue
            by_nep.setdefault(nep_id, set()).add(row['id'])
    nep_only = nep_suggested = 0
    for row in projects:
        if not row.get('nep') or row.get('second') or row.get('third') or row.get('house'):
            continue
        nep_id = row['nep'].get('native_node_id') or row['nep'].get('id')
        if nep_id in by_nep:
            nep_suggested += 1
        else:
            nep_only += 1
    assert nep_only + nep_suggested == sum(1 for row in projects if row.get('nep') and not row.get('second') and not row.get('third') and not row.get('house'))
    base = f'http://127.0.0.1:{server.server_port}/{prefix}/app/'
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(executable_path='/usr/bin/google-chrome', headless=True, args=['--no-sandbox'])
            for width in [390, 1440]:
                page = browser.new_page(viewport={'width': width, 'height': 1000})
                page.on('pageerror', lambda e: errors.append(str(e)))
                requests=[]
                page.on('request',lambda request:requests.append(request.url))
                page.goto(base+'#compare',wait_until='networkidle')
                expect(page.locator('.comparison-table tbody tr')).to_have_count(46,timeout=60000)
                assert not any('comparison_projects_2027.json' in url for url in requests)
                assert not any('stage_trace_2027.json' in url or 'house_reading_changes_2027.json' in url for url in requests)
                expect(page.locator('.source-pane')).to_have_count(0)
                search=page.get_by_label('Search',exact=True)
                search_y=search.bounding_box()['y']
                print({'width':width,'search_y':search_y},flush=True)
                # Search stays within the first screenful of a common phone
                # (~740 CSS px); the margin absorbs renderer font differences.
                assert search_y<730
                page.screenshot(path=f'/tmp/compare-overview-{width}.png')
                search.fill('Bridge');search.press('Enter')
                page.get_by_role('button',name='Project records',exact=True).click()
                expect(page.locator('.result-count')).not_to_contain_text('Loading',timeout=60000)
                expect(search).to_have_value('Bridge')
                assert 'q=Bridge' in page.url
                assert any('comparison_projects_2027.json' in url for url in requests)
                page.get_by_role('button',name='Clear filters',exact=True).click()
                expect(page.locator('.result-count')).to_contain_text(f'{total_label} of',timeout=60000)
                page.get_by_role('button',name='More filters',exact=True).click()
                page.get_by_label('Review flags',exact=True).select_option('house_only')
                house_count=sum(bool(row.get('second') or row.get('third')) and not row.get('nep') and not row.get('api') for row in projects)
                expect(page.locator('.result-count')).to_contain_text(f'{house_count:,} of')
                page.wait_for_function("location.hash.includes('flag=house_only')")
                page.get_by_label('Review flags',exact=True).select_option('')
                page.get_by_label('House reading change',exact=True).select_option('third_only')
                expect(page.locator('.result-count')).to_contain_text('5 of')
                # NEP-only split flags partition the no-house-record set.
                page.get_by_label('House reading change',exact=True).select_option('')
                page.get_by_label('Review flags',exact=True).select_option('nep_only')
                expect(page.locator('.result-count')).to_contain_text(f'{nep_only:,} of')
                expect(page.locator('.active-filters')).to_contain_text('NEP only candidate')
                page.get_by_label('Review flags',exact=True).select_option('nep_only_suggested')
                expect(page.locator('.result-count')).to_contain_text(f'{nep_suggested:,} of')
                expect(page.locator('.active-filters')).to_contain_text('NEP only · possible replacement')
                page.get_by_label('Review flags',exact=True).select_option('')
                page.get_by_label('House reading change',exact=True).select_option('third_only')
                expect(page.locator('.result-count')).to_contain_text('5 of')
                with page.expect_download() as download:
                    page.get_by_role('button',name='Export JSON',exact=True).click()
                exported=json.loads(Path(download.value.path()).read_text())
                assert len(exported['rows'])==5
                assert sum(row['reading_delta_php'] for row in exported['rows'])==134000000
                assert exported['amount_unit']=='PHP'
                # The filename describes the active filters at export time.
                assert download.value.suggested_filename=='dpwh-view-projects_reading-third_only.json',download.value.suggested_filename
                page.get_by_role('button',name='Remove readingStatus filter',exact=True).click()
                expect(page.locator('.result-count')).to_contain_text(f'{total_label} of')
                if width==390:
                    page.get_by_label('Sort results',exact=True).select_option('reading_delta')
                assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
                page.screenshot(path=f'/tmp/compare-projects-{width}.png')
                # Fuzzy OCR triage: place-name spelling slip still unattached.
                page.goto(base+'#compare?view=projects&match=fuzzy&q=B03135LZ',wait_until='networkidle')
                page.get_by_role('button',name='Review 1 NEP suggestion',exact=True).click(timeout=60000)
                candidates=page.get_by_role('region',name='Suggested NEP matches',exact=True)
                expect(candidates.locator('.candidate-table tbody tr')).to_have_count(3)
                expect(candidates.locator('.candidate-table')).to_be_visible()
                expect(candidates.locator('.candidate-table thead th')).to_have_count(5)
                expect(candidates.locator('.candidate-table tbody tr').last.locator('.candidate-project')).to_contain_text('(B03135LZ) along Talaba-Summit-Panaon Rd')
                expect(candidates.locator('.candidate-table tbody tr').last.locator('.candidate-assignment')).to_contain_text('Region IV-A')
                expect(candidates).to_contain_text('0.9787 · 97.87% text similarity')
                expect(candidates).to_contain_text('Kabitanganan Br. (B03135LZ)')
                expect(candidates).to_contain_text('Kabitangahan Br')
                expect(candidates).to_contain_text('₱10,080,000')
                expect(candidates.get_by_role('link',name='Open suggested NEP entry in source tree',exact=False)).to_have_attribute('href','#nep?node=p329%3Ar3')
                expect(page.locator('.comparison-table tbody tr').first.locator('td').nth(1)).to_have_text('—')
                assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
                page.screenshot(path=f'/tmp/fuzzy-candidate-{width}.png')
                page.reload(wait_until='networkidle')
                expect(candidates).to_contain_text('97.87% text similarity',timeout=60000)
                candidates.get_by_role('button',name='Preview suggested NEP PDF p.329',exact=True).click()
                expect(page.locator('.pdf-pane')).to_be_visible(timeout=60000)
                expect(page.get_by_label('PDF page',exact=True)).to_have_value('329',timeout=60000)
                page.get_by_role('button',name='Clear preview',exact=True).click()
                expect(page.locator('.source-pane')).to_have_count(0)
                expect(candidates).to_be_visible()
                page.goto(base+'#compare?view=projects&match=fuzzy&q=house-reading:5146',wait_until='networkidle')
                page.get_by_role('button',name='Construction of Water Supply System at Barangay San Juan, Tingloy, Batangas',exact=True).click(timeout=60000)
                expect(candidates.locator('.candidate-table tbody tr')).to_have_count(5)
                expect(candidates).to_contain_text('NEP suggestion 2')
                assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
                candidates.scroll_into_view_if_needed()
                page.screenshot(path=f'/tmp/multiple-nep-suggestions-{width}.png')
                # Point/range chainage attach: NEP is on the same row (not a suggestion).
                page.goto(base+'#compare?view=projects&match=matched_chainage&q=S00825MN',wait_until='networkidle')
                expect(page.locator('.result-count')).to_contain_text(f'1 of {total_label} comparison rows',timeout=60000)
                expect(page.locator('.normalized-match-badge')).to_contain_text('Matched after chainage check')
                expect(page.locator('.chainage-in-cell').first).to_contain_text('Chainage:')
                # Unresolved fuzzy referral still keeps House and NEP on separate rows.
                page.goto(base+'#compare?view=projects&q=K1553',wait_until='networkidle')
                expect(page.locator('.result-count')).to_contain_text(f'2 of {total_label} comparison rows',timeout=60000)
                expect(page.locator('.count-explanation')).to_contain_text('not unique projects')
                expect(page.locator('.counterpart-badge')).to_contain_text('Suggested NEP counterpart · unresolved (1 House comparison row)')
                page.goto(base+'#compare?view=projects&page=2',wait_until='networkidle')
                button = page.get_by_role('button', name='Show analytics', exact=True)
                expect(button).to_be_enabled(timeout=60000)
                button.click()
                dialog = page.get_by_role('dialog', name='Project result analytics')
                expect(dialog).to_be_visible()
                expect(dialog).to_contain_text(f'{total_label} filtered comparison rows')
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
                # Retained Central Office echo attribution places both House and
                # NEP amounts in NCR on one strict-matched row.
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
        print(json.dumps({'widths': [390, 1440], 'lightweight_pap_loading':True, 'filtered_exports':True, 'preserved_filters':True, 'full_filtered_scope':True, 'hero_source_totals':True, 'paired_house_nep_distribution':True, 'modal_focus_and_escape': True, 'errors': errors}))
    finally:
        server.shutdown()
        server.server_close()
