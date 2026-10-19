#!/usr/bin/env python3
"""Check NEP/HGAB3 hierarchy depth, geographic filters and ledger conservation."""
from functools import partial
from http.server import ThreadingHTTPServer
import json
import os
from pathlib import Path
import struct
import tempfile
import threading
import xml.etree.ElementTree as ET

from playwright.sync_api import expect, sync_playwright
from serve_pages import RangeHandler, check_widths

ROOT = Path(__file__).resolve().parents[1]


class Quiet(RangeHandler):
    def log_message(self, *args):
        pass


def check_graph(chart, columns, amount):
    expect(chart.locator('.nep-hierarchy-axes span')).to_have_count(columns)
    sums = chart.locator('.nep-hierarchy-node').evaluate_all('''nodes => {
        const totals = [];
        nodes.forEach(n => totals[Number(n.dataset.column)] = (totals[Number(n.dataset.column)] || 0) + Number(n.dataset.value));
        return totals;
    }''')
    assert sums == [amount] * columns, sums
    assert chart.locator('svg').evaluate('''svg => {
        const {width, height} = svg.viewBox.baseVal;
        const groups = new Map();
        for (const node of svg.querySelectorAll('.nep-hierarchy-node')) {
            const b = node.querySelector('text').getBBox(), col = node.dataset.column;
            if (b.x < 0 || b.y < 0 || b.x+b.width > width || b.y+b.height > height) return false;
            if (!groups.has(col)) groups.set(col, []);
            groups.get(col).push(b);
        }
        return [...groups.values()].every(boxes => boxes.sort((a,b) => a.y-b.y)
            .every((b,i) => !i || boxes[i-1].y+boxes[i-1].height <= b.y));
    }'''), 'labels must fit without overlap'


def check_export(page, chart, stage, through, amount, folder, width, filtered=False, png=True):
    name = f'dpwh-2027-{stage}-allocation-hierarchy-through-{through}{"-filtered" if filtered else ""}'
    state = chart.locator('.nep-hierarchy-scroll').evaluate('el => [el.scrollLeft,el.scrollTop]')
    route = page.url
    with page.expect_download(timeout=60000) as result:
        chart.get_by_role('button', name='Download SVG', exact=True).click()
    assert result.value.suggested_filename == name + '.svg'
    raw = Path(result.value.path()).read_bytes()
    image = ET.fromstring(raw)
    ns = '{http://www.w3.org/2000/svg}'
    text = ''.join(image.itertext())
    assert f'DPWH {stage.upper()} allocation hierarchy' in text
    assert f'₱{amount:,}' in text
    assert 'Category:' in text and 'PAP:' in text and 'Region:' in text
    assert 'Download section PNG' not in text and 'Preparing image' not in text
    exported = [n for n in image.iter() if n.get('class') == 'nep-hierarchy-node']
    assert len(exported) == chart.locator('.nep-hierarchy-node').count()
    assert not image.findall('.//' + ns + 'foreignObject'), 'SVG must use portable native drawing elements'
    if filtered:
        assert 'Asset Preservation Program' in text and 'Preventive Maintenance - Primary Roads' in text and 'Region III' in text
    diagram = image.find(ns + 'svg')
    assert diagram is not None
    assert float(image.get('height')) > float(diagram.get('height'))
    assert float(diagram.get('width')) == float(image.get('width'))
    for node in exported:
        assert 'font-size' in node.find(ns + 'text').get('style', ''), 'export must carry its own text styles'
    (folder / f'{stage}-{through}-{filtered}-{width}.svg').write_bytes(raw)
    if png:
        with page.expect_download(timeout=60000) as result:
            chart.get_by_role('button', name='Download section PNG', exact=True).click()
        assert result.value.suggested_filename == name + '.png'
        raw = Path(result.value.path()).read_bytes()
        assert raw[:8] == b'\x89PNG\r\n\x1a\n'
        png_width, png_height = struct.unpack('>II', raw[16:24])
        image_width, image_height = float(image.get('width')), float(image.get('height'))
        ratio = min(2, 16000 / image_width, 16000 / image_height)
        assert (png_width, png_height) == (int(image_width * ratio), int(image_height * ratio))
        assert png_height > 760, 'PNG includes content beyond the visible scroll window'
        assert page.evaluate('window.hierarchyExportInk > .005'), 'PNG must contain painted content'
        (folder / f'{stage}-{through}-{filtered}-{width}.png').write_bytes(raw)
    assert chart.locator('.nep-hierarchy-scroll').evaluate('el => [el.scrollLeft,el.scrollTop]') == state
    assert page.url == route
    expect(chart.get_by_role('button', name='Download section PNG', exact=True)).to_be_enabled()
    expect(chart.get_by_role('alert')).to_have_count(0)


