#!/usr/bin/env python3
"""Check Geolocation workspace routing, filters and map rendering in the package."""
import json
import os
import re
from functools import partial
from http.server import ThreadingHTTPServer
import tempfile
import threading
from collections import Counter
from pathlib import Path

from playwright.sync_api import expect, sync_playwright
from serve_pages import RangeHandler

ROOT = Path(__file__).resolve().parents[1]


class Quiet(RangeHandler):
    def log_message(self, *args):
        pass


def expected_counts():
    """Derive facet counts from the packaged workbench.

    Hardcoding totals made this check break on every legitimate re-scan, which
    is exactly when the numbers most need verifying. The UI and these
    expectations now share one source of truth.
    """
    data = json.loads((ROOT / '_site/gps-analysis/data/gps_workbench.json').read_text())
    records = data['records']
    by_dataset = Counter(r['dataset'] for r in records)
    return {
        'total': len(records),
        'hgab_fmr': by_dataset['hgab_fmr'],
        'fmr_pair': by_dataset['hgab_fmr'] + by_dataset['nep_fmr'],
        'insertion': sum(1 for r in records if r.get('change_type') == 'insertion'),
        'fmr_group': sum(1 for r in records if r.get('group') == 'fmr'),
        'totals': data['totals'],
    }


def thousands(n):
    return f'{n:,}'


def assert_no_sign_regressions():
    """No point may carry a spurious negative sign.

    Guards two real regressions in DECIMAL_DEGREE_PAIR: an unanchored [NSEW]
    read the trailing "s" of "Batanes" as a South marker, and an optional
    degree marker let a prose hyphen ("(FRIENDSHIP)-15.15…") be read as a
    negative sign. Every Philippine project sits at positive lat/lon, so a
    negative value here means the parser mangled the source text again.
    """
    data = json.loads((ROOT / '_site/gps-analysis/data/gps_workbench.json').read_text())
    bad = []
    for record in data['records']:
        for field in record['fields']:
            for point in field['points']:
                lat, lon = point.get('latitude'), point.get('longitude')
                if lat is None or lon is None:
                    continue
                if lat < 0 or lon < 0:
                    bad.append((record['dataset'], record['record_id'], lat, lon,
                                point.get('source_fragment')))
    assert not bad, f'{len(bad)} points with a negative sign: {bad[:5]}'


