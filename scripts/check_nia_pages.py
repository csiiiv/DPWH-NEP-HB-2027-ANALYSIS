#!/usr/bin/env python3
"""Check NIA routing, filtered exports, source arithmetic and real PDF rendering."""
import csv
from functools import partial
from http.server import ThreadingHTTPServer
from io import StringIO
import json
import os
from pathlib import Path
import tempfile
import threading
from urllib.parse import urlencode

from playwright.sync_api import expect, sync_playwright
from serve_pages import RangeHandler

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
                for width in (390, 1440):
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
                                  'analysis?view=stats', 'analysis?stage=house', 'analysis?view=candidates', 'analysis?view=controls',
                                  'analysis?view=insertions', 'analysis?view=deletions', 'analysis?view=adjustments'):
                        goto(route)
                    goto('compare')
                    context = page.locator('.comparison-context')
                    assert not context.evaluate('(e) => e.open')
                    expect(page.get_by_role('button', name='Sub-program totals', exact=True)).to_have_attribute('aria-pressed', 'true')
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

                    for view, expected_count, side in [('insertions', 319, 'house'), ('deletions', 282, 'nep'), ('adjustments', 4, None)]:
                        goto('analysis?view=' + view)
                        expect(page.get_by_role('link', name=view.title(), exact=True)).to_have_attribute('aria-current', 'page')
                        expect(page.get_by_role('navigation', name='NIA project candidates pages')).to_contain_text(f'{expected_count} rows')
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
                    expect(page.get_by_role('navigation', name='NIA project candidates pages')).to_contain_text('319 rows')
                    goto('home')
                    assert page.get_by_role('navigation', name='Workbench pages').locator('a').all_text_contents() == [
                        'Home', 'Highlights', 'Compare stages', 'Analysis', 'House GAB', 'DBM NEP']
                    page.screenshot(path=str(captures / f'home-{width}.png'))

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