def main():
    payload = json.loads((ROOT / '_site/analysis/dpwh_flow_2027.json').read_text())
    screenshots = Path('/tmp/hierarchy-drilldown-ui')
    screenshots.mkdir(exist_ok=True)
    errors, bad = [], []
    with tempfile.TemporaryDirectory() as directory:
        Path(directory, 'budget').symlink_to(ROOT / '_site', target_is_directory=True)
        server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Quiet, directory=directory))
        threading.Thread(target=server.serve_forever, daemon=True).start()
        try:
            with sync_playwright() as p:
                browser = p.chromium.launch(headless=True, executable_path=os.environ.get('CHROME_BIN', '/usr/bin/google-chrome'), args=['--no-sandbox'])
                for width in check_widths():
                    page = browser.new_page(viewport={'width': width, 'height': 1000}, accept_downloads=True)
                    page.add_init_script('''(() => {
                        const nativeToBlob = HTMLCanvasElement.prototype.toBlob;
                        HTMLCanvasElement.prototype.toBlob = function(...args) {
                            const preview = document.createElement('canvas'); preview.width=96; preview.height=192;
                            const ctx = preview.getContext('2d'); ctx.drawImage(this,0,0,96,192);
                            const pixels = ctx.getImageData(0,0,96,192).data;
                            let ink=0;
                            for(let i=0;i<pixels.length;i+=4) if(pixels[i]<240 || pixels[i+1]<240 || pixels[i+2]<240) ink++;
                            window.hierarchyExportInk = ink/(96*192);
                            return nativeToBlob.apply(this,args);
                        };
                    })()''')
                    page.on('pageerror', lambda e: errors.append(str(e)))
                    page.on('response', lambda r: bad.append((r.url, r.status)) if r.status >= 400 else None)
                    requests = []
                    page.on('request', lambda r: requests.append(r.url))
                    base = f'http://127.0.0.1:{server.server_port}/budget/app/'
                    for stage in ('nep', 'hgab3'):
                        data = payload[f'{stage}_hierarchy']
                        page.goto(base + f'#experiments?tab={stage}', wait_until='networkidle')
                        chart = page.locator('.nep-hierarchy')
                        expect(chart).to_have_attribute('data-through', 'pap')
                        chart.locator('.nep-hierarchy-scroll').evaluate('el => {el.scrollTop=600;el.scrollLeft=100;}')
                        check_export(page, chart, stage, 'pap', data['amount_php'], screenshots, width)
                        for end, columns in (('category', 2), ('pap', 3), ('region', 4), ('deo', 5)):
                            page.get_by_role('combobox', name='Display through', exact=True).select_option(end)
                            expect(chart).to_have_attribute('data-through', end)
                            check_graph(chart, columns, data['amount_php'])
                            if columns >= 4:
                                assert chart.locator(f'[data-column="{columns-1}"] rect').first.evaluate('''rect => {
                                    const a = rect.getBoundingClientRect(), b = rect.closest('.nep-hierarchy-scroll').getBoundingClientRect();
                                    return a.left >= b.left && a.right <= b.right;
                                }'''), 'expanding must reveal the final stage'
                            assert not page.evaluate('document.documentElement.scrollWidth > innerWidth')
                            page.screenshot(path=str(screenshots / f'{stage}-{end}-{width}.png'), full_page=True)
                        assert chart.locator('[data-column="4"]').evaluate_all("nodes => nodes.some(n => n.textContent.includes('Central Office'))")
                        # Full DEO SVGs retain every branch. Exercise the raster
                        # size cap once for a complete, very tall hierarchy.
                        check_export(page, chart, stage, 'deo', data['amount_php'], screenshots, width,
                                     png=width == 1440 and stage == 'nep')
                        # Later columns remain reachable within the diagram's scroll region.
                        chart.locator('.nep-hierarchy-scroll').evaluate('el => el.scrollLeft = el.scrollWidth')
                        expect(chart.locator('.nep-hierarchy-axes span').last).to_be_visible()
                        category = 'Asset Preservation Program'
                        pap = 'Preventive Maintenance - Primary Roads'
                        region = 'Region III'
                        page.get_by_role('combobox', name='Focus category', exact=True).select_option(category)
                        page.get_by_role('combobox', name='Focus PAP', exact=True).select_option(pap)
                        page.get_by_role('combobox', name='Focus region', exact=True).select_option(region)
                        expect(page.get_by_role('combobox', name='Focus region', exact=True)).to_have_value(region)
                        group = next(g for g in data['categories'] if g['id'] == category)
                        program = next(p for p in group['paps'] if p['label'] == pap)
                        branch = next(r for r in program['regions'] if r['label'] == region)
                        check_graph(chart, 5, branch['amount_php'])
                        expect(chart.locator('[data-column="4"]')).to_have_count(len([o for o in branch['offices'] if o['amount_php'] > 0]))
                        page.get_by_label('Show exact pesos', exact=True).check()
                        expect(chart.locator('.nep-hierarchy-toolbar')).to_contain_text(f"₱{branch['amount_php']:,}")
                        page.reload(wait_until='networkidle')
                        expect(chart).to_have_attribute('data-through', 'deo')
                        expect(page.get_by_role('combobox', name='Focus PAP', exact=True)).to_have_value(pap)
                        expect(page.get_by_role('combobox', name='Focus region', exact=True)).to_have_value(region)
                        check_graph(chart, 5, branch['amount_php'])
                        page.get_by_label('Show exact pesos', exact=True).check()
                        check_export(page, chart, stage, 'deo', branch['amount_php'], screenshots, width, filtered=True)
                        page.screenshot(path=str(screenshots / f'{stage}-focused-deo-{width}.png'), full_page=True)
                        # Hiding a filter clears its scope rather than silently retaining it.
                        page.get_by_role('combobox', name='Display through', exact=True).select_option('pap')
                        expect(chart).to_have_attribute('data-through', 'pap')
                        expect(page.get_by_role('combobox', name='Focus region', exact=True)).to_have_count(0)
                        check_graph(chart, 3, program['amount_php'])
                        assert 'region=' not in page.url
                        page.get_by_role('combobox', name='Display through', exact=True).select_option('category')
                        expect(chart).to_have_attribute('data-through', 'category')
                        expect(page.get_by_role('combobox', name='Focus PAP', exact=True)).to_have_count(0)
                        check_graph(chart, 2, group['amount_php'])
                        assert 'pap=' not in page.url
                        page.get_by_role('combobox', name='Focus category', exact=True).select_option('')
                        check_graph(chart, 2, data['amount_php'])
                        page.goto(base + f'#experiments?tab={stage}&through=invalid', wait_until='networkidle')
                        expect(chart).to_have_attribute('data-through', 'pap')
                    # A browser rendering failure is recoverable and leaves
                    # both download controls usable for a retry or SVG.
                    page.evaluate('''() => {
                        window.nativeHierarchyContext = HTMLCanvasElement.prototype.getContext;
                        HTMLCanvasElement.prototype.getContext = () => null;
                    }''')
                    chart.get_by_role('button', name='Download section PNG', exact=True).click()
                    expect(chart.get_by_role('alert')).to_contain_text('PNG export is unavailable')
                    expect(chart.get_by_role('button', name='Download section PNG', exact=True)).to_be_enabled()
                    page.evaluate('() => {HTMLCanvasElement.prototype.getContext = window.nativeHierarchyContext;}')
                    check_export(page, chart, 'hgab3', 'pap', payload['hgab3_hierarchy']['amount_php'], screenshots, width, png=False)
                    assert not any('comparison_projects_2027.json' in url for url in requests)
                    page.close()
                    print(f'{width}px: hierarchy depths, filters, totals, complete PNG/SVG exports and export recovery pass')
                browser.close()
        finally:
            server.shutdown()
    assert not errors, errors
    assert not bad, bad
    print(f'Hierarchy drilldown checks passed. Screenshots: {screenshots}')


if __name__ == '__main__':
    main()
