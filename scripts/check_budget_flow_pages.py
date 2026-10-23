#!/usr/bin/env python3
"""Check the compact Budget flow experiment, evidence links and image exports."""
from functools import partial
from http.server import ThreadingHTTPServer
import json
import os
from pathlib import Path
import re
import struct
import tempfile
import threading
import xml.etree.ElementTree as ET
from playwright.sync_api import expect, sync_playwright
from serve_pages import RangeHandler

ROOT = Path(__file__).resolve().parents[1]


class Quiet(RangeHandler):
    def log_message(self, *args):
        pass


def main():
    screenshots = Path('/tmp/budget-flow-ui-verification')
    screenshots.mkdir(exist_ok=True)
    errors, bad = [], []
    with tempfile.TemporaryDirectory() as directory:
        Path(directory, 'budget').symlink_to(ROOT / '_site', target_is_directory=True)
        server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Quiet, directory=directory))
        threading.Thread(target=server.serve_forever, daemon=True).start()
        try:
            with sync_playwright() as p:
                browser = p.chromium.launch(headless=True, executable_path=os.environ.get('CHROME_BIN', '/usr/bin/google-chrome'), args=['--no-sandbox'])
                for width in (390, 1440):
                    context = browser.new_context(viewport={'width': width, 'height': 1000}, accept_downloads=True)
                    page = context.new_page()
                    page.on('pageerror', lambda e: errors.append(str(e)))
                    page.on('response', lambda r: bad.append((r.url, r.status)) if r.status >= 400 else None)
                    requests = []
                    page.on('request', lambda r: requests.append(r.url))
                    base = f'http://127.0.0.1:{server.server_port}/budget/app/'
                    page.goto(base + '#experiments?tab=budget', wait_until='networkidle')
                    expect(page.get_by_role('heading', name='DPWH · five-stage budget flow')).to_be_visible()
                    expect(page.locator('.experiments-tabs a[aria-current="page"]')).to_have_text('Budget flow')
                    expect(page.locator('.experiments-tabs a')).to_have_count(7)
                    # The default overview keeps the top three NEP categories
                    # and combines the other four without dropping any money.
                    expect(page.get_by_label('Category detail', exact=True)).to_have_value('top3')
                    expect(page.locator('.bf-group-row')).to_have_count(4)
                    # The six-class matrix includes held-out scope review.
                    expect(page.locator('.bf-cell')).to_have_count(21)
                    expect(page.locator('.bf-ribbon')).to_have_count(48)
                    expect(page.locator('.bf-stub')).to_have_count(9)
                    expect(page.locator('.bf-reduction-sink')).to_have_count(4)
                    expect(page.locator('.bf-scope-sink')).to_have_count(1)
                    expect(page.locator('.bf-group-row').last).to_have_attribute('data-group', 'others')
                    compact_height = page.locator('.revision-flow-scroll svg').evaluate('svg => svg.viewBox.baseVal.height')
                    assert compact_height < 1600
                    totals = page.locator('.budget-flow-metrics').inner_text()
                    assert not any('comparison_projects_2027.json' in url for url in requests)
                    page.get_by_label('Focus category', exact=True).select_option('others')
                    expect(page.locator('.budget-flow-detail')).to_contain_text('4,553 comparison rows')
                    expect(page.locator('.budget-flow-detail')).to_contain_text('₱205,686,491,000')
                    expect(page.locator('.budget-flow-detail')).to_contain_text('₱218,442,484,000')
                    expect(page.locator('.budget-flow-others-detail a')).to_have_count(4)
                    assert all('program=others' not in href for href in page.locator('.budget-flow-others-detail a').evaluate_all('els => els.map(el => el.getAttribute("href"))'))
                    page.reload(wait_until='networkidle')
                    expect(page.get_by_label('Focus category', exact=True)).to_have_value('others')
                    cell = page.locator('.bf-cell[data-group="others"][data-category="reduced"]')
                    cell.focus()
                    page.keyboard.press('Enter')
                    expect(page.locator('.budget-flow-detail')).to_contain_text('77 comparison rows')
                    with page.expect_download() as result:
                        page.get_by_role('button', name='Download SVG', exact=True).click()
                    compact_svg = ET.fromstring(Path(result.value.path()).read_text())
                    compact_metadata = json.loads(compact_svg.find('{http://www.w3.org/2000/svg}metadata').text)
                    assert compact_metadata['rollup']['top'] == 3 and compact_metadata['rollup']['rankBy'] == 'before'
                    assert len(compact_metadata['rollup']['members']) == 4
                    assert compact_metadata['selection'] == {'group': 'others', 'revision': 'reduced'}
                    page.locator('.budget-flow-others-detail a').filter(has_text='Asset Preservation Program').click()
                    expect(page.locator('.result-count')).to_contain_text('31 of 17,613 comparison rows', timeout=30000)
                    page.go_back(wait_until='networkidle')
                    expect(page.get_by_label('Focus category', exact=True)).to_have_value('others')
                    page.get_by_role('button', name='Expand Others', exact=True).click()
                    expect(page.get_by_label('Category detail', exact=True)).to_have_value('all')
                    expect(page.get_by_label('Focus category', exact=True)).to_have_value('')
                    expect(page).to_have_url(re.compile('detail=all'))
                    assert page.locator('.budget-flow-metrics').inner_text() == totals
                    assert page.locator('.revision-flow-scroll svg').evaluate('svg => svg.viewBox.baseVal.height') > compact_height / .75
                    page.get_by_role('button', name='Clear selection', exact=True).click()
                    expect(page.locator('.bf-cell')).to_have_count(36)
                    expect(page.locator('.bf-ribbon')).to_have_count(81)
                    expect(page.locator('.bf-stage')).to_have_count(5)
                    expect(page.locator('rect[data-stage="B"]')).to_have_count(7)
                    expect(page.locator('rect[data-stage="D"][data-node="ledger"]')).to_have_count(7)
                    expect(page.locator('.bf-stub')).to_have_count(15)
                    expect(page.locator('.bf-reduction-sink')).to_have_count(7)
                    expect(page.locator('.bf-scope-sink')).to_have_count(1)
                    expect(page.locator('rect[data-stage="D"][data-node="reductions"]')).to_have_count(7)
                    expect(page.locator('.bf-group-row[data-group="fap"] .bf-cell[data-category="increased"]')).to_have_count(0)
                    expect(page.locator('.bf-group-row[data-group="fap"] .bf-cell[data-category="deletion"]')).to_have_count(0)
                    assert page.locator('.revision-flow-scroll svg').evaluate('''svg => {
                      const scale = Number(svg.dataset.scale);
                      const bands = svg.querySelectorAll('.bf-revision-node,.bf-stub-band,[data-node="reductions"],[data-node="scope-review-deficit"],[data-node="ledger"]');
                      return [...bands].every(el => Math.abs(Number(el.getAttribute('height')) - Number(el.dataset.value)*scale) < 1e-6);
                    }''')
                    assert page.locator('.bf-stub-band').evaluate_all("els => els.reduce((sum,el) => sum+Number(el.dataset.value),0)") == 176878814000
                    assert page.locator('[data-node="reductions"]').evaluate_all("els => els.reduce((sum,el) => sum+Number(el.dataset.value),0)") == 87039358000
                    assert page.locator('[data-node="scope-review-deficit"]').evaluate_all("els => els.reduce((sum,el) => sum+Number(el.dataset.value),0)") == 17640000
                    # Top is the default. Switching alignment moves nodes and
                    # bands without changing any amount or proportional height.
                    svg = page.locator('.revision-flow-scroll svg')
                    expect(svg).to_have_attribute('data-alignment', 'top')
                    top_y = float(svg.locator('rect[data-stage="A"]').get_attribute('y'))
                    assert float(svg.locator('rect[data-stage="E"]').get_attribute('y')) == top_y
                    assert float(svg.locator('rect[data-stage="B"]').first.get_attribute('y')) == top_y
                    assert float(svg.locator('rect[data-stage="D"][data-node="ledger"]').first.get_attribute('y')) == top_y
                    assert float(svg.locator('.bf-revision-node').first.get_attribute('y')) == top_y
                    values = svg.locator('.bf-ribbon').evaluate_all('els => els.map(el => el.dataset.value)')
                    scale = svg.get_attribute('data-scale')
                    page.get_by_label('Flow alignment', exact=True).select_option('center')
                    expect(svg).to_have_attribute('data-alignment', 'center')
                    expect(page).to_have_url(re.compile('align=center'))
                    assert float(svg.locator('rect[data-stage="A"]').get_attribute('y')) > top_y
                    assert svg.get_attribute('data-scale') == scale
                    assert svg.locator('.bf-ribbon').evaluate_all('els => els.map(el => el.dataset.value)') == values
                    page.reload(wait_until='networkidle')
                    expect(page.get_by_label('Flow alignment', exact=True)).to_have_value('center')
                    assert not page.evaluate('document.documentElement.scrollWidth > innerWidth')
                    expect(page.locator('.budget-flow-metrics')).to_contain_text('₱572.924B')
                    expect(page.locator('.budget-flow-metrics')).to_contain_text('₱587.076B')
                    expect(page.locator('.budget-flow-caveat')).to_contain_text('not confirmed edits')
                    # FAPs are explicitly grouped; evidence links partition
                    # them from ordinary programs and persist on reload.
                    page.get_by_label('Focus category', exact=True).select_option('fap')
                    expect(page.locator('.budget-flow-detail')).to_contain_text('29 comparison rows')
                    expect(page.locator('.budget-flow-detail')).to_contain_text('₱117,749,011,000')
                    expect(page.locator('.budget-flow-detail')).to_contain_text('₱44,749,011,000')
                    page.locator('.budget-flow-detail a').click()
                    expect(page.locator('.result-count')).to_contain_text('29 of 17,613 comparison rows', timeout=30000)
                    page.goto(base + '#experiments?tab=budget&detail=all', wait_until='networkidle')
                    page.get_by_label('Focus category', exact=True).select_option('Asset Preservation Program')
                    expect(page.locator('.budget-flow-detail')).to_contain_text('1,675 comparison rows')
                    page.locator('.budget-flow-detail a').click()
                    expect(page.locator('.result-count')).to_contain_text('1,675 of 17,613 comparison rows', timeout=30000)
                    expect(page).to_have_url(re.compile('exclude_fap=1'))
                    page.reload(wait_until='networkidle')
                    expect(page.locator('.result-count')).to_contain_text('1,675 of 17,613 comparison rows', timeout=30000)
                    page.get_by_role('button', name='More filters', exact=True).click()
                    expect(page.get_by_label('Exclude foreign-assisted projects', exact=True)).to_be_checked()
                    page.get_by_role('button', name='Clear filters', exact=True).click()
                    expect(page.locator('.result-count')).to_contain_text('17,613 of 17,613 comparison rows')
                    expect(page).not_to_have_url(re.compile('exclude_fap='))
                    page.goto(base + '#experiments?tab=budget&detail=all', wait_until='networkidle')
                    legend = page.get_by_role('group', name='Highlight a revision type')
                    legend.get_by_role('button', name='Increased', exact=True).click()
                    expect(page).to_have_url(re.compile('revision=increased'))
                    expect(page.locator('#budget-detail-heading')).to_have_text('Increased · detail')
                    expect(page.locator('.budget-flow-detail a')).to_have_attribute('href', '#compare?view=projects&flag=amount_increase')
                    expect(page.locator('.budget-flow-detail')).to_contain_text('188 comparison rows')
                    page.reload(wait_until='networkidle')
                    expect(legend.get_by_role('button', name='Increased', exact=True)).to_have_attribute('aria-pressed', 'true')
                    page.get_by_label('Show exact pesos', exact=True).check()
                    expect(page.locator('.budget-flow-metrics')).to_contain_text('₱572,924,074,000')
                    expect(page.locator('.budget-flow-table')).to_contain_text('₱10,329,499,000')
                    # Keyboard selection works on the actual SVG category cells.
                    cell = page.locator('.bf-cell[data-category="reduced"][data-group="Asset Preservation Program"]')
                    cell.focus()
                    page.keyboard.press('Enter')
                    expect(page.locator('#budget-detail-heading')).to_have_text('Asset Preservation Program · Decreased · detail')
                    page.locator('.budget-flow-exports button').first.focus()
                    with page.expect_download() as result:
                        page.get_by_role('button', name='Download SVG', exact=True).click()
                    exported = ET.fromstring(Path(result.value.path()).read_text())
                    metadata = json.loads(exported.find('{http://www.w3.org/2000/svg}metadata').text)
                    assert metadata['selection'] == {'group': 'Asset Preservation Program', 'revision': 'reduced'}
                    assert metadata['grouping']['key'] == 'category'
                    assert metadata['unit'] == 'PHP' and metadata['date']
                    assert metadata['alignment'] == 'top'
                    assert metadata['source']['sha256']
                    assert 'not confirmed edits' in metadata['caveat']
                    assert '₱572,924,074,000' in ''.join(exported.itertext())
                    with page.expect_download() as result:
                        page.get_by_role('button', name='Download PNG', exact=True).click()
                    png = Path(result.value.path()).read_bytes()
                    assert png[:8] == b'\x89PNG\r\n\x1a\n'
                    png_width, png_height = struct.unpack('>II', png[16:24])
                    assert png_width == 2960 and png_height > 1800
                    # Whole-section export reflows a detached copy at report
                    # width and includes scroll-hidden cells, table and notes.
                    page.locator('.revision-flow-scroll').evaluate('el => {el.scrollTop=180; el.scrollLeft=120;}')
                    before_scroll = page.locator('.revision-flow-scroll').evaluate('el => [el.scrollTop,el.scrollLeft]')
                    before_hash = page.evaluate('location.hash')
                    page.evaluate('''() => {
                      const draw = CanvasRenderingContext2D.prototype.drawImage;
                      CanvasRenderingContext2D.prototype.drawImage = function(picture,...args) {
                        const result = draw.call(this,picture,...args);
                        if (picture.src?.startsWith('data:image/svg+xml') && picture.src.includes('foreignObject')) {
                          window.sectionExportSvg = decodeURIComponent(picture.src.slice(picture.src.indexOf(',')+1));
                          const report = document.querySelector('iframe[title="Preparing section image"]').contentDocument;
                          const table = report.querySelector('.budget-flow-table').getBoundingClientRect();
                          const notes = report.querySelector('.budget-flow-provenance').getBoundingClientRect();
                          const fullDiagram = report.querySelector('.revision-flow-scroll');
                          window.sectionExportLayout = {
                            tableBottom: table.bottom, notesTop: notes.top,
                            diagramHeight: fullDiagram.getBoundingClientRect().height,
                            svgHeight: fullDiagram.querySelector('svg').getBoundingClientRect().height,
                          };
                          const small = document.createElement('canvas'); small.width=96; small.height=192;
                          const ctx = small.getContext('2d'); ctx.drawImage(this.canvas,0,0,96,192);
                          const pixels = ctx.getImageData(0,0,96,192).data;
                          window.sectionExportInk = [0,1,2].map(third => {
                            let ink=0;
                            for(let i=third*96*64*4;i<(third+1)*96*64*4;i+=4) {
                              if (pixels[i]<240 || pixels[i+1]<240 || pixels[i+2]<240) ink++;
                            }
                            return ink/(96*64);
                          });
                        }
                        return result;
                      };
                    }''')
                    with page.expect_download(timeout=60000) as result:
                        page.get_by_role('button', name='Download section PNG', exact=True).click()
                    assert result.value.suggested_filename == 'dpwh-2027-budget-flow-section.png'
                    section_png = Path(result.value.path()).read_bytes()
                    assert section_png[:8] == b'\x89PNG\r\n\x1a\n'
                    section_width, section_height = struct.unpack('>II', section_png[16:24])
                    assert section_width == 3072 and section_height > png_height + 1000
                    Path(screenshots / f'budget-flow-section-{width}.png').write_bytes(section_png)
                    assert all(ink > .005 for ink in page.evaluate('window.sectionExportInk')), 'export must contain painted content throughout'
                    report_layout = page.evaluate('window.sectionExportLayout')
                    assert report_layout['notesTop'] >= report_layout['tableBottom'], 'source notes must follow the entire table'
                    assert report_layout['diagramHeight'] >= report_layout['svgHeight'], 'the complete diagram must be expanded'
                    section_svg = ET.fromstring(page.evaluate('window.sectionExportSvg'))
                    snapshot = section_svg.find('{http://www.w3.org/2000/svg}foreignObject')
                    text = ''.join(snapshot.itertext())
                    assert 'DPWH · five-stage budget flow' in text
                    assert 'Revision totals across all categories' in text
                    assert 'Sources, reconciliation and interpretation' in text
                    assert '₱572,924,074,000' in text
                    assert 'Download section PNG' not in text
                    assert len([el for el in snapshot.iter() if el.get('class') == 'bf-group-row']) == 7
                    assert len([el for el in snapshot.iter() if 'bf-revision-node' in el.get('class', '')]) == 36
                    assert all(el.get('open') is not None for el in snapshot.iter() if el.tag.endswith('}details'))
                    assert page.locator('.revision-flow-scroll').evaluate('el => [el.scrollTop,el.scrollLeft]') == before_scroll
                    assert page.evaluate('location.hash') == before_hash
                    assert not page.locator('.budget-flow-provenance').evaluate('el => el.open')
                    expect(page.locator('iframe[title="Preparing section image"]')).to_have_count(0)
                    expect(page.get_by_role('button', name='Download section PNG', exact=True)).to_be_enabled()
                    # Bands, cells and labels stay within the SVG viewBox.
                    assert page.locator('.revision-flow-scroll svg').evaluate('''svg => {
                      const v = svg.viewBox.baseVal;
                      return [...svg.querySelectorAll('path,rect,text')].every(el => {
                        const r = el.getBBox();
                        return r.x >= -1 && r.y >= -1 && r.x+r.width <= v.width+1 && r.y+r.height <= v.height+1;
                      });
                    }''')
                    page.screenshot(path=str(screenshots / f'budget-flow-{width}.png'), full_page=True)
                    legend.get_by_role('button', name='Clear selection', exact=True).click()
                    expect(page).not_to_have_url(re.compile('revision=|group='))
                    page.get_by_label('Show exact pesos', exact=True).uncheck()
                    page.locator('.revision-flow-scroll').evaluate('el => {el.scrollTop=0; el.scrollLeft=0;}')
                    page.screenshot(path=str(screenshots / f'budget-flow-overview-{width}.png'), full_page=True)
                    # A focused full-detail category maps into Others when
                    # collapsing; the compact section export contains four blocks.
                    page.get_by_label('Focus category', exact=True).select_option('Asset Preservation Program')
                    page.get_by_label('Category detail', exact=True).select_option('top3')
                    expect(page.get_by_label('Focus category', exact=True)).to_have_value('others')
                    expect(page.locator('.budget-flow-detail')).to_contain_text('4,553 comparison rows')
                    page.get_by_role('button', name='Clear selection', exact=True).click()
                    with page.expect_download(timeout=60000) as result:
                        page.get_by_role('button', name='Download section PNG', exact=True).click()
                    compact_png = Path(result.value.path()).read_bytes()
                    compact_width, compact_section_height = struct.unpack('>II', compact_png[16:24])
                    assert compact_width == 3072 and compact_section_height < section_height
                    Path(screenshots / f'budget-flow-compact-section-{width}.png').write_bytes(compact_png)
                    compact_export = ET.fromstring(page.evaluate('window.sectionExportSvg'))
                    assert len([el for el in compact_export.iter() if el.get('class') == 'bf-group-row']) == 4
                    assert 'Others contains:' in ''.join(compact_export.itertext())
                    assert 'Top 3 by NEP' in ''.join(compact_export.itertext())
                    page.screenshot(path=str(screenshots / f'budget-flow-compact-{width}.png'), full_page=True)
                    # Existing links to a hidden category preserve that category's scope.
                    page.evaluate('hash => {location.hash = hash;}', '#experiments?tab=budget&group=Asset%20Preservation%20Program')
                    expect(page.get_by_label('Category detail', exact=True)).to_have_value('all')
                    expect(page.locator('.budget-flow-detail')).to_contain_text('1,675 comparison rows')
                    # Bar chart comparison: one NEP/HGAB bar pair per detail group,
                    # segmented by revision class with side-specific amounts.
                    page.goto(base + '#experiments?tab=bars', wait_until='networkidle')
                    expect(page.get_by_role('heading', name='DPWH · NEP and HGAB bar comparison')).to_be_visible()
                    expect(page.locator('.experiments-tabs a')).to_have_count(7)
                    expect(page.locator('.experiments-tabs a[aria-current="page"]')).to_have_text('Bar chart comparison')
                    # The worked example: DPWH, Region detail by default.
                    expect(page.get_by_label('Dataset source', exact=True)).to_have_value('dpwh')
                    expect(page.get_by_label('Detail level', exact=True)).to_have_value('region')
                    bar_rows = page.locator('.bar-comparison-row')
                    expect(bar_rows).to_have_count(18)
                    # NCR sorted first by NEP; its exact class amounts appear in the table.
                    assert bar_rows.first.get_attribute('data-id') == 'NCR'
                    table = page.locator('.budget-flow-table')
                    expect(table).to_contain_text('34,489,249,000')
                    expect(table).to_contain_text('13,752,034,000')
                    expect(table).to_contain_text('118,400,203,000')
                    # Side totals ride on the rendered bars (NCR NEP = 159,059,713,000).
                    assert page.locator('.bar-comparison-side').first.get_attribute('data-total') == '159059713000'
                    # One shared scale: the longest bar fills the track exactly and
                    # every segment width is value × scale; side sums rebuild both
                    # ledgers; paired amounts ride on every segment.
                    svg = page.locator('.bar-comparison-scroll svg')
                    metadata = json.loads(svg.locator('metadata').text_content())
                    max_total = max(max(b['nep'], b['hgab']) for b in metadata['bars'])
                    # Gutter (288) + value margin (168) match layoutBarChart defaults.
                    track = svg.evaluate('svg => svg.viewBox.baseVal.width') - 288 - 168
                    scale = track / max_total
                    rendered = page.locator('.bar-comparison-bar').evaluate_all(
                        'els => els.map(el => ({side: el.dataset.side, cls: el.dataset.class, v: Number(el.dataset.value), w: Number(el.querySelector("rect").getAttribute("width")), x: Number(el.querySelector("rect").getAttribute("x")), nep: Number(el.dataset.nep), hgab: Number(el.dataset.hgab)}))')
                    from collections import defaultdict
                    sides = defaultdict(int)
                    for seg in rendered:
                        assert abs(seg['w'] - seg['v'] * scale) < 1e-6, 'segment width must be value × scale'
                        sides[seg['side']] += seg['v']
                        assert seg['nep'] >= 0 and seg['hgab'] >= 0
                    assert sides['nep'] == metadata['totals']['nep']
                    assert sides['hgab'] == metadata['totals']['hgab']
                    # One-sided classes appear on exactly one side.
                    nep_classes = {seg['cls'] for seg in rendered if seg['side'] == 'nep'}
                    hgab_classes = {seg['cls'] for seg in rendered if seg['side'] == 'hgab'}
                    assert 'deletion' in nep_classes and 'deletion' not in hgab_classes
                    assert 'insertion' in hgab_classes and 'insertion' not in nep_classes
                    # Unchanged aligns across bars by construction; later classes
                    # carry side-specific amounts, so their start x legitimately
                    # drifts once Increased/Decreased widths differ per side.
                    prefix = svg.evaluate('''svg => [...svg.querySelectorAll('.bar-comparison-row')].map(row => {
                      const get = side => {
                        const seg = row.querySelector(`.bar-comparison-bar[data-side="${side}"][data-class="unchanged"]`);
                        return seg ? [Number(seg.querySelector('rect').getAttribute('x')), Number(seg.dataset.value)] : null;
                      };
                      return [get('nep'), get('hgab')];
                    })''')
                    for nep_side, hgab_side in prefix:
                        if nep_side and hgab_side:
                            assert nep_side[0] == hgab_side[0], 'unchanged segments must start at the track on both bars'
                            assert nep_side[1] == hgab_side[1], 'unchanged amounts are identical on both bars'
                    # Hover tooltip names the paired amounts.
                    assert 'paired' in page.locator('.bar-comparison-bar').first.evaluate('el => el.querySelector("title").textContent')
                    # Every catalog dataset × detail level renders and conserved totals hold.
                    # Reset top first: a leftover ?top=5 from the compact-view block would
                    # no-op on datasets with fewer groups and change the drawn row count.
                    page.goto(base + '#experiments?tab=bars&dataset=dpwh&detail=region', wait_until='networkidle')
                    sources = json.loads((ROOT / 'analysis/data/budget_flow_sources_2027.json').read_text())['sources']
                    for source in sources:
                        page.get_by_label('Dataset source', exact=True).select_option(source['dataset']['key'])
                        expect(page.get_by_role('heading', name=f"{source['dataset']['label']} · NEP and HGAB bar comparison")).to_be_visible()
                        expected_detail = 'region' if source['dataset']['key'] == 'dpwh' else source['dataset']['defaultGrouping']
                        expect(page.get_by_label('Detail level', exact=True)).to_have_value(expected_detail)
                        for grouping in source['groupings']:
                            page.get_by_label('Detail level', exact=True).select_option(grouping)
                            assert page.locator('.bar-comparison-row').count() == len(source['groupings'][grouping]['groups'])
                            metadata = json.loads(svg.locator('metadata').text_content())
                            assert metadata['dataset']['key'] == source['dataset']['key'] and metadata['grouping']['key'] == grouping
                            assert metadata['totals']['nep'] == source['stages']['nep']['amount_php']
                            assert metadata['totals']['hgab'] == source['stages']['third']['amount_php']
                            assert not page.evaluate('document.documentElement.scrollWidth > innerWidth')
                            assert svg.evaluate('''svg => {
                              const v = svg.viewBox.baseVal;
                              return [...svg.querySelectorAll('rect,text')].every(el => {
                                const r = el.getBBox(); return r.x >= -1 && r.y >= -1 && r.x + r.width <= v.width + 1 && r.y + r.height <= v.height + 1;
                              });
                            }'''), f'{source["dataset"]["key"]}/{grouping} bar SVG clipping'
                    # Sorting covers NEP, HGAB, net change and label; invalid values
                    # recover to the default.
                    page.get_by_label('Sort', exact=True).select_option('hgab')
                    first_hgab = page.locator('.bar-comparison-row').first.get_attribute('data-id')
                    page.get_by_label('Sort', exact=True).select_option('delta')
                    page.get_by_label('Sort', exact=True).select_option('label')
                    page.reload(wait_until='networkidle')
                    expect(page.get_by_label('Sort', exact=True)).to_have_value('label')
                    # An unknown sort value in a shared link recovers to the default.
                    page.goto(base + '#experiments?tab=bars&sort=bogus', wait_until='networkidle')
                    expect(page.get_by_label('Sort', exact=True)).to_have_value('nep')
                    # Hide Central Office: offered only where such a group exists
                    # (DPWH DEO grain today). Hiding re-fits the scale but keeps the
                    # group in the exact table, struck through, inside the Total.
                    page.goto(base + '#experiments?tab=bars&dataset=dpwh&detail=region', wait_until='networkidle')
                    expect(page.get_by_role('checkbox', name='Hide Central Office')).to_be_disabled()
                    page.goto(base + '#experiments?tab=bars&dataset=dpwh&detail=deo', wait_until='networkidle')
                    expect(page.locator('.bar-comparison-row').first).to_have_attribute('data-id', 'Central Office')
                    checkbox = page.get_by_role('checkbox', name='Hide Central Office')
                    # click + explicit wait rather than .check(): the checkbox is
                    # React-controlled from the URL hash, so on a slow runner
                    # Playwright's post-click state verification can race the
                    # hashchange re-render (same pattern as check_overview_pages).
                    checkbox.click()
                    expect(page).to_have_url(re.compile(r'hide=central_office'))
                    expect(checkbox).to_be_checked()
                    assert 'hide=central_office' in page.evaluate('location.hash')
                    expect(page.locator('.bar-comparison-row').first).not_to_have_attribute('data-id', 'Central Office')
                    dpwh_source = next(source for source in sources if source['dataset']['key'] == 'dpwh')
                    deo_groups = dpwh_source['groupings']['deo']['groups']
                    expect(page.locator('.bar-comparison-row')).to_have_count(len(deo_groups) - 1)
                    # The hidden office stays in the exact table, including
                    # its current class amounts and held-out scope review.
                    hidden_row = page.locator('.budget-flow-table tbody tr.is-hidden-row')
                    expect(hidden_row).to_have_count(1)
                    central = next(group for group in deo_groups if group['id'] == 'Central Office')
                    for cell in central['classes']:
                        for side in ('nep_php', 'third_php'):
                            if cell[side]:
                                expect(hidden_row).to_contain_text(f"{cell[side]:,}")
                    # The Total row still rebuilds the whole ledger.
                    expect(page.locator('.budget-flow-table tfoot')).to_contain_text('572,924,074,000')
                    # Reload keeps the scope; dataset/detail switches reset it.
                    page.reload(wait_until='networkidle')
                    expect(checkbox).to_be_checked()
                    # Top branches: compact rollup for image exports. Others is
                    # pinned last, keeps its own class cells, and the drawn set
                    # still rebuilds both ledgers exactly.
                    page.goto(base + '#experiments?tab=bars&dataset=dpwh&detail=region&top=5', wait_until='networkidle')
                    expect(page.locator('.bar-comparison-row')).to_have_count(6)
                    assert page.locator('.bar-comparison-row').last.get_attribute('data-id') == '__others__'
                    expect(page.locator('.bar-comparison-row').last).to_contain_text('Others (13')
                    # Drawn segments still rebuild the published ledgers.
                    compact_metadata = json.loads(svg.locator('metadata').text_content())
                    assert compact_metadata['rollup']['top'] == 5 and len(compact_metadata['rollup']['members']) == 13
                    compact_sides = page.locator('.bar-comparison-side').evaluate_all('els => els.map(el => Number(el.dataset.total))')
                    # Kept NEP bars rank largest-first; Others trails them by design.
                    nep_sides = compact_sides[::2]
                    assert nep_sides[:5] == sorted(nep_sides[:5], reverse=True)
                    # Hidden CO + top-N compose; dataset/detail changes reset top.
                    page.goto(base + '#experiments?tab=bars&dataset=dpwh&detail=deo&hide=central_office&top=5', wait_until='networkidle')
                    expect(page.locator('.bar-comparison-row')).to_have_count(6)
                    expect(page.get_by_role('checkbox', name='Hide Central Office')).to_be_checked()
                    page.get_by_label('Dataset source', exact=True).select_option('fmr')
                    assert 'top=' not in page.evaluate('location.hash')
                    expect(page.get_by_label('Top branches', exact=True)).to_have_value('all')
                    # All-choices and unknown values recover to the full chart.
                    page.goto(base + '#experiments?tab=bars&top=all', wait_until='networkidle')
                    expect(page.locator('.bar-comparison-row')).to_have_count(18)
                    page.goto(base + '#experiments?tab=bars&top=99', wait_until='networkidle')
                    expect(page.locator('.bar-comparison-row')).to_have_count(18)
                    page.reload(wait_until='networkidle')
                    expect(page.get_by_label('Top branches', exact=True)).to_have_value('all')
                    # Bar-figure exports: the SVG and PNG must download with real
                    # dimensions. This guards the viewBox parsing that once broke
                    # PNG export (canvas sized 0×0 from min-x/min-y).
                    page.goto(base + '#experiments?tab=bars&dataset=dpwh&detail=region', wait_until='networkidle')
                    with page.expect_download() as result:
                        page.get_by_role('button', name='Download SVG', exact=True).click()
                    bar_svg = ET.fromstring(Path(result.value.path()).read_text())
                    bar_metadata = json.loads(bar_svg.find('.//{http://www.w3.org/2000/svg}metadata').text)
                    assert bar_metadata['dataset']['key'] == 'dpwh' and bar_metadata['grouping']['key'] == 'region'
                    assert bar_metadata['totals']['nep'] > 0 and bar_metadata['rollup'] is None
                    # The export is a self-contained card: header (title, scale
                    # note, full revision legend, sort/scope note) + the chart.
                    bar_text = ''.join(bar_svg.itertext())
                    for fragment in ['NEP beside HGAB, segmented by revision', 'Segment width represents pesos on one shared scale',
                        'Unchanged', 'Increased', 'Decreased', 'Deleted · NEP side only', 'Inserted · HGAB side only', 'Largest NEP first · All 18 regions']:
                        assert fragment in bar_text, fragment
                    assert '₱' in bar_text
                    with page.expect_download() as result:
                        page.get_by_role('button', name='Download PNG', exact=True).click()
                    bar_png = Path(result.value.path()).read_bytes()
                    assert bar_png[:8] == b'\x89PNG\r\n\x1a\n'
                    bar_png_width, bar_png_height = struct.unpack('>II', bar_png[16:24])
                    assert bar_png_width == 2360 and bar_png_height > 1500, 'PNG must carry the full viewBox size'
                    page.screenshot(path=str(screenshots / f'bar-comparison-{width}.png'), full_page=True)
                    # Other established experiment routes still load.
                    page.goto(base + '#experiments?tab=budget', wait_until='domcontentloaded')
                    expect(page.locator('.experiments-tabs a')).to_have_count(7)
                    page.get_by_role('link', name='3-stage alluvial', exact=True).click()
                    expect(page.locator('#experiments-flow-heading')).to_be_visible()
                    page.get_by_role('link', name='Allocation flows', exact=True).click()
                    expect(page.locator('.flow-sankey')).to_have_count(4)
                    context.close()
                browser.close()
        finally:
            server.shutdown()
    assert not errors, errors
    assert not bad, bad
    print(f'Budget flow checks passed at 390px and 1440px; SVG/PNG and geometry verified. Screenshots: {screenshots}')


if __name__ == '__main__':
    main()
