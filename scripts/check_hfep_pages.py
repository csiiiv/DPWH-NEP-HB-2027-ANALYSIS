#!/usr/bin/env python3
"""Exercise loaded HFEP views, provenance exports, routing and inline PDF review."""
from functools import partial
from http.server import ThreadingHTTPServer
import os
import re
import tempfile
import threading
from pathlib import Path
from playwright.sync_api import expect, sync_playwright
from serve_pages import RangeHandler

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
                for width in [390, 1440]:
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
                    assert tabs.locator('a').all_text_contents() == ['Home', 'Highlights', 'Compare Stages', 'Analysis', 'House GAB', 'DBM NEP']
                    # The workspace selector exposes all three registered workspaces.
                    workspaces = page.get_by_role('navigation', name='Workbench workspaces')
                    assert workspaces.locator('a').all_text_contents() == ['DPWH', 'DA Farm-to-Market Roads', 'DOH Health Facilities']
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

                    # Cross-document analysis: insertions, deletions, adjustments.
                    goto('analysis?view=insertions')
                    expect(page.get_by_role('region', name='Top insertion candidates')).to_be_visible()
                    expect(page.locator('.fmr-stats')).to_contain_text('380')
                    expect(page.locator('.fmr-notice').first).to_contain_text('review candidates, not confirmed insertions')
                    no_overflow()
                    goto('analysis?view=deletions')
                    expect(page.get_by_role('region', name='Top deletion candidates')).to_be_visible()
                    expect(page.locator('.fmr-stats')).to_contain_text('331')
                    no_overflow()
                    goto('analysis?view=adjustments')
                    expect(page.get_by_role('region', name='Adjusted pairs')).to_be_visible()
                    expect(page.locator('.fmr-stats')).to_contain_text('11')
                    expect(page.get_by_role('region', name='Net movement by funding column')).to_contain_text('669,480,000')
                    # Per-column deltas render with signs on adjusted pairs.
                    pairs_table = page.get_by_role('region', name='Adjusted pairs')
                    expect(pairs_table.locator('tbody tr').first).to_contain_text('₱')
                    # Every record table in analysis carries PDF page references.
                    for view, name in [('adjustments', 'Adjusted pairs'), ('deletions', 'Top deletion candidates'),
                                       ('insertions', 'Top insertion candidates')]:
                        if view != 'adjustments':
                            goto(f'analysis?view={view}')
                        page.get_by_role('region', name=name).get_by_role(
                            'button', name=re.compile(r'^(PDF|House|NEP) p\.')).first.click()
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
                    expect(page.get_by_role('region', name='Column reconciliation')).to_contain_text('669,480,000')
                    no_overflow()
                    page.screenshot(path=str(captures / f'compare-columns-{width}.png'))
                    goto('compare?view=pairs')
                    expect(page.get_by_role('region', name='Matched line-item pairs')).to_be_visible()
                    expect(page.locator('.result-count')).to_contain_text('133 pairs')
                    # Filtering to changed pairs narrows the review scope.
                    page.get_by_label('Pair status').select_option(label='Amounts changed')
                    expect(page.locator('.result-count')).to_contain_text('11 of 133 pairs')
                    no_overflow()
                    # Sorting pairs re-orders rows; mobile gets the dropdown control.
                    pairs_region = page.get_by_role('region', name='Matched line-item pairs')
                    first_before = pairs_region.locator('tbody tr').first.inner_text()
                    if width == 390:
                        page.get_by_label('Sort pairs').select_option('nep')
                        page.get_by_role('button', name=re.compile(r'^Ascending')).click()
                    else:
                        page.get_by_role('button', name='Sort by DBM NEP').click()
                    expect(page.locator('.result-count')).to_contain_text('11 of 133 pairs')
                    first_after = pairs_region.locator('tbody tr').first.inner_text()
                    assert first_before != first_after, 'pair sort reorders rows'
                    if width == 390:  # flip direction via the same dropdown control
                        page.get_by_role('button', name=re.compile(r'^Descending')).click()
                    else:
                        page.get_by_role('button', name='Sort by DBM NEP').click()  # toggle to descending
                    assert pairs_region.locator('tbody tr').first.inner_text() != first_after, 'second click flips direction'
                    page.screenshot(path=str(captures / f'compare-pairs-sorted-{width}.png'))
                    no_overflow()
                    print(f'{width}px: compare stages reconciles columns and reviews pairs', flush=True)
                    # A pair row links both source documents; the PDF opens in the side pane.
                    row = page.get_by_role('region', name='Matched line-item pairs').locator('tbody tr').first
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
