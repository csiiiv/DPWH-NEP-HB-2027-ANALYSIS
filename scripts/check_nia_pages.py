#!/usr/bin/env python3
"""Check NIA routing, filtered exports, source arithmetic and real PDF rendering."""
import csv
from functools import partial
from http.server import ThreadingHTTPServer
from io import StringIO
import json
import os
import re
from pathlib import Path
import tempfile
import threading
from urllib.parse import urlencode

from playwright.sync_api import expect, sync_playwright
from serve_pages import RangeHandler, check_widths, prime_disclaimer_for_checks
from analysis_checks import check_analysis_links, check_banded_overview, check_candidate_group

ROOT = Path(__file__).resolve().parents[1]


class Quiet(RangeHandler):
    def log_message(self, *args):
        pass


def main():
    data = json.loads((ROOT / 'analysis-nia/data/nia_workbench.json').read_text())
    errors, bad, ranges = [], [], []
    captures = Path('/tmp/nia-ui-verification')
    captures.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory() as directory:
        prefix = 'NIA-preview'
        Path(directory, prefix).symlink_to(ROOT / '_site', target_is_directory=True)
        server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Quiet, directory=directory))
        threading.Thread(target=server.serve_forever, daemon=True).start()
        base = f'http://127.0.0.1:{server.server_port}/{prefix}/app/'
        try:
            with sync_playwright() as p:
                browser = p.chromium.launch(headless=True, executable_path=os.environ.get('CHROME_BIN', '/usr/bin/google-chrome'), args=['--no-sandbox'])
                for width in check_widths():
                    page = browser.new_page(viewport={'width': width, 'height': 1000}, accept_downloads=True)
                    prime_disclaimer_for_checks(page)
                    page.on('pageerror', lambda e: errors.append(str(e)))
                    page.on('response', lambda r: bad.append((r.url, r.status)) if r.status >= 400
                            else ranges.append(r.url) if r.status == 206 else None)

                    def goto(route):
                        page.goto(base + '#nia/' + route, wait_until='networkidle')
                        # The Map tab leads with an h2 (map + distribution); all
                        # other pages render a hero h1.
                        heading = page.locator('h1') if route.split('?')[0] != 'map' else page.locator('h2').first
                        expect(heading).to_be_visible()
                        assert not page.evaluate('document.documentElement.scrollWidth > innerWidth'), page.url

                    def pdf_page(expected_page):
                        pane = page.get_by_role('complementary', name='Inline source PDF')
                        expect(pane.locator('canvas')).to_be_visible(timeout=60000)
                        expect(pane.get_by_role('status')).to_contain_text(f'Page {expected_page} of ', timeout=60000)

                    page.goto(base.replace('/app/', '/nia/') + '?preview=nia#nep', wait_until='networkidle')
                    assert '/app/?preview=nia#nia/nep' in page.url
                    for route in ('home', 'highlights', 'compare', 'compare?view=projects', 'analysis',
                                  'analysis?view=stats', 'analysis?view=chainage', 'analysis?view=ai_monitoring', 'analysis?stage=house', 'analysis?view=candidates', 'analysis?view=controls',
                                  'analysis?view=insertions', 'analysis?view=deletions', 'analysis?view=adjustments'):
                        goto(route)
                    goto('compare')
                    context = page.locator('.comparison-context')
                    assert not context.evaluate('(e) => e.open')
                    expect(page.get_by_role('link', name='Sub-program totals', exact=True)).to_have_attribute('aria-current', 'page')
                    expect(page.get_by_role('region', name='NIA sub-program stage comparison', exact=True).locator('tbody tr')).to_have_count(6)
                    page.get_by_label('Sub-program', exact=True).select_option('Other Irrigation System')
                    expect(page.get_by_role('region', name='NIA sub-program stage comparison', exact=True).locator('tbody tr')).to_have_count(1)
                    with page.expect_download() as result:
                        page.get_by_role('button', name='Export filtered CSV', exact=True).click()
                    controls = list(csv.DictReader(StringIO(Path(result.value.path()).read_text(encoding='utf-8-sig'))))
                    assert len(controls) == 1 and controls[0]['key'] == 'Other Irrigation System'
                    assert controls[0]['nep_pdf_page'] and controls[0]['house_pdf_page']
                    page.get_by_role('button', name='NEP control', exact=True).click()
                    pdf_page(int(controls[0]['nep_pdf_page']))
                    if width == 390:
                        expect(page.get_by_role('region', name='NIA sub-program stage comparison', exact=True)).not_to_be_visible()
                        page.get_by_role('button', name='Table', exact=True).click()
                        expect(page.get_by_role('region', name='NIA sub-program stage comparison', exact=True)).to_be_visible()
                        page.get_by_role('button', name='PDF source', exact=True).click()
                    page.get_by_role('button', name='Clear PDF selection', exact=True).click()
                    expect(page.get_by_role('complementary', name='Inline source PDF')).not_to_be_visible()
                    goto('compare?view=projects')
                    page.screenshot(path=str(captures / f'compare-projects-{width}.png'))
                    if width == 390:
                        page.get_by_label('Sort results', exact=True).select_option('nep_php')
                        expect(page.get_by_role('navigation', name='NIA project candidates pages')).to_contain_text('Page 1 of')
                        assert 'sort=nep_php' in page.url

                    # Tab reset values must not serialize as pair=null/status=null.
                    check_analysis_links(page, goto, 'insertions', 'insertions-by-subprogram', tabs='Analysis views')
                    check_banded_overview(page, goto, 'overview-comparison-subprogram')
                    comparison = page.locator('#table-overview-comparison-subprogram')
                    comparison.locator('tbody button.group-open').first.click()
                    overview_records = page.get_by_role('dialog', name='NIA overview records')
                    expect(overview_records).to_be_visible()
                    page.reload(wait_until='networkidle')
                    expect(overview_records).to_be_visible()
                    expect(overview_records.get_by_role('link', name='Continue in Compare stages →')).to_have_attribute('href', re.compile('^#nia/compare'))
                    overview_records.get_by_role('button', name='Close', exact=True).click()
                    expect(overview_records).to_have_count(0)
                    goto('analysis')
                    assert page.get_by_role('navigation', name='Analysis views').locator('a').all_text_contents() == [
                        'Overview', 'Unsupported insertions', 'Deletions', 'Adjustments', 'Statistics', 'AI monitoring', 'Senate workbook', 'Candidates', 'Agency controls']
                    expect(page.get_by_label('Analysis budget source', exact=True)).to_have_value('nep')
                    expect(page.get_by_role('region', name='NIA allocation overview', exact=True)).to_contain_text('Allocation share')
                    page.get_by_label('Analysis budget source', exact=True).select_option('house')
                    expect(page.locator('.fmr-stats')).to_contain_text('₱17,999,305,000')
                    page.screenshot(path=str(captures / f'analysis-overview-{width}.png'))
                    for label, expected_count in [('Unsupported insertions',222),('Deletions',185),('Adjustments',4),('Candidates',1013)]:
                        page.get_by_role('link',name=label,exact=True).click()
                        expect(page.get_by_role('dialog',name='NIA candidate evidence')).to_have_count(0)
                        expect(page.get_by_role('navigation',name='NIA project candidates pages')).to_contain_text(f'{expected_count:,} rows')
                        assert 'pair=null' not in page.url and 'status=null' not in page.url

                    goto('analysis?view=ai_monitoring')
                    expect(page.get_by_role('link', name='AI monitoring', exact=True)).to_have_attribute('aria-current', 'page')
                    expect(page.locator('main')).to_contain_text('Amounts cover the whole irrigation project')
                    ai_pages = page.get_by_role('navigation', name='NIA projects pages')
                    ai_stats = page.locator('.fmr-stats').first
                    insertion_summary = page.get_by_role('region', name='AI monitoring unsupported insertion summary')
                    for side, count, total in [('nep', 327, 7015950000), ('house', 299, 6341950000)]:
                        page.get_by_label('Analysis budget source', exact=True).select_option(side)
                        expect(ai_pages).to_contain_text(f'{count} rows')
                        expect(ai_stats).to_contain_text(f'₱{total:,}')
                        expect(insertion_summary).to_contain_text('26')
                        expect(insertion_summary).to_contain_text('₱0.56B')
                        expect(insertion_summary).to_contain_text('8.8%')
                        expect(insertion_summary).to_contain_text('Validated candidates')
                        expect(insertion_summary).to_contain_text('₱295,000,000 · no counterpart found')
                        expect(insertion_summary).to_contain_text('₱261,000,000 · plausible counterpart, held out')
                        with page.expect_download() as result:
                            page.get_by_role('button', name='Export filtered CSV', exact=True).click()
                        exported = list(csv.DictReader(StringIO(Path(result.value.path()).read_text(encoding='utf-8-sig'))))
                        assert len(exported) == count and sum(int(x['amount_php']) for x in exported) == total
                        assert len({x['source_id'] for x in exported}) == count
                        originals = {x['id']: x for x in data['stages'][side]['projects']}
                        assert all(x['title'] == originals[x['source_id']]['title'] and x['source_pdf'] == originals[x['source_id']]['source']['source_pdf'] for x in exported)
                        assert sum(x['ai_monitoring_basis'] == 'ocr_variant' for x in exported) == (59 if side == 'nep' else 0)
                    expect(insertion_summary).to_contain_text('Reading note')
                    expect(insertion_summary).to_contain_text('₱-674,000,000')
                    expect(insertion_summary).to_contain_text('review mark')
                    # Strict-method view exposes the committed strict figures,
                    # with the OCR twins held out as unresolved candidates.
                    page.get_by_label('AI monitoring matching method', exact=True).select_option('strict')
                    expect(insertion_summary).to_contain_text('123')
                    expect(insertion_summary).to_contain_text('₱2.63B')
                    expect(insertion_summary).to_contain_text('₱295,000,000 · no counterpart found')
                    expect(insertion_summary).to_contain_text('110')
                    expect(insertion_summary).to_contain_text('120 of 123 candidates')
                    page.get_by_label('AI monitoring matching method', exact=True).select_option('ai_corrected')
                    insertion_summary.get_by_role('button', name='Inspect unsupported insertion candidates', exact=True).click()
                    insertion_dialog = page.get_by_role('dialog', name='NIA AI monitoring unsupported insertion candidates')
                    expect(insertion_dialog).to_be_visible()
                    expect(insertion_dialog.get_by_role('navigation', name='NIA project candidates pages')).to_contain_text('26 rows')
                    with page.expect_download() as result:
                        insertion_dialog.get_by_role('button', name='Export filtered CSV', exact=True).click()
                    inserted = list(csv.DictReader(StringIO(Path(result.value.path()).read_text(encoding='utf-8-sig'))))
                    assert len(inserted) == 26 and sum(int(x['house_amount_php']) for x in inserted) == 556000000
                    assert all(x['status'] == 'house_only' and x['house_id'] and not x['nep_id'] for x in inserted)
                    assert len({x['house_id'] for x in inserted}) == 26
                    assert {x['variant_mark_kind'] for x in inserted} >= {'spelling_variant', 'no_counterpart', 'repeated_title'}
                    first_inserted = inserted[0]
                    page.reload(wait_until='networkidle')
                    expect(insertion_dialog).to_be_visible()
                    page.keyboard.press('Escape')
                    expect(insertion_dialog).not_to_be_visible()
                    page.get_by_label('Search', exact=True).fill(first_inserted['house_id'])
                    expect(insertion_summary).to_contain_text('Unmatched House project rows')
                    expect(insertion_summary).to_contain_text(f'₱{int(first_inserted["house_amount_php"]):,}')
                    insertion_summary.get_by_role('button', name='Inspect unsupported insertion candidates', exact=True).click()
                    expect(insertion_dialog.get_by_role('navigation', name='NIA project candidates pages')).to_contain_text('1 rows')
                    with page.expect_download() as result:
                        insertion_dialog.get_by_role('button', name='Export filtered CSV', exact=True).click()
                    filtered_inserted = list(csv.DictReader(StringIO(Path(result.value.path()).read_text(encoding='utf-8-sig'))))
                    assert len(filtered_inserted) == 1 and filtered_inserted[0]['house_id'] == first_inserted['house_id']
                    page.keyboard.press('Escape')
                    page.get_by_role('button', name='Clear filters', exact=True).click()
                    # The search input writes location.hash on every change;
                    # a queued write can race the Clear-filters write and
                    # resurrect q. Wait for the cleared state to land before
                    # switching source, or the table stays empty (0 rows).
                    search = page.get_by_label('Search', exact=True)
                    expect(search).to_have_value('', timeout=60000)
                    expect(page.locator('.fmr-filter-chips, .filter-chips')).to_have_count(0)
                    page.get_by_label('Analysis budget source', exact=True).select_option('nep')
                    # Wait for the source switch to land before paginating; on
                    # slow runners the hashchange re-render can race the click
                    # (Next still reflects the previous filtered state).
                    expect(ai_pages).to_contain_text('327 rows', timeout=60000)
                    ai_pages.get_by_role('button', name='Next', exact=True).click()
                    expect(ai_pages).to_contain_text('Page 2 of')
                    page.get_by_label('AI monitoring title basis', exact=True).select_option('ocr_variant')
                    expect(ai_pages).to_contain_text('Page 1 of')
                    expect(ai_pages).to_contain_text('59 rows')
                    expect(ai_stats).to_contain_text('₱1,365,950,000')
                    expect(insertion_summary).to_contain_text('₱0')
                    expect(insertion_summary).not_to_contain_text('NaN')
                    page.get_by_label('Search', exact=True).fill('nep-nia-p17-y135')
                    expect(ai_pages).to_contain_text('1 rows')
                    expect(page.get_by_role('region', name='NIA projects', exact=True)).to_contain_text('AT Monitoring')
                    with page.expect_download() as result:
                        page.get_by_role('button', name='Export filtered CSV', exact=True).click()
                    selected = list(csv.DictReader(StringIO(Path(result.value.path()).read_text(encoding='utf-8-sig'))))
                    assert len(selected) == 1 and selected[0]['ai_monitoring_basis'] == 'ocr_variant'
                    page.reload(wait_until='networkidle')
                    expect(page.get_by_label('AI monitoring title basis', exact=True)).to_have_value('ocr_variant')
                    expect(ai_pages).to_contain_text('1 rows')
                    page.get_by_role('region', name='NIA projects', exact=True).get_by_role('button', name='PDF p. 17', exact=True).click()
                    pdf_dialog = page.get_by_role('dialog', name='NIA PDF source')
                    expect(pdf_dialog.locator('canvas')).to_be_visible(timeout=60000)
                    page.keyboard.press('Escape')
                    expect(pdf_dialog).not_to_be_visible()
                    page.get_by_role('button', name='Clear filters', exact=True).click()
                    expect(ai_pages).to_contain_text('327 rows')
                    page.get_by_label('Sub-program', exact=True).select_option('Other Irrigation System')
                    expect(ai_pages).to_contain_text('0 rows')
                    expect(ai_stats).not_to_contain_text('NaN')
                    expect(insertion_summary).to_contain_text('Unsupported insertion candidates')
                    page.get_by_role('button', name='Clear filters', exact=True).click()
                    page.screenshot(path=str(captures / f'analysis-ai-monitoring-{width}.png'))
                    page.get_by_label('AI monitoring title basis', exact=True).select_option('explicit')
                    expect(ai_pages).to_contain_text('268 rows')
                    page.get_by_role('navigation', name='Analysis views').get_by_role('link', name='Overview', exact=True).click()
                    assert 'aiBasis=' not in page.url

                    goto('analysis?view=senate')
                    expect(page.get_by_role('link', name='Senate workbook', exact=True)).to_have_attribute('aria-current', 'page')
                    expect(page.locator('main')).to_contain_text("NIA's own hearing workbook")
                    senate_stats = page.locator('.fmr-stats').first
                    expect(senate_stats).to_contain_text('937')
                    expect(senate_stats).to_contain_text('145')
                    expect(senate_stats).to_contain_text('₱5,742,500,000')
                    expect(senate_stats).to_contain_text('108')
                    expect(senate_stats).to_contain_text('94 rows carry a written justification')
                    # Default view is all workbook rows.
                    expect(page.locator('.fmr-result-bar span').first).to_contain_text('937 rows shown')
                    # Title-parse columns: normalized coordinates and chainage
                    # from the preferred title (col V when present).
                    workbook_table = page.get_by_role('region', name='NIA Senate workbook rows', exact=True)
                    expect(workbook_table).to_contain_text('Coordinates')
                    expect(workbook_table).to_contain_text('Chainage')
                    # View selector: insertions, then filter by workbook status.
                    page.get_by_label('Senate workbook view', exact=True).select_option('insertions')
                    expect(page.locator('.fmr-result-bar span').first).to_contain_text('145 rows shown')
                    first_senate = page.locator('.sortable-table tbody tr').first
                    expect(first_senate).to_contain_text('House insertion (no NEP line)')
                    page.get_by_label('Senate workbook view', exact=True).select_option('all')
                    page.get_by_label('Senate workbook status', exact=True).select_option('house_zeroed')
                    expect(page.locator('.fmr-result-bar span').first).to_contain_text('108 rows shown')
                    with page.expect_download() as result:
                        page.get_by_role('button', name='Export filtered CSV', exact=True).click()
                    exported = list(csv.DictReader(StringIO(Path(result.value.path()).read_text(encoding='utf-8-sig'))))
                    assert len(exported) == 108
                    assert all(x['status'] == 'house_zeroed' and int(x['nep_amount']) > 0 for x in exported)
                    assert sum(int(x['nep_amount']) for x in exported) == 4311376000
                    assert 'coordinates' in exported[0] and 'chainage' in exported[0]
                    assert any(x.get('coordinates') for x in exported) or any(x.get('chainage') for x in exported)
                    page.get_by_role('button', name='Clear filters', exact=True).click()
                    # Clear filters resets search/sub-program/status but keeps
                    # the workbook view selector (all); wait for it to land.
                    expect(page.locator('.fmr-result-bar span').first).to_contain_text('937 rows shown', timeout=60000)
                    # Search reaches justification text.
                    page.get_by_label('Search', exact=True).fill('latest site validation')
                    expect(page.locator('.fmr-result-bar span').first).to_contain_text(' rows shown', timeout=60000)
                    page.get_by_role('button', name='Clear filters', exact=True).click()
                    expect(page.get_by_label('Search', exact=True)).to_have_value('', timeout=60000)
                    expect(page.locator('.fmr-result-bar span').first).to_contain_text('937 rows shown', timeout=60000)
                    # Insertion subset via the view selector.
                    page.get_by_label('Senate workbook view', exact=True).select_option('insertions')
                    expect(page.locator('.fmr-result-bar span').first).to_contain_text('145 rows shown')
                    page.get_by_label('Senate workbook view', exact=True).select_option('all')
                    expect(page.locator('.fmr-result-bar span').first).to_contain_text('937 rows shown')
                    # The category table is a workbook-only dimension.
                    expect(page.get_by_role('region', name='NIA Senate workbook categories', exact=True)).to_contain_text('Repair of National Irrigation Systems')
                    # Reconciliation crosstab: five comparison classes against the
                    # workbook-only category level, with the House ledger checksum.
                    recon = page.get_by_role('region', name='NIA reconciliation by hierarchy category', exact=True)
                    expect(recon.locator('tbody tr')).to_have_count(15)
                    expect(recon).to_contain_text('Establishment of Pump Irrigation Projects')
                    # Per-category cells: count · peso for each class.
                    expect(recon).to_contain_text('78 · ₱2,181,000,000')
                    expect(recon).to_contain_text('54 · ₱1,230,000,000')
                    expect(recon).to_contain_text('274 · ₱5,985,950,000')
                    # Pump repair swapped sides: NEP ₱2.75B removed, House ₱460M total.
                    expect(recon).to_contain_text('11 · ₱2,750,000,000')
                    # Malinao Dam is NEP-only: deletions carry its full amount.
                    expect(recon).to_contain_text('1 · ₱490,676,000')
                    expect(recon).to_contain_text('₱8,466,950,000')
                    # Checksum identity holds per category row.
                    rows_data = page.evaluate("""() => {
                      const cells = document.querySelectorAll('#table-senate-category-reconciliation tbody tr');
                      return [...cells].map(tr => {
                        const money = s => Number((s.match(/₱([\d,]+)/)?.[1] || '0').replace(/,/g, ''));
                        const grab = label => [...tr.querySelectorAll('td[data-label]')].find(td => td.dataset.label === label)?.textContent || '';
                        return {insertions: money(grab('Unsupported insertions')), deletions: money(grab('Deletions')),
                          unchanged: money(grab('Unchanged')), increased: money(grab('Increased')),
                          decreased: money(grab('Decreased')), house: money(grab('House ledger (PHP)'))};
                      });
                    }""")
                    for row in rows_data:
                        assert row['house'] == row['insertions'] + row['unchanged'] + row['increased'] + row['decreased'], row
                    assert sum(r['house'] for r in rows_data) == 17999305000
                    # Row-count reconciliation: comparison ledger (1,013) vs workbook (937).
                    bridge = page.get_by_role('region', name='Comparison observations vs Senate workbook rows', exact=True)
                    expect(bridge).to_contain_text('Dataset totals')
                    expect(bridge).to_contain_text('1,013')
                    expect(bridge).to_contain_text('937')
                    expect(page.locator('main')).to_contain_text('CABTRIS')
                    expect(page.locator('.fmr-result-bar span').nth(1)).to_contain_text('77 rows shown')
                    page.get_by_label('Gap reason', exact=True).select_option('repeated_title')
                    expect(page.locator('.fmr-result-bar span').nth(1)).to_contain_text('6 rows shown')
                    page.get_by_label('Gap reason', exact=True).select_option('reworded_printing')
                    expect(page.locator('.fmr-result-bar span').nth(1)).to_contain_text('71 rows shown')
                    page.get_by_label('Gap reason', exact=True).select_option('')
                    expect(page.locator('.fmr-result-bar span').nth(1)).to_contain_text('77 rows shown')
                    with page.expect_download() as result:
                        page.get_by_role('button', name='Export gap rows CSV', exact=True).click()
                    gap_exported = list(csv.DictReader(StringIO(Path(result.value.path()).read_text(encoding='utf-8-sig'))))
                    assert len(gap_exported) == 77
                    assert sum(1 for x in gap_exported if x['reason'] == 'reworded_printing') == 71
                    assert sum(1 for x in gap_exported if x['reason'] == 'repeated_title') == 6
                    assert all(x['nep_id'] and x['house_id'] for x in gap_exported)
                    assert sum(1 for x in gap_exported if x['submission_edited'] == 'OK') == 76
                    assert sum(1 for x in gap_exported if x['submission_edited'] == 'CHECK') == 1
                    assert sum(1 for x in gap_exported if x['justification']) == 14
                    assert sum(1 for x in gap_exported if x['submission_label']) == 77
                    expect(page.locator('#table-senate-gap-rows')).to_contain_text('Fixed title')
                    expect(page.locator('#table-senate-gap-rows')).to_contain_text('NIA edit')
                    expect(page.locator('#table-senate-gap-rows')).to_contain_text('Workbook remark')
                    expect(page.locator('main')).to_contain_text('77 carry a fixed title in workbook column V')
                    expect(page.locator('main')).to_contain_text('14 carry a written remark')
                    page.screenshot(path=str(captures / f'analysis-senate-{width}.png'))

                    goto('analysis?view=candidates')
                    funding = page.get_by_role('region', name='NIA funding reconciliation', exact=True)
                    coverage = page.get_by_role('region', name='NIA pairing coverage', exact=True)
                    expect(funding.locator('tbody tr')).to_have_count(6)
                    expect(coverage).to_contain_text('76.6%')
                    expect(coverage).to_contain_text('73.2%')
                    page.get_by_label('Sub-program', exact=True).select_option('Other Irrigation System')
                    expect(funding.locator('tbody tr')).to_have_count(1)
                    expect(funding).to_contain_text('₱-2,540,000,000')
                    page.get_by_label('Candidate status', exact=True).select_option('changed')
                    expect(funding).to_contain_text('₱-30,000,000')
                    expect(coverage).to_contain_text('100.0%')
                    page.get_by_label('Search', exact=True).fill('missing-source-title')
                    expect(funding).to_contain_text('No rows.')
                    expect(coverage).not_to_contain_text('NaN')
                    page.get_by_role('button', name='Clear filters', exact=True).click()
                    expect(funding.locator('tbody tr')).to_have_count(6)
                    page.screenshot(path=str(captures / f'analysis-candidates-{width}.png'))

                    for side in ('nep', 'house'):
                        stage = data['stages'][side]
                        subprogram = stage['subprograms'][0]['key']
                        # Keep concentration check on sub-program dim (1 filtered row).
                        goto('analysis?' + urlencode({'view': 'stats', 'stage': side, 'subprogram': subprogram, 'dim': 'subprogram'}))
                        concentration = page.get_by_role('region', name='NIA allocation concentration', exact=True)
                        expect(concentration.locator('tbody tr')).to_have_count(1)
                        concentration.get_by_role('button', name='Show 10 rows', exact=True).click()
                        dialog = page.get_by_role('dialog', name='NIA concentration records')
                        expect(dialog).to_be_visible()
                        expected = sorted([x for x in stage['projects'] if x['subprogram_key'] == subprogram],
                                          key=lambda x: (-x['amount_php'], x['id']))[:10]
                        with page.expect_download() as result:
                            dialog.get_by_role('button', name='Export largest rows CSV', exact=True).click()
                        exported = list(csv.DictReader(StringIO(Path(result.value.path()).read_text(encoding='utf-8-sig'))))
                        assert {x['source_id'] for x in exported} == {x['id'] for x in expected}
                        assert sum(int(x['amount_php']) for x in exported) == sum(x['amount_php'] for x in expected)
                        assert all(x['source_pdf'] == stage['projects'][0]['source']['source_pdf'] for x in exported)
                        page.reload(wait_until='networkidle')
                        expect(dialog).to_be_visible()
                        page.keyboard.press('Escape')
                        expect(dialog).not_to_be_visible()
                        page.get_by_label('Search', exact=True).fill(stage['projects'][0]['id'])
                        expect(concentration).to_contain_text('100.0%')
                        expect(concentration.get_by_role('button', name='Show 1 rows', exact=True)).to_be_visible()
                    # Stats still has hierarchy dims; chainage ₱/m lives on its own tab.
                    goto('analysis?view=stats')
                    dims = page.get_by_role('group', name='Break down by')
                    expect(dims.get_by_role('button', name='Category', exact=True)).to_have_attribute('aria-pressed', 'true')
                    expect(page.get_by_role('region', name='NIA chainage cost per meter')).to_have_count(0)
                    page.screenshot(path=str(captures / f'analysis-stats-{width}.png'))
                    goto('analysis?view=chainage')
                    expect(page.get_by_role('link', name='Chainage', exact=True)).to_have_attribute('aria-current', 'page')
                    dims = page.get_by_role('group', name='Break down by')
                    expect(dims.get_by_role('button', name='Category', exact=True)).to_have_attribute('aria-pressed', 'true')
                    chainage = page.get_by_role('region', name='NIA chainage cost per meter', exact=True)
                    expect(chainage).to_be_visible()
                    expect(chainage).to_contain_text('₱/m distribution')
                    expect(page.locator('.nia-ppm-strip').first).to_be_visible()
                    expect(chainage.locator('tbody tr')).to_have_count(
                        len({p.get('category') for p in data['stages']['nep']['projects'] if p.get('category')}))
                    dims.get_by_role('button', name='Sub-program', exact=True).click()
                    assert 'dim=subprogram' in page.url
                    expect(page.get_by_role('region', name='NIA chainage cost per meter', exact=True)
                           .locator('tbody tr')).to_have_count(6)
                    # Explore a hierarchy category: whole-category table + optional map.
                    goto('analysis?view=chainage')
                    chainage = page.get_by_role('region', name='NIA chainage cost per meter', exact=True)
                    first_row = chainage.locator('tbody tr').first
                    first_cat = first_row.locator('th').first.inner_text().strip()
                    cat_n = sum(1 for p in data['stages']['nep']['projects'] if p.get('category') == first_cat)
                    assert cat_n > 0, first_cat
                    page.locator('.nia-chainage-toolbar').get_by_role('button', name='Export…', exact=True).click()
                    export_dlg = page.get_by_role('dialog', name='Export chainage rates')
                    expect(export_dlg).to_be_visible()
                    with page.expect_download() as export_result:
                        export_dlg.get_by_role('button', name='Download Simple CSV', exact=True).click()
                    assert 'Median PHP per m' in Path(export_result.value.path()).read_text(encoding='utf-8-sig')
                    first_row.get_by_role('button', name='Explore projects', exact=True).click()
                    explore = page.get_by_role('dialog', name='NIA chainage category projects')
                    expect(explore).to_be_visible()
                    expect(explore.get_by_role('heading', level=2)).to_contain_text(first_cat)
                    explore_rows = explore.get_by_role('region', name='NIA chainage explore projects', exact=True)
                    expect(explore_rows.locator('tbody tr')).to_have_count(min(cat_n, 50), timeout=10000)
                    # Wait for consolidated join so location buttons resolve.
                    page.wait_for_timeout(800)
                    explore.get_by_role('button', name='Export…', exact=True).click()
                    proj_export = page.get_by_role('dialog', name='Export these projects')
                    expect(proj_export).to_be_visible()
                    page.keyboard.press('Escape')
                    expect(proj_export).not_to_be_visible()
                    map_btn = explore.get_by_role('button', name='View in map', exact=True)
                    if map_btn.count():
                        map_btn.first.click()
                        loc = page.get_by_role('dialog', name='NIA project location')
                        expect(loc).to_be_visible()
                        expect(loc.locator('.nia-map-canvas')).to_be_visible(timeout=20000)
                        expect(page.get_by_role('dialog', name='NIA project details')).to_have_count(0)
                        assert 'view=chainage' in page.url
                        page.keyboard.press('Escape')
                        expect(loc).not_to_be_visible()
                        expect(explore).to_be_visible()
                    page.keyboard.press('Escape')
                    expect(explore).not_to_be_visible()
                    page.screenshot(path=str(captures / f'analysis-chainage-{width}.png'))
                    goto('analysis?view=insertions&pair=null&status=null')
                    expect(page.get_by_role('dialog',name='NIA candidate evidence')).to_have_count(0)
                    expect(page.get_by_role('navigation',name='NIA project candidates pages')).to_contain_text('222 rows')
                    for view, expected_count, side in [('insertions', 222, 'house'), ('deletions', 185, 'nep'), ('adjustments', 4, None)]:
                        goto('analysis?view=' + view)
                        tab_label = {'insertions': 'Unsupported insertions'}.get(view, view.title())
                        expect(page.get_by_role('link', name=tab_label, exact=True)).to_have_attribute('aria-current', 'page')
                        expect(page.get_by_role('navigation', name='NIA project candidates pages')).to_contain_text(f'{expected_count:,} rows')
                        with page.expect_download() as result:
                            page.get_by_role('button', name='Export filtered CSV', exact=True).click()
                        exported = list(csv.DictReader(StringIO(Path(result.value.path()).read_text(encoding='utf-8-sig'))))
                        assert len(exported) == expected_count
                        if side:
                            assert all(x[f'{side}_id'] and not x[f'{"nep" if side == "house" else "house"}_id'] for x in exported)
                        else:
                            assert sum(int(x['delta_php']) for x in exported) == -830000000
                        page.get_by_role('region', name='NIA candidate group totals', exact=True).locator('tbody button.group-open').first.click()
                        group_dialog = page.get_by_role('dialog', name='NIA analysis group records')
                        expect(group_dialog).to_be_visible()
                        expect(group_dialog.get_by_role('region', name='NIA project candidates', exact=True)).to_be_visible()
                        page.reload(wait_until='networkidle')
                        expect(group_dialog).to_be_visible()
                        page.keyboard.press('Escape')
                        expect(group_dialog).not_to_be_visible()
                        page.screenshot(path=str(captures / f'analysis-{view}-{width}.png'))
                    goto('analysis?view=adjustments&direction=increased')
                    expect(page.get_by_role('navigation', name='NIA project candidates pages')).to_contain_text('0 rows')
                    goto('analysis?view=deletions&ranking=ambiguous&dim=program')
                    ambiguous = [r for r in data['comparison'] if r['status'] == 'nep_only' and r.get('ambiguous_title')]
                    expect(page.get_by_role('navigation', name='NIA project candidates pages')).to_contain_text(f'{len(ambiguous)} rows')
                    page.get_by_role('link', name='Unsupported insertions', exact=True).click()
                    expect(page.get_by_role('navigation', name='NIA project candidates pages')).to_contain_text('222 rows')
                    goto('home')
                    assert page.get_by_role('navigation', name='Workbench pages').locator('a').all_text_contents() == [
                        'Home', 'Highlights', 'Compare stages', 'Analysis', 'Map', 'House GAB', 'DBM NEP']
                    page.screenshot(path=str(captures / f'home-{width}.png'))

                    # Map tab: Congress-style layers panel (Title GPS + PSGC with
                    # per-status subtype toggles) plus retained PSGC tables.
                    goto('map')
                    expect(page.get_by_role('region', name='NIA project location map')).to_be_visible()
                    expect(page.locator('main')).to_contain_text('Senate workbook lines')
                    panel = page.locator('.nia-map-panel')
                    expect(panel.get_by_role('button', name=re.compile(r'^Layers'))).to_be_visible()
                    expect(panel).to_contain_text('2/2')
                    # All-points mode is the default (no clustering): markers
                    # are individually clickable. (Marker-mode controls are
                    # hidden on the 390px pass.)
                    if width != 390:
                        expect(page.get_by_role('radio', name='All points')).to_be_checked()
                        # Wait until MapLibre finished loading layers/tiles so
                        # the projected marker click can't race the first render.
                        page.wait_for_function(
                            "() => {const m = document.querySelector('.nia-map-canvas')?._niaMap; return !!m && m.loaded();}",
                            timeout=20000)
                        # Clicking a marker opens the project details dialog.
                        marker = page.evaluate("""() => {
                          const el = document.querySelector('.nia-map-canvas');
                          const map = el._niaMap;
                          const pt = map.project([120.1778305556, 15.9490805556]);
                          const rect = el.getBoundingClientRect();
                          return {x: rect.left + pt.x, y: rect.top + pt.y};
                        }""")
                        page.mouse.click(marker['x'], marker['y'])
                        expect(page.get_by_role('dialog', name='NIA project details')).to_be_visible()
                        expect(page.get_by_role('dialog', name='NIA project details')).to_contain_text('Maniana SPIP')
                        page.get_by_role('button', name='Close', exact=True).click()
                        expect(page.get_by_role('dialog', name='NIA project details')).to_have_count(0)
                    expect(page.get_by_role('checkbox', name='Title GPS', exact=True)).to_be_checked()
                    expect(page.get_by_role('checkbox', name='PSGC centroid (fallback)', exact=True)).to_be_checked()
                    expect(page.locator('.nia-map-controls')).to_contain_text('872 projects')
                    expect(page.locator('.nia-map-controls')).to_contain_text('965 markers')
                    expect(page.locator('.nia-map-legend')).to_contain_text('Pump Irrigation')
                    panel.get_by_role('button', name='Workbook status', exact=True).click()
                    expect(page.locator('.nia-map-legend')).to_contain_text('Both funded')
                    expect(page.locator('.nia-map-legend')).to_contain_text('House insertion')
                    # Isolate PSGC House insertions (title GPS almost never has them).
                    # Prefer the label click: the 13px input is flaky under Playwright
                    # at 1440px (click lands but the controlled React state races).
                    page.locator('label.nia-layer-row', has_text='Title GPS').click()
                    assert 'objects=psgc' in page.url
                    expect(page.get_by_role('checkbox', name='Title GPS', exact=True)).not_to_be_checked()
                    # PSGC-only view: 452 fallback rows on 367 square markers.
                    expect(page.locator('.nia-map-controls')).to_contain_text('452 projects')
                    expect(page.locator('.nia-map-controls')).to_contain_text('367 markers')
                    # Stacked PSGC squares: click the 5-row Balingasag stack
                    # (title GPS off keeps it rendered) and pick a member row.
                    page.evaluate("""() => {
                      document.querySelector('.nia-map-canvas')._niaMap
                        .jumpTo({center: [124.767489, 8.739132], zoom: 11});
                    }""")
                    page.wait_for_timeout(1200)
                    stack = page.evaluate("""() => {
                      const el = document.querySelector('.nia-map-canvas');
                      const map = el._niaMap;
                      const pt = map.project([124.767489, 8.739132]);
                      const rect = el.getBoundingClientRect();
                      return {x: rect.left + pt.x, y: rect.top + pt.y};
                    }""")
                    page.mouse.click(stack['x'], stack['y'])
                    picker = page.get_by_role('dialog', name='Projects at this location')
                    expect(picker).to_be_visible()
                    expect(picker).to_contain_text('5 projects share this centroid')
                    expect(picker.locator('.nia-stack-table tbody tr')).to_have_count(5)
                    expect(picker).to_contain_text('Sub-program')
                    picker.get_by_role('button', name='Close', exact=True).click()
                    expect(picker).to_have_count(0)
                    # Back to the national view for the remaining checks.
                    page.evaluate("""() => {
                      document.querySelector('.nia-map-canvas')._niaMap
                        .fitBounds([[117.5, 5.5], [126.5, 18.5]], {padding: 40, duration: 0});
                    }""")
                    page.wait_for_timeout(500)
                    for status_label in ('Both funded', 'NEP zeroed', 'Unfunded'):
                        page.locator(
                            f'label.nia-layer-type:has(input[aria-label="PSGC centroid (fallback): {status_label}"])'
                        ).click()
                        expect(page.get_by_role(
                            'checkbox', name=f'PSGC centroid (fallback): {status_label}', exact=True)
                        ).not_to_be_checked()
                    expect(page.get_by_role('checkbox', name='PSGC centroid (fallback): House insertion', exact=True)).to_be_checked()
                    expect(page.locator('.nia-map-controls')).to_contain_text('126 projects')
                    page.get_by_role('button', name='Show all', exact=True).click()
                    expect(page.get_by_role('checkbox', name='Title GPS', exact=True)).to_be_checked()
                    expect(page.get_by_role('checkbox', name='PSGC centroid (fallback): House insertion', exact=True)).to_be_checked()
                    # Color mode swaps the subtype toggle dimension: status
                    # toggles become sub-program toggles keyed to the palette.
                    panel.get_by_role('button', name='Sub-program', exact=True).click()
                    assert 'types=' not in page.url
                    expect(page.get_by_role('checkbox', name='PSGC centroid (fallback): Pump Irrigation', exact=True)).to_be_checked()
                    page.locator(
                        'label.nia-layer-type:has(input[aria-label="PSGC centroid (fallback): Pump Irrigation"])'
                    ).click()
                    assert 'types=' in page.url
                    # 872 projects minus the 72 PSGC-fallback pump rows.
                    expect(page.locator('.nia-map-controls')).to_contain_text('800 projects')
                    page.get_by_role('button', name='Workbook status', exact=True).click()
                    expect(page.get_by_role('checkbox', name='PSGC centroid (fallback): Both funded', exact=True)).to_be_checked()
                    assert 'types=' not in page.url
                    panel.get_by_role('button', name='Sub-program', exact=True).click()
                    # All-points is now the default; the Clusters hint only
                    # appears after opting into clustering (desktop only).
                    if width != 390:
                        page.get_by_role('radio', name='Clusters').click()
                        assert 'markers=clusters' in page.url
                        page.get_by_role('radio', name='All points').click()
                        assert 'markers=' not in page.url
                    expect(page.locator('.nia-map-legend')).to_contain_text('markers grow as you zoom in')
                    # Deep-linked project details dialog (marker click-through).
                    goto('map?project=sen%3Ar1583')
                    project_dialog = page.get_by_role('dialog', name='NIA project details')
                    expect(project_dialog).to_be_visible()
                    expect(project_dialog).to_contain_text('Maniana SPIP')
                    expect(project_dialog).to_contain_text('NEP and House funded')
                    expect(project_dialog.locator('.nia-project-sites li')).to_have_count(6)
                    expect(project_dialog).to_contain_text('Multi-site title GPS')
                    expect(project_dialog.get_by_role('link', name='Pair evidence →')).to_have_attribute('href', re.compile('#nia/compare'))
                    project_dialog.get_by_role('button', name='Close', exact=True).click()
                    expect(project_dialog).to_have_count(0)
                    assert 'project=' not in page.url
                    goto('map')
                    page.get_by_role('button', name='Full window ⤢', exact=True).click()
                    assert 'full=1' in page.url
                    expect(page.get_by_role('dialog', name='NIA project map, full window')).to_be_visible()
                    expect(page.get_by_role('button', name='Exit full window ✕', exact=True)).to_be_visible()
                    page.get_by_role('button', name='Exit full window ✕', exact=True).click()
                    assert 'full=' not in page.url
                    expect(page.get_by_role('button', name='Full window ⤢', exact=True)).to_be_visible()
                    distribution = page.get_by_role('region', name='NIA province distribution', exact=True)
                    expected_provinces = len(
                        {r['province'] for r in data['geolocation']['records']
                         if r['located'] and r['province']})
                    expect(distribution.locator('tbody tr')).to_have_count(expected_provinces)
                    expect(distribution).to_contain_text('Ilocos Norte')
                    page.get_by_role('tab', name='Municipalities').click()
                    expect(page.get_by_role('region', name='NIA municipality distribution', exact=True)).to_be_visible()
                    page.get_by_role('tab', name='Legislative districts').click()
                    expect(page.get_by_role('region', name='NIA district distribution', exact=True)).to_be_visible()
                    page.screenshot(path=str(captures / f'map-{width}.png'))

                    # Rebuilt Highlights: coverage tables, findings grid, story
                    # dialogs with filters/exports, and recovery states.
                    goto('highlights')
                    expect(page.get_by_role('region', name='NIA budget coverage by stage', exact=True).locator('tbody tr')).to_have_count(2)
                    changes_table = page.get_by_role('region', name='NIA candidate funding changes', exact=True)
                    expect(changes_table.locator('tbody tr')).to_have_count(5)
                    expect(page.locator('.fmr-funding-bridge')).to_contain_text('= +401,124,000')
                    assert page.locator('.fmr-highlight-grid .fmr-highlight').count() == 9
                    expect(page.locator('.fmr-highlight-grid button[aria-haspopup="dialog"]')).to_have_count(9)
                    page.screenshot(path=str(captures / f'highlights-{width}.png'))
                    # Every card opens actual scoped evidence, with focus restored
                    # to its action button after closing the modal.
                    evidence_regions = [
                        'NIA sub-program stage comparison', 'NIA funding reconciliation',
                        'NIA project candidates', 'NIA unmatched allocations by sub-program',
                        'NIA unmatched allocations by sub-program', 'NIA pairing coverage',
                        'AI monitoring source evidence', 'NIA agency controls', 'Selected source evidence',
                    ]
                    for index, evidence_region in enumerate(evidence_regions):
                        trigger = page.locator('.fmr-highlight-grid button[aria-haspopup="dialog"]').nth(index)
                        trigger.click()
                        modal = page.locator('dialog.nia-highlight-dialog')
                        expect(modal).to_be_visible()
                        expect(modal.locator('.nia-highlight-metrics .fmr-stat')).to_have_count(3)
                        expect(modal.get_by_role('region', name=evidence_region, exact=True)).to_be_visible()
                        assert modal.evaluate('(el) => el.scrollWidth <= el.clientWidth'), page.url
                        assert page.evaluate('document.body.style.overflow') == 'hidden'
                        if index in (0, 1, 6, 8):
                            page.screenshot(path=str(captures / f'highlight-evidence-{index}-{width}.png'))
                        if index == 1:
                            modal.get_by_label('Search', exact=True).fill('Other')
                            expect(modal.get_by_role('region', name='NIA sub-program stage comparison', exact=True).locator('tbody tr')).to_have_count(1)
                            expect(modal.get_by_role('region', name='NIA funding reconciliation', exact=True)).to_contain_text('₱-2,540,000,000')
                            expect(modal.get_by_role('navigation', name='NIA project candidates pages')).to_contain_text('16 rows')
                        if index == 6:
                            expect(modal).to_contain_text('327 supporting DBM NEP rows')
                            expect(modal).to_contain_text('₱7,015,950,000 in whole-project allocations')
                            modal.get_by_role('link', name='House AI rows', exact=True).click()
                            expect(modal).to_contain_text('299 supporting House GAB rows')
                            expect(modal).to_contain_text('₱6,341,950,000 in whole-project allocations')
                            with page.expect_download() as result:
                                modal.get_by_role('button', name='Export filtered CSV', exact=True).click()
                            exported_ai = list(csv.DictReader(StringIO(Path(result.value.path()).read_text(encoding='utf-8-sig'))))
                            assert len(exported_ai) == 299 and sum(int(x['amount_php']) for x in exported_ai) == 6341950000
                            modal.get_by_role('link', name='Unmatched House AI rows', exact=True).click()
                            expect(modal.get_by_role('navigation', name='NIA project candidates pages')).to_contain_text('26 rows')
                            expect(modal).to_contain_text('₱556,000,000 in whole-project allocations')
                            page.reload(wait_until='networkidle')
                            expect(modal.get_by_role('navigation', name='NIA project candidates pages')).to_contain_text('26 rows')
                        if index == 8:
                            crop = modal.get_by_role('region', name='Selected source evidence').locator('img').first
                            expect(crop).to_be_visible()
                            crop.scroll_into_view_if_needed()
                            page.wait_for_function('(el) => el.complete && el.naturalWidth > 0', arg=crop.element_handle())
                        if index == 0:
                            modal.get_by_role('button', name='NEP control', exact=True).first.click()
                            pdf = page.get_by_role('dialog', name='NIA PDF source', exact=True)
                            expect(pdf.locator('canvas')).to_be_visible(timeout=60000)
                            page.keyboard.press('Escape')
                            expect(pdf).to_have_count(0)
                            expect(modal).to_be_visible()
                            assert page.evaluate('document.body.style.overflow') == 'hidden'
                        # Native search inputs consume Escape to clear text.
                        # Exercise the close button after the heading search.
                        if index == 1:
                            modal.get_by_role('button', name='Close evidence', exact=True).click()
                        else:
                            page.keyboard.press('Escape')
                        expect(modal).to_have_count(0)
                        # Reload has no connected original trigger to restore.
                        if index != 6:
                            expect(trigger).to_be_focused()
                        assert page.evaluate('document.body.style.overflow') != 'hidden'
                    goto('highlights?story=changed-pairs')
                    story = page.get_by_role('dialog', name='Highlight evidence: 4 paired titles change amount, all reductions')
                    expect(story).to_be_visible()
                    expect(story.locator('.fmr-story-facts')).to_contain_text('Investigation question')
                    expect(story.get_by_role('navigation', name='NIA project candidates pages')).to_contain_text('4 rows')
                    with page.expect_download() as result:
                        story.get_by_role('button', name='Export filtered CSV', exact=True).click()
                    exported = list(csv.DictReader(StringIO(Path(result.value.path()).read_text(encoding='utf-8-sig'))))
                    assert len(exported) == 4 and sum(int(x['delta_php']) for x in exported) == -830000000
                    story.get_by_label('Sub-program', exact=True).select_option('Other Irrigation System')
                    expect(story.get_by_role('navigation', name='NIA project candidates pages')).to_contain_text('1 rows')
                    page.reload(wait_until='networkidle')
                    expect(story).to_be_visible()
                    expect(story.get_by_role('navigation', name='NIA project candidates pages')).to_contain_text('1 rows')
                    page.keyboard.press('Escape')
                    expect(story).to_have_count(0)
                    for story_id, label in [('annex-increase', 'NIA sub-program stage comparison'),
                                            ('agency-scope', 'NIA agency controls'),
                                            ('extraction-review', 'NIA projects')]:
                        goto(f'highlights?story={story_id}')
                        expect(page.get_by_role('dialog', name='Highlight evidence:')).to_contain_text('Investigation question')
                        expect(page.get_by_role('region', name=label, exact=True).first).to_be_visible()
                        page.keyboard.press('Escape')
                    goto('highlights?story=missing')
                    expect(page.get_by_role('alert')).to_contain_text('Finding not found')
                    page.get_by_role('button', name='Clear story selection', exact=True).click()
                    expect(page.locator('.fmr-highlight-grid')).to_be_visible()
                    goto('highlights?story=insertions')
                    insertions_dialog = page.get_by_role('dialog', name='Highlight evidence: 222 House rows have no unique NEP title match')
                    with page.expect_download() as result:
                        insertions_dialog.get_by_role('button', name='Export filtered CSV', exact=True).click()
                    exported = list(csv.DictReader(StringIO(Path(result.value.path()).read_text(encoding='utf-8-sig'))))
                    assert len(exported) == 222 and all(x['house_id'] and not x['nep_id'] for x in exported)
                    page.keyboard.press('Escape')
                    expect(page.locator('dialog[open]')).to_have_count(0)

                    for side in ('nep', 'house'):
                        stage = data['stages'][side]
                        goto(side)
                        pdf_page(stage.get('root', {}).get('source', stage['subprograms'][0]['source'])['pdf_page'])
                        tree = page.get_by_role('region', name=f'{stage["label"]} source tree')
                        tree.get_by_role('button', name='Expand all sub-programs').click()
                        expect(tree.locator('li')).to_have_count(len(stage['projects']))
                        tree.locator('li button').first.click()
                        evidence = page.get_by_role('region', name='Selected source evidence')
                        expect(evidence).to_contain_text(stage['projects'][0]['title'])
                        expect(evidence).to_contain_text('Project leaf')
                        crumbs = evidence.get_by_role('navigation', name='Source breadcrumbs')
                        crumbs.locator('a').nth(1).click()
                        expect(evidence).to_contain_text('Balanced')
                        page.reload(wait_until='networkidle')
                        expect(evidence).to_contain_text('Balanced')
                        page.get_by_role('link', name='Projects', exact=True).click()
                        pagination = page.get_by_role('navigation', name='NIA projects pages')
                        pagination.get_by_role('button', name='Next', exact=True).click()
                        expect(pagination).to_contain_text('Page 2 of')
                        page.get_by_role('button', name='Allocation (PHP)', exact=True).click()
                        expect(pagination).to_contain_text('Page 1 of')
                        page.get_by_label('Search', exact=True).fill(stage['projects'][0]['id'])
                        expect(pagination).to_contain_text('1 rows')
                        with page.expect_download() as result:
                            page.get_by_role('button', name='Export filtered CSV', exact=True).click()
                        records = list(csv.DictReader(StringIO(Path(result.value.path()).read_text(encoding='utf-8-sig'))))
                        assert len(records) == 1 and records[0]['source_id'] == stage['projects'][0]['id']
                        assert int(records[0]['amount_php']) == stage['projects'][0]['amount_php']
                        assert records[0]['source_pdf'] == stage['projects'][0]['source']['source_pdf']
                        goto(side + '?view=review&status=repeated')
                        expected = len([x for x in stage['projects'] if x.get('repeated_title')])
                        expect(page.get_by_role('navigation', name='NIA projects pages')).to_contain_text(f'{expected} rows')
                        page.screenshot(path=str(captures / f'{side}-review-{width}.png'))

                    flagged = next(x for x in data['stages']['nep']['projects'] if any(f.get('evidence_crop') for f in x['flag_details']))
                    goto('nep?' + urlencode({'node': flagged['id']}))
                    expect(page.locator('.fmr-review-image').first).to_be_visible()
                    page.locator('.fmr-review-image').first.scroll_into_view_if_needed()
                    page.wait_for_function("document.querySelector('.fmr-review-image')?.complete && document.querySelector('.fmr-review-image')?.naturalWidth > 0")
                    assert page.locator('.fmr-review-image').first.evaluate('(img) => img.naturalWidth > 0')

                    goto('compare?view=projects&status=changed')
                    expect(page.get_by_role('navigation', name='NIA project candidates pages')).to_contain_text('4 rows')
                    with page.expect_download() as result:
                        page.get_by_role('button', name='Export filtered CSV', exact=True).click()
                    exported = list(csv.DictReader(StringIO(Path(result.value.path()).read_text(encoding='utf-8-sig'))))
                    assert len(exported) == 4
                    assert all(x['nep_id'] and x['house_id'] and x['nep_pdf_page'] and x['house_pdf_page'] for x in exported)
                    page.get_by_role('region', name='NIA project candidates', exact=True).locator('tbody button').first.click()
                    dialog = page.get_by_role('dialog', name='NIA candidate evidence')
                    expect(dialog).to_be_visible()
                    page.reload(wait_until='networkidle')
                    expect(dialog).to_be_visible()
                    dialog.get_by_role('button', name='Close', exact=True).click()
                    expect(dialog).not_to_be_visible()
                    goto('compare?view=projects&sort=house_php&dir=desc&page=3')
                    expect(page.get_by_role('navigation', name='NIA project candidates pages')).to_contain_text('Page 3 of')
                    page.reload(wait_until='networkidle')
                    expect(page.get_by_role('navigation', name='NIA project candidates pages')).to_contain_text('Page 3 of')
                    goto('home')
                    page.get_by_role('button', name='NEP control', exact=True).first.click()
                    pdf_dialog = page.get_by_role('dialog', name='NIA PDF source')
                    expect(pdf_dialog.locator('canvas')).to_be_visible(timeout=60000)
                    page.keyboard.press('Escape')
                    expect(pdf_dialog).not_to_be_visible()
                    goto('nep?node=missing')
                    expect(page.get_by_role('alert')).to_contain_text('Unknown source selection')
                    page.get_by_role('button', name='Select annex root').click()
                    expect(page.get_by_role('region', name='Selected source evidence')).to_contain_text('Derived annex total')
                    goto('compare?pair=missing')
                    expect(page.get_by_role('alert')).to_contain_text('Unknown candidate selection')
                    goto('missing')
                    expect(page.locator('h1')).to_have_text('Page not found')
                    goto('home?pdf=unknown&pdfPage=1')
                    expect(page.get_by_role('alert')).to_contain_text('Unknown PDF source')
                    goto('compare')
                    page.get_by_role('navigation', name='Workbench workspaces').get_by_role('link', name='DA Farm-to-Market Roads', exact=True).click()
                    assert '#fmr/compare' in page.url
                    expect(page.locator('h1')).to_contain_text('Compare')
                    page.get_by_role('navigation', name='Workbench workspaces').get_by_role('link', name='NIA Irrigation', exact=True).click()
                    expect(page.locator('h1')).to_have_text('Compare NIA stages')
                    assert not page.evaluate('document.documentElement.scrollWidth > innerWidth')
                    page.close()
                    print(f'{width}px: NIA views, source trees, arithmetic, exports, links and PDFs pass', flush=True)
                browser.close()
        finally:
            server.shutdown()
    assert not errors, errors
    assert not bad, bad
    assert ranges, 'No byte-range PDF response observed'
    print('NIA browser checks passed; screenshots in /tmp/nia-ui-verification')


if __name__ == '__main__':
    main()
