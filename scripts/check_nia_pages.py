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
from serve_pages import RangeHandler, check_widths
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
                    page.on('pageerror', lambda e: errors.append(str(e)))
                    page.on('response', lambda r: bad.append((r.url, r.status)) if r.status >= 400
                            else ranges.append(r.url) if r.status == 206 else None)

                    def goto(route):
                        page.goto(base + '#nia/' + route, wait_until='networkidle')
                        expect(page.locator('h1')).to_be_visible()
                        assert not page.evaluate('document.documentElement.scrollWidth > innerWidth'), page.url

                    def pdf_page(expected_page):
                        pane = page.get_by_role('complementary', name='Inline source PDF')
                        expect(pane.locator('canvas')).to_be_visible(timeout=60000)
                        expect(pane.get_by_role('status')).to_contain_text(f'Page {expected_page} of ', timeout=60000)

                    page.goto(base.replace('/app/', '/nia/') + '?preview=nia#nep', wait_until='networkidle')
                    assert '/app/?preview=nia#nia/nep' in page.url
                    for route in ('home', 'highlights', 'compare', 'compare?view=projects', 'analysis',
                                  'analysis?view=stats', 'analysis?view=ai_monitoring', 'analysis?stage=house', 'analysis?view=candidates', 'analysis?view=controls',
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
                        'Overview', 'Insertions', 'Deletions', 'Adjustments', 'Statistics', 'AI monitoring', 'Candidates', 'Agency controls']
                    expect(page.get_by_label('Analysis budget source', exact=True)).to_have_value('nep')
                    expect(page.get_by_role('region', name='NIA allocation overview', exact=True)).to_contain_text('Allocation share')
                    page.get_by_label('Analysis budget source', exact=True).select_option('house')
                    expect(page.locator('.fmr-stats')).to_contain_text('₱17,999,305,000')
                    page.screenshot(path=str(captures / f'analysis-overview-{width}.png'))
                    for label, expected_count in [('Insertions',222),('Deletions',185),('Adjustments',4),('Candidates',1013)]:
                        page.get_by_role('link',name=label,exact=True).click()
                        expect(page.get_by_role('dialog',name='NIA candidate evidence')).to_have_count(0)
                        expect(page.get_by_role('navigation',name='NIA project candidates pages')).to_contain_text(f'{expected_count:,} rows')
                        assert 'pair=null' not in page.url and 'status=null' not in page.url

                    goto('analysis?view=ai_monitoring')
                    expect(page.get_by_role('link', name='AI monitoring', exact=True)).to_have_attribute('aria-current', 'page')
                    expect(page.locator('main')).to_contain_text('Amounts cover the whole irrigation project')
                    ai_pages = page.get_by_role('navigation', name='NIA projects pages')
                    ai_stats = page.locator('.fmr-stats').first
                    insertion_summary = page.get_by_role('region', name='AI monitoring insertion summary')
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
                    insertion_summary.get_by_role('button', name='Inspect insertion candidates', exact=True).click()
                    insertion_dialog = page.get_by_role('dialog', name='NIA AI monitoring insertion candidates')
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
                    insertion_summary.get_by_role('button', name='Inspect insertion candidates', exact=True).click()
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
                    expect(insertion_summary).to_contain_text('Insertion candidates')
                    page.get_by_role('button', name='Clear filters', exact=True).click()
                    page.screenshot(path=str(captures / f'analysis-ai-monitoring-{width}.png'))
                    page.get_by_label('AI monitoring title basis', exact=True).select_option('explicit')
                    expect(ai_pages).to_contain_text('268 rows')
                    page.get_by_role('navigation', name='Analysis views').get_by_role('link', name='Overview', exact=True).click()
                    assert 'aiBasis=' not in page.url

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
                        goto('analysis?' + urlencode({'view': 'stats', 'stage': side, 'subprogram': subprogram}))
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
                    page.screenshot(path=str(captures / f'analysis-stats-{width}.png'))
                    goto('analysis?view=insertions&pair=null&status=null')
                    expect(page.get_by_role('dialog',name='NIA candidate evidence')).to_have_count(0)
                    expect(page.get_by_role('navigation',name='NIA project candidates pages')).to_contain_text('222 rows')
                    for view, expected_count, side in [('insertions', 222, 'house'), ('deletions', 185, 'nep'), ('adjustments', 4, None)]:
                        goto('analysis?view=' + view)
                        expect(page.get_by_role('link', name=view.title(), exact=True)).to_have_attribute('aria-current', 'page')
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
                    page.get_by_role('link', name='Insertions', exact=True).click()
                    expect(page.get_by_role('navigation', name='NIA project candidates pages')).to_contain_text('222 rows')
                    goto('home')
                    assert page.get_by_role('navigation', name='Workbench pages').locator('a').all_text_contents() == [
                        'Home', 'Highlights', 'Compare stages', 'Analysis', 'House GAB', 'DBM NEP']
                    page.screenshot(path=str(captures / f'home-{width}.png'))

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
