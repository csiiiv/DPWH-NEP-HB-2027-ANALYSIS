#!/usr/bin/env python3
"""Exercise every HFEP/FMR highlight, its scoped evidence and source actions."""
import csv
from functools import partial
from http.server import ThreadingHTTPServer
from io import StringIO
import json
import os
from pathlib import Path
import tempfile
import threading

from playwright.sync_api import expect, sync_playwright
from serve_pages import RangeHandler, check_widths

ROOT = Path(__file__).resolve().parents[1]


class Quiet(RangeHandler):
    def log_message(self, *args):
        pass


def main():
    errors, bad = [], []
    captures = Path('/tmp/annex-highlight-verification')
    captures.mkdir(exist_ok=True)
    hfep = json.loads((ROOT / 'other-analysis/data/hfep_workbench.json').read_text())
    expected = {
        'hfep': [
            ('nep-defect', 'Documented NEP printed defects'),
            ('lgu-split', 'HFEP highlight category movements'),
            ('house-balance', 'HFEP House control reconciliation'),
            ('ocr-flags', 'HFEP facilities'),
            ('hospital-priorities', 'HFEP hospital category movements'),
        ],
        'fmr': [
            ('control-increase', 'FMR highlight funding bridge'),
            ('regional-increase', 'FMR highlight funding bridge'),
            ('amount-changes', 'FMR project candidates'),
            ('house-only', 'FMR highlight funding bridge'),
            ('nep-coordinates', 'Highlight project evidence'),
            ('house-coordinates', 'Highlight project evidence'),
            ('nep-segments', 'Highlight project evidence'),
            ('house-segments', 'Highlight project evidence'),
        ],
    }
    with tempfile.TemporaryDirectory() as directory:
        Path(directory, 'Budget-preview').symlink_to(ROOT / '_site', target_is_directory=True)
        server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Quiet, directory=directory))
        threading.Thread(target=server.serve_forever, daemon=True).start()
        base = f'http://127.0.0.1:{server.server_port}/Budget-preview/app/'
        try:
            with sync_playwright() as p:
                browser = p.chromium.launch(executable_path=os.environ.get('CHROME_BIN', '/usr/bin/google-chrome'), args=['--no-sandbox'])
                for width in check_widths():
                    page = browser.new_page(viewport={'width': width, 'height': 1000}, accept_downloads=True)
                    page.on('pageerror', lambda error: errors.append(str(error)))
                    page.on('response', lambda response: bad.append((response.url, response.status)) if response.status >= 400 else None)

                    def csv_download(modal, label):
                        with page.expect_download() as result:
                            modal.get_by_role('button', name=label, exact=True).click()
                        return list(csv.DictReader(StringIO(Path(result.value.path()).read_text(encoding='utf-8-sig'))))

                    def open_pdf(modal, trigger, workspace):
                        trigger.click()
                        pdf = page.get_by_role('dialog', name=f'{workspace.upper()} PDF source', exact=True)
                        expect(pdf.locator('canvas')).to_be_visible(timeout=60000)
                        assert page.evaluate('document.body.style.overflow') == 'hidden'
                        page.keyboard.press('Escape')
                        expect(pdf).to_have_count(0)
                        expect(modal).to_be_visible()
                        expect(trigger).to_be_focused()
                        assert page.evaluate('document.body.style.overflow') == 'hidden'

                    for workspace, findings in expected.items():
                        page.goto(base + f'#{workspace}/highlights', wait_until='networkidle')
                        actions = page.locator('.fmr-highlight-grid button[aria-haspopup="dialog"]')
                        expect(actions).to_have_count(len(findings))
                        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
                        for index, (story, evidence) in enumerate(findings):
                            trigger = actions.nth(index)
                            trigger.click()
                            modal = page.locator('dialog.annex-highlight-dialog')
                            expect(modal).to_be_visible()
                            assert f'story={story}' in page.url
                            expect(modal.locator('.annex-highlight-metrics .fmr-stat')).to_have_count(3)
                            if width == 390 and workspace == 'fmr' and story == 'amount-changes':
                                expect(modal.locator('.fmr-cards')).to_be_visible()
                            else:
                                expect(modal.get_by_role('region', name=evidence, exact=True).first).to_be_visible()
                            assert modal.evaluate('(el) => el.scrollWidth <= el.clientWidth'), (width, page.url)
                            assert page.evaluate('document.body.style.overflow') == 'hidden'
                            page.screenshot(path=str(captures / f'{workspace}-{story}-{width}.png'))
                            reloaded = False
                            if workspace == 'hfep' and story == 'lgu-split':
                                columns = csv_download(modal, 'Export funding columns CSV')
                                assert len(columns) == 4
                                total = next(r for r in columns if r['column'] == 'total')
                                assert int(total['house_minus_nep_php']) == -4451000000
                                assert int(total['nep_residual_php']) == 140000
                                categories = csv_download(modal, 'Export category movements CSV')
                                assert len(categories) == 8 and sum(int(r['house_minus_nep_php']) for r in categories) == -4451000000
                                assert all(r['nep_source_pdf'] or r['house_source_pdf'] for r in categories)
                                modal.get_by_text('Scope note: annex capital outlays and operating expenses', exact=True).click()
                                scope = csv_download(modal, 'Export program scope CSV')
                                assert len(scope) == 2 and all(int(r['annex_minus_agency_co_php']) == 0 for r in scope)
                                for record in scope:
                                    assert int(record['annex_capital_outlay_php']) + int(record['mooe_php']) == int(record['wider_hfep_program_php'])
                                source = hfep['stages']['house']['agency_check']['source']
                                open_pdf(modal, modal.get_by_role('button', name=f'Agency row · PDF p. {source["pdf_page"]}'), workspace)
                            if workspace == 'hfep' and story == 'house-balance':
                                controls = csv_download(modal, 'Export controls CSV')
                                assert len(controls) == hfep['stages']['house']['audit_summary']['internal_control_checks'] * 4
                                assert all(int(r['difference_php']) == 0 for r in controls)
                                modal.get_by_label('House highlight control', exact=True).select_option(controls[-1]['control_id'])
                                expect(modal.get_by_role('region', name='Selected source evidence')).to_contain_text(controls[-1]['label'])
                                page.reload(wait_until='networkidle')
                                reloaded = True
                                expect(modal.get_by_label('House highlight control', exact=True)).to_have_value(controls[-1]['control_id'])
                            if workspace == 'hfep' and story == 'ocr-flags':
                                records = csv_download(modal, 'Export filtered CSV')
                                assert len(records) == 19 and len({r['id'] for r in records}) == 19
                                assert any(r['id'] == 'nep_hfep:p2:r57' for r in records)  # Unflagged dash interpretation.
                                modal.get_by_label('HFEP highlight facility', exact=True).select_option('nep_hfep:p2:r57')
                                expect(modal.get_by_role('region', name='Selected source evidence')).to_contain_text('Dash fragment read as dash')
                                open_pdf(modal, modal.get_by_role('region', name='Selected source evidence').locator('.fmr-source-button'), workspace)
                            if workspace == 'hfep' and story == 'hospital-priorities':
                                controls = csv_download(modal, 'Export category movements CSV')
                                assert len(controls) == 2
                                assert {int(r['house_minus_nep_php']) for r in controls} == {-6378000000,3130155000}
                                for side,count,total in [('nep',236,11938094000),('house',254,8690249000)]:
                                    modal.get_by_label('Hospital allocation source', exact=True).select_option(side)
                                    records = csv_download(modal, 'Export hospital allocations CSV')
                                    assert len(records) == count and sum(int(r['total_php']) for r in records) == total
                                    assert all(r['category'] in ('2. LGU Hospitals','3. DOH Hospitals') for r in records)
                                modal.get_by_label('Category', exact=True).select_option('2. LGU Hospitals')
                                records = csv_download(modal, 'Export hospital allocations CSV')
                                assert records and all(r['category'] == '2. LGU Hospitals' for r in records)
                                assert sum(int(r['total_php']) for r in records) == 5558546000
                                selected = records[0]['id']
                                modal.get_by_label('Hospital highlight facility', exact=True).select_option(selected)
                                open_pdf(modal, modal.get_by_role('region', name='Selected source evidence').locator('.fmr-source-button'), workspace)
                                page.reload(wait_until='networkidle')
                                reloaded = True
                                expect(modal.get_by_label('Hospital allocation source', exact=True)).to_have_value('house')
                                expect(modal.get_by_label('Hospital highlight facility', exact=True)).to_have_value(selected)
                            if workspace == 'fmr' and story == 'control-increase':
                                modal.get_by_label('Search', exact=True).fill('CALABARZON')
                                expect(modal.get_by_role('region', name='FMR highlight funding bridge')).to_contain_text('776,400,000')
                                controls = csv_download(modal, 'Export regional controls CSV')
                                assert len(controls) == 1 and int(controls[0]['difference_php']) == 776400000
                            if workspace == 'fmr' and story == 'regional-increase':
                                candidates = csv_download(modal, 'Export filtered CSV')
                                assert all(r['region'] == 'IVA' for r in candidates)
                                bridge = sum(int(r['paired_delta_php']) if r['paired_delta_php'] else int(r['house_php'] or 0) - int(r['nep_php'] or 0) for r in candidates)
                                assert bridge == 776400000
                            if workspace == 'fmr' and story == 'house-only':
                                candidates = csv_download(modal, 'Export filtered CSV')
                                assert len(candidates) == 355 and all(r['candidate_status'] == 'house_only' for r in candidates)
                                assert sum(int(r['house_php']) for r in candidates) == 5969005000
                            if workspace == 'fmr' and story == 'nep-coordinates':
                                records = csv_download(modal, 'Export filtered CSV')
                                assert len(records) == 52 and all(r['original_review_flags'] for r in records)
                                modal.get_by_label('Coordinate evidence population', exact=True).select_option('open')
                                expect(modal).to_contain_text('No source projects in this evidence population')
                                assert csv_download(modal, 'Export filtered CSV') == []
                                modal.get_by_label('Coordinate evidence population', exact=True).select_option('history')
                            if workspace == 'fmr' and story == 'house-coordinates':
                                records = csv_download(modal, 'Export filtered CSV')
                                assert len(records) == 2 and all(r['review_flags'] for r in records)
                                open_pdf(modal, modal.get_by_role('region', name='Selected source evidence').get_by_role('button', name='Open source page'), workspace)
                            if workspace == 'fmr' and story.endswith('-segments'):
                                records = csv_download(modal, 'Export filtered CSV')
                                assert len(records) == (13 if story.startswith('nep') else 26)
                                assert all(int(r['segment_count']) > 1 for r in records)
                                selected = records[-1]['source_id']
                                modal.get_by_label('Highlight supporting project', exact=True).select_option(selected)
                                expect(modal.get_by_role('region', name='Selected source evidence')).to_contain_text(selected)
                                page.reload(wait_until='networkidle')
                                reloaded = True
                                expect(modal.get_by_label('Highlight supporting project', exact=True)).to_have_value(selected)
                            modal.get_by_role('button', name='Close evidence', exact=True).click()
                            expect(modal).to_have_count(0)
                            if not reloaded:
                                expect(trigger).to_be_focused()
                            assert page.evaluate('document.body.style.overflow') != 'hidden'
                        print(f'{width}px: {workspace.upper()} highlight actions, scoped evidence, exports, reloads and PDFs pass', flush=True)
                    page.goto(base + '#hfep/highlights?story=missing', wait_until='networkidle')
                    expect(page.get_by_role('alert')).to_contain_text('Finding not found')
                    page.goto(base + '#hfep/highlights?story=agency-check', wait_until='networkidle')
                    expect(page.locator('dialog.annex-highlight-dialog')).to_contain_text('Why do DOH hospital allocations fall')
                    page.close()
                browser.close()
            assert not errors, errors
            assert not bad, bad
            print(f'Annex highlight checks passed; screenshots in {captures}', flush=True)
        finally:
            server.shutdown()


if __name__ == '__main__':
    main()