def main():
    errors, bad = [], []
    counts = expected_counts()
    total = thousands(counts['total'])
    captures = Path('/tmp/geo-ui-verification')
    captures.mkdir(exist_ok=True)
    assert counts['totals']['hint_only'] <= 10, (
        f"hint_only={counts['totals']['hint_only']} — degree-symbol pairs in prose "
        f"should now parse; check DECIMAL_DEGREE_PAIR"
    )
    assert_no_sign_regressions()
    with tempfile.TemporaryDirectory() as directory:
        prefix = 'Geo-preview'
        Path(directory, prefix).symlink_to(ROOT / '_site', target_is_directory=True)
        server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Quiet, directory=directory))
        threading.Thread(target=server.serve_forever, daemon=True).start()
        base = f'http://127.0.0.1:{server.server_port}/{prefix}/app/'
        try:
            with sync_playwright() as p:
                browser = p.chromium.launch(headless=True, executable_path=os.environ.get('CHROME_BIN', '/usr/bin/google-chrome'), args=['--no-sandbox'])
                for width in (390, 1440):
                    page = browser.new_page(viewport={'width': width, 'height': 1000})
                    page.on('pageerror', lambda e: errors.append(str(e)))
                    page.on('response', lambda r: bad.append((r.url, r.status)) if r.status >= 400 else None)

                    # Landing redirect preserves the workspace prefix.
                    page.goto(base.replace('/app/', '/geo/') + '?preview=geo#map', wait_until='networkidle')
                    assert '/app/?preview=geo#geo/map' in page.url, page.url

                    # Home renders totals, groupings, PAP split and variation tables.
                    page.goto(base + '#geo/home', wait_until='networkidle')
                    expect(page.get_by_role('heading', name='Geolocated budget records')).to_be_visible()
                    expect(page.get_by_role('region', name='GPS records by grouping').locator('tbody tr')).to_have_count(4)
                    expect(page.get_by_role('region', name='DPWH GPS records by PAP').locator('tbody tr').first).to_contain_text('Multi-Purpose Buildings')
                    expect(page.get_by_role('region', name='Interpretation rules applied').locator('tbody tr').first).to_contain_text('Longitude-first pair reordered')

                    # Map renders overlays and reacts to dataset and PAP filters.
                    page.goto(base + '#geo/map', wait_until='networkidle')
                    expect(page.get_by_role('heading', name='GPS-bearing budget records')).to_be_visible()
                    expect(page.locator('.fmr-map-canvas canvas')).to_be_visible(timeout=60000)

                    def facet(name):
                        """The floating popover container for one facet."""
                        trigger = page.get_by_role('button', name=re.compile(rf'^{name}:'), exact=False).first
                        group = page.locator('.geo-filter-group').filter(has=trigger).first
                        return group, trigger, group.get_by_role('listbox', name=name, exact=True)

                    def open_facet(name):
                        """Return (group, menu) with the menu open.

                        The trigger toggles, so it is only clicked when the menu
                        is not already open; otherwise a second call would close
                        it again mid-interaction.
                        """
                        group, trigger, menu = facet(name)
                        if trigger.get_attribute('aria-expanded') != 'true':
                            trigger.click()
                        expect(menu).to_be_visible()
                        return group, menu

                    def pick(menu, option):
                        """Tick one option by its label prefix.

                        Labels carry a trailing record count, so this matches on
                        the name substring. re.escape is deliberately not used:
                        Playwright serializes the pattern into a CSS attribute
                        selector, where escapes like ``\\-`` are invalid syntax.
                        """
                        menu.get_by_role('option', name=option, exact=False).first.click()

                    # Facet menus float: opening one must not push anything down.
                    map_box_before = page.locator('.fmr-map-shell').bounding_box()
                    bar_before = page.locator('.fmr-result-bar').bounding_box()
                    group, trigger, _ = facet('Dataset')
                    group_before = group.bounding_box()
                    doc_height_before = page.evaluate('document.body.scrollHeight')
                    group, menu = open_facet('Dataset')
                    page.wait_for_timeout(150)
                    assert page.locator('.fmr-map-shell').bounding_box() == map_box_before, 'map reflowed on open'
                    assert page.locator('.fmr-result-bar').bounding_box() == bar_before, 'result bar reflowed on open'
                    # The facet keeps its trigger-only height, so the menu is out
                    # of flow rather than inserted into the layout.
                    assert group.bounding_box()['height'] == group_before['height'], 'facet grew on open'
                    assert page.evaluate('document.body.scrollHeight') == doc_height_before, 'page grew on open'
                    menu_box = menu.bounding_box()
                    assert menu_box['height'] > group_before['height'], 'menu should overflow its facet'
                    assert menu_box['y'] >= group_before['y'], 'menu should sit below the trigger'
                    page.screenshot(path=str(captures / f'geo-filters-open-{width}.png'), full_page=True)
                    page.keyboard.press('Escape')
                    expect(menu).to_be_hidden()

                    # Selecting one value narrows the map to that dataset.
                    _, menu = open_facet('Dataset')
                    pick(menu, 'FMR · House GAB annex')
                    page.wait_for_timeout(800)
                    result = page.locator('.fmr-result-bar').inner_text()
                    assert f"{thousands(counts['hgab_fmr'])} records" in result, result

                    # Multi-select unions two datasets instead of replacing, and
                    # the menu stays open across ticks so both can be chosen in
                    # one pass. Selection is shareable in the URL.
                    _, menu = open_facet('Dataset')
                    pick(menu, 'FMR · DBM NEP annex')
                    page.wait_for_timeout(800)
                    result = page.locator('.fmr-result-bar').inner_text()
                    assert f"{thousands(counts['fmr_pair'])} records" in result, result
                    assert 'dataset=hgab_fmr%7Cnep_fmr' in page.url or 'dataset=hgab_fmr|nep_fmr' in page.url, page.url
                    # "Select none" lives in the bulk row outside the listbox.
                    group.get_by_role('button', name='Select none').click()
                    page.wait_for_timeout(800)
                    result = page.locator('.fmr-result-bar').inner_text()
                    assert f'{total} records' in result, result
                    page.keyboard.press('Escape')

                    # Budget-change facet narrows to a comparison-derived bucket.
                    _, menu = open_facet('Budget change')
                    pick(menu, 'Insertion (House-only)')
                    page.wait_for_timeout(800)
                    result = page.locator('.fmr-result-bar').inner_text()
                    assert f"{thousands(counts['insertion'])} records" in result, result
                    page.keyboard.press('Escape')
                    page.get_by_role('button', name='Clear filters').click()
                    page.wait_for_timeout(800)
                    result = page.locator('.fmr-result-bar').inner_text()
                    assert f'{total} records' in result, result

                    _, menu = open_facet('DPWH PAP')
                    pick(menu, 'BIP - Multi-Purpose Buildings/ Facilities to support Social Services')
                    page.wait_for_timeout(800)
                    result = page.locator('.fmr-result-bar').inner_text()
                    assert 'records' in result and '0 records' not in result, result
                    page.keyboard.press('Escape')
                    page.screenshot(path=str(captures / f'geo-map-{width}.png'), full_page=True)
                    page.get_by_role('button', name='Clear filters').click()
                    page.wait_for_timeout(500)

                    # Selecting a drawn point opens the card with evidence:
                    # a PDF page button previews the source and a project
                    # record link targets the owning workspace (desktop only —
                    # the tiny two-point line is hard to hit on mobile).
                    if width == 1440:
                        page.goto(base + '#geo/map?dataset=dpwh_comparison_2027&q=Dampalit%20Pumping', wait_until='networkidle')
                        expect(page.locator('.fmr-map-canvas canvas')).to_be_visible(timeout=60000)
                        page.wait_for_timeout(800)
                        result = page.locator('.fmr-result-bar').inner_text()
                        assert 'records' in result and '0 records' not in result, result
                        # mouse.click uses viewport coordinates and does not
                        # scroll, so bring the canvas on screen first — the
                        # facet bar above it is taller than a viewport row.
                        canvas = page.locator('.fmr-map-canvas canvas')
                        canvas.scroll_into_view_if_needed()
                        page.wait_for_timeout(600)
                        box = canvas.bounding_box()
                        page.mouse.click(box['x'] + box['width'] / 2, box['y'] + box['height'] / 2)
                        page.wait_for_timeout(400)
                        card = page.get_by_role('region', name='Selected GPS record')
                        expect(card).to_be_visible()
                        # The card prints the project allocation as PHP, and a
                        # comparison-derived budget-change badge when known.
                        amount = card.locator('.fmr-map-amount strong')
                        expect(amount).to_be_visible()
                        assert re.fullmatch(r'₱[\d,]+', amount.inner_text().strip()), amount.inner_text()
                        badge = card.locator('.fmr-map-project-meta .fmr-badge[class*="change-"]')
                        if badge.count():
                            assert badge.first.get_attribute('class').startswith('fmr-badge change-')
                        record_url = card.get_by_role('link', name='Open project record →').get_attribute('href')
                        from urllib.parse import unquote
                        record_url_decoded = unquote(record_url)
                        assert record_url_decoded.startswith('#compare?record=house-reading:'), record_url_decoded
                        assert 'view=projects' in record_url_decoded, record_url_decoded
                        pdf_button = card.locator('.fmr-map-quick-sources button').first
                        expect(pdf_button).to_contain_text('p. ')
                        pdf_button.click()
                        dialog = page.get_by_role('dialog', name='GPS record PDF source')
                        expect(dialog).to_be_visible()
                        expect(dialog.locator('canvas').first).to_be_visible(timeout=60000)
                        dialog.get_by_role('button', name='Close', exact=True).click()
                        page.wait_for_timeout(300)

                    # Grouping dialog from Home opens the record list with evidence buttons.
                    page.goto(base + '#geo/home', wait_until='networkidle')
                    # The grouping button prints a bare integer (no thousands
                    # separator), unlike the result bar.
                    page.get_by_role('button', name=f"Show {counts['fmr_group']} records").click()
                    expect(page.get_by_role('dialog', name='Grouping records')).to_be_visible()
                browser.close()
        finally:
            server.shutdown()
        assert not errors, errors
        assert not bad, bad
    print(f'Geolocation workspace checks passed ({captures})')


if __name__ == '__main__':
    main()
