#!/usr/bin/env python3
"""Exercise loaded FMR views, provenance exports, routing and inline PDF review."""
from functools import partial
from http.server import ThreadingHTTPServer
import csv
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
    data = json.loads((ROOT / 'other-analysis/data/fmr_workbench.json').read_text())
    errors, bad, ranges, requests = [], [], [], []
    captures = Path('/tmp/fmr-ui-verification')
    captures.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory() as directory:
        prefix = 'FMR-preview'
        Path(directory, prefix).symlink_to(ROOT / '_site', target_is_directory=True)
        server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Quiet, directory=directory))
        threading.Thread(target=server.serve_forever, daemon=True).start()
        external = os.environ.get('FMR_WORKBENCH_URL')
        base = external or f'http://127.0.0.1:{server.server_port}/{prefix}/app/'
        try:
            with sync_playwright() as p:
                chrome = os.environ.get('CHROME_BIN') or '/usr/bin/google-chrome'
                browser = p.chromium.launch(headless=True, executable_path=chrome, args=['--no-sandbox'])
                for width in check_widths():
                    page = browser.new_page(viewport={'width': width, 'height': 1000}, accept_downloads=True)
                    page.on('pageerror', lambda e: errors.append(str(e)))
                    page.on('response', lambda r: bad.append((r.url, r.status)) if r.status >= 400 else ranges.append(r.url) if r.status == 206 else None)
                    page.on('request', lambda r: requests.append(r.url))

                    def goto(route):
                        page.goto(base + '#fmr/' + route, wait_until='networkidle')
                        expect(page.locator('h1')).to_be_visible()

                    def no_overflow():
                        assert not page.evaluate('document.documentElement.scrollWidth > innerWidth'), page.url

                    def source_pdf(expected_page):
                        pane = page.get_by_role('complementary', name='Inline source PDF')
                        expect(pane.locator('canvas')).to_be_visible(timeout=60000)
                        expect(pane.get_by_role('status')).to_contain_text(f'Page {expected_page} of ', timeout=60000)
                        return pane

                    if not external:
                        page.goto(base.replace('/app/', '/') + '?preview=fmr#fmr/nep', wait_until='networkidle')
                        assert '/app/?preview=fmr#fmr/nep' in page.url
                    check_analysis_links(page, goto, 'insertions', 'insertions-by-region', tabs='Workspace views')
                    check_banded_overview(page, goto, 'overview-comparison')
                    for view in ('insertions', 'deletions', 'adjustments'):
                        check_candidate_group(page, goto, view, f'{view}-by-region', 'Source records / changed pairs', 'Analysis source records', 'Export filtered CSV')
                    check_candidate_group(page, goto, 'insertions', 'insertions-by-region', 'Source records / changed pairs', 'Analysis source records', 'Export filtered CSV', query='road')
                    # Old candidate keys still resolve to an active canonical link.
                    goto('analysis?view=house_candidates')
                    expect(page.get_by_role('link', name='Insertions', exact=True)).to_have_attribute('aria-current', 'page')
                    goto('analysis?view=insertions&records=candidate-region:missing')
                    expect(page.get_by_role('dialog', name='Analysis source records').get_by_role('alert')).to_contain_text('Unknown analysis group')
                    goto('home')
                    tabs = page.get_by_role('navigation', name='Workbench pages')
                    assert tabs.locator('a').all_text_contents() == ['Home', 'Highlights', 'Compare stages', 'Analysis', 'Map', 'House GAB', 'DBM NEP']
                    # The FMR map tab renders MapLibre over hosted tiles; segment
                    # lines come from the committed payload.
                    goto('map')
                    page.wait_for_selector('.fmr-map-canvas .maplibregl-canvas', timeout=60000)
                    expect(page.locator('.fmr-map .fmr-result-bar')).to_contain_text(re.compile(r'[1-9][\d,]* overlays'))
                    expect(page.get_by_label('Coordinate basis', exact=True)).to_have_value('reviewed')
                    no_overflow()
                    expect(page.get_by_role('link', name='Map', exact=True)).to_have_attribute('aria-current', 'page')
                    for route in ['home', 'highlights', 'compare', 'compare?view=projects', 'analysis', 'analysis?view=insertions', 'analysis?view=deletions', 'analysis?view=adjustments', 'analysis?view=coordinates', 'analysis?view=stats']:
                        goto(route)
                        no_overflow()
                        if route in ['home', 'highlights', 'compare?view=projects', 'analysis']:
                            page.screenshot(path=str(captures / f'{route.replace("?", "-").replace("=", "-")}-{width}.png'))
                    print(f'{width}px: all main and analysis views render without overflow', flush=True)

                    for stage in ['house', 'nep']:
                        s = data['stages'][stage]
                        goto(stage)
                        source_pdf(s['root']['source']['pdf_page'])
                        tree = page.get_by_role('region', name=f'{s["label"]} source tree')
                        expect(tree.locator('.fmr-tree-region')).to_have_count(16)
                        if width == 1440:
                            root_button = tree.locator('[data-node]').first
                            root_button.focus()
                            root_button.press('ArrowRight')
                            region_button = tree.locator('[data-node]').filter(has_text=s['regions'][0]['label']).first
                            expect(region_button).to_be_focused()
                            region_button.press('ArrowRight')
                            first_project = tree.locator('li button').first
                            expect(first_project).to_be_focused()
                            first_project.press('ArrowLeft')
                            expect(region_button).to_be_focused()
                            region_button.press('ArrowLeft')
                            expect(root_button).to_be_focused()
                        tree.get_by_role('button', name='Expand all regions').click()
                        expect(tree.locator('li')).to_have_count(len(s['projects']))
                        tree.locator('li button').first.click()
                        evidence = page.get_by_role('region', name='Selected source evidence')
                        expect(evidence).to_contain_text(s['projects'][0]['title'])
                        expect(evidence).to_contain_text('Project leaf')
                        crumbs = evidence.get_by_role('navigation', name='Source breadcrumbs')
                        expect(crumbs.locator('a')).to_have_count(3)
                        crumbs.locator('a').nth(1).click()
                        expect(evidence).to_contain_text('Balanced')
                        expect(evidence.locator('.fmr-arithmetic')).to_contain_text(f'{s["regions"][0]["amount_php"]:,}')
                        source_pdf(s['regions'][0]['source']['pdf_page'])
                        page.reload(wait_until='networkidle')
                        expect(evidence).to_contain_text('Balanced')
                        if width == 1440:
                            assert page.locator('.fmr-workspace-grid > div').last.evaluate('(e)=>getComputedStyle(e).position') == 'sticky'
                        page.screenshot(path=str(captures / f'{stage}-evidence-{width}.png'))

                        page.get_by_role('link', name='Projects', exact=True).click()
                        pagination = page.get_by_role('navigation', name='FMR projects pages')
                        pagination.get_by_role('button', name='Next', exact=True).click()
                        expect(pagination).to_contain_text('Page 2 of')
                        page.get_by_role('region', name='FMR projects', exact=True).locator('tbody button.fmr-text-button').first.click()
                        if width == 390:
                            page.get_by_role('button', name='Tree / results', exact=True).click()
                        expect(pagination).to_contain_text('Page 2 of')
                        page.get_by_label('Exact PHP', exact=True).check()
                        page.get_by_role('button', name='Allocation (PHP)', exact=True).click()
                        expect(pagination).to_contain_text('Page 1 of')
                        top = max(p['amount_php'] for p in s['projects'])
                        expect(page.get_by_role('region', name='FMR projects', exact=True).locator('tbody tr').first).to_contain_text(f'{top:,}')
                        page.get_by_label('Search', exact=True).fill('Sitio Rango')
                        expect(pagination).to_contain_text('1 rows')
                        with page.expect_download() as result:
                            page.get_by_role('button', name='Export filtered CSV').click()
                        exported_csv = list(csv.DictReader(StringIO(Path(result.value.path()).read_text(encoding='utf-8-sig'))))
                        assert len(exported_csv) == 1 and 'Sitio Rango' in exported_csv[0]['title']
                        assert exported_csv[0]['pdf_page'] and exported_csv[0]['source_pdf'] == s['metadata']['source_pdf']

                        goto(stage + '?view=review')
                        expect(page.get_by_role('region', name='FMR projects').locator('tbody button.fmr-text-button')).to_have_count(s['summary']['projects_needing_review'])
                        if not s['summary']['projects_needing_review']:
                            expect(page.get_by_role('button', name='Next finding', exact=True)).to_be_disabled()
                            expect(page.locator('.fmr-queue-bar')).to_contain_text('No findings in this scope')
                        page.get_by_label('Region', exact=True).select_option(s['regions'][0]['key'])
                        expected = [p for p in s['projects'] if p['region_key'] == s['regions'][0]['key'] and p['status'] == 'needs_review']
                        if expected:
                            page.get_by_role('button', name='Next finding', exact=True).click()
                            expect(evidence).to_contain_text(expected[0]['title'])
                            page.get_by_role('button', name='Previous finding', exact=True).click()
                            expect(evidence).to_contain_text(expected[-1]['title'])
                        no_overflow()
                    print(f'{width}px: both source trees, arithmetic, scoped queues and inline PDFs pass', flush=True)

                    goto('nep?node=nep_fmr%3Ap1%3Ar7')
                    expect(page.locator('.fmr-review-image')).to_be_visible()
                    assert page.locator('.fmr-review-image').evaluate('(img)=>img.complete && img.naturalWidth>0')
                    goto('compare?view=regions&region=IVA')
                    expect(page.get_by_role('region', name='FMR regional stage comparison').locator('tbody tr')).to_have_count(1)
                    goto('compare?view=projects&sort=house_php&dir=desc&page=3')
                    results = page.locator('.fmr-cards' if width == 390 else '.fmr-table-desktop')
                    pager = results.get_by_role('navigation', name='FMR project candidates pages')
                    expect(pager).to_contain_text('Page 3 of')
                    pager.get_by_role('button', name='Next', exact=True).click()
                    expect(pager).to_contain_text('Page 4 of')
                    assert 'page=4' in page.url
                    page.reload(wait_until='networkidle')
                    expect(pager).to_contain_text('Page 4 of')
                    page.get_by_label('Candidate status', exact=True).select_option('changed')
                    expect(pager).to_contain_text('Page 1 of')
                    expect(results.locator('.fmr-card' if width == 390 else 'tbody tr')).to_have_count(4)
                    page.get_by_text('Provenance and advanced filters', exact=True).click()
                    page.get_by_label('Amount direction', exact=True).select_option('decreased')
                    expect(results.locator('.fmr-card' if width == 390 else 'tbody tr')).to_have_count(3)
                    expect(page.get_by_label('Active filters')).to_contain_text('Decreased')
                    page.get_by_role('button', name='Remove Amount direction filter').click()
                    expect(results.locator('.fmr-card' if width == 390 else 'tbody tr')).to_have_count(4)
                    with page.expect_download() as result:
                        page.get_by_role('button', name='Export filtered JSON', exact=True).click()
                    exported = json.loads(Path(result.value.path()).read_text())
                    assert len(exported['rows']) == 4 and exported['rows'][0]['nep']['source']['source_pdf']
                    with page.expect_download() as result:
                        page.get_by_role('button', name='Export filtered CSV', exact=True).click()
                    exported_csv = list(csv.DictReader(StringIO(Path(result.value.path()).read_text(encoding='utf-8-sig'))))
                    assert len(exported_csv) == 4 and all(row['nep_source_pdf'] and row['house_source_pdf'] for row in exported_csv)
                    page.get_by_text('Show analytics', exact=False).click()
                    expect(page.locator('details').filter(has=page.locator('summary').filter(has_text='Show analytics'))).to_contain_text('Funding bridge')
                    if width == 390:
                        page.get_by_label('Sort by', exact=True).select_option('title')
                        assert 'sort=title' in page.url
                        results.locator('.fmr-card-head button').first.click()
                    else:
                        results.locator('tbody .fmr-text-button').first.click()
                    candidate = page.get_by_role('dialog', name='Candidate pair evidence')
                    expect(candidate).to_be_visible()
                    candidate.get_by_role('button', name='Open source page', exact=False).first.click()
                    pdf = page.get_by_role('dialog', name='FMR PDF source')
                    expect(pdf.locator('canvas')).to_be_visible(timeout=60000)
                    expect(pdf.get_by_role('status')).to_contain_text('Page ', timeout=60000)
                    page.keyboard.press('Escape')
                    expect(pdf).to_have_count(0)
                    expect(candidate).to_be_visible()
                    page.keyboard.press('Escape')
                    expect(candidate).to_have_count(0)
                    assert page.evaluate('document.body.style.overflow') != 'hidden'
                    print(f'{width}px: comparison routing, filters, cards, exports and nested PDF dialog pass', flush=True)

                    # Direct source button opens the comparison's inline pane.
                    results.get_by_role('button', name='House source' if width == 390 else 'House PDF', exact=False).first.click()
                    expect(page.get_by_role('complementary', name='Inline source PDF').locator('canvas')).to_be_visible(timeout=60000)
                    no_overflow()
                    goto('highlights?story=amount-changes')
                    story = page.get_by_role('dialog', name='Highlight evidence: Candidate amount changes')
                    expect(story).to_be_visible()
                    expect(story.locator('.fmr-story-facts')).to_contain_text('Investigation question')
                    story.get_by_label('Region', exact=True).select_option('II')
                    with page.expect_download() as result:
                        story.get_by_role('button', name='Export filtered CSV', exact=True).click()
                    assert 'nep_source_pdf' in Path(result.value.path()).read_text()
                    page.keyboard.press('Escape')
                    expect(story).to_have_count(0)
                    goto('analysis?view=stats')
                    page.get_by_role('region', name='FMR allocation bands').locator('tbody button').first.click()
                    records = page.get_by_role('dialog', name='Analysis source records')
                    expect(records).to_be_visible()
                    expect(records.get_by_role('region', name='FMR projects').locator('tbody button.fmr-text-button')).not_to_have_count(0)
                    page.keyboard.press('Escape')
                    goto('analysis?view=overview&region=IVA')
                    expect(page.get_by_role('region', name='FMR allocation overview').locator('tbody tr')).to_have_count(1)
                    page.get_by_role('region', name='FMR allocation overview').locator('tbody button').click()
                    expect(records).to_be_visible()
                    no_overflow()
                    page.keyboard.press('Escape')
                    goto('analysis?view=coordinates')
                    expect(page.locator('main')).not_to_contain_text('Per-km price bands')
                    expect(page.locator('main')).not_to_contain_text('undefined')
                    goto('unknown')
                    expect(page.get_by_role('heading', name='Page not found')).to_be_visible()
                    page.close()
                    print(f'{width}px: Highlight stories and Analysis record drill-downs pass', flush=True)

                # Primary documents and both independent-control documents.
                page = browser.new_page(viewport={'width': 1440, 'height': 1000})
                page.on('pageerror', lambda e: errors.append(str(e)))
                page.on('response', lambda r: bad.append((r.url, r.status)) if r.status >= 400 else ranges.append(r.url) if r.status == 206 else None)
                for stage in ['house', 'nep']:
                    s = data['stages'][stage]
                    for source in [s['root']['source'], s['control_checks'][0]['source']]:
                        page.goto(base + '#fmr/' + stage + '?' + urlencode({'pdf': source['source_pdf'], 'pdfPage': source['pdf_page']}), wait_until='networkidle')
                        expect(page.get_by_role('complementary', name='Inline source PDF').get_by_role('status')).to_contain_text(f'Page {source["pdf_page"]} of ', timeout=60000)
                browser.close()
            assert not errors, errors
            assert not bad, bad
            assert ranges, 'PDF range requests were not exercised'
            assert not any('comparison_projects_2027.json' in url or 'stage_trace_2027.json' in url or 'verification_' in url for url in requests)
            print(f'FMR browser checks passed at 390px and 1440px; {len(ranges)} PDF range responses; no page errors or failed requests. Screenshots: {captures}')
        finally:
            server.shutdown()
            server.server_close()


if __name__ == '__main__':
    main()
