#!/usr/bin/env python3
"""Exercise loaded HFEP views, provenance exports, routing and inline PDF review."""
import csv
from io import StringIO
from functools import partial
from http.server import ThreadingHTTPServer
import os
import re
import tempfile
import threading
from pathlib import Path
from playwright.sync_api import expect, sync_playwright
from serve_pages import RangeHandler, check_widths
from analysis_checks import check_analysis_links, check_banded_overview, check_candidate_group

ROOT = Path(__file__).resolve().parents[1]


class Quiet(RangeHandler):
    def log_message(self, *args):
        pass


def main():
    import json
    data = json.loads((ROOT / 'other-analysis/data/hfep_workbench.json').read_text())
    errors, bad = [], []
    captures = Path('/tmp/hfep-ui-verification')
    captures.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory() as directory:
        prefix = 'HFEP-preview'
        Path(directory, prefix).symlink_to(ROOT / '_site', target_is_directory=True)
        server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Quiet, directory=directory))
        threading.Thread(target=server.serve_forever, daemon=True).start()
        external = os.environ.get('HFEP_WORKBENCH_URL')
        base = external or f'http://127.0.0.1:{server.server_port}/{prefix}/app/'
        try:
            with sync_playwright() as p:
                chrome = os.environ.get('CHROME_BIN') or '/usr/bin/google-chrome'
                browser = p.chromium.launch(headless=True, executable_path=chrome, args=['--no-sandbox'])
                for width in check_widths():
                    page = browser.new_page(viewport={'width': width, 'height': 1000}, accept_downloads=True)
                    page.on('pageerror', lambda e: errors.append(str(e)))
                    page.on('response', lambda r: bad.append((r.url, r.status)) if r.status >= 400 else None)

                    def goto(route):
                        page.goto(base + '#hfep/' + route, wait_until='networkidle')
                        expect(page.locator('h1')).to_be_visible()

                    def no_overflow():
                        assert not page.evaluate('document.documentElement.scrollWidth > innerWidth'), page.url

                    def source_pdf(expected_page):
                        pane = page.get_by_role('complementary', name='Inline source PDF')
                        expect(pane.locator('canvas')).to_be_visible(timeout=60000)
                        expect(pane.get_by_role('status')).to_contain_text(f'Page {expected_page} of ', timeout=60000)
                        return pane

                    goto('home')
                    tabs = page.get_by_role('navigation', name='Workbench pages')
                    assert tabs.locator('a').all_text_contents() == ['Home', 'Highlights', 'Compare stages', 'Analysis', 'House GAB', 'DBM NEP']
                    # The workspace selector exposes all registered workspaces.
                    workspaces = page.get_by_role('navigation', name='Workbench workspaces')
                    assert workspaces.locator('a').all_text_contents() == ['Overview', 'DPWH', 'DA Farm-to-Market Roads', 'DOH Health Facilities', 'NIA Irrigation', 'Geolocation', 'Sources']
                    expect(page.locator('main')).to_contain_text('10,021,659,000')
                    no_overflow()
                    page.screenshot(path=str(captures / f'home-{width}.png'))

                    def show_tree():
                        # Selecting a node flips the mobile panel to evidence.
                        if width == 390:
                            page.get_by_role('button', name='Tree / results').click()

                    for route in ['highlights', 'highlights?story=nep-defect', 'highlights?story=agency-check',
                                  'analysis', 'analysis?view=categories', 'analysis?view=stats', 'analysis?view=review']:
                        goto(route)
                        no_overflow()
                        if route in ('highlights', 'analysis?view=stats'):
                            page.screenshot(path=str(captures / f'{route.replace("?", "-").replace("=", "-")}-{width}.png'))
                    print(f'{width}px: all main and analysis views render without overflow', flush=True)

                    # Agency controls use their own document: House Volume I-A
                    # rather than the Volume I-B facility annex.
                    goto('highlights?story=lgu-split')
                    story = page.get_by_role('dialog', name=re.compile('^Highlight evidence:'))
                    story.get_by_text('Scope note: annex capital outlays and operating expenses', exact=True).click()
                    for stage in ['nep', 'house']:
                        source = data['stages'][stage]['agency_check']['source']
                        story.get_by_role('button', name=f'Agency row · PDF p. {source["pdf_page"]}').click()
                        modal = page.get_by_role('dialog', name='HFEP PDF source', exact=True)
                        expect(modal.locator('canvas')).to_be_visible(timeout=60000)
                        expect(modal.get_by_label('PDF page', exact=True)).to_have_value(str(source['pdf_page']))
                        expect(modal.get_by_role('link', name='Download source PDF')).to_have_attribute(
                            'href', re.compile(re.escape(Path(source['source_pdf']).name).replace(r'\ ', '(?: |%20)')))
                        modal.get_by_role('button', name='Close PDF').click()
                        expect(modal).not_to_be_visible()
                        expect(story).to_be_visible()
                    story.get_by_role('button', name='Close evidence').click()
                    print(f'{width}px: agency controls open the correct PDF volumes', flush=True)

                    # Cross-document analysis: insertions, deletions, adjustments.
                    check_analysis_links(page, goto, 'insertions', 'insertions-by-region', tabs='Workspace views')
                    for view in ('insertions', 'deletions'):
                        check_candidate_group(page, goto, view, f'{view}-by-region', 'Funding-column records', 'HFEP analysis group records', 'Export group CSV')
                        goto(f'analysis?view={view}')
                        # This export covers all records, including those beyond the top-150 table.
                        with page.expect_download() as result:
                            page.get_by_role('button', name='Export filtered records CSV', exact=True).click()
                        exported = list(csv.DictReader(StringIO(Path(result.value.path()).read_text(encoding='utf-8-sig'))))
                        assert len(exported) == (184 if view == 'insertions' else 163)
                    check_candidate_group(page, goto, 'insertions', 'insertions-by-region', 'Funding-column records', 'HFEP analysis group records', 'Export group CSV', query='Hospital')
                    goto('analysis?view=deletions&group=missing')
                    expect(page.get_by_role('dialog', name='HFEP analysis group records').get_by_role('alert')).to_contain_text('Unknown analysis group')
                    goto('analysis?view=insertions')
                    expect(page.get_by_role('region', name='Top unmatched House records')).to_be_visible()
                    expect(page.locator('.fmr-stats')).to_contain_text('184')
                    expect(page.locator('.fmr-notice').first).to_contain_text('funding-column record grain')
                    no_overflow()
                    goto('analysis?view=deletions')
                    expect(page.get_by_role('region', name='Top unmatched NEP records')).to_be_visible()
                    expect(page.locator('.fmr-stats')).to_contain_text('163')
                    no_overflow()
                    goto('analysis?view=adjustments')
                    expect(page.get_by_role('region', name='Revised line-item Records')).to_be_visible()
                    expect(page.locator('.fmr-stats').nth(0)).to_contain_text('Revised records')
                    expect(page.locator('.fmr-notice')).to_contain_text('West Visayas State University Medical Center')
                    # Per-column deltas render with signs on revised records.
                    pairs_table = page.get_by_role('region', name='Revised line-item Records')
                    expect(pairs_table.locator('thead')).to_contain_text('(PHP)')
                    expect(pairs_table.locator('tbody [data-label="NEP − House (PHP)"] .up').first).to_contain_text('+')
                    # Every record table in analysis carries PDF page references.
                    for view, name in [('adjustments', 'Revised line-item Records'), ('deletions', 'Top unmatched NEP records'),
                                       ('insertions', 'Top unmatched House records')]:
                        if view != 'adjustments':
                            goto(f'analysis?view={view}')
                        page.get_by_role('region', name=name).get_by_role(
                            'button', name=re.compile(r'^(PDF|House|NEP|Vol I-B|Vol II-A) p\.')).first.click()
                        modal = page.get_by_role('dialog', name='HFEP PDF source')
                        expect(modal.locator('canvas')).to_be_visible(timeout=60000)
                        modal.get_by_role('button', name='Close PDF').click()
                        expect(modal).not_to_be_visible()
                    print('analysis record tables open PDF page references in the modal viewer', flush=True)
                    no_overflow()
                    if width == 1440:
                        page.screenshot(path=str(captures / 'analysis-adjustments-1440.png'))
                    print(f'{width}px: insertion, deletion and adjustment views render', flush=True)

                    # Compare stages: column reconciliation + reviewable pairs.
                    goto('compare')
                    expect(page.locator('.hero')).to_contain_text('Compare budget stages')
                    expect(page.locator('.stage-totals')).to_contain_text('10,021,659,000')
                    expect(page.get_by_role('region', name='Column reconciliation')).to_contain_text('4,451,000,000')
                    expect(page.get_by_role('region', name='Column reconciliation')).to_contain_text('180,122,000')
                    no_overflow()
                    page.screenshot(path=str(captures / f'compare-columns-{width}.png'))
                    goto('compare?view=pairs')
                    expect(page.get_by_role('button', name='Funding Records')).to_have_attribute('aria-pressed', 'true')
                    expect(page.get_by_role('region', name='Funding records')).to_be_visible()
                    expect(page.locator('.result-count')).to_contain_text('341 pairs')
                    # Grouped headers split facility totals from funding-column records.
                    expect(page.get_by_role('region', name='Funding records')).to_contain_text('Facility grand totals')
                    expect(page.get_by_role('region', name='Funding records')).to_contain_text('Funding-column records')
                    expect(page.get_by_role('region', name='Funding records')).to_contain_text('printed funding-column record')
                    # Filtering to revised pairs narrows the review scope.
                    page.get_by_label('Pair status').select_option(label='With revised records')
                    expect(page.locator('.result-count')).to_contain_text('78 of 341 pairs')
                    no_overflow()
                    # Sorting pairs re-orders facility rows; mobile gets the dropdown control.
                    pairs_region = page.get_by_role('region', name='Funding records')
                    first_facility = pairs_region.locator('tbody tr.pair-facility-row').first
                    first_before = first_facility.inner_text()
                    if width == 390:
                        page.get_by_label('Sort pairs').select_option('total_nep')
                        page.get_by_role('button', name=re.compile(r'^Ascending')).click()
                    else:
                        page.get_by_role('button', name='Sort by Facility NEP').click()
                    expect(page.locator('.result-count')).to_contain_text('78 of 341 pairs')
                    # Hash navigation renders asynchronously; wait for the row
                    # order itself, since the filtered count stays unchanged.
                    expect(first_facility).not_to_have_text(first_before)
                    first_after = first_facility.inner_text()
                    if width == 390:  # flip direction via the same dropdown control
                        page.get_by_role('button', name=re.compile(r'^Descending')).click()
                    else:
                        page.get_by_role('button', name='Sort by Facility NEP').click()  # toggle to descending
                    expect(first_facility).not_to_have_text(first_after)
                    # Record-column sort keeps facility hierarchy; groups reorder by min/max record.
                    baseline = first_facility.inner_text()
                    if width == 390:
                        page.get_by_label('Sort pairs').select_option('record_delta')
                    else:
                        page.get_by_role('button', name=re.compile(r'Sort by Record .+ HGAB')).click()
                    expect(page.locator('.result-count')).to_contain_text('78 of 341 pairs')
                    expect(first_facility).not_to_have_text(baseline, timeout=5000)
                    expect(pairs_region.locator('tbody tr.pair-record-row').first).to_be_visible()
                    # Within the first facility group, record rows follow the same asc order.
                    within_group = pairs_region.locator('tbody').evaluate('''tbody => {
                      const rows = [...tbody.querySelectorAll('tr')];
                      const start = rows.findIndex(r => r.classList.contains('pair-facility-row'));
                      const records = [];
                      for (let i = start + 1; i < rows.length; i++) {
                        if (rows[i].classList.contains('pair-facility-row')) break;
                        if (!rows[i].classList.contains('pair-record-row')) continue;
                        const cell = rows[i].querySelector('[data-label="Record Δ HGAB"]');
                        const text = (cell?.textContent || '').replace(/[₱,]/g, '').trim();
                        if (text && text !== '—' && text !== 'same') records.push(Number(text));
                      }
                      return records;
                    }''')
                    assert len(within_group) >= 1, 'facility group still nests record rows'
                    assert within_group == sorted(within_group), 'records inside group follow record sort'
                    first_by_record = first_facility.inner_text()
                    if width == 390:
                        page.get_by_role('button', name=re.compile(r'^Ascending|^Descending')).click()
                    else:
                        page.get_by_role('button', name=re.compile(r'Sort by Record .+ HGAB')).click()
                    expect(first_facility).not_to_have_text(first_by_record, timeout=5000)
                    expect(pairs_region.locator('tbody tr.pair-facility-row').first).to_be_visible()
                    expect(pairs_region.locator('tbody tr.pair-record-row').first).to_be_visible()
                    page.screenshot(path=str(captures / f'compare-pairs-sorted-{width}.png'))
                    no_overflow()
                    print(f'{width}px: compare stages reconciles columns and reviews pairs', flush=True)
                    # A pair facility row links both source documents; the PDF opens in the side pane.
                    row = page.get_by_role('region', name='Funding records').locator('tbody tr.pair-facility-row').first
                    row.get_by_role('button', name='House p.').click()
                    pane = page.get_by_role('complementary', name='PDF source pane')
                    expect(pane.locator('canvas')).to_be_visible(timeout=60000)
                    no_overflow()
                    page.screenshot(path=str(captures / f'compare-pairs-{width}.png'))
                    print(f'{width}px: pair source evidence opens the inline PDF pane', flush=True)

                    for stage in ['house', 'nep']:
                        s = data['stages'][stage]
                        goto(stage)
                        # Root control selected: PDF opens at the annex title page.
                        source_pdf(s['root']['source']['pdf_page'])
                        tree = page.get_by_role('region', name=f'{s["label"]} source tree')
                        expect(tree.locator('.fmr-tree-root')).to_contain_text(s['root']['label'])
                        # Expand categories, then walk the payload's own node IDs
                        # down one real branch: category → subcategory → region →
                        # province → facility. Selecting auto-expands each level.
                        tree.get_by_role('button', name='Expand categories').click()
                        category = s['categories'][0]
                        subcategory = next(n for n in s['subcategories'] if n['id'] in category['child_ids'])
                        region = next(n for n in s['regions'] if n['id'] in subcategory['child_ids'])
                        province = next(n for n in s['provinces'] if n['id'] in region['child_ids'])
                        facility = next(n for n in s['facilities'] if n['id'] in province['facility_ids'])
                        evidence = page.get_by_role('region', name='Selected source evidence')
                        for level, node_id in [('category', category['id']), ('subcategory', subcategory['id']),
                                               ('region', region['id']), ('province', province['id']), ('facility', facility['id'])]:
                            show_tree()
                            tree.locator(f'button[data-node="{node_id}"]').click()
                            page.wait_for_timeout(250)
                        crumbs = evidence.get_by_role('navigation', name='Source breadcrumbs')
                        assert crumbs.locator('a').count() >= 4, 'five-level breadcrumbs'
                        expect(evidence).to_contain_text('Facility evidence')
                        expect(evidence).to_contain_text(facility['title'][:40])
                        page.screenshot(path=str(captures / f'{stage}-evidence-{width}.png'))
                        # Facilities table: sort, page, provenance badge, source button.
                        page.get_by_role('link', name='Facilities', exact=True).click()
                        expect(page.get_by_role('region', name='HFEP facilities')).to_be_visible()
                        pagination = page.get_by_role('navigation', name='HFEP facilities pages')
                        pagination.get_by_role('button', name='Next', exact=True).click()
                        expect(pagination).to_contain_text('Page 2 of ')
                        no_overflow()
                        # Filters narrow the ledger; counts state their grain.
                        page.get_by_label('Region', exact=True).select_option(label=next(
                            label for label in page.get_by_label('Region', exact=True).locator('option').all_text_contents()
                            if 'facilities' in label and not label.startswith('All')))
                        expect(page.locator('.fmr-result-bar')).to_contain_text('matching facilities')
                        no_overflow()
                        page.get_by_role('button', name='Clear filters').click()
                        if stage == 'nep':
                            # Review queue lists the documented extraction findings.
                            page.get_by_role('link', name='Extraction review', exact=True).click()
                            expect(page.locator('.fmr-queue-bar')).to_contain_text('facilities in this review scope')
                            expect(page.get_by_label('Review categories')).to_contain_text('OCR-suspect label')
                            no_overflow()
                        # The documented defect chain renders on the NEP tree.
                        if stage == 'nep':
                            goto('nep?view=tree&node=nep_hfep:p2%3Ar47')
                            evidence = page.get_by_role('region', name='Selected source evidence')
                            expect(evidence).to_contain_text('Metro Manila')
                            expect(evidence.locator('.fmr-arithmetic')).to_contain_text('documented difference')
                            no_overflow()
                        # Workspace switching keeps the reader on the analogous tab.
                        if width == 1440:
                            page.get_by_role('navigation', name='Workbench workspaces').get_by_role('link', name='DOH Health Facilities').click()
                            expect(page.locator('h1')).to_contain_text(s['label'])
                    print(f'{width}px: source trees, facility tables, filters and review render', flush=True)

                # Exported CSV downloads with the formula guard and raw marks.
                page = browser.new_page(viewport={'width': 1440, 'height': 1000}, accept_downloads=True)
                page.on('pageerror', lambda e: errors.append(str(e)))
                page.goto(base + '#hfep/nep?view=facilities', wait_until='networkidle')
                with page.expect_download() as download:
                    page.get_by_role('button', name='Export filtered CSV').click()
                export = download.value
                text = open(export.path(), encoding='utf-8-sig', newline='').read()
                assert text.count('\r\n') >= 400, 'facility rows exported'
                assert 'ocr_suspect_label' in text or "''" in text or "'=" in text, 'provenance or raw marks exported'
                print('CSV export contains facilities and provenance', flush=True)
                browser.close()
        finally:
            server.shutdown()
        if errors or bad:
            raise SystemExit(f'Console errors: {errors[:3]} Failed responses: {bad[:3]}')
    print(f'HFEP browser verification passed; screenshots in {captures}')


if __name__ == '__main__':
    main()
